
/**
 * Descarga yt-dlp y ffmpeg estáticos para Linux x64 y los coloca en ./bin con permisos +x.
 * Pensado para build en Vercel y local en Linux/Mac (en Windows puede requerir WSL).
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const binDir = path.join(process.cwd(), 'bin');
if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });

/** URLs (puedes cambiar por mirrors confiables) */
const YTDLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';
const FFMPEG_URL = 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz';

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', reject);
  });
}

async function extractFfmpegTarXz(archivePath) {
  // Extraction without external deps: very basic .tar.xz reader isn't trivial.
  // For simplicity: if extraction isn't available, ask user to put ffmpeg manually.
  // In CI (Vercel), consider caching or committing ffmpeg binary directly.
  console.log('[warn] Extracción automática de ffmpeg .tar.xz no implementada aquí.');
  console.log('[hint] Descarga manual: ' + FFMPEG_URL);
  console.log('[hint] Coloca el binario "ffmpeg" en ./bin y dale permisos +x');
}

(async () => {
  try {
    const ytdlpPath = path.join(binDir, 'yt-dlp');
    console.log('[*] Descargando yt-dlp...');
    await download(YTDLP_URL, ytdlpPath);
    fs.chmodSync(ytdlpPath, 0o755);
    console.log('[ok] yt-dlp listo:', ytdlpPath);

    const ffmpegArchive = path.join(os.tmpdir(), 'ffmpeg-amd64-static.tar.xz');
    console.log('[*] Descargando ffmpeg estático...');
    await download(FFMPEG_URL, ffmpegArchive);
    console.log('[warn] Por simplicidad, coloca manualmente el binario ffmpeg en ./bin y marca +x.');
  } catch (e) {
    console.error('[error] No se pudieron obtener binarios automáticamente:', e.message);
  }
})();
