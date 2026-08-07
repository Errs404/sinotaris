import type { UserRole } from "@/generated/prisma/enums";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type CurrentActor = { id: string; officeId: string; role: UserRole };

type ActorDb = PrismaClient | Prisma.TransactionClient;

export async function requireCurrentActor(userId: string, db: ActorDb = prisma): Promise<CurrentActor> {
  const actor = await db.user.findFirst({
    where: { id: userId, isActive: true },
    select: { id: true, officeId: true, role: true },
  });
  if (!actor) throw new Error("Akun tidak aktif atau sudah tidak tersedia. Silakan masuk kembali.");
  return actor;
}
