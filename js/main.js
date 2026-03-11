/**
 * main.js - Game entry point, loop, state machine and input handler
 * WLD FoxWave ARDF
 */

"use strict";

let mainCanvas, mainCtx;
let rightTopCanvas, rtCtx;
let rightBotCanvas, rbCtx;

let gameState        = STATE.SPLASH;
let lastFoxFoundTime = 0;
let animFrameId      = null;
let _allFoundShown   = false;
let _gameFinished    = false;

// ─── Boot ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
    _setupCanvases();
    _setupOverlays();
    _setupKeyboard();
    buildParkMap();
    loadRendererAssets(() => console.log('[Assets] Loaded'));
    showSplash();
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
    mainCanvas.width       = Math.floor(W * 0.70);
    mainCanvas.height      = H;
    rightTopCanvas.width   = Math.floor(W * 0.30);
    rightTopCanvas.height  = Math.floor(H * 0.65);
    rightBotCanvas.width   = Math.floor(W * 0.30);
    rightBotCanvas.height  = Math.floor(H * 0.35);
}

// ─── Overlay wiring ────────────────────────────────────────────────────────────
function _setupOverlays() {
    document.getElementById('btn-start-game').addEventListener('click', () => {
        hideSplash();
        showRegistration();
        gameState = STATE.REGISTRATION;
    });

    document.getElementById('btn-register').addEventListener('click', () => {
        const name = document.getElementById('input-name').value.trim() || 'Hunter';
        const cs   = document.getElementById('input-callsign').value.trim().toUpperCase();
        Player.name = name + (cs ? ` (${cs})` : '');
        hideRegistration();
        _initNewGame();
        showBriefing();
        gameState = STATE.BRIEFING;
    });

    ['input-name','input-callsign'].forEach(id =>
        document.getElementById(id).addEventListener('keydown', e => {
            if (e.key === 'Enter') document.getElementById('btn-register').click();
        })
    );

    document.getElementById('btn-hunt').addEventListener('click', _startHunting);

    document.getElementById('btn-back-to-game').addEventListener('click', () => {
        hideFinishedOverlay();
        gameState = STATE.HUNTING;
    });

    document.getElementById('btn-download-cert').addEventListener('click', downloadCertificate);
    document.getElementById('btn-play-again').addEventListener('click', () => {
        document.getElementById('overlay-certificate').classList.add('hidden');
        document.getElementById('overlay-finished').classList.add('hidden');
        showSplash();
        gameState = STATE.SPLASH;
    });

    rightTopCanvas.addEventListener('click', (e) => {
        if (gameState === STATE.MAP_VIEW)
            handleMapPanelClick(e, rightTopCanvas.width, rightTopCanvas.height);
    });
}

// ─── Game lifecycle ────────────────────────────────────────────────────────────
function _initNewGame() {
    Player.reset();
    placeBeacons();
    _allFoundShown = false;
    _gameFinished  = false;
    console.log('[Beacons]', getBeacons().map(b => `${b.code}@(${b.x},${b.y})`).join(' '));
}

function _startHunting() {
    hideBriefing();
    if (!Player.gameStartTime) Player.startTimer();
    audioEngine.init();
    gameState = STATE.HUNTING;
}

// ─── Loop ──────────────────────────────────────────────────────────────────────
function _startLoop() {
    const loop = (ts) => { _update(ts); _render(ts); animFrameId = requestAnimationFrame(loop); };
    animFrameId = requestAnimationFrame(loop);
}

function _update(timestamp) {
    if (gameState === STATE.HUNTING || gameState === STATE.FINISHED) {
        _handleMovement(timestamp);
        _checkFoxDetection();
        _checkFinish();
    }
    if (gameState === STATE.RECEIVER) {
        _updateAudio();
        _checkFoxDetection();
        _checkFinish();
    }
}

function _render(timestamp) {
    if (gameState !== STATE.SPLASH && gameState !== STATE.REGISTRATION) {
        renderMainView(mainCtx, mainCanvas.width, mainCanvas.height, timestamp, gameState);
    }
    if (gameState === STATE.RECEIVER) {
        drawReceiverPanel(rtCtx, rightTopCanvas.width, rightTopCanvas.height);
    } else if (gameState !== STATE.SPLASH && gameState !== STATE.REGISTRATION) {
        drawMapPanel(rtCtx, rightTopCanvas.width, rightTopCanvas.height);
    }
    if (gameState !== STATE.SPLASH && gameState !== STATE.REGISTRATION) {
        drawInfoPanel(rbCtx, rightBotCanvas.width, rightBotCanvas.height, gameState);
    }
}

// ─── 2D Movement ──────────────────────────────────────────────────────────────
function _handleMovement(timestamp) {
    const k = Player.keysHeld;
    if (k.up)    Player.tryMove('up',    timestamp);
    if (k.down)  Player.tryMove('down',  timestamp);
    if (k.left)  Player.tryMove('left',  timestamp);
    if (k.right) Player.tryMove('right', timestamp);
}

// ─── Audio ─────────────────────────────────────────────────────────────────────
function _updateAudio() {
    const dominant = getDominantSignal(Player.x, Player.y, Player.receiverBearing);
    if (dominant && dominant.signal > 0.02) {
        audioEngine.isPlaying
            ? audioEngine.update(dominant.beacon.code, dominant.signal)
            : audioEngine.play(dominant.beacon.code, dominant.signal);
    } else if (audioEngine.isPlaying) {
        audioEngine.stop();
    }
}

// ─── Detection ─────────────────────────────────────────────────────────────────
function _checkFoxDetection() {
    if (Date.now() - lastFoxFoundTime < 3000) return;
    const found = checkFoxDetection(Player.x, Player.y);
    if (found) {
        lastFoxFoundTime = Date.now();
        showFoxFoundFlash(found);
        console.log('[Fox found]', found.code, '— total:', Player.foundFoxes.size);
        if (Player.allFoxesFound && !_allFoundShown) {
            _allFoundShown = true;
            setTimeout(showFinishedOverlay, 2800);
        }
    }
}

function _checkFinish() {
    if (!_gameFinished && Player.allFoxesFound && Player.atStart) _triggerFinish();
}

function _triggerFinish() {
    if (_gameFinished) return;
    _gameFinished = true;
    Player.stopTimer();
    audioEngine.stop();
    hideFinishedOverlay();
    gameState = STATE.FINISHED;
    console.log('[Finish] Time:', Player.getElapsedString());
    setTimeout(() => { showCertificate(); gameState = STATE.CERTIFICATE; }, 800);
}

// ─── Input ─────────────────────────────────────────────────────────────────────
function _setupKeyboard() {
    document.addEventListener('keydown', _onKeyDown);
    document.addEventListener('keyup',   _onKeyUp);
}

function _onKeyDown(e) {
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    switch (gameState) {
        case STATE.BRIEFING:  _handleBriefingKey(e.key);     break;
        case STATE.HUNTING:   _handleHuntingKey(e.key,true); break;
        case STATE.FINISHED:  _handleHuntingKey(e.key,true); break;
        case STATE.RECEIVER:  _handleReceiverKey(e.key);     break;
        case STATE.MAP_VIEW:  _handleMapViewKey(e.key);      break;
    }
}

function _onKeyUp(e) {
    const m = {ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'};
    if (m[e.key]) Player.keysHeld[m[e.key]] = false;
}

function _handleBriefingKey(key) {
    switch(key.toUpperCase()) {
        case 'H': _startHunting(); break;
        case 'R': hideBriefing(); audioEngine.init(); gameState = STATE.RECEIVER; break;
        case 'M': hideBriefing(); gameState = STATE.MAP_VIEW; break;
    }
}

function _handleHuntingKey(key, down) {
    const m = {ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'};
    if (m[key] !== undefined) { Player.keysHeld[m[key]] = down; return; }
    if (!down) return;
    switch(key.toUpperCase()) {
        case 'R': audioEngine.init(); gameState = STATE.RECEIVER; break;
        case 'M': gameState = STATE.MAP_VIEW; break;
    }
}

function _handleReceiverKey(key) {
    switch(key) {
        case 'ArrowLeft':  Player.rotateReceiver(-CONFIG.RECEIVER_ROTATE_STEP); break;
        case 'ArrowRight': Player.rotateReceiver(+CONFIG.RECEIVER_ROTATE_STEP); break;
        default:
            switch(key.toUpperCase()) {
                case 'R': case 'H': audioEngine.stop(); gameState = STATE.HUNTING;  break;
                case 'M':           audioEngine.stop(); gameState = STATE.MAP_VIEW; break;
            }
    }
}

function _handleMapViewKey(key) {
    if (key >= '0' && key <= '9') {
        if (Player.bearingInput.length < 3) Player.bearingInput += key;
        return;
    }
    switch(key) {
        case 'Backspace': Player.bearingInput = Player.bearingInput.slice(0,-1); break;
        case 'Enter': {
            const b = parseInt(Player.bearingInput, 10);
            if (!isNaN(b) && Player.bearingLines.length < 10)
                Player.addBearingLine(b % 360);
            Player.bearingInput = '';
            break;
        }
        case 'M': case 'm': case 'H': case 'h': gameState = STATE.HUNTING; break;
        case 'R': case 'r': audioEngine.init(); gameState = STATE.RECEIVER; break;
    }
}
