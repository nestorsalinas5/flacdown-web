import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

function run(cmd: string, args: string[], cwd?: string): Promise<{ stdout: string, stderr: string, code: number }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd });
    let out = '', err = '';
    p.stdout?.on('data', d => out += d.toString());
    p.stderr?.on('data', d => err += d.toString());
    p.on('error', (e) => {
      // ENOENT/EACCES, etc.
      err += (err ? '\n' : '') + (e?.message || String(e));
      resolve({ stdout: out, stderr: err, code: 127 });
    });
    p.on('close', code => resolve({ stdout: out, stderr: err, code: code ?? 0 }));
  });
}

function resolveYtDlp() {
  const isWin = process.platform === 'win32';
  const root = process.cwd();
  return isWin
    ? path.join(root, 'bin', 'win', 'yt-dlp.exe')
    : path.join(root, 'bin', 'yt-dlp');
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q');
  if (!q) return NextResponse.json({ error: 'Missing q' }, { status: 400 });

  const ytdlp = resolveYtDlp();

  // Asegurar que existe y tenga +x (en Linux)
  try {
    await fs.access(ytdlp);
    if (process.platform !== 'win32') {
      await fs.chmod(ytdlp, 0o755);
    }
  } catch {
    return NextResponse.json({ error: 'yt-dlp no encontrado en ./bin. Asegura binario Linux (o .exe en win) en el repo.' }, { status: 500 });
  }

  const args = ['--dump-single-json', '--no-warnings', q];
  const { stdout, stderr, code } = await run(ytdlp, args);
  if (code !== 0) {
    return NextResponse.json({ error: 'yt-dlp error', details: stderr || stdout }, { status: 500 });
  }
  // Siempre JSON
  return new NextResponse(stdout, { headers: { 'content-type': 'application/json; charset=utf-8' } });
}
