/**
 * player.js - Player state, movement, bearings, timer
 * WLD FoxWave ARDF
 */
"use strict";

const Player = {
    x: CONFIG.PLAYER_START_X,
    y: CONFIG.PLAYER_START_Y,
    facing: 180,               // degrees, 0=North
    receiverBearing: 0,

    foundFoxes: new Set(),
    bearingLines: [],
    _bearingLineIdCounter: 0,

    keysHeld: { up:false, down:false, left:false, right:false },
    _lastMoveTime: 0,

    name: '',
    foxCount: 5,               // 3 or 5, chosen at registration

    gameStartTime: null,
    gameEndTime:   null,
    bearingInput:  '',

    // ON4BB hint
    lastHintTime: 0,
    hintVisible: false,
    hintText: '',
    hintTimer: 0,

    reset() {
        this.x = CONFIG.PLAYER_START_X;
        this.y = CONFIG.PLAYER_START_Y;
        this.facing          = 180;
        this.receiverBearing = 0;
        this.foundFoxes      = new Set();
        this.bearingLines    = [];
        this._bearingLineIdCounter = 0;
        this.keysHeld        = { up:false, down:false, left:false, right:false };
        this._lastMoveTime   = 0;
        this.gameStartTime   = null;
        this.gameEndTime     = null;
        this.bearingInput    = '';
        this.lastHintTime    = 0;
        this.hintVisible     = false;
        this.hintText        = '';
        this.hintTimer       = 0;
    },

    tryMove(dir, now) {
        if (now - this._lastMoveTime < CONFIG.PLAYER_MOVE_DELAY) return false;
        let nx = this.x, ny = this.y;
        switch (dir) {
            case 'up':    ny -= 1; this.facing =   0; break;
            case 'down':  ny += 1; this.facing = 180; break;
            case 'left':  nx -= 1; this.facing = 270; break;
            case 'right': nx += 1; this.facing =  90; break;
        }
        if (!isWalkable(nx, ny)) return false;
        this.x = nx; this.y = ny;
        this._lastMoveTime = now;
        return true;
    },

    rotateReceiver(delta) {
        this.receiverBearing = ((this.receiverBearing + delta) % 360 + 360) % 360;
    },

    findFox(code) { this.foundFoxes.add(code); },

    addBearingLine(bearing) {
        const ci = this.bearingLines.length % CONFIG.BEARING_COLORS.length;
        this.bearingLines.push({
            fromX: this.x, fromY: this.y,
            bearing: ((bearing % 360) + 360) % 360,
            color: CONFIG.BEARING_COLORS[ci],
            id: ++this._bearingLineIdCounter,
        });
    },

    removeBearingLine(id) {
        this.bearingLines = this.bearingLines.filter(l => l.id !== id);
    },

    startTimer() { this.gameStartTime = Date.now(); },
    stopTimer()  { this.gameEndTime   = Date.now(); },

    getElapsedString() {
        if (!this.gameStartTime) return '00:00';
        const s = Math.floor(((this.gameEndTime || Date.now()) - this.gameStartTime) / 1000);
        return String(Math.floor(s/60)).padStart(2,'0') + ':' + String(s%60).padStart(2,'0');
    },
    getElapsedSeconds() {
        if (!this.gameStartTime) return 0;
        return Math.floor(((this.gameEndTime || Date.now()) - this.gameStartTime) / 1000);
    },

    get allFoxesFound() { return this.foundFoxes.size >= CONFIG.FOX_COUNT; },
    get atStart()       {
        return Math.abs(this.x - CONFIG.PLAYER_START_X) <= 1.5 &&
               Math.abs(this.y - CONFIG.PLAYER_START_Y) <= 1.5;
    },
};
