
export function sanitizeFilename(name: string, maxLen = 200): string {
  const cleaned = name.replace(/[\\/:*?"<>|\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.slice(0, maxLen);
}
