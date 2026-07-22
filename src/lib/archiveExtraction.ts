import mammoth from "mammoth";
import "pdf-parse/worker";
import { PDFParse } from "pdf-parse";
import { createWorker } from "tesseract.js";
import path from "path";
import PizZip from "pizzip";
import { imageSize } from "image-size";
import { pathToFileURL } from "url";
import { createCanvas, loadImage } from "@napi-rs/canvas";

const MAX_EXTRACTED_CHARS = 1_000_000;
const MAX_IMAGE_PIXELS = 25_000_000;
const MAX_PDF_RENDER_PIXELS = 16_000_000;
const PDF_OCR_TOTAL_MS = 180_000;
let ocrQueue: Promise<void> = Promise.resolve();

const pdfWorkerUrl = pathToFileURL(
  path.join(process.cwd(), "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs"),
).href;
PDFParse.setWorker(pdfWorkerUrl);

function capText(text: string): string {
  if (text.length > MAX_EXTRACTED_CHARS) throw new Error("Teks hasil ekstraksi terlalu besar (maksimal 1 juta karakter).");
  return text.trim();
}

function remainingTime(deadline: number): number {
  return Math.max(0, deadline - Date.now());
}

async function withinDeadline<T>(promise: Promise<T>, deadline: number, message: string): Promise<T> {
  const timeout = remainingTime(deadline);
  if (timeout <= 0) throw new Error(message);
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeout);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function assertPixelLimit(width: number, height: number, limit: number, message: string): void {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width * height > limit) {
    throw new Error(message);
  }
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

function hasMeaningfulPdfText(text: string): boolean {
  const withoutMarkers = text.replace(/--\s*\d+\s+of\s+\d+\s*--/gi, "");
  const alphaNumeric = withoutMarkers.replace(/[^\p{L}\p{N}]/gu, "");
  return alphaNumeric.length >= 40 && withoutMarkers.split(/\r?\n/).filter((line) => line.trim()).length >= 3;
}

function documentStructureScore(text: string): number {
  const upper = text.toUpperCase();
  const labels = [
    "KARTU", "KELUARGA", "NAMA", "NIK", "LAHIR", "KELAMIN", "AGAMA", "PENDIDIKAN",
    "PEKERJAAN", "PERKAWINAN", "HUBUNGAN", "KEWARGANEGARAAN", "ALAMAT", "KEPALA",
    "NPWP", "SERTIPIKAT", "SURAT UKUR", "NIB", "AKTA", "NOMOR",
  ];
  const labelScore = labels.filter((label) => upper.includes(label)).length * 10;
  const digitScore = (upper.replace(/\D/g, "").match(/\d{15,16}/g)?.length ?? 0) * 4;
  return labelScore + digitScore + Math.min(20, Math.floor(text.length / 100));
}

async function rotatePng(buffer: Buffer, degrees: 90 | 270): Promise<Buffer> {
  const dimensions = imageSize(buffer);
  assertPixelLimit(dimensions.width ?? 0, dimensions.height ?? 0, MAX_IMAGE_PIXELS, "Resolusi halaman terlalu besar untuk diputar.");
  const image = await loadImage(buffer);
  const canvas = createCanvas(image.height, image.width);
  const context = canvas.getContext("2d");
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((degrees * Math.PI) / 180);
  context.drawImage(image, -image.width / 2, -image.height / 2);
  return canvas.toBuffer("image/png");
}

async function extractBestOrientedPage(buffer: Buffer, width: number, height: number, deadline: number): Promise<string> {
  const rotations: Array<0 | 90 | 270> = height > width * 1.2 ? [90, 0, 270] : [0, 90, 270];
  let best = "";
  let bestScore = -1;
  for (const rotation of rotations) {
    const image = rotation === 0 ? buffer : await rotatePng(buffer, rotation);
    const text = await runOcrQueued(image, deadline);
    const score = documentStructureScore(text);
    if (score > bestScore) {
      best = text;
      bestScore = score;
    }
    if (bestScore >= 60) break;
  }
  return best;
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const deadline = Date.now() + PDF_OCR_TOTAL_MS;
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await withinDeadline(
      parser.getText({ first: 100 }),
      deadline,
      "Pembacaan PDF melebihi batas waktu 3 menit.",
    );
    if (result.total > 100) throw new Error("PDF memiliki lebih dari 100 halaman. Pisahkan dokumen sebelum diunggah.");
    if (hasMeaningfulPdfText(result.text)) return capText(result.text);
    if (result.total > 3) {
      throw new Error("PDF scan maksimal 3 halaman. Pisahkan dokumen atau unggah halaman yang diperlukan saja.");
    }

    const info = await withinDeadline(
      parser.getInfo({ first: result.total }),
      deadline,
      "Pemeriksaan dimensi PDF melebihi batas waktu 3 menit.",
    );
    const desiredWidth = 2600;
    for (const page of info.pages) {
      const projectedHeight = desiredWidth * (page.height / page.width);
      assertPixelLimit(desiredWidth, projectedHeight, MAX_PDF_RENDER_PIXELS, "Dimensi halaman PDF terlalu ekstrem untuk diproses OCR.");
    }

    const pageTexts: string[] = [];
    for (let pageNumber = 1; pageNumber <= result.total; pageNumber++) {
      const screenshot = await withinDeadline(
        parser.getScreenshot({
          desiredWidth,
          partial: [pageNumber],
          imageBuffer: true,
          imageDataUrl: false,
        }),
        deadline,
        "Render halaman PDF melebihi batas waktu 3 menit.",
      );
      const page = screenshot.pages[0];
      if (!page?.data) throw new Error(`Halaman PDF ${pageNumber} gagal dirender.`);
      assertPixelLimit(page.width, page.height, MAX_PDF_RENDER_PIXELS, "Hasil render halaman PDF terlalu besar.");
      pageTexts.push(await extractBestOrientedPage(Buffer.from(page.data), page.width, page.height, deadline));
    }
    return capText(pageTexts.join("\n\n"));
  } finally {
    await Promise.race([
      parser.destroy().catch(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
    ]);
  }
}

async function extractDocx(buffer: Buffer): Promise<string> {
  validateDocxStructure(buffer);
  const result = await mammoth.extractRawText({ buffer });
  return capText(result.value);
}

async function extractImage(buffer: Buffer, deadline = Date.now() + 120_000): Promise<string> {
  if (remainingTime(deadline) <= 0) throw new Error("Batas waktu pemrosesan dokumen telah habis.");
  const dimensions = imageSize(buffer);
  if (!dimensions.width || !dimensions.height) throw new Error("Dimensi gambar tidak dapat dibaca.");
  assertPixelLimit(dimensions.width, dimensions.height, MAX_IMAGE_PIXELS, "Resolusi gambar terlalu besar (maksimal 25 megapiksel).");
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
      const initTimeout = Math.min(30_000, remainingTime(deadline));
      if (initTimeout <= 0) {
        reject(new Error("Batas waktu pemrosesan dokumen telah habis."));
        return;
      }
      initTimer = setTimeout(() => {
        void workerPromise.then((lateWorker) => lateWorker.terminate()).catch(() => undefined);
        reject(new Error("Mesin OCR gagal dimuat dalam 30 detik."));
      }, initTimeout);
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
        const recognitionTimeout = Math.min(90_000, remainingTime(deadline));
        if (recognitionTimeout <= 0) {
          reject(new Error("Batas waktu pemrosesan dokumen telah habis."));
          return;
        }
        timer = setTimeout(() => {
          timedOut = true;
          void worker.terminate().catch(() => undefined);
          reject(new Error("OCR melebihi batas waktu 90 detik."));
        }, recognitionTimeout);
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

function runOcrQueued(buffer: Buffer, deadline = Date.now() + 120_000): Promise<string> {
  const result = ocrQueue.then(() => extractImage(buffer, deadline));
  ocrQueue = result.then(() => undefined, () => undefined);
  return result;
}

export async function extractArchiveText(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === "application/pdf") {
    const text = await extractPdf(buffer);
    if (!text) throw new Error("Tidak ada teks yang berhasil dibaca dari PDF, termasuk setelah fallback OCR.");
    return text;
  }
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return extractDocx(buffer);
  if (mimeType.startsWith("image/")) {
    return runOcrQueued(buffer);
  }
  throw new Error("Format file tidak didukung.");
}
