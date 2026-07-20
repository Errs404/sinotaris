import mammoth from "mammoth";
import "pdf-parse/worker";
import { PDFParse } from "pdf-parse";
import { createWorker } from "tesseract.js";
import path from "path";
import PizZip from "pizzip";
import { imageSize } from "image-size";
import { pathToFileURL } from "url";

const MAX_EXTRACTED_CHARS = 1_000_000;
let ocrQueue: Promise<void> = Promise.resolve();

const pdfWorkerUrl = pathToFileURL(
  path.join(process.cwd(), "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs"),
).href;
PDFParse.setWorker(pdfWorkerUrl);

function capText(text: string): string {
  if (text.length > MAX_EXTRACTED_CHARS) throw new Error("Teks hasil ekstraksi terlalu besar (maksimal 1 juta karakter).");
  return text.trim();
}

function validateDocxStructure(buffer: Buffer): void {
  const zip = new PizZip(buffer);
  const required = ["[Content_Types].xml", "_rels/.rels", "word/document.xml"];
  for (const entry of required) if (!zip.file(entry)) throw new Error("File ZIP bukan dokumen DOCX yang valid.");
  const entries = Object.values(zip.files);
  if (entries.length > 2_000) throw new Error("DOCX memiliki terlalu banyak bagian.");
  let total = 0;
  for (const entry of entries) {
    if (entry.dir) continue;
    const name = entry.name.replace(/\\/g, "/");
    if (name.startsWith("/") || name.includes("../") || /^[a-z]:/i.test(name)) throw new Error("Struktur DOCX tidak aman.");
    const metadata = entry as unknown as {
      _data?: { uncompressedSize?: number; compressedSize?: number };
    };
    const uncompressedSize = metadata._data?.uncompressedSize;
    const compressedSize = metadata._data?.compressedSize;
    if (!Number.isFinite(uncompressedSize)) throw new Error("Ukuran bagian DOCX tidak dapat diverifikasi.");
    if (Number(uncompressedSize) > 20 * 1024 * 1024) throw new Error("Satu bagian DOCX terlalu besar.");
    if (Number(compressedSize) > 0 && Number(uncompressedSize) / Number(compressedSize) > 100) {
      throw new Error("Rasio kompresi DOCX tidak aman.");
    }
    total += Number(uncompressedSize);
    if (total > 75 * 1024 * 1024) throw new Error("Isi DOCX setelah dibuka terlalu besar (maksimal 75 MB).");
  }
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText({ first: 100 });
    if (result.total > 100) throw new Error("PDF memiliki lebih dari 100 halaman. Pisahkan dokumen sebelum diunggah.");
    return capText(result.text);
  } finally {
    await parser.destroy();
  }
}

async function extractDocx(buffer: Buffer): Promise<string> {
  validateDocxStructure(buffer);
  const result = await mammoth.extractRawText({ buffer });
  return capText(result.value);
}

async function extractImage(buffer: Buffer): Promise<string> {
  const dimensions = imageSize(buffer);
  if (!dimensions.width || !dimensions.height) throw new Error("Dimensi gambar tidak dapat dibaca.");
  if (dimensions.width * dimensions.height > 25_000_000) throw new Error("Resolusi gambar terlalu besar (maksimal 25 megapiksel).");
  const workerPromise = createWorker("ind", undefined, {
    langPath: path.join(process.cwd(), "node_modules", "@tesseract.js-data", "ind", "4.0.0"),
    workerPath: path.join(process.cwd(), "node_modules", "tesseract.js", "src", "worker-script", "node", "index.js"),
    gzip: true,
    cacheMethod: "readOnly",
  });
  let initTimer: ReturnType<typeof setTimeout> | null = null;
  const worker = await Promise.race([
    workerPromise,
    new Promise<never>((_, reject) => {
      initTimer = setTimeout(() => {
        void workerPromise.then((lateWorker) => lateWorker.terminate()).catch(() => undefined);
        reject(new Error("Mesin OCR gagal dimuat dalam 30 detik."));
      }, 30_000);
    }),
  ]).finally(() => {
    if (initTimer) clearTimeout(initTimer);
  });
  let timer: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;
  try {
    const result = await Promise.race([
      worker.recognize(buffer),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          void worker.terminate().catch(() => undefined);
          reject(new Error("OCR melebihi batas waktu 90 detik."));
        }, 90_000);
      }),
    ]);
    return capText(result.data.text);
  } finally {
    if (timer) clearTimeout(timer);
    if (!timedOut) {
      await Promise.race([
        worker.terminate().catch(() => undefined),
        new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
      ]);
    }
  }
}

function runOcrQueued(buffer: Buffer): Promise<string> {
  const result = ocrQueue.then(() => extractImage(buffer));
  ocrQueue = result.then(() => undefined, () => undefined);
  return result;
}

export async function extractArchiveText(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === "application/pdf") {
    const text = await extractPdf(buffer);
    if (!text) throw new Error("PDF tidak memiliki text layer. Untuk PDF hasil scan, unggah halaman sebagai JPG/PNG agar diproses OCR.");
    return text;
  }
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return extractDocx(buffer);
  if (mimeType.startsWith("image/")) {
    return runOcrQueued(buffer);
  }
  throw new Error("Format file tidak didukung.");
}
