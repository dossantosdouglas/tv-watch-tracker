import { NextRequest, NextResponse } from "next/server";
import { verifyApiKey, verifyPin } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { processScrobble } from "@/lib/tracker-service";
import { ScrobblePayload } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!verifyApiKey(req) && !verifyPin(req)) {
    return NextResponse.json(
      { error: "API Key inválida ou ausente" },
      { status: 401 }
    );
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("tv_watch_scrobble_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) throw error;
    return NextResponse.json({ ok: true, logs: data || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao buscar logs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ScrobblePayload;

    if (!verifyApiKey(req, body?.apiKey)) {
      return NextResponse.json(
        { error: "API Key inválida ou ausente" },
        { status: 401 }
      );
    }

    if (!body || (!body.title && !body.episodeTitle && !body.rawText)) {
      return NextResponse.json(
        { error: "Payload inválido: envie title, episodeTitle ou rawText" },
        { status: 400 }
      );
    }

    const result = await processScrobble(body);
    return NextResponse.json({
      ok: true,
      media: result.media,
      log: result.log,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Erro interno no scrobble";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
