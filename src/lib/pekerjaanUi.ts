import type { PekerjaanPriority, PekerjaanStatus, UserRole } from "@/generated/prisma/enums";

export type PekerjaanTimelineAction =
  | "PEKERJAAN_CREATE"
  | "PEKERJAAN_UPDATE"
  | "PEKERJAAN_WORKFLOW_UPDATE"
  | "PEKERJAAN_STATUS_CHANGE";

const TIMELINE_FIELD_LABELS: Record<string, string> = {
  kind: "jabatan",
  jenis: "jenis",
  judul: "judul",
  nomorAkta: "nomor akta",
  tanggalAkta: "tanggal akta",
  keterangan: "keterangan",
  clients: "para pihak",
  bentukHukum: "bentuk hukum",
  pihakAlih: "pihak yang mengalihkan",
  pihakTerima: "pihak yang menerima",
  luasTanah: "luas tanah",
  luasBangunan: "luas bangunan",
  hargaTransaksi: "harga transaksi",
  nop: "NOP",
  bphtb: "BPHTB",
  pphFinal: "PPh Final",
  honorarium: "honorarium",
  picId: "PIC",
  dueDate: "tanggal jatuh tempo",
  priority: "prioritas",
  internalNotes: "catatan internal",
};

const FINANCIAL_TIMELINE_FIELDS = new Set(["hargaTransaksi", "bphtb", "pphFinal", "honorarium"]);

function timelineMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function safePekerjaanTimelineDescription(
  action: PekerjaanTimelineAction,
  rawMetadata: unknown,
  viewerRole: UserRole | string,
): string {
  const metadata = timelineMetadata(rawMetadata);
  if (action === "PEKERJAAN_CREATE") return "Pekerjaan dibuat dan alur kerja awal ditetapkan.";
  if (action === "PEKERJAAN_STATUS_CHANGE") {
    const previous = typeof metadata.previousStatus === "string" ? metadata.previousStatus : null;
    const next = typeof metadata.newStatus === "string" ? metadata.newStatus : null;
    return previous && next && previous in pekerjaanStatusLabel && next in pekerjaanStatusLabel
      ? `Status diubah dari ${pekerjaanStatusLabel[previous as PekerjaanStatus]} menjadi ${pekerjaanStatusLabel[next as PekerjaanStatus]}.`
      : "Status pekerjaan diperbarui.";
  }

  const changedFields = Array.isArray(metadata.changedFields)
    ? metadata.changedFields
        .filter((field): field is string => typeof field === "string" && field in TIMELINE_FIELD_LABELS)
        .filter((field) => viewerRole === "NOTARIS" || !FINANCIAL_TIMELINE_FIELDS.has(field))
        .map((field) => TIMELINE_FIELD_LABELS[field])
    : [];
  const prefix = action === "PEKERJAAN_WORKFLOW_UPDATE" ? "Alur kerja diperbarui" : "Data pekerjaan diperbarui";
  return changedFields.length ? `${prefix}: ${changedFields.join(", ")}.` : `${prefix}.`;
}

export const TERMINAL_PEKERJAAN_STATUSES: PekerjaanStatus[] = ["SELESAI", "DIBATALKAN"];

export const pekerjaanStatusLabel: Record<PekerjaanStatus, string> = {
  MASUK: "Masuk",
  PROSES: "Proses",
  TANDA_TANGAN: "Tanda Tangan",
  SELESAI: "Selesai",
  DIBATALKAN: "Dibatalkan",
};

export const pekerjaanStatusClass: Record<PekerjaanStatus, string> = {
  MASUK: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200",
  PROSES: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  TANDA_TANGAN: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  SELESAI: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  DIBATALKAN: "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300",
};

export const pekerjaanPriorityLabel: Record<PekerjaanPriority, string> = {
  RENDAH: "Rendah",
  NORMAL: "Normal",
  TINGGI: "Tinggi",
};

export const pekerjaanPriorityClass: Record<PekerjaanPriority, string> = {
  RENDAH: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200",
  NORMAL: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  TINGGI: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
};

export function indonesiaTodayDateOnly(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(Date.UTC(Number(value.year), Number(value.month) - 1, Number(value.day)));
}

export function formatDateOnly(value: Date | string | null | undefined): string {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function dateOnlyInputValue(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 10);
}

export function isPekerjaanOverdue(
  dueDate: Date | string | null | undefined,
  status: PekerjaanStatus,
  today = indonesiaTodayDateOnly(),
): boolean {
  if (!dueDate || TERMINAL_PEKERJAAN_STATUSES.includes(status)) return false;
  return new Date(dueDate).getTime() < today.getTime();
}

export type PekerjaanTransition = {
  nextStatus: PekerjaanStatus;
  label: string;
  destructive?: boolean;
};

export function visiblePekerjaanTransitions(
  status: PekerjaanStatus,
  role: UserRole | string,
): PekerjaanTransition[] {
  const isNotaris = role === "NOTARIS";
  if (status === "MASUK") return [
    { nextStatus: "PROSES", label: "Mulai Proses" },
    { nextStatus: "DIBATALKAN", label: "Batalkan", destructive: true },
  ];
  if (status === "PROSES") return [
    { nextStatus: "MASUK", label: "Kembalikan ke Masuk" },
    { nextStatus: "TANDA_TANGAN", label: "Siap Tanda Tangan" },
    { nextStatus: "DIBATALKAN", label: "Batalkan", destructive: true },
  ];
  if (status === "TANDA_TANGAN") return [
    { nextStatus: "PROSES", label: "Kembali ke Proses" },
    { nextStatus: "SELESAI", label: "Selesaikan", destructive: true },
    ...(isNotaris ? [{ nextStatus: "DIBATALKAN" as const, label: "Batalkan", destructive: true }] : []),
  ];
  if (status === "SELESAI" && isNotaris) return [
    { nextStatus: "PROSES", label: "Buka Kembali (Notaris)", destructive: true },
    { nextStatus: "DIBATALKAN", label: "Batalkan", destructive: true },
  ];
  return [];
}
