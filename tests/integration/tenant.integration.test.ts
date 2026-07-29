import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { findOwnedArchive } from "../../src/lib/archiveAccess";
import { deleteClientForActor, updateClientForActor } from "../../src/lib/clientService";
import { createPekerjaanForActor } from "../../src/lib/pekerjaanService";
import { createTenantFixtures } from "./fixtures";
import { inRollbackTransaction, prisma } from "./testDatabase";

test("Office A cannot update or delete an Office B client and creates no false audit", async () => {
  await inRollbackTransaction(async (tx) => {
    const fixture = await createTenantFixtures(tx);
    await assert.rejects(
      updateClientForActor(tx, fixture.actorA, fixture.clientB.id, { name: "Cross-tenant mutation" }),
      /Klien tidak ditemukan/,
    );
    await assert.rejects(deleteClientForActor(tx, fixture.actorA, fixture.clientB.id), /Klien tidak ditemukan/);
    assert.equal((await tx.client.findUniqueOrThrow({ where: { id: fixture.clientB.id } })).name, "Client B");
    assert.equal(await tx.auditLog.count({ where: { officeId: fixture.officeA.id, targetId: fixture.clientB.id } }), 0);
  });
});

test("Office A cannot create pekerjaan with an Office B party", async () => {
  await inRollbackTransaction(async (tx) => {
    const fixture = await createTenantFixtures(tx);
    const before = await tx.pekerjaan.count({ where: { officeId: fixture.officeA.id } });
    await assert.rejects(
      createPekerjaanForActor(tx, fixture.actorA, {
        kind: "NOTARIS", jenis: "Test Akta", judul: "Cross-tenant party", status: "MASUK",
      }, [{ clientId: fixture.clientB.id, peran: "Pihak" }]),
      /berasal dari kantor lain/,
    );
    assert.equal(await tx.pekerjaan.count({ where: { officeId: fixture.officeA.id } }), before);
    assert.equal(await tx.auditLog.count({ where: { officeId: fixture.officeA.id, action: "PEKERJAAN_CREATE" } }), 0);
  });
});

test("Office A cannot resolve an Office B archive for access", async () => {
  await inRollbackTransaction(async (tx) => {
    const fixture = await createTenantFixtures(tx);
    const archive = await tx.documentArchive.create({
      data: {
        officeId: fixture.officeB.id,
        uploadedById: fixture.actorB.id,
        originalName: "tenant-test.pdf",
        storageKey: `integration/${randomUUID()}`,
        mimeType: "application/pdf",
        sizeBytes: 1,
        checksum: randomUUID().replaceAll("-", ""),
        extractedJson: {},
      },
    });
    assert.equal(await findOwnedArchive(tx, fixture.officeA.id, archive.id), null);
    assert.equal((await findOwnedArchive(tx, fixture.officeB.id, archive.id))?.id, archive.id);
    assert.equal(await tx.auditLog.count({ where: { officeId: fixture.officeA.id, targetId: archive.id } }), 0);
  });
});

test("deleteClientForActor unlinks two owned archives, audits once, and rolls everything back", async () => {
  let clientId = "";
  let archiveIds: string[] = [];
  await inRollbackTransaction(async (tx) => {
    const fixture = await createTenantFixtures(tx);
    clientId = fixture.clientA.id;
    const archives = await Promise.all(["first", "second"].map((label) => tx.documentArchive.create({
      data: {
        officeId: fixture.officeA.id,
        clientId,
        uploadedById: fixture.actorA.id,
        status: "DIKONFIRMASI",
        originalName: `${label}.pdf`,
        storageKey: `integration/${randomUUID()}`,
        mimeType: "application/pdf",
        sizeBytes: 1,
        checksum: randomUUID().replaceAll("-", ""),
        extractedJson: {},
      },
    })));
    archiveIds = archives.map(({ id }) => id);

    await deleteClientForActor(tx, fixture.actorA, clientId);

    assert.equal(await tx.client.count({ where: { id: clientId } }), 0);
    const unlinked = await tx.documentArchive.findMany({
      where: { id: { in: archiveIds } },
      orderBy: { id: "asc" },
      select: { clientId: true, status: true },
    });
    assert.deepEqual(unlinked, [
      { clientId: null, status: "PERLU_REVIEW" },
      { clientId: null, status: "PERLU_REVIEW" },
    ]);
    const audits = await tx.auditLog.findMany({ where: { targetId: clientId, action: "CLIENT_DELETE" } });
    assert.equal(audits.length, 1);
    assert.deepEqual(audits[0].metadata, { unlinkedArchiveCount: 2 });
  });
  assert.equal(await prisma.client.count({ where: { id: clientId } }), 0);
  assert.equal(await prisma.documentArchive.count({ where: { id: { in: archiveIds } } }), 0);
  assert.equal(await prisma.auditLog.count({ where: { targetId: clientId } }), 0);
});

test("createPekerjaanForActor creates exact same-office relations and one safe audit", async () => {
  await inRollbackTransaction(async (tx) => {
    const fixture = await createTenantFixtures(tx);
    const secondClient = await tx.client.create({ data: { officeId: fixture.officeA.id, name: "Second Client A" } });
    const parties = [
      { clientId: fixture.clientA.id, peran: "Penjual" },
      { clientId: secondClient.id, peran: "Pembeli" },
    ];
    const pekerjaan = await createPekerjaanForActor(tx, fixture.actorA, {
      kind: "PPAT", jenis: "Akta Jual Beli", judul: "Integration Test", status: "MASUK",
    }, parties);

    assert.equal(await tx.pekerjaan.count({ where: { id: pekerjaan.id } }), 1);
    const relations = await tx.pekerjaanClient.findMany({
      where: { pekerjaanId: pekerjaan.id },
      orderBy: { peran: "asc" },
      select: { clientId: true, peran: true },
    });
    assert.deepEqual(relations, [parties[1], parties[0]]);
    const audits = await tx.auditLog.findMany({ where: { targetId: pekerjaan.id, action: "PEKERJAAN_CREATE" } });
    assert.equal(audits.length, 1);
    assert.deepEqual(audits[0].metadata, { kind: "PPAT", status: "MASUK", partyCount: 2 });
  });
});

test("createPekerjaanForActor audit failure rolls back pekerjaan and relations to a savepoint", async () => {
  await inRollbackTransaction(async (tx) => {
    const fixture = await createTenantFixtures(tx);
    const pekerjaanBefore = await tx.pekerjaan.count({ where: { officeId: fixture.officeA.id } });
    const relationsBefore = await tx.pekerjaanClient.count();
    const auditsBefore = await tx.auditLog.count({ where: { officeId: fixture.officeA.id } });
    await tx.$executeRawUnsafe("SAVEPOINT pekerjaan_audit_failure");
    try {
      await assert.rejects(
        createPekerjaanForActor(tx, fixture.inactiveA, {
          kind: "NOTARIS", jenis: "Akta Test", judul: "Must Roll Back", status: "MASUK",
        }, [{ clientId: fixture.clientA.id, peran: "Pihak" }]),
        /Aktor audit tidak aktif/,
      );
    } finally {
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT pekerjaan_audit_failure");
      await tx.$executeRawUnsafe("RELEASE SAVEPOINT pekerjaan_audit_failure");
    }
    assert.equal(await tx.pekerjaan.count({ where: { officeId: fixture.officeA.id } }), pekerjaanBefore);
    assert.equal(await tx.pekerjaanClient.count(), relationsBefore);
    assert.equal(await tx.auditLog.count({ where: { officeId: fixture.officeA.id } }), auditsBefore);
  });
});

test("duplicate normalized singular role creates no pekerjaan, relation, or audit", async () => {
  await inRollbackTransaction(async (tx) => {
    const fixture = await createTenantFixtures(tx);
    const secondClient = await tx.client.create({ data: { officeId: fixture.officeA.id, name: "Second Client A" } });
    const pekerjaanBefore = await tx.pekerjaan.count({ where: { officeId: fixture.officeA.id } });
    const relationsBefore = await tx.pekerjaanClient.count();
    await assert.rejects(
      createPekerjaanForActor(tx, fixture.actorA, {
        kind: "NOTARIS", jenis: "Akta Test", judul: "Duplicate Role", status: "MASUK",
      }, [
        { clientId: fixture.clientA.id, peran: "Pemberi Kuasa" },
        { clientId: secondClient.id, peran: "PEMBERI-KUASA" },
      ]),
      /hanya boleh dipakai oleh satu klien/,
    );
    assert.equal(await tx.pekerjaan.count({ where: { officeId: fixture.officeA.id } }), pekerjaanBefore);
    assert.equal(await tx.pekerjaanClient.count(), relationsBefore);
    assert.equal(await tx.auditLog.count({ where: { officeId: fixture.officeA.id, action: "PEKERJAAN_CREATE" } }), 0);
  });
});
