import express from "express";
import cors from "cors";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4000;
const DOWNLOADS_DIR = path.join(__dirname, "downloads");

if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

app.use(cors());
app.use(express.json());

// ── helpers ───────────────────────────────────────────────────────────────────

function safeName(str) {
  return (str ?? "video")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 80) || "video";
}

async function getVideoInfo(url) {
  const { stdout } = await execAsync(
    `yt-dlp --dump-json --no-playlist "${url}"`,
    { maxBuffer: 1024 * 1024 * 16 }
  );
  return JSON.parse(stdout);
}

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

// Find any video file containing the videoId
function findDownloadedFile(videoId) {
  const files = fs.readdirSync(DOWNLOADS_DIR);
  // First look for a clean merged mp4 (no .fXXX in name)
  const merged = files.find(f => f.includes(videoId) && /\.mp4$/i.test(f) && !/\.f\d+\./.test(f));
  if (merged) return merged;
  // Then any video file with the videoId
  const any = files.find(f => f.includes(videoId) && /\.(mp4|mkv|webm)$/i.test(f));
  if (any) return any;
  // Fallback: newest video file in last 120 seconds
  const recent = files
    .filter(f => /\.(mp4|mkv|webm)$/i.test(f) && !/\.f\d+\./.test(f))
    .map(f => ({ name: f, mtime: fs.statSync(path.join(DOWNLOADS_DIR, f)).mtimeMs }))
    .filter(f => Date.now() - f.mtime < 120000)
    .sort((a, b) => b.mtime - a.mtime)[0];
  return recent?.name ?? null;
}

// Manually merge video+audio using ffmpeg if needed
async function mergeIfNeeded(videoId, title, onProgress) {
  const files = fs.readdirSync(DOWNLOADS_DIR);

  // Check if already merged
  const merged = files.find(f => f.includes(videoId) && /\.mp4$/i.test(f) && !/\.f\d+\./.test(f));
  if (merged) return merged;

  // Find split video and audio files
  const videoFile = files.find(f => f.includes(videoId) && /\.f\d+\.mp4$/i.test(f));
  const audioFile = files.find(f => f.includes(videoId) && /\.f\d+\.m4a$/i.test(f));

  if (!videoFile) return null;

  const outputName = `${title}_${videoId}.mp4`;
  const outputPath = path.join(DOWNLOADS_DIR, outputName);

  // Find ffmpeg
  const ffmpegPaths = [
    "C:\\ffmpeg\\ffmpeg.exe",
    "ffmpeg",
  ];

  let ffmpegExe = null;
  for (const p of ffmpegPaths) {
    try {
      await execAsync(`"${p}" -version`, { timeout: 3000 });
      ffmpegExe = p;
      break;
    } catch {}
  }

  if (!ffmpegExe) {
    // ffmpeg not found — just serve the video-only file
    console.log("[warn] ffmpeg not found, serving video-only file");
    return videoFile;
  }

  onProgress?.({ message: "Merging video and audio..." });

  const videoPath = path.join(DOWNLOADS_DIR, videoFile);

  if (audioFile) {
    const audioPath = path.join(DOWNLOADS_DIR, audioFile);
    await execAsync(
      `"${ffmpegExe}" -i "${videoPath}" -i "${audioPath}" -c:v copy -c:a aac -y "${outputPath}"`,
      { maxBuffer: 1024 * 1024 * 32 }
    );
    // Clean up split files
    try { fs.unlinkSync(videoPath); } catch {}
    try { fs.unlinkSync(audioPath); } catch {}
  } else {
    // No audio file, just rename video
    fs.renameSync(videoPath, outputPath);
  }

  if (fs.existsSync(outputPath)) return outputName;
  return videoFile;
}

// ── jobs ──────────────────────────────────────────────────────────────────────

const jobs = new Map();

// ── routes ────────────────────────────────────────────────────────────────────

app.post("/download", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "Missing url" });

  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  jobs.set(jobId, { status: "pending", progress: 0, message: "Queued..." });

  (async () => {
    try {
      jobs.set(jobId, { status: "running", progress: 5, message: "Fetching metadata..." });

      let info;
      try {
        info = await getVideoInfo(url);
      } catch (e) {
        throw new Error("Could not fetch video info. Check the URL.");
      }

      const title = safeName(info.title);
      const videoId = info.id ?? Date.now().toString();
      const projection = detectProjection(info);

      // Check cache first
      const existingFile = findDownloadedFile(videoId);
      if (existingFile) {
        jobs.set(jobId, {
          status: "done", progress: 100,
          message: "Using cached file.",
          filename: existingFile,
          projection, title: info.title,
          thumbnail: info.thumbnail ?? null,
          duration: info.duration ?? null,
        });
        return;
      }

      jobs.set(jobId, { status: "running", progress: 10, message: "Starting download..." });

      const outputTemplate = path.join(DOWNLOADS_DIR, `${title}_${videoId}.%(ext)s`);

      await new Promise((resolve, reject) => {
        const isWindows = process.platform === "win32";

        // Try to use ffmpeg if available, otherwise download best single format
        const args = [
          "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
          "--no-playlist",
          "--newline",
          "--no-part",
          "--no-mtime",
          "--ffmpeg-location", "C:\\ffmpeg\\ffmpeg.exe",
          "--merge-output-format", "mp4",
          "-o", outputTemplate,
          url,
        ];

        console.log("[yt-dlp] starting download...");

        const ytdlp = spawn("yt-dlp", args, { shell: isWindows, windowsHide: true });

        ytdlp.stdout.on("data", (data) => {
          const lines = data.toString().split("\n");
          for (const line of lines) {
            if (line.trim()) console.log("[yt-dlp]", line.trim());
            const match = line.match(/(\d+\.?\d*)%/);
            if (match) {
              const pct = Math.min(90, Math.round(parseFloat(match[1])));
              const current = jobs.get(jobId);
              if (current) jobs.set(jobId, { ...current, progress: pct, message: `Downloading... ${pct}%` });
            }
          }
        });

        ytdlp.stderr.on("data", (d) => console.error("[yt-dlp err]", d.toString().trim()));
        ytdlp.on("close", (code) => {
          console.log("[yt-dlp] exit code:", code);
          code === 0 ? resolve() : reject(new Error(`yt-dlp failed (code ${code})`));
        });
        ytdlp.on("error", (e) => reject(new Error(`yt-dlp not found: ${e.message}`)));
      });

      // Try to find or merge the output file
      jobs.set(jobId, { status: "running", progress: 92, message: "Finalizing..." });

      let outputName = findDownloadedFile(videoId);

      // If split files exist, merge them
      if (!outputName || /\.f\d+\./.test(outputName)) {
        outputName = await mergeIfNeeded(videoId, title, ({ message }) => {
          const current = jobs.get(jobId);
          if (current) jobs.set(jobId, { ...current, message });
        });
      }

      if (!outputName) {
        const allFiles = fs.readdirSync(DOWNLOADS_DIR);
        console.error("[error] downloads folder:", allFiles);
        throw new Error(`File not found after download. Folder has: ${allFiles.filter(f => f !== ".gitkeep").join(", ") || "(empty)"}`);
      }

      console.log("[done]", outputName);
      jobs.set(jobId, {
        status: "done", progress: 100, message: "Ready!",
        filename: outputName, projection,
        title: info.title,
        thumbnail: info.thumbnail ?? null,
        duration: info.duration ?? null,
      });

    } catch (err) {
      console.error("[job error]", err.message);
      jobs.set(jobId, { status: "error", progress: 0, message: err.message });
    }
  })();

  return res.json({ jobId });
});

app.get("/jobs/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });
  return res.json(job);
});

app.get("/video/:name", (req, res) => {
  const filePath = path.join(DOWNLOADS_DIR, req.params.name);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found" });

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = { ".mp4": "video/mp4", ".mkv": "video/x-matroska", ".webm": "video/webm", ".m4a": "video/mp4" };
  const contentType = mimeTypes[ext] || "video/mp4";

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": end - start + 1,
      "Content-Type": contentType,
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { "Content-Length": fileSize, "Content-Type": contentType, "Accept-Ranges": "bytes" });
    fs.createReadStream(filePath).pipe(res);
  }
});

app.get("/info", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "Missing url" });
  try {
    const info = await getVideoInfo(String(url));
    return res.json({ title: info.title, thumbnail: info.thumbnail, duration: info.duration, uploader: info.uploader, projection: detectProjection(info) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/list", (_req, res) => {
  try {
    const files = fs.readdirSync(DOWNLOADS_DIR)
      .filter(f => /\.(mp4|mkv|webm)$/i.test(f) && !/\.f\d+\./.test(f))
      .map(name => {
        const stat = fs.statSync(path.join(DOWNLOADS_DIR, name));
        return { name, size: stat.size, createdAt: stat.birthtime };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/video/:name", (req, res) => {
  const fp = path.join(DOWNLOADS_DIR, req.params.name);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: "Not found" });
  try { fs.unlinkSync(fp); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(PORT, () => {
  console.log(`\n🎬  VR Video Server`);
  console.log(`   API  → http://localhost:${PORT}`);
  console.log(`   Files-> ${DOWNLOADS_DIR}\n`);
});
