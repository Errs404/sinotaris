import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { getSubscriptionState } from "@/lib/subscription";
import { MobileDrawer } from "@/components/MobileDrawer";
import { SidebarNav } from "@/components/SidebarNav";
import { ToastProvider } from "@/components/Toast";
import { ThemeToggle } from "@/components/ThemeProvider";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
  { href: "/dashboard/klien", label: "Klien", icon: "Users" },
  { href: "/dashboard/pekerjaan", label: "Pekerjaan", icon: "Briefcase" },
  { href: "/dashboard/dokumen", label: "Generator Dokumen", icon: "FileText" },
  { href: "/dashboard/invoice", label: "Invoice", icon: "Receipt" },
  { href: "/dashboard/laporan", label: "Laporan Bulanan", icon: "ClipboardList" },
  { href: "/dashboard/pengingat", label: "Pengingat", icon: "Bell" },
  { href: "/dashboard/kalkulator", label: "Kalkulator", icon: "Calculator" },
  { href: "/dashboard/pengaturan", label: "Pengaturan", icon: "Settings" },
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
    <ToastProvider>
      <div className="flex min-h-screen bg-gradient-to-br from-indigo-50 via-slate-50 to-indigo-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
        <aside className="hidden w-64 flex-col border-r border-indigo-100 bg-white/90 backdrop-blur dark:border-slate-700 dark:bg-slate-900/90 md:flex">
          <div className="border-b border-indigo-100 px-6 py-5 dark:border-slate-700">
            <h1 className="text-xl font-extrabold tracking-tight text-indigo-700 dark:text-indigo-400">
              Sinotaris
            </h1>
            <p className="mt-0.5 text-xs font-medium text-slate-400 dark:text-slate-500">
              Notaris &amp; PPAT
            </p>
          </div>
          <SidebarNav items={navItems} />
          <div className="border-t border-indigo-100 px-6 py-4 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
            <p className="font-semibold text-slate-700 dark:text-slate-200">{session.user.name}</p>
            <p>{session.user.role === "NOTARIS" ? "Notaris (Admin)" : "Staf"}</p>
            <div className="mt-3 flex items-center gap-2">
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/login" });
                }}
              >
                <button className="rounded-md border border-indigo-200 px-3 py-1.5 font-medium text-indigo-700 hover:bg-indigo-50 dark:border-slate-600 dark:text-indigo-400 dark:hover:bg-slate-700">
                  Keluar
                </button>
              </form>
              <ThemeToggle />
            </div>
          </div>
        </aside>

        <div className="flex flex-1 flex-col">
          <MobileDrawer
            navItems={navItems}
            userName={session.user.name}
            userRole={session.user.role}
          />
          {subscription.readOnly && (
            <div className="bg-amber-500 px-6 py-2 text-center text-sm font-medium text-white">
              Langganan tidak aktif — mode baca saja. Perpanjang langganan untuk
              menambah atau mengubah data.
            </div>
          )}
          <main className="flex-1 p-4 md:p-6">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
