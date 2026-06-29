# 🥽 VRVAULT — Immersive VR Video Player

A full-stack VR video downloader and 360° player built with React + Three.js + Node.js.

## Features

- 🔗 Paste any video URL (YouTube, Vimeo, 500+ sites via yt-dlp)
- ⬇ Backend downloads best quality MP4 with real-time progress
- 🌐 360° equirectangular video playback inside a Three.js sphere
- 🖱 Mouse drag / touch drag to look around
- 📱 Mobile gyroscope support
- 🥽 WebXR headset support (Oculus, Quest, etc.)
- 📁 Upload local 360° video files
- 📚 Library page to manage downloads
- 🎨 Modern dark UI with TailwindCSS

---

## Project Structure

```
vr-video-app/
├── client/                    # React + Vite frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── Navbar.jsx
│   │   │   └── VRPlayer.jsx   # Three.js 360° player
│   │   ├── pages/
│   │   │   ├── HomePage.jsx   # URL input + download
│   │   │   ├── PlayerPage.jsx # VR player page
│   │   │   └── LibraryPage.jsx
│   │   ├── api.js
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── package.json
└── server/                    # Node.js + Express backend
    ├── server.js
    ├── downloads/             # Downloaded videos stored here
    └── package.json
```

---

## Prerequisites

Install these before running:

### 1. Node.js v18+
```bash
# Check version
node --version
```
Download from: https://nodejs.org

### 2. yt-dlp
```bash
pip install yt-dlp

# Verify
yt-dlp --version
```

### 3. ffmpeg
```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg

# Windows: download from https://ffmpeg.org → add to PATH
```

---

## Local Development

### Step 1 — Install dependencies

```bash
# Install server deps
cd server
npm install
cd ..

# Install client deps
cd client
npm install
cd ..
```

### Step 2 — Start the server

Open **Terminal 1**:
```bash
cd server
npm start
```
Server runs at: http://localhost:4000

### Step 3 — Start the client

Open **Terminal 2**:
```bash
cd client
npm run dev
```
App runs at: http://localhost:5173

### Step 4 — Use it

1. Open http://localhost:5173
2. Paste a YouTube URL or any supported video URL
3. Wait for the preview to load
4. Click **Download** and watch progress in real time
5. Click **▶ Watch in VR** when done
6. In the VR player: drag to look around, use gyroscope on mobile, click 🥽 for WebXR

---

## Production Build

```bash
cd client
npm run build
# Output in client/dist/ — deploy to Vercel/Netlify
```

---

## Deployment

### Frontend → Vercel (free)

1. Push your repo to GitHub
2. Go to https://vercel.com → New Project → import repo
3. Set **Root Directory** to `client`
4. Add environment variable:
   ```
   VITE_API_URL = https://your-backend.onrender.com
   ```
5. Deploy

### Backend → Render (free tier)

1. Go to https://render.com → New Web Service
2. Connect your GitHub repo
3. Set **Root Directory** to `server`
4. Build command: `npm install`
5. Start command: `npm start`
6. Add build step to install yt-dlp:
   - In Render dashboard → Shell → run `pip install yt-dlp`
   - Or add to a `build.sh` script

> ⚠️ **Note:** Free Render instances sleep after inactivity and don't persist files.
> For production use, use a paid plan or a VPS (DigitalOcean, Hetzner).

### Backend → Railway

1. Go to https://railway.app → New Project → Deploy from GitHub
2. Select the `server` folder
3. Railway auto-detects Node.js
4. Add `pip install yt-dlp` as a build command
5. Set `PORT` env var if needed

### Backend → VPS (most reliable)

```bash
# On your Ubuntu VPS:
sudo apt install nodejs npm ffmpeg python3-pip
pip install yt-dlp

# Upload your server/ folder, then:
npm install
npm install -g pm2
pm2 start server.js --name vr-server
pm2 save
pm2 startup
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/download` | Start download job → `{ jobId }` |
| GET | `/jobs/:id` | Poll job status |
| GET | `/video/:name` | Stream video (supports range requests) |
| GET | `/info?url=` | Preview metadata without downloading |
| GET | `/list` | List all downloaded files |
| DELETE | `/video/:name` | Delete a file |

---

## Supported Sites

Any site supported by yt-dlp — 700+ including YouTube, Vimeo, Twitter, Reddit, Dailymotion, TikTok, and more.
Full list: https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md
