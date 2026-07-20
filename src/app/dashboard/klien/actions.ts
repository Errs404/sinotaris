"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import { assertWritable } from "@/lib/subscription";
import { clientScanFields, normalizeClientScanValue, sameClientScanValue } from "@/lib/clientScanFields";

function clientDataFromForm(formData: FormData) {
  const str = (key: string) => {
    const value = String(formData.get(key) ?? "").trim();
    return value || null;
  };

  const tanggalLahirRaw = str("tanggalLahir");

  return {
    type: (str("type") === "BADAN_HUKUM" ? "BADAN_HUKUM" : "PERORANGAN") as "PERORANGAN" | "BADAN_HUKUM",
    name: String(formData.get("name") ?? "").trim(),
    nik: str("nik"),
    npwp: str("npwp"),
    tempatLahir: str("tempatLahir"),
    tanggalLahir: tanggalLahirRaw ? new Date(tanggalLahirRaw) : null,
    gender: str("gender"),
    pekerjaan: str("pekerjaan"),
    statusKawin: str("statusKawin"),
    wargaNegara: str("wargaNegara") ?? "Indonesia",
    address: str("address"),
    phone: str("phone"),
    email: str("email"),
    notes: str("notes"),
  };
}

function archiveIdsFromForm(formData: FormData): string[] {
  const raw = String(formData.get("archiveIdsJson") ?? "[]");
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length > 10) throw new Error();
    return [...new Set(parsed.map((value) => String(value).trim()).filter(Boolean))];
  } catch {
    throw new Error("Daftar dokumen Klien tidak valid.");
  }
}

function conflictResolutionsFromForm(formData: FormData): Record<string, string> {
  try {
    const parsed = JSON.parse(String(formData.get("conflictResolutionsJson") ?? "{}")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    const entries = Object.entries(parsed as Record<string, unknown>);
    if (entries.length > 100) throw new Error();
    return Object.fromEntries(entries.map(([key, value]) => [key.slice(0, 150), String(value ?? "").slice(0, 5_000)]));
  } catch {
    throw new Error("Keputusan perbedaan dokumen tidak valid.");
  }
}

export async function createClientAction(formData: FormData) {
  const session = await requireSession();
  await assertWritable(session.user.officeId);

  const data = clientDataFromForm(formData);
  if (!data.name) throw new Error("Nama klien wajib diisi.");
  if (data.nik && !/^\d{16}$/.test(data.nik.replace(/\D/g, ""))) {
    throw new Error("NIK harus terdiri dari 16 digit.");
  }
  const archiveIds = archiveIdsFromForm(formData);
  const conflictResolutions = conflictResolutionsFromForm(formData);
  if (archiveIds.length && session.user.role !== "NOTARIS") {
    throw new Error("Hanya Notaris yang dapat menautkan arsip Klien.");
  }

  await prisma.$transaction(async (tx) => {
    const archives = archiveIds.length
      ? await tx.documentArchive.findMany({
          where: {
            id: { in: archiveIds },
            officeId: session.user.officeId,
            clientId: null,
            status: "PERLU_REVIEW",
            uploadedById: session.user.id,
          },
        })
      : [];
    if (archives.length !== archiveIds.length) {
      throw new Error("Salah satu dokumen tidak tersedia atau sudah terhubung ke Klien lain.");
    }

    const client = await tx.client.create({
      data: { ...data, officeId: session.user.officeId },
    });

    const confirmedFields: Record<string, string> = {
      name: data.name,
      nik: data.nik ?? "",
      npwp: data.npwp ?? "",
      tempatLahir: data.tempatLahir ?? "",
      tanggalLahir: data.tanggalLahir?.toISOString().slice(0, 10) ?? "",
      gender: data.gender ?? "",
      pekerjaan: data.pekerjaan ?? "",
      statusKawin: data.statusKawin ?? "",
      wargaNegara: data.wargaNegara ?? "Indonesia",
      address: data.address ?? "",
    };

    for (const archive of archives) {
      const extracted = archive.extractedJson as {
        documentType?: string;
        confidence?: number;
        fields?: Record<string, string>;
        warnings?: string[];
        ocrFields?: Record<string, string>;
      };
      const sourceFields = extracted.ocrFields ?? extracted.fields ?? {};
      for (const field of clientScanFields) {
        const incoming = normalizeClientScanValue(field, sourceFields[field] ?? "");
        const current = normalizeClientScanValue(field, confirmedFields[field] ?? "");
        if (!incoming || sameClientScanValue(incoming, current)) continue;
        const decisionKey = `${archive.id}:${field}`;
        if (conflictResolutions[decisionKey] !== current) {
          throw new Error(`Perbedaan ${field} pada dokumen ${archive.originalName} belum diputuskan.`);
        }
      }
      const claimed = await tx.documentArchive.updateMany({
        where: {
          id: archive.id,
          officeId: session.user.officeId,
          clientId: null,
          status: "PERLU_REVIEW",
          uploadedById: session.user.id,
        },
        data: {
          clientId: client.id,
          status: "DIKONFIRMASI",
        },
      });
      if (claimed.count !== 1) {
        throw new Error("Dokumen baru saja digunakan oleh proses lain. Silakan ulangi.");
      }
      await tx.documentArchive.update({
        where: { id: archive.id },
        data: {
          extractedJson: {
            documentType: extracted.documentType ?? archive.type,
            confidence: extracted.confidence ?? 0,
            ocrFields: sourceFields,
            fields: extracted.fields ?? sourceFields,
            confirmedClientFields: confirmedFields,
            reviewDecisions: Object.fromEntries(
              Object.entries(conflictResolutions).filter(([key]) => key.startsWith(`${archive.id}:`)),
            ),
            warnings: extracted.warnings ?? [],
          },
        },
      });
    }
  });

  revalidatePath("/dashboard/klien");
  redirect("/dashboard/klien");
}

export async function updateClientAction(id: string, formData: FormData) {
  const session = await requireSession();
  await assertWritable(session.user.officeId);

  const data = clientDataFromForm(formData);
  if (!data.name) throw new Error("Nama klien wajib diisi.");

  await prisma.client.update({
    where: { id, officeId: session.user.officeId },
    data,
  });

  revalidatePath("/dashboard/klien");
  redirect("/dashboard/klien");
}

export async function deleteClientAction(id: string) {
  const session = await requireSession();
  await assertWritable(session.user.officeId);

  const existing = await prisma.client.findFirst({
    where: { id, officeId: session.user.officeId },
    select: { id: true },
  });
  if (!existing) throw new Error("Klien tidak ditemukan.");
  await prisma.$transaction([
    prisma.documentArchive.updateMany({
      where: { clientId: id, officeId: session.user.officeId },
      data: { clientId: null, status: "PERLU_REVIEW" },
    }),
    prisma.client.delete({ where: { id } }),
  ]);

  revalidatePath("/dashboard/klien");
  redirect("/dashboard/klien");
}
