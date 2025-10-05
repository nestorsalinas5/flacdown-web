import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

// Config
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

// Descarga yt-dlp a /tmp si no está disponible
async function ensureYtDlp(): Promise<string> {
  const candidates = [
    "/var/task/bin/yt-dlp",                                 // si alguna vez lo empacas
    path.join(process.cwd(), "bin", "yt-dlp")               // por si está relativo al CWD
  ];

  for (const c of candidates) {
    try { await fs.access(c); return c; } catch {}
  }

  // Descargar a /tmp
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

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q) return NextResponse.json({ error: "Missing q" }, { status: 400 });

  try {
    const ytdlp = await ensureYtDlp();
    const args = ["--dump-single-json", "--no-warnings", q];
    const { stdout, stderr, code } = await run(ytdlp, args);
    if (code !== 0) {
      return NextResponse.json({ error: "yt-dlp error", details: (stderr || stdout)?.slice(0, 2000) }, { status: 500 });
    }
    return new NextResponse(stdout, { headers: { "content-type": "application/json; charset=utf-8" } });
  } catch (e: any) {
    return NextResponse.json({ error: "Fallo ensureYtDlp", details: e?.message }, { status: 500 });
  }
}
