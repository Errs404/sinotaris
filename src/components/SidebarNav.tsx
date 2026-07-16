"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Briefcase,
  Calculator,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Receipt,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

const iconMap: Record<string, LucideIcon> = {
  LayoutDashboard,
  Users,
  Briefcase,
  FileText,
  Receipt,
  ClipboardList,
  Bell,
  Calculator,
  Settings,
};

export interface NavItem {
  href: string;
  label: string;
  icon: string;
}

export function SidebarNav({
  items,
  onNavigate,
}: {
  items: NavItem[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-1 px-3 py-4">
      {items.map((item) => {
        const active =
          item.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(item.href);
        const Icon = iconMap[item.icon];

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              active
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-200"
                : "text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
            }`}
          >
            {Icon && (
              <Icon
                aria-hidden="true"
                className={`h-5 w-5 shrink-0 ${active ? "" : "opacity-70"}`}
              />
            )}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
