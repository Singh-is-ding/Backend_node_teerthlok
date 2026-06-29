import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listFiles, deleteFile, formatBytes } from "../api.js";

export default function LibraryPage() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try { setFiles(await listFiles()); } catch { setFiles([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (name) => {
    if (!confirm(`Delete "${name}"?`)) return;
    setDeleting(name);
    try {
      await deleteFile(name);
      setFiles(f => f.filter(x => x.name !== name));
    } catch (e) { alert("Delete failed: " + e.message); }
    finally { setDeleting(null); }
  };

  const handleWatch = (file) => {
    navigate("/player", {
      state: {
        filename: file.name,
        projection: file.name.toLowerCase().includes("360") || file.name.toLowerCase().includes("vr") ? "360" : "flat",
        title: file.name.replace(/\.[^.]+$/, "").replace(/_/g, " "),
      },
    });
  };

  return (
    <div className="min-h-screen pt-24 pb-16 px-4 max-w-3xl mx-auto">
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="font-display text-6xl tracking-widest text-white">LIBRARY</h1>
          <p className="text-sm mt-1" style={{ color: "#4a4a6a", fontFamily: "JetBrains Mono" }}>
            {files.length} video{files.length !== 1 ? "s" : ""} downloaded
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
          style={{ background: "#0d0d14", border: "1px solid #1e1e2e", color: loading ? "#4a4a6a" : "#e8e8f8" }}>
          {loading ? "Loading…" : "↻ Refresh"}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 rounded-full border-2"
            style={{ borderColor: "rgba(0,212,255,0.2)", borderTopColor: "#00d4ff", animation: "spin 0.8s linear infinite" }} />
        </div>
      ) : files.length === 0 ? (
        <div className="text-center py-20 rounded-2xl"
          style={{ border: "2px dashed #1e1e2e", color: "#4a4a6a" }}>
          <p className="text-4xl mb-3">📭</p>
          <p className="font-medium mb-1">No videos yet</p>
          <p className="text-sm">Download something from the home page first.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {files.map((file) => {
            const is360 = file.name.toLowerCase().includes("360") || file.name.toLowerCase().includes("vr");
            const cleanName = file.name.replace(/\.[^.]+$/, "").replace(/_/g, " ");
            return (
              <div key={file.name}
                className="flex items-center gap-4 rounded-2xl px-5 py-4 transition-all"
                style={{ background: "#0d0d14", border: "1px solid #1e1e2e" }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: is360 ? "rgba(255,60,172,0.1)" : "rgba(0,212,255,0.1)", border: `1px solid ${is360 ? "rgba(255,60,172,0.3)" : "rgba(0,212,255,0.2)"}` }}>
                  {is360 ? "🌐" : "🎬"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate" title={cleanName}>{cleanName}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs font-mono" style={{ color: "#4a4a6a" }}>
                      {formatBytes(file.size)}
                    </span>
                    <span className="text-xs font-mono" style={{ color: "#4a4a6a" }}>
                      {new Date(file.createdAt).toLocaleDateString()}
                    </span>
                    {is360 && (
                      <span className="text-xs font-mono px-1.5 py-0.5 rounded"
                        style={{ background: "rgba(255,60,172,0.1)", border: "1px solid rgba(255,60,172,0.3)", color: "#ff3cac" }}>
                        360°
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => handleWatch(file)}
                    className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                    style={{ background: "linear-gradient(135deg, #ff3cac, #cc0088)", color: "#fff", boxShadow: "0 0 16px rgba(255,60,172,0.3)" }}>
                    ▶ Watch
                  </button>
                  <button onClick={() => handleDelete(file.name)}
                    disabled={deleting === file.name}
                    className="w-9 h-9 rounded-xl flex items-center justify-center transition-all"
                    style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: deleting === file.name ? "#4a4a6a" : "#ef4444" }}>
                    {deleting === file.name ? "…" : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
