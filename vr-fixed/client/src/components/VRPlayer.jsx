import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';

export default function VRPlayer({ src }) {
  const mountRef    = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef   = useRef(null);
  const videoRef    = useRef(null);
  const animRef     = useRef(null);
  const textureRef  = useRef(null);

  // ── View angles (degrees) – written by BOTH mouse/touch AND gyro ──────────
  const lonRef = useRef(0);   // horizontal  -180 … 180
  const latRef = useRef(0);   // vertical     -85 …  85

  // ── Drag state ────────────────────────────────────────────────────────────
  const drag = useRef({ active: false, x: 0, y: 0 });

  // ── Gyro state ────────────────────────────────────────────────────────────
  const gyroOn      = useRef(false);
  const gyroHandler = useRef(null);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [playing,      setPlaying]      = useState(false);
  const [gyroEnabled,  setGyroEnabled]  = useState(false);
  const [gyroAvail,    setGyroAvail]    = useState(false);
  const [progress,     setProgress]     = useState(0);
  const [duration,     setDuration]     = useState(0);
  const [ctrlVisible,  setCtrlVisible]  = useState(true);
  const ctrlTimer = useRef(null);

  const showCtrls = () => {
    setCtrlVisible(true);
    clearTimeout(ctrlTimer.current);
    ctrlTimer.current = setTimeout(() => setCtrlVisible(false), 3500);
  };

  // ── Boot Three.js ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!src || !mountRef.current) return;
    const el = mountRef.current;
    const W  = el.clientWidth  || window.innerWidth;
    const H  = el.clientHeight || window.innerHeight;

    // Scene + camera
    const scene    = new THREE.Scene();
    const camera   = new THREE.PerspectiveCamera(75, W / H, 0.1, 1000);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Video + texture
    const video = document.createElement('video');
    video.src         = src;
    video.crossOrigin = 'anonymous';
    video.loop        = true;
    video.playsInline = true;
    video.muted       = false;
    videoRef.current  = video;
    video.addEventListener('timeupdate',    () => video.duration && setProgress(video.currentTime / video.duration));
    video.addEventListener('loadedmetadata', () => setDuration(video.duration));

    const tex = new THREE.VideoTexture(video);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    textureRef.current = tex;

    // Sphere (inverted so we see inside)
    const geo = new THREE.SphereGeometry(500, 64, 32);
    geo.scale(-1, 1, 1);
    scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex })));

    // Render loop
    const tick = () => {
      animRef.current = requestAnimationFrame(tick);
      tex.needsUpdate = true;

      const lat = Math.max(-85, Math.min(85, latRef.current));
      const phi   = THREE.MathUtils.degToRad(90 - lat);
      const theta = THREE.MathUtils.degToRad(lonRef.current);
      camera.lookAt(
        500 * Math.sin(phi) * Math.cos(theta),
        500 * Math.cos(phi),
        500 * Math.sin(phi) * Math.sin(theta)
      );
      renderer.render(scene, camera);
    };
    tick();

    // Resize
    const onResize = () => {
      const w = el.clientWidth || window.innerWidth;
      const h = el.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    // Gyro availability
    setGyroAvail(!!window.DeviceOrientationEvent);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', onResize);
      video.pause(); video.src = '';
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, [src]);

  // ── Mouse / Touch drag ────────────────────────────────────────────────────
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const startDrag = (x, y) => { drag.current = { active: true, x, y }; };
    const moveDrag  = (x, y) => {
      if (!drag.current.active || gyroOn.current) return;
      lonRef.current -= (x - drag.current.x) * 0.25;
      latRef.current += (y - drag.current.y) * 0.25;
      drag.current.x = x;
      drag.current.y = y;
    };
    const endDrag = () => { drag.current.active = false; };

    const onMD = (e) => startDrag(e.clientX, e.clientY);
    const onMM = (e) => moveDrag(e.clientX, e.clientY);
    const onTS = (e) => startDrag(e.touches[0].clientX, e.touches[0].clientY);
    const onTM = (e) => moveDrag(e.touches[0].clientX, e.touches[0].clientY);

    el.addEventListener('mousedown',  onMD);
    window.addEventListener('mousemove', onMM);
    window.addEventListener('mouseup',   endDrag);
    el.addEventListener('touchstart', onTS, { passive: true });
    window.addEventListener('touchmove',  onTM, { passive: true });
    window.addEventListener('touchend',   endDrag);

    return () => {
      el.removeEventListener('mousedown', onMD);
      window.removeEventListener('mousemove', onMM);
      window.removeEventListener('mouseup', endDrag);
      el.removeEventListener('touchstart', onTS);
      window.removeEventListener('touchmove', onTM);
      window.removeEventListener('touchend', endDrag);
    };
  }, []);

  // ── Gyroscope ─────────────────────────────────────────────────────────────
  //
  //  The three device-orientation angles:
  //    alpha  0–360   compass bearing  (rotation around Z, world up)
  //    beta  -180–180 front/back tilt  (rotation around X, phone pitched)
  //    gamma  -90–90  left/right tilt  (rotation around Y, phone rolled)
  //
  //  Mapping to a 360° viewer:
  //    • Holding phone portrait, facing forward   → beta ≈ 90, gamma ≈ 0
  //    • Rotating left/right                      → alpha changes
  //    • Tilting up/down                          → beta changes
  //
  //  We build the camera orientation using THREE.Euler with order 'YXZ'
  //  so yaw (left/right) is applied first, then pitch (up/down).
  //  This is exactly what the THREE DeviceOrientationControls do internally.
  // ─────────────────────────────────────────────────────────────────────────

  const enableGyro = useCallback(async () => {
    // iOS 13+ needs explicit permission from a user gesture
    if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
      try {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res !== 'granted') { alert('Gyroscope permission denied.'); return; }
      } catch (err) { alert('Permission error: ' + err.message); return; }
    }

    // Build a reusable Euler + Quaternion so we don't allocate each frame
    const zee      = new THREE.Vector3(0, 0, 1);
    const euler    = new THREE.Euler();
    const q0       = new THREE.Quaternion();
    const q1       = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // -90° around X
    const camera   = cameraRef.current;

    const handler = (e) => {
      if (e.alpha == null) return;   // sensor not available

      // screen orientation angle in radians (portrait=0, landscape=90°)
      const orient = (window.screen?.orientation?.angle ?? window.orientation ?? 0);

      // Convert to radians
      euler.set(
        THREE.MathUtils.degToRad(e.beta),
        THREE.MathUtils.degToRad(e.alpha),
        -THREE.MathUtils.degToRad(e.gamma),
        'YXZ'
      );

      // Apply the device→camera transform (same as THREE.DeviceOrientationControls)
      camera.quaternion.setFromEuler(euler);
      camera.quaternion.multiply(q1);
      camera.quaternion.multiply(q0.setFromAxisAngle(zee, -THREE.MathUtils.degToRad(orient)));

      // Keep lon/lat in rough sync so drag still works after disabling gyro
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      lonRef.current = THREE.MathUtils.radToDeg(Math.atan2(-dir.z, dir.x)) - 90;
      latRef.current = THREE.MathUtils.radToDeg(Math.asin(dir.y));
    };

    window.addEventListener('deviceorientation', handler, true);
    gyroHandler.current = handler;
    gyroOn.current      = true;
    setGyroEnabled(true);
  }, []);

  const disableGyro = useCallback(() => {
    if (gyroHandler.current) {
      window.removeEventListener('deviceorientation', gyroHandler.current, true);
      gyroHandler.current = null;
    }
    gyroOn.current = false;
    setGyroEnabled(false);
  }, []);

  // Cleanup gyro on unmount
  useEffect(() => () => disableGyro(), [disableGyro]);

  // ── Playback helpers ──────────────────────────────────────────────────────
  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); }
    else          { v.pause(); setPlaying(false); }
    showCtrls();
  };

  const seek = (e) => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    v.currentTime = ((e.clientX - r.left) / r.width) * v.duration;
  };

  const fmt = (s = 0) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100%', background: '#000',
               overflow: 'hidden', cursor: gyroEnabled ? 'default' : 'grab', userSelect: 'none' }}
      onClick={showCtrls}
    >
      {/* Canvas container */}
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />

      {/* Play overlay */}
      {!playing && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                      justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ background: 'rgba(0,0,0,0.55)', borderRadius: 16,
                        padding: '20px 32px', color: '#fff', textAlign: 'center', fontFamily: 'sans-serif' }}>
            <div style={{ fontSize: 52 }}>▶</div>
            <div style={{ fontSize: 13, opacity: 0.7, marginTop: 6 }}>
              {gyroEnabled ? '🥽 Move your phone to look around' : 'Drag to look around in 360°'}
            </div>
            {gyroAvail && !gyroEnabled &&
              <div style={{ fontSize: 12, opacity: 0.5, marginTop: 3 }}>Tap 📱 Gyro for head-tracking</div>}
          </div>
        </div>
      )}

      {/* Controls bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: 'linear-gradient(transparent, rgba(0,0,0,0.9))',
        padding: '48px 16px 18px',
        opacity: ctrlVisible ? 1 : 0,
        transition: 'opacity 0.3s',
        pointerEvents: ctrlVisible ? 'auto' : 'none',
        fontFamily: 'sans-serif',
      }}>
        {/* Seek bar */}
        <div onClick={seek} style={{ width: '100%', height: 5, background: 'rgba(255,255,255,0.2)',
               borderRadius: 3, marginBottom: 14, cursor: 'pointer' }}>
          <div style={{ width: `${progress * 100}%`, height: '100%',
                        background: '#e53e3e', borderRadius: 3, transition: 'width 0.3s' }} />
        </div>

        {/* Button row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Btn onClick={togglePlay}>{playing ? '⏸' : '▶'}</Btn>

          <span style={{ color: '#bbb', fontSize: 13 }}>
            {fmt(progress * duration)} / {fmt(duration)}
          </span>

          <div style={{ flex: 1 }} />

          {/* Gyro button – always visible on touch devices, shown if gyroAvail */}
          {gyroAvail && (
            <Btn
              onClick={() => gyroEnabled ? disableGyro() : enableGyro()}
              active={gyroEnabled}
            >
              📱 {gyroEnabled ? 'Gyro ON' : 'Gyro OFF'}
            </Btn>
          )}

          <Btn onClick={() => {
            const el = mountRef.current;
            if (el?.requestFullscreen)            el.requestFullscreen();
            else if (el?.webkitRequestFullscreen) el.webkitRequestFullscreen();
          }}>⛶</Btn>
        </div>
      </div>
    </div>
  );
}

function Btn({ onClick, children, active }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? 'rgba(229,62,62,0.3)' : 'rgba(255,255,255,0.12)',
        border: `1px solid ${active ? 'rgba(229,62,62,0.6)' : 'rgba(255,255,255,0.2)'}`,
        color: active ? '#fc8181' : '#fff',
        borderRadius: 8, padding: '7px 14px',
        cursor: 'pointer', fontSize: 13, fontFamily: 'sans-serif',
        backdropFilter: 'blur(6px)',
      }}
    >
      {children}
    </button>
  );
}
