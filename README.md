# Online Workspace — Build in Public

A browser-based 2D virtual workspace for entrepreneurs: live webcam avatars, room-based video/audio, real-time presence, and multiplayer chat.

---

## Folder structure

```
online-workspace/
├── client/          React + Phaser 3 frontend (Vite)
│   └── src/
│       ├── components/   JoinScreen, WorkspaceApp, ChatPanel, VideoOverlay
│       ├── constants/    rooms.js   — room definitions & map constants
│       ├── game/         WorkspaceScene.js   — Phaser scene (map + movement)
│       ├── hooks/        useWebRTC.js        — WebRTC peer management
│       └── store/        gameStore.js        — shared mutable game state
└── server/          Node.js + Socket.io signaling + chat server
```

---

## Quick start (local)

### 1. Start the server

```bash
cd online-workspace/server
npm install
npm run dev       # or: npm start
# → http://localhost:3001
```

### 2. Start the client

```bash
cd online-workspace/client
npm install
npm run dev
# → http://localhost:5173
```

Open **multiple browser tabs** (or different browsers) to test multiplayer.

---

## Rooms

| Room | Camera required | Mic |
|------|----------------|-----|
| 🎬 Content Creation | Yes | On |
| ⌨️ Build / Coding | Yes | On |
| 🎧 Focus Room (Silent) | Yes | **Forced off** |
| 📈 Trading | Yes | On |
| 💬 No Cam Room | No | On |

The hallway between rooms is open to everyone.

---

## Controls

- **WASD** or **Arrow keys** — move your avatar
- **Click your status** in the top bar — edit live status anytime
- **Chat panel** — toggle with ✕ button; switch Room / General tabs; mute each independently

---

## How video/audio works

- WebRTC peer-to-peer (no relay server needed for local network)
- You only see/hear people **in the same room** as you
- When you leave a room all peer connections close automatically
- Focus Room enforces `audioTrack.enabled = false` before creating the WebRTC offer
- STUN servers used: Google's public STUN (stun.l.google.com)

> **For production / remote users** add a TURN server to `ICE_SERVERS` in `client/src/hooks/useWebRTC.js`.

---

## Environment variables

### Client (`client/.env`)
```
VITE_SERVER_URL=http://localhost:3001
```

### Server
```
PORT=3001   (default)
```

---

## Deploy

**Server** — any Node.js host (Railway, Render, Fly.io). Set `PORT` env var.

**Client** — `npm run build` → deploy `dist/` to Vercel / Netlify / Cloudflare Pages.  
Set `VITE_SERVER_URL` to your deployed server URL before building.

---

## Scaling beyond 10 users

The MVP uses a full-mesh WebRTC topology. Each user connects directly to every other user in the room. This works well up to ~6–8 users per room.

For larger rooms, replace peer-to-peer WebRTC with an SFU (Selective Forwarding Unit) such as:
- [mediasoup](https://mediasoup.org/)
- [LiveKit](https://livekit.io/) (hosted or self-hosted)
- [Daily.co](https://daily.co/) API
