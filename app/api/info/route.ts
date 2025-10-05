import { NextRequest, NextResponse } from "next/server";
import YTDlpWrap from "yt-dlp-wrap";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

// Ejecuta yt-dlp y devuelve stdout/stderr/código
async function runYtDlp(args: string[]): Promise<{ out: string; err: string; code: number }> {
  const ytdlp = new (YTDlpWrap as any)();
  return await new Promise((resolve) => {
    let out = "", err = "";
    const p: any = ytdlp.exec(args);
    p?.stdout?.on("data", (d: Buffer) => (out += d.toString()));
    p?.stderr?.on("data", (d: Buffer) => (err += d.toString()));
    p?.once("error", (e: any) => resolve({ out, err: err || e?.message || "spawn error", code: 127 }));
    p?.once("close", (code: number) => resolve({ out, err, code: code ?? 0 }));
  });
}

// Si el binario no está, lo descarga de GitHub y reintenta
async function runWithAutoDownload(args: string[]) {
  let res = await runYtDlp(args);
  if (res.code === 127 || /ENOENT|not found|no such file/i.test(res.err)) {
    await (YTDlpWrap as any).downloadFromGithub();
    res = await runYtDlp(args);
  }
  return res;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q) return NextResponse.json({ error: "Missing q" }, { status: 400 });

  const args = ["--dump-single-json", "--no-warnings", q];

  const { out, err, code } = await runWithAutoDownload(args);
  if (code !== 0) {
    return NextResponse.json({ error: "yt-dlp error", details: err || out }, { status: 500 });
  }

  return new NextResponse(out, { headers: { "content-type": "application/json; charset=utf-8" } });
}
