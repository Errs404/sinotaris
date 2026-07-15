"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import { assertWritable } from "@/lib/subscription";

function pekerjaanDataFromForm(formData: FormData) {
  const str = (key: string) => {
    const value = String(formData.get(key) ?? "").trim();
    return value || null;
  };
  const num = (key: string) => {
    const value = String(formData.get(key) ?? "").replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".");
    const parsed = Number(value);
    return value && Number.isFinite(parsed) ? parsed : null;
  };
  const date = (key: string) => {
    const value = str(key);
    return value ? new Date(value) : null;
  };

  const statusRaw = str("status");
  const validStatus = ["MASUK", "PROSES", "TANDA_TANGAN", "SELESAI", "DIBATALKAN"];

  return {
    kind: (str("kind") === "PPAT" ? "PPAT" : "NOTARIS") as "NOTARIS" | "PPAT",
    jenis: String(formData.get("jenis") ?? "").trim(),
    judul: String(formData.get("judul") ?? "").trim(),
    nomorAkta: str("nomorAkta"),
    tanggalAkta: date("tanggalAkta"),
    status: (validStatus.includes(statusRaw ?? "") ? statusRaw : "MASUK") as
      | "MASUK"
      | "PROSES"
      | "TANDA_TANGAN"
      | "SELESAI"
      | "DIBATALKAN",
    keterangan: str("keterangan"),
    bentukHukum: str("bentukHukum"),
    pihakAlih: str("pihakAlih"),
    pihakTerima: str("pihakTerima"),
    luasTanah: num("luasTanah"),
    luasBangunan: num("luasBangunan"),
    hargaTransaksi: num("hargaTransaksi"),
    nop: str("nop"),
    bphtb: num("bphtb"),
    pphFinal: num("pphFinal"),
    honorarium: num("honorarium"),
  };
}

export async function createPekerjaanAction(formData: FormData) {
  const session = await requireSession();
  await assertWritable(session.user.officeId);

  const data = pekerjaanDataFromForm(formData);
  if (!data.jenis || !data.judul) throw new Error("Jenis dan judul pekerjaan wajib diisi.");

  // Staf tidak boleh mengisi honorarium
  if (session.user.role !== "NOTARIS") data.honorarium = null;

  await prisma.pekerjaan.create({
    data: { ...data, officeId: session.user.officeId },
  });

  revalidatePath("/dashboard/pekerjaan");
  redirect("/dashboard/pekerjaan");
}

export async function updatePekerjaanAction(id: string, formData: FormData) {
  const session = await requireSession();
  await assertWritable(session.user.officeId);

  const data = pekerjaanDataFromForm(formData);
  if (!data.jenis || !data.judul) throw new Error("Jenis dan judul pekerjaan wajib diisi.");

  // Staf tidak boleh mengubah honorarium — pertahankan nilai lama
  if (session.user.role !== "NOTARIS") {
    const existing = await prisma.pekerjaan.findFirst({
      where: { id, officeId: session.user.officeId },
      select: { honorarium: true },
    });
    data.honorarium = existing?.honorarium ? Number(existing.honorarium) : null;
  }

  await prisma.pekerjaan.update({
    where: { id, officeId: session.user.officeId },
    data,
  });

  revalidatePath("/dashboard/pekerjaan");
  redirect("/dashboard/pekerjaan");
}

export async function deletePekerjaanAction(id: string) {
  const session = await requireSession();
  await assertWritable(session.user.officeId);

  await prisma.pekerjaan.delete({
    where: { id, officeId: session.user.officeId },
  });

  revalidatePath("/dashboard/pekerjaan");
  redirect("/dashboard/pekerjaan");
}
