import type { ArchiveTypeValue, ExtractedArchiveData } from "@/lib/archiveTypes";

type ParsedFields = {
  fields: Record<string, string>;
  warnings: string[];
  hasInvalidValue: boolean;
};

const INVALID_NIK_WARNING = "NIK tidak valid: harus terdiri dari tepat 16 digit.";
const INVALID_KK_WARNING = "Nomor KK tidak valid: harus terdiri dari tepat 16 digit.";
const INVALID_NPWP_WARNING = "NPWP tidak valid: harus terdiri dari tepat 15 atau 16 digit.";
const MAX_INPUT_CHARS = 100_000;
const MAX_INPUT_LINES = 5_000;
const MAX_LINE_CHARS = 2_000;

const KNOWN_LABELS = [
  "Nomor Pokok Wajib Pajak", "Tempat dan Tanggal Lahir", "Nama Kepala Keluarga",
  "Narna Kepala Keluarga", "Place & Date of Birth", "Place/Date of Birth", "Place Date of Birth",
  "Nama Wajib Pajak", "Nama Pemegang Hak", "Nomor Kartu Keluarga", "Tempat/Tgl Lahir",
  "Tempat Tgl Lahir", "Kelurahan/Desa", "Desa/Kelurahan", "Status Perkawinan",
  "Berlaku Hingga", "Marital Status", "Kabupaten/Kota", "Regency/City", "Kewarganegaraan",
  "Gambar Situasi", "Pemegang Hak", "Jenis Kelamin", "Date of Birth", "Status Kawin",
  "Surat Ukur", "Nomor Surat Ukur", "Tanggal Surat Ukur", "Pihak Pertama", "Pihak Kedua",
  "Judul Dokumen", "Nomor Akta", "Tanggal Akta", "Para Pihak", "Jenis Hak", "Luas Tanah",
  "Tempat Lahir", "Tanggal Lahir", "Nomor KK", "Nama", "Narna", "Name", "NIK", "N1K", "NlK",
  "NPWP", "No. KK", "No KK", "No.", "Nomor Hak", "No. Hak", "Nomor", "Tanggal", "Alamat",
  "Alarnat", "Address", "RT/RW", "RT RW",
  "Kel/Desa", "KeI/Desa", "Kelurahan", "Village", "Desa", "Kecamatan", "Kecarnatan", "District",
  "Kabupaten", "Kota", "Provinsi", "Sex", "Agama", "Pekerjaan", "Pekeriaan", "Occupation",
  "Citizenship", "Luas", "NIB", "Pemberi", "Penerima", "Penghadap",
].sort((left, right) => right.length - left.length);

const MONTHS: Record<string, number> = {
  januari: 1, january: 1,
  februari: 2, february: 2,
  maret: 3, march: 3,
  april: 4,
  mei: 5, may: 5,
  juni: 6, june: 6,
  juli: 7, july: 7,
  agustus: 8, august: 8,
  september: 9,
  oktober: 10, october: 10,
  november: 11,
  desember: 12, december: 12,
};

function clean(value?: string | null): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function match(text: string, pattern: RegExp): string {
  return clean(text.match(pattern)?.[1]);
}

function matchGroup(text: string, pattern: RegExp, group: number): string {
  return clean(text.match(pattern)?.[group]);
}

function assertInputLimits(text: string): void {
  if (text.length > MAX_INPUT_CHARS) {
    throw new Error("Teks dokumen terlalu panjang (maksimal 100.000 karakter).");
  }
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  if (lines.length > MAX_INPUT_LINES) {
    throw new Error("Teks dokumen memiliki terlalu banyak baris (maksimal 5.000 baris).");
  }
  if (lines.some((line) => line.length > MAX_LINE_CHARS)) {
    throw new Error("Teks dokumen memiliki baris terlalu panjang (maksimal 2.000 karakter per baris).");
  }
}

function normalizedLines(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map(clean)
    .filter(Boolean);
}

function leadingKnownLabel(line: string): string {
  return KNOWN_LABELS.find((label) => {
    const pattern = new RegExp(`^${escapeRegExp(label)}(?=\\s*[:;]|\\s|$)`, "i");
    return pattern.test(line);
  }) ?? "";
}

function isLabelLine(line: string): boolean {
  if (leadingKnownLabel(line)) return true;
  return /^[\p{L}][\p{L}\p{N} ./&()_-]{0,60}\s*[:;]/u.test(line);
}

function lineValue(lines: string[], labels: string[]): string {
  const sortedLabels = [...labels].sort((left, right) => right.length - left.length);
  for (let index = 0; index < lines.length; index += 1) {
    const knownLabel = leadingKnownLabel(lines[index]);
    for (const label of sortedLabels) {
      if (knownLabel && knownLabel.toLocaleLowerCase("id") !== label.toLocaleLowerCase("id")) continue;
      const pattern = new RegExp(`^${escapeRegExp(label)}(?:\\s*[:;]\\s*|\\s+)(.*)$|^${escapeRegExp(label)}\\s*$`, "i");
      const lineMatch = lines[index].match(pattern);
      if (!lineMatch) continue;
      const result = lineMatch[1] ?? "";
      if (clean(result)) return clean(result.split("|")[0]);

      const nextLine = lines[index + 1];
      if (nextLine && !isLabelLine(nextLine)) return clean(nextLine.split("|")[0]);
    }
  }
  return "";
}

function normalizeIdentifier(value: string, validLengths: number[]): string {
  if (!value) return "";
  const normalized = value
    .replace(/[O]/gi, "0")
    .replace(/[Il|]/g, "1")
    .replace(/[S]/gi, "5")
    .replace(/[B]/gi, "8")
    .replace(/[Z]/gi, "2")
    .replace(/[G]/gi, "6")
    .replace(/[.\s-]/g, "");
  return /^\d+$/.test(normalized) && validLengths.includes(normalized.length) ? normalized : "";
}

function identifierField(value: string, validLengths: number[], warning: string): Pick<ParsedFields, "warnings" | "hasInvalidValue"> & { value: string } {
  const normalized = normalizeIdentifier(value, validLengths);
  return {
    value: normalized,
    warnings: value && !normalized ? [warning] : [],
    hasInvalidValue: Boolean(value && !normalized),
  };
}

function normalizedCalendarDate(day: number, month: number, year: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalizeDate(value: string): string {
  const cleaned = clean(value);
  const numeric = cleaned.match(/(?:^|\b)([0-9O]{1,2})[\s./-]([0-9O]{1,2})[\s./-]([0-9O]{4})(?:\b|$)/i);
  if (numeric) {
    return normalizedCalendarDate(
      Number(numeric[1].replace(/O/gi, "0")),
      Number(numeric[2].replace(/O/gi, "0")),
      Number(numeric[3].replace(/O/gi, "0")),
    );
  }

  const named = cleaned.match(/(?:^|\b)(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})(?:\b|$)/i);
  if (!named) return "";
  const month = MONTHS[named[2].toLowerCase()];
  return month ? normalizedCalendarDate(Number(named[1]), month, Number(named[3])) : "";
}

function extractDateCandidate(value: string): string {
  return clean(value.match(/([0-9O]{1,2}[\s./-][0-9O]{1,2}[\s./-][0-9O]{4}|\d{1,2}\s+[A-Za-z]+\s+\d{4})/i)?.[1]);
}

function dateField(value: string, label: string): Pick<ParsedFields, "warnings" | "hasInvalidValue"> & { value: string } {
  const normalized = normalizeDate(value);
  return {
    value: normalized,
    warnings: value && !normalized ? [`${label} tidak valid dan tidak disertakan.`] : [],
    hasInvalidValue: Boolean(value && !normalized),
  };
}

function detectType(text: string): ArchiveTypeValue {
  const upper = text.toUpperCase();
  if (/\bKARTU\s+KELUARGA\b|\bNO\.\s*KK\b|\bNOMOR\s+KARTU\s+KELUARGA\b/.test(upper)) return "KARTU_KELUARGA";
  if (/\bNPWP\b|\bNOMOR\s+POKOK\s+WAJIB\s+PAJAK\b/.test(upper)) return "NPWP";
  if (/\bSERTIPIKAT\b|\bSERTIFIKAT\b|\bHAK\s+MILIK\b|\bHAK\s+GUNA\s+BANGUNAN\b|\bSURAT\s+UKUR\b|\bNIB\b/.test(upper)) return "SERTIPIKAT";
  if (/\bAKTA\b|\bPERJANJIAN\b|\bPASAL\s+\d+\b|\bBERHADAPAN\s+DENGAN\s+SAYA\b/.test(upper)) return "AKTA_PERJANJIAN";
  if ((/\bPROVINSI\b|\bNIK\b|\bN1K\b|\bNLK\b|\bTEMPAT\/TGL\s+LAHIR\b/.test(upper) && /\bKEWARGANEGARAAN\b|\bBERLAKU\s+HINGGA\b/.test(upper)) || /\bPLACE\s*(?:\/|&|AND)\s*DATE\s+OF\s+BIRTH\b/.test(upper)) return "KTP";
  return "UMUM";
}

function parseKtp(text: string): ParsedFields {
  const lines = normalizedLines(text);
  const nik = identifierField(lineValue(lines, ["NIK", "N1K", "NlK"]), [16], INVALID_NIK_WARNING);
  const birth = lineValue(lines, ["Tempat/Tgl Lahir", "Tempat Tgl Lahir", "Tempat dan Tanggal Lahir", "Place/Date of Birth", "Place Date of Birth", "Place & Date of Birth", "Date of Birth"]);
  const birthDateMatch = birth.match(/([0-9O]{1,2}[\s./-][0-9O]{1,2}[\s./-][0-9O]{4}|\d{1,2}\s+[A-Za-z]+\s+\d{4})\s*$/i);
  const birthDateRaw = clean(birthDateMatch?.[1]);
  const birthDate = dateField(birthDateRaw, "Tanggal lahir");
  const tempatLahir = clean(birthDateMatch ? birth.slice(0, birthDateMatch.index).replace(/[,;\s]+$/, "") : birth);
  const genderRaw = lineValue(lines, ["Jenis Kelamin", "Sex"]);
  const addressParts = [
    lineValue(lines, ["Alamat", "Alarnat", "Address"]),
    lineValue(lines, ["RT/RW", "RT RW"]),
    lineValue(lines, ["Kel/Desa", "KeI/Desa", "Kelurahan/Desa", "Kelurahan", "Village"]),
    lineValue(lines, ["Kecamatan", "Kecarnatan", "District"]),
  ].filter(Boolean);

  return {
    fields: {
      nik: nik.value,
      name: lineValue(lines, ["Nama", "Narna", "Name"]),
      tempatLahir,
      tanggalLahir: birthDate.value,
      gender: /PEREMPUAN|WANITA/i.test(genderRaw) ? "Nyonya" : /LAKI/i.test(genderRaw) ? "Tuan" : genderRaw,
      address: addressParts.join(", "),
      rtRw: lineValue(lines, ["RT/RW", "RT RW"]),
      kelurahan: lineValue(lines, ["Kel/Desa", "KeI/Desa", "Kelurahan/Desa", "Kelurahan", "Village"]),
      kecamatan: lineValue(lines, ["Kecamatan", "Kecarnatan", "District"]),
      statusKawin: lineValue(lines, ["Status Perkawinan", "Status Kawin", "Marital Status"]),
      agama: lineValue(lines, ["Agama"]),
      pekerjaan: lineValue(lines, ["Pekerjaan", "Pekeriaan", "Occupation"]),
      wargaNegara: lineValue(lines, ["Kewarganegaraan", "Citizenship"]) || "Indonesia",
      provinsi: lineValue(lines, ["Provinsi"]),
      kabupaten: lineValue(lines, ["Kabupaten/Kota", "Kabupaten", "Kota", "Regency/City"]),
    },
    warnings: [...nik.warnings, ...birthDate.warnings],
    hasInvalidValue: nik.hasInvalidValue || birthDate.hasInvalidValue,
  };
}

function parseNpwp(text: string): ParsedFields {
  const lines = normalizedLines(text);
  const npwp = identifierField(lineValue(lines, ["NPWP", "Nomor Pokok Wajib Pajak"]), [15, 16], INVALID_NPWP_WARNING);
  return {
    fields: {
      npwp: npwp.value,
      name: lineValue(lines, ["Nama Wajib Pajak", "Nama", "Narna"]),
      address: lineValue(lines, ["Alamat", "Alarnat"]),
    },
    warnings: npwp.warnings,
    hasInvalidValue: npwp.hasInvalidValue,
  };
}

function parseKk(text: string): ParsedFields {
  const lines = normalizedLines(text);
  const nomorKk = identifierField(lineValue(lines, ["No. KK", "No KK", "Nomor Kartu Keluarga", "No."]), [16], INVALID_KK_WARNING);
  return {
    fields: {
      nomorKk: nomorKk.value,
      name: lineValue(lines, ["Nama Kepala Keluarga", "Narna Kepala Keluarga"]),
      address: lineValue(lines, ["Alamat", "Alarnat"]),
      rtRw: lineValue(lines, ["RT/RW", "RT RW"]),
      kelurahan: lineValue(lines, ["Desa/Kelurahan", "Kelurahan", "KeI/Desa"]),
      kecamatan: lineValue(lines, ["Kecamatan", "Kecarnatan"]),
      kabupaten: lineValue(lines, ["Kabupaten/Kota", "Kabupaten"]),
      provinsi: lineValue(lines, ["Provinsi"]),
    },
    warnings: nomorKk.warnings,
    hasInvalidValue: nomorKk.hasInvalidValue,
  };
}

function parseCertificate(text: string): ParsedFields {
  const lines = normalizedLines(text);
  const hak = matchGroup(text, /\b(HAK MILIK|HAK GUNA BANGUNAN|HAK PAKAI|HAK GUNA USAHA)\s*(?:NOMOR|NO\.?|:)\s*([^\n]+)/i, 2);
  const dateRaw = lineValue(lines, ["Surat Ukur", "Gambar Situasi"]);
  const surveyDate = dateField(extractDateCandidate(dateRaw), "Tanggal surat ukur");
  return {
    fields: {
      jenisHak: match(text, /\b(HAK MILIK|HAK GUNA BANGUNAN|HAK PAKAI|HAK GUNA USAHA)\b/i),
      nomorHak: hak || lineValue(lines, ["Nomor Hak", "No. Hak"]),
      pemegangHak: lineValue(lines, ["Nama Pemegang Hak", "Pemegang Hak", "Nama", "Narna"]),
      luasTanah: match(text, /(?:LUAS|SELuas)\s*[:;]?\s*([0-9.,]+\s*M(?:2|²))/i),
      nib: match(text, /\bNIB\s*[:;]?\s*([0-9.\s-]+)/i),
      nomorSuratUkur: dateRaw,
      tanggalSuratUkur: surveyDate.value,
      kelurahan: lineValue(lines, ["Desa/Kelurahan", "Kelurahan", "Desa", "KeI/Desa"]),
      kecamatan: lineValue(lines, ["Kecamatan", "Kecarnatan"]),
      kabupaten: lineValue(lines, ["Kabupaten/Kota", "Kabupaten"]),
      provinsi: lineValue(lines, ["Provinsi"]),
    },
    warnings: surveyDate.warnings,
    hasInvalidValue: surveyDate.hasInvalidValue,
  };
}

function parseDeed(text: string): ParsedFields {
  const lines = normalizedLines(text);
  const rawDate = lineValue(lines, ["Tanggal"]) || match(text, /PADA HARI[^\n]*?([0-9O]{1,2}[\s./-][0-9O]{1,2}[\s./-][0-9O]{4}|\d{1,2}\s+[A-Za-z]+\s+\d{4})/i);
  const deedDate = dateField(extractDateCandidate(rawDate), "Tanggal akta");
  return {
    fields: {
      judulDokumen: lines.find((line) => /AKTA|PERJANJIAN|KUASA|JUAL BELI|HIBAH/i.test(line)) ?? lines[0] ?? "",
      nomorAkta: match(text, /\bNOMOR\s*[:;]?\s*([0-9A-Z./-]+)/i),
      tanggalAkta: deedDate.value,
      paraPihak: lines.filter((line) => /PIHAK PERTAMA|PIHAK KEDUA|PENGHADAP|PEMBERI|PENERIMA/i.test(line)).slice(0, 10).join("; "),
    },
    warnings: deedDate.warnings,
    hasInvalidValue: deedDate.hasInvalidValue,
  };
}

export function parseArchiveText(rawText: string, requestedType?: ArchiveTypeValue): ExtractedArchiveData {
  assertInputLimits(rawText);
  const text = rawText.trim();
  const strongDetectedType = detectType(text);
  const documentType = requestedType && requestedType !== "UMUM" ? requestedType : strongDetectedType;
  let parsed: ParsedFields;
  if (documentType === "KTP") parsed = parseKtp(text);
  else if (documentType === "KARTU_KELUARGA") parsed = parseKk(text);
  else if (documentType === "NPWP") parsed = parseNpwp(text);
  else if (documentType === "SERTIPIKAT") parsed = parseCertificate(text);
  else if (documentType === "AKTA_PERJANJIAN") parsed = parseDeed(text);
  else parsed = { fields: { judulDokumen: normalizedLines(text)[0] ?? "" }, warnings: [], hasInvalidValue: false };

  const fields = Object.fromEntries(Object.entries(parsed.fields).filter(([, value]) => clean(value)));
  const expected = documentType === "KTP"
    ? ["nik", "name", "address", "tanggalLahir"]
    : documentType === "NPWP"
      ? ["npwp", "name"]
      : documentType === "KARTU_KELUARGA"
        ? ["nomorKk", "name", "address"]
        : [];
  const found = expected.filter((key) => fields[key]).length;
  let confidence = expected.length ? Math.round((found / expected.length) * 100) : Math.min(80, 30 + Object.keys(fields).length * 10);
  if (parsed.hasInvalidValue) confidence = Math.min(confidence, 85);

  const criticalIdentifier = documentType === "KTP"
    ? { field: "nik", warning: "NIK tidak ditemukan. Periksa hasil OCR dan isi NIK secara manual." }
    : documentType === "KARTU_KELUARGA"
      ? { field: "nomorKk", warning: "Nomor KK tidak ditemukan. Periksa hasil OCR dan isi nomor KK secara manual." }
      : documentType === "NPWP"
        ? { field: "npwp", warning: "Nomor NPWP tidak ditemukan. Periksa hasil OCR dan isi NPWP secara manual." }
        : null;
  if (criticalIdentifier && !fields[criticalIdentifier.field]) confidence = Math.min(confidence, 65);

  const warnings = [...parsed.warnings];
  if (criticalIdentifier && !fields[criticalIdentifier.field]) warnings.push(criticalIdentifier.warning);
  if (requestedType && requestedType !== "UMUM" && strongDetectedType !== "UMUM" && strongDetectedType !== requestedType) {
    warnings.push(`Jenis dokumen terdeteksi kuat sebagai ${strongDetectedType}, tetapi diproses sebagai ${requestedType} sesuai permintaan.`);
  }
  if (text.length < 30) warnings.push("Teks yang terbaca sangat sedikit. Coba unggah foto yang lebih tajam atau lurus.");
  if (confidence < 70) warnings.push("Akurasi ekstraksi rendah. Periksa dan koreksi semua field sebelum menyimpan.");

  return { documentType, confidence, fields, warnings: [...new Set(warnings)] };
}
