/**
 * renderer.js - Main park canvas renderer
 * WLD FoxWave ARDF
 *
 * Key design decisions:
 *  - 40px tiles: paths clearly visible as distinct sandy strips
 *  - Heavy contrast between PATH (#c8a460) and GRASS (#3a7a30) and TREE (#1a4a10)
 *  - Player drawn with HIGH antenna (3× tile height above head) + receiver box
 *  - Receiver mode shows handheld device with frequency display + loop antenna
 *  - WLD tent area clearly rendered at player start
 *  - NPC hunters drawn with antennas and callsign labels
 *  - ON4BB VHF hint overlay
 */
"use strict";

// roundRect polyfill
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x,y,w,h,r){
        r = Math.min(r,w/2,h/2);
        this.beginPath();
        this.moveTo(x+r,y); this.lineTo(x+w-r,y); this.arcTo(x+w,y,x+w,y+r,r);
        this.lineTo(x+w,y+h-r); this.arcTo(x+w,y+h,x+w-r,y+h,r);
        this.lineTo(x+r,y+h); this.arcTo(x,y+h,x,y+h-r,r);
        this.lineTo(x,y+r); this.arcTo(x,y,x+r,y,r);
        this.closePath(); return this;
    };
}

let _wldLogoImg   = null;
let _startStopImg = null;
let _foxImg       = null;

function loadRendererAssets(cb) {
    let n = 3;
    const done = () => { if (--n === 0 && cb) cb(); };
    (_wldLogoImg   = new Image()).onload = (_wldLogoImg.onerror   = done); _wldLogoImg.src   = 'assets/wld-logo.png';
    (_startStopImg = new Image()).onload = (_startStopImg.onerror = done); _startStopImg.src = 'assets/start-stop.png';
    (_foxImg       = new Image()).onload = (_foxImg.onerror       = done); _foxImg.src       = 'assets/fox.png';
}

// ── Tile colours — high contrast palette ─────────────────────────────────────
const TC = {
    [TILE.GRASS]:       '#4a8a38',
    [TILE.PATH]:        '#c8a460',   // sandy path — very distinct from grass
    [TILE.TREE]:        '#1e5010',
    [TILE.WATER]:       '#1a6aaa',
    [TILE.BUILDING]:    '#8a6030',
    [TILE.PLAYGROUND]:  '#d47820',
    [TILE.FOUNTAIN]:    '#2090cc',
    [TILE.TRAIN]:       '#b89050',   // slightly darker than PATH
    [TILE.ZOO]:         '#5a9a2a',
    [TILE.START]:       '#d4a800',   // golden start tile
    [TILE.DENSE_TREE]:  '#0e3008',
    [TILE.FLOWER]:      '#5aaa40',
    [TILE.SHRUB]:       '#3a7020',
};

// ── Main render ───────────────────────────────────────────────────────────────
function renderMainView(ctx, W, H, timestamp, gameState) {
    const ts = CONFIG.TILE_SIZE_MAIN;
    const px = Player.x, py = Player.y;

    // Camera: centre on player tile centre
    const camX = W / 2 - (px + 0.5) * ts;
    const camY = H / 2 - (py + 0.5) * ts;

    // Visible tile range (with margin)
    const tx0 = Math.max(0, Math.floor(-camX / ts) - 1);
    const ty0 = Math.max(0, Math.floor(-camY / ts) - 1);
    const tx1 = Math.min(CONFIG.WORLD_WIDTH  - 1, Math.ceil((W - camX) / ts) + 1);
    const ty1 = Math.min(CONFIG.WORLD_HEIGHT - 1, Math.ceil((H - camY) / ts) + 1);

    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(camX, camY);

    // 1. Tile pass
    for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
            _drawTile(ctx, tx, ty, ts, timestamp);
        }
    }

    // 2. Features
    _drawWLDTent(ctx, ts, timestamp);
    _drawFountain(ctx, ts, timestamp);
    _drawPlayground(ctx, ts);
    _drawZoo(ctx, ts);
    _drawCafe(ctx, ts);
    _drawTouristTrain(ctx, ts, timestamp);

    // 3. Fox markers
    _drawFoxMarkers(ctx, ts, timestamp);

    // 4. Receiver beam glow
    if (gameState === STATE.RECEIVER) {
        _drawBeamGlow(ctx, (px+0.5)*ts, (py+0.5)*ts, ts, timestamp);
    }

    // 5. NPCs
    for (const npc of getNPCs()) _drawNPC(ctx, npc, ts, timestamp, gameState);

    // 6. Player (drawn last so on top)
    _drawPlayer(ctx, (px+0.5)*ts, (py+0.5)*ts, ts, Player.facing, timestamp, gameState);

    ctx.restore();

    // 7. Screen-space overlays
    _drawVignette(ctx, W, H);
    _drawHUD(ctx, W, H, gameState, timestamp);

    // 8. ON4BB hint bubble
    if (Player.hintVisible) _drawON4BBHint(ctx, W, H, timestamp);

    // 9. "Return to tent" banner
    if (Player.allFoxesFound && (gameState === STATE.HUNTING || gameState === STATE.FINISHED)) {
        _drawReturnBanner(ctx, W, H, timestamp);
    }
}

// ── Tile drawing ──────────────────────────────────────────────────────────────
function _drawTile(ctx, tx, ty, ts, timestamp) {
    const tile = getTile(tx, ty);
    const sx = tx * ts, sy = ty * ts;

    // Base fill
    ctx.fillStyle = TC[tile] || TC[TILE.GRASS];
    ctx.fillRect(sx, sy, ts, ts);

    switch (tile) {
        case TILE.GRASS:
        case TILE.FLOWER:
            _tileGrass(ctx, tx, ty, sx, sy, ts, tile === TILE.FLOWER);
            break;
        case TILE.PATH:
        case TILE.TRAIN:
            _tilePath(ctx, tx, ty, sx, sy, ts, tile === TILE.TRAIN);
            break;
        case TILE.TREE:
        case TILE.DENSE_TREE:
        case TILE.SHRUB:
            _tileTree(ctx, tx, ty, sx, sy, ts, tile);
            break;
        case TILE.WATER:
            _tileWater(ctx, sx, sy, ts, timestamp);
            break;
        case TILE.START:
            _tileStart(ctx, sx, sy, ts, timestamp);
            break;
    }
}

function _tileGrass(ctx, tx, ty, sx, sy, ts, flower) {
    // Slight colour variation
    const v = ((tx * 7 + ty * 13) % 8 - 4) * 3;
    ctx.fillStyle = `hsl(112,${flower?52:38}%,${32+v/10}%)`;
    ctx.fillRect(sx, sy, ts, ts);

    if (flower && (tx*31+ty*17)%4===0) {
        const fc = ['#ff88aa','#ffdd44','#ff6688','#ffffff','#ffaadd'];
        for (let i=0;i<4;i++){
            const fi=(tx*23+ty*41+i*7)%1000;
            ctx.fillStyle=fc[i%fc.length];
            ctx.beginPath();
            ctx.arc(sx+4+(fi%(ts-8)), sy+4+((fi>>2)%(ts-8)), 2.5, 0, Math.PI*2);
            ctx.fill();
        }
    }
    // Grass blades
    if ((tx*31+ty*17)%9===0) {
        ctx.fillStyle='rgba(0,0,0,0.12)';
        ctx.fillRect(sx+ts*0.35, sy+ts*0.6, 2, 6);
        ctx.fillRect(sx+ts*0.65, sy+ts*0.55, 2, 7);
    }
}

function _tilePath(ctx, tx, ty, sx, sy, ts, isTrain) {
    // Base sandy colour already filled
    // Gravel texture: small dots
    ctx.fillStyle = isTrain ? 'rgba(0,0,0,0.10)' : 'rgba(0,0,0,0.08)';
    for (let i=0; i<6; i++) {
        const gx = sx + ((tx*17+i*31)%32) + 4;
        const gy = sy + ((ty*13+i*23)%28) + 6;
        ctx.beginPath(); ctx.arc(gx, gy, 1, 0, Math.PI*2); ctx.fill();
    }
    // Path edge darken
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(sx, sy, ts, 2);
    ctx.fillRect(sx, sy+ts-2, ts, 2);
    ctx.fillRect(sx, sy, 2, ts);
    ctx.fillRect(sx+ts-2, sy, 2, ts);

    if (isTrain) {
        // Rail sleepers
        ctx.fillStyle = 'rgba(80,40,10,0.45)';
        for (let i=0; i<3; i++) ctx.fillRect(sx+2, sy + i*(ts/3)+4, ts-4, ts/6-1);
        // Rails
        ctx.fillStyle = 'rgba(100,100,100,0.6)';
        ctx.fillRect(sx+ts*0.22, sy, ts*0.08, ts);
        ctx.fillRect(sx+ts*0.70, sy, ts*0.08, ts);
    }
}

function _tileTree(ctx, tx, ty, sx, sy, ts, tile) {
    const dense = tile === TILE.DENSE_TREE;
    const shrub = tile === TILE.SHRUB;
    ctx.fillStyle = dense ? '#0e3008' : shrub ? '#3a7020' : '#1e5010';
    ctx.fillRect(sx, sy, ts, ts);

    const seed = tx*17+ty*31;
    const cr   = shrub ? ts*0.32 : ts*0.42 + (seed%4-2);
    const ox   = (seed%5-2)*3, oy = ((seed>>3)%5-2)*3;
    const cx_  = sx+ts/2+ox, cy_= sy+ts/2+oy;

    const g = ctx.createRadialGradient(cx_-cr*0.3, cy_-cr*0.3, cr*0.1, cx_, cy_, cr);
    g.addColorStop(0, dense ? '#2a6018' : shrub ? '#5a9030' : '#3a7a20');
    g.addColorStop(1, dense ? '#0e3008' : shrub ? '#3a7020' : '#1e5010');
    ctx.beginPath(); ctx.arc(cx_, cy_, cr, 0, Math.PI*2);
    ctx.fillStyle = g; ctx.fill();

    // Highlight
    ctx.beginPath(); ctx.arc(cx_-cr*0.28, cy_-cr*0.28, cr*0.22, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fill();
}

function _tileWater(ctx, sx, sy, ts, t) {
    const wave = Math.sin(sx/38 + t/1600)*2 + Math.cos(sy/32 + t/1200)*1.5;
    const g = ctx.createLinearGradient(sx,sy,sx+ts,sy+ts);
    g.addColorStop(0,'#1a5fa0'); g.addColorStop(1,`hsl(210,65%,${33+wave}%)`);
    ctx.fillStyle=g; ctx.fillRect(sx,sy,ts,ts);
    ctx.strokeStyle='rgba(130,200,255,0.25)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(sx+4, sy+ts*0.38+wave); ctx.lineTo(sx+ts-4, sy+ts*0.38+wave); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx+8, sy+ts*0.65-wave*.5); ctx.lineTo(sx+ts-8, sy+ts*0.65-wave*.5); ctx.stroke();
}

function _tileStart(ctx, sx, sy, ts, t) {
    // Golden grid
    ctx.fillStyle='#d4a800'; ctx.fillRect(sx,sy,ts,ts);
    const pulse = 0.5+0.5*Math.sin(t/500);
    ctx.fillStyle=`rgba(255,240,100,${0.15+pulse*0.15})`; ctx.fillRect(sx,sy,ts,ts);
    ctx.strokeStyle='rgba(180,130,0,0.5)'; ctx.lineWidth=0.7;
    for(let i=0;i<ts;i+=8){
        ctx.beginPath();ctx.moveTo(sx+i,sy);ctx.lineTo(sx+i,sy+ts);ctx.stroke();
        ctx.beginPath();ctx.moveTo(sx,sy+i);ctx.lineTo(sx+ts,sy+i);ctx.stroke();
    }
}

// ── WLD Tent ──────────────────────────────────────────────────────────────────
function _drawWLDTent(ctx, ts, t) {
    const tx=3, ty=55;
    const sx=tx*ts, sy=ty*ts, tw=7*ts, th=4*ts;

    // Ground
    ctx.fillStyle='#c8a800'; ctx.fillRect(sx-ts,sy-ts,tw+2*ts,th+ts*1.5);

    // Table
    ctx.fillStyle='#8a6020'; ctx.fillRect(sx+ts*0.5,sy+ts*0.8,tw-ts,ts*0.2);
    ctx.fillStyle='#7a5010';
    ctx.fillRect(sx+ts*0.6,sy+ts,ts*0.15,ts*0.8);
    ctx.fillRect(sx+tw-ts*0.75,sy+ts,ts*0.15,ts*0.8);

    // Start/stop machine on table
    if(_startStopImg && _startStopImg.naturalWidth){
        ctx.drawImage(_startStopImg, sx+ts*1.0, sy+ts*0.1, ts*4, ts*0.75);
    } else {
        ctx.fillStyle='#ddd'; ctx.fillRect(sx+ts*1.0,sy+ts*0.1,ts*4,ts*0.75);
        ctx.fillStyle='#ff8800';
        ctx.font=`bold ${ts*0.35}px "Share Tech Mono",monospace`;
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText('STOP  00:00', sx+ts*3, sy+ts*0.48);
    }

    // Tent body
    ctx.fillStyle='rgba(20,60,150,0.9)'; ctx.fillRect(sx,sy+th*0.1,tw,th*0.9);

    // Tent roof triangle
    ctx.beginPath();
    ctx.moveTo(sx+tw/2, sy-ts*1.2);
    ctx.lineTo(sx-ts*0.3, sy+th*0.12);
    ctx.lineTo(sx+tw+ts*0.3, sy+th*0.12);
    ctx.closePath();
    ctx.fillStyle='#cc1818'; ctx.fill();
    ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.stroke();

    // WLD logo on tent
    if(_wldLogoImg && _wldLogoImg.naturalWidth){
        ctx.drawImage(_wldLogoImg, sx+ts*0.2, sy+th*0.15, ts*2, ts*1.5);
    }

    // Banner text
    ctx.fillStyle='#ffd700';
    ctx.font=`bold ${ts*0.38}px "Orbitron",monospace`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('WLD FoxWave ARDF', sx+tw/2, sy+th*0.6);

    // Antenna mast
    ctx.strokeStyle='#aaa'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(sx+tw-ts*0.5,sy+th*0.1); ctx.lineTo(sx+tw-ts*0.5,sy-ts*3); ctx.stroke();
    // Signal rings
    for(let i=1;i<=3;i++){
        const a=Math.max(0,Math.sin(t/600-i*0.5))*0.55;
        ctx.strokeStyle=`rgba(255,215,0,${a})`; ctx.lineWidth=1.5;
        ctx.beginPath(); ctx.arc(sx+tw-ts*0.5,sy-ts*3,i*9,-Math.PI*0.65,-Math.PI*0.1); ctx.stroke();
        ctx.beginPath(); ctx.arc(sx+tw-ts*0.5,sy-ts*3,i*9,-Math.PI*0.9,-Math.PI*0.35); ctx.stroke();
    }

    ctx.textBaseline='alphabetic';
}

// ── Fountain ──────────────────────────────────────────────────────────────────
function _drawFountain(ctx, ts, t) {
    const cx=49.5*ts, cy=22.5*ts;
    ctx.beginPath(); ctx.arc(cx,cy,ts*2.2,0,Math.PI*2);
    ctx.fillStyle='#1a6aaa'; ctx.fill();
    ctx.strokeStyle='#6ab4e8'; ctx.lineWidth=3; ctx.stroke();
    for(let i=0;i<8;i++){
        const a=(i/8)*Math.PI*2+t/1200, jh=ts*0.85+Math.sin(t/400+i)*ts*0.18;
        ctx.strokeStyle='rgba(140,210,255,0.65)'; ctx.lineWidth=2;
        ctx.beginPath();
        ctx.moveTo(cx+Math.cos(a)*ts*0.4, cy+Math.sin(a)*ts*0.4);
        ctx.quadraticCurveTo(cx+Math.cos(a)*ts*0.9, cy+Math.sin(a)*ts*0.9-jh*0.4, cx+Math.cos(a)*ts*0.8, cy+Math.sin(a)*ts*0.8-jh);
        ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(cx,cy,ts*0.3,0,Math.PI*2);
    ctx.fillStyle='#4db8e8'; ctx.fill();
    ctx.fillStyle='#44aaff';
    ctx.font=`bold ${ts*0.5}px "Orbitron",monospace`;
    ctx.textAlign='center'; ctx.textBaseline='bottom';
    ctx.fillText('⛲', cx, cy-ts*2.3);
    ctx.textBaseline='alphabetic';
}

function _drawPlayground(ctx, ts) {
    const cx=(4+17)/2*ts, cy=(6+15)/2*ts;
    ctx.fillStyle='#ffd700';
    ctx.font=`bold ${ts*0.55}px "Orbitron",monospace`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('🎠 SPEELTUIN', cx, cy);
    ctx.fillStyle='#d4770a';
    ctx.font=`${ts*0.35}px "Share Tech Mono",monospace`;
    ctx.fillText('Speelpark', cx, cy+ts*0.7);
    ctx.textBaseline='alphabetic';
}

function _drawZoo(ctx, ts) {
    const cx=(61+75)/2*ts, cy=(6+15)/2*ts;
    ctx.strokeStyle='#8B6914'; ctx.lineWidth=3;
    ctx.setLineDash([5,4]); ctx.strokeRect(61*ts+2,6*ts+2,(75-61)*ts-4,(15-6)*ts-4); ctx.setLineDash([]);
    ctx.fillStyle='#ffd700';
    ctx.font=`bold ${ts*0.55}px "Orbitron",monospace`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('🦁 ZOO', cx, cy);
    ctx.textBaseline='alphabetic';
}

function _drawCafe(ctx, ts) {
    const x1=61*ts,y1=43*ts,x2=75*ts,y2=53*ts,cx=(x1+x2)/2;
    ctx.fillStyle='#8a6030'; ctx.fillRect(x1,y1,x2-x1,y2-y1);
    ctx.fillStyle='#cc2020'; ctx.fillRect(x1-4,y1-ts*0.35,x2-x1+8,ts*0.5);
    ctx.fillStyle='#87ceeb';
    [[x1+ts*0.4,y1+ts*0.5],[x1+ts*1.9,y1+ts*0.5],[x1+ts*3.3,y1+ts*0.5]].forEach(([wx,wy])=>{
        ctx.fillRect(wx,wy,ts*0.9,ts*0.9);
        ctx.strokeStyle='#5a3a10'; ctx.lineWidth=2; ctx.strokeRect(wx,wy,ts*0.9,ts*0.9);
    });
    ctx.fillStyle='#4a2a08'; ctx.fillRect(cx-ts*0.45,y2-ts*1.5,ts*0.9,ts*1.5);
    ctx.fillStyle='#ffd700';
    ctx.font=`bold ${ts*0.42}px "Orbitron",monospace`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('☕ BRASSERIE', cx, y1+ts*1.9);
    ctx.textBaseline='alphabetic';
}

function _drawTouristTrain(ctx, ts, t) {
    const total=244, speed=18;
    const pos=((t/1000)*speed/total%1)*total;
    let bx,by,ang;
    if(pos<73){bx=3+pos;by=5;ang=90;}
    else if(pos<122){bx=76;by=5+pos-73;ang=180;}
    else if(pos<195){bx=76-(pos-122);by=54;ang=270;}
    else{bx=3;by=54-(pos-195);ang=0;}

    ctx.save();
    ctx.translate((bx+0.5)*ts,(by+0.5)*ts);
    ctx.rotate(ang*Math.PI/180);
    const w=ts*1.8,h=ts*0.68;
    ctx.fillStyle='#cc1818'; ctx.roundRect(-w/2,-h/2,w,h,5); ctx.fill();
    ctx.fillStyle='#87ceeb';
    for(let i=0;i<3;i++) ctx.fillRect(-w/2+5+i*(w/3.2),-h/2+5,w/4.2,h-10);
    ctx.fillStyle='#222';
    for(const wx of[-w*0.32,w*0.22]){ctx.beginPath();ctx.arc(wx,h/2,4,0,Math.PI*2);ctx.fill();}
    ctx.fillStyle='#ffee88'; ctx.beginPath();ctx.arc(w/2-3,0,4,0,Math.PI*2);ctx.fill();
    ctx.restore();
}

// ── Fox markers ───────────────────────────────────────────────────────────────
function _drawFoxMarkers(ctx, ts, t) {
    for (const b of getBeacons()) {
        const dist=Math.hypot(b.x-Player.x, b.y-Player.y);
        const cx=b.x*ts+ts/2, cy=b.y*ts+ts/2;
        if (b.found) {
            // Flag post
            ctx.strokeStyle='#888'; ctx.lineWidth=2;
            ctx.beginPath();ctx.moveTo(cx,cy+ts*0.4);ctx.lineTo(cx,cy-ts*0.5);ctx.stroke();
            ctx.fillStyle=b.color;
            ctx.beginPath();ctx.moveTo(cx,cy-ts*0.5);ctx.lineTo(cx+ts*0.6,cy-ts*0.2);ctx.lineTo(cx,cy+ts*0.05);ctx.closePath();ctx.fill();
            ctx.fillStyle='#fff';
            ctx.font=`bold ${ts*0.3}px "Orbitron",monospace`;
            ctx.textAlign='center'; ctx.textBaseline='bottom';
            ctx.fillText(b.code,cx,cy-ts*0.5);
            ctx.textBaseline='alphabetic';
        } else if (dist<CONFIG.FOX_DETECTION_RADIUS+2) {
            const pct=1-dist/(CONFIG.FOX_DETECTION_RADIUS+2);
            const pulse=Math.abs(Math.sin(t/350));
            ctx.beginPath(); ctx.arc(cx,cy,ts*1.4*pct,0,Math.PI*2);
            ctx.fillStyle=`rgba(255,215,0,${pct*pulse*0.55})`; ctx.fill();
        }
    }
}

// ── Receiver beam glow ────────────────────────────────────────────────────────
function _drawBeamGlow(ctx, px, py, ts, t) {
    const pulse=0.35+0.25*Math.sin(t/300);
    const brg=Player.receiverBearing;
    const hw=CONFIG.RECEIVER_BEAMWIDTH;
    const a0=(brg-hw-90)*Math.PI/180, a1=(brg+hw-90)*Math.PI/180;
    const r=ts*CONFIG.FOX_AUDIO_RADIUS*0.32;
    const g=ctx.createRadialGradient(px,py,0,px,py,r);
    g.addColorStop(0,`rgba(74,222,128,${pulse*0.4})`);
    g.addColorStop(0.6,`rgba(74,222,128,${pulse*0.12})`);
    g.addColorStop(1,'rgba(74,222,128,0)');
    ctx.beginPath(); ctx.moveTo(px,py); ctx.arc(px,py,r,a0,a1); ctx.closePath();
    ctx.fillStyle=g; ctx.fill();
}

// ── Player ────────────────────────────────────────────────────────────────────
function _drawPlayer(ctx, px, py, ts, facing, t, gameState) {
    const R = ts * 0.28;  // body radius
    const isReceiver = gameState === STATE.RECEIVER;
    const bob = (gameState === STATE.HUNTING) ? Math.sin(t/140)*1.8 : 0;

    ctx.save();
    ctx.translate(px, py + bob);
    ctx.rotate(facing * Math.PI / 180);

    // ── Antenna (drawn first, so behind head) ─────────────────────────────────
    // Yagi-style: long boom + 3 elements, extends 3× tile height above player
    const antBase = -R * 1.2;          // just above head
    const antTop  = -R * 1.2 - ts * 2.8; // HIGH up — very visible

    if (isReceiver) {
        // Loop antenna in receiver mode: large circle on a stick
        ctx.strokeStyle = '#e8e8e8'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(0, antBase); ctx.lineTo(0, antBase - ts*0.8); ctx.stroke();
        // Loop
        ctx.beginPath(); ctx.arc(0, antBase - ts*0.8 - ts*0.55, ts*0.55, 0, Math.PI*2);
        ctx.strokeStyle = '#ffdd44'; ctx.lineWidth = 3; ctx.stroke();
        // Loop fill tint
        ctx.fillStyle='rgba(255,220,60,0.08)'; ctx.fill();
        // Centre cross
        ctx.strokeStyle='#ffdd44'; ctx.lineWidth=1.5;
        ctx.beginPath(); ctx.moveTo(-ts*0.3,antBase-ts*1.35); ctx.lineTo(ts*0.3,antBase-ts*1.35); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0,antBase-ts*0.8-ts*0.1); ctx.lineTo(0,antBase-ts*1.6); ctx.stroke();
    } else {
        // Yagi directional antenna
        ctx.strokeStyle = '#cccccc'; ctx.lineWidth = 2.5;
        // Boom
        ctx.beginPath(); ctx.moveTo(0, antBase); ctx.lineTo(0, antTop); ctx.stroke();
        // Elements (directors)
        const elemPositions = [0.25, 0.50, 0.75];
        const elemLengths   = [ts*0.55, ts*0.48, ts*0.40];
        for (let i=0; i<3; i++) {
            const ey = antBase + (antTop - antBase) * elemPositions[i];
            const ew = elemLengths[i];
            ctx.strokeStyle = i===0 ? '#ffdd44' : '#aaaaaa';
            ctx.lineWidth = i===0 ? 3 : 2;
            ctx.beginPath(); ctx.moveTo(-ew/2, ey); ctx.lineTo(ew/2, ey); ctx.stroke();
        }
        // Reflector (base, longest)
        ctx.strokeStyle='#888888'; ctx.lineWidth=2;
        ctx.beginPath(); ctx.moveTo(-ts*0.28, antBase+2); ctx.lineTo(ts*0.28, antBase+2); ctx.stroke();
    }

    // ── Receiver device (in hand) ─────────────────────────────────────────────
    const devX = R * 0.6, devY = -R * 0.1;
    const devW = R * 0.95, devH = R * 0.65;

    // Device body
    ctx.fillStyle = '#2a2a2a';
    ctx.roundRect(devX, devY - devH/2, devW, devH, 3);
    ctx.fill();
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1; ctx.stroke();

    // LCD screen
    ctx.fillStyle = '#001100';
    ctx.fillRect(devX + 3, devY - devH/2 + 3, devW - 6, devH*0.55);
    ctx.fillStyle = '#00ff44';
    ctx.font = `bold ${devH*0.28}px "Share Tech Mono",monospace`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(isReceiver ? '3.560' : '80m', devX+4, devY-devH/2+4);

    // Knob
    ctx.fillStyle='#555';
    ctx.beginPath(); ctx.arc(devX+devW-5, devY+devH*0.08, 4, 0, Math.PI*2); ctx.fill();

    // Short whip antenna on device
    ctx.strokeStyle='#aaa'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(devX+devW*0.7,devY-devH/2); ctx.lineTo(devX+devW*0.85,devY-devH/2-ts*0.35); ctx.stroke();

    // ── Shadow ────────────────────────────────────────────────────────────────
    ctx.fillStyle='rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(2, R*0.4-bob, R*0.6, R*0.18, 0, 0, Math.PI*2); ctx.fill();

    // ── Body ─────────────────────────────────────────────────────────────────
    const bg=ctx.createRadialGradient(-R*0.25,-R*0.2,0,0,0,R);
    bg.addColorStop(0,'#3aaa3a'); bg.addColorStop(1,'#0f5010');
    ctx.beginPath(); ctx.ellipse(0,0,R,R*1.15,0,0,Math.PI*2);
    ctx.fillStyle=bg; ctx.fill();

    // Backpack
    ctx.fillStyle='#0d2d0d';
    ctx.beginPath(); ctx.ellipse(0,R*0.3,R*0.52,R*0.62,0,0,Math.PI*2); ctx.fill();

    // Head
    ctx.fillStyle='#f4c090';
    ctx.beginPath(); ctx.arc(0,-R*0.92,R*0.36,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#7a4a18';
    ctx.beginPath(); ctx.arc(0,-R*1.05,R*0.28,Math.PI,0); ctx.fill();

    ctx.restore();
    ctx.textBaseline='alphabetic'; ctx.textAlign='left';
}

// ── NPC ARDF hunters ─────────────────────────────────────────────────────────
function _drawNPC(ctx, npc, ts, t, gameState) {
    const R  = ts * 0.23;
    const px = (npc.x + 0.5) * ts;
    const py = (npc.y + 0.5) * ts;

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(npc.facing * Math.PI / 180);

    // Yagi antenna
    const antBase = -R * 1.1, antTop = -R * 1.1 - ts * 2.0;
    ctx.strokeStyle='#bbbbbb'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(0,antBase); ctx.lineTo(0,antTop); ctx.stroke();
    const epos=[0.3,0.6]; const elen=[ts*0.42,ts*0.32];
    for(let i=0;i<2;i++){
        const ey=antBase+(antTop-antBase)*epos[i];
        ctx.strokeStyle=i===0?'#ffcc44':'#999';ctx.lineWidth=i===0?2.5:1.5;
        ctx.beginPath();ctx.moveTo(-elen[i]/2,ey);ctx.lineTo(elen[i]/2,ey);ctx.stroke();
    }

    // Body
    ctx.fillStyle=npc.color;
    ctx.beginPath();ctx.ellipse(0,0,R,R*1.1,0,0,Math.PI*2);ctx.fill();

    // Head
    ctx.fillStyle='#f4c090';
    ctx.beginPath();ctx.arc(0,-R*0.88,R*0.32,0,Math.PI*2);ctx.fill();

    // Small receiver device
    ctx.fillStyle='#2a2a2a';
    ctx.fillRect(R*0.5,-R*0.2,R*0.75,R*0.5);
    ctx.fillStyle='#00ff88';
    ctx.font=`${R*0.38}px "Share Tech Mono",monospace`;
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText('RX',R*0.875,-R*0.04);

    ctx.restore();

    // Callsign label (screen-space, not rotated)
    ctx.fillStyle='rgba(0,0,0,0.65)';
    ctx.fillRect(px-ts*0.7, py-ts*2.65, ts*1.4, ts*0.38);
    ctx.fillStyle=npc.color;
    ctx.font=`bold ${ts*0.28}px "Orbitron",monospace`;
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(npc.callsign, px, py-ts*2.46);
    ctx.textBaseline='alphabetic';ctx.textAlign='left';
}

// ── HUD ───────────────────────────────────────────────────────────────────────
function _drawHUD(ctx, W, H, gameState, t) {
    const barH = 50;
    ctx.fillStyle='rgba(2,8,2,0.88)';
    ctx.fillRect(0,0,W,barH);
    ctx.fillStyle='#1a4a1a';
    ctx.fillRect(0,barH,W,2);

    // Title
    ctx.fillStyle='#ffd700';
    ctx.font='bold 16px "Orbitron",monospace';
    ctx.textAlign='left';ctx.textBaseline='middle';
    ctx.fillText('🦊 WLD FoxWave ARDF',14,25);

    // Timer
    ctx.fillStyle='#4ade80';
    ctx.font='bold 22px "Share Tech Mono",monospace';
    ctx.textAlign='center';
    ctx.fillText('⏱ '+Player.getElapsedString(),W/2,25);

    // Fox count
    ctx.fillStyle='#ffd700';
    ctx.font='bold 16px "Orbitron",monospace';
    ctx.textAlign='right';
    ctx.fillText(`🦊 ${Player.foundFoxes.size}/${CONFIG.FOX_COUNT}`,W-14,25);

    // Mode label
    const modes={
        [STATE.HUNTING]:'▶ HUNTING',[STATE.RECEIVER]:'📡 RECEIVER',
        [STATE.MAP_VIEW]:'🗺 KAART',[STATE.BRIEFING]:'🏕 KLAAR',
        [STATE.FINISHED]:'🏁 TERUG!',
    };
    const modeColors={
        [STATE.HUNTING]:'#4ade80',[STATE.RECEIVER]:'#ffd700',
        [STATE.MAP_VIEW]:'#44aaff',[STATE.FINISHED]:'#ff8844',
    };
    ctx.fillStyle=modeColors[gameState]||'#888';
    ctx.font='12px "Share Tech Mono",monospace';
    ctx.textAlign='center';
    ctx.fillText(modes[gameState]||'',W/2,42);

    // ? hint key reminder
    ctx.fillStyle='#3a6a3a';
    ctx.font='11px "Share Tech Mono",monospace';
    ctx.textAlign='right';
    ctx.fillText('[?] Vraag hint ON4BB',W-14,42);

    ctx.textBaseline='alphabetic';ctx.textAlign='left';
}

// ── ON4BB VHF Hint overlay ────────────────────────────────────────────────────
function _drawON4BBHint(ctx, W, H, t) {
    const bw=380, bh=170;
    const bx=W/2-bw/2, by=H/2-bh/2;

    // Radio device background
    const rg=ctx.createLinearGradient(bx,by,bx,by+bh);
    rg.addColorStop(0,'#1a2a1a');rg.addColorStop(1,'#0a180a');
    ctx.fillStyle=rg; ctx.roundRect(bx,by,bw,bh,10); ctx.fill();
    ctx.strokeStyle='#2a6a2a';ctx.lineWidth=2; ctx.stroke();

    // "Radio" header with antenna icon
    ctx.fillStyle='#ffd700';
    ctx.font='bold 13px "Orbitron",monospace';
    ctx.textAlign='center';ctx.textBaseline='top';
    ctx.fillText('📻  VHF PORTABLE TRANSCEIVER',W/2,by+10);

    // Frequency display
    ctx.fillStyle='#001500';
    ctx.fillRect(bx+12,by+34,bw-24,36);
    ctx.fillStyle='#00ff44';
    ctx.font='bold 22px "Share Tech Mono",monospace';
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(`${CONFIG.WLD_VHF_FREQ} MHz  FM`, W/2, by+52);

    ctx.fillStyle='#3a6a3a';
    ctx.font='10px "Share Tech Mono",monospace';
    ctx.fillText('WLD CLUBFREQUENTIE 2m', W/2, by+76);

    // Speech bubble divider
    ctx.strokeStyle='#2a5a2a';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(bx+16,by+88);ctx.lineTo(bx+bw-16,by+88);ctx.stroke();

    // ON4BB callsign label
    ctx.fillStyle='#44aaff';
    ctx.font='bold 13px "Orbitron",monospace';
    ctx.fillText(CONFIG.ON4BB_CALLSIGN+' zegt:', W/2, by+98);

    // Hint message
    ctx.fillStyle='#ffffff';
    ctx.font='bold 14px "Share Tech Mono",monospace';
    const lines=_wrapText(Player.hintText, 40);
    lines.forEach((ln,i)=>ctx.fillText(ln,W/2,by+114+i*18));

    // Close hint indicator
    ctx.fillStyle='#3a5a3a';
    ctx.font='10px "Share Tech Mono",monospace';
    ctx.fillText('[?] of [Esc] sluiten',W/2,by+bh-8);

    ctx.textBaseline='alphabetic';ctx.textAlign='left';
}

function _wrapText(text, maxChars) {
    const words=text.split(' ');
    const lines=[];
    let cur='';
    for(const w of words){
        if(cur.length+w.length+1>maxChars){lines.push(cur.trim());cur='';}
        cur+=w+' ';
    }
    if(cur.trim()) lines.push(cur.trim());
    return lines;
}

// ── Return-to-tent banner ─────────────────────────────────────────────────────
function _drawReturnBanner(ctx, W, H, t) {
    const alpha=0.7+0.3*Math.sin(t/400);
    ctx.fillStyle=`rgba(2,8,2,${alpha*0.92})`;
    ctx.fillRect(0,H-70,W,70);
    ctx.strokeStyle=`rgba(255,215,0,${alpha})`;ctx.lineWidth=2;
    ctx.strokeRect(0,H-70,W,70);
    ctx.fillStyle=`rgba(255,215,0,${alpha})`;
    ctx.font='bold 22px "Orbitron",monospace';
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText('🏁  ALLE VOSSEN GEVONDEN!  Keer terug naar het WLD-tent!',W/2,H-35);
    ctx.textBaseline='alphabetic';ctx.textAlign='left';
}

function _drawVignette(ctx, W, H) {
    const g=ctx.createRadialGradient(W/2,H/2,H*0.28,W/2,H/2,H*0.82);
    g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,0.48)');
    ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
}
