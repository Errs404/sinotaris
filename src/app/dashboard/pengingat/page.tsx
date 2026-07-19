import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { inputClass } from "@/components/form";
import { createReminderAction, toggleReminderAction, deleteReminderAction } from "./actions";

const typeLabel: Record<string, string> = {
  LAPOR_WASIAT: "Lapor Wasiat",
  LAPOR_BULANAN: "Laporan Bulanan",
  PAJAK: "Pajak",
  LAINNYA: "Lainnya",
};

export default async function PengingatPage() {
  const session = await auth();

  const reminders = await prisma.reminder.findMany({
    where: { officeId: session!.user.officeId },
    orderBy: [{ done: "asc" }, { dueDate: "asc" }],
    take: 100,
  });

  const now = new Date();

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Pengingat</h2>

      <form
        action={createReminderAction}
        className="flex flex-wrap items-end gap-3 rounded-xl bg-white p-5 shadow-sm dark:bg-slate-800"
      >
        <div className="min-w-64 flex-1">
          <label htmlFor="title" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Judul
          </label>
          <input
            id="title"
            name="title"
            required
            placeholder="Contoh: Lapor daftar wasiat bulan Juli"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="dueDate" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Jatuh Tempo
          </label>
          <input id="dueDate" name="dueDate" type="date" required className={inputClass} />
        </div>
        <div>
          <label htmlFor="type" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Jenis
          </label>
          <select id="type" name="type" className={inputClass}>
            <option value="LAPOR_WASIAT">Lapor Wasiat</option>
            <option value="LAPOR_BULANAN">Laporan Bulanan</option>
            <option value="PAJAK">Pajak</option>
            <option value="LAINNYA">Lainnya</option>
          </select>
        </div>
        <button className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">
          + Tambah
        </button>
      </form>

      <div className="space-y-2">
        {reminders.length === 0 && (
          <p className="rounded-xl bg-white p-8 text-center text-slate-400 shadow-sm dark:bg-slate-800">
            Belum ada pengingat.
          </p>
        )}
        {reminders.map((reminder) => {
          const overdue = !reminder.done && reminder.dueDate < now;
          const toggle = toggleReminderAction.bind(null, reminder.id);
          const remove = deleteReminderAction.bind(null, reminder.id);
          return (
            <div
              key={reminder.id}
              className={`flex flex-wrap items-center gap-3 rounded-xl bg-white px-5 py-3 shadow-sm dark:bg-slate-800 ${
                reminder.done ? "opacity-60" : ""
              }`}
            >
              <form action={toggle}>
                <button
                  title={reminder.done ? "Tandai belum selesai" : "Tandai selesai"}
                  className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-bold ${
                    reminder.done
                      ? "border-indigo-600 bg-indigo-600 text-white"
                      : "border-slate-300 text-transparent hover:border-indigo-500"
                  }`}
                >
                  ✓
                </button>
              </form>
              <div className="flex-1">
                <p className={`font-medium text-slate-800 dark:text-slate-100 ${reminder.done ? "line-through" : ""}`}>
                  {reminder.title}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{typeLabel[reminder.type]}</p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  overdue ? "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300" : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                }`}
              >
                {overdue ? "TERLAMBAT — " : ""}
                {reminder.dueDate.toLocaleDateString("id-ID")}
              </span>
              <form action={remove}>
                <button className="text-sm text-red-500 hover:underline">Hapus</button>
              </form>
            </div>
          );
        })}
      </div>
    </div>
  );
}
