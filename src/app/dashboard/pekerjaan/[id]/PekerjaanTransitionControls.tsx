"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PekerjaanStatus, UserRole } from "@/generated/prisma/enums";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { visiblePekerjaanTransitions, type PekerjaanTransition } from "@/lib/pekerjaanUi";

export function PekerjaanTransitionControls({
  status,
  role,
  actions,
}: {
  status: PekerjaanStatus;
  role: UserRole;
  actions: Partial<Record<PekerjaanStatus, () => Promise<void>>>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState<PekerjaanTransition | null>(null);
  const [running, setRunning] = useState(false);
  const transitions = visiblePekerjaanTransitions(status, role);

  async function runTransition(transition: PekerjaanTransition) {
    const action = actions[transition.nextStatus];
    if (!action || running) return;
    setRunning(true);
    try {
      await action();
      toast({ title: `Status pekerjaan diperbarui: ${transition.label}` });
      router.refresh();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Perubahan status gagal.";
      toast({ title: message, variant: "error" });
      throw cause;
    } finally {
      setRunning(false);
    }
  }

  if (transitions.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Tidak ada perubahan status yang tersedia.</p>;
  }

  return (
    <>
      <div className="flex flex-wrap gap-2" aria-label="Aksi perubahan status">
        {transitions.map((transition) => (
          <form
            key={transition.nextStatus}
            action={async () => {
              if (transition.destructive) {
                setPending(transition);
                return;
              }
              await runTransition(transition);
            }}
          >
            <button
              type="submit"
              disabled={running}
              className={transition.nextStatus === "DIBATALKAN"
                ? "rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-red-950/30"
                : "rounded-lg border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950/30"}
            >
              {transition.label}
            </button>
          </form>
        ))}
      </div>
      <ConfirmDialog
        open={pending !== null}
        onClose={() => { if (!running) setPending(null); }}
        onConfirm={async () => {
          if (!pending) return;
          await runTransition(pending);
          setPending(null);
        }}
        title={`${pending?.label ?? "Ubah status"} pekerjaan?`}
        description="Perubahan status akan dicatat pada riwayat aktivitas pekerjaan."
        confirmLabel={pending?.label ?? "Lanjutkan"}
        variant={pending?.nextStatus === "DIBATALKAN" ? "danger" : "warning"}
      />
    </>
  );
}
