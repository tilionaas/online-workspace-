import { createServer } from 'http';
import { Server } from 'socket.io';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.get('/health', (_, res) => res.json({ ok: true }));

// Serve built client in production
app.use(express.static(path.join(__dirname, '../client/dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// users: Map<socketId, { id, username, status, room, x, y, hasCamera }>
const users = new Map();

function broadcastUserList() {
  io.emit('users:sync', Array.from(users.values()));
}

io.on('connection', (socket) => {
  console.log('[+]', socket.id);

  // ── JOIN ─────────────────────────────────────────────────────────────────
  socket.on('workspace:join', ({ username, status, hasCamera, x, y }) => {
    const user = {
      id: socket.id,
      username: (username || 'Anonymous').slice(0, 24),
      status: (status || '').slice(0, 48),
      hasCamera: Boolean(hasCamera),
      room: null,
      x: x ?? 900,
      y: y ?? 560,
    };
    users.set(socket.id, user);

    // Tell the joiner about themselves + all existing users
    socket.emit('workspace:init', {
      you: user,
      users: Array.from(users.values()).filter((u) => u.id !== socket.id),
    });

    // Tell everyone else
    socket.broadcast.emit('user:joined', user);
    console.log(`  join: ${username}`);
  });

  // ── MOVE ─────────────────────────────────────────────────────────────────
  socket.on('player:move', ({ x, y }) => {
    const user = users.get(socket.id);
    if (!user) return;
    user.x = x;
    user.y = y;
    // Broadcast to all others (no need to send room — position is continuous)
    socket.volatile.broadcast.emit('player:moved', { id: socket.id, x, y });
  });

  // ── STATUS UPDATE ─────────────────────────────────────────────────────────
  socket.on('status:update', ({ status }) => {
    const user = users.get(socket.id);
    if (!user) return;
    user.status = (status || '').slice(0, 48);
    io.emit('status:updated', { id: socket.id, status: user.status });
  });

  // ── ROOM ENTER ────────────────────────────────────────────────────────────
  socket.on('room:enter', ({ roomId }) => {
    const user = users.get(socket.id);
    if (!user) return;

    const prevRoom = user.room;

    // Leave old socket.io room
    if (prevRoom) {
      socket.leave(`room:${prevRoom}`);
      socket.to(`room:${prevRoom}`).emit('user:left-room', {
        id: socket.id,
        room: prevRoom,
      });
    }

    user.room = roomId;

    // Get current users already in the room
    const roomPeerIds = Array.from(users.values())
      .filter((u) => u.id !== socket.id && u.room === roomId)
      .map((u) => u.id);

    // Join socket.io room
    socket.join(`room:${roomId}`);

    // Tell existing room members someone new arrived
    socket.to(`room:${roomId}`).emit('user:entered-room', {
      id: socket.id,
      room: roomId,
    });

    // Tell the joiner who's already there (for WebRTC offer initiation)
    socket.emit('room:peers', { roomId, peerIds: roomPeerIds });

    io.emit('room:changed', { id: socket.id, room: roomId });
    console.log(`  ${user.username} → room:${roomId} (${roomPeerIds.length} peers)`);
  });

  // ── ROOM LEAVE ────────────────────────────────────────────────────────────
  socket.on('room:leave', () => {
    const user = users.get(socket.id);
    if (!user || !user.room) return;

    const prevRoom = user.room;
    user.room = null;
    socket.leave(`room:${prevRoom}`);
    socket.to(`room:${prevRoom}`).emit('user:left-room', {
      id: socket.id,
      room: prevRoom,
    });
    socket.emit('room:peers', { roomId: null, peerIds: [] });
    io.emit('room:changed', { id: socket.id, room: null });
  });

  // ── CHAT: ROOM ────────────────────────────────────────────────────────────
  socket.on('chat:room', ({ message }) => {
    const user = users.get(socket.id);
    if (!user || !user.room || !message?.trim()) return;
    const payload = {
      id: `${socket.id}-${Date.now()}`,
      userId: socket.id,
      username: user.username,
      status: user.status,
      message: message.slice(0, 400),
      room: user.room,
      ts: Date.now(),
    };
    io.to(`room:${user.room}`).emit('chat:room', payload);
  });

  // ── CHAT: GENERAL ─────────────────────────────────────────────────────────
  socket.on('chat:general', ({ message }) => {
    const user = users.get(socket.id);
    if (!user || !message?.trim()) return;
    const payload = {
      id: `${socket.id}-${Date.now()}`,
      userId: socket.id,
      username: user.username,
      status: user.status,
      message: message.slice(0, 400),
      ts: Date.now(),
    };
    io.emit('chat:general', payload);
  });

  // ── WEBRTC SIGNALING ──────────────────────────────────────────────────────
  socket.on('webrtc:offer', ({ targetId, offer }) => {
    io.to(targetId).emit('webrtc:offer', { fromId: socket.id, offer });
  });

  socket.on('webrtc:answer', ({ targetId, answer }) => {
    io.to(targetId).emit('webrtc:answer', { fromId: socket.id, answer });
  });

  socket.on('webrtc:ice', ({ targetId, candidate }) => {
    io.to(targetId).emit('webrtc:ice', { fromId: socket.id, candidate });
  });

  // ── DISCONNECT ────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user?.room) {
      socket.to(`room:${user.room}`).emit('user:left-room', {
        id: socket.id,
        room: user.room,
      });
    }
    users.delete(socket.id);
    io.emit('user:left', { id: socket.id });
    console.log('[-]', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Online Workspace server → http://localhost:${PORT}`);
});
