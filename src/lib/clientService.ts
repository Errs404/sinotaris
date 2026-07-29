import type { Prisma } from "@/generated/prisma/client";
import { createAuditLog } from "@/lib/audit";

type DbClient = Prisma.TransactionClient;

export interface ClientActor {
  id: string;
  officeId: string;
}

export type ClientUpdateData = Pick<Prisma.ClientUpdateInput,
  | "type"
  | "name"
  | "nik"
  | "nomorKk"
  | "npwp"
  | "tempatLahir"
  | "tanggalLahir"
  | "gender"
  | "pekerjaan"
  | "statusKawin"
  | "wargaNegara"
  | "address"
  | "phone"
  | "email"
  | "notes"
>;

function persistedValuesEqual(previous: unknown, next: unknown): boolean {
  if (previous == null || next == null) return previous == null && next == null;
  if (previous instanceof Date || next instanceof Date) {
    return previous instanceof Date && next instanceof Date && previous.getTime() === next.getTime();
  }
  return previous === next;
}

export async function updateClientForActor(db: DbClient, actor: ClientActor, id: string, data: ClientUpdateData) {
  const existing = await db.client.findFirst({
    where: { id, officeId: actor.officeId },
    select: {
      id: true, type: true, name: true, nik: true, nomorKk: true, npwp: true, tempatLahir: true,
      tanggalLahir: true, gender: true, pekerjaan: true, statusKawin: true, wargaNegara: true,
      address: true, phone: true, email: true, notes: true,
    },
  });
  if (!existing) throw new Error("Klien tidak ditemukan.");

  const changedFields = Object.keys(data)
    .filter((field) => !persistedValuesEqual(
      existing[field as keyof typeof existing],
      data[field as keyof typeof data],
    ))
    .sort();
  const client = await db.client.update({
    where: { id: existing.id },
    data,
    select: { id: true, type: true },
  });
  await createAuditLog(db, {
    officeId: actor.officeId,
    actorId: actor.id,
    action: "CLIENT_UPDATE",
    targetType: "CLIENT",
    targetId: client.id,
    metadata: { clientType: client.type, changedFields },
  });
  return client;
}

export async function deleteClientForActor(db: DbClient, actor: ClientActor, id: string) {
  const existing = await db.client.findFirst({
    where: { id, officeId: actor.officeId },
    select: { id: true },
  });
  if (!existing) throw new Error("Klien tidak ditemukan.");

  const archives = await db.documentArchive.updateMany({
    where: { clientId: existing.id, officeId: actor.officeId },
    data: { clientId: null, status: "PERLU_REVIEW" },
  });
  await db.client.delete({ where: { id: existing.id } });
  await createAuditLog(db, {
    officeId: actor.officeId,
    actorId: actor.id,
    action: "CLIENT_DELETE",
    targetType: "CLIENT",
    targetId: existing.id,
    metadata: { unlinkedArchiveCount: archives.count },
  });
}
