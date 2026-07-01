import express from "express";
import cors from "cors";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { Readable } from "stream";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4000;

// Trust Render's reverse proxy so req.protocol reports "https" correctly
app.set("trust proxy", true);

app.use(cors());
app.use(express.json());

// ── crash / memory visibility (kept lightweight, no more OOM expected) ─────
process.on("uncaughtException", (err) => {
  console.error("[FATAL uncaughtException]", err.stack || err.message);
});
process.on("unhandledRejection", (reason) => {
  console.error("[FATAL unhandledRejection]", reason instanceof Error ? reason.stack : reason);
});
setInterval(() => {
  const mem = process.memoryUsage();
  console.log(`[memory] rss=${Math.round(mem.rss / 1024 / 1024)}MB heapUsed=${Math.round(mem.heapUsed / 1024 / 1024)}MB`);
}, 30000);

// ── cookies (optional fallback only — most requests won't need it) ─────────
// Render's Secret Files are mounted read-only, but yt-dlp needs a writable
// path to (re)save the cookie jar, so we copy it once at startup.
const RUNTIME_DIR = path.join(__dirname, ".runtime");
if (!fs.existsSync(RUNTIME_DIR)) fs.mkdirSync(RUNTIME_DIR, { recursive: true });

const SECRET_COOKIES_PATH = "/etc/secrets/cookies.txt";
const WRITABLE_COOKIES_PATH = path.join(RUNTIME_DIR, "cookies_runtime.txt");

function refreshWritableCookies() {
  try {
    if (fs.existsSync(SECRET_COOKIES_PATH)) {
      fs.copyFileSync(SECRET_COOKIES_PATH, WRITABLE_COOKIES_PATH);
      return true;
    }
  } catch (e) {
    console.error("[cookies] failed to copy secret cookies file:", e.message);
  }
  return false;
}
const cookiesAvailable = refreshWritableCookies();
console.log(cookiesAvailable ? "[cookies] loaded from secret file" : "[cookies] no secret cookies file found — Android client only");

const COOKIES_ARGS = cookiesAvailable ? ["--cookies", WRITABLE_COOKIES_PATH] : [];

// ── helpers ──────────────────────────────────────────────────────────────

function detectProjection(info) {
  const haystack = [
    info.title ?? "",
    ...(info.tags ?? []),
    ...(info.categories ?? []),
    info.description ?? "",
  ].join(" ").toLowerCase();

  if (["equirectangular", "spherical"].includes(info.projection)) return "360";
  if (/\b360\b/.test(haystack)) return "360";
  if (/\bvr\b/.test(haystack)) return "360";
  if (/360.{0,4}degree/i.test(haystack)) return "360";
  if (/equirectangular/i.test(haystack)) return "360";
  return "flat";
}

// Plain metadata lookup (used by /info for the URL preview card)
async function ytDlpDumpJson(url, extraArgs) {
  const args = ["--dump-json", "--no-playlist", ...extraArgs, url];
  const { stdout } = await execFileAsync("yt-dlp", args, { maxBuffer: 1024 * 1024 * 16 });
  return JSON.parse(stdout);
}

async function getVideoInfo(url) {
  try {
    return await ytDlpDumpJson(url, ["--extractor-args", "youtube:player_client=android"]);
  } catch (e) {
    console.error("[info android client failed]", e.stderr || e.message);
  }
  if (cookiesAvailable) {
    return await ytDlpDumpJson(url, ["--js-runtimes", "node", "--remote-components", "ejs:github", ...COOKIES_ARGS]);
  }
  throw new Error("Could not fetch video info via Android client, and no cookies fallback available.");
}

// Metadata + a single progressive (video+audio already combined) format,
// so we get a playable direct URL with no server-side merge step at all.
async function ytDlpResolveFormat(url, extraArgs) {
  const args = [
    "-f", "best[height<=720][ext=mp4][acodec!=none][vcodec!=none]/best[ext=mp4][acodec!=none][vcodec!=none]/best",
    "--no-playlist",
    "-j",
    ...extraArgs,
    url,
  ];
  const { stdout } = await execFileAsync("yt-dlp", args, { maxBuffer: 1024 * 1024 * 16 });
  const info = JSON.parse(stdout);
  if (!info.url) throw new Error("Resolved format has no direct playable URL (would need merging).");
  return info;
}

// Tries the Android client first — usually bypasses YouTube's bot-check
// entirely, no cookies/JS runtime needed. Falls back to cookies + web
// client (with JS-runtime signature solving) if that fails.
async function resolveStream(url) {
  try {
    return await ytDlpResolveFormat(url, ["--extractor-args", "youtube:player_client=android"]);
  } catch (e) {
    console.error("[stream android client failed]", e.stderr || e.message);
  }
  if (cookiesAvailable) {
    try {
      return await ytDlpResolveFormat(url, ["--js-runtimes", "node", "--remote-components", "ejs:github", ...COOKIES_ARGS]);
    } catch (e) {
      console.error("[stream cookies fallback failed]", e.stderr || e.message);
      throw e;
    }
  }
  throw new Error("Could not resolve a direct stream URL via Android client, and no cookies fallback available.");
}

// ── routes ───────────────────────────────────────────────────────────────

// Resolves a direct CDN URL via yt-dlp, then hands back OUR OWN /proxy url
// (not the raw googlevideo.com link) — the player needs crossOrigin="anonymous"
// for the WebGL video texture, and YouTube's CDN doesn't send CORS headers,
// so the raw link would fail to load in the VR sphere even though it plays
// fine in a plain <video> tag.
app.get("/stream", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "Missing url" });
  try {
    const info = await resolveStream(String(url));
    const projection = detectProjection(info);
    const streamUrl = `${req.protocol}://${req.get("host")}/proxy?url=${encodeURIComponent(info.url)}`;
    res.json({
      streamUrl,
      title: info.title,
      thumbnail: info.thumbnail ?? null,
      duration: info.duration ?? null,
      uploader: info.uploader ?? null,
      projection,
    });
  } catch (err) {
    console.error("[stream error]", err.stderr || err.message);
    res.status(500).json({ error: (err.stderr || err.message || "Could not resolve stream").toString().slice(0, 500) });
  }
});

app.get("/info", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "Missing url" });
  try {
    const info = await getVideoInfo(String(url));
    res.json({
      title: info.title,
      thumbnail: info.thumbnail,
      duration: info.duration,
      uploader: info.uploader,
      projection: detectProjection(info),
    });
  } catch (err) {
    res.status(500).json({ error: (err.stderr || err.message || "").toString().slice(0, 500) });
  }
});

// Streams bytes straight through from the CDN to the browser — no disk
// write, no full-file buffering in memory. This is what actually fixes the
// OOM crashes (RAM usage stays flat regardless of video length/resolution),
// and it adds the CORS header the CDN doesn't provide, which the video
// texture needs.
app.get("/proxy", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "Missing url" });

  try {
    const upstreamHeaders = { "user-agent": "Mozilla/5.0" };
    if (req.headers.range) upstreamHeaders.range = req.headers.range;

    const upstream = await fetch(String(url), { headers: upstreamHeaders });

    res.status(upstream.status);
    for (const h of ["content-type", "content-length", "content-range", "accept-ranges"]) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "no-store");

    if (!upstream.body) return res.end();
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (err) {
    console.error("[proxy error]", err.message);
    if (!res.headersSent) res.status(502).json({ error: "Upstream fetch failed: " + err.message });
  }
});

app.get("/debug-cookies", async (req, res) => {
  try {
    refreshWritableCookies();
    const info = await ytDlpResolveFormat("https://www.youtube.com/watch?v=VDNIuBQBSmk", [
      "--js-runtimes", "node", "--remote-components", "ejs:github", ...COOKIES_ARGS,
    ]);
    res.json({ success: true, cookiesAvailable, title: info.title, hasUrl: !!info.url });
  } catch (e) {
    res.json({ success: false, cookiesAvailable, error: e.stderr || e.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🎬  VR Video Server (streaming-only, no downloads)`);
  console.log(`   API → http://localhost:${PORT}\n`);
});
