"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/auth";
import type { DossierStage, PekerjaanPriority, PekerjaanStatus } from "@/generated/prisma/enums";
import { requireCurrentActor } from "@/lib/currentActor";
import {
  createPekerjaanForActor,
  deletePekerjaanForActor,
  transitionPekerjaanForActor,
  updatePekerjaanForActor,
  type PekerjaanPartyInput,
  type PekerjaanLandObjectInput,
} from "@/lib/pekerjaanService";
import { prisma } from "@/lib/prisma";
import { assertWritable } from "@/lib/subscription";

const PRIORITIES: PekerjaanPriority[] = ["RENDAH", "NORMAL", "TINGGI"];
const STATUSES: PekerjaanStatus[] = ["MASUK", "PROSES", "TANDA_TANGAN", "SELESAI", "DIBATALKAN"];
const DOSSIER_STAGES: DossierStage[] = ["PENGUMPULAN_DATA", "PENYUSUNAN_DRAFT", "SIAP_TANDA_TANGAN", "SUDAH_TANDA_TANGAN", "PROSES_INSTANSI", "SELESAI", "DIBATALKAN"];
const FORM_KEYS = [
  "kind", "jenis", "judul", "nomorAkta", "tanggalAkta", "keterangan", "bentukHukum",
  "pihakAlih", "pihakTerima", "luasTanah", "luasBangunan", "hargaTransaksi", "nop",
  "bphtb", "pphFinal", "honorarium", "picId", "dueDate", "priority", "internalNotes",
  "partiesJson", "landObjectsJson", "dossierStage", "signingScheduledAt", "signingLocation",
] as const;

function requireFormKeys(formData: FormData, role: "NOTARIS" | "STAF", update = false) {
  const baseKeys = role === "NOTARIS" ? FORM_KEYS : FORM_KEYS.filter((key) => key !== "honorarium");
  const keys: readonly string[] = update ? [...baseKeys, "expectedUpdatedAt"] : baseKeys;
  const missing = keys.filter((key) => !formData.has(key));
  if (missing.length) throw new Error("Form pekerjaan tidak lengkap. Muat ulang halaman lalu coba lagi.");
}

function partiesFromForm(formData: FormData): PekerjaanPartyInput[] {
  const raw = String(formData.get("partiesJson"));
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Data para pihak tidak valid.");
  }
  if (!Array.isArray(parsed)) throw new Error("Data para pihak tidak valid.");

  const unique = new Map<string, PekerjaanPartyInput>();
  for (const item of parsed) {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Data para pihak tidak valid.");
    const clientId = String((item as Record<string, unknown>).clientId ?? "").trim();
    const peran = String((item as Record<string, unknown>).peran ?? "").trim();
    const capacity = String((item as Record<string, unknown>).capacity ?? "").trim() || null;
    if (!clientId || !peran) throw new Error("Setiap pihak wajib memiliki klien dan peran.");
    unique.set(`${clientId}:${peran.toLowerCase()}`, { clientId, peran, capacity });
  }
  return [...unique.values()];
}

function decimalValue(value: unknown, label: string): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const normalized = raw.replace(/\s/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error(`${label} harus berupa angka non-negatif dengan maksimal 2 desimal.`);
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed > 9_999_999_999.99) throw new Error(`${label} melebihi batas yang diizinkan.`);
  return parsed;
}

function landObjectsFromForm(formData: FormData): PekerjaanLandObjectInput[] {
  let parsed: unknown;
  try { parsed = JSON.parse(String(formData.get("landObjectsJson") ?? "[]")); } catch { throw new Error("Data objek tanah tidak valid."); }
  if (!Array.isArray(parsed)) throw new Error("Data objek tanah tidak valid.");
  return parsed.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Data objek tanah tidak valid.");
    const value = item as Record<string, unknown>;
    const str = (key: string) => String(value[key] ?? "").trim() || null;
    return {
      label: str("label"), hakType: str("hakType"), certificateNumber: str("certificateNumber"),
      nib: str("nib"), nop: str("nop"), address: str("address"),
      luasTanah: decimalValue(value.luasTanah, `Luas tanah objek ${index + 1}`),
      luasBangunan: decimalValue(value.luasBangunan, `Luas bangunan objek ${index + 1}`),
    };
  });
}

function strictDateOnly(value: string | null, label: string): Date | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} harus berformat YYYY-MM-DD.`);
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`${label} bukan tanggal kalender yang valid.`);
  }
  return date;
}

function expectedDate(value: string | null): Date {
  if (!value) throw new Error("Versi pekerjaan tidak tersedia. Muat ulang halaman lalu coba lagi.");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Versi pekerjaan tidak valid. Muat ulang halaman lalu coba lagi.");
  return date;
}

function pekerjaanDataFromForm(formData: FormData) {
  const str = (key: string) => {
    const value = String(formData.get(key) ?? "").trim();
    return value || null;
  };
  const num = (key: string, label: string, max: number) => {
    const raw = String(formData.get(key) ?? "").trim();
    if (!raw) return null;
    const normalized = raw.replace(/\s/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
    if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error(`${label} harus berupa angka non-negatif dengan maksimal 2 desimal.`);
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed > max) throw new Error(`${label} melebihi batas yang diizinkan.`);
    return parsed;
  };
  return {
    kind: (str("kind") === "PPAT" ? "PPAT" : "NOTARIS") as "NOTARIS" | "PPAT",
    jenis: String(formData.get("jenis") ?? "").trim(),
    judul: String(formData.get("judul") ?? "").trim(),
    nomorAkta: str("nomorAkta"),
    tanggalAkta: strictDateOnly(str("tanggalAkta"), "Tanggal akta"),
    keterangan: str("keterangan"),
    bentukHukum: str("bentukHukum"),
    pihakAlih: str("pihakAlih"),
    pihakTerima: str("pihakTerima"),
    luasTanah: num("luasTanah", "Luas tanah", 9_999_999_999.99),
    luasBangunan: num("luasBangunan", "Luas bangunan", 9_999_999_999.99),
    hargaTransaksi: num("hargaTransaksi", "Harga transaksi", 9_999_999_999_999_999.99),
    nop: str("nop"),
    bphtb: num("bphtb", "BPHTB", 9_999_999_999_999_999.99),
    pphFinal: num("pphFinal", "PPh Final", 9_999_999_999_999_999.99),
    honorarium: num("honorarium", "Honorarium", 9_999_999_999_999_999.99),
  };
}

function workflowDataFromForm(formData: FormData) {
  const data: {
    picId?: string | null;
    dueDate?: Date | null;
    priority?: PekerjaanPriority;
    internalNotes?: string | null;
    dossierStage?: DossierStage;
    signingScheduledAt?: Date | null;
    signingLocation?: string | null;
  } = {};
  if (formData.has("picId")) data.picId = String(formData.get("picId") ?? "").trim() || null;
  if (formData.has("dueDate")) {
    const raw = String(formData.get("dueDate") ?? "").trim() || null;
    data.dueDate = strictDateOnly(raw, "Tanggal jatuh tempo");
  }
  if (formData.has("priority")) {
    const priority = String(formData.get("priority") ?? "").trim() as PekerjaanPriority;
    if (!PRIORITIES.includes(priority)) throw new Error("Prioritas pekerjaan tidak valid.");
    data.priority = priority;
  }
  if (formData.has("internalNotes")) {
    const notes = String(formData.get("internalNotes") ?? "").trim() || null;
    if (notes && notes.length > 5000) throw new Error("Catatan internal maksimal 5000 karakter.");
    data.internalNotes = notes;
  }
  if (formData.has("dossierStage")) {
    const stage = String(formData.get("dossierStage") ?? "") as DossierStage;
    if (!DOSSIER_STAGES.includes(stage)) throw new Error("Tahap dossier tidak valid.");
    data.dossierStage = stage;
  }
  if (formData.has("signingScheduledAt")) {
    const value = String(formData.get("signingScheduledAt") ?? "").trim();
    if (!value) data.signingScheduledAt = null;
    else {
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error("Jadwal tanda tangan tidak valid.");
      const [datePart, timePart] = value.split("T");
      const [year, month, day] = datePart.split("-").map(Number);
      const [hour, minute] = timePart.split(":").map(Number);
      const date = new Date(Date.UTC(year, month - 1, day, hour - 7, minute));
      const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hour12: false,
      }).formatToParts(date).map((part) => [part.type, part.value]));
      if (Number.isNaN(date.getTime()) || Number(parts.year) !== year || Number(parts.month) !== month
        || Number(parts.day) !== day || Number(parts.hour) !== hour || Number(parts.minute) !== minute) {
        throw new Error("Jadwal tanda tangan bukan tanggal dan waktu kalender yang valid.");
      }
      data.signingScheduledAt = date;
    }
  }
  if (formData.has("signingLocation")) {
    const location = String(formData.get("signingLocation") ?? "").trim() || null;
    if (location && location.length > 500) throw new Error("Lokasi tanda tangan maksimal 500 karakter.");
    data.signingLocation = location;
  }
  return data;
}

function revalidatePekerjaan(id?: string) {
  revalidatePath("/dashboard/pekerjaan");
  if (id) revalidatePath(`/dashboard/pekerjaan/${id}`);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/pengingat");
}

export async function createPekerjaanAction(formData: FormData) {
  const session = await requireSession();
  const actor = await requireCurrentActor(session.user.id);
  await assertWritable(actor.officeId);
  requireFormKeys(formData, actor.role);
  const data = { ...pekerjaanDataFromForm(formData), ...workflowDataFromForm(formData) };
  const parties = partiesFromForm(formData);
  const landObjects = landObjectsFromForm(formData);
  const primaryLand = landObjects[0];
  data.nop = data.kind === "PPAT" ? primaryLand?.nop ?? null : null;
  data.luasTanah = data.kind === "PPAT" ? primaryLand?.luasTanah ?? null : null;
  data.luasBangunan = data.kind === "PPAT" ? primaryLand?.luasBangunan ?? null : null;
  if (!data.jenis || !data.judul) throw new Error("Jenis dan judul pekerjaan wajib diisi.");
  if (actor.role !== "NOTARIS") data.honorarium = null;

  await prisma.$transaction(async (tx) => {
    const transactionalActor = await requireCurrentActor(session.user.id, tx);
    if (transactionalActor.officeId !== actor.officeId) throw new Error("Kantor pengguna berubah. Silakan masuk kembali.");
    await createPekerjaanForActor(tx, transactionalActor, data, parties, landObjects);
  });
  revalidatePekerjaan();
  redirect("/dashboard/pekerjaan");
}

export async function updatePekerjaanAction(id: string, formData: FormData) {
  const session = await requireSession();
  const actor = await requireCurrentActor(session.user.id);
  await assertWritable(actor.officeId);
  requireFormKeys(formData, actor.role, true);
  const data = { ...pekerjaanDataFromForm(formData), ...workflowDataFromForm(formData) };
  const parties = partiesFromForm(formData);
  const landObjects = landObjectsFromForm(formData);
  const primaryLand = landObjects[0];
  data.nop = data.kind === "PPAT" ? primaryLand?.nop ?? null : null;
  data.luasTanah = data.kind === "PPAT" ? primaryLand?.luasTanah ?? null : null;
  data.luasBangunan = data.kind === "PPAT" ? primaryLand?.luasBangunan ?? null : null;
  const expectedUpdatedAt = expectedDate(String(formData.get("expectedUpdatedAt") ?? "").trim() || null);
  if (!data.jenis || !data.judul) throw new Error("Jenis dan judul pekerjaan wajib diisi.");
  const updateData = actor.role === "NOTARIS"
    ? data
    : Object.fromEntries(Object.entries(data).filter(([field]) => field !== "honorarium"));

  await prisma.$transaction(async (tx) => {
    const transactionalActor = await requireCurrentActor(session.user.id, tx);
    if (transactionalActor.officeId !== actor.officeId) throw new Error("Kantor pengguna berubah. Silakan masuk kembali.");
    await updatePekerjaanForActor(tx, transactionalActor, id, expectedUpdatedAt, updateData, parties, landObjects);
  });
  revalidatePekerjaan(id);
}

export async function transitionPekerjaanAction(
  id: string,
  expectedUpdatedAt: string,
  nextStatus: string,
) {
  const session = await requireSession();
  const actor = await requireCurrentActor(session.user.id);
  await assertWritable(actor.officeId);
  if (!STATUSES.includes(nextStatus as PekerjaanStatus)) throw new Error("Status tujuan tidak valid.");
  await prisma.$transaction(async (tx) => {
    const transactionalActor = await requireCurrentActor(session.user.id, tx);
    if (transactionalActor.officeId !== actor.officeId) throw new Error("Kantor pengguna berubah. Silakan masuk kembali.");
    await transitionPekerjaanForActor(tx, transactionalActor, id, expectedDate(expectedUpdatedAt), nextStatus as PekerjaanStatus);
  });
  revalidatePekerjaan(id);
}

export async function deletePekerjaanAction(id: string, expectedUpdatedAt: string) {
  const session = await requireSession();
  const actor = await requireCurrentActor(session.user.id);
  await assertWritable(actor.officeId);
  await prisma.$transaction(async (tx) => {
    const transactionalActor = await requireCurrentActor(session.user.id, tx);
    if (transactionalActor.officeId !== actor.officeId) throw new Error("Kantor pengguna berubah. Silakan masuk kembali.");
    await deletePekerjaanForActor(tx, transactionalActor, id, expectedDate(expectedUpdatedAt));
  });
  revalidatePekerjaan(id);
  redirect("/dashboard/pekerjaan");
}
