/**
 * VideoOverlay
 *
 * Renders circular video/avatar elements for every player in the world.
 * Positions are updated via requestAnimationFrame directly on DOM nodes
 * (no React re-render per frame) — only join/leave triggers a React re-render.
 *
 * Screen position formula:
 *   screenX = (worldX - camera.scrollX) * camera.zoom
 *   screenY = (worldY - camera.scrollY) * camera.zoom
 */
import { useEffect, useRef, useCallback } from 'react';
import { gameStore } from '../store/gameStore.js';
import './VideoOverlay.css';

// Deterministic color from a user ID
const COLORS = ['#6366f1','#22c55e','#f59e0b','#ec4899','#14b8a6','#f97316','#8b5cf6','#06b6d4'];
function userColor(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h);
  return COLORS[Math.abs(h) % COLORS.length];
}

function initials(name = '') {
  return name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

// ─── Individual avatar ────────────────────────────────────────────────────────
const PlayerAvatar = ({ id, player, stream, isLocal, inSameRoom, avatarRef }) => {
  const videoRef = useRef(null);

  // Attach MediaStream to <video>
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const color = userColor(id);
  const showVideo = Boolean(stream) && (isLocal || inSameRoom);

  return (
    <div
      className="player-avatar"
      ref={avatarRef}
      data-player-id={id}
      style={{ '--accent': color }}
    >
      <div className="avatar-circle" style={{ borderColor: color }}>
        {showVideo ? (
          <video
            ref={videoRef}
            autoPlay
            muted={isLocal}
            playsInline
            className={`avatar-video${isLocal ? ' mirrored' : ''}`}
          />
        ) : (
          <div className="avatar-default" style={{ background: color + '22' }}>
            <span style={{ color }}>{initials(player?.username)}</span>
          </div>
        )}
        {isLocal && <div className="avatar-you-dot" />}
      </div>
      <div className="avatar-labels">
        <span className="avatar-name">{player?.username}</span>
        {player?.status && (
          <span className="avatar-status">{player.status}</span>
        )}
      </div>
    </div>
  );
};

// ─── Overlay container ────────────────────────────────────────────────────────
export default function VideoOverlay({
  localStream,
  remoteStreams,
  playerIds,
  currentRoom,
}) {
  // avatarDomRefs[id] = div HTMLElement — updated by <PlayerAvatar> ref callback
  const avatarDomRefs = useRef({});

  // rAF loop — reads gameStore and updates DOM positions directly
  useEffect(() => {
    let rafId;
    const tick = () => {
      const cam = gameStore.camera;
      const players = gameStore.players;

      Object.entries(avatarDomRefs.current).forEach(([id, el]) => {
        if (!el) return;
        const p = players[id];
        if (!p) return;

        const sx = (p.x - cam.scrollX) * cam.zoom;
        const sy = (p.y - cam.scrollY) * cam.zoom;
        el.style.transform = `translate(${sx}px, ${sy}px)`;
      });

      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Ref callback factory — stable per ID
  const setAvatarRef = useCallback((id) => (el) => {
    if (el) avatarDomRefs.current[id] = el;
    else     delete avatarDomRefs.current[id];
  }, []);

  const localId = gameStore.localPlayerId;

  return (
    <div className="video-overlay" aria-hidden="true">
      {playerIds.map((id) => {
        const player = gameStore.players[id];
        const isLocal = id === localId;
        const stream  = isLocal
          ? localStream
          : remoteStreams?.[id] ?? null;
        const inSameRoom = Boolean(
          currentRoom && player?.room === currentRoom
        );

        return (
          <PlayerAvatar
            key={id}
            id={id}
            player={player}
            stream={stream}
            isLocal={isLocal}
            inSameRoom={inSameRoom}
            avatarRef={setAvatarRef(id)}
          />
        );
      })}
    </div>
  );
}
