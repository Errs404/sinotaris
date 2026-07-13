// Pengecekan status langganan kantor.
// Model: aplikasi jalan lokal/cloud, tapi validitas langganan dicek ke database.
// Jika langganan habis => mode read-only (data tetap bisa dilihat, tidak bisa tambah/ubah).

import { prisma } from "@/lib/prisma";

export interface SubscriptionState {
  active: boolean;
  readOnly: boolean;
  plan: string;
  periodEnd: Date | null;
}

export async function getSubscriptionState(officeId: string): Promise<SubscriptionState> {
  const sub = await prisma.subscription.findFirst({
    where: { officeId },
    orderBy: { currentPeriodEnd: "desc" },
  });

  if (!sub) {
    return { active: false, readOnly: true, plan: "NONE", periodEnd: null };
  }

  const now = new Date();
  const active = sub.status === "ACTIVE" && sub.currentPeriodEnd > now;

  return {
    active,
    readOnly: !active,
    plan: sub.plan,
    periodEnd: sub.currentPeriodEnd,
  };
}

/** Lempar error kalau langganan tidak aktif — dipakai di server action / API tulis. */
export async function assertWritable(officeId: string): Promise<void> {
  const state = await getSubscriptionState(officeId);
  if (state.readOnly) {
    throw new Error(
      "Langganan tidak aktif. Data tetap bisa dilihat (mode baca saja), tapi tidak bisa menambah atau mengubah data. Silakan perpanjang langganan.",
    );
  }
}
