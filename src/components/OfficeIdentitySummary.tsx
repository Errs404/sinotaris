import { prisma } from "@/lib/prisma";
import { resolveEffectiveProfile, resolveEffectiveAppointment } from "@/lib/officeIdentity";
import { identityPeriod } from "@/lib/officeIdentityUi";

export async function OfficeIdentitySummary({ officeId }: { officeId: string }) {
  const [profile, notaris, ppat] = await Promise.all([
    resolveEffectiveProfile(prisma, officeId), resolveEffectiveAppointment(prisma, officeId, "NOTARIS"), resolveEffectiveAppointment(prisma, officeId, "PPAT"),
  ]);
  return <section className="rounded-xl bg-white p-6 shadow-sm dark:bg-slate-800" aria-label="Identitas efektif hari ini">
    <h3 className="font-semibold">Identitas efektif hari ini</h3>
    <p className="mt-2 font-medium">{profile?.officeName ?? "Profil kantor aktif belum tersedia"}</p>
    {profile && <div className="mt-2 border-b border-slate-200 pb-3 text-sm text-slate-500"><p>Profil v{profile.version} · PUBLISHED · {identityPeriod(profile)}</p><p>{profile.address}</p><p>{[profile.phone, profile.email].filter(Boolean).join(" · ")}</p></div>}
    {[{ label: "Notaris", row: notaris }, { label: "PPAT", row: ppat }].map(({ label, row }) => <p key={label} className={`mt-2 rounded-lg p-3 text-sm ${row ? "bg-slate-50 dark:bg-slate-900" : "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200"}`}>{label}: {row ? `${row.notaryName} · ${row.kind} · v${row.version} · PUBLISHED · ${identityPeriod(row)}` : "Pengangkatan aktif belum tersedia; pekerjaan jenis ini tidak dapat dibuat."}</p>)}
    <p className="mt-3 text-xs text-slate-500">Sumber: versi terbit yang berlaku hari ini. Notaris pengganti yang efektif diutamakan untuk pekerjaan Notaris; pengganti bersifat opsional.</p>
  </section>;
}
