import { NextRequest, NextResponse } from "next/server";
import YTDlpWrap from "yt-dlp-wrap";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

async function ensureBinary() {
  try {
    // Si ya existe, devuelve la ruta
    const p = await YTDlpWrap.getYtdlpBinary();
    return p;
  } catch {
    // Descarga el binario desde GitHub a la ruta por defecto
    await YTDlpWrap.downloadFromGithub();
    return await YTDlpWrap.getYtdlpBinary();
  }
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q) return NextResponse.json({ error: "Missing q" }, { status: 400 });

  try {
    await ensureBinary();
    const ytdlp = new YTDlpWrap(); // usará el binario por defecto

    const args = ["--dump-single-json", "--no-warnings", q];

    const stdout = await new Promise<string>((resolve, reject) => {
      let out = "", err = "";
      const proc = ytdlp.exec(args);
      proc.stdout?.on("data", (d) => (out += d.toString()));
      proc.stderr?.on("data", (d) => (err += d.toString()));
      proc.once("error", (e) => reject(new Error(err || (e as any)?.message || "yt-dlp error")));
      proc.once("close", (code) => (code === 0 ? resolve(out) : reject(new Error(err || out || `exit ${code}`))));
    });

    return new NextResponse(stdout, { headers: { "content-type": "application/json; charset=utf-8" } });
  } catch (e: any) {
    return NextResponse.json({ error: "yt-dlp error", details: e?.message ?? String(e) }, { status: 500 });
  }
}
