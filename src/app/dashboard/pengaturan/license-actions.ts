"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/auth";
import { createAuditLog } from "@/lib/audit";
import { requireCurrentNotaris } from "@/lib/currentActor";
import { getOrCreateInstallation } from "@/lib/installation";
import { getLicensePublicKey, verifyOfflineLicense } from "@/lib/offlineLicense";
import { prisma } from "@/lib/prisma";

const MAX_LICENSE_BYTES = 64 * 1024;

export async function importOfflineLicenseAction(formData: FormData) {
  const session = await requireSession();
  const actor = await requireCurrentNotaris(session.user.id);
  const file = formData.get("license");
  if (!(file instanceof File) || file.size === 0) throw new Error("Pilih file lisensi .slic.");
  if (file.size > MAX_LICENSE_BYTES) throw new Error("File lisensi terlalu besar.");
  if (!file.name.toLowerCase().endsWith(".slic") && file.type !== "application/json") {
    throw new Error("File lisensi harus berformat .slic.");
  }

  const verified = verifyOfflineLicense(await file.text(), getLicensePublicKey());
  const now = new Date();
  if (verified.issuedAt.getTime() > now.getTime() + 24 * 60 * 60 * 1000) {
    throw new Error("Tanggal penerbitan lisensi berada terlalu jauh di masa depan.");
  }
  if (verified.validUntil) {
    const graceEnd = verified.validUntil.getTime() + verified.claims.gracePeriodDays * 86_400_000;
    if (graceEnd <= now.getTime()) throw new Error("Lisensi ini sudah melewati masa berlaku dan masa tenggang.");
  }
  if (verified.claims.officeId !== actor.officeId) throw new Error("Lisensi diterbitkan untuk kantor lain.");

  await prisma.$transaction(async (tx) => {
    const current = await requireCurrentNotaris(session.user.id, tx);
    if (current.officeId !== actor.officeId) throw new Error("Kantor pengguna berubah. Silakan masuk kembali.");
    await tx.$queryRaw`SELECT "id" FROM "Office" WHERE "id" = ${current.officeId} FOR UPDATE`;
    const installation = await getOrCreateInstallation(tx);
    if (verified.claims.installationId !== installation.installationId) {
      throw new Error("Lisensi diterbitkan untuk instalasi Sinotaris lain.");
    }
    const [latest, sameId] = await Promise.all([
      tx.offlineLicense.findFirst({
      where: { officeId: current.officeId },
      orderBy: { sequence: "desc" },
      select: { sequence: true, licenseId: true, payload: true, signature: true },
      }),
      tx.offlineLicense.findUnique({
        where: { licenseId: verified.claims.licenseId },
        select: { officeId: true, sequence: true, payload: true, signature: true },
      }),
    ]);
    if (sameId) {
      const exactReimport = sameId.officeId === current.officeId
        && sameId.sequence === verified.claims.sequence
        && sameId.payload === verified.payload
        && sameId.signature === verified.signature;
      if (exactReimport) return;
      throw new Error("Nomor lisensi sudah pernah digunakan dengan isi yang berbeda.");
    }
    if (latest && verified.claims.sequence <= latest.sequence) {
      throw new Error("Urutan lisensi lebih lama dari lisensi yang sudah pernah diaktifkan.");
    }
    if (latest) {
      const previous = verifyOfflineLicense(
        JSON.stringify({ payload: latest.payload, signature: latest.signature }),
        getLicensePublicKey(),
      );
      const planRank = { STARTER: 1, PRO: 2, ENTERPRISE: 3 } as const;
      if (previous.claims.type === "PERPETUAL" && verified.claims.type !== "PERPETUAL") {
        throw new Error("Lisensi bayar putus tidak dapat diganti dengan lisensi sewa.");
      }
      if (planRank[verified.claims.plan] < planRank[previous.claims.plan]) {
        throw new Error("Paket lisensi baru tidak boleh lebih rendah dari paket yang aktif.");
      }
    }

    const created = await tx.offlineLicense.create({
      data: {
        officeId: current.officeId,
        installationId: installation.installationId,
        licenseId: verified.claims.licenseId,
        sequence: verified.claims.sequence,
        type: verified.claims.type,
        plan: verified.claims.plan,
        issuedAt: verified.issuedAt,
        validUntil: verified.validUntil,
        gracePeriodDays: verified.claims.gracePeriodDays,
        payload: verified.payload,
        signature: verified.signature,
        importedById: current.id,
      },
    });
    await tx.office.update({
      where: { id: current.officeId },
      data: { offlineLicensingEnabledAt: { set: now } },
    });
    await createAuditLog(tx, {
      officeId: current.officeId,
      actorId: current.id,
      action: "LICENSE_IMPORT",
      targetType: "OFFLINE_LICENSE",
      targetId: created.id,
      metadata: {
        licenseId: created.licenseId,
        sequence: created.sequence,
        type: created.type,
        plan: created.plan,
        validUntil: created.validUntil?.toISOString() ?? null,
        replacedLicenseId: latest?.licenseId ?? null,
      },
    });
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/pengaturan");
}
