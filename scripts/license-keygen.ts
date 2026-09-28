import { generateKeyPairSync } from "node:crypto";
import { writeFile } from "node:fs/promises";

const outputIndex = process.argv.indexOf("--private-out");
const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
if (!outputPath) throw new Error("Gunakan --private-out <path-di-luar-repository>.");
if (!process.env.LICENSE_KEY_PASSPHRASE || process.env.LICENSE_KEY_PASSPHRASE.length < 16) {
  throw new Error("LICENSE_KEY_PASSPHRASE minimal 16 karakter wajib tersedia.");
}

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicDer = publicKey.export({ format: "der", type: "spki" }).toString("base64");
const privatePem = privateKey.export({ format: "pem", type: "pkcs8", cipher: "aes-256-cbc", passphrase: process.env.LICENSE_KEY_PASSPHRASE });
await writeFile(outputPath, privatePem, { flag: "wx", mode: 0o600 });
console.log(`Private key terenkripsi disimpan di ${outputPath}.`);
console.log(`Public key untuk src/lib/licenseTrust.ts: ${publicDer}`);
