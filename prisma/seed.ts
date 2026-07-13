// Seed data awal: 1 kantor + akun notaris + langganan trial 30 hari
// Jalankan: npm run db:seed

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = process.env.SEED_EMAIL || "notaris@sinotaris.local";
  const password = process.env.SEED_PASSWORD || "sinotaris123";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`User ${email} sudah ada, seed dilewati.`);
    return;
  }

  const office = await prisma.office.create({
    data: {
      name: "Kantor Notaris & PPAT Contoh",
      notarisName: "Nama Notaris Contoh",
      notarisTitle: "S.H., M.Kn.",
      wilayahKerja: "Provinsi Jawa Tengah",
    },
  });

  await prisma.user.create({
    data: {
      officeId: office.id,
      name: "Notaris Contoh",
      email,
      passwordHash: await bcrypt.hash(password, 10),
      role: "NOTARIS",
    },
  });

  const periodEnd = new Date();
  periodEnd.setDate(periodEnd.getDate() + 30);

  await prisma.subscription.create({
    data: {
      officeId: office.id,
      plan: "TRIAL",
      status: "ACTIVE",
      currentPeriodEnd: periodEnd,
    },
  });

  console.log("Seed selesai.");
  console.log(`Login: ${email} / ${password}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
