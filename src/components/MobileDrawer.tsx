"use client";

import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { signOut } from "next-auth/react";
import { SidebarNav, type NavItem } from "@/components/SidebarNav";

interface MobileDrawerProps {
  navItems: NavItem[];
  userName?: string | null;
  userRole?: string | null;
}

export function MobileDrawer({
  navItems,
  userName,
  userRole,
}: MobileDrawerProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <header className="flex items-center justify-between border-b border-indigo-100 bg-white px-4 py-3 md:hidden">
        <div>
          <h1 className="text-lg font-extrabold tracking-tight text-indigo-700">
            Sinotaris
          </h1>
          <p className="text-xs font-medium text-slate-400">Notaris &amp; PPAT</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-indigo-100 text-indigo-700 transition-colors hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          aria-label="Buka menu navigasi"
          aria-expanded={open}
        >
          <Menu aria-hidden="true" className="h-5 w-5" />
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/50"
            onClick={() => setOpen(false)}
            aria-label="Tutup menu navigasi"
          />
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col border-r border-indigo-100 bg-white shadow-xl">
            <div className="flex items-start justify-between border-b border-indigo-100 px-6 py-5">
              <div>
                <h1 className="text-xl font-extrabold tracking-tight text-indigo-700">
                  Sinotaris
                </h1>
                <p className="mt-0.5 text-xs font-medium text-slate-400">
                  Notaris &amp; PPAT
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-indigo-50 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                aria-label="Tutup menu navigasi"
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>
            <SidebarNav items={navItems} onNavigate={() => setOpen(false)} />
            <div className="border-t border-indigo-100 px-6 py-4 text-xs text-slate-500">
              <p className="font-semibold text-slate-700">{userName}</p>
              <p>{userRole === "NOTARIS" ? "Notaris (Admin)" : "Staf"}</p>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="mt-3 rounded-md border border-indigo-200 px-3 py-1.5 font-medium text-indigo-700 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                Keluar
              </button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
