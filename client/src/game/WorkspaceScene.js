import Phaser from 'phaser';
import {
  MAP_WIDTH, MAP_HEIGHT, PLAYER_SPEED, PLAYER_RADIUS,
  ROOMS, WALL_RECTS, WT, DW,
  getRoomAtPoint, circleHitsRect,
} from '../constants/rooms.js';
import { gameStore } from '../store/gameStore.js';

export class WorkspaceScene extends Phaser.Scene {
  constructor() {
    super({ key: 'WorkspaceScene' });
    this.px = MAP_WIDTH / 2;
    this.py = MAP_HEIGHT / 2;
    this.lastEmitX  = 0;
    this.lastEmitY  = 0;
    this.emitTimer  = 0;
    this.currentRoomId = null;
    this.remote = {};

    // Fog & count objects
    this.fogGraphics  = {};
    this.countTexts   = {};
    this.fogCountTimer = 0;
  }

  // ─── LIFECYCLE ─────────────────────────────────────────────────────────────

  preload() {}

  create() {
    this.px = 985;
    this.py = 625;

    this._drawMap();
    this._setupFog();
    this._setupCamera();
    this._setupInput();

    gameStore.players[gameStore.localPlayerId] = {
      ...gameStore.players[gameStore.localPlayerId],
      x: this.px,
      y: this.py,
    };
  }

  update(_time, delta) {
    this._handleMovement(delta);
    this._updateCamera();
    this._interpolateRemote();
    this._checkRoomChange();
    this._throttleEmit(delta);

    // Update fog counters every 500ms
    this.fogCountTimer += delta;
    if (this.fogCountTimer > 500) {
      this.fogCountTimer = 0;
      this._updateRoomCounts();
    }
  }

  // ─── MAP DRAWING ──────────────────────────────────────────────────────────

  _drawMap() {
    const g = this.add.graphics();

    // ── BASE FLOOR ──────────────────────────────────────────────────────────
    // Hallway / lobby floor — warm concrete grey
    g.fillStyle(0x16161e, 1);
    g.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

    // Subtle tile grid for hallway
    g.lineStyle(1, 0x1c1c26, 1);
    for (let x = 0; x <= MAP_WIDTH; x += 80) g.lineBetween(x, 0, x, MAP_HEIGHT);
    for (let y = 0; y <= MAP_HEIGHT; y += 80) g.lineBetween(0, y, MAP_WIDTH, y);

    // ── ROOM FLOORS ──────────────────────────────────────────────────────────
    ROOMS.forEach((room) => {
      // Floor fill
      g.fillStyle(room.bgColor, 1);
      g.fillRect(room.x + WT, room.y + WT, room.width - WT * 2, room.height - WT * 2);
      // Floor plank lines
      g.lineStyle(1, 0x00000020, 1);
      for (let fy = room.y + WT + 36; fy < room.y + room.height - WT; fy += 36) {
        g.lineBetween(room.x + WT + 4, fy, room.x + room.width - WT - 4, fy);
      }
    });

    // ── FURNITURE HELPERS ──────────────────────────────────────────────────

    // Desk (top-down: dark wood surface + front edge + monitor stand indent)
    const desk = (x, y, w = 150, h = 52) => {
      g.fillStyle(0x2c1a0e, 1);
      g.fillRect(x, y, w, h);
      g.fillStyle(0x3d2412, 1);
      g.fillRect(x + 2, y + 2, w - 4, h - 8);
      g.fillStyle(0x1a0e06, 1);
      g.fillRect(x, y + h - 6, w, 6); // front edge darker
      g.lineStyle(1, 0x100800, 1);
      g.strokeRect(x, y, w, h);
    };

    const monitor = (x, y, w = 36, h = 22) => {
      g.fillStyle(0x0c1120, 1);
      g.fillRect(x, y, w, h);
      g.fillStyle(0x122040, 1);
      g.fillRect(x + 2, y + 2, w - 4, h - 4);
      g.fillStyle(0x1d4ed8, 0.25);
      g.fillRect(x + 2, y + 2, w - 4, 5);
      g.lineStyle(1, 0x1e3a5f, 1);
      g.strokeRect(x, y, w, h);
    };

    const wideMonitor = (x, y) => monitor(x, y, 46, 26);

    const chair = (x, y, w = 26, h = 26) => {
      g.fillStyle(0x141e2d, 1);
      g.fillRect(x, y, w, h);
      g.fillStyle(0x1c2a40, 1);
      g.fillRect(x + 2, y + 2, w - 4, 7); // headrest
      g.fillStyle(0x0e1520, 0.6);
      g.fillRect(x + 1, y + h - 5, w - 2, 4); // seat front
      g.lineStyle(1, 0x090e17, 1);
      g.strokeRect(x, y, w, h);
    };

    const sofa = (x, y, w = 130, h = 44, col = 0x1c3253) => {
      g.fillStyle(col, 1);
      g.fillRect(x, y, w, h);
      g.fillStyle(col + 0x080808, 1);
      g.fillRect(x, y, w, 10); // backrest
      g.fillStyle(col - 0x020202, 1);
      g.fillRect(x, y, 9, h);
      g.fillRect(x + w - 9, y, 9, h);
      g.lineStyle(1, 0x08101c, 1);
      g.strokeRect(x, y, w, h);
      const segs = Math.max(2, Math.floor(w / 44));
      for (let i = 1; i < segs; i++) {
        const lx = x + Math.round(i * (w / segs));
        g.lineStyle(1, 0x08101c, 0.4);
        g.lineBetween(lx, y + 10, lx, y + h);
      }
    };

    const coffeeTable = (x, y, w = 80, h = 46) => {
      g.fillStyle(0x2c1a0e, 1);
      g.fillRect(x, y, w, h);
      g.fillStyle(0x3a2212, 1);
      g.fillRect(x + 3, y + 3, w - 6, h - 6);
      g.lineStyle(1, 0x180c04, 1);
      g.strokeRect(x, y, w, h);
      // legs
      g.fillStyle(0x180c04, 1);
      g.fillRect(x + 3, y + h - 5, 7, 5);
      g.fillRect(x + w - 10, y + h - 5, 7, 5);
    };

    const shelf = (x, y, w = 120, h = 16) => {
      g.fillStyle(0x2c1a0e, 1);
      g.fillRect(x, y, w, h);
      g.lineStyle(1, 0x180c04, 1);
      g.strokeRect(x, y, w, h);
      const cols = [0x6366f1, 0x22c55e, 0xf59e0b, 0xef4444, 0xa855f7, 0x06b6d4, 0xf97316, 0x10b981];
      let bx = x + 3;
      for (let i = 0; bx < x + w - 8; i++) {
        const bw = 8 + (i % 4) * 3;
        g.fillStyle(cols[i % cols.length], 0.9);
        g.fillRect(bx, y + 2, bw, h - 4);
        bx += bw + 2;
      }
    };

    const whiteboard = (x, y, w = 200, h = 70) => {
      g.fillStyle(0xf1f5f9, 1);
      g.fillRect(x, y, w, h);
      g.lineStyle(4, 0x475569, 1);
      g.strokeRect(x, y, w, h);
      g.fillStyle(0x475569, 1);
      g.fillRect(x, y, w, 5);
      g.fillRect(x, y + h - 5, w, 5);
      // sketch lines
      g.lineStyle(2, 0x94a3b8, 0.5);
      g.beginPath();
      g.moveTo(x + 12, y + 48);
      g.lineTo(x + 38, y + 30);
      g.lineTo(x + 68, y + 42);
      g.lineTo(x + 100, y + 20);
      g.lineTo(x + 135, y + 33);
      g.lineTo(x + 165, y + 16);
      g.strokePath();
      // sticky notes
      [[0xfef08a, w - 48, 10], [0x86efac, w - 48, 36], [0xfca5a5, w - 20, 10]].forEach(([c, ox, oy]) => {
        g.fillStyle(c, 0.85);
        g.fillRect(x + ox, y + oy, 24, 20);
      });
    };

    const receptionDesk = (x, y, w = 240, h = 60) => {
      g.fillStyle(0x2c1a0e, 1);
      g.fillRect(x, y, w, h);
      g.fillStyle(0x3d2412, 1);
      g.fillRect(x + 2, y + 2, w - 4, 8);
      g.lineStyle(2, 0x5c3010, 1);
      g.strokeRect(x, y, w, h);
      g.lineStyle(1, 0x5c3010, 0.3);
      g.lineBetween(x + 12, y + h - 4, x + w - 12, y + h - 4);
    };

    const tvScreen = (x, y, w = 230, h = 50) => {
      g.fillStyle(0x080d18, 1);
      g.fillRect(x, y, w, h);
      g.fillStyle(0x0c1a36, 1);
      g.fillRect(x + 3, y + 3, w - 6, h - 6);
      g.lineStyle(2, 0x1a3360, 1);
      g.strokeRect(x, y, w, h);
      g.lineStyle(1, 0x2563eb, 0.28);
      [14, 22, 30].forEach((oy) => g.lineBetween(x + 10, y + oy, x + w / 2 - 10, y + oy));
    };

    const wallChart = (x, y, w = 260, h = 80) => {
      g.fillStyle(0x081408, 1);
      g.fillRect(x, y, w, h);
      g.lineStyle(2, 0x4d7c0f, 0.6);
      g.strokeRect(x, y, w, h);
      g.lineStyle(1, 0x365314, 0.6);
      g.lineBetween(x + 14, y + 10, x + 14, y + h - 10);
      g.lineBetween(x + 14, y + h - 10, x + w - 10, y + h - 10);
      g.lineStyle(2, 0x4ade80, 0.9);
      g.beginPath();
      g.moveTo(x + 18, y + 65); g.lineTo(x + 50, y + 50);
      g.lineTo(x + 80, y + 58); g.lineTo(x + 110, y + 36);
      g.lineTo(x + 140, y + 43); g.lineTo(x + 170, y + 22);
      g.lineTo(x + 200, y + 28); g.lineTo(x + 245, y + 12);
      g.strokePath();
    };

    const waterCooler = (x, y) => {
      g.fillStyle(0x7dd3fc, 0.5);
      g.fillRect(x - 7, y - 30, 14, 20);
      g.fillStyle(0xe2e8f0, 1);
      g.fillRect(x - 11, y - 10, 22, 30);
      g.fillStyle(0x3b82f6, 0.4);
      g.fillRect(x - 7, y + 2, 6, 8);
      g.lineStyle(1, 0x94a3b8, 0.7);
      g.strokeRect(x - 11, y - 10, 22, 30);
    };

    const acousticPanel = (x, y, w = 44, h = 28) => {
      g.fillStyle(0x18183a, 1);
      g.fillRect(x, y, w, h);
      g.lineStyle(1, 0x4f4fbb, 0.2);
      g.strokeRect(x, y, w, h);
      g.lineStyle(1, 0x4040aa, 0.18);
      g.lineBetween(x, y + h / 2, x + w / 2, y);
      g.lineBetween(x + w / 2, y, x + w, y + h / 2);
      g.lineBetween(x + w, y + h / 2, x + w / 2, y + h);
      g.lineBetween(x + w / 2, y + h, x, y + h / 2);
    };

    const ringLight = (x, y, r = 18) => {
      g.lineStyle(5, 0xfef3c7, 0.7);
      g.strokeCircle(x, y, r);
      g.fillStyle(0xfef9c3, 0.12);
      g.fillCircle(x, y, r - 4);
    };

    const tripod = (x, y, len = 38) => {
      g.lineStyle(2, 0x334155, 1);
      g.lineBetween(x, y - len, x - 12, y);
      g.lineBetween(x, y - len, x + 12, y);
      g.lineBetween(x, y - len, x, y);
      g.fillStyle(0x1e293b, 1);
      g.fillRect(x - 8, y - len - 8, 16, 11);
      g.fillStyle(0x334155, 1);
      g.fillCircle(x - 3, y - len - 2, 4);
    };

    // Pool table (top-down)
    const poolTable = (x, y, w = 170, h = 96) => {
      // outer rail
      g.fillStyle(0x5c3a10, 1);
      g.fillRect(x, y, w, h);
      // felt
      g.fillStyle(0x166534, 1);
      g.fillRect(x + 10, y + 10, w - 20, h - 20);
      g.fillStyle(0x14532d, 0.5);
      g.fillRect(x + 14, y + 14, w - 28, h - 28);
      // pockets
      g.fillStyle(0x000000, 1);
      [[x + 10, y + 10], [x + w / 2, y + 10], [x + w - 10, y + 10],
       [x + 10, y + h - 10], [x + w / 2, y + h - 10], [x + w - 10, y + h - 10]].forEach(([px, py]) => {
        g.fillCircle(px, py, 7);
      });
      // cue ball
      g.fillStyle(0xffffff, 1);
      g.fillCircle(x + w / 3, y + h / 2, 5);
      // rack of balls
      [[0xef4444, x + w * 0.66, y + h / 2],
       [0x3b82f6, x + w * 0.66 + 12, y + h / 2 - 6],
       [0xf59e0b, x + w * 0.66 + 12, y + h / 2 + 6],
       [0xa855f7, x + w * 0.66 + 24, y + h / 2 - 12],
       [0x22c55e, x + w * 0.66 + 24, y + h / 2],
       [0xf97316, x + w * 0.66 + 24, y + h / 2 + 12]].forEach(([c, bx, by]) => {
        g.fillStyle(c, 1);
        g.fillCircle(bx, by, 5);
      });
      g.lineStyle(2, 0x3d2008, 1);
      g.strokeRect(x, y, w, h);
    };

    // Ping pong table
    const pingPongTable = (x, y, w = 150, h = 76) => {
      g.fillStyle(0x1e3a5f, 1);
      g.fillRect(x, y, w, h);
      g.lineStyle(2, 0xffffff, 0.8);
      g.strokeRect(x + 4, y + 4, w - 8, h - 8);
      g.lineBetween(x + w / 2, y + 4, x + w / 2, y + h - 4); // center line
      g.lineBetween(x + 4, y + h / 2, x + w - 4, y + h / 2); // net
      g.lineStyle(4, 0xffffff, 0.5);
      g.lineBetween(x + 4, y + h / 2, x + w - 4, y + h / 2);
      // balls
      g.fillStyle(0xfbbf24, 1);
      g.fillCircle(x + w / 4, y + h * 0.35, 4);
      g.fillCircle(x + w * 0.75, y + h * 0.65, 4);
    };

    // Vending machine (top-down — looks like a rectangle with a screen)
    const vendingMachine = (x, y) => {
      g.fillStyle(0x1e293b, 1);
      g.fillRect(x, y, 28, 48);
      g.fillStyle(0x334155, 1);
      g.fillRect(x + 2, y + 2, 24, 24);
      g.fillStyle(0x0ea5e9, 0.4);
      g.fillRect(x + 3, y + 3, 22, 22);
      // colorful product rows
      [[0xef4444, 0xf59e0b, 0x22c55e], [0x3b82f6, 0xa855f7, 0xf97316]].forEach(([c1, c2, c3], row) => {
        [[c1, 4], [c2, 12], [c3, 20]].forEach(([col, ox]) => {
          g.fillStyle(col, 0.7);
          g.fillRect(x + ox, y + 28 + row * 8, 6, 6);
        });
      });
      g.lineStyle(1, 0x0f172a, 1);
      g.strokeRect(x, y, 28, 48);
    };

    // Printer / copier
    const printer = (x, y) => {
      g.fillStyle(0xd1d5db, 1);
      g.fillRect(x, y, 56, 38);
      g.fillStyle(0x9ca3af, 1);
      g.fillRect(x + 4, y + 4, 48, 20);
      g.fillStyle(0x374151, 1);
      g.fillRect(x + 6, y + 6, 44, 16); // paper tray
      g.fillStyle(0xffffff, 1);
      g.fillRect(x + 10, y + 10, 34, 8);
      g.fillStyle(0x1d4ed8, 0.6);
      g.fillRect(x + 36, y + 26, 14, 8); // control panel
      g.lineStyle(1, 0x6b7280, 1);
      g.strokeRect(x, y, 56, 38);
    };

    // Rug
    const rug = (x, y, w, h, col = 0x1c3253) => {
      g.fillStyle(col, 0.3);
      g.fillRect(x, y, w, h);
      g.lineStyle(2, col, 0.6);
      g.strokeRect(x, y, w, h);
      g.lineStyle(1, col, 0.3);
      g.strokeRect(x + 8, y + 8, w - 16, h - 16);
    };

    // Standing lamp
    const lamp = (x, y) => {
      g.fillStyle(0xc0a060, 0.7);
      g.fillCircle(x, y, 12);
      g.fillStyle(0xfef9c3, 0.4);
      g.fillCircle(x, y, 8);
      g.fillStyle(0x78716c, 1);
      g.fillCircle(x, y, 3);
    };

    // ── DRAW WALLS + DOORS ──────────────────────────────────────────────────
    // Wall segments (solid)
    g.fillStyle(0x0f0f1a, 1);
    WALL_RECTS.forEach(({ x, y, w, h }) => g.fillRect(x, y, w, h));

    // Door threshold strips (slightly lighter, shows the opening)
    ROOMS.forEach((room) => {
      room.doors.forEach(({ side, offset }) => {
        const { x, y, width: w, height: h } = room;
        g.fillStyle(0x1a1a2a, 1);
        if (side === 'N') g.fillRect(x + offset, y, DW, WT);
        if (side === 'S') g.fillRect(x + offset, y + h - WT, DW, WT);
        if (side === 'W') g.fillRect(x, y + offset, WT, DW);
        if (side === 'E') g.fillRect(x + w - WT, y + offset, WT, DW);
      });
    });

    // Wall top highlight (thin bright line on top edge of each wall rect)
    g.lineStyle(1, 0x2a2a40, 1);
    WALL_RECTS.forEach(({ x, y, w, h }) => g.strokeRect(x, y, w, h));

    // ── CONTENT CREATION (60, 60, 520×440) ─────────────────────────────────
    // Acoustic panels on back wall
    for (let ax = 80; ax < 565; ax += 60) acousticPanel(ax, 74, 44, 26);

    // 3 recording stations
    const stations = [
      { dx: 88,  dy: 158 },
      { dx: 288, dy: 158 },
      { dx: 188, dy: 360 }, // center front
    ];
    stations.forEach(({ dx, dy }) => {
      desk(dx, dy, 155, 50);
      monitor(dx + 6, dy - 26);
      monitor(dx + 50, dy - 26);
      chair(dx + 18, dy + 56, 26, 26);
      chair(dx + 54, dy + 56, 26, 26);
    });
    ringLight(200, 155);
    ringLight(400, 155);
    ringLight(310, 312, 20);
    tripod(250, 302);
    tripod(455, 302);

    // ── CODING ROOM (720, 60, 520×440) ─────────────────────────────────────
    whiteboard(740, 70, 200, 70);
    shelf(1148, 88, 120, 16);
    shelf(1148, 112, 120, 16);
    shelf(1148, 136, 120, 16);

    // 4 workstations in 2×2
    [[748, 178], [960, 178], [748, 368], [960, 368]].forEach(([wx, wy]) => {
      desk(wx, wy, 175, 50);
      wideMonitor(wx + 4,  wy - 32);
      wideMonitor(wx + 56, wy - 32);
      chair(wx + 12, wy + 56, 26, 26);
      chair(wx + 52, wy + 56, 26, 26);
      chair(wx + 92, wy + 56, 26, 26);
    });

    // Ping pong table in corner
    pingPongTable(1148, 368, 150, 76);

    // Printer corner
    printer(1158, 460);

    // ── FOCUS ROOM (60, 780, 520×440) ──────────────────────────────────────
    // Cross divider lines for 4 pods
    g.lineStyle(2, 0x3b0764, 0.4);
    g.lineBetween(320, 794, 320, 1206);
    g.lineBetween(74, 990, 566, 990);

    [[88, 808], [348, 808], [88, 1002], [348, 1002]].forEach(([dx, dy]) => {
      desk(dx, dy, 175, 50);
      monitor(dx + 6, dy - 26);
      monitor(dx + 50, dy - 26);
      chair(dx + 18, dy + 56, 26, 26);
      chair(dx + 54, dy + 56, 26, 26);
    });

    // Headphone hooks on wall (decorative)
    for (let hx = 90; hx < 560; hx += 60) {
      g.fillStyle(0x4c1d95, 0.35);
      g.fillRect(hx, 784, 40, 8);
      g.fillStyle(0x7c3aed, 0.5);
      g.fillCircle(hx + 10, 788, 4);
      g.fillCircle(hx + 30, 788, 4);
    }

    // ── TRADING ROOM (720, 780, 520×440) ───────────────────────────────────
    wallChart(730, 790, 260, 80);

    // 3 trading desks, each with 4 monitors
    [[740, 900], [962, 900], [850, 1080]].forEach(([dx, dy]) => {
      desk(dx, dy, 200, 52);
      [dx + 4, dx + 42, dx + 80, dx + 118].forEach((mx) => monitor(mx, dy - 28, 32, 22));
      [dx + 8, dx + 46, dx + 84, dx + 122].forEach((cx) => chair(cx, dy + 58, 24, 24));
    });

    // ── NO CAM ROOM / LOUNGE (1380, 420, 480×440) ──────────────────────────
    tvScreen(1500, 430, 230, 50);
    rug(1405, 498, 380, 300, 0x7c2d12);

    // L-shaped sofa cluster
    sofa(1400, 516, 215, 46, 0x1a3060);
    sofa(1400, 562, 46, 135, 0x1a3060);
    sofa(1610, 516, 180, 46, 0x2d1f6b);
    coffeeTable(1516, 610, 115, 58);

    // Pool table
    poolTable(1430, 726, 170, 95);

    // Bean bags
    [[1638, 738, 0x6d28d9, 0x5b21b6], [1760, 722, 0x1d4ed8, 0x1e40af]].forEach(([bx, by, c1, c2]) => {
      g.fillStyle(c1, 0.85);
      g.fillCircle(bx, by, 22);
      g.fillStyle(c2, 1);
      g.fillCircle(bx, by, 15);
    });

    // lamps for lounge
    lamp(1840, 440);
    lamp(1840, 840);

    // ── LOBBY / HALLWAY ────────────────────────────────────────────────────
    // Reception desk — center
    receptionDesk(820, 590, 240, 58);
    monitor(866, 564, 44, 28);
    monitor(922, 564, 44, 28);
    chair(888, 656, 38, 34);

    // Left corridor lounge
    sofa(594, 554, 115, 40, 0x1a2537);
    sofa(594, 676, 115, 40, 0x1a2537);
    coffeeTable(620, 600, 62, 70);
    waterCooler(700, 540);
    vendingMachine(696, 672);

    // Right corridor lounge
    sofa(1242, 554, 115, 40, 0x1a2537);
    sofa(1242, 676, 115, 40, 0x1a2537);
    coffeeTable(1266, 600, 62, 70);
    waterCooler(1240, 540);
    vendingMachine(1240, 672);

    // Printer near reception
    printer(1040, 578);

    // Corner standing lamps
    lamp(600, 530);
    lamp(1370, 530);
    lamp(600, 720);
    lamp(1370, 720);

    // Far right corridor lamps
    lamp(1870, 260);
    lamp(1870, 1040);

    // ── ROOM BORDERS + LABELS (on top of everything) ───────────────────────
    ROOMS.forEach((room) => {
      // Outer wall outline for polish
      g.lineStyle(2, room.borderColor, 0.5);
      g.strokeRect(room.x, room.y, room.width, room.height);

      // Corner accent squares
      g.fillStyle(room.borderColor, 1);
      [
        [room.x, room.y],
        [room.x + room.width, room.y],
        [room.x, room.y + room.height],
        [room.x + room.width, room.y + room.height],
      ].forEach(([cx, cy]) => g.fillRect(cx - 4, cy - 4, 8, 8));

      // Room label
      this.add.text(room.x + room.width / 2, room.y + WT + 6, room.label, {
        fontSize: '15px',
        color: room.labelColor,
        fontFamily: 'monospace',
        fontStyle: 'bold',
      }).setOrigin(0.5, 0).setDepth(5);

      // Badges
      const badges = [];
      if (room.requireCamera) badges.push('📷 cam required');
      if (room.muteAudio)     badges.push('🔇 mic off');
      badges.forEach((badge, i) => {
        this.add.text(
          room.x + room.width / 2,
          room.y + room.height - WT - 4 - i * 18,
          badge,
          { fontSize: '10px', color: '#475569', fontFamily: 'monospace' }
        ).setOrigin(0.5, 1).setDepth(5);
      });
    });

    // Lobby label
    this.add.text(990, 638, 'L O B B Y', {
      fontSize: '11px', color: '#1c1c28', fontFamily: 'monospace',
      fontStyle: 'bold', letterSpacing: 10,
    }).setOrigin(0.5).setDepth(5);

    // Map outer border
    g.lineStyle(4, 0x22223a, 1);
    g.strokeRect(2, 2, MAP_WIDTH - 4, MAP_HEIGHT - 4);
  }

  // ─── FOG + PEOPLE COUNT ───────────────────────────────────────────────────

  _setupFog() {
    ROOMS.forEach((room) => {
      // Dark overlay
      const fg = this.add.graphics();
      fg.fillStyle(0x000000, 0.72);
      fg.fillRect(room.x + WT, room.y + WT, room.width - WT * 2, room.height - WT * 2);
      fg.setDepth(12);
      fg.setVisible(true); // all rooms start fogged
      this.fogGraphics[room.id] = fg;

      // Count text
      const t = this.add.text(
        room.x + room.width / 2,
        room.y + room.height / 2,
        '',
        { fontSize: '18px', color: '#94a3b8', fontFamily: 'monospace', fontStyle: 'bold' }
      ).setOrigin(0.5).setDepth(13).setVisible(true);
      this.countTexts[room.id] = t;
    });
  }

  _updateRoomCounts() {
    const counts = {};
    Object.values(gameStore.players).forEach((p) => {
      if (p.room) counts[p.room] = (counts[p.room] || 0) + 1;
    });
    ROOMS.forEach((room) => {
      const n = counts[room.id] || 0;
      const isMyRoom = room.id === this.currentRoomId;
      this.fogGraphics[room.id].setVisible(!isMyRoom);
      this.countTexts[room.id].setVisible(!isMyRoom);
      if (!isMyRoom) {
        this.countTexts[room.id].setText(n > 0 ? `${n} ${n === 1 ? 'person' : 'people'}` : 'Empty');
      }
    });
  }

  // ─── CAMERA ───────────────────────────────────────────────────────────────

  _setupCamera() {
    this._anchor = this.add.circle(this.px, this.py, 1).setAlpha(0.001);
    this.cameras.main.startFollow(this._anchor, true, 0.09, 0.09);
    this.cameras.main.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);
    this.cameras.main.setZoom(1);
  }

  _setupInput() {
    this.keys = this.input.keyboard.addKeys({
      up:    Phaser.Input.Keyboard.KeyCodes.UP,
      down:  Phaser.Input.Keyboard.KeyCodes.DOWN,
      left:  Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      W: Phaser.Input.Keyboard.KeyCodes.W,
      A: Phaser.Input.Keyboard.KeyCodes.A,
      S: Phaser.Input.Keyboard.KeyCodes.S,
      D: Phaser.Input.Keyboard.KeyCodes.D,
    });
  }

  // ─── UPDATE HELPERS ───────────────────────────────────────────────────────

  _handleMovement(delta) {
    const k = this.keys;
    const dt = delta / 1000;
    let vx = 0, vy = 0;

    if (k.left.isDown  || k.A.isDown) vx -= PLAYER_SPEED;
    if (k.right.isDown || k.D.isDown) vx += PLAYER_SPEED;
    if (k.up.isDown    || k.W.isDown) vy -= PLAYER_SPEED;
    if (k.down.isDown  || k.S.isDown) vy += PLAYER_SPEED;

    if (vx !== 0 && vy !== 0) { vx *= 0.7071; vy *= 0.7071; }

    const PR = PLAYER_RADIUS;

    let nx = Phaser.Math.Clamp(this.px + vx * dt, PR, MAP_WIDTH  - PR);
    let ny = Phaser.Math.Clamp(this.py + vy * dt, PR, MAP_HEIGHT - PR);

    // ── Camera-required room check ────────────────────────────────────────
    const nextRoom = getRoomAtPoint(nx, ny);
    if (nextRoom?.requireCamera && !gameStore.hasCamera) {
      const currentlyInside = getRoomAtPoint(this.px, this.py)?.id === nextRoom.id;
      if (!currentlyInside) {
        gameStore.onRoomBlocked?.(nextRoom.id);
        return;
      }
    }

    // ── Wall collision (axis-separated sliding) ───────────────────────────
    // Test X axis
    if (WALL_RECTS.some((r) => circleHitsRect(nx, this.py, PR, r.x, r.y, r.w, r.h))) {
      nx = this.px;
    }
    // Test Y axis
    if (WALL_RECTS.some((r) => circleHitsRect(this.px, ny, PR, r.x, r.y, r.w, r.h))) {
      ny = this.py;
    }

    this.px = nx;
    this.py = ny;
    this._anchor.setPosition(this.px, this.py);

    const lp = gameStore.players[gameStore.localPlayerId];
    if (lp) { lp.x = this.px; lp.y = this.py; }
  }

  _updateCamera() {
    const cam = this.cameras.main;
    gameStore.camera.scrollX = cam.scrollX;
    gameStore.camera.scrollY = cam.scrollY;
    gameStore.camera.zoom    = cam.zoom;
  }

  _interpolateRemote() {
    Object.values(this.remote).forEach((rp) => {
      rp.x = Phaser.Math.Linear(rp.x, rp.targetX, 0.18);
      rp.y = Phaser.Math.Linear(rp.y, rp.targetY, 0.18);
      const sp = gameStore.players[rp.id];
      if (sp) { sp.x = rp.x; sp.y = rp.y; }
    });
  }

  _checkRoomChange() {
    const room = getRoomAtPoint(this.px, this.py);
    const id   = room?.id ?? null;
    if (id !== this.currentRoomId) {
      this.currentRoomId = id;
      gameStore.onRoomChange?.(id);
      this._updateRoomCounts(); // immediate update on room change
    }
  }

  _throttleEmit(delta) {
    this.emitTimer += delta;
    if (this.emitTimer < 50) return;
    this.emitTimer = 0;
    if (
      Math.abs(this.px - this.lastEmitX) > 0.5 ||
      Math.abs(this.py - this.lastEmitY) > 0.5
    ) {
      this.lastEmitX = this.px;
      this.lastEmitY = this.py;
      gameStore.emitMove?.(this.px, this.py);
    }
  }

  // ─── PUBLIC API ───────────────────────────────────────────────────────────

  addRemotePlayer(id, data) {
    if (this.remote[id]) return;
    this.remote[id] = { id, x: data.x, y: data.y, targetX: data.x, targetY: data.y };
    gameStore.players[id] = { ...data, x: data.x, y: data.y };
  }

  moveRemotePlayer(id, x, y) {
    const rp = this.remote[id];
    if (rp) { rp.targetX = x; rp.targetY = y; }
    const sp = gameStore.players[id];
    if (sp) { sp.x = x; sp.y = y; }
  }

  removeRemotePlayer(id) {
    delete this.remote[id];
    delete gameStore.players[id];
  }

  updateRemoteStatus(id, status) {
    const sp = gameStore.players[id];
    if (sp) sp.status = status;
  }

  updateRemoteRoom(id, room) {
    const sp = gameStore.players[id];
    if (sp) {
      sp.room = room;
      this._updateRoomCounts();
    }
  }

  nudgeOutOfRoom() {
    this.px = 985;
    this.py = 625;
    this._anchor.setPosition(this.px, this.py);
  }
}
