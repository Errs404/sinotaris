import { Prisma } from "@/generated/prisma/client";

export const MAX_RUPIAH = "9999999999999999";
const CANONICAL = /^(0|[1-9]\d{0,15})$/;
const GROUPED = /^(0|[1-9]\d{0,2})(?:\.\d{3})+$/;

export type RupiahInput = Prisma.Decimal | string;

export function parseRupiah(value: string): Prisma.Decimal {
  const raw = value.trim();
  const canonical = CANONICAL.test(raw)
    ? raw
    : GROUPED.test(raw) ? raw.replaceAll(".", "") : null;
  if (!canonical || canonical.length > 16 || (canonical.length === 16 && canonical > MAX_RUPIAH)) {
    throw new Error("Nominal harus Rupiah bulat 0 sampai 9.999.999.999.999.999 tanpa desimal.");
  }
  return new Prisma.Decimal(canonical);
}

export function sumRupiah(values: readonly RupiahInput[]): Prisma.Decimal {
  return values.reduce<Prisma.Decimal>((total, value) => total.plus(value), new Prisma.Decimal(0));
}

export function multiplyRupiah(value: RupiahInput, quantity: number): Prisma.Decimal {
  if (!Number.isSafeInteger(quantity)) throw new Error("Kuantitas harus bilangan bulat.");
  return new Prisma.Decimal(value).times(quantity);
}

export function serializeRupiah(value: RupiahInput): string {
  const amount = new Prisma.Decimal(value);
  if (!amount.isInteger() || amount.isNegative() || amount.greaterThan(MAX_RUPIAH)) {
    throw new Error("Nominal Rupiah tersimpan tidak valid.");
  }
  return amount.toFixed(0);
}

export function formatRupiah(value: RupiahInput): string {
  const digits = serializeRupiah(value);
  return `Rp${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}
