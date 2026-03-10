/**
 * main.js - Game entry point, loop, state machine and input handler
 * WLD FoxWave ARDF
 *
 * Initialises all subsystems, drives the requestAnimationFrame loop,
 * routes keyboard input to the correct handler per game state, and
 * manages state transitions.
 */

"use strict";

// ─── Canvas references ────────────────────────────────────────────────────────
let mainCanvas, mainCtx;     // left 70% — park view
let rightTopCanvas, rtCtx;   // right-top — map or compass
let rightBotCanvas, rbCtx;   // right-bottom — info panel

// ─── Game state ───────────────────────────────────────────────────────────────
let gameState = STATE.SPLASH;
let lastFoxFoundTime = 0;
let animFrameId = null;

// ─── Initialisation ───────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', () => {
    _setupCanvases();
    _setupOverlays();
    _setupKeyboard();

    buildParkMap();
    loadRendererAssets(() => console.log('[Assets] Loaded'));

    showSplash();
    gameState = STATE.SPLASH;

    _startLoop();
});

function _setupCanvases() {
    mainCanvas     = document.getElementById('canvas-main');
    rightTopCanvas = document.getElementById('canvas-right-top');
    rightBotCanvas = document.getElementById('canvas-right-bot');

    mainCtx = mainCanvas.getContext('2d');
    rtCtx   = rightTopCanvas.getContext('2d');
    rbCtx   = rightBotCanvas.getContext('2d');

    _resizeCanvases();
    window.addEventListener('resize', _resizeCanvases);
}

function _resizeCanvases() {
    const W = window.innerWidth;
    const H = window.innerHeight;

    mainCanvas.width  = Math.floor(W * 0.70);
    mainCanvas.height = H;

    rightTopCanvas.width  = Math.floor(W * 0.30);
    rightTopCanvas.height = Math.floor(H * 0.65);

    rightBotCanvas.width  = Math.floor(W * 0.30);
    rightBotCanvas.height = Math.floor(H * 0.35);
}

// ─── Overlay wiring ───────────────────────────────────────────────────────────

function _setupOverlays() {
    // Splash — Start button
    document.getElementById('btn-start-game').addEventListener('click', () => {
        hideSplash();
        showRegistration();
        gameState = STATE.REGISTRATION;
    });

    // Registration — confirm
    document.getElementById('btn-register').addEventListener('click', () => {
        const nameEl = document.getElementById('input-name');
        const cs     = document.getElementById('input-callsign');
        Player.name  = (nameEl.value.trim() || 'Hunter') +
                       (cs.value.trim() ? ` (${cs.value.trim().toUpperCase()})` : '');
        hideRegistration();
        _initNewGame();
        showBriefing();
        gameState = STATE.BRIEFING;
    });

    // Also allow Enter key in registration inputs
    ['input-name', 'input-callsign'].forEach(id => {
        document.getElementById(id).addEventListener('keydown', e => {
            if (e.key === 'Enter') document.getElementById('btn-register').click();
        });
    });

    // Briefing — Start Hunting
    document.getElementById('btn-hunt').addEventListener('click', () => {
        _startHunting();
    });

    // Certificate download
    document.getElementById('btn-download-cert').addEventListener('click', downloadCertificate);
    document.getElementById('btn-play-again').addEventListener('click', () => {
        document.getElementById('overlay-certificate').classList.add('hidden');
        document.getElementById('overlay-finished').classList.add('hidden');
        showSplash();
        gameState = STATE.SPLASH;
    });

    // Map panel click (for bearing line delete)
    rightTopCanvas.addEventListener('click', (e) => {
        if (gameState === STATE.MAP_VIEW) {
            handleMapPanelClick(e, rightTopCanvas.width, rightTopCanvas.height);
        }
    });
}

// ─── Game lifecycle ───────────────────────────────────────────────────────────

function _initNewGame() {
    Player.reset();
    placeBeacons();
    console.log('[Game] Initialised. Beacons:', getBeacons().map(b => b.code + '@' + b.x + ',' + b.y));
}

function _startHunting() {
    hideBriefing();
    if (!Player.gameStartTime) Player.startTimer();
    audioEngine.init();
    gameState = STATE.HUNTING;
}

// ─── Main loop ────────────────────────────────────────────────────────────────

function _startLoop() {
    const loop = (timestamp) => {
        _update(timestamp);
        _render(timestamp);
        animFrameId = requestAnimationFrame(loop);
    };
    animFrameId = requestAnimationFrame(loop);
}

function _update(timestamp) {
    if (gameState === STATE.HUNTING) {
        _handleMovement(timestamp);
        _checkFoxDetection();
        _checkFinish();
    }

    if (gameState === STATE.RECEIVER) {
        _updateAudio();
        _checkFoxDetection();
    }
}

function _render(timestamp) {
    // Always render main park view (except on overlay-only screens)
    if (gameState !== STATE.SPLASH && gameState !== STATE.REGISTRATION) {
        renderMainView(mainCtx, mainCanvas.width, mainCanvas.height, timestamp, gameState);
    }

    // Right-top panel: compass or map
    if (gameState === STATE.RECEIVER) {
        drawReceiverPanel(rtCtx, rightTopCanvas.width, rightTopCanvas.height);
    } else if (gameState === STATE.MAP_VIEW) {
        drawMapPanel(rtCtx, rightTopCanvas.width, rightTopCanvas.height);
    } else if (gameState === STATE.HUNTING || gameState === STATE.BRIEFING) {
        // Default: show minimap
        drawMapPanel(rtCtx, rightTopCanvas.width, rightTopCanvas.height);
    }

    // Right-bottom panel
    if (gameState !== STATE.SPLASH && gameState !== STATE.REGISTRATION) {
        drawInfoPanel(rbCtx, rightBotCanvas.width, rightBotCanvas.height, gameState);
    }
}

// ─── Movement ─────────────────────────────────────────────────────────────────

function _handleMovement(timestamp) {
    const k = Player.keysHeld;
    let moved = false;
    if (k.up)    moved = Player.tryMove('up',    timestamp) || moved;
    if (k.down)  moved = Player.tryMove('down',  timestamp) || moved;
    if (k.left)  moved = Player.tryMove('left',  timestamp) || moved;
    if (k.right) moved = Player.tryMove('right', timestamp) || moved;
}

// ─── Audio update (receiver mode) ────────────────────────────────────────────

function _updateAudio() {
    const dominant = getDominantSignal(Player.x, Player.y, Player.receiverBearing);
    if (dominant && dominant.signal > 0.02) {
        if (audioEngine.isPlaying) {
            audioEngine.update(dominant.beacon.code, dominant.signal);
        } else {
            audioEngine.play(dominant.beacon.code, dominant.signal);
        }
    } else {
        if (audioEngine.isPlaying) audioEngine.stop();
    }
}

// ─── Detection ────────────────────────────────────────────────────────────────

function _checkFoxDetection() {
    const now = Date.now();
    if (now - lastFoxFoundTime < 3000) return;  // debounce

    const found = checkFoxDetection(Player.x, Player.y);
    if (found) {
        lastFoxFoundTime = now;
        showFoxFoundFlash(found);
        console.log('[Game] Fox found:', found.code);
    }
}

function _checkFinish() {
    if (Player.allFoxesFound && Player.atStart && gameState === STATE.HUNTING) {
        _triggerFinish();
    }
}

function _triggerFinish() {
    Player.stopTimer();
    audioEngine.stop();
    gameState = STATE.FINISHED;
    setTimeout(() => {
        showCertificate();
        gameState = STATE.CERTIFICATE;
    }, 600);
    console.log('[Game] Finished! Time:', Player.getElapsedString());
}

// ─── Keyboard handling ────────────────────────────────────────────────────────

function _setupKeyboard() {
    document.addEventListener('keydown', _onKeyDown);
    document.addEventListener('keyup',   _onKeyUp);
}

function _onKeyDown(e) {
    // Prevent arrow scrolling the page
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
        e.preventDefault();
    }

    switch (gameState) {
        case STATE.BRIEFING:
            _handleBriefingKey(e.key);
            break;
        case STATE.HUNTING:
            _handleHuntingKey(e.key, true);
            break;
        case STATE.RECEIVER:
            _handleReceiverKey(e.key);
            break;
        case STATE.MAP_VIEW:
            _handleMapViewKey(e.key);
            break;
    }
}

function _onKeyUp(e) {
    const map = { ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right' };
    if (map[e.key]) Player.keysHeld[map[e.key]] = false;
}

function _handleBriefingKey(key) {
    switch (key.toUpperCase()) {
        case 'H': _startHunting(); break;
        case 'R': hideBriefing(); audioEngine.init(); gameState = STATE.RECEIVER; break;
        case 'M': hideBriefing(); gameState = STATE.MAP_VIEW; break;
    }
}

function _handleHuntingKey(key, down) {
    const dirMap = { ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right' };
    if (dirMap[key]) {
        Player.keysHeld[dirMap[key]] = down;
        return;
    }
    switch (key.toUpperCase()) {
        case 'R':
            audioEngine.init();
            gameState = STATE.RECEIVER;
            break;
        case 'M':
            gameState = STATE.MAP_VIEW;
            break;
    }
}

function _handleReceiverKey(key) {
    switch (key) {
        case 'ArrowLeft':  Player.rotateReceiver(-CONFIG.RECEIVER_ROTATE_STEP); break;
        case 'ArrowRight': Player.rotateReceiver(+CONFIG.RECEIVER_ROTATE_STEP); break;
        default:
            switch (key.toUpperCase()) {
                case 'R': audioEngine.stop(); gameState = STATE.HUNTING; break;
                case 'M': audioEngine.stop(); gameState = STATE.MAP_VIEW; break;
                case 'H': audioEngine.stop(); gameState = STATE.HUNTING; break;
            }
    }
}

function _handleMapViewKey(key) {
    if (key >= '0' && key <= '9') {
        if (Player.bearingInput.length < 3) {
            Player.bearingInput += key;
        }
        return;
    }
    switch (key) {
        case 'Backspace':
            Player.bearingInput = Player.bearingInput.slice(0, -1);
            break;
        case 'Enter': {
            const bearing = parseInt(Player.bearingInput, 10);
            if (!isNaN(bearing) && Player.bearingLines.length < 10) {
                Player.addBearingLine(bearing);
            }
            Player.bearingInput = '';
            break;
        }
        case 'M':
        case 'm':
        case 'H':
        case 'h':
            gameState = STATE.HUNTING;
            break;
        case 'R':
        case 'r':
            audioEngine.init();
            gameState = STATE.RECEIVER;
            break;
    }
}
