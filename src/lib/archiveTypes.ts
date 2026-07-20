export type ArchiveTypeValue =
  | "KTP"
  | "KARTU_KELUARGA"
  | "NPWP"
  | "SERTIPIKAT"
  | "AKTA_PERJANJIAN"
  | "UMUM";

export interface ExtractedArchiveData {
  documentType: ArchiveTypeValue;
  confidence: number;
  fields: Record<string, string>;
  warnings: string[];
}

export const archiveTypeLabels: Record<ArchiveTypeValue, string> = {
  KTP: "KTP",
  KARTU_KELUARGA: "Kartu Keluarga",
  NPWP: "NPWP",
  SERTIPIKAT: "Sertipikat Tanah",
  AKTA_PERJANJIAN: "Akta / Perjanjian",
  UMUM: "Dokumen Umum",
};

export const archiveFieldLabels: Record<string, string> = {
  name: "Nama",
  nik: "NIK",
  npwp: "NPWP",
  tempatLahir: "Tempat Lahir",
  tanggalLahir: "Tanggal Lahir",
  gender: "Jenis Kelamin / Sapaan",
  pekerjaan: "Pekerjaan",
  statusKawin: "Status Perkawinan",
  wargaNegara: "Kewarganegaraan",
  address: "Alamat",
  rtRw: "RT/RW",
  kelurahan: "Kelurahan / Desa",
  kecamatan: "Kecamatan",
  kabupaten: "Kabupaten / Kota",
  provinsi: "Provinsi",
  nomorKk: "Nomor KK",
  nomorHak: "Nomor Hak",
  jenisHak: "Jenis Hak",
  luasTanah: "Luas Tanah",
  nib: "NIB",
  nomorSuratUkur: "Nomor Surat Ukur",
  tanggalSuratUkur: "Tanggal Surat Ukur",
  pemegangHak: "Pemegang Hak",
  nomorAkta: "Nomor Akta",
  tanggalAkta: "Tanggal Akta",
  judulDokumen: "Judul Dokumen",
  paraPihak: "Para Pihak",
};

export const archiveFieldsByType: Record<ArchiveTypeValue, string[]> = {
  KTP: ["name", "nik", "tempatLahir", "tanggalLahir", "gender", "pekerjaan", "statusKawin", "wargaNegara", "address", "rtRw", "kelurahan", "kecamatan", "kabupaten", "provinsi"],
  KARTU_KELUARGA: ["nomorKk", "name", "address", "rtRw", "kelurahan", "kecamatan", "kabupaten", "provinsi"],
  NPWP: ["name", "npwp", "address"],
  SERTIPIKAT: ["jenisHak", "nomorHak", "pemegangHak", "luasTanah", "nib", "nomorSuratUkur", "tanggalSuratUkur", "kelurahan", "kecamatan", "kabupaten", "provinsi"],
  AKTA_PERJANJIAN: ["judulDokumen", "nomorAkta", "tanggalAkta", "paraPihak"],
  UMUM: ["judulDokumen", "name", "nik", "npwp", "address", "nomorAkta", "tanggalAkta", "paraPihak"],
};
