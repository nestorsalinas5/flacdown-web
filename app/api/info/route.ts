import { NextRequest, NextResponse } from "next/server";
import YTDlpWrap from "yt-dlp-wrap";
import fs from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const YTDLP_PATH = "/tmp/yt-dlp";

async function ensureBinaryInTmp() {
  try {
    await fs.access(YTDLP_PATH);
    return YTDLP_PATH;
  } catch {
    // /tmp es escritura; descarga ahí
    await (YTDlpWrap as any).downloadFromGithub("/tmp");
    // A veces el nombre puede venir con sufijos; normalizamos si hace falta:
    // Si no existe /tmp/yt-dlp después de descargar, intenta detectar el binario descargado
    try {
      await fs.access(YTDLP_PATH);
      return YTDLP_PATH;
    } catch {
      // fallback: busca un binario "yt-dlp" en /tmp
      const entries = await fs.readdir("/tmp");
      const hit = entries.find((f) => f.toLowerCase().startsWith("yt-dlp"));
      if (!hit) throw new Error("No se encontró binario yt-dlp en /tmp tras la descarga");
      const resolved = path.join("/tmp", hit);
      // crea alias /tmp/yt-dlp para usar ruta fija
      try { await fs.link(resolved, YTDLP_PATH); } catch { /* ignore si ya existe */ }
      return YTDLP_PATH;
    }
  }
}

async function runYtDlp(args: string[]): Promise<{ out: string; err: string; code: number }> {
  const ytdlp = new (YTDlpWrap as any)(YTDLP_PATH);
  return await new Promise((resolve) => {
    let out = "", err = "";
    const p: any = ytdlp.exec(args);
    p?.stdout?.on("data", (d: Buffer) => (out += d.toString()));
    p?.stderr?.on("data", (d: Buffer) => (err += d.toString()));
    p?.once("error", (e: any) => resolve({ out, err: err || e?.message || "spawn error", code: 127 }));
    p?.once("close", (code: number) => resolve({ out, err, code: code ?? 0 }));
  });
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q) return NextResponse.json({ error: "Missing q" }, { status: 400 });

  // Asegura binario en /tmp
  await ensureBinaryInTmp();

  const { out, err, code } = await runYtDlp(["--dump-single-json", "--no-warnings", q]);
  if (code !== 0) {
    return NextResponse.json({ error: "yt-dlp error", details: err || out }, { status: 500 });
  }
  return new NextResponse(out, { headers: { "content-type": "application/json; charset=utf-8" } });
}
