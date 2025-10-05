import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import ytdlp from "yt-dlp-exec";
import ffmpegPath from "ffmpeg-static";
import { put } from "@vercel/blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // Hobby: 5 min

function sanitize(name: string, maxLen = 200) {
  const cleaned = name.replace(/[\\/:*?"<>|\n\r\t]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, maxLen);
}

export async function POST(req: NextRequest) {
  try {
    const { url, format } = await req.json();
    if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });
    const fmt = (format || "flac").toLowerCase();

    // 1) Probe para título/id/duración
    const probe = await ytdlp(url, { dumpSingleJson: true, noWarnings: true } as any);
    const text = (probe as any)?.stdout ?? "";
    if (!text) return NextResponse.json({ error: "yt-dlp sin salida (probe)" }, { status: 500 });

    const json = JSON.parse(text);
    const entry = json?.entries?.[0] ?? json;
    const id = entry?.id || "audio";
    const title = entry?.title || "audio";
    const duration = entry?.duration ?? 0;

    // Límite por plan (evita timeouts)
    if (duration && duration > 600) {
      return NextResponse.json({ error: "El video es muy largo para el plan actual (máx ~10 min de contenido). Usa MP3/OPUS o algo más corto." }, { status: 400 });
    }

    // 2) Descargar/convertir a /tmp usando ffmpeg-static
    const base = sanitize(`${title}.${id}`);
    const outTpl = `${base}.%(ext)s`;
    const args = [
      "-x", "--audio-format", fmt,
      "--embed-thumbnail", "--add-metadata",
      "--ffmpeg-location", ffmpegPath as string,
      "-o", outTpl, url
    ];

    const res = await ytdlp(url, args as any, { cwd: "/tmp" } as any);
    const stderr = (res as any)?.stderr ?? "";
    if (stderr && /ERROR|Traceback/i.test(stderr)) {
      return NextResponse.json({ error: "Fallo yt-dlp", details: stderr.slice(0, 2000) }, { status: 500 });
    }

    // 3) Subir a Blob
    const outPath = path.join("/tmp", `${base}.${fmt}`);
    const file = await fs.readFile(outPath);
    const putRes = await put(`audio/${base}.${fmt}`, file, {
      access: "public",
      token: process.env.BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: false,
      contentType:
        fmt === "mp3" ? "audio/mpeg" :
        fmt === "opus" ? "audio/opus" :
        fmt === "wav" ? "audio/wav" : "audio/flac"
    });

    return NextResponse.json({ url: putRes.url });
  } catch (e: any) {
    return NextResponse.json({ error: "Excepción en servidor", details: e?.message }, { status: 500 });
  }
}
