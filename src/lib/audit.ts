import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { AuditAction, AuditTargetType } from "@/generated/prisma/enums";

type AuditClient = PrismaClient | Prisma.TransactionClient;

export async function createAuditLog(
  client: AuditClient,
  entry: {
    officeId: string;
    actorId: string | null;
    action: AuditAction;
    targetType: AuditTargetType;
    targetId?: string | null;
    metadata: Prisma.InputJsonObject;
  },
) {
  const actor = entry.actorId
    ? await client.user.findFirst({
        where: { id: entry.actorId, officeId: entry.officeId, isActive: true },
        select: { role: true },
      })
    : null;
  if (entry.actorId && !actor) throw new Error("Aktor audit tidak aktif atau bukan anggota kantor.");

  return client.auditLog.create({
    data: {
      officeId: entry.officeId,
      actorId: entry.actorId,
      actorRole: actor?.role ?? "SYSTEM",
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId ?? null,
      metadata: entry.metadata,
    },
    select: { id: true },
  });
}
