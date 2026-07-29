import type { Prisma } from "@/generated/prisma/client";
import { createAuditLog } from "@/lib/audit";

type DbClient = Prisma.TransactionClient;

export interface PekerjaanPartyInput {
  clientId: string;
  peran: string;
}

export interface PekerjaanActor {
  id: string;
  officeId: string;
}

export async function validatePekerjaanParties(
  db: DbClient,
  officeId: string,
  parties: PekerjaanPartyInput[],
) {
  if (parties.length === 0) return;
  const clientIds = [...new Set(parties.map((party) => party.clientId))];
  const count = await db.client.count({ where: { id: { in: clientIds }, officeId } });
  if (count !== clientIds.length) {
    throw new Error("Salah satu klien tidak ditemukan atau berasal dari kantor lain.");
  }

  const singularRoles = [
    "pemberikuasa", "penerimakuasa", "debitor", "debitur", "kreditor", "pasangan",
    "suamiistri", "saksi1", "saksisatu", "saksi2", "saksidua",
  ];
  const seen = new Set<string>();
  for (const party of parties) {
    const normalized = party.peran.toLowerCase().replace(/[^a-z0-9]/g, "");
    const singular = singularRoles.find((role) => normalized.includes(role));
    if (!singular) continue;
    if (seen.has(singular)) throw new Error(`Peran "${party.peran}" hanya boleh dipakai oleh satu klien.`);
    seen.add(singular);
  }
}

export async function createPekerjaanForActor(
  db: DbClient,
  actor: PekerjaanActor,
  data: Omit<Prisma.PekerjaanUncheckedCreateInput, "id" | "officeId" | "createdAt" | "updatedAt">,
  parties: PekerjaanPartyInput[],
) {
  await validatePekerjaanParties(db, actor.officeId, parties);
  const pekerjaan = await db.pekerjaan.create({
    data: { ...data, officeId: actor.officeId },
    select: { id: true, kind: true, status: true },
  });
  if (parties.length) {
    await db.pekerjaanClient.createMany({
      data: parties.map((party) => ({ pekerjaanId: pekerjaan.id, clientId: party.clientId, peran: party.peran })),
    });
  }
  await createAuditLog(db, {
    officeId: actor.officeId,
    actorId: actor.id,
    action: "PEKERJAAN_CREATE",
    targetType: "PEKERJAAN",
    targetId: pekerjaan.id,
    metadata: { kind: pekerjaan.kind, status: pekerjaan.status, partyCount: parties.length },
  });
  return pekerjaan;
}
