"use client";

import { useMemo, useState } from "react";
import type { TemplateFieldsDef } from "@/lib/templateFields";
import { formatIndonesianDateText, formatAktaDate, formatDisplayDate } from "@/lib/indoDate";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

export function GeneratorForm({
  templateId,
  sections,
  jobs,
}: {
  templateId: string;
  sections: TemplateFieldsDef;
  jobs: Array<{ id: string; label: string; values: Record<string, string> }>;
}) {
  // State semua nilai field, diawali default
  const initial = useMemo(() => {
    const values: Record<string, string> = {};
    for (const section of sections) {
      for (const field of section.fields) {
        values[field.name] = field.default ?? "";
      }
    }
    return values;
  }, [sections]);

  const [values, setValues] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pekerjaanId, setPekerjaanId] = useState("");

  function applyAutomaticValues(source: Record<string, string>) {
    const next = { ...source };
    for (const section of sections) {
      for (const field of section.fields) {
        if (field.type === "date-auto" && field.textTarget && next[field.name]) {
          next[field.textTarget] = formatIndonesianDateText(next[field.name]);
        }
      }
    }
    if (next.tanggal_akta) {
      const akta = formatAktaDate(next.tanggal_akta);
      if ("hari_akta" in next) next.hari_akta = akta.hari;
      if ("tanggal_akta_teks" in next) next.tanggal_akta_teks = akta.teks;
    } else {
      if ("hari_akta" in next) next.hari_akta = "";
      if ("tanggal_akta_teks" in next) next.tanggal_akta_teks = "";
    }
    return next;
  }

  function selectJob(id: string) {
    setPekerjaanId(id);
    const job = jobs.find((item) => item.id === id);
    if (!job) {
      setValues(initial);
      return;
    }
    setValues(applyAutomaticValues({ ...initial, ...job.values }));
  }

  function setValue(name: string, value: string) {
    setValues((prev) => {
      const next = { ...prev, [name]: value };

      // date-auto => isi field teks terbilang pasangannya
      for (const section of sections) {
        for (const field of section.fields) {
          if (field.name !== name) continue;

          if (field.type === "date-auto" && field.textTarget) {
            next[field.textTarget] = formatIndonesianDateText(value) || next[field.textTarget];
          }

          // tanggal_akta (type date) => hari_akta + tanggal_akta_teks jika ada
          if (field.type === "date" && name === "tanggal_akta") {
            const akta = formatAktaDate(value);
            if ("hari_akta" in next) next.hari_akta = akta.hari;
            if ("tanggal_akta_teks" in next) next.tanggal_akta_teks = akta.teks;
          }
        }
      }
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);

    try {
      // Normalisasi tampilan tanggal dd-mm-yyyy sebelum kirim
      const payload: Record<string, string> = { ...values };
      for (const section of sections) {
        for (const field of section.fields) {
          if (field.type === "date-auto" && payload[field.name]) {
            payload[field.name] = formatDisplayDate(payload[field.name]);
          }
        }
      }

      const res = await fetch(`/api/dokumen/${templateId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, __pekerjaanId: pekerjaanId }),
      });

      if (!res.ok) {
        setError(await res.text());
        return;
      }

      // Unduh hasil
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename\*=UTF-8''(.+)$/);
      const fileName = match ? decodeURIComponent(match[1]) : "dokumen.docx";

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
      <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-5 dark:border-indigo-800 dark:bg-indigo-950/30">
        <label htmlFor="pekerjaan" className="mb-1 block text-sm font-semibold text-indigo-900 dark:text-indigo-200">
          Ambil data dari pekerjaan
        </label>
        <p className="mb-3 text-xs text-indigo-700 dark:text-indigo-300">
          Opsional. Memilih pekerjaan akan mengisi data akta, kantor, pajak, dan para pihak secara otomatis.
        </p>
        <select
          id="pekerjaan"
          value={pekerjaanId}
          onChange={(event) => selectJob(event.target.value)}
          className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
        >
          <option value="">— Pilih pekerjaan —</option>
          {jobs.map((job) => <option key={job.id} value={job.id}>{job.label}</option>)}
        </select>
      </div>
      {sections.map((section) => (
        <div key={section.title} className="rounded-xl bg-white p-6 shadow-sm dark:bg-slate-800">
          <h3 className="mb-4 font-semibold text-slate-800 dark:text-slate-100">{section.title}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {section.fields.map((field) => (
              <div key={field.name} className={field.type === "readonly" ? "sm:col-span-2" : ""}>
                <label htmlFor={field.name} className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {field.label}
                </label>
                <input
                  id={field.name}
                  type={field.type === "date" ? "date" : "text"}
                  value={values[field.name] ?? ""}
                  readOnly={field.type === "readonly"}
                  onChange={(e) => setValue(field.name, e.target.value)}
                  placeholder={field.placeholder}
                  className={`${inputClass} ${field.type === "readonly" ? "bg-slate-50 text-slate-500 dark:bg-slate-700 dark:text-slate-400" : ""}`}
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      {error && (
        <pre className="whitespace-pre-wrap rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</pre>
      )}

      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-indigo-600 px-6 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {busy ? "Membuat dokumen..." : "Generate DOCX"}
      </button>
    </form>
  );
}
