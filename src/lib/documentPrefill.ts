import { formatDisplayDate, formatIndonesianDateText } from "@/lib/indoDate";

interface PartyClient {
  name: string;
  nik: string | null;
  tempatLahir: string | null;
  tanggalLahir: Date | null;
  gender: string | null;
  pekerjaan: string | null;
  statusKawin: string | null;
  wargaNegara: string | null;
  address: string | null;
}

interface PartyRelation {
  peran: string;
  client: PartyClient;
}

interface JobForPrefill {
  id: string;
  nomorAkta: string | null;
  tanggalAkta: Date | null;
  pihakAlih: string | null;
  pihakTerima: string | null;
  bphtb: unknown;
  pphFinal: unknown;
  nop: string | null;
  office: {
    notarisName: string;
    notarisTitle: string | null;
    address: string | null;
    wilayahKerja: string | null;
    skNotarisNo: string | null;
    skNotarisDate: string | null;
  };
  clients: PartyRelation[];
}

function money(value: unknown): string {
  if (value === null || value === undefined) return "";
  const number = Number(value);
  return Number.isFinite(number) ? `Rp${number.toLocaleString("id-ID")},-` : "";
}

function roleKey(role: string): string | null {
  const normalized = role.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (normalized.includes("pemberikuasa")) return "pemberi";
  if (normalized.includes("penerimakuasa")) return "penerima";
  if (normalized.includes("debitor") || normalized.includes("debitur")) return "debitor";
  if (normalized.includes("pasangan") || normalized.includes("suami") || normalized.includes("istri")) return "pasangan";
  if (normalized.includes("saksi1") || normalized.includes("saksisatu")) return "saksi_1";
  if (normalized.includes("saksi2") || normalized.includes("saksidua")) return "saksi_2";
  return null;
}

function partyFields(prefix: string, client: PartyClient): Record<string, string> {
  const birthDate = client.tanggalLahir
    ? formatDisplayDate(client.tanggalLahir.toISOString().slice(0, 10))
    : "";
  const fields: Record<string, string> = {
    [`nama_${prefix}`]: client.name,
    [`nik_${prefix}`]: client.nik ?? "",
    [`tempat_lahir_${prefix}`]: client.tempatLahir ?? "",
    [`tanggal_lahir_${prefix}`]: birthDate,
    [`tanggal_lahir_${prefix}_teks`]: birthDate ? formatIndonesianDateText(birthDate) : "",
    [`sapaan_${prefix}`]: client.gender ?? "",
    [`pekerjaan_${prefix}`]: client.pekerjaan ?? "",
    [`status_${prefix}`]: client.statusKawin ?? "",
    [`warga_${prefix}`]: client.wargaNegara ?? "Indonesia",
    [`alamat_${prefix}`]: client.address ?? "",
  };
  return fields;
}

export function buildDocumentPrefill(job: JobForPrefill): Record<string, string> {
  const title = [job.office.notarisName, job.office.notarisTitle].filter(Boolean).join(", ");
  const values: Record<string, string> = {
    nomor_akta: job.nomorAkta ?? "",
    tanggal_akta: job.tanggalAkta?.toISOString().slice(0, 10) ?? "",
    nama_notaris: job.office.notarisName,
    gelar_notaris: job.office.notarisTitle ?? "",
    wilayah_notaris: job.office.wilayahKerja ?? "",
    alamat_kantor_notaris: job.office.address ?? "",
    sk_notaris_nomor: job.office.skNotarisNo ?? "",
    sk_notaris_tanggal: job.office.skNotarisDate ?? "",
    ttd_notaris: title,
    pihak_alih: job.pihakAlih ?? "",
    pihak_terima: job.pihakTerima ?? "",
    bphtb: money(job.bphtb),
    pph_final: money(job.pphFinal),
    nop: job.nop ?? "",
  };

  for (const relation of job.clients) {
    const prefix = roleKey(relation.peran);
    if (prefix) Object.assign(values, partyFields(prefix, relation.client));

    const normalized = relation.peran.toLowerCase();
    if (normalized.includes("kreditor")) values.nama_kreditor = relation.client.name;
    if (normalized.includes("penerima kuasa")) values.ttd_penerima = relation.client.name;
    if (normalized.includes("pemberi kuasa")) values.ttd_pemberi = relation.client.name;
    if (normalized.includes("pasangan") || normalized.includes("suami") || normalized.includes("istri")) {
      values.ttd_pasangan = `Persetujuan ${relation.peran}`;
    }
  }

  return values;
}
