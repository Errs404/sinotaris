import { Breadcrumb } from "@/components/Breadcrumb";
import { createClientAction } from "../actions";
import { auth } from "@/auth";
import { NewClientForm } from "./NewClientForm";

export default async function KlienBaruPage() {
  const session = await auth();
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
      <NewClientForm action={createClientAction} canScan={session!.user.role === "NOTARIS"} />
    </div>
  );
}
