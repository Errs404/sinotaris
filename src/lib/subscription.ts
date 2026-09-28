// Pengecekan status langganan kantor.
// Model: aplikasi jalan lokal/cloud, tapi validitas langganan dicek ke database.
// Jika langganan habis => mode read-only (data tetap bisa dilihat, tidak bisa tambah/ubah).

import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { evaluateOfflineLicensePeriod, getLicensePublicKey, verifyOfflineLicense } from "@/lib/offlineLicense";

type SubscriptionDb = PrismaClient | Prisma.TransactionClient;

export interface SubscriptionState {
  active: boolean;
  readOnly: boolean;
  plan: string;
  periodEnd: Date | null;
  graceEnd: Date | null;
  source: "OFFLINE_LICENSE" | "LEGACY_SUBSCRIPTION" | "NONE";
  licenseType: "SUBSCRIPTION" | "PERPETUAL" | null;
  licenseId: string | null;
  phase: "ACTIVE" | "GRACE" | "READ_ONLY";
}

export async function getSubscriptionState(officeId: string, db: SubscriptionDb = prisma): Promise<SubscriptionState> {
  const office = await db.office.findUnique({
    where: { id: officeId },
    select: { offlineLicensingEnabledAt: true },
  });
  const [license, installation] = await Promise.all([
    db.offlineLicense.findFirst({ where: { officeId }, orderBy: { sequence: "desc" } }),
    db.systemInstallation.findUnique({ where: { id: "singleton" }, select: { installationId: true } }),
  ]);

  if (license) {
    let verified;
    try {
      verified = verifyOfflineLicense(
        JSON.stringify({ payload: license.payload, signature: license.signature }),
        getLicensePublicKey(),
      );
    } catch {
      return {
        active: false, readOnly: true, plan: license.plan, periodEnd: license.validUntil, graceEnd: null,
        source: "OFFLINE_LICENSE", licenseType: license.type, licenseId: license.licenseId, phase: "READ_ONLY",
      };
    }
    const claims = verified.claims;
    const storedLicenseMatches = installation
      && claims.officeId === officeId
      && claims.installationId === installation.installationId
      && claims.installationId === license.installationId
      && claims.licenseId === license.licenseId
      && claims.sequence === license.sequence
      && claims.type === license.type
      && claims.plan === license.plan
      && claims.gracePeriodDays === license.gracePeriodDays
      && verified.issuedAt.getTime() === license.issuedAt.getTime()
      && (verified.validUntil?.getTime() ?? null) === (license.validUntil?.getTime() ?? null);
    if (!storedLicenseMatches) {
      return {
        active: false, readOnly: true, plan: license.plan, periodEnd: license.validUntil, graceEnd: null,
        source: "OFFLINE_LICENSE", licenseType: license.type, licenseId: license.licenseId, phase: "READ_ONLY",
      };
    }
    const period = evaluateOfflineLicensePeriod(claims.type, verified.validUntil, claims.gracePeriodDays, new Date());
    return {
      active: period.writable,
      readOnly: !period.writable,
      plan: claims.plan,
      periodEnd: verified.validUntil,
      graceEnd: period.graceEnd,
      source: "OFFLINE_LICENSE",
      licenseType: claims.type,
      licenseId: claims.licenseId,
      phase: period.phase,
    };
  }

  if (office?.offlineLicensingEnabledAt) {
    return {
      active: false, readOnly: true, plan: "NONE", periodEnd: null, graceEnd: null,
      source: "NONE", licenseType: null, licenseId: null, phase: "READ_ONLY",
    };
  }

  const sub = await db.subscription.findFirst({
    where: { officeId, status: "ACTIVE", currentPeriodEnd: { gt: new Date() } },
    orderBy: { currentPeriodEnd: "desc" },
  });

  if (!sub) {
    return {
      active: false, readOnly: true, plan: "NONE", periodEnd: null, graceEnd: null,
      source: "NONE", licenseType: null, licenseId: null, phase: "READ_ONLY",
    };
  }

  const now = new Date();
  const active = sub.status === "ACTIVE" && sub.currentPeriodEnd > now;

  return {
    active,
    readOnly: !active,
    plan: sub.plan,
    periodEnd: sub.currentPeriodEnd,
    graceEnd: null,
    source: "LEGACY_SUBSCRIPTION",
    licenseType: "SUBSCRIPTION",
    licenseId: null,
    phase: active ? "ACTIVE" : "READ_ONLY",
  };
}

/** Lempar error kalau langganan tidak aktif — dipakai di server action / API tulis. */
export async function assertWritable(officeId: string, db: SubscriptionDb = prisma): Promise<void> {
  const state = await getSubscriptionState(officeId, db);
  if (state.readOnly) {
    throw new Error(
      "Lisensi tidak aktif. Data tetap bisa dilihat (mode baca saja), tetapi tidak bisa menambah atau mengubah data. Silakan aktifkan atau perpanjang lisensi.",
    );
  }
}
