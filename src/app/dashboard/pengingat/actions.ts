"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import { assertWritable } from "@/lib/subscription";

export async function createReminderAction(formData: FormData) {
  const session = await requireSession();
  await assertWritable(session.user.officeId);

  const title = String(formData.get("title") ?? "").trim();
  const dueDateRaw = String(formData.get("dueDate") ?? "").trim();
  const typeRaw = String(formData.get("type") ?? "LAINNYA");
  const validTypes = ["LAPOR_WASIAT", "LAPOR_BULANAN", "PAJAK", "LAINNYA"];

  if (!title || !dueDateRaw) throw new Error("Judul dan tanggal wajib diisi.");

  await prisma.reminder.create({
    data: {
      officeId: session.user.officeId,
      title,
      dueDate: new Date(dueDateRaw),
      type: (validTypes.includes(typeRaw) ? typeRaw : "LAINNYA") as
        | "LAPOR_WASIAT"
        | "LAPOR_BULANAN"
        | "PAJAK"
        | "LAINNYA",
    },
  });

  revalidatePath("/dashboard/pengingat");
}

export async function toggleReminderAction(id: string) {
  const session = await requireSession();
  await assertWritable(session.user.officeId);

  const reminder = await prisma.reminder.findFirst({
    where: { id, officeId: session.user.officeId },
  });
  if (!reminder) return;

  await prisma.reminder.update({
    where: { id },
    data: { done: !reminder.done },
  });

  revalidatePath("/dashboard/pengingat");
}

export async function deleteReminderAction(id: string) {
  const session = await requireSession();
  await assertWritable(session.user.officeId);

  await prisma.reminder.delete({
    where: { id, officeId: session.user.officeId },
  });

  revalidatePath("/dashboard/pengingat");
}
