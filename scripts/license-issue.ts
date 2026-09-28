import { createPrivateKey, randomUUID, sign } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import "dotenv/config";

type RequestFile = { version: 1; officeId: string; installationId: string; requestedSequence: number };

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requiredArg(name: string): string {
  const value = readArg(name);
  if (!value) throw new Error(`Argumen --${name} wajib diisi.`);
  return value;
}

function parseRequest(value: unknown): RequestFile {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("File request tidak valid.");
  const request = value as Partial<RequestFile>;
  if (Object.keys(request).sort().join("|") !== "installationId|officeId|requestedSequence|version") {
    throw new Error("Struktur request tidak dikenali.");
  }
  if (request.version !== 1 || typeof request.officeId !== "string" || typeof request.installationId !== "string") {
    throw new Error("Format request tidak didukung.");
  }
  if (request.officeId.length < 3 || request.officeId.length > 80
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(request.installationId)) {
    throw new Error("Identitas kantor atau instalasi pada request tidak valid.");
  }
  if (!Number.isSafeInteger(request.requestedSequence) || Number(request.requestedSequence) < 1) {
    throw new Error("Urutan request tidak valid.");
  }
  return request as RequestFile;
}

async function main() {
  const requestPath = requiredArg("request");
  const outputPath = requiredArg("output");
  const type = requiredArg("type").toUpperCase();
  const plan = (readArg("plan") ?? "PRO").toUpperCase();
  const gracePeriodDays = Number(readArg("grace-days") ?? "7");
  if (type !== "SUBSCRIPTION" && type !== "PERPETUAL") throw new Error("--type harus SUBSCRIPTION atau PERPETUAL.");
  if (!new Set(["STARTER", "PRO", "ENTERPRISE"]).has(plan)) throw new Error("--plan tidak didukung.");
  if (!Number.isInteger(gracePeriodDays) || gracePeriodDays < 0 || gracePeriodDays > 30) {
    throw new Error("--grace-days harus 0 sampai 30.");
  }
  const privateKeyPath = requiredArg("private-key");
  const passphrase = process.env.LICENSE_KEY_PASSPHRASE;
  if (!passphrase) throw new Error("LICENSE_KEY_PASSPHRASE wajib tersedia pada mesin penerbit.");

  const request = parseRequest(JSON.parse(await readFile(requestPath, "utf8")));
  const issuedAt = new Date();
  let validUntil: string | null = null;
  if (type === "SUBSCRIPTION") {
    const months = Number(requiredArg("months"));
    if (!Number.isInteger(months) || months < 1 || months > 60) throw new Error("--months harus 1 sampai 60.");
    const expiry = new Date(issuedAt);
    expiry.setUTCMonth(expiry.getUTCMonth() + months);
    validUntil = expiry.toISOString();
  }

  const claims = {
    version: 1,
    licenseId: readArg("license-id") ?? `LIC-${randomUUID()}`,
    officeId: request.officeId,
    installationId: request.installationId,
    sequence: request.requestedSequence,
    type,
    plan,
    issuedAt: issuedAt.toISOString(),
    validUntil,
    gracePeriodDays: type === "PERPETUAL" ? 0 : gracePeriodDays,
  };
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const privateKey = createPrivateKey({ key: await readFile(privateKeyPath), format: "pem", passphrase });
  if (privateKey.asymmetricKeyType !== "ed25519") throw new Error("Private key harus menggunakan Ed25519.");
  const signature = sign(null, Buffer.from(payload, "utf8"), privateKey).toString("base64url");
  await writeFile(outputPath, `${JSON.stringify({ payload, signature }, null, 2)}\n`, { flag: "wx" });
  console.log(`Lisensi ${claims.licenseId} diterbitkan ke ${basename(outputPath)}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
