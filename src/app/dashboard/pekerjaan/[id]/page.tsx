import { notFound } from "next/navigation";
import type { PekerjaanStatus } from "@/generated/prisma/enums";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { safePekerjaanTimelineDescription, type PekerjaanTimelineAction } from "@/lib/pekerjaanUi";
import { deletePekerjaanAction, transitionPekerjaanAction, updatePekerjaanAction } from "../actions";
import { PekerjaanDetailClient, type PekerjaanDetailDto, type PekerjaanTimelineItem } from "./PekerjaanDetailClient";

const TIMELINE_ACTIONS = [
  "PEKERJAAN_CREATE",
  "PEKERJAAN_UPDATE",
  "PEKERJAAN_WORKFLOW_UPDATE",
  "PEKERJAAN_STATUS_CHANGE",
] as const;

export default async function PekerjaanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  const officeId = session!.user.officeId;

  const [pekerjaan, clients, users, auditLogs] = await Promise.all([
    prisma.pekerjaan.findFirst({
      where: { id, officeId },
      select: {
        id: true, kind: true, jenis: true, judul: true, nomorAkta: true, tanggalAkta: true,
        status: true, keterangan: true, bentukHukum: true, pihakAlih: true, pihakTerima: true,
        luasTanah: true, luasBangunan: true, hargaTransaksi: true, nop: true, bphtb: true,
        pphFinal: true, honorarium: true, picId: true, dueDate: true, priority: true,
        internalNotes: true, completedAt: true, updatedAt: true,
        clients: {
          where: { client: { officeId } },
          select: { clientId: true, peran: true, client: { select: { name: true } } },
          orderBy: { peran: "asc" },
        },
      },
    }),
    prisma.client.findMany({
      where: { officeId }, orderBy: { name: "asc" }, select: { id: true, name: true, nik: true },
    }),
    prisma.user.findMany({
      where: { officeId }, orderBy: { name: "asc" }, select: { id: true, name: true, role: true, isActive: true },
    }),
    prisma.auditLog.findMany({
      where: { officeId, targetType: "PEKERJAAN", targetId: id, action: { in: [...TIMELINE_ACTIONS] } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, actorId: true, actorRole: true, action: true, metadata: true, createdAt: true },
    }),
  ]);

  if (!pekerjaan) notFound();

  const activeUsers = users.filter((user) => user.isActive).map(({ id: userId, name, role }) => ({ id: userId, name, role }));
  const actorNames = new Map(users.map((user) => [user.id, user.name]));
  const timeline: PekerjaanTimelineItem[] = auditLogs.map((log) => ({
    id: log.id,
    category: log.action === "PEKERJAAN_CREATE" ? "create"
      : log.action === "PEKERJAAN_STATUS_CHANGE" ? "status"
      : log.action === "PEKERJAAN_WORKFLOW_UPDATE" ? "workflow" : "general",
    actorName: log.actorId ? actorNames.get(log.actorId) ?? "Pengguna lama/Sistem" : "Pengguna lama/Sistem",
    actorRole: log.actorRole === "NOTARIS" ? "Notaris" : log.actorRole === "STAF" ? "Staf" : "Sistem",
    description: safePekerjaanTimelineDescription(
      log.action as PekerjaanTimelineAction,
      log.metadata,
      session!.user.role,
    ),
    createdAt: log.createdAt.toISOString(),
  }));

  const dto: PekerjaanDetailDto = {
    ...pekerjaan,
    tanggalAkta: pekerjaan.tanggalAkta?.toISOString() ?? null,
    dueDate: pekerjaan.dueDate?.toISOString() ?? null,
    completedAt: pekerjaan.completedAt?.toISOString() ?? null,
    updatedAt: pekerjaan.updatedAt.toISOString(),
    luasTanah: pekerjaan.luasTanah?.toString() ?? null,
    luasBangunan: pekerjaan.luasBangunan?.toString() ?? null,
    hargaTransaksi: pekerjaan.hargaTransaksi?.toString() ?? null,
    bphtb: pekerjaan.bphtb?.toString() ?? null,
    pphFinal: pekerjaan.pphFinal?.toString() ?? null,
    honorarium: session!.user.role === "NOTARIS" ? pekerjaan.honorarium?.toString() ?? null : undefined,
    clients: pekerjaan.clients.map((party) => ({ clientId: party.clientId, peran: party.peran, name: party.client.name })),
  };

  const expectedUpdatedAt = pekerjaan.updatedAt.toISOString();
  const transitionActions = Object.fromEntries(
    (["MASUK", "PROSES", "TANDA_TANGAN", "SELESAI", "DIBATALKAN"] as PekerjaanStatus[])
      .map((nextStatus) => [nextStatus, transitionPekerjaanAction.bind(null, pekerjaan.id, expectedUpdatedAt, nextStatus)]),
  );

  return (
    <PekerjaanDetailClient
      pekerjaan={dto}
      role={session!.user.role === "NOTARIS" ? "NOTARIS" : "STAF"}
      currentActorId={session!.user.id}
      updateAction={updatePekerjaanAction.bind(null, pekerjaan.id)}
      deleteAction={session!.user.role === "NOTARIS"
        ? deletePekerjaanAction.bind(null, pekerjaan.id, expectedUpdatedAt)
        : undefined}
      transitionActions={transitionActions}
      clients={clients}
      users={activeUsers}
      timeline={timeline}
    />
  );
}
