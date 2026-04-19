/**
 * gameStore — shared mutable singleton for real-time game state.
 *
 * Phaser WRITES to this every frame.
 * React's VideoOverlay READS from this every rAF tick.
 * Keeping it outside React state avoids constant reconciliation.
 */
export const gameStore = {
  // Set once after joining
  localPlayerId: null,
  hasCamera: false,

  // Updated every Phaser frame
  camera: { scrollX: 0, scrollY: 0, zoom: 1 },

  /**
   * players[id] = { id, username, status, room, hasCamera, x, y }
   * x/y are world coordinates updated every frame for local player
   * and interpolated for remote players.
   */
  players: {},

  // Callbacks set by WorkspaceApp
  emitMove: null,        // (x, y) => void
  onRoomChange: null,    // (roomId | null) => void
  onRoomBlocked: null,   // (roomId) => void  — tried to enter camera-required without cam
};
