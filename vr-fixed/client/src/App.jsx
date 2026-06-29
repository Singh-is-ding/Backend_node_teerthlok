import { useState } from 'react';
import VRPlayer from './components/VRPlayer';

const API = 'http://localhost:4000';

export default function App() {
  const [url, setUrl] = useState('');
  const [info, setInfo] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('idle'); // idle | fetching | downloading | done | error
  const [videoFile, setVideoFile] = useState(null);
  const [error, setError] = useState('');
  const [library, setLibrary] = useState([]);
  const [tab, setTab] = useState('home');
  const [localFile, setLocalFile] = useState(null);

  const fetchInfo = async () => {
    if (!url.trim()) return;
    setStatus('fetching'); setError(''); setInfo(null);
    try {
      const r = await fetch(`${API}/info`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setInfo(d); setStatus('idle');
    } catch (e) { setError(e.message); setStatus('error'); }
  };

  const startDownload = async () => {
    setStatus('downloading'); setProgress(0); setError(''); setVideoFile(null);
    try {
      const r = await fetch(`${API}/download`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setJobId(d.jobId);
      pollJob(d.jobId);
    } catch (e) { setError(e.message); setStatus('error'); }
  };

  const pollJob = (id) => {
    const iv = setInterval(async () => {
      try {
        const r = await fetch(`${API}/jobs/${id}`);
        const job = await r.json();
        setProgress(job.progress || 0);
        if (job.status === 'done') {
          clearInterval(iv);
          setStatus('done');
          setVideoFile(`${API}/video/${encodeURIComponent(job.filename)}`);
          setProgress(100);
        } else if (job.status === 'error') {
          clearInterval(iv);
          setStatus('error');
          setError(job.error || 'Download failed');
        }
      } catch { clearInterval(iv); setStatus('error'); setError('Server error'); }
    }, 800);
  };

  const loadLibrary = async () => {
    try {
      const r = await fetch(`${API}/list`);
      setLibrary(await r.json());
    } catch {}
  };

  const fmt = (bytes) => {
    if (bytes > 1e9) return (bytes/1e9).toFixed(1)+'GB';
    if (bytes > 1e6) return (bytes/1e6).toFixed(1)+'MB';
    return (bytes/1e3).toFixed(0)+'KB';
  };

  const fmtDur = (s) => {
    const m = Math.floor(s/60), sec = Math.floor(s%60);
    return `${m}:${sec.toString().padStart(2,'0')}`;
  };

  // If watching a video
  if (videoFile || localFile) {
    return (
      <div style={{ width:'100vw', height:'100vh', background:'#000', display:'flex', flexDirection:'column' }}>
        <div style={{ padding:'12px 16px', background:'rgba(0,0,0,0.8)', display:'flex', alignItems:'center', gap:12, zIndex:10 }}>
          <button onClick={() => { setVideoFile(null); setLocalFile(null); }} style={navBtn}>← Back</button>
          <span style={{ color:'#fff', fontFamily:'sans-serif', fontSize:14, opacity:0.7 }}>
            {info?.title || 'Local Video'} • Drag to look around • 📱 Tap Gyro for head-tracking
          </span>
        </div>
        <div style={{ flex:1 }}>
          <VRPlayer src={localFile || videoFile} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight:'100vh', background:'#0a0a0f', color:'#fff', fontFamily:'system-ui,sans-serif' }}>
      {/* Header */}
      <div style={{ background:'rgba(255,255,255,0.04)', borderBottom:'1px solid rgba(255,255,255,0.08)', padding:'16px 24px', display:'flex', alignItems:'center', gap:24 }}>
        <span style={{ fontSize:22, fontWeight:700, letterSpacing:-0.5 }}>🥽 VR<span style={{color:'#e53e3e'}}>Vault</span></span>
        <div style={{ display:'flex', gap:4 }}>
          {['home','library'].map(t => (
            <button key={t} onClick={() => { setTab(t); if(t==='library') loadLibrary(); }}
              style={{ ...navBtn, background: tab===t ? 'rgba(229,62,62,0.15)' : 'transparent', color: tab===t ? '#e53e3e' : '#aaa', border: tab===t ? '1px solid rgba(229,62,62,0.3)' : '1px solid transparent' }}>
              {t.charAt(0).toUpperCase()+t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {tab === 'home' && (
        <div style={{ maxWidth:680, margin:'0 auto', padding:'48px 24px' }}>
          <h1 style={{ fontSize:36, fontWeight:800, marginBottom:8, letterSpacing:-1 }}>Watch 360° VR Videos</h1>
          <p style={{ color:'#888', marginBottom:32, fontSize:15 }}>Paste a YouTube URL or upload a local video • Works on phone with gyroscope</p>

          {/* URL input */}
          <div style={{ display:'flex', gap:8, marginBottom:16 }}>
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key==='Enter' && fetchInfo()}
              placeholder="Paste YouTube URL here..."
              style={{ flex:1, padding:'12px 16px', borderRadius:10, border:'1px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.06)', color:'#fff', fontSize:15, outline:'none' }}
            />
            <button onClick={fetchInfo} disabled={status==='fetching'} style={primaryBtn}>
              {status==='fetching' ? '...' : 'Preview'}
            </button>
          </div>

          {/* Local file upload */}
          <div style={{ textAlign:'center', color:'#666', marginBottom:16, fontSize:13 }}>— or —</div>
          <label style={{ display:'block', border:'2px dashed rgba(255,255,255,0.1)', borderRadius:12, padding:'20px', textAlign:'center', cursor:'pointer', color:'#888', fontSize:14, marginBottom:24 }}>
            📁 Upload local 360° video file
            <input type="file" accept="video/*" style={{display:'none'}} onChange={e => {
              const f = e.target.files[0];
              if (f) setLocalFile(URL.createObjectURL(f));
            }} />
          </label>

          {/* Error */}
          {error && <div style={{ background:'rgba(229,62,62,0.15)', border:'1px solid rgba(229,62,62,0.3)', borderRadius:10, padding:'12px 16px', color:'#fc8181', marginBottom:16 }}>{error}</div>}

          {/* Info card */}
          {info && (
            <div style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:14, overflow:'hidden', marginBottom:16 }}>
              {info.thumbnail && <img src={info.thumbnail} alt="" style={{ width:'100%', maxHeight:200, objectFit:'cover' }} />}
              <div style={{ padding:16 }}>
                <div style={{ fontWeight:600, marginBottom:4 }}>{info.title}</div>
                <div style={{ color:'#888', fontSize:13 }}>
                  {info.uploader} • {fmtDur(info.duration)}
                  {info.is360 && <span style={{ marginLeft:8, background:'rgba(229,62,62,0.2)', color:'#fc8181', padding:'2px 8px', borderRadius:99, fontSize:11 }}>360°</span>}
                </div>
              </div>
            </div>
          )}

          {/* Download button */}
          {info && status !== 'downloading' && status !== 'done' && (
            <button onClick={startDownload} style={{ ...primaryBtn, width:'100%', padding:'14px', fontSize:16 }}>
              ⬇ Download for VR
            </button>
          )}

          {/* Progress */}
          {status === 'downloading' && (
            <div style={{ marginTop:16 }}>
              <div style={{ display:'flex', justifyContent:'space-between', color:'#888', fontSize:13, marginBottom:6 }}>
                <span>Downloading...</span><span>{Math.round(progress)}%</span>
              </div>
              <div style={{ height:6, background:'rgba(255,255,255,0.1)', borderRadius:3 }}>
                <div style={{ width:`${progress}%`, height:'100%', background:'#e53e3e', borderRadius:3, transition:'width 0.4s' }} />
              </div>
            </div>
          )}

          {/* Watch button */}
          {status === 'done' && videoFile && (
            <button onClick={() => {}} style={{ ...primaryBtn, width:'100%', padding:'14px', fontSize:16, background:'#276749' }}
              onClick={() => setVideoFile(videoFile)}>
              ▶ Watch in VR
            </button>
          )}
        </div>
      )}

      {tab === 'library' && (
        <div style={{ maxWidth:680, margin:'0 auto', padding:'48px 24px' }}>
          <h2 style={{ fontSize:24, fontWeight:700, marginBottom:24 }}>Downloaded Videos</h2>
          {library.length === 0
            ? <p style={{ color:'#666' }}>No videos yet. Download one on the Home tab!</p>
            : library.map(f => (
              <div key={f.name} style={{ display:'flex', alignItems:'center', gap:12, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:12, padding:'14px 16px', marginBottom:10 }}>
                <span style={{ flex:1, fontSize:14 }}>{f.name}</span>
                <span style={{ color:'#888', fontSize:13 }}>{fmt(f.size)}</span>
                <button onClick={() => setVideoFile(`${API}/video/${encodeURIComponent(f.name)}`)} style={primaryBtn}>▶ Play</button>
                <button onClick={async () => { await fetch(`${API}/video/${encodeURIComponent(f.name)}`, {method:'DELETE'}); loadLibrary(); }} style={{ ...primaryBtn, background:'rgba(229,62,62,0.15)', border:'1px solid rgba(229,62,62,0.3)', color:'#fc8181' }}>🗑</button>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

const primaryBtn = {
  background: '#e53e3e', color: '#fff', border: 'none', borderRadius: 10,
  padding: '10px 20px', cursor: 'pointer', fontSize: 14, fontWeight: 600,
};
const navBtn = {
  background: 'transparent', color: '#ccc', border: '1px solid transparent',
  borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 14,
};
