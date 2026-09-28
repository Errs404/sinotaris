import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

type InstallationDb = PrismaClient | Prisma.TransactionClient;

export async function getOrCreateInstallation(db: InstallationDb = prisma) {
  return db.systemInstallation.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton", installationId: randomUUID() },
    select: { installationId: true, createdAt: true },
  });
}

export async function buildLicenseRequest(officeId: string, db: InstallationDb = prisma) {
  const [installation, latest] = await Promise.all([
    getOrCreateInstallation(db),
    db.offlineLicense.findFirst({
      where: { officeId },
      orderBy: { sequence: "desc" },
      select: { sequence: true },
    }),
  ]);
  return {
    version: 1 as const,
    officeId,
    installationId: installation.installationId,
    requestedSequence: (latest?.sequence ?? 0) + 1,
  };
}
