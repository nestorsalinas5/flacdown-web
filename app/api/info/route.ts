
import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import path from 'node:path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

function run(cmd: string, args: string[], cwd?: string): Promise<{ stdout: string, stderr: string, code: number }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd });
    let out = '', err = '';
    p.stdout.on('data', d => out += d.toString());
    p.stderr.on('data', d => err += d.toString());
    p.on('close', code => resolve({ stdout: out, stderr: err, code: code ?? 0 }));
  });
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q');
  if (!q) return NextResponse.json({ error: 'Missing q' }, { status: 400 });

  const ytdlp = path.join(process.cwd(), 'bin', 'yt-dlp');

  const args = ['--dump-single-json', '--no-warnings', q];
  const { stdout, stderr, code } = await run(ytdlp, args);
  if (code !== 0) {
    return NextResponse.json({ error: 'yt-dlp error', details: stderr || stdout }, { status: 500 });
  }
  return new NextResponse(stdout, { headers: { 'content-type': 'application/json' } });
}
