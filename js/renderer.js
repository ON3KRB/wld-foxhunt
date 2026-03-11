/**
 * renderer.js - Minecraft-style DDA raycaster
 * WLD FoxWave ARDF
 *
 * Features:
 *  - First-person DDA raycaster, 66° FOV
 *  - Flat-color Minecraft-style walls (no texture maps needed)
 *  - Y-side walls darker for 3D depth illusion
 *  - Distance fog blends to sky colour
 *  - Floor scan with tile-based colouring
 *  - Sprite pass: fox beacons + NPCs projected to screen
 *  - Mini-map overlay (bottom-left)
 *  - HUD bar (top)
 *  - ON4BB hint overlay when active
 */
"use strict";

// Polyfill roundRect
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x,y,w,h,r){
        r=Math.min(r,w/2,h/2);
        this.beginPath();
        this.moveTo(x+r,y);this.lineTo(x+w-r,y);this.arcTo(x+w,y,x+w,y+r,r);
        this.lineTo(x+w,y+h-r);this.arcTo(x+w,y+h,x+w-r,y+h,r);
        this.lineTo(x+r,y+h);this.arcTo(x,y+h,x,y+h-r,r);
        this.lineTo(x,y+r);this.arcTo(x,y,x+r,y,r);
        this.closePath();return this;
    };
}

let _wldLogoImg=null, _startStopImg=null;
function loadRendererAssets(cb){
    let n=2;
    const done=()=>{ if(--n===0&&cb)cb(); };
    (_wldLogoImg=new Image()).onload=(_wldLogoImg.onerror=done); _wldLogoImg.src='assets/wld-logo.png';
    (_startStopImg=new Image()).onload=(_startStopImg.onerror=done); _startStopImg.src='assets/start-stop.png';
}

// ── Wall colour palette ───────────────────────────────────────────────────────
// [R,G,B] bright face; Y-side will be * 0.65
const WALL_RGB = {
    [TILE.TREE]:        [55,140,30],
    [TILE.DENSE_TREE]:  [25, 80,12],
    [TILE.SHRUB]:       [80,160,45],
    [TILE.WATER]:       [30,120,200],
    [TILE.BUILDING]:    [170,130,70],
};

// Floor tile colours (Minecraft-style flat)
const FLOOR_RGB = {
    [TILE.GRASS]:   [72,140,55],
    [TILE.PATH]:    [185,155,85],
    [TILE.TRAIN]:   [165,135,70],
    [TILE.START]:   [210,175,0],
    [TILE.FLOWER]:  [85,155,60],
    [TILE.FOUNTAIN]:[40,120,200],
    [TILE.ZOO]:     [90,160,55],
};

const SKY_TOP = [100,185,230];
const SKY_HOR = [160,210,240];
const FOG_RGB = SKY_HOR;

// ── Main 3D render ────────────────────────────────────────────────────────────
function renderMainView(ctx, W, H, timestamp, gameState) {
    const px=Player.px, py=Player.py, ang=Player.viewAngle;

    // Direction & camera plane
    const dirX = Math.sin(ang), dirY=-Math.cos(ang);
    const planeMag = Math.tan(CONFIG.RC_FOV_DEG*Math.PI/360);
    const planeX = Math.cos(ang)*planeMag, planeY=Math.sin(ang)*planeMag;

    // --- Sky gradient ---
    const skyGrad=ctx.createLinearGradient(0,0,0,H*0.5);
    skyGrad.addColorStop(0,`rgb(${SKY_TOP.join(',')})`);
    skyGrad.addColorStop(1,`rgb(${SKY_HOR.join(',')})`);
    ctx.fillStyle=skyGrad; ctx.fillRect(0,0,W,H*0.5);

    // --- Floor scan (per-row perspective floor casting) ---
    _renderFloor(ctx, W, H, dirX, dirY, planeX, planeY);

    // --- Wall scan (per-column DDA raycasting) ---
    // Store depth buffer for sprites
    const zBuf = new Float32Array(W);
    _renderWalls(ctx, W, H, px, py, dirX, dirY, planeX, planeY, zBuf, timestamp);

    // --- Sprites (fox beacons + NPCs + tent) ---
    _renderSprites(ctx, W, H, px, py, dirX, dirY, planeX, planeY, planeMag, zBuf, timestamp);

    // --- Receiver in hands (weapon-style overlay, only in RECEIVER state) ---
    if (gameState === STATE.RECEIVER) {
        try { _drawReceiverHands(ctx, W, H, timestamp); }
        catch(e) { console.error('[ReceiverHands]', e); }
    }

    // --- HUD ---
    _drawHUD(ctx, W, H, gameState, timestamp);

    // --- Mini-map (secret: Tab key) ---
    if (window._showMiniMap) _drawMiniMap(ctx, W, H);

    // --- ON4BB hint ---
    if (Player.hintVisible) _drawON4BBHint(ctx, W, H);

    // --- "Return to tent" banner ---
    if (Player.allFoxesFound && (gameState===STATE.HUNTING||gameState===STATE.FINISHED))
        _drawReturnBanner(ctx, W, H, timestamp);

    // --- Receiver crosshair when receiver is on ---
    if (Player.receiverOn) _drawCrosshair(ctx, W, H, timestamp);
}

// ── Floor casting (per-row) ───────────────────────────────────────────────────
function _renderFloor(ctx, W, H, dirX, dirY, planeX, planeY) {
    // Pixel-by-pixel floor is slow in canvas 2D — use row-based bands instead
    // Each row at a given distance gets a flat floor colour based on its tile
    // We sample the floor tile at the row's centre-of-screen projection
    const horizon = H * 0.5;

    for (let row = Math.ceil(horizon); row < H; row++) {
        const rowD = row - horizon;
        if (rowD <= 0) continue;
        const rowDist = (H * 0.5) / rowD;

        // Floor tile at this distance straight ahead
        const fx = Math.floor(Player.px + dirX * rowDist);
        const fy = Math.floor(Player.py + dirY * rowDist);
        const tile = getTile(fx, fy);
        const [r,g,b] = FLOOR_RGB[tile] || FLOOR_RGB[TILE.GRASS];

        // Distance shade: darker near horizon
        const shade = Math.min(1, rowDist / 5);
        const sr = Math.floor(r * (0.35 + shade*0.65));
        const sg = Math.floor(g * (0.35 + shade*0.65));
        const sb = Math.floor(b * (0.35 + shade*0.65));

        ctx.fillStyle=`rgb(${sr},${sg},${sb})`;
        ctx.fillRect(0, row, W, 1);
    }
}

// ── DDA wall raycaster ────────────────────────────────────────────────────────
function _renderWalls(ctx, W, H, px, py, dirX, dirY, planeX, planeY, zBuf, t) {
    const FOG_DIST = 14; // tiles before full fog

    for (let col = 0; col < W; col++) {
        const camX = 2 * col / W - 1;
        const rDx = dirX + planeX*camX;
        const rDy = dirY + planeY*camX;

        let mapX=Math.floor(px), mapY=Math.floor(py);
        const ddX = Math.abs(rDx)<1e-10?1e10:Math.abs(1/rDx);
        const ddY = Math.abs(rDy)<1e-10?1e10:Math.abs(1/rDy);

        let stepX,stepY,sdX,sdY;
        if(rDx<0){stepX=-1;sdX=(px-mapX)*ddX;}else{stepX=1;sdX=(mapX+1-px)*ddX;}
        if(rDy<0){stepY=-1;sdY=(py-mapY)*ddY;}else{stepY=1;sdY=(mapY+1-py)*ddY;}

        let hit=false, side=0, maxS=48;
        while(!hit&&--maxS>0){
            if(sdX<sdY){sdX+=ddX;mapX+=stepX;side=0;}
            else       {sdY+=ddY;mapY+=stepY;side=1;}
            if(isSolid3D(mapX,mapY)) hit=true;
        }
        if(!hit){ zBuf[col]=999; continue; }

        const perpD = side===0 ? sdX-ddX : sdY-ddY;
        zBuf[col] = perpD;

        const wallH = Math.min(H, Math.ceil(H/perpD));
        const wTop  = Math.max(0, Math.floor((H-wallH)/2));
        const wBot  = Math.min(H, Math.ceil((H+wallH)/2));

        const tile = getTile(mapX, mapY);
        let [r,g,b] = WALL_RGB[tile] || [140,140,140];

        // Y-side darker (Minecraft directional shading)
        if(side===1){ r=Math.floor(r*0.65); g=Math.floor(g*0.65); b=Math.floor(b*0.65); }

        // Distance fog → sky colour
        const fog = Math.min(1, perpD / FOG_DIST);
        r = Math.floor(r + (FOG_RGB[0]-r)*fog);
        g = Math.floor(g + (FOG_RGB[1]-g)*fog);
        b = Math.floor(b + (FOG_RGB[2]-b)*fog);

        // Brick-like bands for Minecraft feel (every ~H/8 pixels, slightly darker)
        const wallPixelY = (col + Math.floor(t/200)) % 24;
        if (wallPixelY < 2) { r=Math.floor(r*0.85); g=Math.floor(g*0.85); b=Math.floor(b*0.85); }

        ctx.fillStyle=`rgb(${r},${g},${b})`;
        ctx.fillRect(col, wTop, 1, wBot-wTop);
    }
}

// ── Sprite rendering ──────────────────────────────────────────────────────────
function _renderSprites(ctx, W, H, px, py, dirX, dirY, planeX, planeY, planeMag, zBuf, t) {
    const sprites = [];

    // Fox beacons
    for (const b of getBeacons()) {
        const d = Math.hypot(b.x+0.5-px, b.y+0.5-py);
        sprites.push({ x:b.x+0.5, y:b.y+0.5, dist:d, type:'fox', beacon:b });
    }
    // NPCs
    for (const npc of getNPCs()) {
        const d = Math.hypot(npc.px-px, npc.py-py);
        sprites.push({ x:npc.px, y:npc.py, dist:d, type:'npc', npc });
    }
    // WLD Tent (fixed position near start)
    const tentX = CONFIG.PLAYER_START_X + 2.5, tentY = CONFIG.PLAYER_START_Y - 1.5;
    sprites.push({ x:tentX, y:tentY, dist:Math.hypot(tentX-px,tentY-py), type:'tent' });
    // Sort back-to-front
    sprites.sort((a,b)=>b.dist-a.dist);

    const invDet = 1/(planeX*dirY - dirX*planeY);

    for (const sp of sprites) {
        const sRelX = sp.x - px, sRelY = sp.y - py;
        const tX = invDet*(dirY*sRelX - dirX*sRelY);
        const tY = invDet*(-planeY*sRelX + planeX*sRelY);
        if (tY <= 0.1) continue; // behind player

        const sprScreenX = Math.floor(W/2*(1+tX/tY));
        const sprH = Math.abs(Math.floor(H/tY));
        const sprW = sprH;
        const drawX = sprScreenX - sprW/2;
        const drawY = (H-sprH)/2;

        if (sp.type === 'fox') {
            const b = sp.beacon;
            if (b.found) {
                // Found flag
                _drawSpriteFlag(ctx, drawX, drawY, sprW, sprH, b.color, b.code, tY, zBuf, W);
            } else if (sp.dist < 3) {
                // Very close — pulsing glow
                _drawSpriteGlow(ctx, drawX, drawY, sprW, sprH, b.color, tY, zBuf, W, t);
            }
        } else if (sp.type === 'tent') {
            try { _drawSpriteTent(ctx, drawX, drawY, sprW, sprH, sp.dist, tY, zBuf, W, timestamp); }
            catch(e) { console.error('[Tent sprite]',e); }
        } else if (sp.type === 'npc' && sp.dist < 20) {
            _drawSpriteNPC(ctx, drawX, drawY, sprW, sprH, sp.npc, tY, zBuf, W, t);
        }
    }
}

function _drawSpriteFlag(ctx, dx, dy, sw, sh, color, code, tY, zBuf, W) {
    const cx=dx+sw/2;
    if (cx<0||cx>W) return;
    const ci=Math.floor(cx);
    if (ci>0&&ci<W&&zBuf[ci]<tY) return; // occluded
    ctx.fillStyle=color;
    ctx.fillRect(dx+sw*0.45, dy, sw*0.1, sh);
    ctx.beginPath();
    ctx.moveTo(dx+sw*0.45,dy);
    ctx.lineTo(dx+sw*0.9,dy+sh*0.15);
    ctx.lineTo(dx+sw*0.45,dy+sh*0.3);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle='#fff';
    ctx.font=`bold ${Math.max(10,sw*0.25)}px "Orbitron",monospace`;
    ctx.textAlign='center'; ctx.textBaseline='bottom';
    ctx.fillText(code, cx, dy);
    ctx.textBaseline='alphabetic';
}

function _drawSpriteGlow(ctx, dx, dy, sw, sh, color, tY, zBuf, W, t) {
    const ci=Math.floor(dx+sw/2);
    if(ci<=0||ci>=W||zBuf[ci]<tY) return;
    const pulse=0.4+0.4*Math.sin(t/250);
    ctx.fillStyle=color.replace('#','rgba(').replace(/([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i,
        (_,r,g,b)=>`${parseInt(r,16)},${parseInt(g,16)},${parseInt(b,16)},${pulse})`);
    ctx.beginPath();
    ctx.arc(dx+sw/2, dy+sh/2, sw*0.4, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle='#ffd700';
    ctx.font=`bold ${Math.max(14,sw*0.3)}px serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('🦊', dx+sw/2, dy+sh/2);
    ctx.textBaseline='alphabetic';
}

function _drawSpriteTent(ctx, dx, dy, sw, sh, dist, tY, zBuf, W, t) {
    if (dist > 22) return;
    const cx = dx + sw/2;
    if (cx < -sw || cx > W + sw) return;
    const ci = Math.floor(cx);
    if (ci > 0 && ci < W && zBuf[ci] < tY) return; // behind wall

    // Scale: tent is 2 tiles wide, 1.5 tiles tall
    const tw = sw * 2.2, th = sh * 1.6;
    const tx = cx - tw/2, ty = dy - th * 0.1;

    // Fog factor
    const fog = Math.min(1, dist / 14);
    const alpha = Math.max(0.3, 1 - fog * 0.5);
    ctx.save();
    ctx.globalAlpha = alpha;

    // Ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(tx + tw*0.08, ty+th*0.92, tw*0.84, th*0.08);

    // Tent body (blue fabric)
    ctx.fillStyle = '#1a3a9a';
    ctx.beginPath();
    ctx.moveTo(tx, ty+th*0.55);
    ctx.lineTo(tx+tw*0.5, ty+th*0.55);
    ctx.lineTo(tx+tw*0.5, ty+th);
    ctx.lineTo(tx, ty+th);
    ctx.closePath(); ctx.fill();

    ctx.fillStyle = '#1a3a9a';
    ctx.beginPath();
    ctx.moveTo(tx+tw*0.5, ty+th*0.55);
    ctx.lineTo(tx+tw, ty+th*0.55);
    ctx.lineTo(tx+tw, ty+th);
    ctx.lineTo(tx+tw*0.5, ty+th);
    ctx.closePath(); ctx.fill();

    // Door opening
    ctx.fillStyle = '#0a1a0a';
    ctx.fillRect(tx+tw*0.38, ty+th*0.62, tw*0.24, th*0.38);

    // Tent roof/canopy (red-white striped)
    const strips = 6;
    for (let i = 0; i < strips; i++) {
        ctx.fillStyle = i%2===0 ? '#cc1818' : '#ffffff';
        ctx.beginPath();
        ctx.moveTo(tx + i*(tw/strips),      ty+th*0.55);
        ctx.lineTo(tx + (i+1)*(tw/strips),  ty+th*0.55);
        ctx.lineTo(tx + tw/2 + (i+1-(strips/2))*(tw/strips*0.6), ty);
        ctx.lineTo(tx + tw/2 + (i-(strips/2))*(tw/strips*0.6),   ty);
        ctx.closePath(); ctx.fill();
    }
    // Roof ridge line
    ctx.strokeStyle='#881010'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(tx+tw*0.5, ty); ctx.lineTo(tx+tw*0.5, ty+th*0.55); ctx.stroke();

    // WLD banner on tent
    if (dist < 12 && sw > 30) {
        ctx.fillStyle = '#ffd700';
        ctx.font = `bold ${Math.max(9, sw*0.18)}px "Orbitron",monospace`;
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText('WLD', cx, ty+th*0.75);
    }

    // Start/stop machine (little box on table in front)
    if (dist < 8) {
        ctx.fillStyle = '#ccc';
        ctx.fillRect(cx-tw*0.15, ty+th*0.88, tw*0.3, th*0.08);
        ctx.fillStyle='#ff8800';
        ctx.font=`bold ${Math.max(6,sw*0.1)}px "Share Tech Mono",monospace`;
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText('STOP', cx, ty+th*0.92);
    }

    // Antenna mast on tent
    ctx.strokeStyle='#aaa'; ctx.lineWidth=2;
    ctx.beginPath();
    ctx.moveTo(tx+tw*0.85, ty+th*0.55);
    ctx.lineTo(tx+tw*0.85, ty-th*0.4);
    ctx.stroke();
    // Signal rings
    const pulse=Math.sin(t/600)*0.4+0.5;
    [1,2,3].forEach(i=>{
        ctx.strokeStyle=`rgba(255,215,0,${Math.max(0, pulse-i*0.15)})`;
        ctx.lineWidth=1.5;
        ctx.beginPath();
        ctx.arc(tx+tw*0.85, ty-th*0.4, i*8, -Math.PI*0.7, -Math.PI*0.1);
        ctx.stroke();
    });

    ctx.globalAlpha=1;
    ctx.restore();
}

// ── Receiver held in player hands (FPS weapon overlay) ───────────────────────
function _drawReceiverHands(ctx, W, H, t) {
    // Draw in bottom-right corner, like a first-person held item
    const bx = W * 0.55;   // left edge of the device
    const by = H * 0.58;   // top of the device
    const bw = W * 0.38;
    const bh = H * 0.36;

    // Bob animation when walking
    const bobY = Math.sin(t/220) * 5;
    const bobX = Math.cos(t/440) * 3;

    ctx.save();
    ctx.translate(bobX, bobY);

    // ── HANDS ──────────────────────────────────────────────────────────────────
    // Left hand (holding left side of device)
    ctx.fillStyle = '#c8854a';
    ctx.beginPath();
    ctx.ellipse(bx - 8, by + bh*0.55, 18, 22, -0.2, 0, Math.PI*2); ctx.fill();
    // Right hand (holding right side)
    ctx.beginPath();
    ctx.ellipse(bx+bw+8, by+bh*0.55, 18, 22, 0.2, 0, Math.PI*2); ctx.fill();
    // Knuckle lines
    ctx.strokeStyle='#a06030'; ctx.lineWidth=1;
    [-6,-1,4].forEach(dy2=>{
        ctx.beginPath(); ctx.arc(bx-8, by+bh*0.55+dy2, 14, 0.3, Math.PI-0.3); ctx.stroke();
        ctx.beginPath(); ctx.arc(bx+bw+8, by+bh*0.55+dy2, 14, 0.3, Math.PI-0.3); ctx.stroke();
    });

    // ── DEVICE BODY ────────────────────────────────────────────────────────────
    const dg = ctx.createLinearGradient(bx, by, bx, by+bh);
    dg.addColorStop(0, '#2e2e2e');
    dg.addColorStop(0.5, '#3a3a3a');
    dg.addColorStop(1, '#1a1a1a');
    ctx.fillStyle = dg;
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 8); ctx.fill();
    ctx.strokeStyle='#4a4a4a'; ctx.lineWidth=1.5; ctx.stroke();

    // ── LCD SCREEN ─────────────────────────────────────────────────────────────
    const scrX=bx+bw*0.1, scrY=by+bh*0.08, scrW=bw*0.55, scrH=bh*0.38;
    ctx.fillStyle='#001800'; ctx.fillRect(scrX, scrY, scrW, scrH);
    ctx.strokeStyle='#2a5a2a'; ctx.lineWidth=1; ctx.strokeRect(scrX,scrY,scrW,scrH);
    ctx.fillStyle='#00ff55';
    ctx.font=`bold ${Math.floor(scrH*0.28)}px "Share Tech Mono",monospace`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('3.560 MHz', scrX+scrW/2, scrY+scrH*0.35);
    ctx.fillStyle='#00cc44';
    ctx.font=`${Math.floor(scrH*0.22)}px "Share Tech Mono",monospace`;
    ctx.fillText('CW  80m', scrX+scrW/2, scrY+scrH*0.68);

    // ── CONTROLS RIGHT SIDE ────────────────────────────────────────────────────
    // Volume knob
    const knobX=bx+bw*0.78, knobY=by+bh*0.22;
    ctx.fillStyle='#222'; ctx.beginPath(); ctx.arc(knobX,knobY,bw*0.07,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#555'; ctx.lineWidth=1; ctx.stroke();
    // Knob indicator line (rotates with time)
    ctx.strokeStyle='#ffdd44'; ctx.lineWidth=2;
    ctx.beginPath();
    ctx.moveTo(knobX,knobY);
    ctx.lineTo(knobX+Math.cos(-0.8)*bw*0.055, knobY+Math.sin(-0.8)*bw*0.055);
    ctx.stroke();

    // Bearing LED display
    const ledX=bx+bw*0.68, ledY=scrY+scrH+bh*0.06, ledW=bw*0.28, ledH=bh*0.16;
    ctx.fillStyle='#001000'; ctx.fillRect(ledX,ledY,ledW,ledH);
    ctx.strokeStyle='#1a3a1a'; ctx.lineWidth=1; ctx.strokeRect(ledX,ledY,ledW,ledH);
    ctx.fillStyle='#44ff88';
    ctx.font=`bold ${Math.floor(ledH*0.62)}px "Share Tech Mono",monospace`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(String(Math.round(Player.receiverBearing)).padStart(3,'0')+'°', ledX+ledW/2, ledY+ledH/2);

    // Headphone jack
    ctx.fillStyle='#111';
    ctx.beginPath(); ctx.arc(bx+bw*0.12, by+bh*0.85, bw*0.03, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle='#444'; ctx.lineWidth=1; ctx.stroke();
    ctx.fillStyle='#555';
    ctx.font=`${Math.floor(bh*0.07)}px "Share Tech Mono",monospace`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('🎧', bx+bw*0.12, by+bh*0.92);

    // ── MAGNETIC LOOP ANTENNA (attached to top of device) ─────────────────────
    const loopCX = bx + bw*0.35;
    const loopCY = by - bh*0.22;
    const loopR  = Math.min(bw*0.32, bh*0.32);
    const loopAngle = Player.receiverBearing * Math.PI/180;
    const dom = getDominantSignal(Player.x, Player.y, Player.receiverBearing);
    const sig = dom ? dom.signal : 0;

    ctx.save();
    ctx.translate(loopCX, loopCY);
    ctx.rotate(loopAngle);

    // Mast
    ctx.strokeStyle='#888'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(0, loopR+8); ctx.lineTo(0, -loopR-8); ctx.stroke();

    // Signal glow
    if (sig > 0.02) {
        const g = ctx.createRadialGradient(0,0,loopR*0.3,0,0,loopR*1.6);
        const a = Math.min(0.55, sig * 0.8 + Math.sin(t/180)*0.1*sig);
        g.addColorStop(0,`rgba(255,215,0,${a})`); g.addColorStop(1,'rgba(255,215,0,0)');
        ctx.fillStyle=g; ctx.beginPath(); ctx.arc(0,0,loopR*1.6,0,Math.PI*2); ctx.fill();
    }

    // Outer copper loop
    const cg = ctx.createLinearGradient(-loopR,0,loopR,0);
    cg.addColorStop(0,'#7a4a10'); cg.addColorStop(0.3,'#d4822a');
    cg.addColorStop(0.5,'#f0a040'); cg.addColorStop(0.7,'#d4822a'); cg.addColorStop(1,'#7a4a10');
    ctx.beginPath(); ctx.arc(0,0,loopR,0,Math.PI*2);
    ctx.strokeStyle=cg; ctx.lineWidth=6; ctx.stroke();
    ctx.strokeStyle='rgba(255,220,150,0.3)'; ctx.lineWidth=1.5; ctx.stroke();

    // Inner coupling loop
    ctx.beginPath(); ctx.arc(0,0,loopR*0.38,0,Math.PI*2);
    ctx.strokeStyle='#8a6030'; ctx.lineWidth=2.5; ctx.stroke();

    // Tuning cap box at top
    ctx.fillStyle='#2a2a2a';
    ctx.fillRect(-12,-loopR-13,24,14);
    ctx.strokeStyle='#555'; ctx.lineWidth=1; ctx.strokeRect(-12,-loopR-13,24,14);
    ctx.fillStyle='#aaa';
    ctx.font='7px "Share Tech Mono",monospace';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('CAP', 0, -loopR-6);

    // NULL direction dashes
    ctx.setLineDash([3,3]);
    ctx.strokeStyle='rgba(255,80,80,0.5)'; ctx.lineWidth=1.2;
    ctx.beginPath(); ctx.moveTo(0,-loopR*1.3); ctx.lineTo(0,loopR*1.3); ctx.stroke();
    ctx.setLineDash([]);

    // MAX arrows when signal good
    if (sig > 0.06) {
        ctx.fillStyle=`rgba(74,222,128,${Math.min(0.9,sig*1.3)})`;
        ctx.beginPath(); ctx.moveTo(-loopR*1.2,0); ctx.lineTo(-loopR*0.95,-7); ctx.lineTo(-loopR*0.95,7); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(loopR*1.2,0);  ctx.lineTo(loopR*0.95,-7);  ctx.lineTo(loopR*0.95,7);  ctx.closePath(); ctx.fill();
    }

    ctx.restore(); // end loop rotation

    // N/O/Z/W labels (fixed)
    const lblR2 = loopR + 22;
    ctx.font='bold 10px "Orbitron",monospace'; ctx.textAlign='center'; ctx.textBaseline='middle';
    [['N',-90],['O',0],['Z',90],['W',180]].forEach(([l,deg])=>{
        const a=deg*Math.PI/180;
        ctx.fillStyle=l==='N'?'#ff7777':'#55aa55';
        ctx.fillText(l, loopCX+Math.cos(a)*lblR2, loopCY+Math.sin(a)*lblR2);
    });

    ctx.restore(); // end bob translate
    ctx.textBaseline='alphabetic'; ctx.textAlign='left';
}
    const cx=dx+sw/2;
    if(cx<0||cx>W) return;
    const ci=Math.floor(cx);
    if(ci>0&&ci<W&&zBuf[ci]<tY) return;

    // Body
    ctx.fillStyle=npc.color;
    ctx.fillRect(dx+sw*0.25, dy+sh*0.25, sw*0.5, sh*0.55);

    // Head
    ctx.fillStyle='#f4c090';
    ctx.fillRect(dx+sw*0.3, dy+sh*0.08, sw*0.4, sh*0.22);

    // Yagi antenna (stick up)
    ctx.strokeStyle='#ccc'; ctx.lineWidth=Math.max(1,sw*0.04);
    ctx.beginPath();
    ctx.moveTo(cx, dy+sh*0.08);
    ctx.lineTo(cx, dy-sh*0.5);
    ctx.stroke();
    // Elements
    [0.3,0.55,0.8].forEach((p,i)=>{
        const ey=dy-sh*0.5+sh*0.58*p;
        const ew=sw*(0.5-i*0.08);
        ctx.beginPath();ctx.moveTo(cx-ew/2,ey);ctx.lineTo(cx+ew/2,ey);ctx.stroke();
    });

    // Callsign label
    if(sw>20){
        ctx.fillStyle='rgba(0,0,0,0.7)';
        const lw=Math.max(sw*1.2, 70);
        ctx.fillRect(cx-lw/2, dy-sh*0.65, lw, sh*0.18);
        ctx.fillStyle=npc.color;
        ctx.font=`bold ${Math.max(9,sw*0.22)}px "Orbitron",monospace`;
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(npc.callsign, cx, dy-sh*0.565);
        ctx.textBaseline='alphabetic';
    }
}

// ── HUD (top bar) ─────────────────────────────────────────────────────────────
function _drawHUD(ctx, W, H, gameState, t) {
    const bH=52;
    ctx.fillStyle='rgba(3,10,3,0.88)';
    ctx.fillRect(0,0,W,bH);
    ctx.fillStyle='#1a4a1a'; ctx.fillRect(0,bH,W,2);

    ctx.fillStyle='#ffd700';
    ctx.font='bold 16px "Orbitron",monospace';
    ctx.textAlign='left'; ctx.textBaseline='middle';
    ctx.fillText('🦊 WLD FoxWave ARDF',14,26);

    ctx.fillStyle='#4ade80';
    ctx.font='bold 24px "Share Tech Mono",monospace';
    ctx.textAlign='center';
    ctx.fillText('⏱ '+Player.getElapsedString(),W/2,26);

    ctx.fillStyle='#ffd700';
    ctx.font='bold 16px "Orbitron",monospace';
    ctx.textAlign='right';
    ctx.fillText(`🦊 ${Player.foundFoxes.size}/${CONFIG.FOX_COUNT}`,W-14,26);

    // Mode
    const mc={[STATE.HUNTING]:'▶ HUNTING',[STATE.RECEIVER]:'📡 RECEIVER',[STATE.MAP_VIEW]:'🗺 KAART',[STATE.FINISHED]:'🏁 TERUG!'};
    const cc={[STATE.HUNTING]:'#4ade80',[STATE.RECEIVER]:'#ffd700',[STATE.MAP_VIEW]:'#44aaff',[STATE.FINISHED]:'#ff8844'};
    ctx.fillStyle=cc[gameState]||'#888';
    ctx.font='11px "Share Tech Mono",monospace';
    ctx.textAlign='center';
    ctx.fillText(mc[gameState]||'',W/2,44);

    ctx.fillStyle='#3a6a3a';
    ctx.font='11px "Share Tech Mono",monospace';
    ctx.textAlign='right';
    ctx.fillText('[?] Hint ON4BB · 144.675 MHz',W-14,44);

    // Bearing compass indicator
    if(Player.receiverOn){
        const brg=Math.round(Player.receiverBearing);
        ctx.fillStyle='#ffd700';
        ctx.font='bold 13px "Share Tech Mono",monospace';
        ctx.textAlign='left';
        ctx.fillText(`🧭 ${String(brg).padStart(3,'0')}°`,14,44);
    }

    ctx.textBaseline='alphabetic'; ctx.textAlign='left';
}

// ── Mini-map (bottom left) ────────────────────────────────────────────────────
function _drawMiniMap(ctx, W, H) {
    const TS=5, mW=CONFIG.WORLD_WIDTH*TS, mH=CONFIG.WORLD_HEIGHT*TS;
    const ox=10, oy=H-mH-10;
    const alpha=0.78;

    ctx.save();
    ctx.globalAlpha=alpha;

    // Background
    ctx.fillStyle='rgba(0,0,0,0.7)'; ctx.fillRect(ox-1,oy-1,mW+2,mH+2);

    // Tiles
    for(let ty=0;ty<CONFIG.WORLD_HEIGHT;ty++){
        for(let tx=0;tx<CONFIG.WORLD_WIDTH;tx++){
            const tile=getTile(tx,ty);
            ctx.fillStyle = tile===TILE.PATH||tile===TILE.TRAIN?'#c8a460':
                            tile===TILE.WATER?'#2080c0':
                            tile===TILE.TREE||tile===TILE.DENSE_TREE?'#1e5010':
                            tile===TILE.BUILDING?'#8a5030':
                            tile===TILE.START?'#d4a800':
                            tile===TILE.SHRUB?'#3a6010':
                            '#3a7a30';
            ctx.fillRect(ox+tx*TS, oy+ty*TS, TS, TS);
        }
    }

    // Fox markers
    for(const b of getBeacons()){
        ctx.fillStyle=b.found?b.color:'rgba(255,215,0,0.8)';
        ctx.beginPath();
        ctx.arc(ox+(b.x+0.5)*TS, oy+(b.y+0.5)*TS, b.found?4:3, 0, Math.PI*2);
        ctx.fill();
    }

    // Bearing lines
    for(const bl of Player.bearingLines){
        ctx.strokeStyle=bl.color; ctx.lineWidth=1;
        ctx.globalAlpha=alpha*0.7;
        const len=80;
        const rad=bl.bearing*Math.PI/180;
        ctx.beginPath();
        ctx.moveTo(ox+(bl.fromX+0.5)*TS, oy+(bl.fromY+0.5)*TS);
        ctx.lineTo(ox+(bl.fromX+0.5+Math.sin(rad)*len)*TS, oy+(bl.fromY+0.5-Math.cos(rad)*len)*TS);
        ctx.stroke();
        ctx.globalAlpha=alpha;
    }

    // Player arrow
    const ppx=ox+(Player.px)*TS, ppy=oy+(Player.py)*TS;
    const pAng=Player.viewAngle;
    ctx.fillStyle='#fff';
    ctx.beginPath();
    ctx.moveTo(ppx+Math.sin(pAng)*7, ppy-Math.cos(pAng)*7);
    ctx.lineTo(ppx+Math.sin(pAng+2.4)*4, ppy-Math.cos(pAng+2.4)*4);
    ctx.lineTo(ppx+Math.sin(pAng-2.4)*4, ppy-Math.cos(pAng-2.4)*4);
    ctx.closePath(); ctx.fill();

    // Receiver beam cone on mini-map
    if(Player.receiverOn){
        const brg=Player.receiverBearing*Math.PI/180;
        const hw=CONFIG.RECEIVER_BEAMWIDTH*Math.PI/180;
        ctx.globalAlpha=0.25;
        ctx.fillStyle='#ffd700';
        ctx.beginPath();
        ctx.moveTo(ppx,ppy);
        ctx.arc(ppx,ppy,40, brg-Math.PI/2-hw, brg-Math.PI/2+hw);
        ctx.closePath(); ctx.fill();
        ctx.globalAlpha=alpha;
    }

    ctx.globalAlpha=1;
    ctx.restore();
}

// ── ON4BB VHF hint overlay ────────────────────────────────────────────────────
function _drawON4BBHint(ctx, W, H) {
    const bw=400, bh=200, bx=W/2-200, by=H/2-100;

    // Transceiver body
    const rg=ctx.createLinearGradient(bx,by,bx,by+bh);
    rg.addColorStop(0,'#1a2a18'); rg.addColorStop(1,'#0a180a');
    ctx.fillStyle=rg;
    ctx.beginPath(); ctx.roundRect(bx,by,bw,bh,12); ctx.fill();
    ctx.strokeStyle='#44aa44'; ctx.lineWidth=2; ctx.stroke();

    // Header — small VHF transceiver label
    ctx.fillStyle='#ffd700';
    ctx.font='bold 12px "Orbitron",monospace';
    ctx.textAlign='center'; ctx.textBaseline='top';
    ctx.fillText('📻  PORTABLE VHF TRANSCEIVER  —  '+CONFIG.ON4BB_CALLSIGN,W/2,by+8);

    // LCD frequency display
    ctx.fillStyle='#001200'; ctx.fillRect(bx+12,by+30,bw-24,38);
    ctx.strokeStyle='#2a5a2a'; ctx.lineWidth=1; ctx.strokeRect(bx+12,by+30,bw-24,38);
    ctx.fillStyle='#00ff44';
    ctx.font='bold 26px "Share Tech Mono",monospace';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(`${CONFIG.WLD_VHF_FREQ} MHz  FM`, W/2, by+49);

    // Knobs left side
    [bx+22,bx+22+30].forEach((kx,i)=>{
        ctx.fillStyle='#2a2a2a';
        ctx.beginPath(); ctx.arc(kx,by+78+i*22,8,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle='#555'; ctx.lineWidth=1; ctx.stroke();
    });

    // Loop antenna (attached to top-right of radio)
    const antX=bx+bw-30, antY=by+20;
    ctx.strokeStyle='#ffdd44'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.arc(antX, antY, 22, 0, Math.PI*2); ctx.stroke();
    ctx.strokeStyle='#aaa'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(antX,by); ctx.lineTo(antX,antY+22); ctx.stroke();
    ctx.fillStyle='rgba(255,220,60,0.08)';
    ctx.beginPath(); ctx.arc(antX,antY,22,0,Math.PI*2); ctx.fill();

    // Divider
    ctx.strokeStyle='#2a5a2a'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(bx+16,by+80); ctx.lineTo(bx+bw-16,by+80); ctx.stroke();

    // ON4BB message
    ctx.fillStyle='#44aaff';
    ctx.font='bold 12px "Orbitron",monospace';
    ctx.textAlign='center'; ctx.textBaseline='top';
    ctx.fillText(CONFIG.ON4BB_CALLSIGN+' zegt:', W/2, by+88);

    ctx.fillStyle='#ffffff';
    ctx.font='bold 14px "Share Tech Mono",monospace';
    const words=Player.hintText.split(' ');
    let line='', lineY=by+106;
    for(const w of words){
        if((line+w).length>42){ctx.fillText(line.trim(),W/2,lineY);line='';lineY+=18;}
        line+=w+' ';
    }
    if(line.trim()) ctx.fillText(line.trim(),W/2,lineY);

    ctx.fillStyle='#3a5a3a';
    ctx.font='10px "Share Tech Mono",monospace';
    ctx.fillText('[?] of [Esc] sluiten',W/2,by+bh-8);
    ctx.textBaseline='alphabetic';
}

// ── Return banner ─────────────────────────────────────────────────────────────
function _drawReturnBanner(ctx, W, H, t) {
    const a=0.7+0.3*Math.sin(t/400);
    ctx.fillStyle=`rgba(2,8,2,${a*0.92})`; ctx.fillRect(0,H-68,W,68);
    ctx.strokeStyle=`rgba(255,215,0,${a})`; ctx.lineWidth=2; ctx.strokeRect(0,H-68,W,68);
    ctx.fillStyle=`rgba(255,215,0,${a})`;
    ctx.font='bold 20px "Orbitron",monospace';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('🏁  ALLE VOSSEN GEVONDEN! — Keer terug naar het WLD-tent!',W/2,H-34);
    ctx.textBaseline='alphabetic'; ctx.textAlign='left';
}

// ── Receiver crosshair ────────────────────────────────────────────────────────
function _drawCrosshair(ctx, W, H, t) {
    const cx=W/2, cy=H/2;
    const pulse=0.6+0.4*Math.sin(t/300);
    ctx.strokeStyle=`rgba(255,215,0,${pulse})`; ctx.lineWidth=1.5;
    const s=12;
    ctx.beginPath();ctx.moveTo(cx-s,cy);ctx.lineTo(cx+s,cy);ctx.stroke();
    ctx.beginPath();ctx.moveTo(cx,cy-s);ctx.lineTo(cx,cy+s);ctx.stroke();
    ctx.beginPath();ctx.arc(cx,cy,s*0.7,0,Math.PI*2);ctx.stroke();
}
