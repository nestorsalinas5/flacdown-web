import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import ffmpegPath from "ffmpeg-static";
import { put } from "@vercel/blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function run(cmd: string, args: string[], cwd?: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd });
    let out = "", err = "";
    p.stdout?.on("data", d => (out += d.toString()));
    p.stderr?.on("data", d => (err += d.toString()));
    p.on("error", e => {
      err += (err ? "\n" : "") + (e?.message || String(e));
      resolve({ stdout: out, stderr: err, code: 127 });
    });
    p.on("close", code => resolve({ stdout: out, stderr: err, code: code ?? 0 }));
  });
}

function resolveYtDlpPath(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require("yt-dlp-bin");
  return mod?.path || mod?.default || mod;
}

function sanitize(name: string, maxLen = 200) {
  const cleaned = name.replace(/[\\/:*?"<>|\n\r\t]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, maxLen);
}

export async function POST(req: NextRequest) {
  try {
    const { url, format } = await req.json();
    if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });
    const fmt = (format || "flac").toLowerCase();

    const ytdlp = resolveYtDlpPath();

    // 1) Probe (JSON)
    const probeArgs = ["--dump-single-json", "--no-warnings", url];
    const probe = await run(ytdlp, probeArgs);
    if (probe.code !== 0) {
      return NextResponse.json({ error: "yt-dlp probe error", details: probe.stderr || probe.stdout }, { status: 500 });
    }
    const j = JSON.parse(probe.stdout);
    const entry = j?.entries?.[0] ?? j;
    const id = entry?.id || "audio";
    const title = entry?.title || "audio";
    const duration = entry?.duration ?? 0;

    if (duration && duration > 600) {
      return NextResponse.json({ error: "El video es muy largo para el plan actual (~5 min de ejecución)." }, { status: 400 });
    }

    // 2) Descargar/convertir a /tmp
    const base = sanitize(`${title}.${id}`);
    const outTpl = `${base}.%(ext)s`;
    const args = [
      "-x", "--audio-format", fmt,
      "--embed-thumbnail", "--add-metadata",
      "--ffmpeg-location", ffmpegPath as string,
      "-o", outTpl, url
    ];
    const dl = await run(ytdlp, args, "/tmp");
    if (dl.code !== 0) {
      return NextResponse.json({ error: "Fallo yt-dlp", details: dl.stderr || dl.stdout }, { status: 500 });
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
