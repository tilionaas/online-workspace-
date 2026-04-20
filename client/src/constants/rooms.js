export const MAP_WIDTH   = 2000;
export const MAP_HEIGHT  = 1300;

export const PLAYER_SPEED  = 230; // px / sec
export const PLAYER_RADIUS = 14;  // collision radius (smaller than visual)

// Wall thickness for drawing and collision
export const WT = 14;
// Door width (opening in walls)
export const DW = 68;

export const ROOMS = [
  {
    id: 'content',
    name: 'Content Creation',
    label: '🎬  Content Creation',
    x: 60,   y: 60,
    width: 520, height: 440,
    requireCamera: true,
    muteAudio: false,
    bgColor:     0x111128,
    borderColor: 0x6366f1,
    labelColor:  '#a5b4fc',
    // Door positions: side + offset along wall (px from room start)
    // East wall door at y = room.y + 190
    // South wall door at x = room.x + 230
    doors: [
      { side: 'E', offset: 190 }, // connects to hallway
      { side: 'S', offset: 230 }, // connects to lower corridor
    ],
  },
  {
    id: 'coding',
    name: 'Build / Coding',
    label: '⌨️  Build / Coding',
    x: 720,  y: 60,
    width: 520, height: 440,
    requireCamera: true,
    muteAudio: false,
    bgColor:     0x0b1f12,
    borderColor: 0x22c55e,
    labelColor:  '#86efac',
    doors: [
      { side: 'W', offset: 190 }, // connects to hallway
      { side: 'S', offset: 230 }, // connects to lower corridor
    ],
  },
  {
    id: 'focus',
    name: 'Focus Room (Silent)',
    label: '🎧  Focus Room',
    x: 60,   y: 780,
    width: 520, height: 440,
    requireCamera: true,
    muteAudio: true,
    bgColor:     0x160a22,
    borderColor: 0xa855f7,
    labelColor:  '#d8b4fe',
    doors: [
      { side: 'N', offset: 230 }, // connects to upper corridor
      { side: 'E', offset: 190 }, // connects to hallway
    ],
  },
  {
    id: 'trading',
    name: 'Trading',
    label: '📈  Trading',
    x: 720,  y: 780,
    width: 520, height: 440,
    requireCamera: true,
    muteAudio: false,
    bgColor:     0x0d1a06,
    borderColor: 0x84cc16,
    labelColor:  '#bef264',
    doors: [
      { side: 'N', offset: 230 }, // connects to upper corridor
      { side: 'W', offset: 190 }, // connects to hallway
    ],
  },
  {
    id: 'nocam',
    name: 'No Cam Room',
    label: '💬  No Cam Room',
    x: 1380, y: 420,
    width: 480, height: 440,
    requireCamera: false,
    muteAudio: false,
    bgColor:     0x1e140a,
    borderColor: 0xf59e0b,
    labelColor:  '#fcd34d',
    doors: [
      { side: 'W', offset: 190 }, // connects to right corridor
    ],
  },
];

// ── COLLISION WALL SEGMENTS ────────────────────────────────────────────────
// Each segment is { x, y, w, h } — a rectangle players cannot pass through.
// Generated from room walls with door gaps cut out.
function buildWallRects() {
  const rects = [];

  ROOMS.forEach((room) => {
    const { x, y, width: w, height: h, doors } = room;
    const doorsOnSide = (side) => doors.filter((d) => d.side === side);

    // Helper: split a 1D span [start, end] with gaps defined as [{from, to}]
    function splitSpan(start, end, gaps) {
      const points = [start];
      gaps
        .sort((a, b) => a.from - b.from)
        .forEach(({ from, to }) => { points.push(from, to); });
      points.push(end);
      const segs = [];
      for (let i = 0; i < points.length - 1; i += 2) {
        if (points[i + 1] > points[i]) segs.push([points[i], points[i + 1]]);
      }
      return segs;
    }

    // North wall (horizontal, at y)
    {
      const gaps = doorsOnSide('N').map((d) => ({ from: x + d.offset, to: x + d.offset + DW }));
      splitSpan(x, x + w, gaps).forEach(([x1, x2]) => {
        rects.push({ x: x1, y, w: x2 - x1, h: WT });
      });
    }
    // South wall
    {
      const gaps = doorsOnSide('S').map((d) => ({ from: x + d.offset, to: x + d.offset + DW }));
      splitSpan(x, x + w, gaps).forEach(([x1, x2]) => {
        rects.push({ x: x1, y: y + h - WT, w: x2 - x1, h: WT });
      });
    }
    // West wall (vertical, at x)
    {
      const gaps = doorsOnSide('W').map((d) => ({ from: y + d.offset, to: y + d.offset + DW }));
      splitSpan(y, y + h, gaps).forEach(([y1, y2]) => {
        rects.push({ x, y: y1, w: WT, h: y2 - y1 });
      });
    }
    // East wall
    {
      const gaps = doorsOnSide('E').map((d) => ({ from: y + d.offset, to: y + d.offset + DW }));
      splitSpan(y, y + h, gaps).forEach(([y1, y2]) => {
        rects.push({ x: x + w - WT, y: y1, w: WT, h: y2 - y1 });
      });
    }
  });

  return rects;
}

export const WALL_RECTS = buildWallRects();

// Helper: is a world point inside a room?
export function getRoomAtPoint(px, py) {
  return ROOMS.find(
    (r) => px >= r.x + WT && px <= r.x + r.width - WT &&
           py >= r.y + WT && py <= r.y + r.height - WT
  ) ?? null;
}

// Helper: circle vs AABB collision
export function circleHitsRect(cx, cy, r, rx, ry, rw, rh) {
  const nearX = Math.max(rx, Math.min(cx, rx + rw));
  const nearY = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - nearX;
  const dy = cy - nearY;
  return dx * dx + dy * dy < r * r;
}
