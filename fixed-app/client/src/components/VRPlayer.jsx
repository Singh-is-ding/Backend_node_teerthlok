import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";

export default function VRPlayer({ videoUrl, projection = "360", title = "" }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const animFrameRef = useRef(null);
  const isDragging = useRef(false);
  const prevMouse = useRef({ x: 0, y: 0 });
  const sphericalRef = useRef({ theta: 0, phi: Math.PI / 2 });
  const gyroRef = useRef(null);
  const lastGyro = useRef({ alpha: 0, beta: 90, gamma: 0 });

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [gyroEnabled, setGyroEnabled] = useState(false);
  const [gyroAvailable, setGyroAvailable] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [gyroError, setGyroError] = useState("");
  const controlsTimer = useRef(null);

  const is360 = projection === "360";

  // Check if gyro is available
  useEffect(() => {
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile && typeof DeviceOrientationEvent !== "undefined") {
      setGyroAvailable(true);
    }
  }, []);

  // ── Init Three.js ────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.xr.enabled = true;
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 0, 0);
    cameraRef.current = camera;

    const video = document.createElement("video");
    video.src = videoUrl;
    video.crossOrigin = "anonymous";
    video.loop = false;
    video.muted = false;
    video.playsInline = true;
    video.preload = "auto";
    videoRef.current = video;

    video.addEventListener("loadedmetadata", () => { setDuration(video.duration); setLoaded(true); });
    video.addEventListener("timeupdate", () => setCurrentTime(video.currentTime));
    video.addEventListener("play", () => setPlaying(true));
    video.addEventListener("pause", () => setPlaying(false));
    video.addEventListener("ended", () => setPlaying(false));

    const texture = new THREE.VideoTexture(video);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.colorSpace = THREE.SRGBColorSpace;

    if (is360) {
      const geometry = new THREE.SphereGeometry(500, 60, 40);
      geometry.scale(-1, 1, 1);
      const material = new THREE.MeshBasicMaterial({ map: texture });
      scene.add(new THREE.Mesh(geometry, material));
    } else {
      const geometry = new THREE.PlaneGeometry((16 / 9) * 4, 4);
      const material = new THREE.MeshBasicMaterial({ map: texture });
      const plane = new THREE.Mesh(geometry, material);
      plane.position.z = -6;
      scene.add(plane);
    }

    const onResize = () => {
      if (!container) return;
      renderer.setSize(container.clientWidth, container.clientHeight);
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    function render() {
      if (is360 && !renderer.xr.isPresenting && !gyroRef.current) {
        // Mouse/touch drag mode: aim camera using spherical angles
        const { theta, phi } = sphericalRef.current;
        camera.lookAt(
          Math.sin(phi) * Math.cos(theta),
          Math.cos(phi),
          Math.sin(phi) * Math.sin(theta)
        );
      }
      // Gyro mode: camera.quaternion is driven directly by the deviceorientation handler
      renderer.render(scene, camera);
    }

    function animate() {
      animFrameRef.current = requestAnimationFrame(animate);
      render();
    }
    animate();

    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(animFrameRef.current);
      renderer.dispose();
      video.pause();
      video.src = "";
      texture.dispose();
    };
  }, [videoUrl, is360]);

  // ── Touch drag ───────────────────────────────────────────────────────────
  const onPointerDown = useCallback((e) => {
    if (!is360 || gyroEnabled) return;
    isDragging.current = true;
    const t = e.touches?.[0] ?? e;
    prevMouse.current = { x: t.clientX, y: t.clientY };
  }, [is360, gyroEnabled]);

  const onPointerMove = useCallback((e) => {
    if (!isDragging.current || !is360 || gyroEnabled) return;
    const t = e.touches?.[0] ?? e;
    const dx = t.clientX - prevMouse.current.x;
    const dy = t.clientY - prevMouse.current.y;
    prevMouse.current = { x: t.clientX, y: t.clientY };
    const speed = 0.004;
    sphericalRef.current.theta -= dx * speed;
    sphericalRef.current.phi = Math.max(0.1, Math.min(Math.PI - 0.1, sphericalRef.current.phi - dy * speed));
  }, [is360, gyroEnabled]);

  const onPointerUp = useCallback(() => { isDragging.current = false; }, []);

  // ── Gyroscope ────────────────────────────────────────────────────────────
  const enableGyro = useCallback(async () => {
    setGyroError("");
    try {
      // iOS 13+ requires permission
      if (typeof DeviceOrientationEvent?.requestPermission === "function") {
        const perm = await DeviceOrientationEvent.requestPermission();
        if (perm !== "granted") {
          setGyroError("Permission denied. Please allow motion access.");
          return;
        }
      }

      // Pre-allocate THREE objects — never allocate inside the event handler
      const _euler   = new THREE.Euler();
      const _qDevice = new THREE.Quaternion();
      const _qScreen = new THREE.Quaternion();
      const _qWorld  = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // -90° X
      const _zee     = new THREE.Vector3(0, 0, 1);
      const _forward = new THREE.Vector3(0, 0, -1);

      const handler = (e) => {
        if (!is360 || e.alpha == null) return;

        // Screen rotation offset in radians (portrait=0°, landscape-left=90°, etc.)
        const screenAngle = THREE.MathUtils.degToRad(
          window.screen?.orientation?.angle ?? window.orientation ?? 0
        );

        // Build quaternion from device Euler angles (YXZ order = yaw, pitch, roll)
        _euler.set(
          THREE.MathUtils.degToRad(e.beta),
          THREE.MathUtils.degToRad(e.alpha),
          -THREE.MathUtils.degToRad(e.gamma),
          'YXZ'
        );
        _qDevice.setFromEuler(_euler);

        // Apply world-frame correction (device Z → world Y)
        _qDevice.multiply(_qWorld);

        // Compensate for screen rotation
        _qScreen.setFromAxisAngle(_zee, -screenAngle);
        _qDevice.multiply(_qScreen);

        // Apply directly to camera quaternion
        if (cameraRef.current) {
          cameraRef.current.quaternion.copy(_qDevice);
        }

        // Keep sphericalRef in sync so drag works after disabling gyro
        _forward.set(0, 0, -1).applyQuaternion(_qDevice);
        sphericalRef.current = {
          theta: Math.atan2(_forward.x, _forward.z),
          phi:   Math.max(0.05, Math.min(Math.PI - 0.05,
                   Math.acos(Math.max(-1, Math.min(1, _forward.y))))),
        };
      };

      // Use deviceorientationabsolute first (more accurate), fallback to deviceorientation
      const eventName = "ondeviceorientationabsolute" in window
        ? "deviceorientationabsolute"
        : "deviceorientation";

      window.addEventListener(eventName, handler, true);
      gyroRef.current = { handler, eventName };
      setGyroEnabled(true);

    } catch (err) {
      setGyroError("Gyro error: " + err.message);
    }
  }, [is360]);

  const disableGyro = useCallback(() => {
    if (gyroRef.current) {
      window.removeEventListener(gyroRef.current.eventName, gyroRef.current.handler, true);
      gyroRef.current = null;
    }
    setGyroEnabled(false);
    setGyroError("");
  }, []);

  // ── Video controls ───────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }, []);

  const seek = useCallback((e) => {
    const v = videoRef.current;
    if (!v || !duration) return;
    v.currentTime = parseFloat(e.target.value);
  }, [duration]);

  const changeVolume = useCallback((e) => {
    const v = videoRef.current;
    if (!v) return;
    const val = parseFloat(e.target.value);
    v.volume = val;
    setVolume(val);
    setMuted(val === 0);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) el.requestFullscreen?.();
    else document.exitFullscreen?.();
  }, []);

  const revealControls = () => {
    setShowControls(true);
    clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => {
      if (playing) setShowControls(false);
    }, 3000);
  };

  const formatTime = (s) => {
    if (!s || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black overflow-hidden select-none"
      onMouseMove={e => { onPointerMove(e); revealControls(); }}
      onMouseDown={onPointerDown}
      onMouseUp={onPointerUp}
      onMouseLeave={onPointerUp}
      onTouchStart={onPointerDown}
      onTouchMove={onPointerMove}
      onTouchEnd={onPointerUp}
      onClick={revealControls}
    >
      <canvas ref={canvasRef} id="vr-canvas" className="w-full h-full" />

      {/* Loading */}
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center"
          style={{ background: "rgba(4,4,10,0.9)" }}>
          <div className="text-center">
            <div className="w-12 h-12 rounded-full border-2 mx-auto mb-4"
              style={{ borderColor: "rgba(0,212,255,0.2)", borderTopColor: "#00d4ff", animation: "spin 0.8s linear infinite" }} />
            <p className="text-sm font-mono" style={{ color: "#00d4ff" }}>Loading video…</p>
          </div>
        </div>
      )}

      {/* Hint when paused */}
      {loaded && is360 && !playing && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center px-6 py-4 rounded-2xl"
            style={{ background: "rgba(4,4,10,0.75)", border: "1px solid rgba(0,212,255,0.2)" }}>
            <p className="text-4xl mb-2">🥽</p>
            <p className="text-sm font-mono" style={{ color: "#00d4ff" }}>
              {gyroEnabled ? "Move your phone to look around" : "Drag to look around · Tap Gyro for phone VR"}
            </p>
          </div>
        </div>
      )}

      {/* Gyro error */}
      {gyroError && (
        <div className="absolute top-20 left-4 right-4 px-4 py-3 rounded-xl text-sm font-mono z-50"
          style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", color: "#f87171" }}>
          ⚠ {gyroError}
        </div>
      )}

      {/* Controls */}
      <div className="absolute inset-0 flex flex-col justify-between transition-opacity duration-300"
        style={{ opacity: showControls ? 1 : 0, pointerEvents: showControls ? "auto" : "none" }}>

        {/* Top bar */}
        <div className="flex items-center justify-between px-4 pt-4 pb-8"
          style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.75), transparent)" }}>
          <div>
            {title && <p className="text-sm font-medium truncate max-w-xs">{title}</p>}
            {is360 && (
              <span className="text-xs font-mono px-2 py-0.5 rounded"
                style={{ background: "rgba(255,60,172,0.15)", border: "1px solid rgba(255,60,172,0.3)", color: "#ff3cac" }}>
                360° VR
              </span>
            )}
          </div>

          {/* Gyro button — always show on mobile */}
          {is360 && (
            <button
              onClick={gyroEnabled ? disableGyro : enableGyro}
              className="px-4 py-2 rounded-xl text-sm font-bold transition-all"
              style={{
                background: gyroEnabled ? "rgba(0,255,150,0.2)" : "rgba(0,212,255,0.15)",
                border: `2px solid ${gyroEnabled ? "rgba(0,255,150,0.6)" : "rgba(0,212,255,0.5)"}`,
                color: gyroEnabled ? "#00ff96" : "#00d4ff",
                boxShadow: gyroEnabled ? "0 0 16px rgba(0,255,150,0.4)" : "0 0 16px rgba(0,212,255,0.3)",
                fontSize: 16,
              }}>
              {gyroEnabled ? "🔴 Gyro ON" : "📱 Tap for Gyro"}
            </button>
          )}
        </div>

        {/* Bottom controls */}
        <div className="px-4 pb-5"
          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.85), transparent)" }}>

          {/* Seek */}
          <div className="mb-3">
            <input type="range" min={0} max={duration || 100} step={0.5}
              value={currentTime} onChange={seek}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #00d4ff ${(currentTime / (duration || 1)) * 100}%, #1e1e2e ${(currentTime / (duration || 1)) * 100}%)`,
              }} />
            <div className="flex justify-between text-xs mt-1 font-mono" style={{ color: "#4a4a6a" }}>
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Play */}
            <button onClick={togglePlay}
              className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)" }}>
              {playing ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                  <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                  <polygon points="5,3 19,12 5,21"/>
                </svg>
              )}
            </button>

            {/* Mute */}
            <button onClick={toggleMute}
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}>
              {muted ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                  <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
                </svg>
              )}
            </button>

            {/* Volume */}
            <input type="range" min={0} max={1} step={0.05}
              value={muted ? 0 : volume} onChange={changeVolume}
              className="w-20 h-1 rounded-full appearance-none cursor-pointer"
              style={{ background: `linear-gradient(to right, #00d4ff ${(muted ? 0 : volume) * 100}%, #1e1e2e ${(muted ? 0 : volume) * 100}%)` }} />

            <div className="flex-1" />

            {/* Fullscreen */}
            <button onClick={toggleFullscreen}
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
