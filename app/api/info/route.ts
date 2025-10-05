import { NextRequest, NextResponse } from "next/server";
import YTDlpWrap from "yt-dlp-wrap";
import fs from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

// Ruta del binario dentro del deploy (solo lectura) y destino en /tmp (escritura)
const SRC_BIN = path.join(process.cwd(), "public", "yt-dlp-linux");
const TMP_BIN = "/tmp/yt-dlp";

async function ensureYtDlpInTmp() {
  try {
    await fs.access(TMP_BIN);
    return TMP_BIN;
  } catch {
    // Copiamos desde /public al /tmp y damos permisos de ejecución
    await fs.copyFile(SRC_BIN, TMP_BIN);
    await fs.chmod(TMP_BIN, 0o755);
    return TMP_BIN;
  }
}

async function runYtDlp(binPath: string, args: string[]): Promise<{ out: string; err: string; code: number }> {
  const ytdlp = new (YTDlpWrap as any)(binPath);
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

  try {
    // Garantiza binario ejecutable en /tmp
    await fs.access(SRC_BIN); // valida que subiste public/yt-dlp-linux
    const binPath = await ensureYtDlpInTmp();

    const args = ["--dump-single-json", "--no-warnings", q];
    const { out, err, code } = await runYtDlp(binPath, args);

    if (code !== 0) {
      return NextResponse.json({ error: "yt-dlp error", details: err || out }, { status: 500 });
    }
    return new NextResponse(out, { headers: { "content-type": "application/json; charset=utf-8" } });
  } catch (e: any) {
    return NextResponse.json({ error: "Server error", details: e?.message }, { status: 500 });
  }
}
