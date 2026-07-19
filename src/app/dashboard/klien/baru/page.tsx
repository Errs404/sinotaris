import { Breadcrumb } from "@/components/Breadcrumb";
import { KlienForm } from "../KlienForm";
import { createClientAction } from "../actions";

export default function KlienBaruPage() {
  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Klien", href: "/dashboard/klien" },
          { label: "Tambah Klien" },
        ]}
      />
      <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Tambah Klien</h2>
      <KlienForm action={createClientAction} submitLabel="Simpan Klien" />
    </div>
  );
}
