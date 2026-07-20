import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { updateClientAction, deleteClientAction } from "../actions";
import { KlienDetailClient } from "./KlienDetailClient";

export default async function KlienDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const { id } = await params;

  const client = await prisma.client.findFirst({
    where: { id, officeId: session!.user.officeId },
    include: {
      pekerjaanList: {
        where: { pekerjaan: { officeId: session!.user.officeId } },
        include: { pekerjaan: true },
        orderBy: { pekerjaan: { updatedAt: "desc" } },
      },
    },
  });

  if (!client) notFound();
  const archives = session!.user.role === "NOTARIS"
    ? await prisma.documentArchive.findMany({
        where: { officeId: session!.user.officeId, clientId: client.id },
        orderBy: { createdAt: "desc" },
        select: { id: true, originalName: true, type: true, status: true, sizeBytes: true, createdAt: true },
      })
    : [];

  const updateWithId = updateClientAction.bind(null, client.id);
  const deleteWithId = deleteClientAction.bind(null, client.id);

  return (
    <KlienDetailClient
      client={client}
      history={client.pekerjaanList.map((item) => ({
        id: item.pekerjaan.id,
        judul: item.pekerjaan.judul,
        jenis: item.pekerjaan.jenis,
        status: item.pekerjaan.status,
        peran: item.peran,
        tanggalAkta: item.pekerjaan.tanggalAkta?.toISOString() ?? null,
      }))}
      documents={archives.map((archive) => ({ ...archive, createdAt: archive.createdAt.toISOString() }))}
      canViewDocuments={session!.user.role === "NOTARIS"}
      updateAction={updateWithId}
      deleteAction={deleteWithId}
    />
  );
}
