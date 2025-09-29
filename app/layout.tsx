
export const metadata = {
  title: "flacdown-web",
  description: "Descarga audio con yt-dlp + ffmpeg",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body style={{ maxWidth: 820, margin: '40px auto', padding: '0 16px', fontFamily: 'system-ui, sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
