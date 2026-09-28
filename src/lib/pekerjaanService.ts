import type { Prisma } from "@/generated/prisma/client";
import type { DossierStage, PekerjaanPriority, PekerjaanStatus, UserRole } from "@/generated/prisma/enums";
import { createAuditLog } from "@/lib/audit";
import { instantiateChecklistFromMatchingTemplate } from "@/lib/checklistService";

type DbClient = Prisma.TransactionClient;

export interface PekerjaanPartyInput {
  clientId: string;
  peran: string;
  capacity?: string | null;
}

export interface PekerjaanLandObjectInput {
  label?: string | null;
  hakType?: string | null;
  certificateNumber?: string | null;
  nib?: string | null;
  nop?: string | null;
  address?: string | null;
  luasTanah?: number | null;
  luasBangunan?: number | null;
}

export interface PekerjaanActor {
  id: string;
  officeId: string;
  role: UserRole;
}

export interface PekerjaanWorkflowInput {
  picId?: string | null;
  dueDate?: Date | null;
  priority?: PekerjaanPriority;
  internalNotes?: string | null;
  dossierStage?: DossierStage;
  signingScheduledAt?: Date | null;
  signingLocation?: string | null;
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

const WORKFLOW_FIELDS = ["picId", "dueDate", "priority", "internalNotes", "dossierStage", "signingScheduledAt", "signingLocation"] as const;
const UPDATE_FIELDS = [
  "kind", "jenis", "judul", "nomorAkta", "tanggalAkta", "keterangan", "bentukHukum",
  "pihakAlih", "pihakTerima", "luasTanah", "luasBangunan", "hargaTransaksi", "nop",
  "bphtb", "pphFinal", "honorarium", ...WORKFLOW_FIELDS,
] as const;
const PRIORITIES: PekerjaanPriority[] = ["RENDAH", "NORMAL", "TINGGI"];
const EDITABLE_DOSSIER_STAGES: DossierStage[] = ["PENGUMPULAN_DATA", "PENYUSUNAN_DRAFT", "SIAP_TANDA_TANGAN", "SUDAH_TANDA_TANGAN", "PROSES_INSTANSI"];
const DOSSIER_STAGES: DossierStage[] = [...EDITABLE_DOSSIER_STAGES, "SELESAI", "DIBATALKAN"];

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
    .map(({ clientId, peran, capacity }) => `${clientId}\u0000${peran}\u0000${capacity ?? ""}`)
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
  if (data.signingScheduledAt !== undefined && data.signingScheduledAt !== null
    && (!(data.signingScheduledAt instanceof Date) || Number.isNaN(data.signingScheduledAt.getTime()))) {
    throw new Error("Jadwal tanda tangan tidak valid.");
  }
  if (data.signingLocation !== undefined && data.signingLocation !== null && data.signingLocation.length > 500) {
    throw new Error("Lokasi tanda tangan maksimal 500 karakter.");
  }
  if (data.dossierStage !== undefined && !DOSSIER_STAGES.includes(data.dossierStage)) {
    throw new Error("Tahap dossier tidak valid.");
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
    if (party.peran.length > 100 || (party.capacity?.length ?? 0) > 500) throw new Error("Peran atau kapasitas pihak terlalu panjang.");
    const normalized = party.peran.toLowerCase().replace(/[^a-z0-9]/g, "");
    const singular = singularRoles.find((role) => normalized.includes(role));
    if (!singular) continue;
    if (seen.has(singular)) throw new Error(`Peran "${party.peran}" hanya boleh dipakai oleh satu klien.`);
    seen.add(singular);
  }
}

function normalizeLandObjects(kind: "NOTARIS" | "PPAT", landObjects: PekerjaanLandObjectInput[]) {
  if (kind !== "PPAT" && landObjects.length) throw new Error("Objek tanah hanya dapat ditambahkan pada pekerjaan PPAT.");
  if (landObjects.length > 50) throw new Error("Maksimal 50 objek tanah per pekerjaan.");
  return landObjects.map((item) => {
    const clean = (value: string | null | undefined, max: number) => {
      const normalized = value?.trim() || null;
      if (normalized && normalized.length > max) throw new Error("Data objek tanah melebihi batas karakter.");
      return normalized;
    };
    for (const value of [item.luasTanah, item.luasBangunan]) {
      if (value !== null && value !== undefined && (!Number.isFinite(value) || value < 0 || value > 9_999_999_999.99)) {
        throw new Error("Luas objek tanah tidak valid.");
      }
    }
    return {
      label: clean(item.label, 120), hakType: clean(item.hakType, 100), certificateNumber: clean(item.certificateNumber, 100),
      nib: clean(item.nib, 100), nop: clean(item.nop, 100), address: clean(item.address, 1000),
      luasTanah: item.luasTanah ?? null, luasBangunan: item.luasBangunan ?? null,
    };
  });
}

export async function createPekerjaanForActor(
  db: DbClient,
  actor: PekerjaanActor,
  data: PekerjaanCreateInput,
  parties: PekerjaanPartyInput[],
  landObjects: PekerjaanLandObjectInput[] = [],
) {
  const createData = Object.fromEntries(
    Object.entries(data).filter(([field]) => (UPDATE_FIELDS as readonly string[]).includes(field)),
  ) as PekerjaanCreateInput;
  validateWorkflowInput(createData);
  if (createData.dossierStage && !EDITABLE_DOSSIER_STAGES.includes(createData.dossierStage)) {
    throw new Error("Pekerjaan baru tidak dapat langsung memakai tahap terminal.");
  }
  const picId = createData.picId ?? actor.id;
  await validatePekerjaanPic(db, actor.officeId, picId);
  await validatePekerjaanParties(db, actor.officeId, parties);
  const normalizedLandObjects = normalizeLandObjects(createData.kind, landObjects);
  if (createData.kind === "PPAT" && normalizedLandObjects.length) {
    createData.nop = normalizedLandObjects[0].nop;
    createData.luasTanah = normalizedLandObjects[0].luasTanah;
    createData.luasBangunan = normalizedLandObjects[0].luasBangunan;
  }
  const pekerjaan = await db.pekerjaan.create({
    data: {
      ...createData,
      officeId: actor.officeId,
      status: "MASUK",
      completedAt: null,
      picId,
    },
    select: { id: true, kind: true, jenis: true, status: true, priority: true, picId: true, dueDate: true },
  });
  if (parties.length) {
    await db.pekerjaanClient.createMany({
        data: parties.map((party) => ({ pekerjaanId: pekerjaan.id, clientId: party.clientId, peran: party.peran, capacity: party.capacity?.trim() || null })),
      });
  }
  if (normalizedLandObjects.length) await db.pekerjaanLandObject.createMany({
    data: normalizedLandObjects.map((item, sortOrder) => ({ ...item, officeId: actor.officeId, pekerjaanId: pekerjaan.id, sortOrder })),
  });
  await instantiateChecklistFromMatchingTemplate(db, actor, pekerjaan);
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
      landObjectCount: normalizedLandObjects.length,
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
  landObjects?: PekerjaanLandObjectInput[],
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
       dossierStage: true, signingScheduledAt: true, signingLocation: true,
       clients: { select: { clientId: true, peran: true, capacity: true } },
       landObjects: { orderBy: { sortOrder: "asc" }, select: { label: true, hakType: true, certificateNumber: true, nib: true, nop: true, address: true, luasTanah: true, luasBangunan: true } },
    },
  });
  if (!existing) throw new Error("Pekerjaan tidak ditemukan.");
  if (existing.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
    throw new Error("Pekerjaan sudah diubah oleh pengguna lain. Muat ulang halaman lalu coba lagi.");
  }
  if (updateData.dossierStage === "SELESAI" && existing.status !== "SELESAI"
    || updateData.dossierStage === "DIBATALKAN" && existing.status !== "DIBATALKAN") {
    throw new Error("Tahap selesai atau dibatalkan hanya dapat ditetapkan melalui perubahan status pekerjaan.");
  }
  if (existing.status === "SELESAI" && updateData.dossierStage !== undefined && updateData.dossierStage !== "SELESAI"
    || existing.status === "DIBATALKAN" && updateData.dossierStage !== undefined && updateData.dossierStage !== "DIBATALKAN") {
    throw new Error("Buka kembali pekerjaan melalui perubahan status sebelum mengubah tahap dossier.");
  }

  if (updateData.picId !== undefined) {
    if (!updateData.picId?.trim()) throw new Error("PIC wajib dipilih untuk memperbarui pekerjaan.");
    await validatePekerjaanPic(db, actor.officeId, updateData.picId);
  }
  const partiesChanged = !sameParties(existing.clients, parties);
  if (partiesChanged) await validatePekerjaanParties(db, actor.officeId, parties);
  const normalizedLandObjects = landObjects === undefined ? undefined : normalizeLandObjects(updateData.kind ?? existing.kind, landObjects);
  if (normalizedLandObjects !== undefined) {
    const effectiveKind = updateData.kind ?? existing.kind;
    updateData.nop = effectiveKind === "PPAT" ? normalizedLandObjects[0]?.nop ?? null : null;
    updateData.luasTanah = effectiveKind === "PPAT" ? normalizedLandObjects[0]?.luasTanah ?? null : null;
    updateData.luasBangunan = effectiveKind === "PPAT" ? normalizedLandObjects[0]?.luasBangunan ?? null : null;
  }
  const landObjectsChanged = normalizedLandObjects !== undefined && JSON.stringify(normalizedLandObjects.map((item) => ({ ...item, luasTanah: item.luasTanah == null ? null : String(item.luasTanah), luasBangunan: item.luasBangunan == null ? null : String(item.luasBangunan) })))
    !== JSON.stringify(existing.landObjects.map((item) => ({ ...item, luasTanah: item.luasTanah?.toString() ?? null, luasBangunan: item.luasBangunan?.toString() ?? null })));

  const scalarChangedFields = Object.keys(updateData).filter((field) => !persistedValuesEqual(
    existing[field as keyof typeof existing],
    updateData[field as keyof typeof updateData],
  ));
  const changedFields = [...scalarChangedFields];
  if (partiesChanged) changedFields.push("clients");
  if (landObjectsChanged) changedFields.push("landObjects");
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
         data: parties.map((party) => ({ pekerjaanId: existing.id, clientId: party.clientId, peran: party.peran, capacity: party.capacity?.trim() || null })),
      });
    }
  }
  if (landObjectsChanged && normalizedLandObjects) {
    await db.pekerjaanLandObject.deleteMany({ where: { pekerjaanId: existing.id, officeId: actor.officeId } });
    if (normalizedLandObjects.length) await db.pekerjaanLandObject.createMany({
      data: normalizedLandObjects.map((item, sortOrder) => ({ ...item, officeId: actor.officeId, pekerjaanId: existing.id, sortOrder })),
    });
  }

  const pekerjaan = await db.pekerjaan.findUniqueOrThrow({
    where: { id: existing.id },
     select: { id: true, kind: true, status: true, priority: true, picId: true, dueDate: true, dossierStage: true, signingScheduledAt: true, signingLocation: true },
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
        dossierStage: pekerjaan.dossierStage,
        signingScheduledAt: pekerjaan.signingScheduledAt?.toISOString() ?? null,
        hasSigningLocation: Boolean(pekerjaan.signingLocation),
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
  const dossierStage: DossierStage = nextStatus === "SELESAI" ? "SELESAI"
    : nextStatus === "DIBATALKAN" ? "DIBATALKAN"
    : nextStatus === "TANDA_TANGAN" ? "SIAP_TANDA_TANGAN"
    : nextStatus === "MASUK" ? "PENGUMPULAN_DATA"
    : existing.status === "SELESAI" ? "PENYUSUNAN_DRAFT"
    : "PENYUSUNAN_DRAFT";
  const missingRequiredAtTransition = nextStatus === "TANDA_TANGAN" || nextStatus === "SELESAI"
    ? await db.pekerjaanChecklistItem.count({
      where: {
        pekerjaanId: existing.id,
        officeId: actor.officeId,
        required: true,
        status: { not: "TERVERIFIKASI" },
      },
    })
    : null;
  const result = await db.pekerjaan.updateMany({
    where: { id: existing.id, officeId: actor.officeId, updatedAt: expectedUpdatedAt },
    data: { status: nextStatus, completedAt, dossierStage },
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
      dossierStage,
      ...(missingRequiredAtTransition === null ? {} : { missingRequiredAtTransition }),
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
    select: { id: true, updatedAt: true, _count: { select: { checklistItems: true } } },
  });
  if (!existing) throw new Error("Pekerjaan tidak ditemukan.");
  if (existing.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
    throw new Error("Pekerjaan sudah diubah oleh pengguna lain. Muat ulang halaman lalu coba lagi.");
  }
  if (existing._count.checklistItems > 0) {
    throw new Error("Pekerjaan yang memiliki checklist tidak dapat dihapus permanen. Batalkan pekerjaan agar riwayat checklist tetap tersimpan.");
  }
  const permanentInvoiceCount = await db.invoice.count({
    where: { pekerjaanId: existing.id, officeId: actor.officeId, status: { not: "DRAFT" } },
  });
  if (permanentInvoiceCount > 0) {
    throw new Error("Pekerjaan yang memiliki tagihan terbit atau dibatalkan tidak dapat dihapus permanen. Pertahankan pekerjaan untuk menjaga catatan keuangan.");
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
