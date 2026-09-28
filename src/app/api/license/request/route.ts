import { NextResponse } from "next/server";
import { requireSession } from "@/auth";
import { requireCurrentNotaris } from "@/lib/currentActor";
import { buildLicenseRequest } from "@/lib/installation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireSession();
    const actor = await requireCurrentNotaris(session.user.id);
    const request = await buildLicenseRequest(actor.officeId);
    return new NextResponse(`${JSON.stringify(request, null, 2)}\n`, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="sinotaris-${request.installationId}.sreq"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Permintaan lisensi gagal dibuat.";
    return NextResponse.json({ error: message }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
}
