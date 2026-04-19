import { useState, useRef, useEffect } from 'react';
import './JoinScreen.css';

export default function JoinScreen({ onJoin }) {
  const [username, setUsername] = useState('');
  const [status,   setStatus]   = useState('');
  const [camState, setCamState] = useState('idle'); // idle | requesting | granted | denied
  const [stream,   setStream]   = useState(null);
  const videoRef = useRef(null);

  // Mirror local cam preview
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  async function requestCamera() {
    setCamState('requesting');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setStream(s);
      setCamState('granted');
    } catch {
      setCamState('denied');
    }
  }

  function handleJoin(e) {
    e.preventDefault();
    if (!username.trim()) return;
    onJoin({
      username: username.trim(),
      status:   status.trim(),
      stream:   stream,
      hasCamera: camState === 'granted',
    });
  }

  const canJoin = username.trim().length > 0;

  return (
    <div className="join-screen">
      <div className="join-card">
        {/* Header */}
        <div className="join-header">
          <div className="join-logo">BUILD IN PUBLIC</div>
          <h1 className="join-title">Workspace</h1>
          <p className="join-sub">Show up. Build. Ship.</p>
        </div>

        <form onSubmit={handleJoin} className="join-form">
          {/* Username */}
          <div className="field">
            <label>Username</label>
            <input
              type="text"
              placeholder="How should we call you?"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={24}
              autoFocus
            />
          </div>

          {/* Status */}
          <div className="field">
            <label>Live status <span className="optional">(optional)</span></label>
            <input
              type="text"
              placeholder="e.g. Building landing page"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              maxLength={48}
            />
          </div>

          {/* Camera */}
          <div className="field">
            <label>Camera &amp; Mic</label>
            <div className="cam-section">
              {camState === 'idle' && (
                <button type="button" className="btn-cam" onClick={requestCamera}>
                  Enable Camera
                </button>
              )}
              {camState === 'requesting' && (
                <span className="cam-status">Requesting access…</span>
              )}
              {camState === 'granted' && (
                <div className="cam-preview-wrap">
                  <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    className="cam-preview"
                  />
                  <span className="cam-badge cam-ok">Camera ready</span>
                </div>
              )}
              {camState === 'denied' && (
                <div className="cam-denied">
                  <span className="cam-badge cam-err">Camera blocked</span>
                  <p>You can still join but cannot enter camera-required rooms.</p>
                </div>
              )}
            </div>
          </div>

          {/* Submit */}
          <button type="submit" className="btn-join" disabled={!canJoin}>
            Enter Workspace →
          </button>
        </form>

        {/* Room preview */}
        <div className="rooms-preview">
          <p className="rooms-label">Rooms</p>
          <div className="rooms-chips">
            {['🎬 Content Creation', '⌨️ Build / Coding', '🎧 Focus Room', '📈 Trading', '💬 No Cam Room'].map((r) => (
              <span key={r} className="chip">{r}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
