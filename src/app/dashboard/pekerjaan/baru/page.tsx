import { auth } from "@/auth";
import { Breadcrumb } from "@/components/Breadcrumb";
import { PekerjaanForm } from "../PekerjaanForm";
import { createPekerjaanAction } from "../actions";

export default async function PekerjaanBaruPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const session = await auth();
  const { kind } = await searchParams;

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Pekerjaan", href: "/dashboard/pekerjaan" },
          { label: "Tambah Pekerjaan" },
        ]}
      />
      <h2 className="text-2xl font-bold text-slate-800">Tambah Pekerjaan</h2>
      <PekerjaanForm
        action={createPekerjaanAction}
        defaultKind={kind === "PPAT" ? "PPAT" : "NOTARIS"}
        isNotaris={session!.user.role === "NOTARIS"}
        submitLabel="Simpan Pekerjaan"
      />
    </div>
  );
}
