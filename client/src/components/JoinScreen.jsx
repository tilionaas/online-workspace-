import { useState, useRef, useEffect } from 'react';
import './JoinScreen.css';

const API = import.meta.env.VITE_SERVER_URL || '';

async function apiAuth(path, body) {
  const res = await fetch(`${API}${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  return res.json();
}

export default function JoinScreen({ onJoin }) {
  // Auth state
  const [tab,      setTab]      = useState('login');   // 'login' | 'register'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Workspace setup state (shown after auth)
  const [authedUser, setAuthedUser] = useState(null);
  const [status,     setStatus]     = useState('');
  const [camState,   setCamState]   = useState('idle');
  const [stream,     setStream]     = useState(null);
  const videoRef = useRef(null);

  // Check localStorage for saved session
  useEffect(() => {
    const saved = localStorage.getItem('ws_user');
    if (saved) {
      try { setAuthedUser(JSON.parse(saved)); } catch {}
    }
  }, []);

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);

  // ── AUTH SUBMIT ────────────────────────────────────────────────────────────
  async function handleAuth(e) {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setAuthError('');
    setAuthLoading(true);
    const endpoint = tab === 'login' ? '/auth/login' : '/auth/register';
    const data = await apiAuth(endpoint, { username: username.trim(), password });
    setAuthLoading(false);
    if (data.error) {
      setAuthError(data.error);
      return;
    }
    const user = { username: data.username };
    localStorage.setItem('ws_user', JSON.stringify(user));
    setAuthedUser(user);
  }

  function handleLogout() {
    localStorage.removeItem('ws_user');
    setAuthedUser(null);
    setUsername('');
    setPassword('');
    setStream(null);
    setCamState('idle');
  }

  // ── CAMERA ────────────────────────────────────────────────────────────────
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

  // ── JOIN WORKSPACE ────────────────────────────────────────────────────────
  function handleJoin(e) {
    e.preventDefault();
    onJoin({
      username:  authedUser.username,
      status:    status.trim(),
      stream,
      hasCamera: camState === 'granted',
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="join-screen">
      <div className="join-card">
        <div className="join-header">
          <div className="join-logo">BUILD IN PUBLIC</div>
          <h1 className="join-title">Workspace</h1>
          <p className="join-sub">Show up. Build. Ship.</p>
        </div>

        {/* ── AUTH GATE ── */}
        {!authedUser ? (
          <>
            <div className="auth-tabs">
              <button
                className={`auth-tab ${tab === 'login' ? 'active' : ''}`}
                onClick={() => { setTab('login'); setAuthError(''); }}
              >
                Sign in
              </button>
              <button
                className={`auth-tab ${tab === 'register' ? 'active' : ''}`}
                onClick={() => { setTab('register'); setAuthError(''); }}
              >
                Create account
              </button>
            </div>

            <form onSubmit={handleAuth} className="join-form">
              <div className="field">
                <label>Username</label>
                <input
                  type="text"
                  placeholder="Your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  maxLength={24}
                  autoFocus
                  autoComplete="username"
                />
              </div>
              <div className="field">
                <label>Password</label>
                <input
                  type="password"
                  placeholder={tab === 'register' ? 'At least 4 characters' : 'Your password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                />
              </div>

              {authError && <p className="auth-error">{authError}</p>}

              <button
                type="submit"
                className="btn-join"
                disabled={!username.trim() || !password || authLoading}
              >
                {authLoading ? 'Loading…' : tab === 'login' ? 'Sign in →' : 'Create account →'}
              </button>
            </form>
          </>
        ) : (
          /* ── WORKSPACE SETUP (post-auth) ── */
          <form onSubmit={handleJoin} className="join-form">
            <div className="welcome-user">
              <span className="welcome-dot" />
              <span>Signed in as <strong>{authedUser.username}</strong></span>
              <button type="button" className="btn-logout" onClick={handleLogout}>
                Log out
              </button>
            </div>

            <div className="field">
              <label>Live status <span className="optional">(optional)</span></label>
              <input
                type="text"
                placeholder="e.g. Building landing page"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                maxLength={48}
                autoFocus
              />
            </div>

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
                    <video ref={videoRef} autoPlay muted playsInline className="cam-preview" />
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

            <button type="submit" className="btn-join">
              Enter Workspace →
            </button>
          </form>
        )}

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
