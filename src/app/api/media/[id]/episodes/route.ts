import { NextRequest, NextResponse } from "next/server";
import { getMediaEpisodesWithStatus } from "@/lib/tracker-service";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const data = await getMediaEpisodesWithStatus(id);
    return NextResponse.json(data);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Erro ao buscar episódios";
    const status = message === "Obra não encontrada" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
