"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PekerjaanKind, PekerjaanPriority, PekerjaanStatus, UserRole } from "@/generated/prisma/enums";
import { Breadcrumb } from "@/components/Breadcrumb";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { pekerjaanStatusClass, pekerjaanStatusLabel } from "@/lib/pekerjaanUi";
import { PekerjaanForm, type PekerjaanUserOption } from "../PekerjaanForm";
import type { ClientOption } from "../PihakEditor";
import { PekerjaanTransitionControls } from "./PekerjaanTransitionControls";

export type PekerjaanDetailDto = {
  id: string;
  kind: PekerjaanKind;
  jenis: string;
  judul: string;
  nomorAkta: string | null;
  tanggalAkta: string | null;
  status: PekerjaanStatus;
  keterangan: string | null;
  bentukHukum: string | null;
  pihakAlih: string | null;
  pihakTerima: string | null;
  luasTanah: string | null;
  luasBangunan: string | null;
  hargaTransaksi: string | null;
  nop: string | null;
  bphtb: string | null;
  pphFinal: string | null;
  honorarium?: string | null;
  picId: string | null;
  dueDate: string | null;
  priority: PekerjaanPriority;
  internalNotes: string | null;
  completedAt: string | null;
  updatedAt: string;
  clients: Array<{ clientId: string; peran: string; name: string }>;
};

export type PekerjaanTimelineItem = {
  id: string;
  category: "create" | "general" | "workflow" | "status";
  actorName: string;
  actorRole: string;
  description: string;
  createdAt: string;
};

const timelineLabel = {
  create: "Pekerjaan dibuat",
  general: "Data umum diperbarui",
  workflow: "Alur kerja diperbarui",
  status: "Status diperbarui",
};

export function PekerjaanDetailClient({
  pekerjaan,
  role,
  currentActorId,
  updateAction,
  deleteAction,
  transitionActions,
  clients,
  users,
  timeline,
}: {
  pekerjaan: PekerjaanDetailDto;
  role: UserRole;
  currentActorId: string;
  updateAction: (formData: FormData) => Promise<void>;
  deleteAction?: () => Promise<void>;
  transitionActions: Partial<Record<PekerjaanStatus, () => Promise<void>>>;
  clients: ClientOption[];
  users: PekerjaanUserOption[];
  timeline: PekerjaanTimelineItem[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [showDelete, setShowDelete] = useState(false);

  async function handleUpdate(formData: FormData) {
    await updateAction(formData);
    toast({ title: "Pekerjaan berhasil diperbarui" });
    router.refresh();
  }

  async function handleDelete() {
    if (!deleteAction) return;
    await deleteAction();
    toast({ title: "Pekerjaan berhasil dihapus", variant: "info" });
  }

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Pekerjaan", href: "/dashboard/pekerjaan" }, { label: pekerjaan.judul }]} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{pekerjaan.judul}</h2>
          <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${pekerjaanStatusClass[pekerjaan.status]}`}>
            {pekerjaanStatusLabel[pekerjaan.status]}
          </span>
        </div>
        {deleteAction && (
          <button type="button" onClick={() => setShowDelete(true)} className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500">
            Hapus Pekerjaan
          </button>
        )}
      </div>

      <section className="rounded-xl border border-indigo-100 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800" aria-labelledby="workflow-actions-title">
        <h3 id="workflow-actions-title" className="font-semibold text-slate-800 dark:text-slate-100">Aksi Alur Kerja</h3>
        <p className="mb-4 mt-1 text-xs text-slate-500 dark:text-slate-400">Pilihan ini membantu operasional; server tetap memvalidasi setiap kewenangan dan perubahan status.</p>
        <PekerjaanTransitionControls status={pekerjaan.status} role={role} actions={transitionActions} />
      </section>

      <PekerjaanForm
        action={handleUpdate}
        pekerjaan={pekerjaan}
        isNotaris={role === "NOTARIS"}
        submitLabel="Simpan Perubahan"
        clients={clients}
        users={users}
        currentActorId={currentActorId}
        parties={pekerjaan.clients.map(({ clientId, peran }) => ({ clientId, peran }))}
      />

      <section className="max-w-3xl rounded-xl border border-indigo-100 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800" aria-labelledby="timeline-title">
        <h3 id="timeline-title" className="font-semibold text-slate-800 dark:text-slate-100">Riwayat Aktivitas</h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Maksimal 50 aktivitas terbaru. Catatan internal dan nilai keuangan tidak ditampilkan.</p>
        {timeline.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Belum ada riwayat aktivitas.</p>
        ) : (
          <ol className="mt-4 space-y-3">
            {timeline.map((item) => (
              <li key={item.id} className="border-l-2 border-indigo-200 pl-4 dark:border-indigo-800">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{timelineLabel[item.category]}</p>
                  <time dateTime={item.createdAt} className="text-xs text-slate-500 dark:text-slate-400">
                    {new Date(item.createdAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
                  </time>
                </div>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{item.description}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.actorName} · {item.actorRole}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      {deleteAction && (
        <ConfirmDialog
          open={showDelete}
          onClose={() => setShowDelete(false)}
          onConfirm={handleDelete}
          title="Hapus pekerjaan ini?"
          description={`“${pekerjaan.judul}” akan dihapus. Data terkait akan dilepas tautannya dan riwayat audit tetap disimpan.`}
        />
      )}
    </div>
  );
}
