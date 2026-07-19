import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { updatePekerjaanAction, deletePekerjaanAction } from "../actions";
import { PekerjaanDetailClient } from "./PekerjaanDetailClient";

export default async function PekerjaanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const { id } = await params;

  const pekerjaan = await prisma.pekerjaan.findFirst({
    where: { id, officeId: session!.user.officeId },
    include: {
      clients: {
        where: { client: { officeId: session!.user.officeId } },
        select: { clientId: true, peran: true },
        orderBy: { peran: "asc" },
      },
    },
  });

  if (!pekerjaan) notFound();

  const clients = await prisma.client.findMany({
    where: { officeId: session!.user.officeId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, nik: true },
  });

  const updateWithId = updatePekerjaanAction.bind(null, pekerjaan.id);
  const deleteWithId = deletePekerjaanAction.bind(null, pekerjaan.id);

  return (
    <PekerjaanDetailClient
      pekerjaan={JSON.parse(JSON.stringify(pekerjaan))}
      isNotaris={session!.user.role === "NOTARIS"}
      updateAction={updateWithId}
      deleteAction={deleteWithId}
      clients={clients}
    />
  );
}
