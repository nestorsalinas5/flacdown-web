import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import YTDlpWrap from "yt-dlp-wrap";
import ffmpegPath from "ffmpeg-static";
import { put } from "@vercel/blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const YTDLP_PATH = "/tmp/yt-dlp";

function sanitize(name: string, maxLen = 200) {
  const cleaned = name.replace(/[\\/:*?"<>|\n\r\t]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, maxLen);
}

async function ensureBinaryInTmp() {
  try {
    await fs.access(YTDLP_PATH);
    return YTDLP_PATH;
  } catch {
    await (YTDlpWrap as any).downloadFromGithub("/tmp");
    try {
      await fs.access(YTDLP_PATH);
      return YTDLP_PATH;
    } catch {
      const entries = await fs.readdir("/tmp");
      const hit = entries.find((f) => f.toLowerCase().startsWith("yt-dlp"));
      if (!hit) throw new Error("No se encontró binario yt-dlp en /tmp tras la descarga");
      const resolved = path.join("/tmp", hit);
      try { await fs.link(resolved, YTDLP_PATH); } catch {}
      return YTDLP_PATH;
    }
  }
}

async function runYtDlp(args: string[], cwd?: string): Promise<{ out: string; err: string; code: number }> {
  const ytdlp = new (YTDlpWrap as any)(YTDLP_PATH);
  return await new Promise((resolve) => {
    let out = "", err = "";
    const p: any = ytdlp.exec(args, { cwd });
    p?.stdout?.on("data", (d: Buffer) => (out += d.toString()));
    p?.stderr?.on("data", (d: Buffer) => (err += d.toString()));
    p?.once("error", (e: any) => resolve({ out, err: err || e?.message || "spawn error", code: 127 }));
    p?.once("close", (code: number) => resolve({ out, err, code: code ?? 0 }));
  });
}

export async function POST(req: NextRequest) {
  try {
    const { url, format } = await req.json();
    if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });
    const fmt = (format || "flac").toLowerCase();

    // 1) Asegura binario en /tmp
    await ensureBinaryInTmp();

    // 2) Probe (para título/id/duración)
    const probe = await runYtDlp(["--dump-single-json", "--no-warnings", url]);
    if (probe.code !== 0) {
      return NextResponse.json({ error: "yt-dlp probe error", details: probe.err || probe.out }, { status: 500 });
    }
    const j = JSON.parse(probe.out);
    const entry = j?.entries?.[0] ?? j;
    const id = entry?.id || "audio";
    const title = entry?.title || "audio";
    const duration = entry?.duration ?? 0;

    // 3) Límite para evitar timeouts en plan Hobby
    if (duration && duration > 600) {
      return NextResponse.json({
        error: "El video es muy largo para el plan actual (~5 min de ejecución). Prueba MP3/OPUS o algo más corto."
      }, { status: 400 });
    }

    // 4) Descargar/convertir en /tmp usando ffmpeg-static
    const base = sanitize(`${title}.${id}`);
    const outTpl = `${base}.%(ext)s`;
    const args = [
      "-x", "--audio-format", fmt,
      "--embed-thumbnail", "--add-metadata",
      "--ffmpeg-location", String(ffmpegPath),
      "-o", outTpl, url
    ];
    const dl = await runYtDlp(args, "/tmp");
    if (dl.code !== 0) {
      return NextResponse.json({ error: "Fallo yt-dlp", details: dl.err || dl.out }, { status: 500 });
    }

    // 5) Subir a Vercel Blob
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
