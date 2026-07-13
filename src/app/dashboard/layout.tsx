import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { getSubscriptionState } from "@/lib/subscription";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/dashboard/klien", label: "Klien", icon: "👥" },
  { href: "/dashboard/pekerjaan", label: "Pekerjaan", icon: "📁" },
  { href: "/dashboard/dokumen", label: "Generator Dokumen", icon: "📄" },
  { href: "/dashboard/invoice", label: "Invoice", icon: "🧾" },
  { href: "/dashboard/laporan", label: "Laporan Bulanan", icon: "📑" },
  { href: "/dashboard/pengingat", label: "Pengingat", icon: "🔔" },
  { href: "/dashboard/kalkulator", label: "Kalkulator", icon: "🧮" },
  { href: "/dashboard/pengaturan", label: "Pengaturan", icon: "⚙️" },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const subscription = await getSubscriptionState(session.user.officeId);

  return (
    <div className="flex min-h-screen bg-slate-100">
      <aside className="hidden w-64 flex-col bg-slate-900 text-slate-100 md:flex">
        <div className="border-b border-slate-700 px-6 py-5">
          <h1 className="text-xl font-bold text-emerald-400">Sinotaris</h1>
          <p className="mt-0.5 text-xs text-slate-400">Notaris &amp; PPAT</p>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-slate-800"
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-slate-700 px-6 py-4 text-xs text-slate-400">
          <p className="font-medium text-slate-200">{session.user.name}</p>
          <p>{session.user.role === "NOTARIS" ? "Notaris (Admin)" : "Staf"}</p>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
            className="mt-3"
          >
            <button className="rounded-md bg-slate-800 px-3 py-1.5 text-slate-200 hover:bg-slate-700">
              Keluar
            </button>
          </form>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        {subscription.readOnly && (
          <div className="bg-amber-500 px-6 py-2 text-center text-sm font-medium text-white">
            Langganan tidak aktif — mode baca saja. Perpanjang langganan untuk
            menambah atau mengubah data.
          </div>
        )}
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
