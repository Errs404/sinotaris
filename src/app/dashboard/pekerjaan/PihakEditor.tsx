"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, Users } from "lucide-react";

export interface ClientOption {
  id: string;
  name: string;
  nik: string | null;
}

export interface PihakValue {
  clientId: string;
  peran: string;
}

const commonRoles = [
  "Pemberi Kuasa",
  "Penerima Kuasa",
  "Debitor",
  "Kreditor",
  "Penjual",
  "Pembeli",
  "Suami/Istri",
  "Saksi 1",
  "Saksi 2",
  "Penghadap",
];

export function PihakEditor({
  clients,
  initialValues = [],
}: {
  clients: ClientOption[];
  initialValues?: PihakValue[];
}) {
  const [items, setItems] = useState<PihakValue[]>(initialValues);
  const serialized = useMemo(() => JSON.stringify(items), [items]);

  function addItem() {
    setItems((current) => [
      ...current,
      { clientId: clients[0]?.id ?? "", peran: "Penghadap" },
    ]);
  }

  function updateItem(index: number, key: keyof PihakValue, value: string) {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item,
      ),
    );
  }

  function removeItem(index: number) {
    setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-slate-800">
      <input type="hidden" name="partiesJson" value={serialized} />
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            <h3 className="font-semibold text-slate-800 dark:text-slate-100">
              Para Pihak
            </h3>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Pilih klien dan tentukan perannya dalam pekerjaan ini.
          </p>
        </div>
        <button
          type="button"
          onClick={addItem}
          disabled={clients.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-indigo-400 dark:hover:bg-slate-700"
        >
          <Plus className="h-4 w-4" /> Tambah Pihak
        </button>
      </div>

      {clients.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">
          Belum ada klien. Tambahkan klien terlebih dahulu sebelum memilih pihak.
        </p>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">
          Belum ada pihak yang dipilih.
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((item, index) => (
            <div
              key={`${item.clientId}-${index}`}
              className="grid gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700 sm:grid-cols-[1fr_1fr_auto]"
            >
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  Klien
                </label>
                <select
                  value={item.clientId}
                  onChange={(event) => updateItem(index, "clientId", event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                >
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}{client.nik ? ` — ${client.nik}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  Peran
                </label>
                <input
                  list={`roles-${index}`}
                  value={item.peran}
                  onChange={(event) => updateItem(index, "peran", event.target.value)}
                  placeholder="Contoh: Pemberi Kuasa"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                />
                <datalist id={`roles-${index}`}>
                  {commonRoles.map((role) => <option key={role} value={role} />)}
                </datalist>
              </div>
              <button
                type="button"
                onClick={() => removeItem(index)}
                className="self-end rounded-lg p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
                aria-label={`Hapus pihak ${index + 1}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
