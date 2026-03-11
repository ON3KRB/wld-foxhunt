/**
 * player.js - Player entity: position, direction, state and movement
 * WLD FoxWave ARDF
 */

"use strict";

const Player = {
    // ─── Position ─────────────────────────────────────────────────────────────
    /** Current tile X (can be fractional for smooth animation) */
    x: CONFIG.PLAYER_START_X,
    /** Current tile Y (can be fractional for smooth animation) */
    y: CONFIG.PLAYER_START_Y,

    // ─── Facing direction for the avatar (degrees, 0 = north) ─────────────────
    facing: 180,   // starts facing south (toward tent)

    // ─── Receiver ─────────────────────────────────────────────────────────────
    /** Compass bearing the receiver antenna is pointing (degrees, 0 = north) */
    receiverBearing: 0,

    // ─── Found foxes ──────────────────────────────────────────────────────────
    /** Set of fox codes that have been found, e.g. { 'MOE', 'MOS' } */
    foundFoxes: new Set(),

    // ─── Bearing lines drawn on the map ───────────────────────────────────────
    /**
     * Array of bearing line objects:
     * { fromX, fromY, bearing, color, id }
     */
    bearingLines: [],
    _bearingLineIdCounter: 0,

    // ─── Input state ──────────────────────────────────────────────────────────
    /** Which direction keys are currently held */
    keysHeld: { up: false, down: false, left: false, right: false, strafeL: false, strafeR: false },

    /** Timestamp of last movement step */
    _lastMoveTime: 0,

    // ─── Name (set during registration) ───────────────────────────────────────
    name: '',

    // ─── Timers ───────────────────────────────────────────────────────────────
    gameStartTime: null,
    gameEndTime:   null,

    // ─── Bearing input buffer (for map mode) ──────────────────────────────────
    bearingInput: '',

    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Reset to initial state for a new game.
     */
    reset() {
        this.x = CONFIG.PLAYER_START_X;
        this.y = CONFIG.PLAYER_START_Y;
        this.facing          = 180;
        this.receiverBearing = 0;
        this.foundFoxes      = new Set();
        this.bearingLines    = [];
        this._bearingLineIdCounter = 0;
        this.keysHeld        = { up: false, down: false, left: false, right: false, strafeL: false, strafeR: false };
        this._lastMoveTime   = 0;
        this.gameStartTime   = null;
        this.gameEndTime     = null;
        this.bearingInput    = '';
    },

    /**
     * Try to move the player one tile in the given direction.
     * Movement is throttled by PLAYER_MOVE_DELAY.
     * @param {'up'|'down'|'left'|'right'} dir
     * @param {number} now  performance.now()
     * @returns {boolean} true if move succeeded
     */
    tryMove(dir, now) {
        if (now - this._lastMoveTime < CONFIG.PLAYER_MOVE_DELAY) return false;

        let nx = this.x;
        let ny = this.y;

        switch (dir) {
            case 'up':    ny -= 1; this.facing =   0; break;
            case 'down':  ny += 1; this.facing = 180; break;
            case 'left':  nx -= 1; this.facing = 270; break;
            case 'right': nx += 1; this.facing =  90; break;
        }

        if (!isWalkable(nx, ny)) return false;

        this.x = nx;
        this.y = ny;
        this._lastMoveTime = now;
        return true;
    },

    /**
     * Rotate the receiver antenna bearing.
     * @param {number} deltaDeg  positive = clockwise
     */
    rotateReceiver(deltaDeg) {
        this.receiverBearing = ((this.receiverBearing + deltaDeg) % 360 + 360) % 360;
    },

    /**
     * Mark a fox as found.
     * @param {string} code  fox code e.g. 'MOE'
     */
    findFox(code) {
        this.foundFoxes.add(code);
    },

    /**
     * Add a bearing line from current position.
     * @param {number} bearing  degrees 0–360
     */
    addBearingLine(bearing) {
        const colorIndex = this.bearingLines.length % CONFIG.BEARING_COLORS.length;
        this.bearingLines.push({
            fromX:   this.x,
            fromY:   this.y,
            bearing: ((bearing % 360) + 360) % 360,
            color:   CONFIG.BEARING_COLORS[colorIndex],
            id:      ++this._bearingLineIdCounter,
        });
    },

    /**
     * Remove a bearing line by its ID.
     * @param {number} id
     */
    removeBearingLine(id) {
        this.bearingLines = this.bearingLines.filter(l => l.id !== id);
    },

    /** Start the game timer. */
    startTimer() {
        this.gameStartTime = Date.now();
    },

    /** Stop the game timer. */
    stopTimer() {
        this.gameEndTime = Date.now();
    },

    /**
     * Get elapsed time string "MM:SS" from start until now (or end).
     * @returns {string}
     */
    getElapsedString() {
        if (!this.gameStartTime) return '00:00';
        const end     = this.gameEndTime || Date.now();
        const elapsed = Math.floor((end - this.gameStartTime) / 1000);
        const mm      = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const ss      = String(elapsed % 60).padStart(2, '0');
        return `${mm}:${ss}`;
    },

    /**
     * Get elapsed seconds.
     * @returns {number}
     */
    getElapsedSeconds() {
        if (!this.gameStartTime) return 0;
        const end = this.gameEndTime || Date.now();
        return Math.floor((end - this.gameStartTime) / 1000);
    },

    /** True if all 5 foxes have been found. */
    get allFoxesFound() {
        return this.foundFoxes.size >= CONFIG.FOX_COUNT;
    },

    /** True if player is at the start/finish position. */
    get atStart() {
        return Math.abs(this.x - CONFIG.PLAYER_START_X) <= 1.5
            && Math.abs(this.y - CONFIG.PLAYER_START_Y) <= 1.5;
    },
};

// ═══════════════════════════════════════════════════════════════════════════
// 3D RAYCASTING EXTENSIONS
// ═══════════════════════════════════════════════════════════════════════════

Object.assign(Player, {

    /** First-person view angle (degrees, 0=North, 90=East, clockwise) */
    viewAngle: 0,

    /**
     * Move forward (+) or backward (-) in view direction with collision.
     * Separates X/Y so player slides along walls.
     * @param {number} dist  tiles (positive = forward)
     */
    moveForward(dist) {
        const rad = this.viewAngle * Math.PI / 180;
        const dx  = Math.sin(rad) * dist;
        const dy  = -Math.cos(rad) * dist;
        const r   = RC.COLLISION_R;

        // X component
        if (!isSolid3D(this.x + dx + Math.sign(dx) * r, this.y)) this.x += dx;
        // Y component
        if (!isSolid3D(this.x, this.y + dy + Math.sign(dy) * r)) this.y += dy;

        // Clamp to world bounds
        this.x = Math.max(0.5, Math.min(CONFIG.WORLD_WIDTH  - 0.5, this.x));
        this.y = Math.max(0.5, Math.min(CONFIG.WORLD_HEIGHT - 0.5, this.y));
    },

    /**
     * Strafe left (-) or right (+) perpendicular to view direction.
     * @param {number} dist  tiles
     */
    strafe(dist) {
        const rad = (this.viewAngle + 90) * Math.PI / 180;
        const dx  = Math.sin(rad) * dist;
        const dy  = -Math.cos(rad) * dist;
        const r   = RC.COLLISION_R;

        if (!isSolid3D(this.x + dx + Math.sign(dx) * r, this.y)) this.x += dx;
        if (!isSolid3D(this.x, this.y + dy + Math.sign(dy) * r)) this.y += dy;
    },

    /**
     * Rotate the view left (-) or right (+).
     * @param {number} deltaDeg
     */
    rotateView(deltaDeg) {
        this.viewAngle = ((this.viewAngle + deltaDeg) % 360 + 360) % 360;
        this.facing    = this.viewAngle; // keep 2D facing in sync
    },

    /** Reset also resets 3D angle */
    reset3D() {
        this.viewAngle = 0;  // face north into park
    },
});
