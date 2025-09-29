
# flacdown-web (Vercel)

Web app para descargar audio (FLAC/MP3/OPUS/WAV) usando `yt-dlp` + `ffmpeg` en Vercel.

## Requisitos
- Cuenta en Vercel
- Token de escritura para Vercel Blob: `BLOB_READ_WRITE_TOKEN`

## Instalación
```bash
pnpm i # o npm i / yarn
```

El script de postinstall descargará los binarios de `yt-dlp` y `ffmpeg` en `./bin`.

> Si el script falla en tu entorno, descarga manualmente y colócalos en `bin/` (dar permisos +x).

## Desarrollo
```bash
pnpm dev
```

## Deploy
1. Configura variables de entorno en Vercel:
   - `BLOB_READ_WRITE_TOKEN` (Read-Write)
2. `vercel` (o conecta el repo desde el dashboard)
