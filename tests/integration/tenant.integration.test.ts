import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { findOwnedArchive } from "../../src/lib/archiveAccess";
import { deleteClientForActor, updateClientForActor } from "../../src/lib/clientService";
import {
  createPekerjaanForActor,
  deletePekerjaanForActor,
  transitionPekerjaanForActor,
  updatePekerjaanForActor,
} from "../../src/lib/pekerjaanService";
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
        kind: "NOTARIS", jenis: "Test Akta", judul: "Cross-tenant party",
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
      kind: "PPAT", jenis: "Akta Jual Beli", judul: "Integration Test",
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
    assert.deepEqual(audits[0].metadata, {
      kind: "PPAT",
      status: "MASUK",
      priority: "NORMAL",
      picId: fixture.actorA.id,
      dueDate: null,
      partyCount: 2,
    });
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
          kind: "NOTARIS", jenis: "Akta Test", judul: "Must Roll Back", picId: fixture.actorA.id,
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
        kind: "NOTARIS", jenis: "Akta Test", judul: "Duplicate Role",
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

test("create pekerjaan forces MASUK, defaults active actor as PIC, and rejects invalid PIC", async () => {
  await inRollbackTransaction(async (tx) => {
    const fixture = await createTenantFixtures(tx);
    const pekerjaan = await createPekerjaanForActor(tx, fixture.actorA, {
      kind: "NOTARIS", jenis: "Akta Test", judul: "Workflow defaults",
    }, []);
    const created = await tx.pekerjaan.findUniqueOrThrow({ where: { id: pekerjaan.id } });
    assert.equal(created.status, "MASUK");
    assert.equal(created.picId, fixture.actorA.id);
    assert.equal(created.priority, "NORMAL");
    assert.equal(created.completedAt, null);

    await assert.rejects(createPekerjaanForActor(tx, fixture.actorA, {
      kind: "NOTARIS", jenis: "Akta Test", judul: "Cross-office PIC", picId: fixture.actorB.id,
    }, []), /PIC harus pengguna aktif dari kantor yang sama/);
    await assert.rejects(createPekerjaanForActor(tx, fixture.actorA, {
      kind: "NOTARIS", jenis: "Akta Test", judul: "Inactive PIC", picId: fixture.inactiveA.id,
    }, []), /PIC harus pengguna aktif dari kantor yang sama/);

    const before = await tx.pekerjaan.findUniqueOrThrow({ where: { id: pekerjaan.id } });
    await updatePekerjaanForActor(tx, fixture.actorA, pekerjaan.id, before.updatedAt, {
      status: "SELESAI", completedAt: new Date(),
    } as never, []);
    const unchangedWorkflow = await tx.pekerjaan.findUniqueOrThrow({ where: { id: pekerjaan.id } });
    assert.equal(unchangedWorkflow.status, "MASUK");
    assert.equal(unchangedWorkflow.completedAt, null);
    const auditCountBeforeNullPic = await tx.auditLog.count({ where: { targetId: pekerjaan.id } });
    await assert.rejects(updatePekerjaanForActor(
      tx, fixture.actorA, pekerjaan.id, unchangedWorkflow.updatedAt, { picId: null }, [],
    ), /PIC wajib/);
    const afterNullPic = await tx.pekerjaan.findUniqueOrThrow({ where: { id: pekerjaan.id } });
    assert.equal(afterNullPic.picId, fixture.actorA.id);
    assert.equal(afterNullPic.updatedAt.getTime(), unchangedWorkflow.updatedAt.getTime());
    assert.equal(await tx.auditLog.count({ where: { targetId: pekerjaan.id } }), auditCountBeforeNullPic);
    await assert.rejects(updatePekerjaanForActor(
      tx, fixture.actorA, pekerjaan.id, afterNullPic.updatedAt, { picId: fixture.actorB.id }, [],
    ), /PIC harus pengguna aktif dari kantor yang sama/);
    await assert.rejects(updatePekerjaanForActor(
      tx, fixture.actorA, pekerjaan.id, unchangedWorkflow.updatedAt, { picId: fixture.inactiveA.id }, [],
    ), /PIC harus pengguna aktif dari kantor yang sama/);
    assert.equal(await tx.auditLog.count({
      where: { targetId: pekerjaan.id, action: "PEKERJAAN_WORKFLOW_UPDATE" },
    }), 0);
  });
});

test("cross-office pekerjaan update and transition leave state and audits unchanged", async () => {
  await inRollbackTransaction(async (tx) => {
    const fixture = await createTenantFixtures(tx);
    const pekerjaanB = await createPekerjaanForActor(tx, fixture.actorB, {
      kind: "NOTARIS", jenis: "Akta Kantor B", judul: "Milik kantor B",
    }, [{ clientId: fixture.clientB.id, peran: "Pihak" }]);
    const before = await tx.pekerjaan.findUniqueOrThrow({ where: { id: pekerjaanB.id } });
    const partiesBefore = await tx.pekerjaanClient.findMany({
      where: { pekerjaanId: pekerjaanB.id }, select: { clientId: true, peran: true }, orderBy: { id: "asc" },
    });
    const auditCount = await tx.auditLog.count({ where: { targetId: pekerjaanB.id } });

    await assert.rejects(updatePekerjaanForActor(
      tx, fixture.actorA, pekerjaanB.id, before.updatedAt, { judul: "Percobaan lintas kantor" }, [],
    ), /Pekerjaan tidak ditemukan/);
    await assert.rejects(transitionPekerjaanForActor(
      tx, fixture.actorA, pekerjaanB.id, before.updatedAt, "PROSES",
    ), /Pekerjaan tidak ditemukan/);

    const after = await tx.pekerjaan.findUniqueOrThrow({ where: { id: pekerjaanB.id } });
    assert.equal(after.judul, before.judul);
    assert.equal(after.status, before.status);
    assert.equal(after.updatedAt.getTime(), before.updatedAt.getTime());
    assert.deepEqual(await tx.pekerjaanClient.findMany({
      where: { pekerjaanId: pekerjaanB.id }, select: { clientId: true, peran: true }, orderBy: { id: "asc" },
    }), partiesBefore);
    assert.equal(await tx.auditLog.count({ where: { targetId: pekerjaanB.id } }), auditCount);
  });
});

test("stale general update with party replacement changes no scalar, party, or audit", async () => {
  await inRollbackTransaction(async (tx) => {
    const fixture = await createTenantFixtures(tx);
    const secondClient = await tx.client.create({
      data: { officeId: fixture.officeA.id, name: "Replacement Client" },
    });
    const originalParties = [{ clientId: fixture.clientA.id, peran: "Pihak" }];
    const pekerjaan = await createPekerjaanForActor(tx, fixture.actorA, {
      kind: "NOTARIS", jenis: "Akta Test", judul: "Sebelum stale update",
    }, originalParties);
    const stale = await tx.pekerjaan.findUniqueOrThrow({ where: { id: pekerjaan.id } });
    await tx.pekerjaan.update({ where: { id: pekerjaan.id }, data: { keterangan: "Perubahan lebih baru" } });
    const baseline = await tx.pekerjaan.findUniqueOrThrow({ where: { id: pekerjaan.id } });
    const auditCount = await tx.auditLog.count({ where: { targetId: pekerjaan.id } });

    await assert.rejects(updatePekerjaanForActor(
      tx,
      fixture.actorA,
      pekerjaan.id,
      stale.updatedAt,
      { judul: "Tidak boleh tersimpan", priority: "TINGGI" },
      [{ clientId: secondClient.id, peran: "Pengganti" }],
    ), /sudah diubah oleh pengguna lain/);

    const after = await tx.pekerjaan.findUniqueOrThrow({ where: { id: pekerjaan.id } });
    assert.equal(after.judul, baseline.judul);
    assert.equal(after.keterangan, baseline.keterangan);
    assert.equal(after.priority, baseline.priority);
    assert.equal(after.updatedAt.getTime(), baseline.updatedAt.getTime());
    assert.deepEqual(await tx.pekerjaanClient.findMany({
      where: { pekerjaanId: pekerjaan.id }, select: { clientId: true, peran: true },
    }), originalParties);
    assert.equal(await tx.auditLog.count({ where: { targetId: pekerjaan.id } }), auditCount);
  });
});

test("workflow update audits safe metadata, preserves parties, and true no-op creates no audit", async () => {
  await inRollbackTransaction(async (tx) => {
    const fixture = await createTenantFixtures(tx);
    const staffA = await tx.user.create({ data: {
      officeId: fixture.officeA.id, name: "Staff A", email: `staff-${fixture.suffix}@integration.test`,
      passwordHash: "not-used", role: "STAF",
    } });
    const parties = [{ clientId: fixture.clientA.id, peran: "Pihak" }];
    const pekerjaan = await createPekerjaanForActor(tx, fixture.actorA, {
      kind: "NOTARIS", jenis: "Akta Test", judul: "Workflow update",
    }, parties);
    const before = await tx.pekerjaan.findUniqueOrThrow({ where: { id: pekerjaan.id } });
    const noteSentinel = "SECRET-INTERNAL-NOTE";
    await assert.rejects(updatePekerjaanForActor(tx, fixture.actorA, pekerjaan.id, before.updatedAt, {
      priority: "DARURAT" as "TINGGI",
    }, parties), /Prioritas pekerjaan tidak valid/);
    await assert.rejects(updatePekerjaanForActor(tx, fixture.actorA, pekerjaan.id, before.updatedAt, {
      internalNotes: "x".repeat(5001),
    }, parties), /maksimal 5000 karakter/);
    await assert.rejects(updatePekerjaanForActor(tx, fixture.actorA, pekerjaan.id, before.updatedAt, {
      dueDate: new Date("2026-08-20T12:00:00.000Z"),
    }, parties), /tanggal saja tanpa waktu/);
    await updatePekerjaanForActor(tx, fixture.actorA, pekerjaan.id, before.updatedAt, {
      picId: staffA.id,
      dueDate: new Date("2026-08-20T00:00:00.000Z"),
      priority: "TINGGI",
      internalNotes: noteSentinel,
    }, parties);

    const workflowAudit = await tx.auditLog.findFirstOrThrow({
      where: { targetId: pekerjaan.id, action: "PEKERJAAN_WORKFLOW_UPDATE" },
    });
    assert.deepEqual(workflowAudit.metadata, {
      changedFields: ["dueDate", "internalNotes", "picId", "priority"],
      priority: "TINGGI",
      picId: staffA.id,
      dueDate: "2026-08-20T00:00:00.000Z",
    });
    assert.equal(JSON.stringify(workflowAudit.metadata).includes(noteSentinel), false);
    assert.equal(await tx.auditLog.count({ where: { targetId: pekerjaan.id, action: "PEKERJAAN_UPDATE" } }), 0);
    assert.deepEqual(await tx.pekerjaanClient.findMany({
      where: { pekerjaanId: pekerjaan.id }, select: { clientId: true, peran: true },
    }), parties);

    const after = await tx.pekerjaan.findUniqueOrThrow({ where: { id: pekerjaan.id } });
    const auditCount = await tx.auditLog.count({ where: { targetId: pekerjaan.id } });
    await updatePekerjaanForActor(tx, fixture.actorA, pekerjaan.id, after.updatedAt, {
      picId: after.picId, dueDate: after.dueDate, priority: after.priority, internalNotes: after.internalNotes,
    }, parties);
    assert.equal(await tx.auditLog.count({ where: { targetId: pekerjaan.id } }), auditCount);
  });
});

test("status transitions enforce graph, Staff restrictions, completedAt, Notaris reopen, and stale writes", async () => {
  await inRollbackTransaction(async (tx) => {
    const fixture = await createTenantFixtures(tx);
    const staffA = await tx.user.create({ data: {
      officeId: fixture.officeA.id, name: "Staff A", email: `workflow-staff-${fixture.suffix}@integration.test`,
      passwordHash: "not-used", role: "STAF",
    } });
    const pekerjaan = await createPekerjaanForActor(tx, fixture.actorA, {
      kind: "NOTARIS", jenis: "Akta Test", judul: "Transitions",
    }, []);
    const initial = await tx.pekerjaan.findUniqueOrThrow({ where: { id: pekerjaan.id } });
    await assert.rejects(
      transitionPekerjaanForActor(tx, fixture.actorA, pekerjaan.id, initial.updatedAt, "SELESAI"),
      /tidak diperbolehkan/,
    );
    assert.equal(await tx.auditLog.count({ where: { targetId: pekerjaan.id, action: "PEKERJAAN_STATUS_CHANGE" } }), 0);

    const proses = await transitionPekerjaanForActor(tx, staffA, pekerjaan.id, initial.updatedAt, "PROSES");
    const tandaTangan = await transitionPekerjaanForActor(tx, staffA, pekerjaan.id, proses.updatedAt, "TANDA_TANGAN");
    await assert.rejects(
      transitionPekerjaanForActor(tx, staffA, pekerjaan.id, tandaTangan.updatedAt, "DIBATALKAN"),
      /Staf hanya dapat membatalkan/,
    );
    const selesai = await transitionPekerjaanForActor(tx, staffA, pekerjaan.id, tandaTangan.updatedAt, "SELESAI");
    assert.ok(selesai.completedAt instanceof Date);
    await assert.rejects(
      transitionPekerjaanForActor(tx, staffA, pekerjaan.id, selesai.updatedAt, "PROSES"),
      /Hanya Notaris/,
    );
    const reopened = await transitionPekerjaanForActor(tx, fixture.actorA, pekerjaan.id, selesai.updatedAt, "PROSES");
    assert.equal(reopened.completedAt, null);
    await assert.rejects(
      transitionPekerjaanForActor(tx, fixture.actorA, pekerjaan.id, selesai.updatedAt, "MASUK"),
      /sudah diubah oleh pengguna lain/,
    );

    const audits = await tx.auditLog.findMany({
      where: { targetId: pekerjaan.id, action: "PEKERJAAN_STATUS_CHANGE" }, orderBy: { createdAt: "asc" },
    });
    assert.equal(audits.length, 4);
    assert.deepEqual(audits.at(-1)?.metadata, {
      previousStatus: "SELESAI", newStatus: "PROSES", completedAtSet: false,
    });
  });
});

test("DIBATALKAN is terminal and failed transition leaves state and audit unchanged", async () => {
  await inRollbackTransaction(async (tx) => {
    const fixture = await createTenantFixtures(tx);
    const pekerjaan = await createPekerjaanForActor(tx, fixture.actorA, {
      kind: "NOTARIS", jenis: "Akta Test", judul: "Terminal cancellation",
    }, []);
    const initial = await tx.pekerjaan.findUniqueOrThrow({ where: { id: pekerjaan.id } });
    const cancelled = await transitionPekerjaanForActor(
      tx, fixture.actorA, pekerjaan.id, initial.updatedAt, "DIBATALKAN",
    );
    const count = await tx.auditLog.count({ where: { targetId: pekerjaan.id, action: "PEKERJAAN_STATUS_CHANGE" } });
    await assert.rejects(
      transitionPekerjaanForActor(tx, fixture.actorA, pekerjaan.id, cancelled.updatedAt, "MASUK"),
      /dibatalkan tidak dapat diubah/,
    );
    assert.equal((await tx.pekerjaan.findUniqueOrThrow({ where: { id: pekerjaan.id } })).status, "DIBATALKAN");
    assert.equal(await tx.auditLog.count({ where: { targetId: pekerjaan.id, action: "PEKERJAAN_STATUS_CHANGE" } }), count);
  });
});

test("only Notaris can delete pekerjaan and stale delete changes nothing", async () => {
  await inRollbackTransaction(async (tx) => {
    const fixture = await createTenantFixtures(tx);
    const pekerjaan = await createPekerjaanForActor(tx, fixture.actorA, {
      kind: "NOTARIS", jenis: "Akta Test", judul: "Delete guarded",
    }, []);
    const current = await tx.pekerjaan.findUniqueOrThrow({ where: { id: pekerjaan.id } });
    const staff = await tx.user.create({
      data: {
        officeId: fixture.officeA.id,
        name: "Staff Delete Test",
        email: `${randomUUID()}@integration.test`,
        passwordHash: "integration-only",
        role: "STAF",
      },
    });
    await assert.rejects(
      deletePekerjaanForActor(tx, { id: staff.id, officeId: fixture.officeA.id, role: staff.role }, pekerjaan.id, current.updatedAt),
      /Hanya Notaris/,
    );
    await tx.pekerjaan.update({ where: { id: pekerjaan.id }, data: { judul: "Changed concurrently" } });
    await assert.rejects(
      deletePekerjaanForActor(tx, fixture.actorA, pekerjaan.id, current.updatedAt),
      /sudah diubah oleh pengguna lain/,
    );
    assert.equal(await tx.pekerjaan.count({ where: { id: pekerjaan.id } }), 1);
    assert.equal(await tx.auditLog.count({ where: { targetId: pekerjaan.id, action: "PEKERJAAN_DELETE" } }), 0);
  });
});

test("Notaris delete pekerjaan is atomic and leaves one safe audit", async () => {
  await inRollbackTransaction(async (tx) => {
    const fixture = await createTenantFixtures(tx);
    const pekerjaan = await createPekerjaanForActor(tx, fixture.actorA, {
      kind: "NOTARIS", jenis: "Akta Test", judul: "Delete success",
    }, []);
    const current = await tx.pekerjaan.findUniqueOrThrow({ where: { id: pekerjaan.id } });
    await deletePekerjaanForActor(tx, fixture.actorA, pekerjaan.id, current.updatedAt);
    assert.equal(await tx.pekerjaan.count({ where: { id: pekerjaan.id } }), 0);
    const audits = await tx.auditLog.findMany({ where: { targetId: pekerjaan.id, action: "PEKERJAAN_DELETE" } });
    assert.equal(audits.length, 1);
    assert.deepEqual(audits[0].metadata, { unlinkedGeneratedDocCount: 0, unlinkedInvoiceCount: 0 });
  });
});
