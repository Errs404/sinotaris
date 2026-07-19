"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Breadcrumb } from "@/components/Breadcrumb";
import { PekerjaanForm } from "../PekerjaanForm";
import type { ClientOption } from "../PihakEditor";

export function PekerjaanDetailClient({
  pekerjaan,
  isNotaris,
  updateAction,
  deleteAction,
  clients,
}: {
  pekerjaan: Record<string, unknown> & { id: string; judul: string };
  isNotaris: boolean;
  updateAction: (formData: FormData) => Promise<void>;
  deleteAction: () => Promise<void>;
  clients: ClientOption[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [showDelete, setShowDelete] = useState(false);

  async function handleUpdate(formData: FormData) {
    await updateAction(formData);
    toast({ title: "Pekerjaan berhasil diperbarui" });
  }

  async function handleDelete() {
    await deleteAction();
    toast({ title: "Pekerjaan berhasil dihapus", variant: "info" });
    router.push("/dashboard/pekerjaan");
  }

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Pekerjaan", href: "/dashboard/pekerjaan" },
          { label: pekerjaan.judul },
        ]}
      />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{pekerjaan.judul}</h2>
        <button
          onClick={() => setShowDelete(true)}
          className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          Hapus Pekerjaan
        </button>
      </div>
      <PekerjaanForm
        action={handleUpdate}
        pekerjaan={pekerjaan}
        isNotaris={isNotaris}
        submitLabel="Simpan Perubahan"
        clients={clients}
        parties={Array.isArray(pekerjaan.clients)
          ? (pekerjaan.clients as Array<{ clientId: string; peran: string }>).map((party) => ({
              clientId: party.clientId,
              peran: party.peran,
            }))
          : []}
      />
      <ConfirmDialog
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title="Hapus pekerjaan ini?"
        description={`"${pekerjaan.judul}" akan dihapus permanen beserta riwayatnya.`}
      />
    </div>
  );
}
