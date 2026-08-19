// Seed data awal: 1 kantor + akun notaris + langganan trial 30 hari
// Jalankan: npm run db:seed

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PRODUCTION_SEED !== "1") {
    throw new Error("Seed production ditolak. Set ALLOW_PRODUCTION_SEED=1 hanya untuk bootstrap yang disengaja.");
  }

  const email = process.env.SEED_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_PASSWORD;

  if (!email || !password) throw new Error("SEED_EMAIL dan SEED_PASSWORD wajib diisi secara eksplisit.");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("SEED_EMAIL tidak valid.");
  if (password.length < 16) throw new Error("SEED_PASSWORD harus minimal 16 karakter.");
  if (email === "notaris@sinotaris.local" || password === "sinotaris123") {
    throw new Error("Kredensial seed contoh/default tidak boleh digunakan.");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const periodEnd = new Date();
  periodEnd.setDate(periodEnd.getDate() + 30);

  await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { email } });
    if (existing) throw new Error(`Akun ${email} sudah ada; seed tidak dijalankan.`);

    const office = await tx.office.create({
      data: {
        name: "Kantor Notaris & PPAT Contoh",
        notarisName: "Nama Notaris Contoh",
        notarisTitle: "S.H., M.Kn.",
        wilayahKerja: "Provinsi Jawa Tengah",
      },
    });

    await tx.user.create({
      data: {
        officeId: office.id,
        name: "Notaris Contoh",
        email,
        passwordHash,
        role: "NOTARIS",
      },
    });

    await tx.subscription.create({
      data: {
        officeId: office.id,
        plan: "TRIAL",
        status: "ACTIVE",
        currentPeriodEnd: periodEnd,
      },
    });
  });

  console.log("Seed selesai.");
  console.log(`Akun bootstrap dibuat untuk ${email}. Password tidak ditampilkan.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
