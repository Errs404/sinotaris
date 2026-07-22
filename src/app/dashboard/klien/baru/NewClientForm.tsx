"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Eye, EyeOff, FileScan, LoaderCircle, ScanText, Trash2 } from "lucide-react";
import { archiveTypeLabels, type ArchiveTypeValue } from "@/lib/archiveTypes";
import {
  clientScanFields,
  normalizeClientScanValue,
  sameClientScanValue,
  type ClientScanField,
} from "@/lib/clientScanFields";
import { cancelClientScanAction, scanClientDocumentAction } from "./actions";
import { PendingButton } from "@/components/PendingButton";

type ClientField = ClientScanField | "phone" | "email" | "notes";
type ClientValues = Record<ClientField, string> & { type: "PERORANGAN" | "BADAN_HUKUM" };

interface ScannedDocument {
  archiveId: string;
  originalName: string;
  mimeType: string;
  documentType: ArchiveTypeValue;
  confidence: number;
  warnings: string[];
  fields: Partial<Record<ClientScanField, string>>;
}

interface Conflict {
  key: string;
  archiveId: string;
  field: ClientScanField;
  current: string;
  incoming: string;
  source: string;
}

const initialValues: ClientValues = {
  type: "PERORANGAN",
  name: "",
  nik: "",
  nomorKk: "",
  npwp: "",
  tempatLahir: "",
  tanggalLahir: "",
  gender: "",
  pekerjaan: "",
  statusKawin: "",
  wargaNegara: "Indonesia",
  address: "",
  phone: "",
  email: "",
  notes: "",
};

const labels: Record<ClientField, string> = {
  name: "Nama Lengkap", nik: "NIK", nomorKk: "Nomor KK", npwp: "NPWP", tempatLahir: "Tempat Lahir",
  tanggalLahir: "Tanggal Lahir", gender: "Sapaan", pekerjaan: "Pekerjaan",
  statusKawin: "Status Kawin", wargaNegara: "Warga Negara", address: "Alamat",
  phone: "Telepon / WA", email: "Email", notes: "Catatan",
};

const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:placeholder-slate-500";

export function NewClientForm({ action, canScan }: { action: (formData: FormData) => Promise<void>; canScan: boolean }) {
  const [values, setValuesState] = useState<ClientValues>(initialValues);
  const valuesRef = useRef(values);
  const touchedRef = useRef(new Set<ClientScanField>());
  const autoSourceRef = useRef<Partial<Record<ClientScanField, string>>>({});
  const [documents, setDocuments] = useState<ScannedDocument[]>([]);
  const [acceptedMismatches, setAcceptedMismatches] = useState<Record<string, string>>({});
  const [scanError, setScanError] = useState("");
  const [cancellingId, setCancellingId] = useState("");
  const [previewId, setPreviewId] = useState("");
  const [isScanning, startScanning] = useTransition();

  const conflicts = useMemo<Conflict[]>(() => {
    const result: Conflict[] = [];
    for (const document of documents) {
      for (const field of clientScanFields) {
        const incoming = document.fields[field] ?? "";
        const current = values[field];
        if (!incoming || sameClientScanValue(current, incoming)) continue;
        const key = `${document.archiveId}:${field}`;
        if (acceptedMismatches[key] === current) continue;
        result.push({ key, archiveId: document.archiveId, field, current, incoming, source: document.originalName });
      }
    }
    return result;
  }, [documents, values, acceptedMismatches]);

  const archiveIdsJson = useMemo(() => JSON.stringify(documents.map((item) => item.archiveId)), [documents]);
  const decisionsJson = useMemo(() => JSON.stringify(acceptedMismatches), [acceptedMismatches]);

  function replaceValues(next: ClientValues) {
    valuesRef.current = next;
    setValuesState(next);
  }

  function setValue(field: ClientField | "type", value: string, touched = true) {
    if (touched && clientScanFields.includes(field as ClientScanField)) {
      touchedRef.current.add(field as ClientScanField);
      delete autoSourceRef.current[field as ClientScanField];
    }
    replaceValues({ ...valuesRef.current, [field]: value });
  }

  function scan(formData: FormData) {
    setScanError("");
    startScanning(async () => {
      try {
        const result = await scanClientDocumentAction(formData);
        const normalizedFields: Partial<Record<ClientScanField, string>> = {};
        for (const field of clientScanFields) {
          const value = normalizeClientScanValue(field, result.fields[field] ?? "");
          if (value) normalizedFields[field] = value;
        }
        const document: ScannedDocument = {
          archiveId: result.archiveId,
          originalName: result.originalName,
          mimeType: result.mimeType,
          documentType: result.documentType,
          confidence: result.confidence,
          warnings: result.warnings,
          fields: normalizedFields,
        };
        setDocuments((current) => [...current, document]);
        const next = { ...valuesRef.current };
        for (const field of clientScanFields) {
          const incoming = normalizedFields[field] ?? "";
          if (!incoming) continue;
          const untouchedDefault = field === "wargaNegara" && next[field] === "Indonesia" && !touchedRef.current.has(field);
          if (!next[field] || untouchedDefault) {
            next[field] = incoming;
            autoSourceRef.current[field] = result.archiveId;
          }
        }
        replaceValues(next);
      } catch (error) {
        setScanError(error instanceof Error ? error.message : String(error));
      }
    });
  }

  function keepCurrent(conflict: Conflict) {
    setAcceptedMismatches((current) => ({ ...current, [conflict.key]: valuesRef.current[conflict.field] }));
  }

  function applyDocumentValue(conflict: Conflict) {
    setValue(conflict.field, conflict.incoming);
    setAcceptedMismatches((current) => {
      const next = { ...current };
      delete next[conflict.key];
      return next;
    });
  }

  async function cancelDocument(document: ScannedDocument) {
    setScanError("");
    setCancellingId(document.archiveId);
    try {
      await cancelClientScanAction(document.archiveId);
      const remaining = documents.filter((item) => item.archiveId !== document.archiveId);
      setDocuments(remaining);
      if (previewId === document.archiveId) setPreviewId("");
      setAcceptedMismatches((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${document.archiveId}:`))));
      const next = { ...valuesRef.current };
      for (const field of clientScanFields) {
        if (autoSourceRef.current[field] !== document.archiveId || touchedRef.current.has(field)) continue;
        const replacement = remaining.map((item) => item.fields[field] ?? "").find(Boolean) ?? initialValues[field];
        next[field] = replacement;
        if (replacement) {
          const source = remaining.find((item) => item.fields[field] === replacement);
          autoSourceRef.current[field] = source?.archiveId;
        } else {
          delete autoSourceRef.current[field];
        }
      }
      replaceValues(next);
    } catch (error) {
      setScanError(error instanceof Error ? error.message : String(error));
    } finally {
      setCancellingId("");
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      {canScan && (
        <section className="rounded-xl border border-indigo-200 bg-indigo-50 p-6 dark:border-indigo-800 dark:bg-indigo-950/30">
          <div className="mb-4 flex items-start gap-3">
            <div className="rounded-xl bg-indigo-600 p-2.5 text-white"><FileScan className="h-5 w-5" /></div>
            <div><h3 className="font-semibold text-indigo-950 dark:text-indigo-100">Scan dokumen untuk mengisi form</h3><p className="mt-1 text-sm text-indigo-700 dark:text-indigo-300">Unggah KTP, KK, NPWP, PDF digital, DOCX, atau foto. Field kosong diisi otomatis; data berbeda tidak akan menimpa koreksi Anda.</p><p className="mt-1 text-xs text-indigo-600 dark:text-indigo-400">Scan langsung masuk Pemindai & Arsip sebagai Perlu Review. Jika halaman ditutup, scan tetap dapat ditemukan dan digunakan kembali dari menu Arsip.</p></div>
          </div>
          <form action={scan} className="grid gap-3 md:grid-cols-[1fr_220px_auto] md:items-end">
            <div><label htmlFor="client-scan-file" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Dokumen</label><input id="client-scan-file" name="file" type="file" required accept=".pdf,.docx,.jpg,.jpeg,.png,.webp" className={inputClass} /></div>
            <div><label htmlFor="client-scan-type" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Jenis</label><select id="client-scan-type" name="type" required defaultValue="" className={inputClass}><option value="" disabled>— Pilih —</option>{(["KTP", "KARTU_KELUARGA", "NPWP", "UMUM"] as ArchiveTypeValue[]).map((type) => <option key={type} value={type}>{archiveTypeLabels[type]}</option>)}</select></div>
            <button disabled={isScanning} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-70">{isScanning ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ScanText className="h-4 w-4" />}{isScanning ? "Memindai..." : "Scan & Autofill"}</button>
          </form>
          {scanError && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{scanError}</p>}
          {documents.length > 0 && <div className="mt-4 space-y-2">{documents.map((document) => {
            const canPreview = document.mimeType === "application/pdf" || document.mimeType.startsWith("image/");
            const isPreviewOpen = previewId === document.archiveId;
            return <div key={document.archiveId} className="rounded-lg border border-indigo-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><CheckCircle2 className="h-5 w-5 text-emerald-500" /><div><p className="text-sm font-medium text-slate-800 dark:text-slate-100">{document.originalName}</p><p className="text-xs text-slate-500 dark:text-slate-400">{archiveTypeLabels[document.documentType]} · Akurasi parser {document.confidence}%</p></div></div><div className="flex flex-wrap items-center gap-3">{canPreview && <button type="button" onClick={() => setPreviewId(isPreviewOpen ? "" : document.archiveId)} className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300">{isPreviewOpen ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}{isPreviewOpen ? "Tutup preview" : "Preview"}</button>}<button type="button" disabled={cancellingId === document.archiveId} onClick={() => cancelDocument(document)} className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /> {cancellingId === document.archiveId ? "Menghapus..." : "Batalkan & hapus scan"}</button></div></div>{document.warnings.length > 0 && <div className="mt-2 text-xs text-amber-600 dark:text-amber-400">{document.warnings.map((warning) => <p key={warning}>• {warning}</p>)}</div>}{isPreviewOpen && <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-950"><iframe title={`Preview ${document.originalName}`} src={`/api/arsip/${document.archiveId}/file?preview=1`} className="h-[520px] w-full sm:h-[620px]" /></div>}</div>;
          })}</div>}
        </section>
      )}

      {conflicts.length > 0 && <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/30"><div className="mb-3 flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-600" /><div><h3 className="font-semibold text-amber-900 dark:text-amber-200">Perbedaan data harus diselesaikan</h3><p className="text-xs text-amber-700 dark:text-amber-300">Klien belum dapat disimpan sebelum setiap perbedaan dipilih.</p></div></div><div className="space-y-3">{conflicts.map((conflict) => <div key={conflict.key} className="rounded-lg bg-white p-4 dark:bg-slate-900"><p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{labels[conflict.field]} · {conflict.source}</p><div className="mt-2 grid gap-2 sm:grid-cols-2"><button type="button" onClick={() => keepCurrent(conflict)} className="rounded-lg border border-slate-200 p-3 text-left text-sm hover:border-indigo-400 dark:border-slate-700"><span className="block text-xs text-slate-400">Pertahankan nilai form saat ini</span>{conflict.current || "(kosong)"}</button><button type="button" onClick={() => applyDocumentValue(conflict)} className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-left text-sm hover:border-indigo-400 dark:border-amber-800 dark:bg-amber-950/30"><span className="block text-xs text-amber-600">Gunakan nilai dokumen</span>{conflict.incoming}</button></div></div>)}</div></section>}

      <form action={action} className="space-y-6">
        <input type="hidden" name="archiveIdsJson" value={archiveIdsJson} />
        <input type="hidden" name="conflictResolutionsJson" value={decisionsJson} />
        <section className="rounded-xl bg-white p-6 shadow-sm dark:bg-slate-800"><h3 className="mb-4 font-semibold text-slate-800 dark:text-slate-100">Data Utama</h3><div className="grid gap-4 sm:grid-cols-2"><Select label="Tipe Klien" name="type" value={values.type} onChange={(value) => setValue("type", value)} options={[["PERORANGAN","Perorangan"],["BADAN_HUKUM","Badan Hukum"]]} /><Input label="Nama Lengkap" name="name" value={values.name} onChange={(value) => setValue("name", value)} required /><Input label="NIK" name="nik" value={values.nik} onChange={(value) => setValue("nik", value)} /><Input label="Nomor KK" name="nomorKk" value={values.nomorKk} onChange={(value) => setValue("nomorKk", value)} /><Input label="NPWP" name="npwp" value={values.npwp} onChange={(value) => setValue("npwp", value)} /><Select label="Sapaan" name="gender" value={values.gender} onChange={(value) => setValue("gender", value)} options={[["","-"],["Tuan","Tuan"],["Nyonya","Nyonya"],["Nona","Nona"]]} /><Input label="Warga Negara" name="wargaNegara" value={values.wargaNegara} onChange={(value) => setValue("wargaNegara", value)} /></div></section>
        <section className="rounded-xl bg-white p-6 shadow-sm dark:bg-slate-800"><h3 className="mb-4 font-semibold text-slate-800 dark:text-slate-100">Kelahiran & Status</h3><div className="grid gap-4 sm:grid-cols-2"><Input label="Tempat Lahir" name="tempatLahir" value={values.tempatLahir} onChange={(value) => setValue("tempatLahir", value)} /><Input label="Tanggal Lahir" name="tanggalLahir" type="date" value={values.tanggalLahir} onChange={(value) => setValue("tanggalLahir", value)} /><Input label="Pekerjaan" name="pekerjaan" value={values.pekerjaan} onChange={(value) => setValue("pekerjaan", value)} /><Select label="Status Kawin" name="statusKawin" value={values.statusKawin} onChange={(value) => setValue("statusKawin", value)} options={[["","-"],["Belum Kawin","Belum Kawin"],["Kawin","Kawin"],["Cerai Hidup","Cerai Hidup"],["Cerai Mati","Cerai Mati"]]} /></div></section>
        <section className="rounded-xl bg-white p-6 shadow-sm dark:bg-slate-800"><h3 className="mb-4 font-semibold text-slate-800 dark:text-slate-100">Kontak</h3><div className="grid gap-4 sm:grid-cols-2"><Input label="Telepon / WA" name="phone" value={values.phone} onChange={(value) => setValue("phone", value)} /><Input label="Email" name="email" type="email" value={values.email} onChange={(value) => setValue("email", value)} /></div><div className="mt-4 space-y-4"><Textarea label="Alamat" name="address" value={values.address} onChange={(value) => setValue("address", value)} /><Textarea label="Catatan" name="notes" value={values.notes} onChange={(value) => setValue("notes", value)} /></div></section>
        <PendingButton disabled={isScanning || cancellingId !== "" || conflicts.length > 0} pendingLabel="Menyimpan Klien..." className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">{canScan ? "Simpan Klien dan Dokumen" : "Simpan Klien"}</PendingButton>
      </form>
    </div>
  );
}

function Input({ label, name, value, onChange, type = "text", required = false }: { label: string; name: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) { return <div><label htmlFor={name} className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{label}{required && <span className="text-red-500"> *</span>}</label><input id={name} name={name} type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} className={inputClass} /></div>; }
function Select({ label, name, value, onChange, options }: { label: string; name: string; value: string; onChange: (value: string) => void; options: string[][] }) { return <div><label htmlFor={name} className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</label><select id={name} name={name} value={value} onChange={(event) => onChange(event.target.value)} className={inputClass}>{options.map(([optionValue, labelValue]) => <option key={optionValue} value={optionValue}>{labelValue}</option>)}</select></div>; }
function Textarea({ label, name, value, onChange }: { label: string; name: string; value: string; onChange: (value: string) => void }) { return <div><label htmlFor={name} className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</label><textarea id={name} name={name} value={value} onChange={(event) => onChange(event.target.value)} rows={3} className={inputClass} /></div>; }
