# VRVault - 360° VR Video Player

## Quick Start

### 1. Install dependencies
```
cd server && npm install
cd ../client && npm install
```

### 2. Start server (Terminal 1)
```
cd server
npm start
```

### 3. Start frontend (Terminal 2)
```
cd client
npm run dev
```

Open browser: http://localhost:5173

---

## Gyroscope / Head Tracking

### On Phone (Android or iPhone):
1. Connect your phone to the **same WiFi or hotspot** as your PC
2. Open Chrome on your phone
3. Go to: `http://YOUR-PC-IP:5173`  
   (Your PC IP is shown when you run `npm run dev` — look for "Network: http://...")
4. Download or play a 360° video
5. In the VR player, tap **📱 Gyro** button
6. **Move your phone** — the video follows your head!
7. Put phone in VR cardboard headset for full VR experience

### On Laptop (Mouse drag):
- Click and drag left/right/up/down to look around

### iPhone note:
- iOS requires HTTPS for gyroscope
- Use ngrok: `ngrok http 5173` → open the https URL on your phone

---

## ffmpeg (needed for merging video+audio)
Windows: Download from https://www.gyan.dev/ffmpeg/builds/
Extract to `C:\ffmpeg\` so that `C:\ffmpeg\ffmpeg.exe` exists.

Mac: `brew install ffmpeg`
Linux: `sudo apt install ffmpeg`
