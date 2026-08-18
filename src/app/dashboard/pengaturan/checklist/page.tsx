import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Breadcrumb } from "@/components/Breadcrumb";
import { prisma } from "@/lib/prisma";
import { ChecklistTemplateEditor } from "./ChecklistTemplateEditor";

export default async function ChecklistSettingsPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "NOTARIS") redirect("/dashboard/pengaturan");
  const templates = await prisma.checklistTemplate.findMany({
    where: { officeId: session.user.officeId },
    orderBy: [{ kind: "asc" }, { jenis: "asc" }],
    select: {
      id: true, name: true, kind: true, jenis: true, isActive: true, updatedAt: true,
      items: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { key: true, label: true, description: true, required: true, expectedType: true, sortOrder: true } },
    },
  });
  return <div className="space-y-6"><Breadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Pengaturan", href: "/dashboard/pengaturan" }, { label: "Checklist" }]} /><div><h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Template Checklist Dokumen</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Kelola dokumen yang perlu disiapkan untuk setiap jenis pekerjaan.</p></div><div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300"><strong>Perubahan tidak berlaku surut.</strong> Template hanya memengaruhi pekerjaan baru atau saat template diterapkan manual; checklist pekerjaan yang sudah ada tidak ditulis ulang.</div><ChecklistTemplateEditor key={templates.map((template) => `${template.id}:${template.updatedAt.toISOString()}`).join("|")} templates={templates.map((template) => ({ ...template, updatedAt: template.updatedAt.toISOString() }))} /></div>;
}
