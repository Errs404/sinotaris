import { Prisma, type NotaryAppointment, type OfficeProfileVersion } from "@/generated/prisma/client";
import type { NotaryAppointmentKind, PekerjaanKind } from "@/generated/prisma/enums";
import { createAuditLog } from "@/lib/audit";
import { requireCurrentNotaris, type CurrentActor } from "@/lib/currentActor";
import { indonesiaTodayDateOnly } from "@/lib/pekerjaanUi";

export type IdentityDb = Prisma.TransactionClient;
export type IdentityEntity = "profile" | "appointment";
export const appointmentKinds: NotaryAppointmentKind[] = ["NOTARIS", "PPAT", "NOTARIS_PENGGANTI"];
const stale = "Versi identitas sudah berubah. Muat ulang dan coba lagi.";

export function parseIdentityDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Tanggal harus YYYY-MM-DD.");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("Tanggal kalender tidak valid.");
  return date;
}

function text(value: unknown, max: number, required = false): string | null {
  if (value != null && typeof value !== "string") throw new Error("Teks identitas tidak valid.");
  const result = typeof value === "string" ? value.trim() : "";
  if ((required && !result) || result.length > max) throw new Error(`Teks identitas wajib sesuai batas ${max} karakter.`);
  return result || null;
}

function dates(input: Record<string, unknown>) {
  const effectiveFrom = parseIdentityDate(input.effectiveFrom);
  const effectiveUntil = parseIdentityDate(input.effectiveUntil);
  if (effectiveFrom && effectiveUntil && effectiveUntil < effectiveFrom) throw new Error("Rentang tanggal tidak valid.");
  return { effectiveFrom, effectiveUntil };
}

export function normalizeProfileInput(input: Record<string, unknown>) {
  const email = text(input.email, 254);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Email tidak valid.");
  // Storage upload/validation is intentionally deferred; callers cannot introduce arbitrary storage keys.
  if (input.logoStorageKey) throw new Error("Unggah logo belum tersedia.");
  return { officeName: text(input.officeName, 250, true)!, address: text(input.address, 2000), phone: text(input.phone, 50), email, ...dates(input) };
}

export function normalizeAppointmentInput(input: Record<string, unknown>) {
  if (!appointmentKinds.includes(input.kind as NotaryAppointmentKind)) throw new Error("Jenis pengangkatan tidak valid.");
  return { kind: input.kind as NotaryAppointmentKind, notaryName: text(input.notaryName, 250, true)!, title: text(input.title, 150),
    workArea: text(input.workArea, 500), decreeNumber: text(input.decreeNumber, 250), decreeDate: parseIdentityDate(input.decreeDate),
    decreeDateText: text(input.decreeDateText, 250), supersedesId: text(input.supersedesId, 200), ...dates(input) };
}

export function appointmentMatchesKind(kind: PekerjaanKind, appointment: NotaryAppointmentKind) {
  return kind === "PPAT" ? appointment === "PPAT" : appointment === "NOTARIS" || appointment === "NOTARIS_PENGGANTI";
}

export function effectiveOn(row: { effectiveFrom: Date | null; effectiveUntil: Date | null }, date: Date) {
  return (!row.effectiveFrom || row.effectiveFrom <= date) && (!row.effectiveUntil || row.effectiveUntil >= date);
}

export function selectEffectiveAppointment<T extends { kind: NotaryAppointmentKind; status: string; effectiveFrom: Date | null; effectiveUntil: Date | null }>(rows: T[], kind: PekerjaanKind, date: Date): T | null {
  const candidates = rows.filter((row) => row.status === "PUBLISHED" && appointmentMatchesKind(kind, row.kind) && effectiveOn(row, date));
  for (const appointmentKind of appointmentKinds) {
    if (candidates.filter((row) => row.kind === appointmentKind).length > 1) throw new Error("Pengangkatan efektif ambigu.");
  }
  return candidates.find((row) => row.kind === "NOTARIS_PENGGANTI") ?? candidates[0] ?? null;
}

export async function resolveEffectiveAppointment(db: IdentityDb, officeId: string, kind: PekerjaanKind, date = indonesiaTodayDateOnly()) {
  return selectEffectiveAppointment(await db.notaryAppointment.findMany({ where: { officeId, status: "PUBLISHED" } }), kind, date);
}

export async function resolveEffectiveProfile(db: IdentityDb, officeId: string, date = indonesiaTodayDateOnly()) {
  const rows = (await db.officeProfileVersion.findMany({ where: { officeId, status: "PUBLISHED" } })).filter((row) => effectiveOn(row, date));
  if (rows.length > 1) throw new Error("Profil kantor efektif ambigu.");
  return rows[0] ?? null;
}

export async function validateJobAppointment(db: IdentityDb, officeId: string, kind: PekerjaanKind, id?: string | null, date = indonesiaTodayDateOnly()) {
  const row = id ? await db.notaryAppointment.findFirst({ where: { id, officeId, status: "PUBLISHED" } }) : await resolveEffectiveAppointment(db, officeId, kind, date);
  if (!row || !appointmentMatchesKind(kind, row.kind) || !effectiveOn(row, date)) throw new Error("Pengangkatan terbit yang berlaku untuk jenis pekerjaan ini wajib tersedia.");
  return row;
}

export interface OfficeIdentitySnapshot {
  profile: { id: string; version: number; officeName: string; address: string | null; phone: string | null; email: string | null };
  appointment: { id: string; version: number; kind: NotaryAppointmentKind; notaryName: string; title: string | null; workArea: string | null; decreeNumber: string | null; decreeDate: string | null; decreeDateText: string | null } | null;
}

export function buildIdentitySnapshot(profile: OfficeProfileVersion, appointment: NotaryAppointment | null): OfficeIdentitySnapshot {
  return { profile: { id: profile.id, version: profile.version, officeName: profile.officeName, address: profile.address, phone: profile.phone, email: profile.email },
    appointment: appointment ? { id: appointment.id, version: appointment.version, kind: appointment.kind, notaryName: appointment.notaryName, title: appointment.title,
      workArea: appointment.workArea, decreeNumber: appointment.decreeNumber, decreeDate: appointment.decreeDate?.toISOString().slice(0, 10) ?? null, decreeDateText: appointment.decreeDateText } : null };
}

export function identityPlaceholders(identity: OfficeIdentitySnapshot): Record<string, string> {
  const { profile: p, appointment: a } = identity;
  return { nama_kantor: p.officeName, alamat_kantor: p.address ?? "", telepon_kantor: p.phone ?? "", email_kantor: p.email ?? "",
    nama_notaris: a?.notaryName ?? "", gelar_notaris: a?.title ?? "", wilayah_notaris: a?.workArea ?? "", alamat_kantor_notaris: p.address ?? "",
    sk_notaris_nomor: a?.decreeNumber ?? "", sk_notaris_tanggal: a?.decreeDate ?? a?.decreeDateText ?? "", ttd_notaris: [a?.notaryName, a?.title].filter(Boolean).join(", ") };
}

/** Call inside the same transaction which persists the generated artifact/snapshot. */
export async function resolveDocumentIdentity(db: IdentityDb, officeId: string, pekerjaanId?: string | null, now = new Date()) {
  if (pekerjaanId) {
    await db.$queryRaw(Prisma.sql`SELECT "id" FROM "Pekerjaan" WHERE "id" = ${pekerjaanId} AND "officeId" = ${officeId} FOR SHARE`);
  }
  const job = pekerjaanId ? await db.pekerjaan.findFirst({ where: { id: pekerjaanId, officeId } }) : null;
  if (pekerjaanId && !job) throw new Error("Pekerjaan tidak ditemukan.");
  const date = job?.tanggalAkta ? parseIdentityDate(job.tanggalAkta.toISOString().slice(0, 10))! : indonesiaTodayDateOnly(now);
  if (job && !job.officeProfileVersionId) throw new Error("Pekerjaan belum memiliki profil kantor.");
  const profile = job
    ? await db.officeProfileVersion.findFirst({ where: { id: job.officeProfileVersionId!, officeId, status: { in: ["PUBLISHED", "RETIRED"] } } })
    : await resolveEffectiveProfile(db, officeId, date);
  if (!profile) throw new Error("Profil kantor terbit yang berlaku belum tersedia.");
  if (job && !job.appointmentId) throw new Error("Pekerjaan belum memiliki pengangkatan. Lengkapi pekerjaan dahulu.");
  const appointment = job
    ? await db.notaryAppointment.findFirst({ where: { id: job.appointmentId!, officeId, status: { in: ["PUBLISHED", "RETIRED"] } } })
    : await validateJobAppointment(db, officeId, "NOTARIS", undefined, date);
  if (!appointment || !appointmentMatchesKind(job?.kind ?? "NOTARIS", appointment.kind) || !effectiveOn(appointment, date)) {
    throw new Error("Pengangkatan pekerjaan tidak berlaku untuk jenis atau tanggal akta.");
  }
  return buildIdentitySnapshot(profile, appointment);
}

async function authorize(db: IdentityDb, actor: CurrentActor) {
  const current = await requireCurrentNotaris(actor.id, db);
  if (current.officeId !== actor.officeId) throw new Error("Kantor aktor berubah.");
}

export async function lockIdentityScope(db: IdentityDb, officeId: string, entity: IdentityEntity, kind = "") {
  const scope = `${entity === "profile" ? "OfficeProfileVersion" : "NotaryAppointment"}:${officeId}:${kind}`;
  await db.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${scope}, 0))::text`);
}

async function audit(db: IdentityDb, actor: CurrentActor, entity: IdentityEntity, operation: "CREATE" | "UPDATE" | "DELETE" | "PUBLISH" | "RETIRE", row: { id: string; version: number; kind?: NotaryAppointmentKind; effectiveFrom?: Date | null; effectiveUntil?: Date | null }, fields: string[] = []) {
  await createAuditLog(db, { officeId: actor.officeId, actorId: actor.id,
    action: entity === "profile" ? `OFFICE_PROFILE_${operation}` : `NOTARY_APPOINTMENT_${operation}`,
    targetType: entity === "profile" ? "OFFICE_PROFILE" : "NOTARY_APPOINTMENT", targetId: row.id,
    metadata: { version: row.version, ...(row.kind ? { kind: row.kind } : {}), hasEffectiveFrom: !!row.effectiveFrom, hasEffectiveUntil: !!row.effectiveUntil, changedFields: fields.sort() } });
}

async function allocateIdentityVersion(db: IdentityDb, officeId: string, entity: IdentityEntity, kind: string, existingMax: number) {
  const key = `IDENTITY:${entity}:${kind}`;
  const rows = await db.$queryRaw<Array<{ lastValue: number }>>(Prisma.sql`
    INSERT INTO "OfficeSequence" ("officeId", "key", "lastValue") VALUES (${officeId}, ${key}, ${existingMax + 1})
    ON CONFLICT ("officeId", "key") DO UPDATE SET "lastValue" = GREATEST("OfficeSequence"."lastValue", ${existingMax}) + 1
    RETURNING "lastValue"
  `);
  return rows[0].lastValue;
}

export async function createIdentityDraft(db: IdentityDb, actor: CurrentActor, entity: IdentityEntity, input: Record<string, unknown>) {
  await authorize(db, actor);
  if (entity === "profile") {
    const data = normalizeProfileInput(input);
    await lockIdentityScope(db, actor.officeId, entity);
    const max = await db.officeProfileVersion.aggregate({ where: { officeId: actor.officeId }, _max: { version: true } });
    const version = await allocateIdentityVersion(db, actor.officeId, entity, "", max._max.version ?? 0);
    const row = await db.officeProfileVersion.create({ data: { ...data, officeId: actor.officeId, version, createdById: actor.id } });
    await audit(db, actor, entity, "CREATE", row);
    return row;
  }
  const data = normalizeAppointmentInput(input);
  await lockIdentityScope(db, actor.officeId, entity, data.kind);
  const max = await db.notaryAppointment.aggregate({ where: { officeId: actor.officeId, kind: data.kind }, _max: { version: true } });
  const version = await allocateIdentityVersion(db, actor.officeId, entity, data.kind, max._max.version ?? 0);
  const row = await db.notaryAppointment.create({ data: { ...data, officeId: actor.officeId, version, createdById: actor.id } });
  await audit(db, actor, entity, "CREATE", row);
  return row;
}

export async function mutateIdentityVersion(db: IdentityDb, actor: CurrentActor, entity: IdentityEntity, id: string, expectedUpdatedAt: Date,
  operation: "update" | "delete" | "publish" | "retire", input: Record<string, unknown> = {}) {
  await authorize(db, actor);
  if (!(expectedUpdatedAt instanceof Date) || !Number.isFinite(expectedUpdatedAt.getTime())) throw new Error(stale);
  const row = entity === "profile" ? await db.officeProfileVersion.findFirst({ where: { id, officeId: actor.officeId } }) : await db.notaryAppointment.findFirst({ where: { id, officeId: actor.officeId } });
  if (!row || row.updatedAt.getTime() !== expectedUpdatedAt.getTime()) throw new Error(stale);
  await lockIdentityScope(db, actor.officeId, entity, "kind" in row ? row.kind : "");
  const where = { id, officeId: actor.officeId, updatedAt: expectedUpdatedAt, status: row.status };
  if (operation === "delete") {
    if (row.status !== "DRAFT") throw new Error("Riwayat terbit tidak dapat dihapus.");
    const result = entity === "profile" ? await db.officeProfileVersion.deleteMany({ where }) : await db.notaryAppointment.deleteMany({ where });
    if (result.count !== 1) throw new Error(stale);
    await audit(db, actor, entity, "DELETE", row);
    return;
  }
  let data: Record<string, unknown>;
  if (operation === "update") {
    if (row.status !== "DRAFT") throw new Error("Hanya draft yang dapat diubah.");
    data = entity === "profile" ? normalizeProfileInput(input) : normalizeAppointmentInput(input);
    if ("kind" in row && data.kind !== row.kind) throw new Error("Jenis pengangkatan tidak dapat diubah.");
  } else if (operation === "publish") {
    if (row.status !== "DRAFT") throw new Error("Hanya draft yang dapat diterbitkan.");
    data = { status: "PUBLISHED", publishedAt: new Date() };
  } else {
    if (row.status !== "PUBLISHED") throw new Error("Hanya versi terbit yang dapat dipensiunkan.");
    const reason = text(input.reason, 500, true)!;
    if (reason.length < 3) throw new Error("Alasan minimal 3 karakter.");
    data = { status: "RETIRED", retiredAt: new Date(), retiredById: actor.id, retireReason: reason };
  }
  // Explicit monotonic timestamp prevents same-millisecond OCC tokens being reused.
  data.updatedAt = new Date(Math.max(Date.now(), row.updatedAt.getTime() + 1));
  const result = entity === "profile"
    ? await db.officeProfileVersion.updateMany({ where, data: data as Prisma.OfficeProfileVersionUpdateManyMutationInput })
    : await db.notaryAppointment.updateMany({ where, data: data as Prisma.NotaryAppointmentUncheckedUpdateManyInput });
  if (result.count !== 1) throw new Error(stale);
  await audit(db, actor, entity, operation === "update" ? "UPDATE" : operation === "publish" ? "PUBLISH" : "RETIRE", row, Object.keys(data));
  if (operation !== "update") await refreshOfficeLegacyCache(db, actor.officeId);
}

export async function refreshOfficeLegacyCache(db: IdentityDb, officeId: string, now = new Date()) {
  // Serialize all profile/appointment cache refreshes, including replacement overlays.
  await db.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`office-cache:${officeId}`}, 0))::text`);
  const today = indonesiaTodayDateOnly(now);
  const profile = await resolveEffectiveProfile(db, officeId, today);
  const appointment = await resolveEffectiveAppointment(db, officeId, "NOTARIS", today);
  await db.office.update({ where: { id: officeId }, data: {
    ...(profile ? { name: profile.officeName, address: profile.address, phone: profile.phone } : {}),
    notarisName: appointment?.notaryName ?? "", notarisTitle: appointment?.title ?? null,
    wilayahKerja: appointment?.workArea ?? null, skNotarisNo: appointment?.decreeNumber ?? null,
    skNotarisDate: appointment?.decreeDate?.toISOString().slice(0, 10) ?? appointment?.decreeDateText ?? null,
  } });
}
