"use server";

import { revalidatePath } from "next/cache";
import { requireNotaris } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function updateOfficeAction(formData: FormData) {
  const session = await requireNotaris();

  const str = (key: string) => {
    const value = String(formData.get(key) ?? "").trim();
    return value || null;
  };

  const name = String(formData.get("name") ?? "").trim();
  const notarisName = String(formData.get("notarisName") ?? "").trim();
  if (!name || !notarisName) throw new Error("Nama kantor dan nama notaris wajib diisi.");

  await prisma.office.update({
    where: { id: session.user.officeId },
    data: {
      name,
      notarisName,
      notarisTitle: str("notarisTitle"),
      address: str("address"),
      phone: str("phone"),
      wilayahKerja: str("wilayahKerja"),
      skNotarisNo: str("skNotarisNo"),
      skNotarisDate: str("skNotarisDate"),
    },
  });

  revalidatePath("/dashboard/pengaturan");
}
