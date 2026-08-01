import mammoth from "mammoth";
import "pdf-parse/worker";
import { PDFParse } from "pdf-parse";
import { createWorker, PSM, type Worker } from "tesseract.js";
import path from "path";
import PizZip from "pizzip";
import { imageSize } from "image-size";
import { pathToFileURL } from "url";
import { createCanvas, loadImage } from "@napi-rs/canvas";

const MAX_EXTRACTED_CHARS = 100_000;
const MAX_IMAGE_SOURCE_PIXELS = 25_000_000;
const MAX_IMAGE_OCR_PIXELS = 10_000_000;
const MAX_PDF_OCR_PIXELS = 8_000_000;
const IMAGE_OCR_TOTAL_MS = 120_000;
const PDF_OCR_TOTAL_MS = 180_000;
const OCR_EARLY_STOP_SCORE = 90;
const OCR_ENHANCEMENT_RESERVE_MS = 30_000;
const OCR_TARGET_WIDTH = 2_000;
const PDF_RENDER_WIDTH = 2_400;
const OCR_QUEUE_WAIT_MS = 15_000;

export type Rotation = 0 | 90 | 180 | 270;
export const __testOcrEarlyStopScore = OCR_EARLY_STOP_SCORE;

const pdfWorkerUrl = pathToFileURL(
  path.join(process.cwd(), "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs"),
).href;
PDFParse.setWorker(pdfWorkerUrl);

function capText(text: string): string {
  if (text.length > MAX_EXTRACTED_CHARS) throw new Error("Teks hasil ekstraksi terlalu besar (maksimal 100 ribu karakter).");
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

async function withinTimeout<T>(promise: Promise<T>, timeout: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | number | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), timeout);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function assertDeadline(deadline: number): void {
  if (remainingTime(deadline) <= 0) throw new Error("Batas waktu pemrosesan dokumen telah habis.");
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

const LABEL_ALIASES: Array<[RegExp, string]> = [
  [/\bN(?:1|I|L)K\b/gi, "NIK"],
  [/\bNARNA\b/gi, "NAMA"],
  [/\bALARNAT\b/gi, "ALAMAT"],
  [/\bKECARNATAN\b/gi, "KECAMATAN"],
  [/\bPEKERIAAN\b/gi, "PEKERJAAN"],
];

const STRUCTURED_LABELS = [
  "KARTU", "KELUARGA", "NAMA", "NIK", "LAHIR", "KELAMIN", "AGAMA", "PENDIDIKAN",
  "PEKERJAAN", "PERKAWINAN", "HUBUNGAN", "KEWARGANEGARAAN", "ALAMAT", "KECAMATAN", "KEPALA",
  "NPWP", "SERTIPIKAT", "SURAT UKUR", "NIB", "AKTA", "NOMOR",
];

function normalizeNoisyLabels(text: string): string {
  return LABEL_ALIASES.reduce((normalized, [pattern, replacement]) => normalized.replace(pattern, replacement), text).toUpperCase();
}

function normalizedIdentifiers(text: string): string[] {
  const upper = text.toUpperCase();
  const matches = upper.match(/(?<![A-Z0-9])(?:[0-9OILSBZG][\s.,:;|/_-]*){15,17}(?![A-Z0-9])/g) ?? [];
  return [...new Set(matches
    .map((candidate) => candidate
      .replace(/O/g, "0")
      .replace(/[IL]/g, "1")
      .replace(/S/g, "5")
      .replace(/B/g, "8")
      .replace(/Z/g, "2")
      .replace(/G/g, "6")
      .replace(/\D/g, ""))
    .filter((identifier) => identifier.length === 15 || identifier.length === 16))];
}

export function __testDocumentStructureScore(text: string): number {
  const normalized = normalizeNoisyLabels(text);
  const labelScore = STRUCTURED_LABELS.filter((label) => {
    const pattern = label.replace(" ", "\\s+");
    return new RegExp(`(?:^|\\n)\\s*${pattern}\\b(?:\\s*[:;/.-]|\\s*$)`, "m").test(normalized);
  }).length * 10;
  const identifierScore = normalizedIdentifiers(text).reduce((score, identifier) => score + (identifier.length === 16 ? 40 : 30), 0);
  return labelScore + identifierScore + Math.min(10, Math.floor(text.length / 200));
}

export function __testRotationOrder(width: number, height: number): Rotation[] {
  return height > width * 1.2 ? [0, 90, 270, 180] : [0, 180, 90, 270];
}

export function __testBoundedTargetDimensions(
  width: number,
  height: number,
  maxPixels: number,
  targetWidth = OCR_TARGET_WIDTH,
): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || maxPixels <= 0) {
    throw new Error("Dimensi gambar tidak valid.");
  }
  const scale = Math.min(targetWidth / width, Math.sqrt(maxPixels / (width * height)));
  let resizedWidth = Math.max(1, Math.round(width * scale));
  let resizedHeight = Math.max(1, Math.round(height * scale));
  while (resizedWidth * resizedHeight > maxPixels) {
    if (resizedWidth >= resizedHeight) resizedWidth -= 1;
    else resizedHeight -= 1;
  }
  return { width: resizedWidth, height: resizedHeight };
}

function hasMeaningfulPdfText(text: string, pageCount: number): boolean {
  const withoutMarkers = text.replace(/--\s*\d+\s+of\s+\d+\s*--/gi, "");
  const alphaNumeric = withoutMarkers.replace(/[^\p{L}\p{N}]/gu, "");
  const ordinarilyMeaningful = alphaNumeric.length >= 40
    && withoutMarkers.split(/\r?\n/).filter((line) => line.trim()).length >= 3;
  if (!ordinarilyMeaningful || pageCount > 3) return ordinarilyMeaningful;
  const normalized = normalizeNoisyLabels(withoutMarkers);
  const identitySignals = ["NAMA", "ALAMAT", "KECAMATAN", "LAHIR", "KELAMIN", "PEKERJAAN", "KEWARGANEGARAAN"]
    .filter((label) => new RegExp(`(?:^|\\n)\\s*${label}\\b(?:\\s*[:;/.-]|\\s*$)`, "m").test(normalized)).length;
  const identityLike = /\b(?:NIK|NPWP|KARTU\s+KELUARGA|BERLAKU\s+HINGGA|TEMPAT\s*\/\s*TGL)\b/.test(normalized)
    || identitySignals >= 4;
  return !identityLike || normalizedIdentifiers(withoutMarkers).length > 0;
}

async function resizeForOcr(
  buffer: Buffer,
  maxPixels: number,
  deadline: number,
): Promise<{ buffer: Buffer; width: number; height: number }> {
  assertDeadline(deadline);
  const dimensions = imageSize(buffer);
  const width = dimensions.width ?? 0;
  const height = dimensions.height ?? 0;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("Dimensi gambar tidak valid.");
  }
  const target = __testBoundedTargetDimensions(width, height, maxPixels);
  if (target.width === width && target.height === height) return { buffer, width, height };
  assertDeadline(deadline);
  const image = await loadImage(buffer);
  const canvas = createCanvas(target.width, target.height);
  canvas.getContext("2d").drawImage(image, 0, 0, target.width, target.height);
  return { buffer: canvas.toBuffer("image/png"), ...target };
}

async function rotatePng(buffer: Buffer, degrees: Rotation, deadline: number): Promise<Buffer> {
  assertDeadline(deadline);
  if (degrees === 0) return buffer;
  const dimensions = imageSize(buffer);
  assertPixelLimit(dimensions.width ?? 0, dimensions.height ?? 0, MAX_IMAGE_OCR_PIXELS, "Resolusi halaman terlalu besar untuk diputar.");
  assertDeadline(deadline);
  const image = await loadImage(buffer);
  const swapsAxes = degrees === 90 || degrees === 270;
  const canvas = createCanvas(swapsAxes ? image.height : image.width, swapsAxes ? image.width : image.height);
  const context = canvas.getContext("2d");
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((degrees * Math.PI) / 180);
  context.drawImage(image, -image.width / 2, -image.height / 2);
  return canvas.toBuffer("image/png");
}

async function enhanceIdentityDocument(buffer: Buffer, deadline: number): Promise<Buffer> {
  assertDeadline(deadline);
  const dimensions = imageSize(buffer);
  assertPixelLimit(dimensions.width ?? 0, dimensions.height ?? 0, MAX_IMAGE_OCR_PIXELS, "Resolusi halaman terlalu besar untuk ditingkatkan.");
  assertDeadline(deadline);
  const image = await loadImage(buffer);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  for (let index = 0; index < pixels.length; index += 4) {
    const gray = 0.299 * pixels[index] + 0.587 * pixels[index + 1] + 0.114 * pixels[index + 2];
    const contrasted = Math.max(0, Math.min(255, (gray - 128) * 1.8 + 150));
    pixels[index] = contrasted;
    pixels[index + 1] = contrasted;
    pixels[index + 2] = contrasted;
  }
  context.putImageData(imageData, 0, 0);
  return canvas.toBuffer("image/png");
}

class OcrSession {
  private unusable = false;
  private termination: Promise<unknown> | null = null;

  private constructor(private readonly worker: Worker) {}

  static async create(deadline: number): Promise<OcrSession> {
    const workerPromise = createWorker("ind", undefined, {
      langPath: path.join(process.cwd(), "node_modules", "@tesseract.js-data", "ind", "4.0.0"),
      workerPath: path.join(process.cwd(), "node_modules", "tesseract.js", "src", "worker-script", "node", "index.js"),
      gzip: true,
      cacheMethod: "readOnly",
    });
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      const worker = await Promise.race([
        workerPromise,
        new Promise<never>((_, reject) => {
          const timeout = Math.min(30_000, remainingTime(deadline));
          if (timeout <= 0) {
            void workerPromise.then((lateWorker) => lateWorker.terminate()).catch(() => undefined);
            reject(new Error("Batas waktu pemrosesan dokumen telah habis."));
            return;
          }
          timer = setTimeout(() => {
            void workerPromise.then((lateWorker) => lateWorker.terminate()).catch(() => undefined);
            reject(new Error("Mesin OCR gagal dimuat dalam 30 detik."));
          }, timeout);
        }),
      ]);
      return new OcrSession(worker);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async recognize(buffer: Buffer, deadline: number, pageSegMode: PSM = PSM.AUTO): Promise<string> {
    if (this.unusable) throw new Error("Sesi OCR dihentikan setelah melebihi batas waktu.");
    const timeout = Math.min(90_000, remainingTime(deadline));
    if (timeout <= 0) throw new Error("Batas waktu pemrosesan dokumen telah habis.");
    let timer: ReturnType<typeof setTimeout> | null = null;
    const recognition = (async () => {
      await this.worker.setParameters({
        tessedit_pageseg_mode: pageSegMode,
        preserve_interword_spaces: "1",
      });
      return this.worker.recognize(buffer);
    })();
    try {
      const result = await Promise.race([
        recognition,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            this.abort();
            reject(new Error("OCR melebihi batas waktu 90 detik."));
          }, timeout);
        }),
      ]);
      return capText(result.data.text);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private abort(): void {
    this.unusable = true;
    if (!this.termination) this.termination = this.worker.terminate().catch(() => undefined);
  }

  async close(): Promise<void> {
    if (!this.termination) this.termination = this.worker.terminate().catch(() => undefined);
    await withinTimeout(this.termination, 5_000);
  }
}

async function extractBestOrientedPage(
  buffer: Buffer,
  width: number,
  height: number,
  deadline: number,
  session: OcrSession,
): Promise<string> {
  let best = "";
  let bestScore = -1;
  let enhancedAttempts = 0;
  for (const rotation of __testRotationOrder(width, height)) {
    assertDeadline(deadline);
    const image = await rotatePng(buffer, rotation, deadline);
    const text = await session.recognize(image, deadline, PSM.AUTO);
    const score = __testDocumentStructureScore(text);
    if (score > bestScore) {
      best = text;
      bestScore = score;
    }
    if (bestScore >= OCR_EARLY_STOP_SCORE) break;
    if (
      score < OCR_EARLY_STOP_SCORE
      && enhancedAttempts < 2
      && remainingTime(deadline) >= OCR_ENHANCEMENT_RESERVE_MS
    ) {
      assertDeadline(deadline);
      const enhanced = await enhanceIdentityDocument(image, deadline);
      enhancedAttempts += 1;
      const enhancedText = await session.recognize(enhanced, deadline, PSM.SINGLE_BLOCK);
      const combined = `${text}\n${enhancedText}`;
      const combinedScore = __testDocumentStructureScore(combined);
      if (combinedScore > bestScore) {
        best = combined;
        bestScore = combinedScore;
      }
      if (bestScore >= OCR_EARLY_STOP_SCORE) break;
    }
  }
  return best;
}

interface QueuedOcrJob<T> {
  callback: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
  expired: boolean;
}

export class OcrQueue {
  private active = 0;
  private readonly waiting: Array<QueuedOcrJob<unknown>> = [];

  constructor(
    private readonly maxActive = 1,
    private readonly maxWaiting = 2,
    private readonly waitTimeoutMs = OCR_QUEUE_WAIT_MS,
  ) {}

  run<T>(callback: () => Promise<T>): Promise<T> {
    if (this.active < this.maxActive) return this.start(callback);
    if (this.waiting.length >= this.maxWaiting) {
      return Promise.reject(new Error("Antrean OCR penuh. Silakan coba lagi sebentar."));
    }

    return new Promise<T>((resolve, reject) => {
      const job: QueuedOcrJob<T> = {
        callback,
        resolve,
        reject,
        expired: false,
        timer: setTimeout(() => {
          job.expired = true;
          const index = this.waiting.indexOf(job as QueuedOcrJob<unknown>);
          if (index >= 0) this.waiting.splice(index, 1);
          reject(new Error("Waktu tunggu antrean OCR melebihi 15 detik."));
        }, this.waitTimeoutMs),
      };
      this.waiting.push(job as QueuedOcrJob<unknown>);
    });
  }

  private start<T>(callback: () => Promise<T>): Promise<T> {
    this.active += 1;
    return Promise.resolve()
      .then(callback)
      .finally(() => {
        this.active -= 1;
        this.startNext();
      });
  }

  private startNext(): void {
    if (this.active >= this.maxActive) return;
    const job = this.waiting.shift();
    if (!job) return;
    clearTimeout(job.timer);
    if (job.expired) {
      this.startNext();
      return;
    }
    void this.start(job.callback).then(job.resolve, job.reject);
  }
}

const ocrQueue = new OcrQueue();

function runOcrQueued<T>(job: () => Promise<T>): Promise<T> {
  return ocrQueue.run(job);
}

function meaningfulPdfPageText(text: string): boolean {
  return hasMeaningfulPdfText(text, 1);
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const textDeadline = Date.now() + PDF_OCR_TOTAL_MS;
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await withinDeadline(
      parser.getText({ first: 100 }),
      textDeadline,
      "Pembacaan PDF melebihi batas waktu 3 menit.",
    );
    if (result.total > 100) throw new Error("PDF memiliki lebih dari 100 halaman. Pisahkan dokumen sebelum diunggah.");
    const everyPageHasMeaningfulText = result.pages.length === result.total
      && result.pages.every((page) => meaningfulPdfPageText(page.text));
    if (hasMeaningfulPdfText(result.text, result.total) && (result.total > 3 || everyPageHasMeaningfulText)) {
      return capText(result.text);
    }
    if (result.total > 3) {
      throw new Error("PDF scan maksimal 3 halaman. Pisahkan dokumen atau unggah halaman yang diperlukan saja.");
    }

    return await runOcrQueued(async () => {
      const deadline = Date.now() + PDF_OCR_TOTAL_MS;
      const info = await withinDeadline(
        parser.getInfo({ first: result.total }),
        deadline,
        "Pemeriksaan dimensi PDF melebihi batas waktu 3 menit.",
      );
      const renderWidths = info.pages.map((page) => {
        if (!Number.isFinite(page.width) || !Number.isFinite(page.height) || page.width <= 0 || page.height <= 0) {
          throw new Error("Dimensi halaman PDF tidak valid.");
        }
        const pixelBoundedWidth = Math.floor(Math.sqrt(MAX_PDF_OCR_PIXELS * (page.width / page.height)));
        const desiredWidth = Math.min(PDF_RENDER_WIDTH, pixelBoundedWidth);
        const projectedHeight = desiredWidth * (page.height / page.width);
        assertPixelLimit(desiredWidth, projectedHeight, MAX_PDF_OCR_PIXELS, "Dimensi halaman PDF terlalu ekstrem untuk diproses OCR.");
        return desiredWidth;
      });

      const session = await OcrSession.create(deadline);
      try {
        const pageTexts: string[] = [];
        for (let pageNumber = 1; pageNumber <= result.total; pageNumber++) {
          const embeddedText = result.pages[pageNumber - 1]?.text?.trim() ?? "";
          if (meaningfulPdfPageText(embeddedText)) {
            pageTexts.push(embeddedText);
            continue;
          }
          assertDeadline(deadline);
          const screenshot = await withinDeadline(
            parser.getScreenshot({
              desiredWidth: renderWidths[pageNumber - 1],
              partial: [pageNumber],
              imageBuffer: true,
              imageDataUrl: false,
            }),
            deadline,
            "Render halaman PDF melebihi batas waktu 3 menit.",
          );
          const page = screenshot.pages[0];
          if (!page?.data) throw new Error(`Halaman PDF ${pageNumber} gagal dirender.`);
          assertPixelLimit(page.width, page.height, MAX_PDF_OCR_PIXELS, "Hasil render halaman PDF terlalu besar.");
          const prepared = await resizeForOcr(Buffer.from(page.data), MAX_PDF_OCR_PIXELS, deadline);
          const ocrText = await extractBestOrientedPage(prepared.buffer, prepared.width, prepared.height, deadline, session);
          pageTexts.push([embeddedText, ocrText].filter(Boolean).join("\n"));
        }
        return capText(pageTexts.join("\n\n"));
      } finally {
        await session.close();
      }
    });
  } finally {
    await withinTimeout(parser.destroy().catch(() => undefined), 5_000);
  }
}

async function extractDocx(buffer: Buffer): Promise<string> {
  validateDocxStructure(buffer);
  const result = await mammoth.extractRawText({ buffer });
  return capText(result.value);
}

async function extractImage(buffer: Buffer): Promise<string> {
  return runOcrQueued(async () => {
    const deadline = Date.now() + IMAGE_OCR_TOTAL_MS;
    assertDeadline(deadline);
    const dimensions = imageSize(buffer);
    if (!dimensions.width || !dimensions.height) throw new Error("Dimensi gambar tidak dapat dibaca.");
    assertPixelLimit(dimensions.width, dimensions.height, MAX_IMAGE_SOURCE_PIXELS, "Resolusi gambar terlalu besar (maksimal 25 megapiksel).");
    const prepared = await resizeForOcr(buffer, MAX_IMAGE_OCR_PIXELS, deadline);
    const session = await OcrSession.create(deadline);
    try {
      const text = capText(await extractBestOrientedPage(prepared.buffer, prepared.width, prepared.height, deadline, session));
      if (!text) throw new Error("Tidak ada teks yang berhasil dibaca dari gambar setelah mencoba semua orientasi.");
      return text;
    } finally {
      await session.close();
    }
  });
}

export async function extractArchiveText(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === "application/pdf") {
    const text = await extractPdf(buffer);
    if (!text) throw new Error("Tidak ada teks yang berhasil dibaca dari PDF, termasuk setelah fallback OCR.");
    return text;
  }
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return extractDocx(buffer);
  if (mimeType.startsWith("image/")) return extractImage(buffer);
  throw new Error("Format file tidak didukung.");
}
