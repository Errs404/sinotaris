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
  });

  if (!pekerjaan) notFound();

  const updateWithId = updatePekerjaanAction.bind(null, pekerjaan.id);
  const deleteWithId = deletePekerjaanAction.bind(null, pekerjaan.id);

  return (
    <PekerjaanDetailClient
      pekerjaan={JSON.parse(JSON.stringify(pekerjaan))}
      isNotaris={session!.user.role === "NOTARIS"}
      updateAction={updateWithId}
      deleteAction={deleteWithId}
    />
  );
}
