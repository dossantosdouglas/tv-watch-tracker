import { NextRequest, NextResponse } from "next/server";
import { verifyPin } from "@/lib/auth";
import { deleteMedia, patchMedia } from "@/lib/tracker-service";
import { MediaPatchAction } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!verifyPin(req)) {
    return NextResponse.json(
      { error: "PIN inválido ou ausente" },
      { status: 401 }
    );
  }

  try {
    const { id } = await context.params;
    const body = (await req.json()) as MediaPatchAction;
    const media = await patchMedia(id, body);
    return NextResponse.json({ media });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Erro ao atualizar obra";
    const status = message === "Obra não encontrada" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!verifyPin(req)) {
    return NextResponse.json(
      { error: "PIN inválido ou ausente" },
      { status: 401 }
    );
  }

  try {
    const { id } = await context.params;
    await deleteMedia(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Erro ao excluir obra";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
