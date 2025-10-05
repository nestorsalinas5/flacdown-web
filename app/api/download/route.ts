import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";
import ffmpegPath from "ffmpeg-static";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // plan Hobby

async function ensureYtDlp(): Promise<string> {
  const candidates = [
    "/var/task/bin/yt-dlp",
    path.join(process.cwd(), "bin", "yt-dlp")
  ];
  for (const c of candidates) {
    try { await fs.access(c); return c; } catch {}
  }
  const tmpPath = "/tmp/yt-dlp";
  try { await fs.access(tmpPath); return tmpPath; } catch {}

  const url = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo descargar yt-dlp (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(tmpPath, buf);
  await fs.chmod(tmpPath, 0o755);
  return tmpPath;
}

function run(cmd: string, args: string[], cwd?: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd });
    let out = "", err = "";
    p.stdout?.on("data", d => (out += d.toString()));
    p.stderr?.on("data", d => (err += d.toString()));
    p.on("error", (e) => {
      err += (err ? "\n" : "") + (e?.message || String(e));
      resolve({ stdout: out, stderr: err, code: 127 });
    });
    p.on("close", (code) => resolve({ stdout: out, stderr: err, code: code ?? 0 }));
  });
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

    const ytdlp = await ensureYtDlp();
    const ffmpeg = ffmpegPath as string;
    if (!ffmpeg) return NextResponse.json({ error: "ffmpeg-static no disponible" }, { status: 500 });

    // Probe para título/id/duración
    const probeArgs = ["--dump-single-json", "--no-warnings", url];
    const probe = await run(ytdlp, probeArgs);
    if (probe.code !== 0) {
      return NextResponse.json({ error: "yt-dlp probe error", details: (probe.stderr || probe.stdout)?.slice(0, 2000) }, { status: 500 });
    }
    const probeJson = JSON.parse(probe.stdout);
    const entry = probeJson?.entries?.[0] ?? probeJson;
    const id = entry?.id || "audio";
    const title = entry?.title || "audio";
    const duration = entry?.duration ?? 0;

    if (duration && duration > 600) {
      return NextResponse.json({ error: "El video es muy largo para el plan actual (≤ 10 min aprox.)" }, { status: 400 });
    }

    const base = sanitize(`${title}.${id}`);
    const outTpl = `${base}.%(ext)s`;
    const args = [
      "-x", "--audio-format", fmt,
      "--embed-thumbnail", "--add-metadata",
      "--ffmpeg-location", ffmpeg,
      "-o", outTpl, url
    ];
    const cwd = "/tmp";
    const dl = await run(ytdlp, args, cwd);
    if (dl.code !== 0) {
      return NextResponse.json({ error: "Fallo yt-dlp", details: (dl.stderr || dl.stdout)?.slice(0, 2000) }, { status: 500 });
    }

    const outPath = path.join(cwd, `${base}.${fmt}`);
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
