import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireCurrentActor } from "@/lib/currentActor";
import type { TemplateFieldsDef } from "@/lib/templateFields";
import { GeneratorForm } from "./GeneratorForm";
import { buildDocumentPrefill } from "@/lib/documentPrefill";
import { buildArchivePrefill } from "@/lib/archivePrefill";
import { resolveDocumentIdentity, identityPlaceholders, buildIdentitySnapshot, appointmentMatchesKind, effectiveOn } from "@/lib/officeIdentity";
import { indonesiaTodayDateOnly } from "@/lib/pekerjaanUi";
import { identityLockedFields, identityPreviewValues } from "@/lib/officeIdentityUi";

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const actor = await requireCurrentActor(session!.user.id);
  const { id } = await params;

  const template = await prisma.docTemplate.findFirst({
    where: { id, officeId: actor.officeId },
  });

  if (!template) notFound();

  const sections = template.fieldsJson as unknown as TemplateFieldsDef;
  const jobs = await prisma.pekerjaan.findMany({
    where: { officeId: actor.officeId },
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: {
      office: true,
      officeProfileVersion: true,
      appointment: true,
      clients: {
        where: { client: { officeId: actor.officeId } },
        include: { client: true },
        orderBy: { peran: "asc" },
      },
    },
  });

  const jobOptions = jobs.map((job) => {
    try {
      const { officeProfileVersion: profile, appointment } = job;
      if (!profile || profile.officeId !== job.officeId || profile.status === "DRAFT"
        || !appointment || appointment.officeId !== job.officeId || appointment.status === "DRAFT"
        || !appointmentMatchesKind(job.kind, appointment.kind)
        || !effectiveOn(appointment, job.tanggalAkta ?? indonesiaTodayDateOnly())) throw new Error("Invalid job identity");
      const identity = buildIdentitySnapshot(profile, appointment);
      return {
    id: job.id,
    label: `${job.jenis} — ${job.judul}${job.nomorAkta ? ` (${job.nomorAkta})` : ""}`,
    values: identityPreviewValues(buildDocumentPrefill(job), identityPlaceholders(identity)),
    identitySource: `Profil v${identity.profile.version} · ${identity.appointment?.kind} v${identity.appointment?.version}`,
      };
    } catch {
      return { id: job.id, label: `${job.jenis} — ${job.judul}`, values: identityPreviewValues(buildDocumentPrefill(job), null), identitySource: "Identitas belum valid; lengkapi profil dan pengangkatan sebelum membuat dokumen." };
    }
  });
  let defaultIdentityValues: Record<string, string> = identityPreviewValues({}, null);
  try { defaultIdentityValues = identityPlaceholders(await prisma.$transaction(tx => resolveDocumentIdentity(tx, actor.officeId))); } catch { /* Generation enforces identity availability. */ }
  const archives = actor.role === "NOTARIS"
    ? await prisma.documentArchive.findMany({
        where: { officeId: actor.officeId, status: "DIKONFIRMASI" },
        orderBy: { updatedAt: "desc" },
        take: 100,
        select: {
          id: true,
          originalName: true,
          type: true,
          extractedJson: true,
          client: {
            select: {
              name: true,
              nik: true,
              nomorKk: true,
              npwp: true,
              tempatLahir: true,
              tanggalLahir: true,
              gender: true,
              pekerjaan: true,
              statusKawin: true,
              wargaNegara: true,
              address: true,
            },
          },
        },
      })
    : [];
  const archiveOptions = archives.map((archive) => {
    const extracted = archive.extractedJson as {
      fields?: Record<string, string>;
      confirmedClientFields?: Record<string, string>;
    };
    const currentClientFields: Record<string, string> = archive.client
      ? {
          name: archive.client.name,
          nik: archive.client.nik ?? "",
          nomorKk: archive.client.nomorKk ?? "",
          npwp: archive.client.npwp ?? "",
          tempatLahir: archive.client.tempatLahir ?? "",
          tanggalLahir: archive.client.tanggalLahir?.toISOString().slice(0, 10) ?? "",
          gender: archive.client.gender ?? "",
          pekerjaan: archive.client.pekerjaan ?? "",
          statusKawin: archive.client.statusKawin ?? "",
          wargaNegara: archive.client.wargaNegara ?? "Indonesia",
          address: archive.client.address ?? "",
        }
      : {};
    return {
      id: archive.id,
      label: `${archive.originalName} — ${archive.type.replaceAll("_", " ")}`,
      values: buildArchivePrefill({
        ...(extracted.fields ?? {}),
        ...(extracted.confirmedClientFields ?? {}),
        ...currentClientFields,
      }),
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/dokumen" className="text-sm text-indigo-700 hover:underline">
          ← Kembali ke daftar template
        </Link>
        <h2 className="mt-1 text-2xl font-bold text-slate-800 dark:text-slate-100">Buat Dokumen: {template.name}</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Isi form di bawah lalu klik Generate DOCX. Tanggal otomatis diubah jadi teks
          terbilang Bahasa Indonesia.
        </p>
      </div>
      <GeneratorForm templateId={template.id} sections={sections} jobs={jobOptions} archives={archiveOptions} identityLockedFields={identityLockedFields} defaultIdentityValues={defaultIdentityValues} />
    </div>
  );
}
