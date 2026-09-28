"use client";

import { useMemo, useState } from "react";
import { Landmark, Plus, Trash2 } from "lucide-react";

export interface LandObjectValue {
  label: string;
  hakType: string;
  certificateNumber: string;
  nib: string;
  nop: string;
  address: string;
  luasTanah: string;
  luasBangunan: string;
}

const emptyObject: LandObjectValue = {
  label: "Objek tanah", hakType: "", certificateNumber: "", nib: "", nop: "",
  address: "", luasTanah: "", luasBangunan: "",
};

export function LandObjectEditor({ initialValues = [] }: { initialValues?: LandObjectValue[] }) {
  const [items, setItems] = useState(initialValues);
  const serialized = useMemo(() => JSON.stringify(items), [items]);
  const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200";

  function update(index: number, key: keyof LandObjectValue, value: string) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item));
  }

  return (
    <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-slate-800">
      <input type="hidden" name="landObjectsJson" value={serialized} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><Landmark className="h-5 w-5 text-indigo-600" /><h3 className="font-semibold text-slate-800 dark:text-slate-100">Objek Tanah PPAT</h3></div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Opsional dan dapat memuat lebih dari satu bidang. Objek pertama dipakai untuk kompatibilitas laporan lama. Hapus semua objek sebelum mengubah jabatan ke Notaris.</p>
        </div>
        <button type="button" onClick={() => setItems((current) => [...current, { ...emptyObject }])} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 dark:border-slate-600 dark:text-indigo-400 dark:hover:bg-slate-700"><Plus className="h-4 w-4" /> Tambah Objek</button>
      </div>
      {items.length === 0 ? <p className="mt-4 rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-slate-600">Belum ada objek tanah.</p> : (
        <div className="mt-4 space-y-4">{items.map((item, index) => (
          <fieldset key={index} className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
            <legend className="px-1 text-sm font-semibold text-slate-700 dark:text-slate-200">Objek {index + 1}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {(["label", "hakType", "certificateNumber", "nib", "nop"] as const).map((key) => (
                <label key={key} className={key === "label" ? "sm:col-span-2" : ""}><span className="mb-1 block text-xs font-medium text-slate-500">{{ label: "Nama/Label", hakType: "Jenis Hak", certificateNumber: "Nomor Sertipikat", nib: "NIB", nop: "NOP" }[key]}</span><input value={item[key]} maxLength={key === "label" ? 120 : 100} onChange={(event) => update(index, key, event.target.value)} className={inputClass} /></label>
              ))}
              <label><span className="mb-1 block text-xs font-medium text-slate-500">Luas Tanah (m²)</span><input value={item.luasTanah} inputMode="decimal" onChange={(event) => update(index, "luasTanah", event.target.value)} className={inputClass} /></label>
              <label><span className="mb-1 block text-xs font-medium text-slate-500">Luas Bangunan (m²)</span><input value={item.luasBangunan} inputMode="decimal" onChange={(event) => update(index, "luasBangunan", event.target.value)} className={inputClass} /></label>
              <label className="sm:col-span-2"><span className="mb-1 block text-xs font-medium text-slate-500">Alamat/Lokasi</span><textarea value={item.address} maxLength={1000} rows={2} onChange={(event) => update(index, "address", event.target.value)} className={inputClass} /></label>
            </div>
            <button type="button" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-red-600"><Trash2 className="h-4 w-4" /> Hapus objek</button>
          </fieldset>
        ))}</div>
      )}
    </div>
  );
}
