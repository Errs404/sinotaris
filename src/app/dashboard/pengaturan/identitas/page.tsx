import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/auth";
import { requireCurrentActor } from "@/lib/currentActor";
import { prisma } from "@/lib/prisma";
import { OfficeIdentitySummary } from "@/components/OfficeIdentitySummary";
import { IdentityManager } from "./IdentityManager";

export default async function IdentityPage() {
  const session = await requireSession();
  const actor = await requireCurrentActor(session.user.id);
  if (actor.role !== "NOTARIS") redirect("/dashboard/pengaturan");
  const [profiles, appointments] = await Promise.all([
    prisma.officeProfileVersion.findMany({ where: { officeId: actor.officeId }, orderBy: { version: "desc" } }),
    prisma.notaryAppointment.findMany({ where: { officeId: actor.officeId }, orderBy: { version: "desc" } }),
  ]);
  const serialize = (rows: typeof profiles | typeof appointments) => rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value])));
  return <div className="max-w-5xl space-y-6"><Link href="/dashboard/pengaturan" className="text-sm text-indigo-600">← Pengaturan</Link><h2 className="text-2xl font-bold">Identitas Kantor & Pengangkatan</h2><OfficeIdentitySummary officeId={actor.officeId} /><IdentityManager profiles={serialize(profiles)} appointments={serialize(appointments)} /></div>;
}
