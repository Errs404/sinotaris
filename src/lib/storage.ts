// Penyimpanan file template & hasil generate.
// Lokal: folder storage/ (di-gitignore karena berisi data klien).

import fs from "fs";
import path from "path";
import crypto from "crypto";

const storageRoot = path.join(process.cwd(), "storage");
const templatesDir = path.join(storageRoot, "templates");
const generatedDir = path.join(storageRoot, "generated");

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

export function saveTemplateFile(buffer: Buffer, originalName: string): string {
  ensureDir(templatesDir);
  const safeBase = originalName.replace(/[^\w.-]+/g, "-").replace(/\.docx$/i, "");
  const fileName = `${safeBase}-${crypto.randomBytes(4).toString("hex")}.docx`;
  fs.writeFileSync(path.join(templatesDir, fileName), buffer);
  return fileName;
}

export function readTemplateFile(fileName: string): Buffer {
  // Cegah path traversal — hanya nama file polos yang diterima
  const safe = path.basename(fileName);
  const fullPath = path.join(templatesDir, safe);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`File template tidak ditemukan: ${safe}`);
  }
  return fs.readFileSync(fullPath);
}

export function deleteTemplateFile(fileName: string): void {
  const fullPath = path.join(templatesDir, path.basename(fileName));
  if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
}

export function saveGeneratedFile(buffer: Buffer, fileName: string): string {
  ensureDir(generatedDir);
  const safe = path.basename(fileName);
  fs.writeFileSync(path.join(generatedDir, safe), buffer);
  return safe;
}
