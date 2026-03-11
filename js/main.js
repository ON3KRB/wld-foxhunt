/**
 * main.js - Game entry point, loop, state machine
 * WLD FoxWave ARDF
 */
"use strict";

let mainCanvas, mainCtx;
let rightTopCanvas, rtCtx;
let rightBotCanvas, rbCtx;

let gameState        = STATE.SPLASH;
let lastFoxFoundTime = 0;
let _allFoundShown   = false;
let _gameFinished    = false;

// ── Boot ───────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
    _setupCanvases();
    _setupOverlays();
    _setupKeyboard();
    buildParkMap();
    loadRendererAssets(() => console.log('[Assets] loaded'));
    showSplash();
    requestAnimationFrame(_loop);
});

function _setupCanvases() {
    mainCanvas     = document.getElementById('canvas-main');
    rightTopCanvas = document.getElementById('canvas-right-top');
    rightBotCanvas = document.getElementById('canvas-right-bot');
    mainCtx = mainCanvas.getContext('2d');
    rtCtx   = rightTopCanvas.getContext('2d');
    rbCtx   = rightBotCanvas.getContext('2d');
    _resize();
    window.addEventListener('resize', _resize);
}

function _resize() {
    const W=window.innerWidth, H=window.innerHeight;
    mainCanvas.width      = Math.floor(W*0.70); mainCanvas.height      = H;
    rightTopCanvas.width  = Math.floor(W*0.30); rightTopCanvas.height  = Math.floor(H*0.65);
    rightBotCanvas.width  = Math.floor(W*0.30); rightBotCanvas.height  = Math.floor(H*0.35);
}

// ── Overlays ──────────────────────────────────────────────────────────────────
function _setupOverlays() {
    document.getElementById('btn-start-game').addEventListener('click', () => {
        hideSplash(); showRegistration(); gameState = STATE.REGISTRATION;
    });

    document.getElementById('btn-register').addEventListener('click', () => {
        const name = document.getElementById('input-name').value.trim() || 'Hunter';
        const cs   = document.getElementById('input-callsign').value.trim().toUpperCase();
        const cnt  = parseInt(document.getElementById('select-fox-count').value, 10) || 5;
        Player.name     = name + (cs ? ` (${cs})` : '');
        CONFIG.FOX_COUNT = cnt;
        hideRegistration();
        _initGame();
        showBriefing();
        gameState = STATE.BRIEFING;
    });

    ['input-name','input-callsign'].forEach(id =>
        document.getElementById(id).addEventListener('keydown', e=>{
            if(e.key==='Enter') document.getElementById('btn-register').click();
        })
    );

    document.getElementById('btn-hunt').addEventListener('click', _startHunting);

    document.getElementById('btn-back-to-game').addEventListener('click', () => {
        hideFinishedOverlay(); gameState = STATE.HUNTING;
    });

    document.getElementById('btn-download-cert').addEventListener('click', downloadCertificate);
    document.getElementById('btn-play-again').addEventListener('click', () => {
        ['overlay-certificate','overlay-finished'].forEach(id=>
            document.getElementById(id).classList.add('hidden')
        );
        showSplash(); gameState = STATE.SPLASH;
    });

    rightTopCanvas.addEventListener('click', e => {
        if(gameState===STATE.MAP_VIEW)
            handleMapPanelClick(e, rightTopCanvas.width, rightTopCanvas.height);
    });
}

// ── Game lifecycle ────────────────────────────────────────────────────────────
function _initGame() {
    Player.reset();
    placeBeacons();
    initNPCs();
    _allFoundShown = false;
    _gameFinished  = false;
    console.log('[Game] Fox count:', CONFIG.FOX_COUNT, 'Beacons:', getBeacons().map(b=>`${b.code}@${b.x},${b.y}`).join(' '));
}

function _startHunting() {
    hideBriefing();
    if (!Player.gameStartTime) Player.startTimer();
    audioEngine.init();
    gameState = STATE.HUNTING;
}

// ── Main loop ─────────────────────────────────────────────────────────────────
function _loop(timestamp) {
    _update(timestamp);
    _render(timestamp);
    requestAnimationFrame(_loop);
}

function _update(ts) {
    const active = gameState===STATE.HUNTING || gameState===STATE.FINISHED;

    if (active)           { _move(ts); _checkFox(); _checkFinish(); }
    if (gameState===STATE.RECEIVER) { _audio(); _checkFox(); _checkFinish(); }

    // NPC movement
    if (active || gameState===STATE.RECEIVER) updateNPCs(ts);

    // Hint timer
    if (Player.hintVisible && ts > Player.hintTimer) {
        Player.hintVisible = false;
    }
}

function _render(ts) {
    const inGame = gameState!==STATE.SPLASH && gameState!==STATE.REGISTRATION;
    if (inGame) renderMainView(mainCtx, mainCanvas.width, mainCanvas.height, ts, gameState);

    if (gameState===STATE.RECEIVER) {
        drawReceiverPanel(rtCtx, rightTopCanvas.width, rightTopCanvas.height);
    } else if (inGame) {
        drawMapPanel(rtCtx, rightTopCanvas.width, rightTopCanvas.height);
    }

    if (inGame) drawInfoPanel(rbCtx, rightBotCanvas.width, rightBotCanvas.height, gameState);
}

// ── Movement ──────────────────────────────────────────────────────────────────
function _move(ts) {
    const k = Player.keysHeld;
    if(k.up)    Player.tryMove('up',ts);
    if(k.down)  Player.tryMove('down',ts);
    if(k.left)  Player.tryMove('left',ts);
    if(k.right) Player.tryMove('right',ts);
}

// ── Audio (always use tick) ───────────────────────────────────────────────────
function _audio() {
    const dom = getDominantSignal(Player.x, Player.y, Player.receiverBearing);
    audioEngine.tick(
        dom ? dom.beacon.code : null,
        dom ? dom.signal      : 0
    );
}

// ── Detection ─────────────────────────────────────────────────────────────────
function _checkFox() {
    if (Date.now()-lastFoxFoundTime < 3000) return;
    const found = checkFoxDetection(Player.x, Player.y);
    if (found) {
        lastFoxFoundTime = Date.now();
        showFoxFoundFlash(found);
        console.log('[Fox]', found.code, Player.foundFoxes.size, '/', CONFIG.FOX_COUNT);
        if (Player.allFoxesFound && !_allFoundShown) {
            _allFoundShown = true;
            setTimeout(showFinishedOverlay, 2800);
        }
    }
}

function _checkFinish() {
    if (!_gameFinished && Player.allFoxesFound && Player.atStart) _finish();
}

function _finish() {
    if (_gameFinished) return;
    _gameFinished = true;
    Player.stopTimer();
    audioEngine.stop();
    hideFinishedOverlay();
    gameState = STATE.FINISHED;
    setTimeout(() => { showCertificate(); gameState = STATE.CERTIFICATE; }, 800);
    console.log('[Finish]', Player.getElapsedString());
}

// ── ON4BB Hint ────────────────────────────────────────────────────────────────
function _showHint() {
    const now = performance.now();
    if (now - Player.lastHintTime < CONFIG.HINT_COOLDOWN_MS) {
        Player.hintText   = 'Geduld... ON4BB is even QRX. Probeer over een momentje.';
        Player.hintVisible = true;
        Player.hintTimer  = now + 4000;
        return;
    }
    Player.lastHintTime = now;

    // Find nearest unfound beacon
    const unfound = getUnfoundBeacons();
    if (unfound.length === 0) {
        Player.hintText = 'Alle vossen zijn gevonden! Keer terug naar het WLD-tent!';
    } else {
        const nearest = unfound.reduce((a,b)=>
            Math.hypot(b.x-Player.x,b.y-Player.y) < Math.hypot(a.x-Player.x,a.y-Player.y) ? b : a
        );
        const dx=nearest.x-Player.x, dy=nearest.y-Player.y;
        const brg=Math.round(((Math.atan2(dx,-dy)*180/Math.PI)+360)%360);
        const dist=Math.round(Math.hypot(dx,dy)*3); // roughly in metres
        const compass=['Noord','Noord-Oost','Oost','Zuid-Oost','Zuid','Zuid-West','West','Noord-West'];
        const dir=compass[Math.round(brg/45)%8];
        Player.hintText = `Vos ${nearest.code} peiling: ${brg}° (${dir}), ca. ${dist}m. 73 de ${CONFIG.ON4BB_CALLSIGN}`;
    }

    Player.hintVisible = true;
    Player.hintTimer   = now + 8000;
}

// ── Keyboard ──────────────────────────────────────────────────────────────────
function _setupKeyboard() {
    document.addEventListener('keydown', _kd);
    document.addEventListener('keyup',   _ku);
}

function _kd(e) {
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
    if(document.activeElement && document.activeElement.tagName==='INPUT') return;

    // '?' works in all active game states
    if((e.key==='?'||e.key==='/')
        && [STATE.HUNTING,STATE.RECEIVER,STATE.MAP_VIEW,STATE.FINISHED].includes(gameState)){
        _showHint(); return;
    }
    // Escape closes hint
    if(e.key==='Escape'){ Player.hintVisible=false; return; }

    switch(gameState){
        case STATE.BRIEFING:  _kBriefing(e.key);     break;
        case STATE.HUNTING:
        case STATE.FINISHED:  _kHunting(e.key,true); break;
        case STATE.RECEIVER:  _kReceiver(e.key);     break;
        case STATE.MAP_VIEW:  _kMap(e.key);          break;
    }
}

function _ku(e) {
    const m={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'};
    if(m[e.key]) Player.keysHeld[m[e.key]]=false;
}

function _kBriefing(k){
    switch(k.toUpperCase()){
        case 'H': _startHunting(); break;
        case 'R': hideBriefing(); audioEngine.init(); gameState=STATE.RECEIVER; break;
        case 'M': hideBriefing(); gameState=STATE.MAP_VIEW; break;
    }
}

function _kHunting(k,dn){
    const m={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'};
    if(m[k]){Player.keysHeld[m[k]]=dn;return;}
    if(!dn)return;
    switch(k.toUpperCase()){
        case 'R': audioEngine.init(); gameState=STATE.RECEIVER; break;
        case 'M': gameState=STATE.MAP_VIEW; break;
    }
}

function _kReceiver(k){
    switch(k){
        case 'ArrowLeft':  Player.rotateReceiver(-CONFIG.RECEIVER_ROTATE_STEP); break;
        case 'ArrowRight': Player.rotateReceiver(+CONFIG.RECEIVER_ROTATE_STEP); break;
        default:
            switch(k.toUpperCase()){
                case 'R': case 'H': audioEngine.stop(); gameState=STATE.HUNTING; break;
                case 'M':           audioEngine.stop(); gameState=STATE.MAP_VIEW; break;
            }
    }
}

function _kMap(k){
    if(k>='0'&&k<='9'){if(Player.bearingInput.length<3)Player.bearingInput+=k;return;}
    switch(k){
        case 'Backspace': Player.bearingInput=Player.bearingInput.slice(0,-1); break;
        case 'Enter':{
            const b=parseInt(Player.bearingInput,10);
            if(!isNaN(b)&&Player.bearingLines.length<10) Player.addBearingLine(b%360);
            Player.bearingInput=''; break;
        }
        case 'M':case 'm':case 'H':case 'h': gameState=STATE.HUNTING; break;
        case 'R':case 'r': audioEngine.init(); gameState=STATE.RECEIVER; break;
    }
}
