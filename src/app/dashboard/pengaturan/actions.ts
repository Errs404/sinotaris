"use server";

import { requireNotaris } from "@/auth";

export async function updateOfficeAction(_formData: FormData) {
  void _formData;
  await requireNotaris();
  // Fail explicitly rather than silently creating drafts behind the legacy UI's success message.
  throw new Error("Identitas kantor kini dikelola melalui draft dan penerbitan versi. Penyuntingan langsung dinonaktifkan.");
}
