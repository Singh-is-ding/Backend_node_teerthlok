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

// ── crash / memory visibility ───────────────────────────────────────────
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

// ── concurrency lock ─────────────────────────────────────────────────────
// The cookies + JS-runtime fallback spins up a heavy Node subprocess
// (yt-dlp's signature/JS challenge solver). Two of these running at once
// is what was blowing past 512MB and crashing the instance — e.g. the
// preview /info call and a /stream click landing close together.
// This queue guarantees at most ONE heavy resolve runs at a time; anything
// else just waits its turn instead of spawning a second subprocess.
let resolveQueue = Promise.resolve();
function runExclusive(fn) {
  const run = resolveQueue.then(fn, fn); // run fn regardless of prior success/failure
  // keep the chain alive but don't let a rejection break future queuing
  resolveQueue = run.catch(() => {});
  return run;
}

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

// Plain metadata lookup (used by /info for the URL preview card).
// Android-client-only, no cookies/JS-runtime fallback — kept deliberately
// cheap since it fires on every keystroke via debounce.
async function ytDlpDumpJson(url, extraArgs) {
  const args = ["--dump-json", "--no-playlist", ...extraArgs, url];
  const { stdout } = await execFileAsync("yt-dlp", args, { maxBuffer: 1024 * 1024 * 16 });
  return JSON.parse(stdout);
}

async function getVideoInfo(url) {
  return await ytDlpDumpJson(url, ["--extractor-args", "youtube:player_client=android"]);
}

// Metadata + a single progressive (video+audio already combined) MP4 format.
// IMPORTANT: no bare "best" fallback. A bare "best" can resolve to an HLS
// (.m3u8) manifest instead of a single file — our /proxy route pipes bytes
// verbatim, so an HLS manifest's individual .ts segment URLs point straight
// at googlevideo.com and bypass the proxy entirely, causing CORS failures
// in the player. Keeping this MP4-only means info.url is always a single
// direct file our proxy can actually cover end-to-end.
async function ytDlpResolveFormat(url, extraArgs) {
  const args = [
    "-f", "best[height<=720][ext=mp4][acodec!=none][vcodec!=none]/worst[ext=mp4][acodec!=none][vcodec!=none]",
    "--no-playlist",
    "-j",
    ...extraArgs,
    url,
  ];
  const { stdout } = await execFileAsync("yt-dlp", args, { maxBuffer: 1024 * 1024 * 16 });
  const info = JSON.parse(stdout);
  if (!info.url) throw new Error("Resolved format has no direct playable URL (would need merging).");
  if (info.protocol && /m3u8|hls|dash/i.test(info.protocol)) {
    throw new Error("Only an HLS/DASH stream is available for this video — no single progressive MP4 file exists, so it can't be proxied.");
  }
  return info;
}

// Tries the Android client first — usually bypasses YouTube's bot-check
// entirely, no cookies/JS runtime needed. Falls back to cookies + web
// client (with JS-runtime signature solving) if that fails.
// Wrapped in runExclusive so only one heavy resolve ever runs at once.
async function resolveStream(url) {
  return runExclusive(async () => {
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
  });
}

// ── routes ───────────────────────────────────────────────────────────────

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
// write, no full-file buffering in memory. RAM stays flat regardless of
// video length/resolution, and it adds the CORS header the CDN doesn't
// provide, which the WebGL video texture needs.
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
    const info = await runExclusive(() =>
      ytDlpResolveFormat("https://www.youtube.com/watch?v=VDNIuBQBSmk", [
        "--js-runtimes", "node", "--remote-components", "ejs:github", ...COOKIES_ARGS,
      ])
    );
    res.json({ success: true, cookiesAvailable, title: info.title, hasUrl: !!info.url });
  } catch (e) {
    res.json({ success: false, cookiesAvailable, error: e.stderr || e.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🎬  VR Video Server (streaming-only, no downloads)`);
  console.log(`   API → http://localhost:${PORT}\n`);
});
