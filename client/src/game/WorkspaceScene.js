import Phaser from 'phaser';
import {
  MAP_WIDTH, MAP_HEIGHT, PLAYER_SPEED, PLAYER_RADIUS,
  ROOMS, getRoomAtPoint,
} from '../constants/rooms.js';
import { gameStore } from '../store/gameStore.js';

export class WorkspaceScene extends Phaser.Scene {
  constructor() {
    super({ key: 'WorkspaceScene' });

    this.px = MAP_WIDTH / 2;
    this.py = MAP_HEIGHT / 2;

    this.lastEmitX = 0;
    this.lastEmitY = 0;
    this.emitTimer = 0;

    this.currentRoomId = null;
    this.lastValidX = MAP_WIDTH / 2;
    this.lastValidY = MAP_HEIGHT / 2;

    this.remote = {};
  }

  // ─── LIFECYCLE ────────────────────────────────────────────────────────────

  preload() {}

  create() {
    this.px = MAP_WIDTH / 2;
    this.py = MAP_HEIGHT / 2;
    this.lastValidX = this.px;
    this.lastValidY = this.py;

    this._drawMap();
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
  }

  // ─── MAP DRAWING ──────────────────────────────────────────────────────────

  _drawMap() {
    const g = this.add.graphics();

    // ── FLOOR ──────────────────────────────────────────────────────────────
    g.fillStyle(0x0e0e18, 1);
    g.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

    // Subtle hallway tile grid
    g.lineStyle(1, 0x141420, 1);
    for (let x = 0; x <= MAP_WIDTH; x += 72) g.lineBetween(x, 0, x, MAP_HEIGHT);
    for (let y = 0; y <= MAP_HEIGHT; y += 72) g.lineBetween(0, y, MAP_WIDTH, y);

    // ── ROOM FILLS WITH FLOOR PLANKS ───────────────────────────────────────
    ROOMS.forEach((room) => {
      g.fillStyle(room.bgColor, 1);
      g.fillRect(room.x, room.y, room.width, room.height);
      g.lineStyle(1, 0x00000022, 1);
      for (let fy = room.y + 40; fy < room.y + room.height; fy += 40) {
        g.lineBetween(room.x + 8, fy, room.x + room.width - 8, fy);
      }
    });

    // ── FURNITURE HELPERS ─────────────────────────────────────────────────

    const desk = (x, y, w = 150, h = 50) => {
      g.fillStyle(0x3d2510, 1);
      g.fillRect(x, y, w, h);
      g.fillStyle(0x52301a, 1);
      g.fillRect(x + 2, y + 2, w - 4, 7);
      g.lineStyle(1, 0x221108, 1);
      g.strokeRect(x, y, w, h);
    };

    const monitor = (x, y, w = 36, h = 24) => {
      g.fillStyle(0x0f172a, 1);
      g.fillRect(x, y, w, h);
      g.fillStyle(0x1a3455, 1);
      g.fillRect(x + 2, y + 2, w - 4, h - 4);
      g.lineStyle(1, 0x2563eb, 0.35);
      g.lineBetween(x + 4, y + 7,  x + w - 4, y + 7);
      g.lineBetween(x + 4, y + 12, x + w - 4, y + 12);
      g.lineBetween(x + 4, y + 17, x + w - 4, y + 17);
    };

    const wideMonitor = (x, y) => monitor(x, y, 46, 28);

    const chair = (x, y, w = 28, h = 28) => {
      g.fillStyle(0x1a2537, 1);
      g.fillRect(x, y, w, h);
      g.fillStyle(0x243044, 1);
      g.fillRect(x + 2, y + 2, w - 4, 7);
      g.lineStyle(1, 0x0e1520, 1);
      g.strokeRect(x, y, w, h);
    };

    const plant = (x, y, r = 16) => {
      // pot
      g.fillStyle(0x5c3311, 1);
      g.fillRect(x - 7, y - 2, 14, 12);
      g.fillStyle(0x3a1e08, 1);
      g.fillRect(x - 6, y - 1, 12, 3);
      // foliage
      g.fillStyle(0x14692e, 1);
      g.fillCircle(x, y - r + 2, r);
      g.fillStyle(0x166534, 0.7);
      g.fillCircle(x - r * 0.35, y - r * 0.55, r * 0.7);
      g.fillCircle(x + r * 0.35, y - r * 0.55, r * 0.7);
    };

    const tallPlant = (x, y) => {
      g.fillStyle(0x4d2e0d, 1);
      g.fillRect(x - 11, y - 5, 22, 20);
      g.fillStyle(0x2d1a06, 1);
      g.fillRect(x - 3, y - 38, 6, 36);
      g.fillStyle(0x14692e, 1);
      g.fillCircle(x, y - 48, 20);
      g.fillStyle(0x166534, 0.8);
      g.fillCircle(x - 13, y - 38, 13);
      g.fillCircle(x + 13, y - 38, 13);
    };

    const sofa = (x, y, w = 130, h = 44, col = 0x1c3253) => {
      g.fillStyle(col, 1);
      g.fillRect(x, y, w, h);
      // backrest
      g.fillStyle(col + 0x0a0a0a, 1);
      g.fillRect(x, y, w, 11);
      // armrests
      g.fillStyle(col - 0x020202, 1);
      g.fillRect(x, y, 10, h);
      g.fillRect(x + w - 10, y, 10, h);
      g.lineStyle(1, 0x0a1624, 1);
      g.strokeRect(x, y, w, h);
      // cushion dividers
      const segs = Math.max(2, Math.floor(w / 44));
      for (let i = 1; i < segs; i++) {
        const lx = x + Math.round(i * (w / segs));
        g.lineStyle(1, 0x0a1624, 0.5);
        g.lineBetween(lx, y + 11, lx, y + h);
      }
    };

    const coffeeTable = (x, y, w = 80, h = 44) => {
      g.fillStyle(0x3d2510, 1);
      g.fillRect(x, y, w, h);
      g.fillStyle(0x4d3018, 1);
      g.fillRect(x + 3, y + 3, w - 6, h - 6);
      g.lineStyle(1, 0x221108, 1);
      g.strokeRect(x, y, w, h);
      g.fillStyle(0x221108, 1);
      g.fillRect(x + 4, y + h - 5, 7, 5);
      g.fillRect(x + w - 11, y + h - 5, 7, 5);
    };

    const shelf = (x, y, w = 110, h = 18) => {
      g.fillStyle(0x3d2510, 1);
      g.fillRect(x, y, w, h);
      g.lineStyle(1, 0x221108, 1);
      g.strokeRect(x, y, w, h);
      const bookCols = [0x6366f1, 0x22c55e, 0xf59e0b, 0xef4444, 0xa855f7, 0x06b6d4, 0xf97316];
      let bx = x + 3;
      for (let i = 0; bx < x + w - 10; i++) {
        const bw = 9 + (i % 3) * 3;
        g.fillStyle(bookCols[i % bookCols.length], 0.85);
        g.fillRect(bx, y + 2, bw, h - 4);
        bx += bw + 2;
      }
    };

    const rug = (x, y, w, h, col = 0x1c3253) => {
      g.fillStyle(col, 0.35);
      g.fillRect(x, y, w, h);
      g.lineStyle(2, col, 0.65);
      g.strokeRect(x, y, w, h);
      g.lineStyle(1, col, 0.35);
      g.strokeRect(x + 7, y + 7, w - 14, h - 14);
    };

    const whiteboard = (x, y, w = 190, h = 78) => {
      g.fillStyle(0xf1f5f9, 1);
      g.fillRect(x, y, w, h);
      g.lineStyle(3, 0x475569, 1);
      g.strokeRect(x, y, w, h);
      g.fillStyle(0x475569, 1);
      g.fillRect(x, y, w, 5);
      g.fillRect(x, y + h - 5, w, 5);
      // sketch
      g.lineStyle(2, 0x64748b, 0.6);
      g.beginPath();
      g.moveTo(x + 12, y + 50);
      g.lineTo(x + 40, y + 32);
      g.lineTo(x + 70, y + 44);
      g.lineTo(x + 105, y + 22);
      g.lineTo(x + 140, y + 35);
      g.lineTo(x + 170, y + 18);
      g.strokePath();
      // sticky notes
      g.fillStyle(0xfef08a, 0.8);
      g.fillRect(x + w - 50, y + 12, 26, 22);
      g.fillStyle(0x86efac, 0.8);
      g.fillRect(x + w - 50, y + 38, 26, 22);
      g.fillStyle(0xfca5a5, 0.8);
      g.fillRect(x + w - 22, y + 12, 16, 22);
    };

    const ringLight = (x, y, r = 17) => {
      g.lineStyle(5, 0xfef3c7, 0.75);
      g.strokeCircle(x, y, r);
      g.fillStyle(0xfef9c3, 0.18);
      g.fillCircle(x, y, r - 3);
    };

    const tripod = (x, y, len = 38) => {
      g.lineStyle(2, 0x475569, 1);
      g.lineBetween(x, y - len, x - 13, y);
      g.lineBetween(x, y - len, x + 13, y);
      g.lineBetween(x, y - len, x, y);
      g.fillStyle(0x1e293b, 1);
      g.fillRect(x - 9, y - len - 8, 18, 12);
      g.fillStyle(0x334155, 1);
      g.fillCircle(x - 4, y - len - 2, 5);
    };

    const waterCooler = (x, y) => {
      g.fillStyle(0x7dd3fc, 0.45);
      g.fillRect(x - 7, y - 28, 14, 20);
      g.fillStyle(0xe2e8f0, 1);
      g.fillRect(x - 11, y - 8, 22, 28);
      g.fillStyle(0x3b82f6, 0.35);
      g.fillRect(x - 7, y + 2, 7, 8);
      g.lineStyle(1, 0x94a3b8, 0.8);
      g.strokeRect(x - 11, y - 8, 22, 28);
    };

    const receptionDesk = (x, y, w = 230, h = 60) => {
      g.fillStyle(0x3d2510, 1);
      g.fillRect(x, y, w, h);
      g.fillStyle(0x52301a, 1);
      g.fillRect(x + 2, y + 2, w - 4, 9);
      // curved front accent
      g.lineStyle(2, 0x7c5224, 1);
      g.strokeRect(x, y, w, h);
      g.lineStyle(1, 0x7c5224, 0.4);
      g.lineBetween(x + 10, y + h - 4, x + w - 10, y + h - 4);
    };

    const tvScreen = (x, y, w = 220, h = 50) => {
      g.fillStyle(0x0a0f1a, 1);
      g.fillRect(x, y, w, h);
      g.fillStyle(0x0d2040, 1);
      g.fillRect(x + 3, y + 3, w - 6, h - 6);
      g.lineStyle(2, 0x1e3a5f, 1);
      g.strokeRect(x, y, w, h);
      // content on screen
      g.lineStyle(1, 0x2563eb, 0.3);
      g.lineBetween(x + 10, y + 15, x + w / 2 - 5, y + 15);
      g.lineBetween(x + 10, y + 22, x + w / 2 - 5, y + 22);
      g.lineBetween(x + 10, y + 29, x + w / 2 - 20, y + 29);
    };

    const acousticPanel = (x, y, w = 42, h = 28) => {
      g.fillStyle(0x1a1a3a, 1);
      g.fillRect(x, y, w, h);
      g.lineStyle(1, 0x6366f1, 0.25);
      g.strokeRect(x, y, w, h);
      // diamond pattern
      g.lineStyle(1, 0x4f4faa, 0.2);
      g.lineBetween(x, y + h / 2, x + w / 2, y);
      g.lineBetween(x + w / 2, y, x + w, y + h / 2);
      g.lineBetween(x + w, y + h / 2, x + w / 2, y + h);
      g.lineBetween(x + w / 2, y + h, x, y + h / 2);
    };

    const wallChart = (x, y, w = 255, h = 80) => {
      g.fillStyle(0x0d1f08, 1);
      g.fillRect(x, y, w, h);
      g.lineStyle(2, 0x84cc16, 0.5);
      g.strokeRect(x, y, w, h);
      // y-axis
      g.lineStyle(1, 0x4d7c0f, 0.6);
      g.lineBetween(x + 14, y + 10, x + 14, y + h - 10);
      g.lineBetween(x + 14, y + h - 10, x + w - 10, y + h - 10);
      // chart line
      g.lineStyle(2, 0x4ade80, 0.9);
      g.beginPath();
      g.moveTo(x + 18, y + 65);
      g.lineTo(x + 45, y + 52);
      g.lineTo(x + 75, y + 60);
      g.lineTo(x + 105, y + 38);
      g.lineTo(x + 135, y + 45);
      g.lineTo(x + 165, y + 25);
      g.lineTo(x + 195, y + 30);
      g.lineTo(x + 240, y + 14);
      g.strokePath();
    };

    // ── CONTENT CREATION ROOM (80, 80) 500×420 ────────────────────────────

    // Acoustic wall panels (top wall)
    for (let ax = 100; ax < 565; ax += 58) acousticPanel(ax, 87, 42, 26);

    // Station 1 — left
    desk(108, 158, 155, 50);
    monitor(114, 132, 38, 24);
    monitor(162, 132, 38, 24);
    chair(118, 215, 28, 28);
    chair(156, 215, 28, 28);
    ringLight(228, 148);
    tripod(245, 308, 42);

    // Station 2 — right
    desk(400, 158, 155, 50);
    monitor(406, 132, 38, 24);
    monitor(454, 132, 38, 24);
    chair(410, 215, 28, 28);
    chair(448, 215, 28, 28);
    ringLight(510, 148);

    // Center recording desk
    desk(210, 380, 185, 50);
    monitor(216, 354, 38, 24);
    monitor(266, 354, 38, 24);
    monitor(316, 354, 38, 24);
    chair(220, 437, 28, 28);
    chair(260, 437, 28, 28);
    chair(300, 437, 28, 28);
    ringLight(340, 285, 20);

    // Plants
    tallPlant(100, 456);
    tallPlant(540, 456);
    plant(96, 468, 15);
    plant(546, 468, 15);

    // ── CODING ROOM (720, 80) 500×420 ─────────────────────────────────────

    // Whiteboard back wall
    whiteboard(734, 88, 195, 76);

    // Bookshelves right wall
    shelf(1138, 110, 62, 18);
    shelf(1138, 136, 62, 18);
    shelf(1138, 162, 62, 18);

    // Workstation row 1
    desk(742, 188, 175, 50);
    wideMonitor(748, 162);
    wideMonitor(800, 162);
    chair(752, 245, 28, 28);
    chair(792, 245, 28, 28);
    chair(832, 245, 28, 28);

    desk(960, 188, 175, 50);
    wideMonitor(966, 162);
    wideMonitor(1018, 162);
    chair(970, 245, 28, 28);
    chair(1010, 245, 28, 28);
    chair(1050, 245, 28, 28);

    // Workstation row 2
    desk(742, 370, 175, 50);
    wideMonitor(748, 344);
    wideMonitor(800, 344);
    chair(752, 427, 28, 28);
    chair(792, 427, 28, 28);
    chair(832, 427, 28, 28);

    desk(960, 370, 175, 50);
    wideMonitor(966, 344);
    wideMonitor(1018, 344);
    chair(970, 427, 28, 28);
    chair(1010, 427, 28, 28);
    chair(1050, 427, 28, 28);

    // Plants
    tallPlant(730, 460);
    tallPlant(1192, 458);
    plant(726, 470, 14);
    plant(1196, 470, 14);

    // ── FOCUS ROOM (80, 760) 500×420 ──────────────────────────────────────

    // Pod dividers
    g.lineStyle(2, 0x4c1d95, 0.45);
    g.lineBetween(330, 772, 330, 1168);
    g.lineBetween(88, 968, 572, 968);

    // Pod 1 — top left
    desk(108, 800, 175, 48);
    monitor(114, 774, 36, 24);
    monitor(158, 774, 36, 24);
    chair(118, 855, 28, 28);
    chair(158, 855, 28, 28);

    // Pod 2 — top right
    desk(348, 800, 175, 48);
    monitor(354, 774, 36, 24);
    monitor(398, 774, 36, 24);
    chair(358, 855, 28, 28);
    chair(398, 855, 28, 28);

    // Pod 3 — bottom left
    desk(108, 990, 175, 48);
    monitor(114, 964, 36, 24);
    monitor(158, 964, 36, 24);
    chair(118, 1045, 28, 28);
    chair(158, 1045, 28, 28);

    // Pod 4 — bottom right
    desk(348, 990, 175, 48);
    monitor(354, 964, 36, 24);
    monitor(398, 964, 36, 24);
    chair(358, 1045, 28, 28);
    chair(398, 1045, 28, 28);

    // Corner plants
    plant(92, 1148, 14);
    plant(548, 1148, 14);
    plant(92, 775, 14);
    plant(548, 775, 14);

    // ── TRADING ROOM (720, 760) 500×420 ───────────────────────────────────

    // Wall chart
    wallChart(730, 768, 255, 80);

    // Trading station 1
    desk(738, 872, 200, 52);
    monitor(744, 846, 32, 22);
    monitor(780, 846, 32, 22);
    monitor(816, 846, 32, 22);
    monitor(852, 846, 32, 22);
    chair(748, 931, 26, 26);
    chair(782, 931, 26, 26);
    chair(816, 931, 26, 26);
    chair(850, 931, 26, 26);

    // Trading station 2
    desk(960, 872, 200, 52);
    monitor(966, 846, 32, 22);
    monitor(1002, 846, 32, 22);
    monitor(1038, 846, 32, 22);
    monitor(1074, 846, 32, 22);
    chair(970, 931, 26, 26);
    chair(1004, 931, 26, 26);
    chair(1038, 931, 26, 26);
    chair(1072, 931, 26, 26);

    // Trading station 3 (bottom)
    desk(838, 1062, 225, 52);
    monitor(844, 1036, 32, 22);
    monitor(880, 1036, 32, 22);
    monitor(916, 1036, 32, 22);
    monitor(952, 1036, 32, 22);
    chair(848, 1121, 26, 26);
    chair(882, 1121, 26, 26);
    chair(916, 1121, 26, 26);
    chair(950, 1121, 26, 26);

    // Plants
    tallPlant(730, 1156);
    plant(726, 1164, 14);
    tallPlant(1192, 1156);
    plant(1196, 1164, 14);

    // ── NO CAM ROOM (1380, 420) 460×420 ───────────────────────────────────

    // TV / screen on back wall
    tvScreen(1490, 427, 220, 48);

    // Rug
    rug(1405, 488, 360, 288, 0x7c2d12);

    // L-shaped sofa cluster
    sofa(1398, 506, 210, 46, 0x1c3560);
    sofa(1398, 552, 46, 130, 0x1c3560);

    // Facing sofa
    sofa(1605, 506, 175, 46, 0x2d1f6b);

    // Coffee table
    coffeeTable(1510, 600, 110, 55);

    // Bean bags
    g.fillStyle(0x6d28d9, 0.85);
    g.fillCircle(1432, 718, 22);
    g.fillStyle(0x5b21b6, 1);
    g.fillCircle(1432, 718, 16);
    g.fillStyle(0x1d4ed8, 0.85);
    g.fillCircle(1750, 700, 22);
    g.fillStyle(0x1e40af, 1);
    g.fillCircle(1750, 700, 16);

    // Corner plants
    tallPlant(1394, 820);
    tallPlant(1822, 818);
    plant(1390, 828, 16);
    plant(1826, 826, 16);

    // ── LOBBY / HALLWAY ───────────────────────────────────────────────────

    // Reception desk — center
    receptionDesk(812, 588, 235, 58);
    monitor(858, 562, 42, 28);
    monitor(912, 562, 42, 28);
    chair(882, 654, 38, 34);

    // Left corridor lounge (x=580–720)
    sofa(592, 548, 110, 40, 0x1a2537);
    sofa(592, 670, 110, 40, 0x1a2537);
    coffeeTable(618, 594, 60, 70);
    waterCooler(695, 530);

    // Right corridor lounge (x=1220–1380)
    sofa(1234, 548, 110, 40, 0x1a2537);
    sofa(1234, 670, 110, 40, 0x1a2537);
    coffeeTable(1258, 594, 60, 70);
    waterCooler(1232, 530);

    // Lobby tall plants (corridor corners)
    tallPlant(596, 538);
    tallPlant(606, 724);
    tallPlant(1368, 538);
    tallPlant(1358, 724);

    plant(592, 545, 14);
    plant(602, 730, 14);
    plant(1364, 545, 14);
    plant(1354, 730, 14);

    // Far right corridor plants
    tallPlant(1880, 240);
    tallPlant(1880, 1060);
    plant(1878, 248, 14);
    plant(1878, 1068, 14);

    // Top / bottom edge plants
    tallPlant(336, 28);
    tallPlant(336, 1254);
    plant(332, 35, 12);
    plant(332, 1260, 12);

    // ── ROOM BORDERS + LABELS (drawn on top of furniture) ─────────────────
    ROOMS.forEach((room) => {
      g.lineStyle(2, room.borderColor, 0.85);
      g.strokeRect(room.x, room.y, room.width, room.height);

      // Corner accent squares
      const corners = [
        [room.x, room.y],
        [room.x + room.width, room.y],
        [room.x, room.y + room.height],
        [room.x + room.width, room.y + room.height],
      ];
      g.fillStyle(room.borderColor, 1);
      corners.forEach(([cx, cy]) => g.fillRect(cx - 4, cy - 4, 8, 8));

      // Room label
      this.add.text(room.x + room.width / 2, room.y + 20, room.label, {
        fontSize: '16px',
        color: room.labelColor,
        fontFamily: 'monospace',
        fontStyle: 'bold',
      }).setOrigin(0.5, 0);

      // Badges
      const badges = [];
      if (room.requireCamera) badges.push('📷 cam required');
      if (room.muteAudio)     badges.push('🔇 mic off');
      badges.forEach((badge, i) => {
        this.add.text(
          room.x + room.width / 2,
          room.y + room.height - 10 - i * 18,
          badge,
          { fontSize: '10px', color: '#475569', fontFamily: 'monospace' }
        ).setOrigin(0.5, 1);
      });
    });

    // Lobby label
    this.add.text(980, 635, 'L O B B Y', {
      fontSize: '11px',
      color: '#1c1c28',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      letterSpacing: 10,
    }).setOrigin(0.5);

    // Map outer wall
    g.lineStyle(4, 0x2a2a38, 1);
    g.strokeRect(2, 2, MAP_WIDTH - 4, MAP_HEIGHT - 4);
  }

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

    const nx = Phaser.Math.Clamp(this.px + vx * dt, PLAYER_RADIUS, MAP_WIDTH  - PLAYER_RADIUS);
    const ny = Phaser.Math.Clamp(this.py + vy * dt, PLAYER_RADIUS, MAP_HEIGHT - PLAYER_RADIUS);

    const nextRoom = getRoomAtPoint(nx, ny);
    if (nextRoom?.requireCamera && !gameStore.hasCamera) {
      const currentlyInside = getRoomAtPoint(this.px, this.py)?.id === nextRoom.id;
      if (!currentlyInside) {
        gameStore.onRoomBlocked?.(nextRoom.id);
        return;
      }
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
    if (sp) sp.room = room;
  }

  nudgeOutOfRoom() {
    this.px = MAP_WIDTH / 2;
    this.py = MAP_HEIGHT / 2;
    this._anchor.setPosition(this.px, this.py);
  }
}
