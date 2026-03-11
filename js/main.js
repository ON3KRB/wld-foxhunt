/**
 * main.js - Game loop, state machine, input
 * WLD FoxWave ARDF
 */
"use strict";

// ── Global error display ──────────────────────────────────────────────────────
window.onerror = function(msg, src, line, col, err) {
    const el = document.getElementById('js-error');
    if (el) {
        el.style.display = 'block';
        el.textContent = '⚠ JS ERROR: ' + msg + ' [' + (src||'').split('/').pop() + ':' + line + ']';
    }
    console.error('[Game Error]', msg, src, line, col, err);
};

let mainCanvas, mainCtx;
let rightTopCanvas, rtCtx;
let rightBotCanvas, rbCtx;

let gameState        = STATE.SPLASH;
let lastFoxFoundTime = 0;
let _allFoundShown   = false;
let _gameFinished    = false;

// ── Boot ───────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
    // Dismiss loading screen
    const lm = document.getElementById('loading-msg');
    if (lm) lm.classList.add('gone');

    try {
        _setupCanvases();
        _setupOverlays();
        _setupKeyboard();
        _setupMouse();
        buildParkMap();
        loadRendererAssets(() => console.log('[Assets] loaded'));
        showSplash();
        requestAnimationFrame(_loop);
    } catch(e) {
        const el = document.getElementById('js-error');
        if (el) { el.style.display='block'; el.textContent='⚠ INIT ERROR: '+e.message; }
        console.error('[Init Error]', e);
        // Still try to show splash as fallback
        try { showSplash(); } catch(_) {}
    }
});

// ── Canvas ─────────────────────────────────────────────────────────────────────
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
        hideSplash(); showRegistration(); gameState=STATE.REGISTRATION;
    });

    document.getElementById('btn-register').addEventListener('click', () => {
        const name = document.getElementById('input-name').value.trim()||'Hunter';
        const cs   = document.getElementById('input-callsign').value.trim().toUpperCase();
        const cnt  = parseInt(document.getElementById('select-fox-count').value,10)||5;
        Player.name      = name+(cs?` (${cs})`:'');
        CONFIG.FOX_COUNT = cnt;
        hideRegistration(); _initGame(); showBriefing(); gameState=STATE.BRIEFING;
    });

    ['input-name','input-callsign'].forEach(id=>
        document.getElementById(id).addEventListener('keydown',e=>{
            if(e.key==='Enter') document.getElementById('btn-register').click();
        })
    );

    document.getElementById('btn-hunt').addEventListener('click', _startHunting);

    document.getElementById('btn-back-to-game').addEventListener('click',()=>{
        hideFinishedOverlay(); gameState=STATE.HUNTING;
    });

    document.getElementById('btn-download-cert').addEventListener('click', downloadCertificate);
    document.getElementById('btn-play-again').addEventListener('click',()=>{
        ['overlay-certificate','overlay-finished'].forEach(id=>
            document.getElementById(id).classList.add('hidden'));
        showSplash(); gameState=STATE.SPLASH;
    });

    rightTopCanvas.addEventListener('click',e=>{
        if(gameState===STATE.MAP_VIEW)
            handleMapPanelClick(e,rightTopCanvas.width,rightTopCanvas.height);
    });
}

// ── Game lifecycle ────────────────────────────────────────────────────────────
function _initGame() {
    Player.reset();
    placeBeacons();
    initNPCs();
    _allFoundShown=false; _gameFinished=false;
    console.log('[Game] fox count:',CONFIG.FOX_COUNT);
}

function _startHunting() {
    hideBriefing();
    if(!Player.gameStartTime) Player.startTimer();
    // Init audio once — tick() handles everything from here
    if(!audioEngine.isReady) audioEngine.init();
    gameState=STATE.HUNTING;
}

// ── Main loop ─────────────────────────────────────────────────────────────────
function _loop(ts) {
    try {
        _update(ts);
        _render(ts);
    } catch(e) {
        console.error('[Loop error]', e);
    }
    requestAnimationFrame(_loop);
}

function _update(ts) {
    const inGame=[STATE.HUNTING,STATE.RECEIVER,STATE.FINISHED,STATE.MAP_VIEW].includes(gameState);

    if(inGame) {
        _move(ts);
        updateNPCs(ts);
        _tickAudio();          // ← audio ticks ALWAYS in any active game state
        _checkFox();
        _checkFinish();
    }

    // Hint timer
    if(Player.hintVisible && ts > Player.hintTimer) Player.hintVisible=false;
}

function _render(ts) {
    const inGame = gameState!==STATE.SPLASH && gameState!==STATE.REGISTRATION;

    if(inGame) {
        try {
            renderMainView(mainCtx, mainCanvas.width, mainCanvas.height, ts, gameState);
        } catch(e) {
            console.error('[Main render crash]', e);
            // At minimum fill with dark so it's not a stale frame
            mainCtx.fillStyle='#050f05';
            mainCtx.fillRect(0,0,mainCanvas.width,mainCanvas.height);
            mainCtx.fillStyle='#ff4444';
            mainCtx.font='14px monospace';
            mainCtx.fillText('Render error: '+e.message, 20, 40);
        }
    }

    // Right-top: receiver compass OR map
    if(gameState===STATE.RECEIVER) {
        try { drawReceiverPanel(rtCtx, rightTopCanvas.width, rightTopCanvas.height); }
        catch(e){ console.error('[Receiver panel]',e); }
    } else if(inGame) {
        try { drawMapPanel(rtCtx, rightTopCanvas.width, rightTopCanvas.height); }
        catch(e){ console.error('[Map panel]',e); }
    }

    // Right-bottom: info
    if(inGame) {
        try { drawInfoPanel(rbCtx, rightBotCanvas.width, rightBotCanvas.height, gameState); }
        catch(e){ console.error('[Info panel]',e); }
    }
}

// ── Movement (3D) ─────────────────────────────────────────────────────────────
function _move(ts) {
    const k=Player.keysHeld;
    const ms=CONFIG.RC_MOVE_SPEED, rs=CONFIG.RC_ROT_SPEED, ss=CONFIG.RC_STRAFE_SPEED;
    if(k.forward)  Player.moveForward(ms);
    if(k.back)     Player.moveForward(-ms*0.65);
    if(k.left)     Player.rotateView(-rs);
    if(k.right)    Player.rotateView(rs);
    if(k.strafeL)  Player.strafe(-ss);
    if(k.strafeR)  Player.strafe(ss);
}

// ── Audio — ONLY in RECEIVER mode ────────────────────────────────────────────
function _tickAudio() {
    if(!audioEngine.isReady) return;
    if(gameState !== STATE.RECEIVER) {
        // Outside receiver mode: silence always
        audioEngine.tick(null, 0);
        return;
    }
    // In receiver mode: signal strength = volume
    const dom = getDominantSignal(Player.px, Player.py, Player.receiverBearing);
    audioEngine.tick(
        dom ? dom.beacon.code : null,
        dom ? dom.signal      : 0
    );
}

// ── Fox detection ─────────────────────────────────────────────────────────────
function _checkFox() {
    if(Date.now()-lastFoxFoundTime<3000) return;
    const found=checkFoxDetection(Player.px, Player.py);
    if(found){
        lastFoxFoundTime=Date.now();
        showFoxFoundFlash(found);
        console.log('[Fox]',found.code,Player.foundFoxes.size,'/',CONFIG.FOX_COUNT);
        if(Player.allFoxesFound&&!_allFoundShown){
            _allFoundShown=true;
            setTimeout(showFinishedOverlay,2800);
        }
    }
}

function _checkFinish() {
    if(!_gameFinished&&Player.allFoxesFound&&Player.atStart) _finish();
}

function _finish() {
    if(_gameFinished) return;
    _gameFinished=true;
    Player.stopTimer();
    audioEngine.stop();
    hideFinishedOverlay();
    gameState=STATE.FINISHED;
    setTimeout(()=>{ showCertificate(); gameState=STATE.CERTIFICATE; },800);
    console.log('[Finish]',Player.getElapsedString());
}

// ── ON4BB hint ────────────────────────────────────────────────────────────────
function _showHint() {
    const now=performance.now();
    if(now-Player.lastHintTime<CONFIG.HINT_COOLDOWN_MS){
        Player.hintText='Geduld... ON4BB is even QRX. Probeer over een momentje.';
        Player.hintVisible=true; Player.hintTimer=now+4000; return;
    }
    Player.lastHintTime=now;
    const unfound=getUnfoundBeacons();
    if(!unfound.length){
        Player.hintText='Alle vossen gevonden! Keer terug naar het WLD-tent!';
    } else {
        const b=unfound.reduce((a,b)=>
            Math.hypot(b.x-Player.px,b.y-Player.py)<Math.hypot(a.x-Player.px,a.y-Player.py)?b:a);
        const dx=b.x-Player.px, dy=b.y-Player.py;
        const brg=Math.round((Math.atan2(dx,-dy)*180/Math.PI+360)%360);
        const dist=Math.round(Math.hypot(dx,dy)*3);
        const dirs=['Noord','Noord-Oost','Oost','Zuid-Oost','Zuid','Zuid-West','West','Noord-West'];
        const dir=dirs[Math.round(brg/45)%8];
        Player.hintText=`Vos ${b.code}: peiling ${brg}° (${dir}), ca. ${dist}m. 73 de ${CONFIG.ON4BB_CALLSIGN}`;
    }
    Player.hintVisible=true; Player.hintTimer=performance.now()+8000;
}

// ── Mouse (pointer lock for 3D look) ─────────────────────────────────────────
function _setupMouse() {
    // Click main canvas → request pointer lock (FPS look)
    mainCanvas.addEventListener('click',()=>{
        if(!document.pointerLockElement && [STATE.HUNTING,STATE.RECEIVER,STATE.FINISHED].includes(gameState)){
            mainCanvas.requestPointerLock();
            if(!audioEngine.isReady) audioEngine.init();
        }
    });

    document.addEventListener('pointerlockchange',()=>{
        if(document.pointerLockElement===mainCanvas){
            document.addEventListener('mousemove',_onMouseLook);
            document.addEventListener('mousedown',_onMouseBtn);
            document.addEventListener('mouseup',_onMouseBtnUp);
        } else {
            document.removeEventListener('mousemove',_onMouseLook);
            document.removeEventListener('mousedown',_onMouseBtn);
            document.removeEventListener('mouseup',_onMouseBtnUp);
        }
    });

    // Also allow non-locked mouse on the canvas for basic interaction
    mainCanvas.addEventListener('mousemove',e=>{
        if(document.pointerLockElement) return; // handled by pointerlockchange
        if(e.buttons===1){
            Player.rotateView(e.movementX*0.005);
        }
    });
}

function _onMouseLook(e) {
    if([STATE.HUNTING,STATE.RECEIVER,STATE.FINISHED].includes(gameState)){
        Player.rotateView(e.movementX*0.003);
    }
    if(gameState===STATE.RECEIVER){
        // In receiver mode, also tilt antenna left/right for fine control
        Player.rotateReceiver(e.movementX*0.3);
    }
}

function _onMouseBtn(e) {
    if(e.button===0) Player.keysHeld.forward=true;
    if(e.button===2) Player.keysHeld.back=true;
}
function _onMouseBtnUp(e) {
    if(e.button===0) Player.keysHeld.forward=false;
    if(e.button===2) Player.keysHeld.back=false;
}

// ── Keyboard ──────────────────────────────────────────────────────────────────
function _setupKeyboard() {
    document.addEventListener('keydown',_kd);
    document.addEventListener('keyup',_ku);
}

function _kd(e) {
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
    if(document.activeElement&&document.activeElement.tagName==='INPUT') return;

    // Tab = secret mini-map toggle
    if (e.key === 'Tab') { e.preventDefault(); window._showMiniMap = !window._showMiniMap; return; }

    // Hint works in all active states
    if((e.key==='?'||e.key==='/')&&[STATE.HUNTING,STATE.RECEIVER,STATE.MAP_VIEW,STATE.FINISHED].includes(gameState)){
        _showHint(); if(!audioEngine.isReady) audioEngine.init(); return;
    }
    if(e.key==='Escape'){ Player.hintVisible=false; return; }

    switch(gameState){
        case STATE.BRIEFING:             _kBriefing(e.key); break;
        case STATE.HUNTING:
        case STATE.FINISHED:             _kMove(e.key,true); _kMode(e.key); break;
        case STATE.RECEIVER:             _kReceiver(e.key,true); break;
        case STATE.MAP_VIEW:             _kMap(e.key); break;
    }
}

function _ku(e) {
    _kMove(e.key,false);
    _kReceiver(e.key,false);
}

function _kBriefing(k){
    if(k.toUpperCase()==='H'||k===' ') _startHunting();
}

const MOVE_MAP = {
    ArrowUp:'forward', w:'forward', W:'forward',
    ArrowDown:'back',  s:'back',    S:'back',
    ArrowLeft:'left',  ArrowRight:'right',
    a:'strafeL', A:'strafeL', d:'strafeR', D:'strafeR',
    q:'strafeL', Q:'strafeL', e:'strafeR', E:'strafeR',
};

function _kMove(k,dn){
    const action=MOVE_MAP[k];
    if(action) Player.keysHeld[action]=dn;
}

function _kMode(k){
    switch(k.toUpperCase()){
        case 'R':
            Player.receiverOn = !Player.receiverOn;
            if(!audioEngine.isReady) audioEngine.init();
            gameState = Player.receiverOn ? STATE.RECEIVER : STATE.HUNTING;
            break;
        case 'M': gameState=STATE.MAP_VIEW; break;
    }
}

function _kReceiver(k, dn){
    if(k==='ArrowLeft'  && dn) Player.rotateReceiver(-CONFIG.RECEIVER_ROTATE_STEP);
    if(k==='ArrowRight' && dn) Player.rotateReceiver(+CONFIG.RECEIVER_ROTATE_STEP);
    if(k==='a'&&dn) Player.rotateReceiver(-CONFIG.RECEIVER_ROTATE_STEP);
    if(k==='d'&&dn) Player.rotateReceiver(+CONFIG.RECEIVER_ROTATE_STEP);
    if(dn){
        const ku = k.toUpperCase();
        // Y = lock bearing on map, return to hunting
        if(ku==='Y'){
            Player.addBearingLine(Player.receiverBearing);
            Player.receiverOn=false; gameState=STATE.HUNTING;
            return;
        }
        // N = just return to hunting without saving
        if(ku==='N'){ Player.receiverOn=false; gameState=STATE.HUNTING; return; }

        switch(ku){
            case 'R': Player.receiverOn=false; gameState=STATE.HUNTING; break;
            case 'H': Player.receiverOn=false; gameState=STATE.HUNTING; break;
            case 'M': gameState=STATE.MAP_VIEW; break;
        }
    }
}

function _kMap(k){
    if(k>='0'&&k<='9'){ if(Player.bearingInput.length<3) Player.bearingInput+=k; return; }
    switch(k){
        case 'Backspace': Player.bearingInput=Player.bearingInput.slice(0,-1); break;
        case 'Enter':{
            const b=parseInt(Player.bearingInput,10);
            if(!isNaN(b)&&Player.bearingLines.length<10) Player.addBearingLine(b%360);
            Player.bearingInput='';
            // Auto-return to hunting so arrow keys work immediately
            gameState=STATE.HUNTING; Player.receiverOn=false;
            break;
        }
        case 'M':case 'm': gameState=STATE.HUNTING; Player.receiverOn=false; break;
        case 'H':case 'h': gameState=STATE.HUNTING; Player.receiverOn=false; break;
        case 'R':case 'r':
            if(!audioEngine.isReady) audioEngine.init();
            Player.receiverOn=true; gameState=STATE.RECEIVER; break;
    }
}
