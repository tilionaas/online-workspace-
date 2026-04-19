/**
 * WorkspaceApp
 *
 * Orchestrates everything once the user has joined:
 *  - Creates Phaser game instance
 *  - Manages Socket.io connection
 *  - Manages WebRTC via useWebRTC hook
 *  - Renders VideoOverlay + ChatPanel over the canvas
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import Phaser from 'phaser';
import { io } from 'socket.io-client';

import { WorkspaceScene } from '../game/WorkspaceScene.js';
import { gameStore }       from '../store/gameStore.js';
import { ROOMS }           from '../constants/rooms.js';
import { useWebRTC }       from '../hooks/useWebRTC.js';

import VideoOverlay from './VideoOverlay.jsx';
import ChatPanel    from './ChatPanel.jsx';
import './WorkspaceApp.css';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

export default function WorkspaceApp({ username, status: initStatus, stream, hasCamera, onLeave }) {
  const sceneRef   = useRef(null);

  // socket stored in state so hooks/effects can depend on it
  const [socket, setSocket] = useState(null);

  // Player list for VideoOverlay (just IDs — positions live in gameStore)
  const [playerIds,     setPlayerIds]     = useState([]);
  const [currentRoom,   setCurrentRoom]   = useState(null);
  const [liveStatus,    setLiveStatus]    = useState(initStatus || '');
  const [editingStatus, setEditingStatus] = useState(false);
  const [statusInput,   setStatusInput]   = useState(initStatus || '');
  const [blockedRoom,   setBlockedRoom]   = useState(null);

  // Chat state
  const [roomMessages,     setRoomMessages]    = useState([]);
  const [generalMessages,  setGeneralMessages] = useState([]);

  // ── Phaser setup ─────────────────────────────────────────────────────────
  useEffect(() => {
    const config = {
      type:            Phaser.AUTO,
      backgroundColor: '#0a0a0f',
      parent:          'phaser-container',
      scene:           [WorkspaceScene],
      scale: {
        mode:       Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width:      window.innerWidth,
        height:     window.innerHeight,
      },
    };

    const game = new Phaser.Game(config);

    // Poll until scene is active (Phaser 3 lifecycle)
    const poll = setInterval(() => {
      const scene = game.scene.getScene('WorkspaceScene');
      if (scene?.sys?.isActive()) {
        sceneRef.current = scene;
        clearInterval(poll);
      }
    }, 50);

    return () => {
      clearInterval(poll);
      game.destroy(true);
      sceneRef.current = null;
    };
  }, []); // eslint-disable-line

  // ── Socket.io connection ──────────────────────────────────────────────────
  useEffect(() => {
    const sock = io(SERVER_URL, { transports: ['websocket'] });

    sock.on('connect', () => {
      gameStore.localPlayerId = sock.id;
      gameStore.hasCamera     = hasCamera;

      sock.emit('workspace:join', {
        username,
        status:    initStatus || '',
        hasCamera,
        x: 1000,
        y: 650,
      });

      // Wire gameStore callbacks once we have a socket ID
      gameStore.emitMove = (x, y) => sock.emit('player:move', { x, y });

      gameStore.onRoomChange = (roomId) => {
        setCurrentRoom(roomId);
        if (roomId) sock.emit('room:enter', { roomId });
        else         sock.emit('room:leave');
        const lp = gameStore.players[sock.id];
        if (lp) lp.room = roomId;
      };

      gameStore.onRoomBlocked = (roomId) => {
        setBlockedRoom(roomId);
        setTimeout(() => setBlockedRoom(null), 2400);
        sceneRef.current?.nudgeOutOfRoom();
      };

      setSocket(sock);
    });

    // Server sends full state on init
    sock.on('workspace:init', ({ you, users }) => {
      gameStore.players[you.id] = { ...you };
      setPlayerIds([you.id, ...users.map((u) => u.id)]);
      users.forEach((u) => {
        gameStore.players[u.id] = u;
        sceneRef.current?.addRemotePlayer(u.id, u);
      });
    });

    // New user joined workspace
    sock.on('user:joined', (user) => {
      gameStore.players[user.id] = user;
      sceneRef.current?.addRemotePlayer(user.id, user);
      setPlayerIds((ids) => [...new Set([...ids, user.id])]);
    });

    // User left workspace
    sock.on('user:left', ({ id }) => {
      delete gameStore.players[id];
      sceneRef.current?.removeRemotePlayer(id);
      setPlayerIds((ids) => ids.filter((i) => i !== id));
    });

    // Remote movement
    sock.on('player:moved', ({ id, x, y }) => {
      sceneRef.current?.moveRemotePlayer(id, x, y);
    });

    // Status update from another user
    sock.on('status:updated', ({ id, status }) => {
      sceneRef.current?.updateRemoteStatus(id, status);
      const sp = gameStore.players[id];
      if (sp) sp.status = status;
    });

    // Room broadcast
    sock.on('room:changed', ({ id, room }) => {
      sceneRef.current?.updateRemoteRoom(id, room);
      const sp = gameStore.players[id];
      if (sp) sp.room = room;
    });

    // Chat
    sock.on('chat:room',    (msg) => setRoomMessages((p)    => [...p.slice(-199), msg]));
    sock.on('chat:general', (msg) => setGeneralMessages((p) => [...p.slice(-199), msg]));

    return () => {
      sock.disconnect();
      setSocket(null);
      gameStore.emitMove     = null;
      gameStore.onRoomChange = null;
      gameStore.onRoomBlocked = null;
    };
  }, []); // eslint-disable-line

  // ── WebRTC ────────────────────────────────────────────────────────────────
  const { onStreamAdded, onStreamRemoved } = useWebRTC({
    socket,
    localStream: stream,
    currentRoom,
  });

  // remoteStreams as state so VideoOverlay re-renders when streams join/leave
  const [remoteStreams, setRemoteStreams] = useState({});

  useEffect(() => {
    onStreamAdded((peerId, peerStream) => {
      setRemoteStreams((prev) => ({ ...prev, [peerId]: peerStream }));
    });
    onStreamRemoved((peerId) => {
      setRemoteStreams((prev) => {
        const next = { ...prev };
        delete next[peerId];
        return next;
      });
    });
  }, [onStreamAdded, onStreamRemoved]);

  // ── Status editing ────────────────────────────────────────────────────────
  const submitStatus = useCallback((e) => {
    e?.preventDefault();
    const s = statusInput.trim().slice(0, 48);
    setLiveStatus(s);
    setEditingStatus(false);
    socket?.emit('status:update', { status: s });
    const lp = gameStore.players[gameStore.localPlayerId];
    if (lp) lp.status = s;
  }, [statusInput, socket]);

  // Current room info
  const roomInfo = ROOMS.find((r) => r.id === currentRoom);

  return (
    <div className="workspace-root">
      {/* Phaser canvas container */}
      <div id="phaser-container" className="phaser-container" />

      {/* Video/avatar overlay — positions updated via rAF in VideoOverlay */}
      <VideoOverlay
        localStream={stream}
        remoteStreams={remoteStreams}
        playerIds={playerIds}
        currentRoom={currentRoom}
      />

      {/* HUD: top bar */}
      <header className="hud-bar">
        <button
          className="hud-leave"
          onClick={() => { socket?.disconnect(); onLeave?.(); }}
          title="Leave workspace"
        >
          ← Leave
        </button>
        <div className="hud-logo">Workspace</div>

        <div
          className="room-badge"
          style={roomInfo
            ? { borderColor: `#${roomInfo.borderColor.toString(16).padStart(6,'0')}`, color: roomInfo.labelColor }
            : {}}
        >
          {roomInfo ? roomInfo.label : '🚶 Hallway'}
        </div>

        {/* Live status (editable) */}
        <div className="status-area">
          {editingStatus ? (
            <form onSubmit={submitStatus} className="status-form">
              <input
                autoFocus
                value={statusInput}
                onChange={(e) => setStatusInput(e.target.value)}
                onBlur={submitStatus}
                onKeyDown={(e) => e.key === 'Escape' && setEditingStatus(false)}
                placeholder="What are you working on?"
                maxLength={48}
                className="status-input"
              />
            </form>
          ) : (
            <button
              className="status-display"
              onClick={() => { setStatusInput(liveStatus); setEditingStatus(true); }}
              title="Click to edit status"
            >
              <span className="status-dot" />
              <span>{liveStatus || 'Set a status…'}</span>
              <span className="edit-hint">✏️</span>
            </button>
          )}
        </div>

        <div className="hud-username">{username}</div>
      </header>

      {/* Camera-blocked toast */}
      {blockedRoom && (
        <div className="toast toast-warn">
          📷 Camera required to enter{' '}
          <strong>{ROOMS.find((r) => r.id === blockedRoom)?.name}</strong>
        </div>
      )}

      {/* Focus Room banner */}
      {roomInfo?.muteAudio && (
        <div className="toast toast-focus">
          🔇 Focus Room — microphone is disabled
        </div>
      )}

      {/* Chat panel */}
      <ChatPanel
        socket={socket}
        currentRoom={currentRoom}
        roomMessages={roomMessages}
        generalMessages={generalMessages}
        username={username}
        status={liveStatus}
      />

      {/* Keyboard hint */}
      <div className="key-hint">WASD / Arrow keys to move</div>
    </div>
  );
}
