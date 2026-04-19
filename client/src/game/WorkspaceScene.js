import Phaser from 'phaser';
import {
  MAP_WIDTH, MAP_HEIGHT, PLAYER_SPEED, PLAYER_RADIUS,
  ROOMS, getRoomAtPoint,
} from '../constants/rooms.js';
import { gameStore } from '../store/gameStore.js';

export class WorkspaceScene extends Phaser.Scene {
  constructor() {
    super({ key: 'WorkspaceScene' });

    // Local player world position
    this.px = MAP_WIDTH / 2;
    this.py = MAP_HEIGHT / 2;

    // Movement state
    this.lastEmitX = 0;
    this.lastEmitY = 0;
    this.emitTimer = 0;

    // Room state
    this.currentRoomId = null;
    this.lastValidX = MAP_WIDTH / 2;
    this.lastValidY = MAP_HEIGHT / 2;

    // Remote players: { [id]: { x, y, targetX, targetY, container, labelText, statusText } }
    this.remote = {};
  }

  // ─── LIFECYCLE ────────────────────────────────────────────────────────────

  preload() {
    // No external assets — everything is drawn with graphics primitives
  }

  create() {
    this.px = MAP_WIDTH / 2;
    this.py = MAP_HEIGHT / 2;
    this.lastValidX = this.px;
    this.lastValidY = this.py;

    this._drawMap();
    this._setupCamera();
    this._setupInput();

    // Init local player position in store
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
    const gfx = this.add.graphics();

    // Background
    gfx.fillStyle(0x0a0a0f, 1);
    gfx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

    // Floor grid
    gfx.lineStyle(1, 0x1c1c28, 1);
    for (let x = 0; x <= MAP_WIDTH; x += 48) {
      gfx.lineBetween(x, 0, x, MAP_HEIGHT);
    }
    for (let y = 0; y <= MAP_HEIGHT; y += 48) {
      gfx.lineBetween(0, y, MAP_WIDTH, y);
    }

    // Hallway label
    this.add.text(MAP_WIDTH / 2, MAP_HEIGHT / 2, 'LOBBY  /  HALLWAY', {
      fontSize: '13px',
      color: '#2a2a3a',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      letterSpacing: 6,
    }).setOrigin(0.5);

    // Rooms
    ROOMS.forEach((room) => {
      // Room fill
      gfx.fillStyle(room.bgColor, 1);
      gfx.fillRect(room.x, room.y, room.width, room.height);

      // Room border (3 px)
      gfx.lineStyle(3, room.borderColor, 0.9);
      gfx.strokeRect(room.x, room.y, room.width, room.height);

      // Corner accent dots
      const corners = [
        [room.x, room.y],
        [room.x + room.width, room.y],
        [room.x, room.y + room.height],
        [room.x + room.width, room.y + room.height],
      ];
      gfx.fillStyle(room.borderColor, 1);
      corners.forEach(([cx, cy]) => gfx.fillRect(cx - 3, cy - 3, 6, 6));

      // Room label
      this.add.text(room.x + room.width / 2, room.y + 22, room.label, {
        fontSize: '17px',
        color: room.labelColor,
        fontFamily: 'monospace',
        fontStyle: 'bold',
      }).setOrigin(0.5, 0);

      // Badges
      const badges = [];
      if (room.requireCamera) badges.push('📷 Camera required');
      if (room.muteAudio)     badges.push('🔇 Mic disabled');
      badges.forEach((badge, i) => {
        this.add.text(
          room.x + room.width / 2,
          room.y + room.height - 14 - i * 20,
          badge,
          { fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }
        ).setOrigin(0.5, 1);
      });
    });

    // Map outer wall
    gfx.lineStyle(4, 0x2d2d3a, 1);
    gfx.strokeRect(2, 2, MAP_WIDTH - 4, MAP_HEIGHT - 4);
  }

  _setupCamera() {
    // Camera follows a tiny invisible anchor we update manually
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

    // Diagonal normalisation
    if (vx !== 0 && vy !== 0) { vx *= 0.7071; vy *= 0.7071; }

    const nx = Phaser.Math.Clamp(this.px + vx * dt, PLAYER_RADIUS, MAP_WIDTH  - PLAYER_RADIUS);
    const ny = Phaser.Math.Clamp(this.py + vy * dt, PLAYER_RADIUS, MAP_HEIGHT - PLAYER_RADIUS);

    // Block entry into camera-required rooms when player has no camera
    const nextRoom = getRoomAtPoint(nx, ny);
    if (nextRoom?.requireCamera && !gameStore.hasCamera) {
      // Allow movement if we're already inside (shouldn't happen; belt & braces)
      const currentlyInside = getRoomAtPoint(this.px, this.py)?.id === nextRoom.id;
      if (!currentlyInside) {
        gameStore.onRoomBlocked?.(nextRoom.id);
        return; // Don't apply movement
      }
    }

    this.px = nx;
    this.py = ny;
    this._anchor.setPosition(this.px, this.py);

    // Update store
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

      // Update store so VideoOverlay can position the avatar
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
    if (this.emitTimer < 50) return; // 20 fps cap
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

  // ─── PUBLIC API (called from WorkspaceApp) ────────────────────────────────

  addRemotePlayer(id, data) {
    if (this.remote[id]) return;

    const rp = {
      id,
      x: data.x,
      y: data.y,
      targetX: data.x,
      targetY: data.y,
    };
    this.remote[id] = rp;

    // Store snapshot for VideoOverlay
    gameStore.players[id] = { ...data, x: data.x, y: data.y };
  }

  moveRemotePlayer(id, x, y) {
    const rp = this.remote[id];
    if (rp) { rp.targetX = x; rp.targetY = y; }
    const sp = gameStore.players[id];
    if (sp) { sp.x = x; sp.y = y; } // direct for VideoOverlay (interpolation writes back)
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

  // Teleport local player to lobby center (used on room block)
  nudgeOutOfRoom() {
    this.px = MAP_WIDTH / 2;
    this.py = MAP_HEIGHT / 2;
    this._anchor.setPosition(this.px, this.py);
  }
}
