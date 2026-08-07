import { auth } from "@/auth";
import { Breadcrumb } from "@/components/Breadcrumb";
import { PekerjaanForm } from "../PekerjaanForm";
import { createPekerjaanAction } from "../actions";
import { prisma } from "@/lib/prisma";

export default async function PekerjaanBaruPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const session = await auth();
  const { kind } = await searchParams;
  const [clients, users] = await Promise.all([
    prisma.client.findMany({
      where: { officeId: session!.user.officeId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, nik: true },
    }),
    prisma.user.findMany({
      where: { officeId: session!.user.officeId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Pekerjaan", href: "/dashboard/pekerjaan" },
          { label: "Tambah Pekerjaan" },
        ]}
      />
      <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Tambah Pekerjaan</h2>
      <PekerjaanForm
        action={createPekerjaanAction}
        defaultKind={kind === "PPAT" ? "PPAT" : "NOTARIS"}
        isNotaris={session!.user.role === "NOTARIS"}
        submitLabel="Simpan Pekerjaan"
        clients={clients}
        users={users}
        currentActorId={session!.user.id}
      />
    </div>
  );
}
