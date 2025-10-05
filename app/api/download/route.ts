import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import YTDlpWrap from "yt-dlp-wrap";
import ffmpegPath from "ffmpeg-static";
import { put } from "@vercel/blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function sanitize(name: string, maxLen = 200) {
  const cleaned = name.replace(/[\\/:*?"<>|\n\r\t]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, maxLen);
}

async function ensureBinary() {
  try {
    const p = await YTDlpWrap.getYtdlpBinary();
    return p;
  } catch {
    await YTDlpWrap.downloadFromGithub();
    return await YTDlpWrap.getYtdlpBinary();
  }
}

async function runYtdlp(args: string[], cwd?: string) {
  const ytdlp = new YTDlpWrap();
  return await new Promise<{ out: string; err: string; code: number }>((resolve) => {
    let out = "", err = "";
    const p = ytdlp.exec(args, { cwd });
    p.stdout?.on("data", (d) => (out += d.toString()));
    p.stderr?.on("data", (d) => (err += d.toString()));
    p.once("error", (e) => resolve({ out, err: err || (e as any)?.message || "spawn error", code: 127 }));
    p.once("close", (code) => resolve({ out, err, code: code ?? 0 }));
  });
}

export async function POST(req: NextRequest) {
  try {
    const { url, format } = await req.json();
    if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });
    const fmt = (format || "flac").toLowerCase();

    await ensureBinary();

    // 1) Probe
    const probe = await runYtdlp(["--dump-single-json", "--no-warnings", url]);
    if (probe.code !== 0) {
      return NextResponse.json({ error: "yt-dlp probe error", details: probe.err || probe.out }, { status: 500 });
    }
    const j = JSON.parse(probe.out);
    const entry = j?.entries?.[0] ?? j;
    const id = entry?.id || "audio";
    const title = entry?.title || "audio";
    const duration = entry?.duration ?? 0;

    if (duration && duration > 600) {
      return NextResponse.json({ error: "El video es muy largo para el plan actual (~5 min de ejecución)." }, { status: 400 });
    }

    // 2) Descargar/convertir
    const base = sanitize(`${title}.${id}`);
    const outTpl = `${base}.%(ext)s`;
    const args = [
      "-x", "--audio-format", fmt,
      "--embed-thumbnail", "--add-metadata",
      "--ffmpeg-location", String(ffmpegPath),
      "-o", outTpl, url
    ];
    const dl = await runYtdlp(args, "/tmp");
    if (dl.code !== 0) {
      return NextResponse.json({ error: "Fallo yt-dlp", details: dl.err || dl.out }, { status: 500 });
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
