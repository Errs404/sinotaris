import { createPublicKey, verify } from "node:crypto";
import { LICENSE_PUBLIC_KEY_BASE64 } from "@/lib/licenseTrust";

const LICENSE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/;
const INSTALLATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const plans = new Set(["STARTER", "PRO", "ENTERPRISE"] as const);

export type OfflineLicenseType = "SUBSCRIPTION" | "PERPETUAL";
export type OfflineLicensePlan = "STARTER" | "PRO" | "ENTERPRISE";

export interface OfflineLicenseClaims {
  version: 1;
  licenseId: string;
  officeId: string;
  installationId: string;
  sequence: number;
  type: OfflineLicenseType;
  plan: OfflineLicensePlan;
  issuedAt: string;
  validUntil: string | null;
  gracePeriodDays: number;
}

export interface OfflineLicenseEnvelope {
  payload: string;
  signature: string;
}

export interface VerifiedOfflineLicense {
  claims: OfflineLicenseClaims;
  payload: string;
  signature: string;
  issuedAt: Date;
  validUntil: Date | null;
}

export function evaluateOfflineLicensePeriod(
  type: OfflineLicenseType,
  validUntil: Date | null,
  gracePeriodDays: number,
  now: Date,
) {
  if (type === "PERPETUAL") return { writable: true, phase: "ACTIVE" as const, graceEnd: null };
  if (!validUntil) return { writable: false, phase: "READ_ONLY" as const, graceEnd: null };
  const graceEnd = new Date(validUntil.getTime() + gracePeriodDays * 86_400_000);
  if (now < validUntil) return { writable: true, phase: "ACTIVE" as const, graceEnd };
  if (now < graceEnd) return { writable: true, phase: "GRACE" as const, graceEnd };
  return { writable: false, phase: "READ_ONLY" as const, graceEnd };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseIsoDate(value: unknown, field: string): Date {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
    throw new Error(`${field} harus berupa waktu ISO UTC.`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${field} tidak valid.`);
  return date;
}

function parseClaims(value: unknown): { claims: OfflineLicenseClaims; issuedAt: Date; validUntil: Date | null } {
  if (!isRecord(value)) throw new Error("Payload lisensi harus berupa objek JSON.");
  const expectedKeys = [
    "version", "licenseId", "officeId", "installationId", "sequence", "type",
    "plan", "issuedAt", "validUntil", "gracePeriodDays",
  ];
  const actualKeys = Object.keys(value).sort();
  if (actualKeys.join("|") !== [...expectedKeys].sort().join("|")) {
    throw new Error("Struktur payload lisensi tidak dikenali.");
  }
  if (value.version !== 1) throw new Error("Versi format lisensi tidak didukung.");
  if (typeof value.licenseId !== "string" || !LICENSE_ID_PATTERN.test(value.licenseId)) {
    throw new Error("Nomor lisensi tidak valid.");
  }
  if (typeof value.officeId !== "string" || value.officeId.length < 3 || value.officeId.length > 80) {
    throw new Error("Identitas kantor pada lisensi tidak valid.");
  }
  if (typeof value.installationId !== "string" || !INSTALLATION_ID_PATTERN.test(value.installationId)) {
    throw new Error("Identitas instalasi pada lisensi tidak valid.");
  }
  if (!Number.isSafeInteger(value.sequence) || (value.sequence as number) < 1) {
    throw new Error("Urutan lisensi tidak valid.");
  }
  if (value.type !== "SUBSCRIPTION" && value.type !== "PERPETUAL") {
    throw new Error("Jenis lisensi tidak valid.");
  }
  if (typeof value.plan !== "string" || !plans.has(value.plan as OfflineLicensePlan)) {
    throw new Error("Paket lisensi tidak valid.");
  }
  if (!Number.isInteger(value.gracePeriodDays) || (value.gracePeriodDays as number) < 0 || (value.gracePeriodDays as number) > 30) {
    throw new Error("Masa tenggang lisensi harus 0 sampai 30 hari.");
  }

  const issuedAt = parseIsoDate(value.issuedAt, "issuedAt");
  let validUntil: Date | null = null;
  if (value.type === "SUBSCRIPTION") {
    validUntil = parseIsoDate(value.validUntil, "validUntil");
    if (validUntil <= issuedAt) throw new Error("Masa berlaku lisensi tidak valid.");
  } else if (value.validUntil !== null) {
    throw new Error("Lisensi perpetual tidak boleh memiliki tanggal kedaluwarsa.");
  }

  return {
    claims: value as unknown as OfflineLicenseClaims,
    issuedAt,
    validUntil,
  };
}

export function parseLicenseEnvelope(text: string): OfflineLicenseEnvelope {
  if (Buffer.byteLength(text, "utf8") > 64 * 1024) throw new Error("File lisensi terlalu besar.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("File lisensi bukan JSON yang valid.");
  }
  if (!isRecord(parsed) || Object.keys(parsed).sort().join("|") !== "payload|signature") {
    throw new Error("Format file lisensi tidak dikenali.");
  }
  if (typeof parsed.payload !== "string" || !BASE64URL_PATTERN.test(parsed.payload) || parsed.payload.length > 16_384) {
    throw new Error("Payload lisensi tidak valid.");
  }
  if (typeof parsed.signature !== "string" || !BASE64URL_PATTERN.test(parsed.signature) || parsed.signature.length > 512) {
    throw new Error("Tanda tangan lisensi tidak valid.");
  }
  return { payload: parsed.payload, signature: parsed.signature };
}

export function verifyOfflineLicense(text: string, publicKeyBase64: string): VerifiedOfflineLicense {
  const envelope = parseLicenseEnvelope(text);
  if (!publicKeyBase64.trim()) throw new Error("Kunci publik lisensi belum dikonfigurasi.");

  let publicKey: ReturnType<typeof createPublicKey>;
  try {
    publicKey = createPublicKey({
      key: Buffer.from(publicKeyBase64, "base64"),
      format: "der",
      type: "spki",
    });
  } catch {
    throw new Error("Konfigurasi kunci publik lisensi tidak valid.");
  }
  if (publicKey.asymmetricKeyType !== "ed25519") throw new Error("Kunci publik lisensi harus menggunakan Ed25519.");

  const signature = Buffer.from(envelope.signature, "base64url");
  if (Buffer.from(envelope.payload, "base64url").toString("base64url") !== envelope.payload
    || signature.toString("base64url") !== envelope.signature) {
    throw new Error("Encoding file lisensi tidak kanonik.");
  }
  const validSignature = signature.length === 64
    && verify(null, Buffer.from(envelope.payload, "utf8"), publicKey, signature);
  if (!validSignature) throw new Error("Tanda tangan lisensi tidak sah.");

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(envelope.payload, "base64url").toString("utf8"));
  } catch {
    throw new Error("Payload lisensi tidak dapat dibaca.");
  }
  const { claims, issuedAt, validUntil } = parseClaims(decoded);
  return { claims, payload: envelope.payload, signature: envelope.signature, issuedAt, validUntil };
}

export function getLicensePublicKey(): string {
  return LICENSE_PUBLIC_KEY_BASE64;
}
