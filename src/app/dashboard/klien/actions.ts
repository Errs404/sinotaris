"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import { assertWritable } from "@/lib/subscription";

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

export async function createClientAction(formData: FormData) {
  const session = await requireSession();
  await assertWritable(session.user.officeId);

  const data = clientDataFromForm(formData);
  if (!data.name) throw new Error("Nama klien wajib diisi.");

  await prisma.client.create({
    data: { ...data, officeId: session.user.officeId },
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

  await prisma.client.delete({
    where: { id, officeId: session.user.officeId },
  });

  revalidatePath("/dashboard/klien");
  redirect("/dashboard/klien");
}
