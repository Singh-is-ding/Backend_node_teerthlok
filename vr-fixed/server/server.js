import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import { createReadStream, statSync, existsSync, readdirSync } from 'fs';
import { unlink } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4000;
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');

function getFfmpegPath() {
  const candidates = ['C:\\ffmpeg\\ffmpeg.exe','C:\\ffmpeg\\bin\\ffmpeg.exe'];
  if (process.platform === 'win32') {
    for (const p of candidates) if (existsSync(p)) return p;
  }
  return 'ffmpeg';
}
const FFMPEG = getFfmpegPath();

app.use(cors());
app.use(express.json());

const jobs = new Map();

app.post('/info', (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });
  const ytdlp = spawn('yt-dlp', ['--dump-json','--no-download','--no-warnings', url]);
  let data = '';
  ytdlp.stdout.on('data', c => data += c);
  ytdlp.stderr.on('data', () => {});
  ytdlp.on('close', code => {
    if (code !== 0 || !data.trim()) return res.status(400).json({ error: 'Cannot fetch info' });
    try {
      const info = JSON.parse(data);
      res.json({
        title: info.title, thumbnail: info.thumbnail, duration: info.duration,
        is360: (info.tags||[]).some(t=>/360|vr/i.test(t)) || /360|vr/i.test(info.title||''),
        uploader: info.uploader,
      });
    } catch { res.status(400).json({ error: 'Parse error' }); }
  });
});

app.post('/download', (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });
  const jobId = Date.now().toString();
  jobs.set(jobId, { status: 'pending', progress: 0, filename: null, error: null });
  res.json({ jobId });

  const args = [
    '--no-mtime','--no-warnings',
    '-o', path.join(DOWNLOADS_DIR, '%(title).100s.%(ext)s'),
    '--ffmpeg-location', FFMPEG,
    '--merge-output-format', 'mp4',
    '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
    '--newline', url
  ];

  const ytdlp = spawn('yt-dlp', args);
  let lastFile = null;

  ytdlp.stdout.on('data', data => {
    const text = data.toString();
    process.stdout.write(text);
    const pct = text.match(/(\d+\.?\d*)%/);
    if (pct) { jobs.get(jobId).progress = Math.min(95, parseFloat(pct[1])); jobs.get(jobId).status = 'downloading'; }
    const dest = text.match(/Destination: (.+)/);
    if (dest) lastFile = path.basename(dest[1].trim());
    const merge = text.match(/Merging formats into "(.+)"/);
    if (merge) lastFile = path.basename(merge[1].trim());
  });
  ytdlp.stderr.on('data', d => process.stderr.write(d));
  ytdlp.on('close', code => {
    if (code !== 0) { jobs.get(jobId).status = 'error'; jobs.get(jobId).error = 'Download failed.'; return; }
    let found = null;
    if (lastFile && existsSync(path.join(DOWNLOADS_DIR, lastFile))) found = lastFile;
    else {
      try {
        const files = readdirSync(DOWNLOADS_DIR)
          .filter(f => /\.(mp4|webm|mkv|m4v)$/i.test(f) && f !== '.gitkeep')
          .map(f => ({ name: f, mtime: statSync(path.join(DOWNLOADS_DIR, f)).mtimeMs }))
          .sort((a,b) => b.mtime - a.mtime);
        if (files.length) found = files[0].name;
      } catch {}
    }
    if (found) { jobs.get(jobId).status = 'done'; jobs.get(jobId).progress = 100; jobs.get(jobId).filename = found; }
    else { jobs.get(jobId).status = 'error'; jobs.get(jobId).error = 'File not found after download.'; }
  });
});

app.get('/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Not found' });
  res.json(job);
});

app.get('/video/:name', (req, res) => {
  const file = path.join(DOWNLOADS_DIR, req.params.name);
  if (!existsSync(file)) return res.status(404).send('Not found');
  const stat = statSync(file);
  const range = req.headers.range;
  if (range) {
    const [s, e] = range.replace(/bytes=/,'').split('-');
    const start = parseInt(s,10), end = e ? parseInt(e,10) : stat.size-1;
    res.writeHead(206, { 'Content-Range':`bytes ${start}-${end}/${stat.size}`, 'Accept-Ranges':'bytes', 'Content-Length':end-start+1, 'Content-Type':'video/mp4' });
    createReadStream(file,{start,end}).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Length':stat.size, 'Content-Type':'video/mp4', 'Accept-Ranges':'bytes' });
    createReadStream(file).pipe(res);
  }
});

app.get('/list', (req, res) => {
  try {
    const files = readdirSync(DOWNLOADS_DIR)
      .filter(f => /\.(mp4|webm|mkv|m4v)$/i.test(f) && f !== '.gitkeep')
      .map(f => { const s=statSync(path.join(DOWNLOADS_DIR,f)); return {name:f,size:s.size,date:s.mtime}; })
      .sort((a,b) => new Date(b.date)-new Date(a.date));
    res.json(files);
  } catch { res.json([]); }
});

app.delete('/video/:name', async (req, res) => {
  try { await unlink(path.join(DOWNLOADS_DIR, req.params.name)); res.json({ok:true}); }
  catch { res.status(404).json({error:'Not found'}); }
});

app.listen(PORT, () => {
  console.log(`\n🎬  VR Video Server`);
  console.log(`   API   → http://localhost:${PORT}`);
  console.log(`   Files → ${DOWNLOADS_DIR}`);
  console.log(`   ffmpeg→ ${FFMPEG}\n`);
});
