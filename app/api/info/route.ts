import { NextRequest, NextResponse } from "next/server";
import ytdlp from "yt-dlp-exec";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q) return NextResponse.json({ error: "Missing q" }, { status: 400 });

  try {
    // yt-dlp-exec usa execa; res.stdout trae el JSON
    const res = await ytdlp(q, {
      dumpSingleJson: true,
      noWarnings: true
    } as any);

    const text = (res as any)?.stdout ?? "";
    if (!text) return NextResponse.json({ error: "yt-dlp sin salida" }, { status: 500 });

    return new NextResponse(text, { headers: { "content-type": "application/json; charset=utf-8" } });
  } catch (e: any) {
    return NextResponse.json({ error: "yt-dlp error", details: e?.shortMessage || e?.message }, { status: 500 });
  }
}
