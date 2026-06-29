const BASE = import.meta.env.VITE_API_URL || "";

export async function fetchInfo(url) {
  const res = await fetch(`${BASE}/info?url=${encodeURIComponent(url)}`);
  if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
  return res.json();
}

export async function startDownload(url) {
  const res = await fetch(`${BASE}/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
  const data = await res.json();
  return data.jobId;
}

export async function pollJob(jobId) {
  const res = await fetch(`${BASE}/jobs/${jobId}`);
  if (!res.ok) throw new Error("Job not found");
  return res.json();
}

export async function listFiles() {
  const res = await fetch(`${BASE}/list`);
  if (!res.ok) throw new Error("Failed to list files");
  return res.json();
}

export async function deleteFile(name) {
  await fetch(`${BASE}/video/${encodeURIComponent(name)}`, { method: "DELETE" });
}

export function videoUrl(filename) {
  return `${BASE}/video/${encodeURIComponent(filename)}`;
}

export function formatBytes(bytes) {
  if (!bytes) return "";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function formatDuration(secs) {
  if (!secs) return "";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  return `${m}:${String(s).padStart(2,"0")}`;
}
