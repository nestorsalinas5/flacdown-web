
'use client';

import { useState } from 'react';

type Info = any;

export default function Home() {
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState<'flac' | 'mp3' | 'opus' | 'wav'>('flac');
  const [info, setInfo] = useState<Info | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function fetchInfo() {
  setError(null);
  setInfo(null);
  setDownloadUrl(null);
  try {
    const res = await fetch(`/api/info?q=${encodeURIComponent(url)}`);
    const text = await res.text();
    if (!res.ok) {
      // si el server devolvió JSON de error, inténtalo:
      try {
        const data = JSON.parse(text);
        throw new Error(data.error || data.details || 'Error al obtener info');
      } catch {
        throw new Error(text || 'Error al obtener info');
      }
    }
    const data = JSON.parse(text);
    setInfo(data);
  } catch (e:any) {
    setError(e.message);
  }
}


  async function doDownload() {
    setError(null);
    setDownloading(true);
    setDownloadUrl(null);
    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url, format }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fallo en descarga');
      setDownloadUrl(data.url);
    } catch (e:any) {
      setError(e.message);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <main>
      <h1>flacdown-web</h1>
      <p>Ingresa una URL (YouTube, etc.) o una búsqueda (ej. <code>ytsearch5:tu tema</code>).</p>
      <div style={{ display:'grid', gap:12, marginTop:16 }}>
        <input placeholder="URL o búsqueda" value={url} onChange={e=>setUrl(e.target.value)} style={{ padding:8 }} />
        <div>
          <label>Formato:&nbsp;</label>
          {['flac','mp3','opus','wav'].map(f => (
            <label key={f} style={{ marginRight:12 }}>
              <input type="radio" name="fmt" value={f} checked={format===f} onChange={()=>setFormat(f as any)} />
              &nbsp;{f.toUpperCase()}
            </label>
          ))}
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={fetchInfo}>Ver info</button>
          <button onClick={doDownload} disabled={downloading}>{downloading ? 'Descargando...' : 'Descargar'}</button>
        </div>
      </div>

      {error && <p style={{ color:'crimson', marginTop:16 }}>⚠️ {error}</p>}

      {info && (
        <pre style={{ background:'#111', color:'#eee', padding:12, marginTop:16, overflow:'auto' }}>
{JSON.stringify(info, null, 2)}
        </pre>
      )}

      {downloadUrl && (
        <p style={{ marginTop:16 }}>
          ✅ Listo: <a href={downloadUrl} target="_blank" rel="noreferrer">Descargar archivo</a>
        </p>
      )}
    </main>
  );
}
