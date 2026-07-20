export const clientScanFields = [
  "name",
  "nik",
  "npwp",
  "tempatLahir",
  "tanggalLahir",
  "gender",
  "pekerjaan",
  "statusKawin",
  "wargaNegara",
  "address",
] as const;

export type ClientScanField = (typeof clientScanFields)[number];

export function normalizeClientScanValue(field: ClientScanField, value: string): string {
  const clean = value.trim();
  if (field === "wargaNegara" && /^(WNI|INDONESIA)$/i.test(clean)) return "Indonesia";
  if (field === "statusKawin") {
    if (/^KAWIN$/i.test(clean)) return "Kawin";
    if (/^BELUM KAWIN$/i.test(clean)) return "Belum Kawin";
  }
  return clean;
}

export function sameClientScanValue(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase("id-ID") === b.trim().toLocaleLowerCase("id-ID");
}
