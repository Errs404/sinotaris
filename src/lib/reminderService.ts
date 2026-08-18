import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { CurrentActor } from "@/lib/currentActor";
import { indonesiaTodayDateOnly } from "@/lib/pekerjaanUi";
import { prisma } from "@/lib/prisma";
import { buildDynamicReminders } from "@/lib/reminderEngine";

export type ReminderDbClient = PrismaClient | Prisma.TransactionClient;
export function dynamicReminderWhere(actor: CurrentActor, today = indonesiaTodayDateOnly()): Prisma.PekerjaanWhereInput {
  const horizon = new Date(today);
  horizon.setUTCDate(horizon.getUTCDate() + 4);
  return {
    officeId: actor.officeId,
    status: { in: ["MASUK", "PROSES", "TANDA_TANGAN"] },
    ...(actor.role === "STAF" ? { picId: actor.id } : {}),
    OR: [
      { dueDate: { lt: horizon } },
      { checklistItems: { some: { required: true, status: "DITOLAK" } } },
    ],
  };
}

export async function getDynamicReminders(
  db: ReminderDbClient = prisma,
  actor: CurrentActor,
  now = new Date(),
) {
  const today = indonesiaTodayDateOnly(now);
  const candidates = await db.pekerjaan.findMany({
    where: dynamicReminderWhere(actor, today),
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }],
    select: {
      id: true,
      judul: true,
      jenis: true,
      status: true,
      dueDate: true,
      pic: { select: { id: true, name: true } },
      checklistItems: {
        where: { required: true },
        select: { required: true, status: true },
      },
    },
  });
  return buildDynamicReminders(candidates, today);
}
