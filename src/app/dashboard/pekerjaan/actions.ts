"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import { assertWritable } from "@/lib/subscription";

interface PartyInput {
  clientId: string;
  peran: string;
}

function partiesFromForm(formData: FormData): PartyInput[] {
  const raw = String(formData.get("partiesJson") ?? "[]");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Data para pihak tidak valid.");
  }

  if (!Array.isArray(parsed)) throw new Error("Data para pihak tidak valid.");

  const unique = new Map<string, PartyInput>();
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const clientId = String((item as Record<string, unknown>).clientId ?? "").trim();
    const peran = String((item as Record<string, unknown>).peran ?? "").trim();
    if (!clientId || !peran) continue;
    unique.set(`${clientId}:${peran.toLowerCase()}`, { clientId, peran });
  }
  return [...unique.values()];
}

async function validateParties(officeId: string, parties: PartyInput[]) {
  if (parties.length === 0) return;
  const clientIds = [...new Set(parties.map((party) => party.clientId))];
  const count = await prisma.client.count({
    where: { id: { in: clientIds }, officeId },
  });
  if (count !== clientIds.length) {
    throw new Error("Salah satu klien tidak ditemukan atau berasal dari kantor lain.");
  }

  const singularRoles = [
    "pemberikuasa",
    "penerimakuasa",
    "debitor",
    "debitur",
    "kreditor",
    "pasangan",
    "suamiistri",
    "saksi1",
    "saksisatu",
    "saksi2",
    "saksidua",
  ];
  const seen = new Set<string>();
  for (const party of parties) {
    const normalized = party.peran.toLowerCase().replace(/[^a-z0-9]/g, "");
    const singular = singularRoles.find((role) => normalized.includes(role));
    if (!singular) continue;
    if (seen.has(singular)) {
      throw new Error(`Peran "${party.peran}" hanya boleh dipakai oleh satu klien.`);
    }
    seen.add(singular);
  }
}

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
  const parties = partiesFromForm(formData);
  if (!data.jenis || !data.judul) throw new Error("Jenis dan judul pekerjaan wajib diisi.");
  await validateParties(session.user.officeId, parties);

  // Staf tidak boleh mengisi honorarium
  if (session.user.role !== "NOTARIS") data.honorarium = null;

  await prisma.pekerjaan.create({
    data: {
      ...data,
      officeId: session.user.officeId,
      clients: {
        create: parties.map((party) => ({ clientId: party.clientId, peran: party.peran })),
      },
    },
  });

  revalidatePath("/dashboard/pekerjaan");
  redirect("/dashboard/pekerjaan");
}

export async function updatePekerjaanAction(id: string, formData: FormData) {
  const session = await requireSession();
  await assertWritable(session.user.officeId);

  const data = pekerjaanDataFromForm(formData);
  const parties = partiesFromForm(formData);
  if (!data.jenis || !data.judul) throw new Error("Jenis dan judul pekerjaan wajib diisi.");
  await validateParties(session.user.officeId, parties);

  // Staf tidak boleh mengubah honorarium — pertahankan nilai lama
  if (session.user.role !== "NOTARIS") {
    const existing = await prisma.pekerjaan.findFirst({
      where: { id, officeId: session.user.officeId },
      select: { honorarium: true },
    });
    data.honorarium = existing?.honorarium ? Number(existing.honorarium) : null;
  }

  const existingPekerjaan = await prisma.pekerjaan.findFirst({
    where: { id, officeId: session.user.officeId },
    select: { id: true },
  });
  if (!existingPekerjaan) throw new Error("Pekerjaan tidak ditemukan.");

  await prisma.$transaction([
    prisma.pekerjaanClient.deleteMany({ where: { pekerjaanId: id } }),
    prisma.pekerjaan.update({
      where: { id },
      data: {
        ...data,
        clients: {
          create: parties.map((party) => ({ clientId: party.clientId, peran: party.peran })),
        },
      },
    }),
  ]);

  revalidatePath("/dashboard/pekerjaan");
  redirect("/dashboard/pekerjaan");
}

export async function deletePekerjaanAction(id: string) {
  const session = await requireSession();
  await assertWritable(session.user.officeId);

  const existing = await prisma.pekerjaan.findFirst({
    where: { id, officeId: session.user.officeId },
    select: { id: true },
  });
  if (!existing) throw new Error("Pekerjaan tidak ditemukan.");

  await prisma.$transaction([
    prisma.generatedDoc.updateMany({
      where: { pekerjaanId: id },
      data: { pekerjaanId: null },
    }),
    prisma.invoice.updateMany({
      where: { pekerjaanId: id, officeId: session.user.officeId },
      data: { pekerjaanId: null },
    }),
    prisma.pekerjaan.delete({ where: { id } }),
  ]);

  revalidatePath("/dashboard/pekerjaan");
  redirect("/dashboard/pekerjaan");
}
