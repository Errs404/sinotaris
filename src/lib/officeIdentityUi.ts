export const identityLockedFields = ["nama_kantor", "alamat_kantor", "telepon_kantor", "email_kantor", "nama_notaris", "gelar_notaris", "wilayah_notaris", "alamat_kantor_notaris", "sk_notaris_nomor", "sk_notaris_tanggal", "ttd_notaris"];

/** Never display a stale legacy identity when authoritative resolution failed. */
export function identityPreviewValues(values: Record<string, string>, identity: Record<string, string> | null) {
  return { ...values, ...Object.fromEntries(identityLockedFields.map(key => [key, identity?.[key] ?? ""])) };
}

export function identityPeriod(row: { effectiveFrom: Date | string | null; effectiveUntil: Date | string | null }) {
  const date = (value: Date | string | null) => value ? new Date(value).toISOString().slice(0, 10) : null;
  return `${date(row.effectiveFrom) ?? "Tanpa awal"} — ${date(row.effectiveUntil) ?? "Tanpa akhir"}`;
}
