import { NextRequest } from "next/server";

export function getExpectedApiKey(): string {
  return process.env.TRACKER_API_KEY?.trim() || "fox-tv-tracker-2026";
}

export function getExpectedPin(): string {
  return process.env.TRACKER_PIN?.trim() || "2026";
}

export function verifyApiKey(req: NextRequest, bodyApiKey?: string | null): boolean {
  const expected = getExpectedApiKey();
  const headerKey = req.headers.get("x-api-key")?.trim();
  const queryKey = req.nextUrl.searchParams.get("apiKey")?.trim();
  const provided = headerKey || bodyApiKey?.trim() || queryKey || "";
  return provided === expected;
}

export function verifyPin(req: NextRequest): boolean {
  const expected = getExpectedPin();
  if (!expected) return true;
  const headerPin = req.headers.get("x-tracker-pin")?.trim();
  const queryPin = req.nextUrl.searchParams.get("pin")?.trim();
  return (headerPin || queryPin || "") === expected;
}
