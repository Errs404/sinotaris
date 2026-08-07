"use client";

import { useId, useState } from "react";
import { AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: string;
  confirmLabel?: string;
  variant?: "danger" | "warning";
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  if (!props.open) return null;
  return <ConfirmDialogContent {...props} />;
}

function ConfirmDialogContent({
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Hapus",
  variant = "danger",
}: ConfirmDialogProps) {
  const titleId = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Tindakan gagal. Silakan coba lagi.");
    } finally {
      setPending(false);
    }
  }

  const btnClass =
    variant === "danger"
      ? "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500"
      : "bg-amber-500 text-white hover:bg-amber-600 focus:ring-amber-400";

  const iconClass = variant === "danger" ? "text-red-500" : "text-amber-500";

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm disabled:cursor-wait"
        onClick={() => { if (!pending) onClose(); }}
        disabled={pending}
        aria-label="Tutup dialog"
      />
      <div
        className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-800"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="flex items-start gap-4">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${variant === "danger" ? "bg-red-100" : "bg-amber-100"}`}>
            <AlertTriangle className={`h-5 w-5 ${iconClass}`} />
          </div>
          <div>
            <h3 id={titleId} className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
            {description && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>}
            {error && <p role="alert" className="mt-2 text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={pending}
            className={`rounded-lg px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${btnClass}`}
          >
            {pending ? "Memproses..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
