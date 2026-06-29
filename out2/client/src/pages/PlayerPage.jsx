import { useLocation, useNavigate, Link } from "react-router-dom";
import { useState } from "react";
import VRPlayer from "../components/VRPlayer.jsx";
import { videoUrl } from "../api.js";

export default function PlayerPage() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const [uploadedUrl, setUploadedUrl] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  // Came from download flow
  const filename = state?.filename;
  const projection = state?.projection ?? "360";
  const title = state?.title ?? "";

  const url = uploadedUrl || (filename ? videoUrl(filename) : null);

  const handleFile = (file) => {
    if (!file || !file.type.startsWith("video/")) return;
    const objectUrl = URL.createObjectURL(file);
    setUploadedUrl(objectUrl);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  };

  if (!url) {
    return (
      <div className="min-h-screen pt-24 pb-16 px-4 flex flex-col items-center justify-center">
        <div className="w-full max-w-lg text-center">
          <h2 className="font-display text-4xl tracking-widest mb-2">VR PLAYER</h2>
          <p className="text-sm mb-8" style={{ color: "#4a4a6a" }}>
            No video selected. Download one from the{" "}
            <Link to="/" style={{ color: "#00d4ff" }}>home page</Link> or upload a local file.
          </p>

          {/* Local file upload */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className="rounded-2xl p-12 text-center cursor-pointer transition-all"
            style={{
              border: `2px dashed ${dragOver ? "#00d4ff" : "#1e1e2e"}`,
              background: dragOver ? "rgba(0,212,255,0.05)" : "#0d0d14",
            }}
            onClick={() => document.getElementById("file-input").click()}>
            <div className="text-5xl mb-4">📁</div>
            <p className="font-medium mb-1">Drop a 360° video file here</p>
            <p className="text-sm" style={{ color: "#4a4a6a" }}>or click to browse</p>
            <input
              id="file-input"
              type="file"
              accept="video/*"
              className="hidden"
              onChange={e => handleFile(e.target.files[0])}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ height: "100vh", paddingTop: 64 }}>
      {/* Thin top bar */}
      <div className="flex items-center gap-4 px-5 py-2 flex-shrink-0"
        style={{ background: "#0d0d14", borderBottom: "1px solid #1e1e2e" }}>
        <button onClick={() => navigate(-1)}
          className="text-sm flex items-center gap-2 transition-colors"
          style={{ color: "#4a4a6a", fontFamily: "JetBrains Mono" }}>
          ← Back
        </button>
        {title && (
          <span className="text-sm font-medium truncate flex-1"
            style={{ color: "#e8e8f8" }}>{title}</span>
        )}
        <span className="text-xs font-mono px-2 py-0.5 rounded"
          style={{
            background: projection === "360" ? "rgba(255,60,172,0.12)" : "rgba(255,255,255,0.05)",
            border: `1px solid ${projection === "360" ? "rgba(255,60,172,0.3)" : "rgba(255,255,255,0.1)"}`,
            color: projection === "360" ? "#ff3cac" : "#4a4a6a",
          }}>
          {projection === "360" ? "360° VR" : "Flat"}
        </span>

        {/* Local file upload while in player */}
        <button
          onClick={() => document.getElementById("file-input-player").click()}
          className="text-xs px-3 py-1.5 rounded-lg transition-all"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid #1e1e2e", color: "#4a4a6a" }}>
          📁 Open File
        </button>
        <input id="file-input-player" type="file" accept="video/*" className="hidden"
          onChange={e => handleFile(e.target.files[0])} />
      </div>

      {/* Player fills remaining space */}
      <div className="flex-1 relative">
        <VRPlayer videoUrl={url} projection={uploadedUrl ? "360" : projection} title={title} />
      </div>
    </div>
  );
}
