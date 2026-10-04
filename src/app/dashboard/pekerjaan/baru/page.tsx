import { auth } from "@/auth";
import { Breadcrumb } from "@/components/Breadcrumb";
import { PekerjaanForm } from "../PekerjaanForm";
import { createPekerjaanAction } from "../actions";
import { prisma } from "@/lib/prisma";
import { requireCurrentActor } from "@/lib/currentActor";
import { resolveEffectiveAppointment } from "@/lib/officeIdentity";

export default async function PekerjaanBaruPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const session = await auth();
  const { kind } = await searchParams;
  const actor = await requireCurrentActor(session!.user.id);
  const appointments = await prisma.notaryAppointment.findMany({ where: { officeId: actor.officeId, status: "PUBLISHED" }, orderBy: { version: "desc" } });
  const effective = await resolveEffectiveAppointment(prisma, actor.officeId, kind === "PPAT" ? "PPAT" : "NOTARIS");
  const [clients, users] = await Promise.all([
    prisma.client.findMany({
      where: { officeId: actor.officeId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, nik: true },
    }),
    prisma.user.findMany({
      where: { officeId: actor.officeId, isActive: true },
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
        appointments={appointments}
        defaultAppointmentId={effective?.id}
        action={createPekerjaanAction}
        defaultKind={kind === "PPAT" ? "PPAT" : "NOTARIS"}
        isNotaris={actor.role === "NOTARIS"}
        submitLabel="Simpan Pekerjaan"
        clients={clients}
        users={users}
        currentActorId={session!.user.id}
      />
    </div>
  );
}
