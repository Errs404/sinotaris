"use client";
import { useState } from "react";
import { inputClass } from "@/components/form";
export type AppointmentOption = { id: string; kind: string; notaryName: string; version: number; status: string; effectiveFrom: Date | string | null; effectiveUntil: Date | string | null };
export function AppointmentSelector({ appointments, defaultKind, defaultId }: { appointments: AppointmentOption[]; defaultKind: string; defaultId?: string | null }) {
  const [kind, setKind] = useState(defaultKind);
  const [id, setId] = useState(defaultId ?? "");
  const options = appointments.filter(a => kind === "PPAT" ? a.kind === "PPAT" : a.kind !== "PPAT");
  const selected = options.find(a => a.id === id);
  return <div className="space-y-4 sm:col-span-2"><label className="block text-sm">Jabatan<select name="kind" className={inputClass} value={kind} onChange={e => { setKind(e.target.value); setId(""); }}><option value="NOTARIS">Notaris</option><option value="PPAT">PPAT</option></select></label><label className="block text-sm">Pengangkatan *<select name="appointmentId" required className={inputClass} value={id} onChange={e => setId(e.target.value)}><option value="">Pilih pengangkatan</option>{options.map(a => <option key={a.id} value={a.id} disabled={a.status !== "PUBLISHED" && a.id !== defaultId}>{a.notaryName} · {a.kind} · v{a.version} · {a.status}</option>)}</select></label>{selected ? <p className="text-xs text-slate-500">Referensi: {selected.notaryName} · {selected.kind} · v{selected.version} · {selected.status} · {selected.effectiveFrom ? new Date(selected.effectiveFrom).toISOString().slice(0, 10) : "Tanpa awal"} — {selected.effectiveUntil ? new Date(selected.effectiveUntil).toISOString().slice(0, 10) : "Tanpa akhir"}</p> : <p className="text-xs text-amber-700">Pengangkatan terbit yang berlaku wajib dipilih. Hubungi Notaris bila belum tersedia.</p>}</div>;
}
