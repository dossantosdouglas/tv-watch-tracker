import { NextRequest, NextResponse } from "next/server";
import { sendNotification, setVapidDetails } from "web-push";
import { getSupabaseAdmin } from "@/lib/supabase";
import { MediaItem } from "@/lib/types";

export const dynamic = "force-dynamic";

interface PushSubRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: string;
}

function getVapidConfig() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || "";
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() || "";
  const subject =
    process.env.VAPID_SUBJECT?.trim() || "mailto:fox@tvtracker.app";
  return { publicKey, privateKey, subject };
}

async function sendToAllSubscribers(payload: {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
}): Promise<{ sent: number; failed: number }> {
  const { publicKey, privateKey, subject } = getVapidConfig();
  if (!publicKey || !privateKey) {
    throw new Error("Chaves VAPID não configuradas no servidor");
  }

  setVapidDetails(subject, publicKey, privateKey);

  const supabase = getSupabaseAdmin();
  const { data: subs, error } = await supabase
    .from("tv_watch_push_subscriptions")
    .select("*");

  if (error) throw error;
  const rows = (subs || []) as PushSubRow[];

  let sent = 0;
  let failed = 0;
  const expiredEndpoints: string[] = [];

  await Promise.all(
    rows.map(async (sub) => {
      try {
        await sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload)
        );
        sent++;
      } catch (err: unknown) {
        failed++;
        const statusCode =
          typeof err === "object" && err !== null && "statusCode" in err
            ? Number((err as { statusCode?: number }).statusCode)
            : 0;
        if (statusCode === 404 || statusCode === 410) {
          expiredEndpoints.push(sub.endpoint);
        }
      }
    })
  );

  if (expiredEndpoints.length > 0) {
    await supabase
      .from("tv_watch_push_subscriptions")
      .delete()
      .in("endpoint", expiredEndpoints);
  }

  return { sent, failed };
}

function formatAiringPtBr(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

export async function GET() {
  try {
    const { publicKey } = getVapidConfig();
    const supabase = getSupabaseAdmin();

    const [subsRes, mediaRes] = await Promise.all([
      supabase
        .from("tv_watch_push_subscriptions")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("tv_watch_media")
        .select("id, title, cover_image, next_airing, airing_status")
        .not("next_airing", "is", null)
        .order("last_watched_at", { ascending: false }),
    ]);

    if (subsRes.error) throw subsRes.error;
    if (mediaRes.error) throw mediaRes.error;

    return NextResponse.json({
      publicKey: publicKey || null,
      subscribedCount: subsRes.count ?? 0,
      upcoming: mediaRes.data || [],
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Erro ao consultar push";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      action?: "test" | "check_releases";
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };

    const supabase = getSupabaseAdmin();

    if (body.action === "test") {
      const { data: upcomingRows } = await supabase
        .from("tv_watch_media")
        .select("title, next_airing")
        .not("next_airing", "is", null)
        .order("last_watched_at", { ascending: false })
        .limit(1);

      const first = upcomingRows?.[0] as
        | Pick<MediaItem, "title" | "next_airing">
        | undefined;
      const bodyText = first?.next_airing
        ? `Tudo certo! Próximo lançamento: ${first.title} — Ep ${first.next_airing.episode} em ${formatAiringPtBr(first.next_airing.airing_at)}.`
        : "Notificações ativas! Você receberá alertas quando novos episódios saírem.";

      const result = await sendToAllSubscribers({
        title: "Onde Parei • Teste de Notificação",
        body: bodyText,
        url: "/",
        tag: "tv-watch-tracker-test",
      });

      return NextResponse.json({ ok: true, ...result });
    }

    if (body.action === "check_releases") {
      const { data: mediaRows, error } = await supabase
        .from("tv_watch_media")
        .select("id, title, cover_image, next_airing, airing_status")
        .not("next_airing", "is", null);

      if (error) throw error;

      const now = Date.now();
      const soonCutoff = now + 7 * 24 * 60 * 60 * 1000;
      const upcoming = ((mediaRows || []) as Array<
        Pick<
          MediaItem,
          "id" | "title" | "cover_image" | "next_airing" | "airing_status"
        >
      >).filter((m) => {
        if (!m.next_airing?.airing_at) return false;
        const ts = new Date(m.next_airing.airing_at).getTime();
        return !Number.isNaN(ts) && ts <= soonCutoff;
      });

      if (upcoming.length === 0) {
        return NextResponse.json({
          ok: true,
          sent: 0,
          failed: 0,
          upcoming: [],
        });
      }

      const first = upcoming[0];
      const summary =
        upcoming.length === 1
          ? `${first.title} — Episódio ${first.next_airing!.episode} em ${formatAiringPtBr(first.next_airing!.airing_at)}`
          : `${upcoming.length} lançamentos próximos: ${upcoming
              .slice(0, 2)
              .map(
                (u) =>
                  `${u.title} (Ep ${u.next_airing!.episode} • ${formatAiringPtBr(u.next_airing!.airing_at)})`
              )
              .join(", ")}`;

      const result = await sendToAllSubscribers({
        title: "Novo Episódio na Agenda!",
        body: summary,
        url: "/",
        tag: "tv-watch-tracker-releases",
        icon: first.cover_image || undefined,
      });

      return NextResponse.json({
        ok: true,
        ...result,
        upcoming,
      });
    }

    if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
      return NextResponse.json(
        { error: "Subscription inválida: envie endpoint e keys (p256dh, auth)" },
        { status: 400 }
      );
    }

    const userAgent = req.headers.get("user-agent") || null;
    const { error } = await supabase
      .from("tv_watch_push_subscriptions")
      .upsert(
        {
          endpoint: body.endpoint,
          p256dh: body.keys.p256dh,
          auth: body.keys.auth,
          user_agent: userAgent,
        },
        { onConflict: "endpoint" }
      );

    if (error) throw error;
    return NextResponse.json({ ok: true, subscribed: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Erro ao processar push";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    let endpoint = req.nextUrl.searchParams.get("endpoint")?.trim() || "";
    if (!endpoint) {
      const body = (await req.json().catch(() => ({}))) as {
        endpoint?: string;
      };
      endpoint = body.endpoint?.trim() || "";
    }

    if (!endpoint) {
      return NextResponse.json(
        { error: "Informe o endpoint para cancelar a inscrição" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("tv_watch_push_subscriptions")
      .delete()
      .eq("endpoint", endpoint);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Erro ao remover inscrição";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
