import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createAuditLog } from "../../src/lib/audit";
import { updateClientForActor } from "../../src/lib/clientService";
import { createTenantFixtures } from "./fixtures";
import { expectDatabaseRejection, inRollbackTransaction, prisma } from "./testDatabase";

test("createAuditLog snapshots an active same-office actor role and safe metadata only", async () => {
  await inRollbackTransaction(async (tx) => {
    const fixture = await createTenantFixtures(tx);
    const sentinels = {
      name: "PII-NAME-SENTINEL",
      nik: "9876543210987654",
      address: "PII-ADDRESS-SENTINEL",
      financial: "FINANCIAL-999999999",
    };
    await updateClientForActor(tx, fixture.actorA, fixture.clientA.id, {
      name: sentinels.name,
      nik: sentinels.nik,
      address: sentinels.address,
      notes: sentinels.financial,
    });
    const audit = await tx.auditLog.findFirstOrThrow({
      where: { targetId: fixture.clientA.id, action: "CLIENT_UPDATE" },
    });
    assert.equal(audit.actorRole, "NOTARIS");
    assert.deepEqual(audit.metadata, {
      clientType: "PERORANGAN",
      changedFields: ["address", "name", "nik", "notes"],
    });
    const serialized = JSON.stringify(audit.metadata);
    for (const sentinel of Object.values(sentinels)) assert.equal(serialized.includes(sentinel), false);
  });
});

test("createAuditLog rejects cross-office and inactive actors without inserting audit rows", async () => {
  await inRollbackTransaction(async (tx) => {
    const fixture = await createTenantFixtures(tx);
    const before = await tx.auditLog.count({ where: { officeId: fixture.officeA.id } });
    await assert.rejects(
      createAuditLog(tx, {
        officeId: fixture.officeA.id, actorId: fixture.actorB.id, action: "CLIENT_CREATE",
        targetType: "CLIENT", metadata: {},
      }),
      /Aktor audit tidak aktif atau bukan anggota kantor/,
    );
    await assert.rejects(
      createAuditLog(tx, {
        officeId: fixture.officeA.id, actorId: fixture.inactiveA.id, action: "CLIENT_CREATE",
        targetType: "CLIENT", metadata: {},
      }),
      /Aktor audit tidak aktif atau bukan anggota kantor/,
    );
    assert.equal(await tx.auditLog.count({ where: { officeId: fixture.officeA.id } }), before);
  });
});

test("database trigger rejects role mismatch and cross-office actor", async () => {
  await inRollbackTransaction(async (tx) => {
    const fixture = await createTenantFixtures(tx);
    const insert = (actorId: string, actorRole: string) => tx.$executeRaw`
      INSERT INTO "AuditLog" ("id", "officeId", "actorId", "actorRole", "action", "targetType", "metadata")
      VALUES (${randomUUID()}, ${fixture.officeA.id}, ${actorId}, ${actorRole}, 'CLIENT_CREATE'::"AuditAction", 'CLIENT'::"AuditTargetType", '{}'::jsonb)
    `;
    await expectDatabaseRejection(tx, "bad_role", () => insert(fixture.actorA.id, "STAF"), /mismatched role|another office/i);
    await expectDatabaseRejection(tx, "bad_office", () => insert(fixture.actorB.id, "STAF"), /mismatched role|another office/i);
  });
});

test("database permits null actor with SYSTEM and rejects null actor with another role", async () => {
  await inRollbackTransaction(async (tx) => {
    const fixture = await createTenantFixtures(tx);
    const id = randomUUID();
    await tx.$executeRaw`
      INSERT INTO "AuditLog" ("id", "officeId", "actorId", "actorRole", "action", "targetType", "metadata")
      VALUES (${id}, ${fixture.officeA.id}, NULL, 'SYSTEM', 'CLIENT_CREATE'::"AuditAction", 'CLIENT'::"AuditTargetType", '{}'::jsonb)
    `;
    assert.equal((await tx.auditLog.findUniqueOrThrow({ where: { id } })).actorRole, "SYSTEM");
    await expectDatabaseRejection(tx, "bad_system_role", () => tx.$executeRaw`
      INSERT INTO "AuditLog" ("id", "officeId", "actorId", "actorRole", "action", "targetType", "metadata")
      VALUES (${randomUUID()}, ${fixture.officeA.id}, NULL, 'NOTARIS', 'CLIENT_CREATE'::"AuditAction", 'CLIENT'::"AuditTargetType", '{}'::jsonb)
    `, /SYSTEM role/i);
  });
});

test("audit history rejects UPDATE and DELETE", async () => {
  await inRollbackTransaction(async (tx) => {
    const fixture = await createTenantFixtures(tx);
    const audit = await createAuditLog(tx, {
      officeId: fixture.officeA.id, actorId: fixture.actorA.id, action: "CLIENT_CREATE",
      targetType: "CLIENT", targetId: fixture.clientA.id, metadata: {},
    });
    await expectDatabaseRejection(tx, "audit_update", () => tx.auditLog.update({
      where: { id: audit.id }, data: { metadata: { changed: true } },
    }), /append-only/i);
    await expectDatabaseRejection(tx, "audit_delete", () => tx.auditLog.delete({ where: { id: audit.id } }), /append-only/i);
  });
});

test("a Client write is rolled back to its savepoint when audit creation fails", async () => {
  await inRollbackTransaction(async (tx) => {
    const fixture = await createTenantFixtures(tx);
    const clientId = randomUUID();
    await tx.$executeRawUnsafe("SAVEPOINT client_and_audit");
    try {
      await tx.client.create({ data: { id: clientId, officeId: fixture.officeA.id, name: "Must Roll Back" } });
      await assert.rejects(tx.$executeRaw`
        INSERT INTO "AuditLog" ("id", "officeId", "actorId", "actorRole", "action", "targetType", "targetId", "metadata")
        VALUES (${randomUUID()}, ${fixture.officeA.id}, ${fixture.actorB.id}, 'STAF', 'CLIENT_CREATE'::"AuditAction", 'CLIENT'::"AuditTargetType", ${clientId}, '{}'::jsonb)
      `, /another office|mismatched role/i);
    } finally {
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT client_and_audit");
      await tx.$executeRawUnsafe("RELEASE SAVEPOINT client_and_audit");
    }
    assert.equal(await tx.client.count({ where: { id: clientId } }), 0);
  });
});

test("a successful Client and audit are visible together before the test transaction rolls back", async () => {
  let clientId = "";
  let auditId = "";
  await inRollbackTransaction(async (tx) => {
    const fixture = await createTenantFixtures(tx);
    const client = await tx.client.create({ data: { officeId: fixture.officeA.id, name: "Atomic Client" } });
    const audit = await createAuditLog(tx, {
      officeId: fixture.officeA.id, actorId: fixture.actorA.id, action: "CLIENT_CREATE",
      targetType: "CLIENT", targetId: client.id, metadata: { clientType: client.type },
    });
    clientId = client.id;
    auditId = audit.id;
    assert.equal(await tx.client.count({ where: { id: client.id } }), 1);
    assert.equal(await tx.auditLog.count({ where: { targetId: client.id, action: "CLIENT_CREATE" } }), 1);
  });
  assert.equal(await prisma.client.count({ where: { id: clientId } }), 0);
  assert.equal(await prisma.auditLog.count({ where: { id: auditId } }), 0);
});
