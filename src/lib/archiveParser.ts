import type { ArchiveTypeValue, ExtractedArchiveData } from "@/lib/archiveTypes";

function clean(value?: string | null): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function match(text: string, pattern: RegExp): string {
  return clean(text.match(pattern)?.[1]);
}

function matchGroup(text: string, pattern: RegExp, group: number): string {
  return clean(text.match(pattern)?.[group]);
}

function normalizedLines(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map(clean)
    .filter(Boolean);
}

function lineValue(lines: string[], labels: string[]): string {
  for (const line of lines) {
    for (const label of labels) {
      const pattern = new RegExp(`(?:^|\\b)${label}\\s*[:;]?\\s*(.+)$`, "i");
      const result = line.match(pattern)?.[1];
      if (result) return clean(result.split("|")[0]);
    }
  }
  return "";
}

function normalizeDate(value: string): string {
  const m = value.match(/(\d{1,2})[\s./-](\d{1,2})[\s./-](\d{4})/);
  if (!m) return clean(value);
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

function detectType(text: string): ArchiveTypeValue {
  const upper = text.toUpperCase();
  if (/PROVINSI|NIK|TEMPAT\/TGL LAHIR/.test(upper) && /KEWARGANEGARAAN|BERLAKU HINGGA/.test(upper)) return "KTP";
  if (/KARTU KELUARGA|NO\.\s*KK|NOMOR KARTU KELUARGA/.test(upper)) return "KARTU_KELUARGA";
  if (/NPWP|NOMOR POKOK WAJIB PAJAK/.test(upper)) return "NPWP";
  if (/SERTIPIKAT|SERTIFIKAT|HAK MILIK|HAK GUNA BANGUNAN|SURAT UKUR|NIB/.test(upper)) return "SERTIPIKAT";
  if (/AKTA|PERJANJIAN|PASAL\s+\d+|BERHADAPAN DENGAN SAYA/.test(upper)) return "AKTA_PERJANJIAN";
  return "UMUM";
}

function parseKtp(text: string): Record<string, string> {
  const lines = normalizedLines(text);
  const birth = lineValue(lines, ["Tempat/Tgl Lahir", "Tempat Tgl Lahir", "Tempat dan Tanggal Lahir"]);
  const birthParts = birth.match(/^(.+?)[,\s]+(\d{1,2}[\s./-]\d{1,2}[\s./-]\d{4})$/);
  const genderRaw = lineValue(lines, ["Jenis Kelamin"]);
  const addressParts = [
    lineValue(lines, ["Alamat"]),
    lineValue(lines, ["RT/RW", "RT RW"]),
    lineValue(lines, ["Kel/Desa", "Kelurahan/Desa", "Kelurahan"]),
    lineValue(lines, ["Kecamatan"]),
  ].filter(Boolean);

  return {
    nik: match(text, /\bNIK\s*[:;]?\s*([0-9OIl\s-]{16,22})/i).replace(/[O]/gi, "0").replace(/[Il]/g, "1").replace(/\D/g, "").slice(0, 16),
    name: lineValue(lines, ["Nama"]),
    tempatLahir: clean(birthParts?.[1] ?? birth),
    tanggalLahir: normalizeDate(clean(birthParts?.[2])),
    gender: /PEREMPUAN|WANITA/i.test(genderRaw) ? "Nyonya" : /LAKI/i.test(genderRaw) ? "Tuan" : genderRaw,
    address: addressParts.join(", "),
    rtRw: lineValue(lines, ["RT/RW", "RT RW"]),
    kelurahan: lineValue(lines, ["Kel/Desa", "Kelurahan/Desa", "Kelurahan"]),
    kecamatan: lineValue(lines, ["Kecamatan"]),
    statusKawin: lineValue(lines, ["Status Perkawinan", "Status Kawin"]),
    pekerjaan: lineValue(lines, ["Pekerjaan"]),
    wargaNegara: lineValue(lines, ["Kewarganegaraan"]) || "Indonesia",
    provinsi: lineValue(lines, ["Provinsi"]),
    kabupaten: lineValue(lines, ["Kabupaten", "Kota"]),
  };
}

function parseNpwp(text: string): Record<string, string> {
  const lines = normalizedLines(text);
  return {
    npwp: match(text, /(?:NPWP|NOMOR POKOK WAJIB PAJAK)\s*[:;]?\s*([0-9.\s-]{15,25})/i).replace(/\D/g, "").slice(0, 16),
    name: lineValue(lines, ["Nama Wajib Pajak", "Nama"]),
    address: lineValue(lines, ["Alamat"]),
  };
}

function parseKk(text: string): Record<string, string> {
  const lines = normalizedLines(text);
  return {
    nomorKk: match(text, /(?:NO\.?\s*KK|NOMOR KARTU KELUARGA|NO\.?)\s*[:;]?\s*([0-9OIl\s-]{16,22})/i).replace(/[O]/gi, "0").replace(/[Il]/g, "1").replace(/\D/g, "").slice(0, 16),
    name: lineValue(lines, ["Nama Kepala Keluarga"]),
    address: lineValue(lines, ["Alamat"]),
    rtRw: lineValue(lines, ["RT/RW", "RT RW"]),
    kelurahan: lineValue(lines, ["Desa/Kelurahan", "Kelurahan"]),
    kecamatan: lineValue(lines, ["Kecamatan"]),
    kabupaten: lineValue(lines, ["Kabupaten/Kota", "Kabupaten"]),
    provinsi: lineValue(lines, ["Provinsi"]),
  };
}

function parseCertificate(text: string): Record<string, string> {
  const lines = normalizedLines(text);
  const hak = matchGroup(text, /\b(HAK MILIK|HAK GUNA BANGUNAN|HAK PAKAI|HAK GUNA USAHA)\s*(?:NOMOR|NO\.?|:)\s*([^\n]+)/i, 2);
  return {
    jenisHak: match(text, /\b(HAK MILIK|HAK GUNA BANGUNAN|HAK PAKAI|HAK GUNA USAHA)\b/i),
    nomorHak: hak || lineValue(lines, ["Nomor Hak", "No. Hak"]),
    pemegangHak: lineValue(lines, ["Nama Pemegang Hak", "Pemegang Hak", "Nama"]),
    luasTanah: match(text, /(?:LUAS|SELuas)\s*[:;]?\s*([0-9.,]+\s*M(?:2|²))/i),
    nib: match(text, /\bNIB\s*[:;]?\s*([0-9.\s-]+)/i),
    nomorSuratUkur: lineValue(lines, ["Surat Ukur", "Gambar Situasi"]),
    tanggalSuratUkur: normalizeDate(match(text, /(?:SURAT UKUR|GAMBAR SITUASI)[^\n]*?(\d{1,2}[./-]\d{1,2}[./-]\d{4})/i)),
    kelurahan: lineValue(lines, ["Desa/Kelurahan", "Kelurahan", "Desa"]),
    kecamatan: lineValue(lines, ["Kecamatan"]),
    kabupaten: lineValue(lines, ["Kabupaten/Kota", "Kabupaten"]),
    provinsi: lineValue(lines, ["Provinsi"]),
  };
}

function parseDeed(text: string): Record<string, string> {
  const lines = normalizedLines(text);
  return {
    judulDokumen: lines.find((line) => /AKTA|PERJANJIAN|KUASA|JUAL BELI|HIBAH/i.test(line)) ?? lines[0] ?? "",
    nomorAkta: match(text, /\bNOMOR\s*[:;]?\s*([0-9A-Z./-]+)/i),
    tanggalAkta: normalizeDate(match(text, /(?:TANGGAL|PADA HARI)[^\n]*?(\d{1,2}[./-]\d{1,2}[./-]\d{4})/i)),
    paraPihak: lines.filter((line) => /PIHAK PERTAMA|PIHAK KEDUA|PENGHADAP|PEMBERI|PENERIMA/i.test(line)).slice(0, 10).join("; "),
  };
}

export function parseArchiveText(rawText: string, requestedType?: ArchiveTypeValue): ExtractedArchiveData {
  const text = rawText.trim();
  const detected = requestedType && requestedType !== "UMUM" ? requestedType : detectType(text);
  let fields: Record<string, string>;
  if (detected === "KTP") fields = parseKtp(text);
  else if (detected === "KARTU_KELUARGA") fields = parseKk(text);
  else if (detected === "NPWP") fields = parseNpwp(text);
  else if (detected === "SERTIPIKAT") fields = parseCertificate(text);
  else if (detected === "AKTA_PERJANJIAN") fields = parseDeed(text);
  else fields = { judulDokumen: normalizedLines(text)[0] ?? "" };

  fields = Object.fromEntries(Object.entries(fields).filter(([, value]) => clean(value)));
  const expected = detected === "KTP" ? ["nik", "name", "address"] : detected === "NPWP" ? ["npwp", "name"] : [];
  const found = expected.filter((key) => fields[key]).length;
  const confidence = expected.length ? Math.round((found / expected.length) * 100) : Math.min(80, 30 + Object.keys(fields).length * 10);
  const warnings: string[] = [];
  if (text.length < 30) warnings.push("Teks yang terbaca sangat sedikit. Coba unggah foto yang lebih tajam atau lurus.");
  if (confidence < 70) warnings.push("Akurasi ekstraksi rendah. Periksa dan koreksi semua field sebelum menyimpan.");

  return { documentType: detected, confidence, fields, warnings };
}
