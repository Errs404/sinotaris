import assert from "node:assert/strict";
import { parseArchiveText } from "../src/lib/archiveParser";

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
Place/Date of Birth : MAGELANG, 05-06-1988
Sex : PEREMPUAN
Address : DUSUN CONTOH
Marital Status : KAWIN
Occupation : PETANI
Citizenship : WNI
Berlaku Hingga : SEUMUR HIDUP`, "KTP");
assert.equal(oldKtp.fields.name, "CONTOH LAMA");
assert.equal(oldKtp.fields.tanggalLahir, "1988-06-05");
assert.equal(oldKtp.fields.gender, "Nyonya");
assert.equal(oldKtp.fields.address, "DUSUN CONTOH");
assert.equal(oldKtp.fields.statusKawin, "KAWIN");
assert.equal(oldKtp.fields.pekerjaan, "PETANI");
assert.equal(oldKtp.fields.wargaNegara, "WNI");

const npwp = parseArchiveText(`NOMOR POKOK WAJIB PAJAK
NPWP : 12.345.678.9-012.345
Nama Wajib Pajak: BUDI SANTOSO
Alamat: DUSUN CONTOH`, "NPWP");
assert.equal(npwp.fields.name, "BUDI SANTOSO");
assert.equal(npwp.fields.npwp, "123456789012345");

const kk = parseArchiveText(`KARTU KELUARGA
NO. 1234567890123456
Nama Kepala Keluarga: CONTOH KELUARGA
Alamat: DUSUN CONTOH
Kecamatan: CONTOH
Provinsi: JAWA TENGAH`, "KARTU_KELUARGA");
assert.equal(kk.fields.nomorKk, "1234567890123456");
assert.equal(kk.fields.name, "CONTOH KELUARGA");

const certificate = parseArchiveText(`SERTIPIKAT
HAK MILIK NOMOR 01234/DESA-CONTOH
Pemegang Hak: BUDI SANTOSO
Luas: 150 M2
NIB: 00.00.00.00.12345`, "SERTIPIKAT");
assert.equal(certificate.fields.jenisHak, "HAK MILIK");
assert.equal(certificate.fields.nomorHak, "01234/DESA-CONTOH");
assert.equal(certificate.fields.pemegangHak, "BUDI SANTOSO");

const deed = parseArchiveText(`AKTA JUAL BELI
NOMOR: 124/2026
TANGGAL: 10-07-2026
PIHAK PERTAMA: BUDI SANTOSO
PIHAK KEDUA: ANI KUSUMA`, "AKTA_PERJANJIAN");
assert.equal(deed.fields.nomorAkta, "124/2026");
assert.equal(deed.fields.tanggalAkta, "2026-07-10");

console.log("Archive parser tests passed.");
