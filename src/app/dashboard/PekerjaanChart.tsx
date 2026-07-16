"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface MonthlyData {
  month: string;
  notaris: number;
  ppat: number;
}

export function PekerjaanChart({ data }: { data: MonthlyData[] }) {
  if (data.length === 0) return null;

  return (
    <div className="rounded-xl border border-indigo-100 bg-white p-5 shadow-lg shadow-indigo-100/50">
      <h3 className="mb-4 font-semibold text-slate-800">Pekerjaan 6 Bulan Terakhir</h3>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip
            contentStyle={{ borderRadius: 12, border: "1px solid #e0e7ff", fontSize: 13 }}
          />
          <Bar dataKey="notaris" name="Notaris" fill="#6366f1" radius={[4, 4, 0, 0]} />
          <Bar dataKey="ppat" name="PPAT" fill="#a78bfa" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
