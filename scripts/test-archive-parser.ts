import assert from "node:assert/strict";
import { parseArchiveText } from "../src/lib/archiveParser";

function hasWarning(result: ReturnType<typeof parseArchiveText>, text: string): boolean {
  return result.warnings.some((warning) => warning.includes(text));
}

const ktp = parseArchiveText(`PROVINSI JAWA TENGAH
KABUPATEN MAGELANG
NIK : 1234567890123456
Nama : BUDI SANTOSO
Tempat/Tgl Lahir : MAGELANG, 05-06-1988
Jenis Kelamin : LAKI-LAKI
Alamat : DUSUN CONTOH
Pekerjaan : PETANI
Kewarganegaraan : WNI
Berlaku Hingga : SEUMUR HIDUP`, "KTP");
assert.equal(ktp.fields.nik, "1234567890123456");
assert.equal(ktp.fields.name, "BUDI SANTOSO");
assert.equal(ktp.fields.tanggalLahir, "1988-06-05");

const oldKtp = parseArchiveText(`NIK : 1234567890123456
Name : CONTOH LAMA
Place & Date of Birth : MAGELANG, 5 June 1988
Date of Birth: 05-06-1988
Sex : PEREMPUAN
Address : DUSUN CONTOH
Village : DESA CONTOH
District : KECAMATAN CONTOH
Regency/City : MAGELANG
Marital Status : KAWIN
Occupation : PETANI
Citizenship : WNI
Berlaku Hingga : SEUMUR HIDUP`, "KTP");
assert.equal(oldKtp.fields.name, "CONTOH LAMA");
assert.equal(oldKtp.fields.tempatLahir, "MAGELANG");
assert.equal(oldKtp.fields.tanggalLahir, "1988-06-05");
assert.equal(oldKtp.fields.gender, "Nyonya");
assert.equal(oldKtp.fields.address, "DUSUN CONTOH, DESA CONTOH, KECAMATAN CONTOH");
assert.equal(oldKtp.fields.kelurahan, "DESA CONTOH");
assert.equal(oldKtp.fields.kecamatan, "KECAMATAN CONTOH");
assert.equal(oldKtp.fields.kabupaten, "MAGELANG");
assert.equal(oldKtp.fields.statusKawin, "KAWIN");
assert.equal(oldKtp.fields.pekerjaan, "PETANI");
assert.equal(oldKtp.fields.wargaNegara, "WNI");

const oldKtpDateOnly = parseArchiveText(`NIK: 1234567890123456
Name: DATE ONLY
Date of Birth: 29 February 2024
Address: OLD ADDRESS
Citizenship: WNI
Berlaku Hingga: SEUMUR HIDUP`, "KTP");
assert.equal(oldKtpDateOnly.fields.tanggalLahir, "2024-02-29");
assert.equal(oldKtpDateOnly.fields.tempatLahir, undefined);

const nextLineAndAliases = parseArchiveText(`PROVINSI JAWA TENGAH
N1K
32O1I5B8Z2G6O123
Narna
SITI AMINAH
Tempat/Tgl Lahir
SOLO, 3O-O1-199O
Alarnat
JALAN MELATI
KeI/Desa
MANAHAN
Kecarnatan
BANJARSARI
Pekeriaan
NOTARIS
Kewarganegaraan
WNI
Berlaku Hingga
SEUMUR HIDUP`, "KTP");
assert.equal(nextLineAndAliases.fields.nik, "3201158822660123");
assert.equal(nextLineAndAliases.fields.name, "SITI AMINAH");
assert.equal(nextLineAndAliases.fields.tanggalLahir, "1990-01-30");
assert.equal(nextLineAndAliases.fields.address, "JALAN MELATI, MANAHAN, BANJARSARI");
assert.equal(nextLineAndAliases.fields.pekerjaan, "NOTARIS");

const nlKAlias = parseArchiveText(`PROVINSI JAWA TENGAH
NlK: 1234567890123456
Nama: ALIAS NLK
Alamat: CONTOH
Kewarganegaraan: WNI
Berlaku Hingga: SEUMUR HIDUP`, "KTP");
assert.equal(nlKAlias.fields.nik, "1234567890123456");

const guardedNextLine = parseArchiveText(`PROVINSI JAWA TENGAH
Nama:
Alamat: JALAN MAWAR
NIK: 1234567890123456
Kewarganegaraan: WNI
Berlaku Hingga: SEUMUR HIDUP`, "KTP");
assert.equal(guardedNextLine.fields.name, undefined);
assert.equal(guardedNextLine.fields.address, "JALAN MAWAR");

const identifiersAreContextOnly = parseArchiveText(`PROVINSI JAWA TENGAH
NIK: 1234567890123456
Nama: B0BI S5
Alamat: BLOK B8
Kewarganegaraan: WNI
Berlaku Hingga: SEUMUR HIDUP`, "KTP");
assert.equal(identifiersAreContextOnly.fields.name, "B0BI S5");
assert.equal(identifiersAreContextOnly.fields.address, "BLOK B8");

const longNik = parseArchiveText(`PROVINSI JAWA TENGAH
NIK: 12345678901234567
Nama: BUDI
Alamat: CONTOH
Kewarganegaraan: WNI
Berlaku Hingga: SEUMUR HIDUP`, "KTP");
assert.equal(longNik.fields.nik, undefined);
assert.equal(hasWarning(longNik, "NIK tidak valid"), true);
assert.notEqual(longNik.confidence, 100);

const incompleteKtp = parseArchiveText(`PROVINSI JAWA TENGAH
NIK: 1234567890123456
Nama: TANPA TANGGAL
Alamat: CONTOH
Kewarganegaraan: WNI
Berlaku Hingga: SEUMUR HIDUP`, "KTP");
assert.equal(incompleteKtp.confidence, 75);

const invalidKk = parseArchiveText(`KARTU KELUARGA
NO. 12345678901234567
Nama Kepala Keluarga: CONTOH KELUARGA
Alamat: DUSUN CONTOH`, "KARTU_KELUARGA");
assert.equal(invalidKk.fields.nomorKk, undefined);
assert.equal(hasWarning(invalidKk, "Nomor KK tidak valid"), true);
assert.equal(invalidKk.confidence, 65);
assert.equal(hasWarning(invalidKk, "Nomor KK tidak ditemukan"), true);

const npwp = parseArchiveText(`NOMOR POKOK WAJIB PAJAK
NPWP : 12.345.678.9-012.345
Nama Wajib Pajak: BUDI SANTOSO
Alamat: DUSUN CONTOH`, "NPWP");
assert.equal(npwp.fields.name, "BUDI SANTOSO");
assert.equal(npwp.fields.npwp, "123456789012345");

const npwp16 = parseArchiveText(`NPWP: 123456789O123456
Nama Wajib Pajak: ENAM BELAS DIGIT`, "NPWP");
assert.equal(npwp16.fields.npwp, "1234567890123456");

const longNpwp = parseArchiveText(`NPWP: 12345678901234567
Nama Wajib Pajak: TERLALU PANJANG`, "NPWP");
assert.equal(longNpwp.fields.npwp, undefined);
assert.equal(hasWarning(longNpwp, "NPWP tidak valid"), true);
assert.equal(hasWarning(longNpwp, "Nomor NPWP tidak ditemukan"), true);
assert.equal(longNpwp.confidence, 50);

const missingCriticalKtp = parseArchiveText(`PROVINSI JAWA TENGAH
Nama: TANPA NIK
Tempat/Tgl Lahir: SOLO, 01-01-1990
Alamat: JALAN CONTOH
Kewarganegaraan: WNI
Berlaku Hingga: SEUMUR HIDUP`, "KTP");
assert.equal(missingCriticalKtp.confidence, 65);
assert.equal(hasWarning(missingCriticalKtp, "NIK tidak ditemukan"), true);

const missingCriticalKk = parseArchiveText(`KARTU KELUARGA
Nama Kepala Keluarga: TANPA NOMOR
Alamat: JALAN CONTOH`, "KARTU_KELUARGA");
assert.equal(missingCriticalKk.confidence, 65);
assert.equal(hasWarning(missingCriticalKk, "Nomor KK tidak ditemukan"), true);

const missingCriticalNpwp = parseArchiveText(`NOMOR POKOK WAJIB PAJAK
Nama Wajib Pajak: TANPA NPWP`, "NPWP");
assert.equal(missingCriticalNpwp.confidence, 50);
assert.equal(hasWarning(missingCriticalNpwp, "Nomor NPWP tidak ditemukan"), true);

const labelCollisions = parseArchiveText(`NOMOR POKOK WAJIB PAJAK
NPWP: 12.345.678.9-012.345
Nama Wajib Pajak: BUDI PAJAK
Nama: NAMA PENDEK`, "NPWP");
assert.equal(labelCollisions.fields.name, "BUDI PAJAK");

const shortLabelDoesNotStealLongLabel = parseArchiveText(`PROVINSI JAWA TENGAH
NIK: 1234567890123456
Nama Wajib Pajak: BUKAN NAMA KTP
Alamat: JALAN CONTOH
Kewarganegaraan: WNI
Berlaku Hingga: SEUMUR HIDUP`, "KTP");
assert.equal(shortLabelDoesNotStealLongLabel.fields.name, undefined);

const regencyCollision = parseArchiveText(`KARTU KELUARGA
No. KK: 1234567890123456
Nama Kepala Keluarga: KELUARGA CONTOH
Alamat: JALAN CONTOH
Kabupaten/Kota: KOTA SURAKARTA`, "KARTU_KELUARGA");
assert.equal(regencyCollision.fields.name, "KELUARGA CONTOH");
assert.equal(regencyCollision.fields.kabupaten, "KOTA SURAKARTA");

const unknownNextLabelGuard = parseArchiveText(`PROVINSI JAWA TENGAH
NIK: 1234567890123456
Nama:
Kode Dokumen: ABC-123
Alamat: JALAN MAWAR
Kewarganegaraan: WNI
Berlaku Hingga: SEUMUR HIDUP`, "KTP");
assert.equal(unknownNextLabelGuard.fields.name, undefined);
assert.equal(unknownNextLabelGuard.fields.address, "JALAN MAWAR");

const kk = parseArchiveText(`KARTU KELUARGA
NO. 1234567890123456
Nama Kepala Keluarga: CONTOH KELUARGA
Alamat: DUSUN CONTOH
Kecamatan: CONTOH
Provinsi: JAWA TENGAH`, "KARTU_KELUARGA");
assert.equal(kk.fields.nomorKk, "1234567890123456");
assert.equal(kk.fields.name, "CONTOH KELUARGA");
assert.equal(kk.confidence, 100);

const indonesianDate = parseArchiveText(`PROVINSI JAWA TENGAH
NIK: 1234567890123456
Nama: BULAN INDONESIA
Tempat/Tgl Lahir: SOLO, 17 Agustus 1945
Alamat: CONTOH
Kewarganegaraan: WNI
Berlaku Hingga: SEUMUR HIDUP`, "KTP");
assert.equal(indonesianDate.fields.tanggalLahir, "1945-08-17");

const invalidDate = parseArchiveText(`PROVINSI JAWA TENGAH
NIK: 1234567890123456
Nama: TANGGAL SALAH
Tempat/Tgl Lahir: SOLO, 31-02-2020
Alamat: CONTOH
Kewarganegaraan: WNI
Berlaku Hingga: SEUMUR HIDUP`, "KTP");
assert.equal(invalidDate.fields.tanggalLahir, undefined);
assert.equal(hasWarning(invalidDate, "Tanggal lahir tidak valid"), true);
assert.notEqual(invalidDate.confidence, 100);

const invalidNamedDate = parseArchiveText(`PROVINSI JAWA TENGAH
NIK: 1234567890123456
Nama: BULAN SALAH
Tempat/Tgl Lahir: SOLO, 31 April 2020
Alamat: CONTOH
Kewarganegaraan: WNI
Berlaku Hingga: SEUMUR HIDUP`, "KTP");
assert.equal(invalidNamedDate.fields.tanggalLahir, undefined);
assert.equal(hasWarning(invalidNamedDate, "Tanggal lahir tidak valid"), true);

const mismatchedRequestedType = parseArchiveText(`NOMOR POKOK WAJIB PAJAK
NPWP: 12.345.678.9-012.345
Nama Wajib Pajak: BUDI SANTOSO`, "KTP");
assert.equal(mismatchedRequestedType.documentType, "KTP");
assert.equal(hasWarning(mismatchedRequestedType, "terdeteksi kuat sebagai NPWP"), true);

assert.equal(parseArchiveText("FAKTA RAPAT TAHUNAN DAN CATATAN UMUM", "UMUM").documentType, "UMUM");
assert.equal(parseArchiveText("TEKNIK ADMINISTRASI KEWARGANEGARAAN", "UMUM").documentType, "UMUM");

const certificate = parseArchiveText(`SERTIPIKAT
HAK MILIK NOMOR 01234/DESA-CONTOH
Pemegang Hak: BUDI SANTOSO
Luas: 150 M2
NIB: 00.00.00.00.12345
Surat Ukur: 12/CONTOH/1O-O7-2O26`, "SERTIPIKAT");
assert.equal(certificate.fields.jenisHak, "HAK MILIK");
assert.equal(certificate.fields.nomorHak, "01234/DESA-CONTOH");
assert.equal(certificate.fields.pemegangHak, "BUDI SANTOSO");
assert.equal(certificate.fields.tanggalSuratUkur, "2026-07-10");

const deed = parseArchiveText(`AKTA JUAL BELI
NOMOR: 124/2026
TANGGAL: 10-07-2026
PIHAK PERTAMA: BUDI SANTOSO
PIHAK KEDUA: ANI KUSUMA`, "AKTA_PERJANJIAN");
assert.equal(deed.fields.nomorAkta, "124/2026");
assert.equal(deed.fields.tanggalAkta, "2026-07-10");

const deedPadaHari = parseArchiveText(`AKTA KUASA
NOMOR: 126/2026
PADA HARI SENIN 6 July 2026
PEMBERI: BUDI SANTOSO`, "AKTA_PERJANJIAN");
assert.equal(deedPadaHari.fields.tanggalAkta, "2026-07-06");

const invalidDeedDate = parseArchiveText(`AKTA JUAL BELI
NOMOR: 125/2026
TANGGAL: 29-02-2025
PIHAK PERTAMA: BUDI SANTOSO`, "AKTA_PERJANJIAN");
assert.equal(invalidDeedDate.fields.tanggalAkta, undefined);
assert.equal(hasWarning(invalidDeedDate, "Tanggal akta tidak valid"), true);

const dedupedWarnings = parseArchiveText(`PROVINSI
NIK: 123
Nama: A
Alamat: B
Kewarganegaraan: WNI
Berlaku Hingga: X`, "KTP");
assert.equal(new Set(dedupedWarnings.warnings).size, dedupedWarnings.warnings.length);

assert.throws(
  () => parseArchiveText("x".repeat(100_001)),
  /maksimal 100\.000 karakter/,
);
assert.throws(
  () => parseArchiveText(Array.from({ length: 5_001 }, () => "x").join("\n")),
  /maksimal 5\.000 baris/,
);
assert.throws(
  () => parseArchiveText("x".repeat(2_001)),
  /maksimal 2\.000 karakter per baris/,
);

console.log("Archive parser tests passed.");
