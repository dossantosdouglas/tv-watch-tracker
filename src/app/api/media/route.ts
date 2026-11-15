import { NextRequest, NextResponse } from "next/server";
import { getExpectedPin, verifyPin } from "@/lib/auth";
import {
  createManualMedia,
  listMediaWithDetails,
} from "@/lib/tracker-service";
import { MediaType, SearchResult, WatchStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const status = req.nextUrl.searchParams.get("status");
    const type = req.nextUrl.searchParams.get("type");
    const q = req.nextUrl.searchParams.get("q");

    const data = await listMediaWithDetails({ status, type, q });
    return NextResponse.json({
      ...data,
      pinRequired: Boolean(getExpectedPin()),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Erro ao listar obras";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!verifyPin(req)) {
    return NextResponse.json(
      { error: "PIN inválido ou ausente" },
      { status: 401 }
    );
  }

  try {
    const body = (await req.json()) as {
      searchResult?: SearchResult;
      title?: string;
      media_type?: MediaType;
      current_season?: number;
      current_episode?: number;
      total_episodes?: number | null;
      status?: WatchStatus;
    };

    if (!body.searchResult && !body.title?.trim()) {
      return NextResponse.json(
        { error: "Informe searchResult ou title" },
        { status: 400 }
      );
    }

    const media = await createManualMedia(body);
    return NextResponse.json({ media }, { status: 201 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Erro ao adicionar obra";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
