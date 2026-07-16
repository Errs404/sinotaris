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
  });

  if (!client) notFound();

  const updateWithId = updateClientAction.bind(null, client.id);
  const deleteWithId = deleteClientAction.bind(null, client.id);

  return <KlienDetailClient client={client} updateAction={updateWithId} deleteAction={deleteWithId} />;
}
