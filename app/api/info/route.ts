import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

function run(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args);
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
  // yt-dlp-bin expone .path (CommonJS); en ESM puede venir como default
  // usamos require dinámico para mayor compatibilidad
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require("yt-dlp-bin");
  return mod?.path || mod?.default || mod;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q) return NextResponse.json({ error: "Missing q" }, { status: 400 });

  const ytdlp = resolveYtDlpPath();
  const args = ["--dump-single-json", "--no-warnings", q];

  const { stdout, stderr, code } = await run(ytdlp, args);
  if (code !== 0) {
    return NextResponse.json({ error: "yt-dlp error", details: stderr || stdout }, { status: 500 });
  }
  return new NextResponse(stdout, { headers: { "content-type": "application/json; charset=utf-8" } });
}
