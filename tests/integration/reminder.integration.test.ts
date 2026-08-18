import assert from "node:assert/strict";
import { test } from "node:test";
import { createManualReminder, deleteManualReminder, toggleManualReminder } from "../../src/lib/manualReminderService";
import { getDynamicReminders } from "../../src/lib/reminderService";
import { createTenantFixtures } from "./fixtures";
import { inRollbackTransaction } from "./testDatabase";

test("dynamic reminders isolate offices, scope Staff to own jobs, and exclude terminal work", async () => {
  await inRollbackTransaction(async (tx) => {
    const fixture = await createTenantFixtures(tx);
    const staffA = await tx.user.create({ data: {
      officeId: fixture.officeA.id,
      name: "Reminder Staff A",
      email: `reminder-staff-${fixture.suffix}@integration.test`,
      passwordHash: "not-used",
      role: "STAF",
    } });
    const otherStaffA = await tx.user.create({ data: {
      officeId: fixture.officeA.id,
      name: "Other Staff A",
      email: `reminder-other-${fixture.suffix}@integration.test`,
      passwordHash: "not-used",
      role: "STAF",
    } });
    const dueDate = new Date("2026-08-19T00:00:00.000Z");
    const createJob = (officeId: string, picId: string, judul: string, status: "PROSES" | "SELESAI" = "PROSES") =>
      tx.pekerjaan.create({ data: { officeId, picId, judul, jenis: "Akta", kind: "NOTARIS", status, dueDate } });

    const own = await createJob(fixture.officeA.id, staffA.id, "Own active");
    const colleague = await createJob(fixture.officeA.id, otherStaffA.id, "Colleague active");
    await createJob(fixture.officeA.id, staffA.id, "Own terminal", "SELESAI");
    await createJob(fixture.officeB.id, fixture.actorB.id, "Other tenant active");
    await tx.pekerjaanChecklistItem.create({ data: {
      officeId: fixture.officeA.id,
      pekerjaanId: own.id,
      key: "required-secret-label",
      label: "SECRET CHECKLIST LABEL",
      required: true,
      status: "DITOLAK",
      rejectionReason: "SECRET REJECTION REASON",
    } });

    const now = new Date("2026-08-19T12:00:00.000Z");
    const staffAlerts = await getDynamicReminders(tx, {
      id: staffA.id, officeId: fixture.officeA.id, role: "STAF",
    }, now);
    assert.deepEqual(staffAlerts.map((item) => item.pekerjaanId), [own.id]);
    assert.deepEqual(staffAlerts[0].counts, { empty: 0, rejected: 1, attached: 0 });
    assert.equal(JSON.stringify(staffAlerts).includes("SECRET"), false);

    const notarisAlerts = await getDynamicReminders(tx, fixture.actorA, now);
    assert.deepEqual(new Set(notarisAlerts.map((item) => item.pekerjaanId)), new Set([own.id, colleague.id]));
    assert.equal(notarisAlerts.some((item) => item.title === "Other tenant active"), false);
    assert.equal(notarisAlerts.some((item) => item.title === "Own terminal"), false);
  });
});

test("manual reminder create writes only safe audit metadata", async () => {
  await inRollbackTransaction(async (tx) => {
    const fixture = await createTenantFixtures(tx);
    const dueDate = new Date("2026-08-31T00:00:00.000Z");
    const reminder = await createManualReminder(tx, fixture.actorA, {
      title: "PRIVATE REMINDER TITLE",
      dueDate,
      type: "LAPOR_BULANAN",
    });
    const audit = await tx.auditLog.findFirstOrThrow({
      where: { targetId: reminder.id, action: "REMINDER_CREATE" },
    });
    assert.deepEqual(audit.metadata, { type: "LAPOR_BULANAN", dueDate: dueDate.toISOString() });
    assert.equal(JSON.stringify(audit.metadata).includes("PRIVATE REMINDER TITLE"), false);
  });
});

test("manual reminder toggle uses optimistic locking and audits the status change", async () => {
  await inRollbackTransaction(async (tx) => {
    const fixture = await createTenantFixtures(tx);
    const reminder = await tx.reminder.create({
      data: { officeId: fixture.officeA.id, title: "Toggle safely", dueDate: new Date("2026-09-01T00:00:00.000Z"), type: "PAJAK" },
    });
    await toggleManualReminder(tx, fixture.actorA, reminder.id, false, reminder.updatedAt);
    assert.equal((await tx.reminder.findUniqueOrThrow({ where: { id: reminder.id } })).done, true);
    const audit = await tx.auditLog.findFirstOrThrow({
      where: { targetId: reminder.id, action: "REMINDER_STATUS_CHANGE" },
    });
    assert.deepEqual(audit.metadata, {
      previousDone: false,
      newDone: true,
      type: "PAJAK",
      dueDate: "2026-09-01T00:00:00.000Z",
    });
    await assert.rejects(
      toggleManualReminder(tx, fixture.actorA, reminder.id, false, reminder.updatedAt),
      /sudah diubah oleh pengguna lain/,
    );
    assert.equal(await tx.auditLog.count({ where: { targetId: reminder.id, action: "REMINDER_STATUS_CHANGE" } }), 1);
  });
});

test("manual reminder delete checks tenant and version and omits title from audit", async () => {
  await inRollbackTransaction(async (tx) => {
    const fixture = await createTenantFixtures(tx);
    const reminder = await tx.reminder.create({
      data: { officeId: fixture.officeA.id, title: "DELETE TITLE SENTINEL", dueDate: new Date("2026-09-02T00:00:00.000Z"), type: "LAINNYA", done: true },
    });
    await assert.rejects(
      deleteManualReminder(tx, fixture.actorB, reminder.id, reminder.updatedAt),
      /tidak ditemukan/,
    );
    const staleVersion = new Date(reminder.updatedAt.getTime() - 1);
    await assert.rejects(
      deleteManualReminder(tx, fixture.actorA, reminder.id, staleVersion),
      /sudah diubah oleh pengguna lain/,
    );
    await deleteManualReminder(tx, fixture.actorA, reminder.id, reminder.updatedAt);
    assert.equal(await tx.reminder.count({ where: { id: reminder.id } }), 0);
    const audit = await tx.auditLog.findFirstOrThrow({
      where: { targetId: reminder.id, action: "REMINDER_DELETE" },
    });
    assert.deepEqual(audit.metadata, {
      type: "LAINNYA",
      dueDate: "2026-09-02T00:00:00.000Z",
      done: true,
    });
    assert.equal(JSON.stringify(audit.metadata).includes("DELETE TITLE SENTINEL"), false);
  });
});

test("manual reminder mutation rolls back when audit creation fails", async () => {
  await inRollbackTransaction(async (tx) => {
    const fixture = await createTenantFixtures(tx);
    await tx.$executeRawUnsafe("SAVEPOINT reminder_and_audit");
    try {
      await assert.rejects(
        createManualReminder(tx, { id: fixture.actorB.id, officeId: fixture.officeA.id }, {
          title: "Must roll back",
          dueDate: new Date("2026-09-03T00:00:00.000Z"),
          type: "LAINNYA",
        }),
        /Aktor audit tidak aktif atau bukan anggota kantor/,
      );
    } finally {
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT reminder_and_audit");
      await tx.$executeRawUnsafe("RELEASE SAVEPOINT reminder_and_audit");
    }
    assert.equal(await tx.reminder.count({ where: { title: "Must roll back", officeId: fixture.officeA.id } }), 0);
  });
});
