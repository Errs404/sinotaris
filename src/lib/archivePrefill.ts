function assignAliases(values: Record<string, string>, fields: Record<string, string>, source: string, targets: string[]) {
  const value = fields[source];
  if (!value) return;
  for (const target of targets) values[target] = value;
}

export function buildArchivePrefill(fields: Record<string, string>): Record<string, string> {
  const values: Record<string, string> = { ...fields };

  assignAliases(values, fields, "name", ["nama", "nama_klien", "nama_pemberi", "nama_debitor"]);
  assignAliases(values, fields, "nik", ["nik", "nik_klien", "nik_pemberi", "nik_debitor"]);
  assignAliases(values, fields, "nomorKk", ["nomor_kk"]);
  assignAliases(values, fields, "tempatLahir", ["tempat_lahir", "tempat_lahir_pemberi", "tempat_lahir_debitor"]);
  assignAliases(values, fields, "tanggalLahir", ["tanggal_lahir", "tanggal_lahir_pemberi", "tanggal_lahir_debitor"]);
  assignAliases(values, fields, "gender", ["sapaan", "sapaan_pemberi", "sapaan_debitor"]);
  assignAliases(values, fields, "pekerjaan", ["pekerjaan", "pekerjaan_pemberi", "pekerjaan_debitor"]);
  assignAliases(values, fields, "statusKawin", ["status_kawin", "status_pemberi", "status_debitor"]);
  assignAliases(values, fields, "wargaNegara", ["warga_negara", "warga_pemberi", "warga_debitor"]);
  assignAliases(values, fields, "address", ["alamat", "alamat_pemberi", "alamat_debitor"]);
  assignAliases(values, fields, "nomorHak", ["nomor_hak"]);
  assignAliases(values, fields, "jenisHak", ["jenis_hak"]);
  assignAliases(values, fields, "luasTanah", ["luas_tanah"]);
  assignAliases(values, fields, "nib", ["nib"]);
  assignAliases(values, fields, "nomorSuratUkur", ["nomor_surat_ukur"]);
  assignAliases(values, fields, "tanggalSuratUkur", ["tanggal_surat_ukur"]);
  assignAliases(values, fields, "nomorAkta", ["nomor_akta"]);
  assignAliases(values, fields, "tanggalAkta", ["tanggal_akta"]);

  return values;
}
