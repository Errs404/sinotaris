// Utilitas tanggal & terbilang Bahasa Indonesia
// Diporting dari skmht-generator/lib/date.js, diperluas sampai triliun

export const dayNames = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
export const monthNames = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

const smallNumbers = [
  "nol",
  "satu",
  "dua",
  "tiga",
  "empat",
  "lima",
  "enam",
  "tujuh",
  "delapan",
  "sembilan",
  "sepuluh",
  "sebelas",
];

export function numberToIndonesianWords(number: number | string): string {
  const value = Number(number);

  if (!Number.isInteger(value) || value < 0) return "";
  if (value < 12) return smallNumbers[value];
  if (value < 20) return `${numberToIndonesianWords(value - 10)} belas`;
  if (value < 100) {
    const tens = Math.floor(value / 10);
    const rest = value % 10;
    return `${numberToIndonesianWords(tens)} puluh${rest ? ` ${numberToIndonesianWords(rest)}` : ""}`;
  }
  if (value < 200) return `seratus${value > 100 ? ` ${numberToIndonesianWords(value - 100)}` : ""}`;
  if (value < 1000) {
    const hundreds = Math.floor(value / 100);
    const rest = value % 100;
    return `${numberToIndonesianWords(hundreds)} ratus${rest ? ` ${numberToIndonesianWords(rest)}` : ""}`;
  }
  if (value < 2000) return `seribu${value > 1000 ? ` ${numberToIndonesianWords(value - 1000)}` : ""}`;
  if (value < 1_000_000) {
    const thousands = Math.floor(value / 1000);
    const rest = value % 1000;
    return `${numberToIndonesianWords(thousands)} ribu${rest ? ` ${numberToIndonesianWords(rest)}` : ""}`;
  }
  if (value < 1_000_000_000) {
    const millions = Math.floor(value / 1_000_000);
    const rest = value % 1_000_000;
    return `${numberToIndonesianWords(millions)} juta${rest ? ` ${numberToIndonesianWords(rest)}` : ""}`;
  }
  if (value < 1_000_000_000_000) {
    const billions = Math.floor(value / 1_000_000_000);
    const rest = value % 1_000_000_000;
    return `${numberToIndonesianWords(billions)} miliar${rest ? ` ${numberToIndonesianWords(rest)}` : ""}`;
  }
  if (value < 1_000_000_000_000_000) {
    const trillions = Math.floor(value / 1_000_000_000_000);
    const rest = value % 1_000_000_000_000;
    return `${numberToIndonesianWords(trillions)} triliun${rest ? ` ${numberToIndonesianWords(rest)}` : ""}`;
  }

  return String(value);
}

/** Terbilang rupiah: 114534000 => "seratus empat belas juta lima ratus tiga puluh empat ribu rupiah" */
export function rupiahToWords(amount: number): string {
  const words = numberToIndonesianWords(Math.floor(amount));
  return words ? `${words} rupiah` : "";
}

/** Format angka rupiah: 114534000 => "Rp114.534.000,-" */
export function formatRupiah(amount: number): string {
  return `Rp${Math.floor(amount).toLocaleString("id-ID")},-`;
}

interface DateParts {
  date: Date;
  year: number;
  month: number;
  day: number;
}

function pad2(value: number | string): string {
  return String(value).padStart(2, "0");
}

export function parseDateParts(
  value: unknown,
  { strict = false }: { strict?: boolean } = {},
): DateParts | null {
  const raw = String(value || "").trim();
  let year: number;
  let month: number;
  let day: number;

  let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  } else {
    match = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (!match) return null;
    day = Number(match[1]);
    month = Number(match[2]);
    year = Number(match[3]);
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(year, month - 1, day);
  if (strict && (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day)) {
    return null;
  }

  return { date, year, month, day };
}

/** dd-mm-yyyy */
export function formatDisplayDate(value: unknown): string {
  const parsed = parseDateParts(value);
  if (!parsed) return String(value || "");
  return `${pad2(parsed.day)}-${pad2(parsed.month)}-${parsed.year}`;
}

/** "31 (tiga puluh satu) bulan Desember tahun 2024 (dua ribu dua puluh empat)" + hari */
export function formatAktaDate(value: unknown): { hari: string; teks: string } {
  const parsed = parseDateParts(value, { strict: true });
  if (!parsed) return { hari: "", teks: "" };

  const { date, year, month, day } = parsed;
  return {
    hari: dayNames[date.getDay()],
    teks: `${day} (${numberToIndonesianWords(day)}) bulan ${monthNames[month - 1]} tahun ${year} (${numberToIndonesianWords(year)})`,
  };
}

/** "lima Juni seribu sembilan ratus delapan puluh delapan" */
export function formatIndonesianDateText(value: unknown): string {
  const parsed = parseDateParts(value);
  if (!parsed) return "";

  const { year, month, day } = parsed;
  return `${numberToIndonesianWords(day)} ${monthNames[month - 1]} ${numberToIndonesianWords(year)}`;
}

/** "5 Juni 1988" untuk tampilan UI */
export function formatShortIndonesianDate(date: Date): string {
  return `${date.getDate()} ${monthNames[date.getMonth()]} ${date.getFullYear()}`;
}
