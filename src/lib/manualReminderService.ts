import type { Prisma } from "@/generated/prisma/client";
import type { ReminderType } from "@/generated/prisma/enums";
import { createAuditLog } from "@/lib/audit";

type DbClient = Prisma.TransactionClient;

export interface ReminderActor {
  id: string;
  officeId: string;
}

const STALE_REMINDER = "Pengingat sudah diubah oleh pengguna lain. Muat ulang halaman lalu coba lagi.";

export async function createManualReminder(
  db: DbClient,
  actor: ReminderActor,
  data: { title: string; dueDate: Date; type: ReminderType },
) {
  const reminder = await db.reminder.create({
    data: { officeId: actor.officeId, ...data },
    select: { id: true, type: true, dueDate: true, done: true, updatedAt: true },
  });
  await createAuditLog(db, {
    officeId: actor.officeId,
    actorId: actor.id,
    action: "REMINDER_CREATE",
    targetType: "REMINDER",
    targetId: reminder.id,
    metadata: { type: reminder.type, dueDate: reminder.dueDate.toISOString() },
  });
  return reminder;
}

export async function toggleManualReminder(
  db: DbClient,
  actor: ReminderActor,
  id: string,
  expectedDone: boolean,
  expectedUpdatedAt: Date,
) {
  const existing = await db.reminder.findFirst({
    where: { id, officeId: actor.officeId },
    select: { id: true, type: true, dueDate: true },
  });
  if (!existing) throw new Error("Pengingat tidak ditemukan.");

  const desiredDone = !expectedDone;
  const updated = await db.reminder.updateMany({
    where: { id, officeId: actor.officeId, done: expectedDone, updatedAt: expectedUpdatedAt },
    data: { done: desiredDone },
  });
  if (updated.count !== 1) throw new Error(STALE_REMINDER);

  await createAuditLog(db, {
    officeId: actor.officeId,
    actorId: actor.id,
    action: "REMINDER_STATUS_CHANGE",
    targetType: "REMINDER",
    targetId: existing.id,
    metadata: {
      previousDone: expectedDone,
      newDone: desiredDone,
      type: existing.type,
      dueDate: existing.dueDate.toISOString(),
    },
  });
}

export async function deleteManualReminder(
  db: DbClient,
  actor: ReminderActor,
  id: string,
  expectedUpdatedAt: Date,
) {
  const existing = await db.reminder.findFirst({
    where: { id, officeId: actor.officeId },
    select: { id: true, type: true, dueDate: true, done: true, updatedAt: true },
  });
  if (!existing) throw new Error("Pengingat tidak ditemukan.");
  if (existing.updatedAt.getTime() !== expectedUpdatedAt.getTime()) throw new Error(STALE_REMINDER);

  const deleted = await db.reminder.deleteMany({
    where: { id, officeId: actor.officeId, updatedAt: expectedUpdatedAt },
  });
  if (deleted.count !== 1) throw new Error(STALE_REMINDER);

  await createAuditLog(db, {
    officeId: actor.officeId,
    actorId: actor.id,
    action: "REMINDER_DELETE",
    targetType: "REMINDER",
    targetId: existing.id,
    metadata: { type: existing.type, dueDate: existing.dueDate.toISOString(), done: existing.done },
  });
}
