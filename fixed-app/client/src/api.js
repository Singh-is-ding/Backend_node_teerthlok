const BASE = import.meta.env.VITE_API_URL || "";

export async function fetchInfo(url) {
  const res = await fetch(`${BASE}/info?url=${encodeURIComponent(url)}`);
  if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
  return res.json();
}

// Replaces the old startDownload + pollJob flow — a single call that returns
// a direct, playable stream URL (routed through our own /proxy for CORS).
// No server-side downloading or storage happens.
export async function fetchStream(url) {
  const res = await fetch(`${BASE}/stream?url=${encodeURIComponent(url)}`);
  if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
  return res.json();
}

export function formatDuration(secs) {
  if (!secs) return "";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  return `${m}:${String(s).padStart(2,"0")}`;
}
