import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import { put } from '@vercel/blob';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // plan Hobby

function run(cmd: string, args: string[], cwd?: string): Promise<{ stdout: string, stderr: string, code: number }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd });
    let out = '', err = '';
    p.stdout?.on('data', d => out += d.toString());
    p.stderr?.on('data', d => err += d.toString());
    p.on('error', (e) => {
      err += (err ? '\n' : '') + (e?.message || String(e));
      resolve({ stdout: out, stderr: err, code: 127 });
    });
    p.on('close', code => resolve({ stdout: out, stderr: err, code: code ?? 0 }));
  });
}

function resolveBins() {
  const isWin = process.platform === 'win32';
  const root = process.cwd();
  const ytdlp = isWin ? path.join(root, 'bin', 'win', 'yt-dlp.exe') : path.join(root, 'bin', 'yt-dlp');
  const ffmpeg = isWin ? path.join(root, 'bin', 'win', 'ffmpeg.exe') : path.join(root, 'bin', 'ffmpeg');
  return { ytdlp, ffmpeg };
}

function sanitize(name: string, maxLen = 200) {
  const cleaned = name.replace(/[\\/:*?"<>|\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.slice(0, maxLen);
}

async function probe(ytdlpPath: string, inputUrl: string) {
  const args = ['--dump-single-json', '--no-warnings', inputUrl];
  const { stdout, stderr, code } = await run(ytdlpPath, args);
  if (code !== 0) throw new Error(stderr || stdout || 'yt-dlp probe failed');
  const json = JSON.parse(stdout);
  const entry = json?.entries?.[0] ?? json;
  const id = entry?.id || 'audio';
  const title = entry?.title || 'audio';
  const duration = entry?.duration ?? 0;
  return { id, title, duration };
}

export async function POST(req: NextRequest) {
  try {
    const { url, format } = await req.json();
    if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 });
    const fmt = (format || 'flac').toLowerCase();

    const { ytdlp, ffmpeg } = resolveBins();

    // Asegurar binarios y permisos
    try {
      await fs.access(ytdlp);
      await fs.access(ffmpeg);
      if (process.platform !== 'win32') {
        await fs.chmod(ytdlp, 0o755);
        await fs.chmod(ffmpeg, 0o755);
      }
    } catch {
      return NextResponse.json({ error: 'Faltan binarios (yt-dlp/ffmpeg) en ./bin' }, { status: 500 });
    }

    // Probe + límite rápido para Hobby (evita timeout)
    const { id, title, duration } = await probe(ytdlp, url);
    if (duration && duration > 600) { // p.ej. >10 min
      return NextResponse.json({ error: 'El video es muy largo para el plan actual (máx ~5min de ejecución). Prueba MP3/OPUS o un clip más corto.' }, { status: 400 });
    }

    const base = sanitize(`${title}.${id}`);
    const outTpl = `${base}.%(ext)s`;
    const args = [
      '-x', '--audio-format', fmt,
      '--embed-thumbnail', '--add-metadata',
      '--ffmpeg-location', ffmpeg,
      '-o', outTpl, url
    ];

    const cwd = '/tmp';
    const { stdout, stderr, code } = await run(ytdlp, args, cwd);
    if (code !== 0) {
      return NextResponse.json({ error: 'Fallo yt-dlp', details: stderr || stdout }, { status: 500 });
    }

    const outPath = path.join(cwd, `${base}.${fmt}`);
    const file = await fs.readFile(outPath);
    const putRes = await put(`audio/${base}.${fmt}`, file, {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: false,
      contentType: fmt === 'mp3' ? 'audio/mpeg' : (fmt === 'opus' ? 'audio/opus' : (fmt === 'wav' ? 'audio/wav' : 'audio/flac'))
    });
    return NextResponse.json({ url: putRes.url });
  } catch (e: any) {
    return NextResponse.json({ error: 'Excepción en servidor', details: e?.message }, { status: 500 });
  }
}
