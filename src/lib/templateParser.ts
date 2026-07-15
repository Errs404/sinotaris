// Ekstraksi placeholder {nama_field} dari file .docx
// Dipakai saat upload template baru untuk membuat definisi form otomatis.

import PizZip from "pizzip";
import type { TemplateFieldsDef, TemplateField } from "./templateFields";

/** Ambil teks polos dari word/document.xml (tag dibuang, run digabung). */
function extractDocumentText(buffer: Buffer): string {
  const zip = new PizZip(buffer);
  const doc = zip.file("word/document.xml");
  if (!doc) throw new Error("File bukan dokumen Word yang valid (.docx).");
  // Gabungkan isi <w:t> — placeholder bisa terpecah antar-run,
  // jadi kita gabung semua teks lalu cari {(...)}
  return doc
    .asText()
    .replace(/<w:tab[^>]*\/>/g, "\t")
    .replace(/<[^>]+>/g, "");
}

/** Cari semua placeholder unik {nama} dalam urutan kemunculan. */
export function extractPlaceholders(buffer: Buffer): string[] {
  const text = extractDocumentText(buffer);
  const seen = new Set<string>();
  const names: string[] = [];

  for (const match of text.matchAll(/\{([a-zA-Z0-9_]+)\}/g)) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }

  return names;
}

function labelFromName(name: string): string {
  return name
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Buat definisi form otomatis dari daftar placeholder.
 * Heuristik: `tanggal_*` jadi date-auto; jika ada pasangan `X` dan `X_teks`,
 * maka `X_teks` jadi readonly terisi otomatis.
 */
export function buildFieldsDefFromPlaceholders(names: string[]): TemplateFieldsDef {
  const nameSet = new Set(names);
  const fields: TemplateField[] = [];

  for (const name of names) {
    // X_teks yang punya pasangan X => readonly otomatis
    if (name.endsWith("_teks") && nameSet.has(name.slice(0, -5))) {
      fields.push({
        name,
        label: `${labelFromName(name.slice(0, -5))} Teks (otomatis)`,
        type: "readonly",
        source: name.slice(0, -5),
      });
      continue;
    }

    // tanggal_* yang punya pasangan _teks => date-auto
    if (name.startsWith("tanggal_") && nameSet.has(`${name}_teks`)) {
      fields.push({
        name,
        label: labelFromName(name),
        type: "date-auto",
        textTarget: `${name}_teks`,
        placeholder: "dd-mm-yyyy",
      });
      continue;
    }

    fields.push({ name, label: labelFromName(name), type: "text" });
  }

  return [{ title: "Data Dokumen", fields }];
}
