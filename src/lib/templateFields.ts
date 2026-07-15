// Definisi tipe field form untuk template dokumen.
// Disimpan sebagai JSON di DocTemplate.fieldsJson.
//
// Tipe field:
// - text      : input teks biasa
// - date      : date picker; nilai dikirim sebagai yyyy-mm-dd
// - date-auto : input dd-mm-yyyy; field `textTarget` otomatis diisi teks terbilang
// - readonly  : diisi otomatis dari field lain (source), tidak bisa diedit
//
// Field khusus `tanggal_akta` (type date) otomatis menghasilkan hari_akta + tanggal_akta_teks
// jika kedua placeholder itu ada di template.

export interface TemplateField {
  name: string; // nama placeholder di docx: {nama}
  label: string;
  type: "text" | "date" | "date-auto" | "readonly";
  default?: string;
  placeholder?: string;
  /** untuk date-auto: nama field teks terbilang yang diisi otomatis */
  textTarget?: string;
  /** untuk readonly: nama field sumber */
  source?: string;
}

export interface TemplateSection {
  title: string;
  fields: TemplateField[];
}

export type TemplateFieldsDef = TemplateSection[];

/** Ambil semua pasangan [dateField, textField] dari definisi — untuk applyAutomaticDates */
export function collectDatePairs(sections: TemplateFieldsDef): [string, string][] {
  const pairs: [string, string][] = [];
  for (const section of sections) {
    for (const field of section.fields) {
      if (field.type === "date-auto" && field.textTarget) {
        pairs.push([field.name, field.textTarget]);
      }
    }
  }
  return pairs;
}
