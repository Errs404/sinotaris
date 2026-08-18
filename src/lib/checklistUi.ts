import type { ArchiveDocumentType, ChecklistItemStatus } from "@/generated/prisma/enums";

export const checklistExpectedTypeLabel: Record<ArchiveDocumentType, string> = {
  KTP: "KTP",
  KARTU_KELUARGA: "KK",
  NPWP: "NPWP",
  SERTIPIKAT: "Sertipikat",
  AKTA_PERJANJIAN: "Akta",
  UMUM: "Umum",
};

export const checklistStatusLabel: Record<ChecklistItemStatus, string> = {
  KOSONG: "Kosong",
  TERLAMPIR: "Terlampir",
  TERVERIFIKASI: "Terverifikasi",
  DITOLAK: "Ditolak",
  DILEWATI: "Dilewati",
};

export const checklistStatusClass: Record<ChecklistItemStatus, string> = {
  KOSONG: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200",
  TERLAMPIR: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  TERVERIFIKASI: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  DITOLAK: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  DILEWATI: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
};

export type ChecklistProgress = {
  requiredTotal: number;
  requiredVerified: number;
  optionalTotal: number;
  optionalComplete: number;
};

export function checklistProgress(items: Array<{ required: boolean; status: ChecklistItemStatus }>): ChecklistProgress {
  const requiredTotal = items.filter((item) => item.required).length;
  const requiredVerified = items.filter((item) => item.required && item.status === "TERVERIFIKASI").length;
  const optionalTotal = items.length - requiredTotal;
  const optionalComplete = items.filter((item) => !item.required && ["TERVERIFIKASI", "DILEWATI"].includes(item.status)).length;
  return { requiredTotal, requiredVerified, optionalTotal, optionalComplete };
}

export function checklistProgressPercent(progress: Pick<ChecklistProgress, "requiredTotal" | "requiredVerified">): number {
  if (progress.requiredTotal === 0) return 0;
  return Math.round((progress.requiredVerified / progress.requiredTotal) * 100);
}

export function sortChecklistCandidates<T extends { id: string; type: ArchiveDocumentType; createdAt: string }>(
  candidates: T[],
  expectedType: ArchiveDocumentType | null,
): T[] {
  return [...candidates].sort((left, right) => {
    const leftMatch = expectedType !== null && left.type === expectedType ? 1 : 0;
    const rightMatch = expectedType !== null && right.type === expectedType ? 1 : 0;
    return rightMatch - leftMatch || Date.parse(right.createdAt) - Date.parse(left.createdAt) || left.id.localeCompare(right.id);
  });
}
