import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { getSubscriptionState } from "@/lib/subscription";
import { SidebarNav } from "@/components/SidebarNav";

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
    <div className="flex min-h-screen bg-gradient-to-br from-indigo-50 via-slate-50 to-indigo-100">
      <aside className="hidden w-64 flex-col border-r border-indigo-100 bg-white/90 backdrop-blur md:flex">
        <div className="border-b border-indigo-100 px-6 py-5">
          <h1 className="text-xl font-extrabold tracking-tight text-indigo-700">
            Sinotaris
          </h1>
          <p className="mt-0.5 text-xs font-medium text-slate-400">
            Notaris &amp; PPAT
          </p>
        </div>
        <SidebarNav items={navItems} />
        <div className="border-t border-indigo-100 px-6 py-4 text-xs text-slate-500">
          <p className="font-semibold text-slate-700">{session.user.name}</p>
          <p>{session.user.role === "NOTARIS" ? "Notaris (Admin)" : "Staf"}</p>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
            className="mt-3"
          >
            <button className="rounded-md border border-indigo-200 px-3 py-1.5 font-medium text-indigo-700 hover:bg-indigo-50">
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
