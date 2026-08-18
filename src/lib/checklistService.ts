import { Prisma } from "@/generated/prisma/client";
import type {
  ArchiveDocumentType,
  ChecklistItemStatus,
  PekerjaanKind,
} from "@/generated/prisma/enums";
import { createAuditLog } from "@/lib/audit";
import type { CurrentActor } from "@/lib/currentActor";

type DbClient = Prisma.TransactionClient;

type LockedArchive = {
  id: string;
  clientId: string | null;
  pekerjaanId: string | null;
  uploadedById: string | null;
  type: ArchiveDocumentType;
  status: "PERLU_REVIEW" | "DIKONFIRMASI" | "GAGAL";
  storageKey: string;
  updatedAt: Date;
};

const STALE_CHECKLIST_ITEM = "Item checklist sudah diubah oleh pengguna lain. Muat ulang halaman lalu coba lagi.";

const LIMITS = {
  jenis: 200,
  name: 200,
  key: 100,
  label: 300,
  description: 5_000,
  rejectionReason: 500,
  items: 50,
} as const;

const DOCUMENT_TYPES: ArchiveDocumentType[] = [
  "KTP", "KARTU_KELUARGA", "NPWP", "SERTIPIKAT", "AKTA_PERJANJIAN", "UMUM",
];
const KINDS: PekerjaanKind[] = ["NOTARIS", "PPAT"];

export interface ChecklistTemplateItemInput {
  key?: string;
  label: string;
  description?: string | null;
  required?: boolean;
  expectedType?: ArchiveDocumentType | null;
  sortOrder?: number;
}

export interface ChecklistTemplateInput {
  kind: PekerjaanKind;
  jenis: string;
  name: string;
  isActive?: boolean;
  items: ChecklistTemplateItemInput[];
}

export interface ManualChecklistItemInput {
  key?: string;
  label: string;
  description?: string | null;
  required?: boolean;
  expectedType?: ArchiveDocumentType | null;
  sortOrder?: number;
}

function text(value: unknown, label: string, max: number, required = true): string | null {
  const result = String(value ?? "").trim();
  if (required && !result) throw new Error(`${label} wajib diisi.`);
  if (result.length > max) throw new Error(`${label} maksimal ${max} karakter.`);
  return result || null;
}

export function normalizeChecklistKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, LIMITS.key)
    .replace(/-+$/g, "");
}

export function normalizeJenisKey(value: string): string {
  const key = normalizeChecklistKey(value);
  if (!key) throw new Error("Jenis pekerjaan harus menghasilkan kunci yang valid.");
  return key;
}

function normalizeItemInputs(items: ChecklistTemplateItemInput[]) {
  if (!Array.isArray(items) || items.length > LIMITS.items) {
    throw new Error(`Template maksimal memiliki ${LIMITS.items} item.`);
  }
  const seen = new Set<string>();
  return items.map((item, index) => {
    const label = text(item.label, "Label item", LIMITS.label) as string;
    const key = normalizeChecklistKey(item.key?.trim() || label);
    if (!key) throw new Error(`Kunci item ke-${index + 1} tidak valid.`);
    if (seen.has(key)) throw new Error(`Kunci item checklist duplikat: ${key}.`);
    seen.add(key);
    if (item.expectedType != null && !DOCUMENT_TYPES.includes(item.expectedType)) {
      throw new Error(`Jenis dokumen item ke-${index + 1} tidak valid.`);
    }
    const sortOrder = item.sortOrder ?? index;
    if (!Number.isSafeInteger(sortOrder) || sortOrder < 0 || sortOrder > 1_000_000) {
      throw new Error(`Urutan item ke-${index + 1} tidak valid.`);
    }
    return {
      key,
      label,
      description: text(item.description, "Deskripsi item", LIMITS.description, false),
      required: item.required ?? true,
      expectedType: item.expectedType ?? null,
      sortOrder,
    };
  });
}

function normalizeTemplateInput(data: ChecklistTemplateInput) {
  if (!KINDS.includes(data.kind)) throw new Error("Jenis kelompok pekerjaan tidak valid.");
  const jenis = text(data.jenis, "Jenis pekerjaan", LIMITS.jenis) as string;
  return {
    kind: data.kind,
    jenis,
    jenisKey: normalizeJenisKey(jenis),
    name: text(data.name, "Nama template", LIMITS.name) as string,
    isActive: data.isActive ?? true,
    items: normalizeItemInputs(data.items),
  };
}

async function assertCurrentActor(db: DbClient, actor: CurrentActor) {
  const current = await db.user.findFirst({
    where: { id: actor.id, officeId: actor.officeId, role: actor.role, isActive: true },
    select: { id: true },
  });
  if (!current) throw new Error("Aktor audit tidak aktif atau bukan anggota kantor.");
}

async function assertNotaris(db: DbClient, actor: CurrentActor) {
  await assertCurrentActor(db, actor);
  if (actor.role !== "NOTARIS") throw new Error("Hanya Notaris yang dapat mengelola struktur checklist.");
}

async function lockChecklistItem(db: DbClient, id: string, officeId: string) {
  const locked = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "PekerjaanChecklistItem"
    WHERE "id" = ${id} AND "officeId" = ${officeId}
    FOR UPDATE
  `);
  if (locked.length === 0) return undefined;
  return db.pekerjaanChecklistItem.findFirst({
    where: { id, officeId },
    select: {
      id: true,
      pekerjaanId: true,
      expectedType: true,
      status: true,
      required: true,
      rejectionReason: true,
      updatedAt: true,
      _count: { select: { attachments: true } },
    },
  });
}

async function lockArchive(db: DbClient, id: string, officeId: string): Promise<LockedArchive | undefined> {
  const locked = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "DocumentArchive"
    WHERE "id" = ${id} AND "officeId" = ${officeId}
    FOR UPDATE
  `);
  if (locked.length === 0) return undefined;
  return (await db.documentArchive.findFirst({
    where: { id, officeId },
    select: {
      id: true,
      clientId: true,
      pekerjaanId: true,
      uploadedById: true,
      type: true,
      status: true,
      storageKey: true,
      updatedAt: true,
    },
  })) ?? undefined;
}

export async function lockArchiveForChecklistMutation(db: DbClient, officeId: string, id: string) {
  return lockArchive(db, id, officeId);
}

function templateMetadata(data: ReturnType<typeof normalizeTemplateInput>) {
  const expectedTypes = [...new Set(data.items.map((item) => item.expectedType).filter(Boolean))].sort();
  return {
    kind: data.kind,
    jenisKey: data.jenisKey,
    itemCount: data.items.length,
    requiredCount: data.items.filter((item) => item.required).length,
    expectedTypes,
  };
}

export async function createChecklistTemplate(db: DbClient, actor: CurrentActor, input: ChecklistTemplateInput) {
  await assertNotaris(db, actor);
  const data = normalizeTemplateInput(input);
  const template = await db.checklistTemplate.create({
    data: {
      officeId: actor.officeId,
      kind: data.kind,
      jenis: data.jenis,
      jenisKey: data.jenisKey,
      name: data.name,
      isActive: data.isActive,
      items: { create: data.items },
    },
    select: { id: true, updatedAt: true },
  });
  await createAuditLog(db, {
    officeId: actor.officeId,
    actorId: actor.id,
    action: "CHECKLIST_TEMPLATE_CREATE",
    targetType: "CHECKLIST_TEMPLATE",
    targetId: template.id,
    metadata: templateMetadata(data),
  });
  return template;
}

export async function updateChecklistTemplate(
  db: DbClient,
  actor: CurrentActor,
  id: string,
  expectedUpdatedAt: Date,
  input: ChecklistTemplateInput,
) {
  await assertNotaris(db, actor);
  const data = normalizeTemplateInput(input);
  const existing = await db.checklistTemplate.findFirst({
    where: { id, officeId: actor.officeId },
    select: { kind: true, jenisKey: true, name: true, isActive: true, updatedAt: true, items: { select: { id: true } } },
  });
  if (!existing) throw new Error("Template checklist tidak ditemukan.");
  if (existing.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
    throw new Error("Template sudah diubah oleh pengguna lain. Muat ulang halaman lalu coba lagi.");
  }
  const changedFields = [
    ...(existing.kind !== data.kind ? ["kind"] : []),
    ...(existing.jenisKey !== data.jenisKey ? ["jenis"] : []),
    ...(existing.name !== data.name ? ["name"] : []),
    ...(existing.isActive !== data.isActive ? ["isActive"] : []),
    "items",
  ];
  const claimed = await db.checklistTemplate.updateMany({
    where: { id, officeId: actor.officeId, updatedAt: expectedUpdatedAt },
    data: { kind: data.kind, jenis: data.jenis, jenisKey: data.jenisKey, name: data.name, isActive: data.isActive },
  });
  if (claimed.count !== 1) throw new Error("Template sudah diubah oleh pengguna lain. Muat ulang halaman lalu coba lagi.");
  await db.checklistTemplateItem.deleteMany({ where: { templateId: id } });
  if (data.items.length) await db.checklistTemplateItem.createMany({ data: data.items.map((item) => ({ ...item, templateId: id })) });
  await createAuditLog(db, {
    officeId: actor.officeId,
    actorId: actor.id,
    action: "CHECKLIST_TEMPLATE_UPDATE",
    targetType: "CHECKLIST_TEMPLATE",
    targetId: id,
    metadata: { ...templateMetadata(data), changedFields: changedFields.sort() },
  });
  return db.checklistTemplate.findUniqueOrThrow({ where: { id }, select: { id: true, updatedAt: true } });
}

export async function deleteChecklistTemplate(
  db: DbClient,
  actor: CurrentActor,
  id: string,
  expectedUpdatedAt: Date,
) {
  await assertNotaris(db, actor);
  const existing = await db.checklistTemplate.findFirst({
    where: { id, officeId: actor.officeId },
    select: { id: true, kind: true, jenisKey: true, updatedAt: true, items: { select: { required: true } } },
  });
  if (!existing) throw new Error("Template checklist tidak ditemukan.");
  if (existing.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
    throw new Error("Template sudah diubah oleh pengguna lain. Muat ulang halaman lalu coba lagi.");
  }
  const deleted = await db.checklistTemplate.deleteMany({ where: { id, officeId: actor.officeId, updatedAt: expectedUpdatedAt } });
  if (deleted.count !== 1) throw new Error("Template sudah diubah oleh pengguna lain. Muat ulang halaman lalu coba lagi.");
  await createAuditLog(db, {
    officeId: actor.officeId,
    actorId: actor.id,
    action: "CHECKLIST_TEMPLATE_DELETE",
    targetType: "CHECKLIST_TEMPLATE",
    targetId: id,
    metadata: {
      kind: existing.kind,
      jenisKey: existing.jenisKey,
      itemCount: existing.items.length,
      requiredCount: existing.items.filter((item) => item.required).length,
    },
  });
}

async function addTemplateSnapshots(
  db: DbClient,
  actor: CurrentActor,
  pekerjaan: { id: string; kind: PekerjaanKind; jenis: string },
) {
  const template = await db.checklistTemplate.findFirst({
    where: { officeId: actor.officeId, kind: pekerjaan.kind, jenisKey: normalizeJenisKey(pekerjaan.jenis), isActive: true },
    select: { id: true, items: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
  });
  if (!template || template.items.length === 0) return { templateId: null, addedCount: 0, requiredCount: 0 };
  const existingKeys = new Set((await db.pekerjaanChecklistItem.findMany({
    where: { pekerjaanId: pekerjaan.id, key: { in: template.items.map((item) => item.key) } },
    select: { key: true },
  })).map((item) => item.key));
  const missingItems = template.items.filter((item) => !existingKeys.has(item.key));
  if (missingItems.length === 0) return { templateId: template.id, addedCount: 0, requiredCount: 0 };
  const result = await db.pekerjaanChecklistItem.createMany({
    data: missingItems.map((item) => ({
      officeId: actor.officeId,
      pekerjaanId: pekerjaan.id,
      templateItemId: item.id,
      key: item.key,
      label: item.label,
      description: item.description,
      required: item.required,
      expectedType: item.expectedType,
      sortOrder: item.sortOrder,
    })),
    skipDuplicates: true,
  });
  return {
    templateId: template.id,
    addedCount: result.count,
    requiredCount: missingItems.filter((item) => item.required).length,
  };
}

export async function instantiateChecklistFromMatchingTemplate(
  db: DbClient,
  actor: CurrentActor,
  pekerjaan: { id: string; kind: PekerjaanKind; jenis: string },
) {
  await assertCurrentActor(db, actor);
  const result = await addTemplateSnapshots(db, actor, pekerjaan);
  if (result.addedCount > 0) {
    await createAuditLog(db, {
      officeId: actor.officeId,
      actorId: actor.id,
      action: "CHECKLIST_APPLY",
      targetType: "PEKERJAAN",
      targetId: pekerjaan.id,
      metadata: result,
    });
  }
  return result;
}

export async function applyChecklistTemplateForPekerjaan(
  db: DbClient,
  actor: CurrentActor,
  pekerjaanId: string,
  expectedUpdatedAt?: Date,
) {
  await assertCurrentActor(db, actor);
  const pekerjaan = await db.pekerjaan.findFirst({
    where: { id: pekerjaanId, officeId: actor.officeId },
    select: { id: true, kind: true, jenis: true, updatedAt: true },
  });
  if (!pekerjaan) throw new Error("Pekerjaan tidak ditemukan.");
  if (expectedUpdatedAt && pekerjaan.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
    throw new Error("Pekerjaan sudah diubah oleh pengguna lain. Muat ulang halaman lalu coba lagi.");
  }
  const result = await addTemplateSnapshots(db, actor, pekerjaan);
  if (!result.templateId) throw new Error("Tidak ada template checklist aktif yang cocok dengan pekerjaan ini.");
  if (result.addedCount > 0) {
    await createAuditLog(db, {
      officeId: actor.officeId,
      actorId: actor.id,
      action: "CHECKLIST_APPLY",
      targetType: "PEKERJAAN",
      targetId: pekerjaan.id,
      metadata: result,
    });
  }
  return result;
}

export async function addManualChecklistItem(
  db: DbClient,
  actor: CurrentActor,
  pekerjaanId: string,
  input: ManualChecklistItemInput,
) {
  await assertNotaris(db, actor);
  const pekerjaan = await db.pekerjaan.findFirst({ where: { id: pekerjaanId, officeId: actor.officeId }, select: { id: true } });
  if (!pekerjaan) throw new Error("Pekerjaan tidak ditemukan.");
  const normalized = normalizeItemInputs([input])[0];
  const baseKey = normalizeChecklistKey(input.key?.trim() || `manual-${normalized.label}`) || "manual-item";
  const existingKeys = new Set((await db.pekerjaanChecklistItem.findMany({
    where: { pekerjaanId }, select: { key: true },
  })).map((item) => item.key));
  let key = baseKey;
  for (let suffix = 2; existingKeys.has(key); suffix += 1) key = `${baseKey.slice(0, 94)}-${suffix}`;
  const item = await db.pekerjaanChecklistItem.create({
    data: { ...normalized, key, officeId: actor.officeId, pekerjaanId },
    select: { id: true, key: true },
  });
  await createAuditLog(db, {
    officeId: actor.officeId,
    actorId: actor.id,
    action: "CHECKLIST_APPLY",
    targetType: "PEKERJAAN",
    targetId: pekerjaanId,
    metadata: { addedCount: 1, requiredCount: normalized.required ? 1 : 0, manual: true, itemId: item.id },
  });
  return item;
}

export async function attachArchiveToChecklistItem(
  db: DbClient,
  actor: CurrentActor,
  itemId: string,
  archiveId: string,
  expectedUpdatedAt: Date,
) {
  await assertCurrentActor(db, actor);
  const initialItem = await db.pekerjaanChecklistItem.findFirst({
    where: { id: itemId, officeId: actor.officeId },
    select: { pekerjaanId: true },
  });
  if (!initialItem) throw new Error("Item checklist tidak ditemukan.");
  const archive = await lockArchive(db, archiveId, actor.officeId);
  if (!archive) throw new Error("Arsip tidak ditemukan.");
  if (archive.pekerjaanId && archive.pekerjaanId !== initialItem.pekerjaanId) {
    throw new Error("Arsip sudah terhubung ke pekerjaan lain.");
  }
  const item = await lockChecklistItem(db, itemId, actor.officeId);
  if (!item) throw new Error("Item checklist tidak ditemukan.");
  if (item.pekerjaanId !== initialItem.pekerjaanId) throw new Error(STALE_CHECKLIST_ITEM);
  if (item.updatedAt.getTime() !== expectedUpdatedAt.getTime()) throw new Error(STALE_CHECKLIST_ITEM);
  if (archive.pekerjaanId && archive.pekerjaanId !== item.pekerjaanId) {
    throw new Error("Arsip sudah terhubung ke pekerjaan lain.");
  }
  const duplicate = await db.pekerjaanChecklistAttachment.findFirst({
    where: { itemId: item.id, archiveId: archive.id, officeId: actor.officeId },
    select: { id: true },
  });
  if (duplicate) {
    return {
      itemId: item.id,
      pekerjaanId: item.pekerjaanId,
      resultingStatus: item.status,
      attachmentCount: item._count.attachments,
      added: false,
    };
  }
  if (!archive.pekerjaanId) {
    const linked = await db.documentArchive.updateMany({
      where: { id: archive.id, officeId: actor.officeId, pekerjaanId: null, updatedAt: archive.updatedAt },
      data: { pekerjaanId: item.pekerjaanId },
    });
    if (linked.count !== 1) throw new Error("Relasi arsip baru saja diubah oleh proses lain. Silakan ulangi.");
  }
  await db.pekerjaanChecklistAttachment.create({
    data: { officeId: actor.officeId, itemId: item.id, archiveId: archive.id, createdById: actor.id },
  });
  const attachmentCount = item._count.attachments + 1;
  const resultingStatus: ChecklistItemStatus = "TERLAMPIR";
  await db.pekerjaanChecklistItem.update({
    where: { id: item.id },
    data: { status: resultingStatus, rejectionReason: null, verifiedById: null, verifiedAt: null },
  });
  await createAuditLog(db, {
    officeId: actor.officeId,
    actorId: actor.id,
    action: "CHECKLIST_ATTACHMENT_UPDATE",
    targetType: "PEKERJAAN",
    targetId: item.pekerjaanId,
    metadata: {
      itemId: item.id,
      archiveId: archive.id,
      operation: "ATTACH",
      resultingStatus,
      attachmentCount,
      expectedTypeMatches: item.expectedType === null || item.expectedType === archive.type,
    },
  });
  return { itemId: item.id, pekerjaanId: item.pekerjaanId, resultingStatus, attachmentCount, added: true };
}

export async function detachArchiveFromChecklistItem(
  db: DbClient,
  actor: CurrentActor,
  itemId: string,
  archiveId: string,
  expectedUpdatedAt: Date,
) {
  await assertCurrentActor(db, actor);
  const item = await lockChecklistItem(db, itemId, actor.officeId);
  if (!item) throw new Error("Item checklist tidak ditemukan.");
  if (item.updatedAt.getTime() !== expectedUpdatedAt.getTime()) throw new Error(STALE_CHECKLIST_ITEM);
  const deleted = await db.pekerjaanChecklistAttachment.deleteMany({
    where: { itemId: item.id, archiveId, officeId: actor.officeId },
  });
  if (deleted.count === 0) {
    return {
      pekerjaanId: item.pekerjaanId,
      resultingStatus: item.status,
      attachmentCount: item._count.attachments,
      removed: false,
    };
  }
  const attachmentCount = await db.pekerjaanChecklistAttachment.count({ where: { itemId: item.id } });
  const resultingStatus: ChecklistItemStatus = attachmentCount === 0 ? "KOSONG" : "TERLAMPIR";
  await db.pekerjaanChecklistItem.update({
    where: { id: item.id },
    data: { status: resultingStatus, rejectionReason: null, verifiedById: null, verifiedAt: null },
  });
  await createAuditLog(db, {
    officeId: actor.officeId,
    actorId: actor.id,
    action: "CHECKLIST_ATTACHMENT_UPDATE",
    targetType: "PEKERJAAN",
    targetId: item.pekerjaanId,
    metadata: { itemId: item.id, archiveId, operation: "DETACH", resultingStatus, attachmentCount },
  });
  return { pekerjaanId: item.pekerjaanId, resultingStatus, attachmentCount, removed: deleted.count === 1 };
}

export async function setChecklistItemStatus(
  db: DbClient,
  actor: CurrentActor,
  itemId: string,
  status: ChecklistItemStatus,
  expectedUpdatedAt: Date,
  rejectionReason?: string | null,
) {
  await assertCurrentActor(db, actor);
  if (actor.role !== "NOTARIS") throw new Error("Hanya Notaris yang dapat memverifikasi, menolak, atau melewati item checklist.");
  if (!["TERVERIFIKASI", "DITOLAK", "DILEWATI"].includes(status)) {
    throw new Error("Status tersebut hanya dapat berubah melalui lampiran dokumen.");
  }
  const item = await lockChecklistItem(db, itemId, actor.officeId);
  if (!item) throw new Error("Item checklist tidak ditemukan.");
  if (item.updatedAt.getTime() !== expectedUpdatedAt.getTime()) throw new Error(STALE_CHECKLIST_ITEM);
  if ((status === "TERVERIFIKASI" || status === "DITOLAK") && item._count.attachments === 0) {
    throw new Error("Item checklist harus memiliki lampiran sebelum diverifikasi atau ditolak.");
  }
  if (status === "DILEWATI" && (item.required || item._count.attachments > 0)) {
    throw new Error(item.required ? "Item wajib tidak dapat dilewati." : "Item dengan lampiran tidak dapat dilewati.");
  }
  const reason = status === "DITOLAK"
    ? text(rejectionReason, "Alasan penolakan", LIMITS.rejectionReason) as string
    : null;
  if (status === "DITOLAK" && (!reason || reason.length < 3)) throw new Error("Alasan penolakan minimal 3 karakter.");
  if (item.status === status && item.rejectionReason === reason) {
    return { pekerjaanId: item.pekerjaanId, status };
  }
  const verified = status === "TERVERIFIKASI" || status === "DILEWATI";
  await db.pekerjaanChecklistItem.update({
    where: { id: item.id },
    data: {
      status,
      rejectionReason: reason,
      verifiedById: verified ? actor.id : null,
      verifiedAt: verified ? new Date() : null,
    },
  });
  await createAuditLog(db, {
    officeId: actor.officeId,
    actorId: actor.id,
    action: "CHECKLIST_STATUS_CHANGE",
    targetType: "PEKERJAAN",
    targetId: item.pekerjaanId,
    metadata: {
      itemId: item.id,
      previousStatus: item.status,
      newStatus: status,
      attachmentCount: item._count.attachments,
      hasReason: reason !== null,
    },
  });
  return { pekerjaanId: item.pekerjaanId, status };
}

export function calculateChecklistProgress(items: Array<{ required: boolean; status: ChecklistItemStatus }>) {
  const requiredTotal = items.filter((item) => item.required).length;
  const requiredVerified = items.filter((item) => item.required && item.status === "TERVERIFIKASI").length;
  const optionalTotal = items.length - requiredTotal;
  const optionalComplete = items.filter((item) => !item.required && ["TERVERIFIKASI", "DILEWATI"].includes(item.status)).length;
  return {
    requiredTotal,
    requiredVerified,
    optionalTotal,
    optionalComplete,
    complete: requiredVerified === requiredTotal,
  };
}

export async function reconcileChecklistItemsAfterArchiveDelete(
  db: DbClient,
  officeId: string,
  itemIds: string[],
) {
  for (const itemId of [...new Set(itemIds)]) {
    const item = await db.pekerjaanChecklistItem.findFirst({ where: { id: itemId, officeId }, select: { id: true } });
    if (!item) continue;
    const attachmentCount = await db.pekerjaanChecklistAttachment.count({ where: { itemId } });
    await db.pekerjaanChecklistItem.update({
      where: { id: itemId },
      data: {
        status: attachmentCount === 0 ? "KOSONG" : "TERLAMPIR",
        rejectionReason: null,
        verifiedById: null,
        verifiedAt: null,
      },
    });
  }
}

export async function assertArchiveChecklistMoveAllowed(
  db: DbClient,
  officeId: string,
  archive: LockedArchive,
  nextPekerjaanId: string | null,
) {
  const attachments = await db.pekerjaanChecklistAttachment.findMany({
    where: { officeId, archiveId: archive.id },
    select: { item: { select: { pekerjaanId: true } } },
  });
  if (attachments.some((attachment) => attachment.item.pekerjaanId !== nextPekerjaanId)) {
    throw new Error("Arsip masih dipakai oleh checklist pekerjaan. Lepaskan lampiran checklist sebelum memindahkan relasi pekerjaan.");
  }
}
