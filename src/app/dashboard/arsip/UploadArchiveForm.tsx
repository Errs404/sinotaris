"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import Image from "next/image";
import { AlertTriangle, LoaderCircle, ScanText, Upload } from "lucide-react";
import { inputClass } from "@/components/form";
import { archiveTypeLabels } from "@/lib/archiveTypes";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-70">
      {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ScanText className="h-4 w-4" />}
      {pending ? "Membaca dokumen secara lokal..." : "Pindai dan ekstrak"}
    </button>
  );
}

export function UploadArchiveForm({
  action,
  clients,
  jobs,
}: {
  action: (formData: FormData) => Promise<void>;
  clients: Array<{ id: string; name: string }>;
  jobs: Array<{ id: string; judul: string }>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");

  function selectFile(nextFile: File | null) {
    if (preview) URL.revokeObjectURL(preview);
    setFile(nextFile);
    setPreview(nextFile?.type.startsWith("image/") ? URL.createObjectURL(nextFile) : "");
  }

  return (
    <form action={action} className="rounded-xl border border-indigo-100 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-5 flex items-center gap-2">
        <Upload className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
        <h3 className="font-semibold text-slate-800 dark:text-slate-100">Unggah dan ekstrak dokumen</h3>
      </div>
      <div className="mb-4 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>PDF hasil scan belum dapat di-OCR per halaman. Untuk dokumen scan, unggah halaman sebagai JPG, PNG, atau WEBP.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="archive-file" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">File *</label>
          <input id="archive-file" name="file" type="file" required accept=".pdf,.docx,.jpg,.jpeg,.png,.webp" onChange={(event) => selectFile(event.target.files?.[0] ?? null)} className={inputClass} />
          <p className="mt-1 text-xs text-slate-400">Maksimal 15 MB. Proses OCR berjalan lokal dan dapat memerlukan beberapa detik.</p>
          {file && <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-300">{file.name} · {(file.size / 1024).toFixed(1)} KB</p>}
          {preview && <Image unoptimized src={preview} alt="Pratinjau file yang dipilih" width={640} height={360} className="mt-3 max-h-52 w-auto rounded-lg border border-slate-200 object-contain dark:border-slate-700" />}
        </div>
        <div>
          <label htmlFor="archive-type" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Jenis dokumen *</label>
          <select id="archive-type" name="type" className={inputClass} defaultValue="" required>
            <option value="" disabled>— Pilih jenis dokumen —</option>
            {Object.entries(archiveTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="archive-client" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Hubungkan ke Klien (opsional)</label>
          <select id="archive-client" name="clientId" className={inputClass} defaultValue="">
            <option value="">— Belum dihubungkan —</option>
            {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="archive-job" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Hubungkan ke Pekerjaan (opsional)</label>
          <select id="archive-job" name="pekerjaanId" className={inputClass} defaultValue="">
            <option value="">— Belum dihubungkan —</option>
            {jobs.map((job) => <option key={job.id} value={job.id}>{job.judul}</option>)}
          </select>
        </div>
      </div>
      <SubmitButton />
    </form>
  );
}
