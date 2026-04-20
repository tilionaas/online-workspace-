import { createServer } from 'http';
import { Server }       from 'socket.io';
import express          from 'express';
import cors             from 'cors';
import bcrypt           from 'bcryptjs';
import { fileURLToPath } from 'url';
import path             from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());

// ── HEALTH ───────────────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ ok: true }));

// ── DATABASE SETUP ───────────────────────────────────────────────────────────
// PostgreSQL when DATABASE_URL is set (Render production),
// otherwise fall back to a simple in-memory Map (local dev / no DB).

let dbPool = null;
const memAccounts = new Map(); // { username -> password_hash }

if (process.env.DATABASE_URL) {
  const { default: pg } = await import('pg');
  const { Pool } = pg;
  dbPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS accounts (
      id            SERIAL PRIMARY KEY,
      username      VARCHAR(24) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[db] PostgreSQL connected');
} else {
  console.log('[db] No DATABASE_URL — using in-memory store (accounts lost on restart)');
}

async function dbGetHash(username) {
  if (dbPool) {
    const { rows } = await dbPool.query(
      'SELECT password_hash FROM accounts WHERE username = $1', [username]
    );
    return rows[0]?.password_hash ?? null;
  }
  return memAccounts.get(username) ?? null;
}

async function dbCreateAccount(username, hash) {
  if (dbPool) {
    await dbPool.query(
      'INSERT INTO accounts (username, password_hash) VALUES ($1, $2)', [username, hash]
    );
  } else {
    memAccounts.set(username, hash);
  }
}

async function dbUsernameExists(username) {
  if (dbPool) {
    const { rows } = await dbPool.query(
      'SELECT 1 FROM accounts WHERE username = $1', [username]
    );
    return rows.length > 0;
  }
  return memAccounts.has(username);
}

// ── AUTH ROUTES ───────────────────────────────────────────────────────────────
app.post('/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body ?? {};
    if (!username?.trim() || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    const u = username.trim().slice(0, 24);
    if (u.length < 2) return res.status(400).json({ error: 'Username too short' });
    if (password.length < 4) return res.status(400).json({ error: 'Password too short (min 4)' });

    if (await dbUsernameExists(u)) {
      return res.status(409).json({ error: 'Username already taken' });
    }
    const hash = await bcrypt.hash(password, 10);
    await dbCreateAccount(u, hash);
    res.json({ ok: true, username: u });
  } catch (err) {
    console.error('/auth/register', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body ?? {};
    if (!username?.trim() || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    const u = username.trim();
    const hash = await dbGetHash(u);
    if (!hash) return res.status(401).json({ error: 'Invalid username or password' });
    const ok = await bcrypt.compare(password, hash);
    if (!ok)  return res.status(401).json({ error: 'Invalid username or password' });
    res.json({ ok: true, username: u });
  } catch (err) {
    console.error('/auth/login', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── STATIC CLIENT ─────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../client/dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

// ── SOCKET.IO ─────────────────────────────────────────────────────────────────
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// users: Map<socketId, { id, username, status, room, x, y, hasCamera }>
const users = new Map();

io.on('connection', (socket) => {
  console.log('[+]', socket.id);

  // ── JOIN ───────────────────────────────────────────────────────────────────
  socket.on('workspace:join', ({ username, status, hasCamera, x, y }) => {
    const user = {
      id:        socket.id,
      username:  (username || 'Anonymous').slice(0, 24),
      status:    (status  || '').slice(0, 48),
      hasCamera: Boolean(hasCamera),
      room:      null,
      x:         x ?? 900,
      y:         y ?? 560,
    };
    users.set(socket.id, user);

    socket.emit('workspace:init', {
      you:   user,
      users: Array.from(users.values()).filter((u) => u.id !== socket.id),
    });
    socket.broadcast.emit('user:joined', user);
    console.log(`  join: ${username}`);
  });

  // ── MOVE ───────────────────────────────────────────────────────────────────
  socket.on('player:move', ({ x, y }) => {
    const user = users.get(socket.id);
    if (!user) return;
    user.x = x;
    user.y = y;
    socket.volatile.broadcast.emit('player:moved', { id: socket.id, x, y });
  });

  // ── STATUS UPDATE ──────────────────────────────────────────────────────────
  socket.on('status:update', ({ status }) => {
    const user = users.get(socket.id);
    if (!user) return;
    user.status = (status || '').slice(0, 48);
    io.emit('status:updated', { id: socket.id, status: user.status });
  });

  // ── ROOM ENTER ─────────────────────────────────────────────────────────────
  socket.on('room:enter', ({ roomId }) => {
    const user = users.get(socket.id);
    if (!user) return;

    const prevRoom = user.room;
    if (prevRoom) {
      socket.leave(`room:${prevRoom}`);
      socket.to(`room:${prevRoom}`).emit('user:left-room', { id: socket.id, room: prevRoom });
    }

    user.room = roomId;

    const roomPeerIds = Array.from(users.values())
      .filter((u) => u.id !== socket.id && u.room === roomId)
      .map((u) => u.id);

    socket.join(`room:${roomId}`);
    socket.to(`room:${roomId}`).emit('user:entered-room', { id: socket.id, room: roomId });
    socket.emit('room:peers', { roomId, peerIds: roomPeerIds });

    io.emit('room:changed', { id: socket.id, room: roomId });
    console.log(`  ${user.username} → room:${roomId} (${roomPeerIds.length} peers)`);
  });

  // ── ROOM LEAVE ─────────────────────────────────────────────────────────────
  socket.on('room:leave', () => {
    const user = users.get(socket.id);
    if (!user || !user.room) return;

    const prevRoom = user.room;
    user.room = null;
    socket.leave(`room:${prevRoom}`);
    socket.to(`room:${prevRoom}`).emit('user:left-room', { id: socket.id, room: prevRoom });
    socket.emit('room:peers', { roomId: null, peerIds: [] });
    io.emit('room:changed', { id: socket.id, room: null });
  });

  // ── CHAT: ROOM ─────────────────────────────────────────────────────────────
  socket.on('chat:room', ({ message }) => {
    const user = users.get(socket.id);
    if (!user || !user.room || !message?.trim()) return;
    const payload = {
      id:       `${socket.id}-${Date.now()}`,
      userId:   socket.id,
      username: user.username,
      status:   user.status,
      message:  message.slice(0, 400),
      room:     user.room,
      ts:       Date.now(),
    };
    io.to(`room:${user.room}`).emit('chat:room', payload);
  });

  // ── CHAT: GENERAL ──────────────────────────────────────────────────────────
  socket.on('chat:general', ({ message }) => {
    const user = users.get(socket.id);
    if (!user || !message?.trim()) return;
    const payload = {
      id:       `${socket.id}-${Date.now()}`,
      userId:   socket.id,
      username: user.username,
      status:   user.status,
      message:  message.slice(0, 400),
      ts:       Date.now(),
    };
    io.emit('chat:general', payload);
  });

  // ── WEBRTC SIGNALING ───────────────────────────────────────────────────────
  socket.on('webrtc:offer',  ({ targetId, offer })     => io.to(targetId).emit('webrtc:offer',  { fromId: socket.id, offer }));
  socket.on('webrtc:answer', ({ targetId, answer })    => io.to(targetId).emit('webrtc:answer', { fromId: socket.id, answer }));
  socket.on('webrtc:ice',    ({ targetId, candidate }) => io.to(targetId).emit('webrtc:ice',    { fromId: socket.id, candidate }));

  // ── DISCONNECT ─────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user?.room) {
      socket.to(`room:${user.room}`).emit('user:left-room', { id: socket.id, room: user.room });
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
