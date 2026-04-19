export const MAP_WIDTH  = 2000;
export const MAP_HEIGHT = 1300;

export const PLAYER_SPEED = 230; // px / sec
export const PLAYER_RADIUS = 36; // visual radius for avatar circle

export const ROOMS = [
  {
    id: 'content',
    name: 'Content Creation',
    label: '🎬  Content Creation',
    x: 80,   y: 80,
    width: 500, height: 420,
    requireCamera: true,
    muteAudio: false,
    bgColor:     0x12122a,
    borderColor: 0x6366f1,
    labelColor:  '#a5b4fc',
  },
  {
    id: 'coding',
    name: 'Build / Coding',
    label: '⌨️  Build / Coding',
    x: 720,  y: 80,
    width: 500, height: 420,
    requireCamera: true,
    muteAudio: false,
    bgColor:     0x0d2a1a,
    borderColor: 0x22c55e,
    labelColor:  '#86efac',
  },
  {
    id: 'focus',
    name: 'Focus Room (Silent)',
    label: '🎧  Focus Room',
    x: 80,   y: 760,
    width: 500, height: 420,
    requireCamera: true,
    muteAudio: true,          // mic disabled in this room
    bgColor:     0x1e0d2a,
    borderColor: 0xa855f7,
    labelColor:  '#d8b4fe',
  },
  {
    id: 'trading',
    name: 'Trading',
    label: '📈  Trading',
    x: 720,  y: 760,
    width: 500, height: 420,
    requireCamera: true,
    muteAudio: false,
    bgColor:     0x1a200a,
    borderColor: 0x84cc16,
    labelColor:  '#bef264',
  },
  {
    id: 'nocam',
    name: 'No Cam Room',
    label: '💬  No Cam Room',
    x: 1380, y: 420,
    width: 460, height: 420,
    requireCamera: false,
    muteAudio: false,
    bgColor:     0x2a1a0a,
    borderColor: 0xf59e0b,
    labelColor:  '#fcd34d',
  },
];

// Helper: is a world point inside a room?
export function getRoomAtPoint(x, y) {
  return ROOMS.find(
    (r) => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height
  ) ?? null;
}
