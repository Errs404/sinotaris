import type { ChecklistItemStatus, PekerjaanStatus } from "@/generated/prisma/enums";

export const DYNAMIC_REMINDER_SEVERITIES = [
  "KRITIS",
  "PERINGATAN",
  "PERLU_VERIFIKASI",
  "REVISI",
] as const;

export type DynamicReminderSeverity = typeof DYNAMIC_REMINDER_SEVERITIES[number];

export type DynamicReminderCandidate = {
  id: string;
  judul: string;
  jenis: string;
  status: PekerjaanStatus;
  dueDate: Date | null;
  pic: { id: string; name: string } | null;
  checklistItems: Array<{ required: boolean; status: ChecklistItemStatus }>;
};

export type DynamicReminder = {
  id: string;
  pekerjaanId: string;
  title: string;
  jenis: string;
  dueDate: string | null;
  daysUntilDue: number | null;
  severity: DynamicReminderSeverity;
  counts: { empty: number; rejected: number; attached: number };
  requiredTotal: number;
  requiredVerified: number;
  pic: { id: string; name: string } | null;
  link: string;
};

export type DynamicReminderFilters = {
  severity?: DynamicReminderSeverity;
  picId?: string;
  query?: string;
};

export type FinanceReminderCandidate = {
  id: string;
  dueDate: Date | null;
  client: { name: string };
};

export type FinanceReminder = {
  id: string;
  invoiceId: string;
  title: string;
  clientName: string;
  dueDate: string;
  daysUntilDue: number;
  severity: "KRITIS" | "PERINGATAN";
  link: string;
};

const DAY_MS = 86_400_000;
const TERMINAL = new Set<PekerjaanStatus>(["SELESAI", "DIBATALKAN"]);

export const dynamicReminderSeverityRank: Record<DynamicReminderSeverity, number> = {
  KRITIS: 0,
  PERINGATAN: 1,
  PERLU_VERIFIKASI: 2,
  REVISI: 3,
};

export function buildDynamicReminder(
  candidate: DynamicReminderCandidate,
  today: Date,
): DynamicReminder | null {
  if (TERMINAL.has(candidate.status)) return null;

  const required = candidate.checklistItems.filter((item) => item.required);
  const counts = {
    empty: required.filter((item) => item.status === "KOSONG").length,
    rejected: required.filter((item) => item.status === "DITOLAK").length,
    attached: required.filter((item) => item.status === "TERLAMPIR").length,
  };
  const requiredVerified = required.filter((item) => item.status === "TERVERIFIKASI").length;
  const dueDate = candidate.dueDate ? new Date(candidate.dueDate) : null;
  const daysUntilDue = dueDate ? Math.round((dueDate.getTime() - today.getTime()) / DAY_MS) : null;

  let severity: DynamicReminderSeverity | null = null;
  if (daysUntilDue !== null && daysUntilDue <= 0) severity = "KRITIS";
  else if (counts.attached > 0 && counts.empty === 0 && counts.rejected === 0 && daysUntilDue !== null && daysUntilDue <= 3) severity = "PERLU_VERIFIKASI";
  else if (daysUntilDue !== null && daysUntilDue <= 3) severity = "PERINGATAN";
  else if (counts.rejected > 0) severity = "REVISI";

  if (!severity) return null;
  return {
    id: `pekerjaan:${candidate.id}`,
    pekerjaanId: candidate.id,
    title: candidate.judul,
    jenis: candidate.jenis,
    dueDate: dueDate?.toISOString().slice(0, 10) ?? null,
    daysUntilDue,
    severity,
    counts,
    requiredTotal: required.length,
    requiredVerified,
    pic: candidate.pic ? { id: candidate.pic.id, name: candidate.pic.name } : null,
    link: `/dashboard/pekerjaan/${candidate.id}`,
  };
}

export function sortDynamicReminders(reminders: DynamicReminder[]): DynamicReminder[] {
  return [...reminders].sort((a, b) =>
    dynamicReminderSeverityRank[a.severity] - dynamicReminderSeverityRank[b.severity]
    || (a.dueDate === null ? 1 : b.dueDate === null ? -1 : a.dueDate.localeCompare(b.dueDate))
    || a.title.localeCompare(b.title, "id"),
  );
}

export function buildDynamicReminders(candidates: DynamicReminderCandidate[], today: Date): DynamicReminder[] {
  return sortDynamicReminders(candidates.flatMap((candidate) => {
    const reminder = buildDynamicReminder(candidate, today);
    return reminder ? [reminder] : [];
  }));
}

export function filterDynamicReminders(
  reminders: DynamicReminder[],
  filters: DynamicReminderFilters,
): DynamicReminder[] {
  const query = filters.query?.trim().toLocaleLowerCase("id") ?? "";
  return reminders.filter((reminder) =>
    (!filters.severity || reminder.severity === filters.severity)
    && (!filters.picId || reminder.pic?.id === filters.picId)
    && (!query || `${reminder.title} ${reminder.jenis} ${reminder.pic?.name ?? ""}`.toLocaleLowerCase("id").includes(query)),
  );
}

export function paginateDynamicReminders(reminders: DynamicReminder[], page: number, pageSize: number) {
  const totalItems = reminders.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(1, Number.isFinite(page) ? Math.floor(page) : 1), totalPages);
  return {
    items: reminders.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    totalItems,
    totalPages,
    currentPage,
  };
}

export function buildFinanceReminder(candidate: FinanceReminderCandidate, today: Date): FinanceReminder | null {
  if (!candidate.dueDate) return null;
  const dueDate = new Date(candidate.dueDate);
  const daysUntilDue = Math.round((dueDate.getTime() - today.getTime()) / DAY_MS);
  if (daysUntilDue > 3) return null;
  return {
    id: `invoice:${candidate.id}`,
    invoiceId: candidate.id,
    title: `Tagihan ${candidate.client.name}`,
    clientName: candidate.client.name,
    dueDate: dueDate.toISOString().slice(0, 10),
    daysUntilDue,
    severity: daysUntilDue <= 0 ? "KRITIS" : "PERINGATAN",
    link: `/dashboard/invoice/${candidate.id}`,
  };
}
