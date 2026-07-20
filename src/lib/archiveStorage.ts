import crypto from "crypto";
import fs from "fs";
import path from "path";

const archiveRoot = path.join(process.cwd(), "storage", "archives");

export const MAX_ARCHIVE_BYTES = 15 * 1024 * 1024;

export const allowedArchiveTypes: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "");
}

export function validateArchiveFile(file: File): string {
  if (!file.size || file.size > MAX_ARCHIVE_BYTES) throw new Error("Ukuran file harus antara 1 byte dan 15 MB.");
  const extension = path.extname(file.name).toLowerCase();
  const allowedExtensions = allowedArchiveTypes[file.type];
  if (!allowedExtensions?.includes(extension)) {
    throw new Error("Format file tidak didukung. Gunakan PDF, DOCX, JPG, PNG, atau WEBP.");
  }
  return extension;
}

export function validateArchiveSignature(buffer: Buffer, mimeType: string): void {
  const hex = buffer.subarray(0, 12).toString("hex").toLowerCase();
  const ascii = buffer.subarray(0, 8).toString("ascii");
  const valid =
    (mimeType === "application/pdf" && ascii.startsWith("%PDF-")) ||
    (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" && hex.startsWith("504b0304")) ||
    (mimeType === "image/jpeg" && hex.startsWith("ffd8ff")) ||
    (mimeType === "image/png" && hex.startsWith("89504e470d0a1a0a")) ||
    (mimeType === "image/webp" && ascii.startsWith("RIFF") && buffer.subarray(8, 12).toString("ascii") === "WEBP");
  if (!valid) throw new Error("Isi file tidak sesuai dengan tipe file yang dipilih.");
}

export function saveArchiveFile(officeId: string, originalName: string, mimeType: string, buffer: Buffer) {
  const office = safeSegment(officeId);
  const extension = path.extname(originalName).toLowerCase();
  const id = crypto.randomUUID();
  const storageKey = `${office}/${id}${extension}`;
  const dir = path.join(archiveRoot, office);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(archiveRoot, storageKey), buffer, { flag: "wx" });
  return {
    storageKey,
    mimeType,
    sizeBytes: buffer.length,
    checksum: crypto.createHash("sha256").update(buffer).digest("hex"),
  };
}

export function readArchiveFile(officeId: string, storageKey: string, expectedChecksum?: string): Buffer {
  const normalized = storageKey.replace(/\\/g, "/");
  const expectedPrefix = `${safeSegment(officeId)}/`;
  if (!normalized.startsWith(expectedPrefix) || normalized.includes("..")) throw new Error("Lokasi arsip tidak valid.");
  const full = path.resolve(archiveRoot, normalized);
  if (!full.startsWith(path.resolve(archiveRoot) + path.sep)) throw new Error("Lokasi arsip tidak valid.");
  const buffer = fs.readFileSync(full);
  if (expectedChecksum) {
    const actual = crypto.createHash("sha256").update(buffer).digest("hex");
    if (actual !== expectedChecksum) throw new Error("Checksum file arsip tidak sesuai.");
  }
  return buffer;
}

export function deleteArchiveFile(officeId: string, storageKey: string): void {
  const normalized = storageKey.replace(/\\/g, "/");
  if (!normalized.startsWith(`${safeSegment(officeId)}/`) || normalized.includes("..")) throw new Error("Lokasi arsip tidak valid.");
  const full = path.resolve(archiveRoot, normalized);
  if (!full.startsWith(path.resolve(archiveRoot) + path.sep)) throw new Error("Lokasi arsip tidak valid.");
  if (fs.existsSync(full)) fs.unlinkSync(full);
}

export function quarantineArchiveFile(officeId: string, storageKey: string): { originalPath: string; quarantinePath: string } {
  const normalized = storageKey.replace(/\\/g, "/");
  if (!normalized.startsWith(`${safeSegment(officeId)}/`) || normalized.includes("..")) throw new Error("Lokasi arsip tidak valid.");
  const originalPath = path.resolve(archiveRoot, normalized);
  if (!originalPath.startsWith(path.resolve(archiveRoot) + path.sep)) throw new Error("Lokasi arsip tidak valid.");
  const quarantineDir = path.join(archiveRoot, ".trash");
  fs.mkdirSync(quarantineDir, { recursive: true });
  const quarantinePath = path.join(quarantineDir, `${crypto.randomUUID()}${path.extname(originalPath)}`);
  fs.renameSync(originalPath, quarantinePath);
  return { originalPath, quarantinePath };
}

export function restoreQuarantinedArchive(paths: { originalPath: string; quarantinePath: string }): void {
  fs.mkdirSync(path.dirname(paths.originalPath), { recursive: true });
  fs.renameSync(paths.quarantinePath, paths.originalPath);
}

export function finalizeQuarantinedArchive(paths: { quarantinePath: string }): void {
  if (fs.existsSync(paths.quarantinePath)) fs.unlinkSync(paths.quarantinePath);
}
