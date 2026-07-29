import type { Prisma, PrismaClient } from "@/generated/prisma/client";

type DbClient = PrismaClient | Prisma.TransactionClient;

export function findOwnedArchive(db: DbClient, officeId: string, id: string) {
  return db.documentArchive.findFirst({ where: { id, officeId } });
}
