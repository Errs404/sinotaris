-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('NOTARIS', 'STAF');

-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('TRIAL', 'STARTER', 'PRO', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'EXPIRED', 'CANCELED');

-- CreateEnum
CREATE TYPE "ClientType" AS ENUM ('PERORANGAN', 'BADAN_HUKUM');

-- CreateEnum
CREATE TYPE "PekerjaanKind" AS ENUM ('NOTARIS', 'PPAT');

-- CreateEnum
CREATE TYPE "PekerjaanStatus" AS ENUM ('MASUK', 'PROSES', 'TANDA_TANGAN', 'SELESAI', 'DIBATALKAN');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'TERKIRIM', 'LUNAS', 'DIBATALKAN');

-- CreateEnum
CREATE TYPE "ReminderType" AS ENUM ('LAPOR_WASIAT', 'LAPOR_BULANAN', 'PAJAK', 'LAINNYA');

-- CreateTable
CREATE TABLE "Office" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notarisName" TEXT NOT NULL,
    "notarisTitle" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "wilayahKerja" TEXT,
    "skNotarisNo" TEXT,
    "skNotarisDate" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Office_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'STAF',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL DEFAULT 'TRIAL',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "type" "ClientType" NOT NULL DEFAULT 'PERORANGAN',
    "name" TEXT NOT NULL,
    "nik" TEXT,
    "npwp" TEXT,
    "tempatLahir" TEXT,
    "tanggalLahir" TIMESTAMP(3),
    "gender" TEXT,
    "pekerjaan" TEXT,
    "statusKawin" TEXT,
    "wargaNegara" TEXT DEFAULT 'Indonesia',
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pekerjaan" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "kind" "PekerjaanKind" NOT NULL,
    "jenis" TEXT NOT NULL,
    "nomorAkta" TEXT,
    "tanggalAkta" TIMESTAMP(3),
    "judul" TEXT NOT NULL,
    "status" "PekerjaanStatus" NOT NULL DEFAULT 'MASUK',
    "keterangan" TEXT,
    "bentukHukum" TEXT,
    "pihakAlih" TEXT,
    "pihakTerima" TEXT,
    "luasTanah" DECIMAL(12,2),
    "luasBangunan" DECIMAL(12,2),
    "hargaTransaksi" DECIMAL(18,2),
    "nop" TEXT,
    "bphtb" DECIMAL(18,2),
    "pphFinal" DECIMAL(18,2),
    "sspTanggal" TIMESTAMP(3),
    "ssbTanggal" TIMESTAMP(3),
    "honorarium" DECIMAL(18,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pekerjaan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PekerjaanClient" (
    "id" TEXT NOT NULL,
    "pekerjaanId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "peran" TEXT NOT NULL,

    CONSTRAINT "PekerjaanClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "pekerjaanId" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "desc" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "amount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "type" "ReminderType" NOT NULL DEFAULT 'LAINNYA',
    "title" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocTemplate" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fieldsJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedDoc" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "pekerjaanId" TEXT,
    "fileName" TEXT NOT NULL,
    "dataJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedDoc_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Subscription_officeId_status_idx" ON "Subscription"("officeId", "status");

-- CreateIndex
CREATE INDEX "Client_officeId_name_idx" ON "Client"("officeId", "name");

-- CreateIndex
CREATE INDEX "Pekerjaan_officeId_kind_status_idx" ON "Pekerjaan"("officeId", "kind", "status");

-- CreateIndex
CREATE INDEX "Pekerjaan_officeId_tanggalAkta_idx" ON "Pekerjaan"("officeId", "tanggalAkta");

-- CreateIndex
CREATE UNIQUE INDEX "PekerjaanClient_pekerjaanId_clientId_peran_key" ON "PekerjaanClient"("pekerjaanId", "clientId", "peran");

-- CreateIndex
CREATE INDEX "Invoice_officeId_status_idx" ON "Invoice"("officeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_officeId_number_key" ON "Invoice"("officeId", "number");

-- CreateIndex
CREATE INDEX "Reminder_officeId_done_dueDate_idx" ON "Reminder"("officeId", "done", "dueDate");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pekerjaan" ADD CONSTRAINT "Pekerjaan_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PekerjaanClient" ADD CONSTRAINT "PekerjaanClient_pekerjaanId_fkey" FOREIGN KEY ("pekerjaanId") REFERENCES "Pekerjaan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PekerjaanClient" ADD CONSTRAINT "PekerjaanClient_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_pekerjaanId_fkey" FOREIGN KEY ("pekerjaanId") REFERENCES "Pekerjaan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocTemplate" ADD CONSTRAINT "DocTemplate_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedDoc" ADD CONSTRAINT "GeneratedDoc_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedDoc" ADD CONSTRAINT "GeneratedDoc_pekerjaanId_fkey" FOREIGN KEY ("pekerjaanId") REFERENCES "Pekerjaan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
