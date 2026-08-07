import type { Prisma } from "@/generated/prisma/client";
import type { PekerjaanPriority, PekerjaanStatus, UserRole } from "@/generated/prisma/enums";
import { createAuditLog } from "@/lib/audit";

type DbClient = Prisma.TransactionClient;

export interface PekerjaanPartyInput {
  clientId: string;
  peran: string;
}

export interface PekerjaanActor {
  id: string;
  officeId: string;
  role: UserRole | string;
}

export interface PekerjaanWorkflowInput {
  picId?: string | null;
  dueDate?: Date | null;
  priority?: PekerjaanPriority;
  internalNotes?: string | null;
}

export type PekerjaanDomainInput = Pick<Prisma.PekerjaanUncheckedCreateInput,
  | "kind"
  | "jenis"
  | "judul"
  | "nomorAkta"
  | "tanggalAkta"
  | "keterangan"
  | "bentukHukum"
  | "pihakAlih"
  | "pihakTerima"
  | "luasTanah"
  | "luasBangunan"
  | "hargaTransaksi"
  | "nop"
  | "bphtb"
  | "pphFinal"
  | "honorarium"
>;

export type PekerjaanCreateInput = PekerjaanDomainInput & PekerjaanWorkflowInput;
export type PekerjaanUpdateInput = Partial<PekerjaanDomainInput> & PekerjaanWorkflowInput;

const WORKFLOW_FIELDS = ["picId", "dueDate", "priority", "internalNotes"] as const;
const UPDATE_FIELDS = [
  "kind", "jenis", "judul", "nomorAkta", "tanggalAkta", "keterangan", "bentukHukum",
  "pihakAlih", "pihakTerima", "luasTanah", "luasBangunan", "hargaTransaksi", "nop",
  "bphtb", "pphFinal", "honorarium", ...WORKFLOW_FIELDS,
] as const;
const PRIORITIES: PekerjaanPriority[] = ["RENDAH", "NORMAL", "TINGGI"];

function persistedValuesEqual(previous: unknown, next: unknown): boolean {
  if (previous == null || next == null) return previous == null && next == null;
  if (previous instanceof Date || next instanceof Date) {
    return previous instanceof Date && next instanceof Date && previous.getTime() === next.getTime();
  }
  if (typeof previous === "object" || typeof next === "object") return String(previous) === String(next);
  return previous === next;
}

function sameParties(previous: PekerjaanPartyInput[], next: PekerjaanPartyInput[]): boolean {
  const keys = (parties: PekerjaanPartyInput[]) => parties
    .map(({ clientId, peran }) => `${clientId}\u0000${peran}`)
    .sort();
  const previousKeys = keys(previous);
  const nextKeys = keys(next);
  return previousKeys.length === nextKeys.length
    && previousKeys.every((key, index) => key === nextKeys[index]);
}

function validateWorkflowInput(data: PekerjaanWorkflowInput) {
  if (data.priority !== undefined && !PRIORITIES.includes(data.priority)) {
    throw new Error("Prioritas pekerjaan tidak valid.");
  }
  if (data.dueDate !== undefined && data.dueDate !== null
    && (!(data.dueDate instanceof Date) || Number.isNaN(data.dueDate.getTime()))) {
    throw new Error("Tanggal jatuh tempo tidak valid.");
  }
  if (data.dueDate
    && (data.dueDate.getUTCHours() !== 0 || data.dueDate.getUTCMinutes() !== 0
      || data.dueDate.getUTCSeconds() !== 0 || data.dueDate.getUTCMilliseconds() !== 0)) {
    throw new Error("Tanggal jatuh tempo harus berupa tanggal saja tanpa waktu.");
  }
  if (data.internalNotes !== undefined && data.internalNotes !== null && data.internalNotes.length > 5000) {
    throw new Error("Catatan internal maksimal 5000 karakter.");
  }
}

async function validatePekerjaanPic(db: DbClient, officeId: string, picId: string | null | undefined) {
  if (!picId) return;
  const pic = await db.user.findFirst({
    where: { id: picId, officeId, isActive: true },
    select: { id: true },
  });
  if (!pic) throw new Error("PIC harus pengguna aktif dari kantor yang sama.");
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
  data: PekerjaanCreateInput,
  parties: PekerjaanPartyInput[],
) {
  const createData = Object.fromEntries(
    Object.entries(data).filter(([field]) => (UPDATE_FIELDS as readonly string[]).includes(field)),
  ) as PekerjaanCreateInput;
  validateWorkflowInput(createData);
  const picId = createData.picId ?? actor.id;
  await validatePekerjaanPic(db, actor.officeId, picId);
  await validatePekerjaanParties(db, actor.officeId, parties);
  const pekerjaan = await db.pekerjaan.create({
    data: {
      ...createData,
      officeId: actor.officeId,
      status: "MASUK",
      completedAt: null,
      picId,
    },
    select: { id: true, kind: true, status: true, priority: true, picId: true, dueDate: true },
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
    metadata: {
      kind: pekerjaan.kind,
      status: pekerjaan.status,
      priority: pekerjaan.priority,
      picId: pekerjaan.picId,
      dueDate: pekerjaan.dueDate?.toISOString() ?? null,
      partyCount: parties.length,
    },
  });
  return pekerjaan;
}

export async function updatePekerjaanForActor(
  db: DbClient,
  actor: PekerjaanActor,
  id: string,
  expectedUpdatedAt: Date,
  data: PekerjaanUpdateInput,
  parties: PekerjaanPartyInput[],
) {
  const updateData = Object.fromEntries(
    Object.entries(data).filter(([field]) => (UPDATE_FIELDS as readonly string[]).includes(field)),
  ) as PekerjaanUpdateInput;
  validateWorkflowInput(updateData);
  const existing = await db.pekerjaan.findFirst({
    where: { id, officeId: actor.officeId },
    select: {
      id: true, kind: true, jenis: true, judul: true, nomorAkta: true, tanggalAkta: true,
      status: true, keterangan: true, bentukHukum: true, pihakAlih: true, pihakTerima: true,
      luasTanah: true, luasBangunan: true, hargaTransaksi: true, nop: true, bphtb: true,
      pphFinal: true, honorarium: true, picId: true, dueDate: true, priority: true,
      internalNotes: true, completedAt: true, updatedAt: true,
      clients: { select: { clientId: true, peran: true } },
    },
  });
  if (!existing) throw new Error("Pekerjaan tidak ditemukan.");
  if (existing.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
    throw new Error("Pekerjaan sudah diubah oleh pengguna lain. Muat ulang halaman lalu coba lagi.");
  }

  if (updateData.picId !== undefined) {
    if (!updateData.picId?.trim()) throw new Error("PIC wajib dipilih untuk memperbarui pekerjaan.");
    await validatePekerjaanPic(db, actor.officeId, updateData.picId);
  }
  const partiesChanged = !sameParties(existing.clients, parties);
  if (partiesChanged) await validatePekerjaanParties(db, actor.officeId, parties);

  const scalarChangedFields = Object.keys(updateData).filter((field) => !persistedValuesEqual(
    existing[field as keyof typeof existing],
    updateData[field as keyof typeof updateData],
  ));
  const changedFields = [...scalarChangedFields];
  if (partiesChanged) changedFields.push("clients");
  if (changedFields.length === 0) return existing;

  const updateResult = await db.pekerjaan.updateMany({
    where: { id: existing.id, officeId: actor.officeId, updatedAt: expectedUpdatedAt },
    data: scalarChangedFields.length ? updateData : { updatedAt: new Date() },
  });
  if (updateResult.count !== 1) {
    throw new Error("Pekerjaan sudah diubah oleh pengguna lain. Muat ulang halaman lalu coba lagi.");
  }
  if (partiesChanged) {
    await db.pekerjaanClient.deleteMany({ where: { pekerjaanId: existing.id } });
    if (parties.length) {
      await db.pekerjaanClient.createMany({
        data: parties.map((party) => ({ pekerjaanId: existing.id, clientId: party.clientId, peran: party.peran })),
      });
    }
  }

  const pekerjaan = await db.pekerjaan.findUniqueOrThrow({
    where: { id: existing.id },
    select: { id: true, kind: true, status: true, priority: true, picId: true, dueDate: true },
  });
  const workflowChangedFields = changedFields.filter((field) => (WORKFLOW_FIELDS as readonly string[]).includes(field));
  const domainChangedFields = changedFields.filter((field) => !(WORKFLOW_FIELDS as readonly string[]).includes(field));

  if (domainChangedFields.length) {
    await createAuditLog(db, {
      officeId: actor.officeId,
      actorId: actor.id,
      action: "PEKERJAAN_UPDATE",
      targetType: "PEKERJAAN",
      targetId: pekerjaan.id,
      metadata: {
        kind: pekerjaan.kind,
        status: pekerjaan.status,
        changedFields: domainChangedFields.sort(),
        partyCount: parties.length,
      },
    });
  }
  if (workflowChangedFields.length) {
    await createAuditLog(db, {
      officeId: actor.officeId,
      actorId: actor.id,
      action: "PEKERJAAN_WORKFLOW_UPDATE",
      targetType: "PEKERJAAN",
      targetId: pekerjaan.id,
      metadata: {
        changedFields: workflowChangedFields.sort(),
        priority: pekerjaan.priority,
        picId: pekerjaan.picId,
        dueDate: pekerjaan.dueDate?.toISOString() ?? null,
      },
    });
  }
  return pekerjaan;
}

const ALLOWED_TRANSITIONS: Record<PekerjaanStatus, PekerjaanStatus[]> = {
  MASUK: ["PROSES", "DIBATALKAN"],
  PROSES: ["MASUK", "TANDA_TANGAN", "DIBATALKAN"],
  TANDA_TANGAN: ["PROSES", "SELESAI", "DIBATALKAN"],
  SELESAI: ["PROSES", "DIBATALKAN"],
  DIBATALKAN: [],
};

export async function transitionPekerjaanForActor(
  db: DbClient,
  actor: PekerjaanActor,
  id: string,
  expectedUpdatedAt: Date,
  nextStatus: PekerjaanStatus,
) {
  const existing = await db.pekerjaan.findFirst({
    where: { id, officeId: actor.officeId },
    select: { id: true, status: true, updatedAt: true },
  });
  if (!existing) throw new Error("Pekerjaan tidak ditemukan.");
  if (existing.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
    throw new Error("Pekerjaan sudah diubah oleh pengguna lain. Muat ulang halaman lalu coba lagi.");
  }
  if (!ALLOWED_TRANSITIONS[existing.status].includes(nextStatus)) {
    if (existing.status === "DIBATALKAN") throw new Error("Pekerjaan yang dibatalkan tidak dapat diubah statusnya.");
    throw new Error(`Perubahan status dari ${existing.status} ke ${nextStatus} tidak diperbolehkan.`);
  }
  if (existing.status === "SELESAI" && actor.role !== "NOTARIS") {
    throw new Error("Hanya Notaris yang dapat membuka kembali atau membatalkan pekerjaan selesai.");
  }
  if (nextStatus === "DIBATALKAN" && actor.role !== "NOTARIS"
    && existing.status !== "MASUK" && existing.status !== "PROSES") {
    throw new Error("Staf hanya dapat membatalkan pekerjaan berstatus MASUK atau PROSES.");
  }

  const completedAt = nextStatus === "SELESAI" ? new Date() : null;
  const result = await db.pekerjaan.updateMany({
    where: { id: existing.id, officeId: actor.officeId, updatedAt: expectedUpdatedAt },
    data: { status: nextStatus, completedAt },
  });
  if (result.count !== 1) {
    throw new Error("Pekerjaan sudah diubah oleh pengguna lain. Muat ulang halaman lalu coba lagi.");
  }
  await createAuditLog(db, {
    officeId: actor.officeId,
    actorId: actor.id,
    action: "PEKERJAAN_STATUS_CHANGE",
    targetType: "PEKERJAAN",
    targetId: existing.id,
    metadata: {
      previousStatus: existing.status,
      newStatus: nextStatus,
      completedAtSet: completedAt !== null,
    },
  });
  return db.pekerjaan.findUniqueOrThrow({
    where: { id: existing.id },
    select: { id: true, status: true, completedAt: true, updatedAt: true },
  });
}

export async function deletePekerjaanForActor(
  db: DbClient,
  actor: PekerjaanActor,
  id: string,
  expectedUpdatedAt: Date,
) {
  if (actor.role !== "NOTARIS") throw new Error("Hanya Notaris yang dapat menghapus pekerjaan.");
  const existing = await db.pekerjaan.findFirst({
    where: { id, officeId: actor.officeId },
    select: { id: true, updatedAt: true },
  });
  if (!existing) throw new Error("Pekerjaan tidak ditemukan.");
  if (existing.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
    throw new Error("Pekerjaan sudah diubah oleh pengguna lain. Muat ulang halaman lalu coba lagi.");
  }
  const documents = await db.generatedDoc.updateMany({
    where: { pekerjaanId: existing.id },
    data: { pekerjaanId: null },
  });
  const invoices = await db.invoice.updateMany({
    where: { pekerjaanId: existing.id, officeId: actor.officeId },
    data: { pekerjaanId: null },
  });
  const deleted = await db.pekerjaan.deleteMany({
    where: { id: existing.id, officeId: actor.officeId, updatedAt: expectedUpdatedAt },
  });
  if (deleted.count !== 1) {
    throw new Error("Pekerjaan sudah diubah oleh pengguna lain. Muat ulang halaman lalu coba lagi.");
  }
  await createAuditLog(db, {
    officeId: actor.officeId,
    actorId: actor.id,
    action: "PEKERJAAN_DELETE",
    targetType: "PEKERJAAN",
    targetId: existing.id,
    metadata: { unlinkedGeneratedDocCount: documents.count, unlinkedInvoiceCount: invoices.count },
  });
}
