import { NextRequest, NextResponse } from "next/server";
import { searchMetadata } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get("q")?.trim() || "";
    const typeParam = req.nextUrl.searchParams.get("type") || "all";
    const type =
      typeParam === "anime" || typeParam === "series" ? typeParam : "all";

    if (!q) {
      return NextResponse.json({ results: [] });
    }

    const results = await searchMetadata(q, type);
    return NextResponse.json({ results });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Erro na busca de metadados";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
