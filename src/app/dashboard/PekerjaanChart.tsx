"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-indigo-100 bg-white p-3 text-sm shadow-lg dark:border-slate-600 dark:bg-slate-900">
      <p className="mb-1 font-semibold text-slate-800 dark:text-slate-100">{label}</p>
      {payload.map((item) => (
        <p key={item.name} style={{ color: item.color }}>
          {item.name}: {item.value}
        </p>
      ))}
    </div>
  );
}

interface MonthlyData {
  month: string;
  notaris: number;
  ppat: number;
}

export function PekerjaanChart({ data }: { data: MonthlyData[] }) {
  if (data.length === 0) return null;

  return (
    <div className="rounded-xl border border-indigo-100 bg-white p-5 shadow-lg shadow-indigo-100/50 dark:border-slate-700 dark:bg-slate-800 dark:shadow-none">
      <h3 className="mb-4 font-semibold text-slate-800 dark:text-slate-100">Pekerjaan 6 Bulan Terakhir</h3>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip content={<ChartTooltip />} />
          <Bar dataKey="notaris" name="Notaris" fill="#6366f1" radius={[4, 4, 0, 0]} />
          <Bar dataKey="ppat" name="PPAT" fill="#a78bfa" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
