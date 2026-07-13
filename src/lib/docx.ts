// Generator DOCX dari template Word dengan placeholder {nama_field}
// Diporting dari skmht-generator/lib/document.js, termasuk kalibrasi garis putus-putus

import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";

const dashFillWidth = Number(process.env.DASH_FILL_WIDTH || 72);
const maxDashRun = Number(process.env.MAX_DASH_RUN || 28);

interface TemplateErrorItem {
  message: string;
  properties?: { xtag?: string; explanation?: string };
}

function formatTemplateError(error: unknown): string {
  const err = error as { properties?: { errors?: TemplateErrorItem[] }; message?: string };
  if (err.properties && Array.isArray(err.properties.errors)) {
    return err.properties.errors
      .map((item) => {
        const tag = item.properties?.xtag ? ` tag: ${item.properties.xtag}` : "";
        const explanation = item.properties?.explanation ? ` - ${item.properties.explanation}` : "";
        return `${item.message}${tag}${explanation}`;
      })
      .join("\n");
  }

  return err.message || String(error);
}

function visibleTextLength(value: string): number {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").length;
}

function dashCountForLine(currentLineLength: number, width = dashFillWidth): number {
  const safeWidth = Number.isFinite(width) && width > 20 ? Math.floor(width) : 72;
  const safeMaxDashRun = Number.isFinite(maxDashRun) && maxDashRun > 5 ? Math.floor(maxDashRun) : 28;
  const used = currentLineLength % safeWidth;
  const count = used === 0 ? safeMaxDashRun : safeWidth - used;
  return Math.max(3, Math.min(count, safeMaxDashRun));
}

function adjustDashText(text: string, state: { lineLength: number }): string {
  const safeWidth = Number.isFinite(dashFillWidth) && dashFillWidth > 20 ? Math.floor(dashFillWidth) : 72;
  let cursor = 0;

  const adjustedText = String(text || "").replace(/-{3,}/g, (dashRun, offset: number) => {
    const before = text.slice(cursor, offset);
    state.lineLength = (state.lineLength + visibleTextLength(before)) % safeWidth;

    const count = dashCountForLine(state.lineLength, safeWidth);
    cursor = offset + dashRun.length;
    state.lineLength = 0;
    return "-".repeat(count);
  });

  const after = String(text || "").slice(cursor);
  state.lineLength = (state.lineLength + visibleTextLength(after)) % safeWidth;
  return adjustedText.replace(/(-{3,})(?=\p{L})/gu, "$1 ");
}

function adjustDashFillersInParagraph(paragraphXml: string): string {
  if (!/-{3,}/.test(paragraphXml)) return paragraphXml;

  const state = { lineLength: 0 };
  return paragraphXml.replace(
    /(<w:t\b[^>]*>)([\s\S]*?)(<\/w:t>)/g,
    (_match, openTag: string, text: string, closeTag: string) => {
      return `${openTag}${adjustDashText(text, state)}${closeTag}`;
    },
  );
}

export function adjustDashFillers(buffer: Buffer): Buffer {
  const zip = new PizZip(buffer);
  const documentFile = zip.file("word/document.xml");

  if (!documentFile) {
    return buffer;
  }

  const xml = documentFile.asText();
  const adjustedXml = xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraphXml) =>
    adjustDashFillersInParagraph(paragraphXml),
  );

  zip.file("word/document.xml", adjustedXml);
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
}

/** Generate DOCX dari buffer template + data. Placeholder format: {nama_field} */
export function generateDocx(templateBuffer: Buffer, data: Record<string, unknown>): Buffer {
  try {
    const zip = new PizZip(templateBuffer);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      errorLogging: false,
      nullGetter: () => "",
    });

    doc.render(data);
    return adjustDashFillers(doc.toBuffer());
  } catch (error) {
    throw new Error(`Gagal membuat DOCX:\n${formatTemplateError(error)}`);
  }
}

export function sanitizeFileName(value: string, fallback = "Dokumen"): string {
  return (
    String(value || fallback)
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || fallback
  );
}
