import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { fetchInfo, fetchStream, formatDuration } from "../api.js";

export default function HomePage() {
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [loadingStream, setLoadingStream] = useState(false);
  const [error, setError] = useState("");
  const previewTimer = useRef(null);
  const navigate = useNavigate();

  // Auto-preview
  useEffect(() => {
    setPreview(null);
    setError("");
    if (!url.trim().startsWith("http")) return;
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const info = await fetchInfo(url.trim());
        setPreview(info);
      } catch (e) {
        // silent fail on preview
      } finally {
        setPreviewLoading(false);
      }
    }, 900);
    return () => clearTimeout(previewTimer.current);
  }, [url]);

  const handleWatch = async () => {
    if (!url.trim()) return;
    setError("");
    setLoadingStream(true);
    try {
      const stream = await fetchStream(url.trim());
      navigate("/player", {
        state: {
          streamUrl: stream.streamUrl,
          projection: stream.projection,
          title: stream.title,
        },
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingStream(false);
    }
  };

  return (
    <div className="min-h-screen pt-20 pb-16 px-4 flex flex-col items-center">
      {/* Hero */}
      <div className="text-center mt-16 mb-12">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono mb-6 fade-up fade-up-1"
          style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.2)", color: "#00d4ff" }}>
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-slow inline-block"></span>
          360° · VR · WebXR Ready
        </div>
        <h1 className="font-display text-7xl md:text-9xl tracking-widest text-white mb-4 fade-up fade-up-2"
          style={{ lineHeight: 0.9 }}>
          VR<span className="text-glow" style={{ color: "#00d4ff" }}>VAULT</span>
        </h1>
        <p className="text-muted text-lg max-w-md mx-auto fade-up fade-up-3" style={{ fontFamily: "'DM Sans'" }}>
          Paste any video URL. We fetch a direct stream. You watch it in immersive 360° VR — right in your browser.
        </p>
      </div>

      {/* URL Input Card */}
      <div className="w-full max-w-2xl fade-up fade-up-4">
        <div className="rounded-2xl p-6"
          style={{ background: "#0d0d14", border: "1px solid #1e1e2e" }}>

          <label className="block text-xs font-mono uppercase tracking-widest mb-3"
            style={{ color: "#00d4ff" }}>
            Video URL
          </label>

          <div className="flex gap-3">
            <div className="flex-1 flex items-center gap-3 rounded-xl px-4"
              style={{ background: "#13131e", border: "1px solid #1e1e2e" }}>
              {previewLoading ? (
                <Spinner size={16} />
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4a4a6a" strokeWidth="2">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                </svg>
              )}
              <input
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleWatch()}
                placeholder="https://youtube.com/watch?v=..."
                className="flex-1 bg-transparent py-3.5 text-sm outline-none"
                style={{ fontFamily: "'JetBrains Mono'", color: "#e8e8f8" }}
              />
            </div>
            <button
              onClick={handleWatch}
              disabled={!url.trim() || loadingStream}
              className="px-6 rounded-xl font-semibold text-sm transition-all duration-200 whitespace-nowrap"
              style={{
                background: url.trim() && !loadingStream
                  ? "linear-gradient(135deg, #00d4ff, #0099cc)"
                  : "#1e1e2e",
                color: url.trim() && !loadingStream ? "#000" : "#4a4a6a",
                boxShadow: url.trim() && !loadingStream ? "0 0 20px rgba(0,212,255,0.3)" : "none",
              }}>
              {loadingStream ? "Loading…" : "▶ Watch in VR"}
            </button>
          </div>

          {/* Preview */}
          {preview && (
            <div className="mt-4 flex gap-4 rounded-xl p-4"
              style={{ background: "#13131e", border: "1px solid #1e1e2e", animation: "fadeUp 0.3s ease" }}>
              {preview.thumbnail && (
                <img src={preview.thumbnail} alt="" className="w-28 h-16 object-cover rounded-lg flex-shrink-0"
                  style={{ border: "1px solid #1e1e2e" }} />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate mb-1">{preview.title}</p>
                <div className="flex items-center gap-3 flex-wrap">
                  {preview.uploader && (
                    <span className="text-xs" style={{ color: "#4a4a6a", fontFamily: "JetBrains Mono" }}>
                      {preview.uploader}
                    </span>
                  )}
                  {preview.duration && (
                    <span className="text-xs" style={{ color: "#4a4a6a", fontFamily: "JetBrains Mono" }}>
                      {formatDuration(preview.duration)}
                    </span>
                  )}
                  {preview.projection === "360" && <Badge360 />}
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-3 px-4 py-3 rounded-xl text-sm font-mono"
              style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}>
              ⚠ {error}
            </div>
          )}
        </div>

        {/* How it works */}
        <div className="mt-12 grid grid-cols-3 gap-4">
          {[
            { icon: "🔗", title: "Paste URL", desc: "Any YouTube, Vimeo, or supported site" },
            { icon: "📡", title: "Fetch Stream", desc: "Backend resolves a direct playable stream" },
            { icon: "🥽", title: "Watch in VR", desc: "Immersive 360° player with WebXR support" },
          ].map((item, i) => (
            <div key={i} className="rounded-xl p-4 text-center"
              style={{ background: "#0d0d14", border: "1px solid #1e1e2e" }}>
              <div className="text-2xl mb-2">{item.icon}</div>
              <div className="font-semibold text-sm mb-1">{item.title}</div>
              <div className="text-xs" style={{ color: "#4a4a6a" }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Badge360() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono"
      style={{ background: "rgba(255,60,172,0.12)", border: "1px solid rgba(255,60,172,0.35)", color: "#ff3cac" }}>
      ● 360°
    </span>
  );
}

function Spinner({ size = 16, color = "#00d4ff" }) {
  return (
    <div style={{
      width: size, height: size, flexShrink: 0,
      border: `2px solid rgba(0,212,255,0.2)`,
      borderTop: `2px solid ${color}`,
      borderRadius: "50%",
      animation: "spin 0.7s linear infinite",
    }} />
  );
}
