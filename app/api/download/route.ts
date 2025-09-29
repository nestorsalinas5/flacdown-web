
import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import { put } from '@vercel/blob';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 900; // 15 min Background Function

async function run(cmd: string, args: string[], cwd?: string): Promise<{ stdout: string, stderr: string, code: number }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd });
    let out = '', err = '';
    p.stdout.on('data', d => out += d.toString());
    p.stderr.on('data', d => err += d.toString());
    p.on('close', code => resolve({ stdout: out, stderr: err, code: code ?? 0 }));
  });
}

// Obtiene metadatos para conocer id y título y así fijar un nombre de archivo estable
async function probe(ytdlpPath: string, inputUrl: string) {
  const args = ['--dump-single-json', '--no-warnings', inputUrl];
  const { stdout, stderr, code } = await run(ytdlpPath, args);
  if (code !== 0) throw new Error(stderr || stdout || 'yt-dlp probe failed');
  const json = JSON.parse(stdout);
  // Si es búsqueda/lista, intentar tomar el primero
  const entry = json?.entries?.[0] ?? json;
  const id = entry?.id || 'audio';
  const title = entry?.title || 'audio';
  return { id, title };
}

function sanitize(name: string, maxLen = 200) {
  const cleaned = name.replace(/[\\/:*?"<>|\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.slice(0, maxLen);
}

export async function POST(req: NextRequest) {
  const { url, format } = await req.json();
  if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 });
  const fmt = (format || 'flac').toLowerCase();

  const ytdlp = path.join(process.cwd(), 'bin', 'yt-dlp');
  const ffmpeg = path.join(process.cwd(), 'bin', 'ffmpeg');

  // 1) Probar que existen binarios
  try {
    await fs.access(ytdlp);
    await fs.access(ffmpeg);
  } catch {
    return NextResponse.json({ error: 'Faltan binarios (yt-dlp/ffmpeg) en ./bin. Revisa README.' }, { status: 500 });
  }

  // 2) Obtener id y título
  const { id, title } = await probe(ytdlp, url);
  const base = sanitize(`${title}.${id}`);

  const outTpl = `${base}.%(ext)s`; // se resolverá a fmt elegido
  const args = [
    '-x', '--audio-format', fmt,
    '--embed-thumbnail', '--add-metadata',
    '--ffmpeg-location', ffmpeg,
    '-o', outTpl, url
  ];

  // 3) Ejecutar en /tmp
  const cwd = '/tmp';
  const { stdout, stderr, code } = await run(ytdlp, args, cwd);
  if (code !== 0) {
    return NextResponse.json({ error: 'Fallo yt-dlp', details: stderr || stdout }, { status: 500 });
  }

  // 4) Resolver nombre final (dependiendo del fmt)
  const outPath = path.join(cwd, `${base}.${fmt}`);
  try {
    const file = await fs.readFile(outPath);
    const blobPath = `audio/${base}.${fmt}`;
    const putRes = await put(blobPath, file, {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: false,
      contentType: fmt === 'mp3' ? 'audio/mpeg' : (fmt === 'opus' ? 'audio/opus' : (fmt === 'wav' ? 'audio/wav' : 'audio/flac'))
    });
    return NextResponse.json({ url: putRes.url });
  } catch (e:any) {
    return NextResponse.json({ error: 'Upload falló o archivo no encontrado', details: e?.message }, { status: 500 });
  }
}
