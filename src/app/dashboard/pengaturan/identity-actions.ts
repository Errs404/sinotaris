"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireCurrentNotaris } from "@/lib/currentActor";
import { assertWritable } from "@/lib/subscription";
import { createIdentityDraft, mutateIdentityVersion, type IdentityEntity } from "@/lib/officeIdentity";

/** Strict form boundary; duplicate fields and file payloads are not accepted. */
function input(form: FormData, entity: IdentityEntity) {
  const data: Record<string, string> = {};
  const allowed = new Set(["id", "updatedAt", "reason", "effectiveFrom", "effectiveUntil", ...(entity === "profile"
    ? ["officeName", "address", "phone", "email", "logoStorageKey"]
    : ["kind", "notaryName", "title", "workArea", "decreeNumber", "decreeDate", "decreeDateText", "supersedesId"])]);
  for (const [key, value] of form.entries()) {
    if (key.startsWith("$ACTION_")) continue;
    if (!allowed.has(key) || typeof value !== "string" || Object.hasOwn(data, key)) throw new Error("Form identitas tidak valid.");
    data[key] = value;
  }
  return data;
}

export async function createOfficeIdentityDraftAction(entity: IdentityEntity, form: FormData) {
  if (entity !== "profile" && entity !== "appointment") throw new Error("Jenis identitas tidak valid.");
  const session = await requireSession();
  const data = input(form, entity);
  const result = await prisma.$transaction(async (tx) => {
    const actor = await requireCurrentNotaris(session.user.id, tx);
    await assertWritable(actor.officeId, tx);
    return createIdentityDraft(tx, actor, entity, data);
  });
  revalidatePath("/dashboard/pengaturan");
  revalidatePath("/dashboard/pengaturan/identitas");
  return { id: result.id, updatedAt: result.updatedAt.toISOString(), version: result.version };
}

export async function mutateOfficeIdentityAction(entity: IdentityEntity, operation: "update" | "delete" | "publish" | "retire", form: FormData) {
  if (entity !== "profile" && entity !== "appointment") throw new Error("Jenis identitas tidak valid.");
  if (!["update", "delete", "publish", "retire"].includes(operation)) throw new Error("Operasi tidak valid.");
  const session = await requireSession();
  const data = input(form, entity);
  if (!data.id || !data.updatedAt || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(data.updatedAt)) throw new Error("Token versi wajib diisi.");
  await prisma.$transaction(async (tx) => {
    const actor = await requireCurrentNotaris(session.user.id, tx);
    await assertWritable(actor.officeId, tx);
    await mutateIdentityVersion(tx, actor, entity, data.id, new Date(data.updatedAt), operation, data);
  });
  revalidatePath("/dashboard/pengaturan");
  revalidatePath("/dashboard/pengaturan/identitas");
}
