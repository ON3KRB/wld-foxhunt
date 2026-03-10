/**
 * renderer.js - Main game canvas renderer
 * WLD FoxWave ARDF
 *
 * Draws the 2D top-down park view centred on the player.
 * Uses a 56px tile size.  Features, trees, water, buildings are all
 * drawn procedurally with the Canvas 2D API.
 */

"use strict";

// Cached images for the tent / start area
let _wldLogoImg   = null;
let _startStopImg = null;
let _foxImg       = null;
let _assetsLoaded = false;

/** Load all image assets (call once at startup). */
function loadRendererAssets(callback) {
    let pending = 3;
    const done = () => { if (--pending === 0) { _assetsLoaded = true; callback && callback(); } };

    _wldLogoImg   = new Image(); _wldLogoImg.onload   = done; _wldLogoImg.onerror   = done;
    _startStopImg = new Image(); _startStopImg.onload = done; _startStopImg.onerror = done;
    _foxImg       = new Image(); _foxImg.onload       = done; _foxImg.onerror       = done;

    _wldLogoImg.src   = 'assets/wld-logo.png';
    _startStopImg.src = 'assets/start-stop.png';
    _foxImg.src       = 'assets/fox.png';
}

// ─── Tile colour palette ──────────────────────────────────────────────────────
const TILE_COLORS = {
    [TILE.GRASS]:       '#4a7c3f',
    [TILE.PATH]:        '#b8955a',
    [TILE.TREE]:        '#2d5a1f',
    [TILE.WATER]:       '#2b6cb0',
    [TILE.BUILDING]:    '#7a5c2e',
    [TILE.PLAYGROUND]:  '#d4770a',
    [TILE.FOUNTAIN]:    '#3498db',
    [TILE.TRAIN]:       '#b8955a',
    [TILE.ZOO]:         '#5a8a2a',
    [TILE.START]:       '#c8a800',
    [TILE.DENSE_TREE]:  '#1a3a10',
    [TILE.FLOWER]:      '#5a9e42',
    [TILE.SHRUB]:       '#3a6a20',
};

// ─── Main render function ─────────────────────────────────────────────────────

/**
 * Render the park view centred on the player.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} canvasW
 * @param {number} canvasH
 * @param {number} timestamp  from requestAnimationFrame
 * @param {string} gameState
 */
function renderMainView(ctx, canvasW, canvasH, timestamp, gameState) {
    const ts  = CONFIG.TILE_SIZE_MAIN;
    const px  = Player.x;
    const py  = Player.y;

    // Camera offset: player is drawn at canvas centre
    const camX = canvasW / 2 - px * ts;
    const camY = canvasH / 2 - py * ts;

    // Visible tile range
    const tx0 = Math.floor(-camX / ts) - 1;
    const ty0 = Math.floor(-camY / ts) - 1;
    const tx1 = Math.ceil((canvasW - camX) / ts) + 1;
    const ty1 = Math.ceil((canvasH - camY) / ts) + 1;

    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.save();
    ctx.translate(camX, canvasH / 2 - py * ts);
    // Don't translate Y separately — folded into camY
    ctx.restore();

    // ── Draw tiles ────────────────────────────────────────────────────────────
    ctx.save();
    ctx.translate(camX, camY);

    for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
            const tile = getTile(tx, ty);
            const sx   = tx * ts;
            const sy   = ty * ts;
            _drawTile(ctx, tx, ty, tile, sx, sy, ts, timestamp);
        }
    }

    // ── Draw features / decorations ───────────────────────────────────────────
    _drawWLDTent(ctx, ts, timestamp);
    _drawFountain(ctx, ts, timestamp);
    _drawZooFences(ctx, ts);
    _drawPlayground(ctx, ts);
    _drawCafe(ctx, ts);
    _drawTrainMarkers(ctx, tx0, ty0, tx1, ty1, ts, timestamp);

    // ── Draw found / nearby fox markers ──────────────────────────────────────
    _drawFoxMarkers(ctx, ts, timestamp);

    // ── Draw player ──────────────────────────────────────────────────────────
    _drawPlayer(ctx, px * ts, py * ts, ts, Player.facing, timestamp);

    ctx.restore();

    // ── Overlay: vignette + dark edges ────────────────────────────────────────
    _drawVignette(ctx, canvasW, canvasH);

    // ── Overlay: time + status bar ────────────────────────────────────────────
    _drawStatusBar(ctx, canvasW, gameState, timestamp);
}

// ─── Tile drawing ─────────────────────────────────────────────────────────────

function _drawTile(ctx, tx, ty, tile, sx, sy, ts, timestamp) {
    // Base fill
    ctx.fillStyle = TILE_COLORS[tile] || TILE_COLORS[TILE.GRASS];
    ctx.fillRect(sx, sy, ts, ts);

    switch (tile) {
        case TILE.PATH:
        case TILE.TRAIN:
            _drawPathTile(ctx, tile, sx, sy, ts, timestamp);
            break;
        case TILE.TREE:
        case TILE.DENSE_TREE:
            _drawTreeTile(ctx, tile, tx, ty, sx, sy, ts);
            break;
        case TILE.WATER:
            _drawWaterTile(ctx, sx, sy, ts, timestamp);
            break;
        case TILE.FLOWER:
            _drawFlowerTile(ctx, tx, ty, sx, sy, ts);
            break;
        case TILE.GRASS:
            _drawGrassTile(ctx, tx, ty, sx, sy, ts);
            break;
        case TILE.START:
            _drawStartTile(ctx, sx, sy, ts);
            break;
    }
}

function _drawGrassTile(ctx, tx, ty, sx, sy, ts) {
    // Slight variation
    const r = Math.sin(tx * 7 + ty * 13) * 0.04;
    ctx.fillStyle = `hsl(112, 40%, ${30 + r * 100}%)`;
    ctx.fillRect(sx, sy, ts, ts);
    // Occasional grass blade tufts
    if ((tx * 31 + ty * 17) % 7 === 0) {
        ctx.fillStyle = '#3a6a28';
        ctx.fillRect(sx + ts * 0.3, sy + ts * 0.6, 2, 5);
        ctx.fillRect(sx + ts * 0.5, sy + ts * 0.55, 2, 6);
        ctx.fillRect(sx + ts * 0.7, sy + ts * 0.62, 2, 4);
    }
}

function _drawPathTile(ctx, tile, sx, sy, ts, timestamp) {
    // Gravel texture
    ctx.fillStyle = tile === TILE.TRAIN ? '#c4a060' : '#b08040';
    ctx.fillRect(sx + 2, sy + 2, ts - 4, ts - 4);

    if (tile === TILE.TRAIN) {
        // Rail lines
        ctx.fillStyle = '#666';
        ctx.fillRect(sx + ts * 0.2, sy, ts * 0.1, ts);
        ctx.fillRect(sx + ts * 0.7, sy, ts * 0.1, ts);
        // Sleepers
        for (let i = 0; i < 3; i++) {
            ctx.fillStyle = '#5a3a1a';
            ctx.fillRect(sx + 2, sy + i * (ts / 3) + 4, ts - 4, ts / 6);
        }
    }
}

function _drawTreeTile(ctx, tile, tx, ty, sx, sy, ts) {
    const h = tile === TILE.DENSE_TREE;
    // Dark ground
    ctx.fillStyle = h ? '#0f2008' : '#1e3d10';
    ctx.fillRect(sx, sy, ts, ts);

    // Tree crown (circle)
    const seed = tx * 17 + ty * 31;
    const ox   = ((seed % 5) - 2) * 3;
    const oy   = (((seed >> 3) % 5) - 2) * 3;
    const cr   = ts * 0.42 + ((seed % 4) - 2) * 2;

    const grad = ctx.createRadialGradient(
        sx + ts / 2 + ox - 3, sy + ts / 2 + oy - 3, cr * 0.2,
        sx + ts / 2 + ox, sy + ts / 2 + oy, cr
    );
    grad.addColorStop(0, h ? '#2a5a18' : '#3a7a20');
    grad.addColorStop(1, h ? '#0f2008' : '#1e3d10');

    ctx.beginPath();
    ctx.arc(sx + ts / 2 + ox, sy + ts / 2 + oy, cr, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
}

function _drawWaterTile(ctx, sx, sy, ts, timestamp) {
    // Animated water
    const t   = timestamp / 1800;
    const off = Math.sin(sx / 40 + t) * 3 + Math.sin(sy / 35 + t * 0.8) * 2;

    const grad = ctx.createLinearGradient(sx, sy, sx + ts, sy + ts);
    grad.addColorStop(0,   '#1a5a9f');
    grad.addColorStop(0.5, `hsl(${208 + off * 2}, 65%, ${35 + off}%)`);
    grad.addColorStop(1,   '#1a4a8f');
    ctx.fillStyle = grad;
    ctx.fillRect(sx, sy, ts, ts);

    // Ripple
    ctx.strokeStyle = 'rgba(120,200,255,0.2)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(sx + 4,       sy + ts * 0.4 + off);
    ctx.lineTo(sx + ts - 4,  sy + ts * 0.4 + off);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sx + 8,       sy + ts * 0.65 - off * 0.5);
    ctx.lineTo(sx + ts - 8,  sy + ts * 0.65 - off * 0.5);
    ctx.stroke();
}

function _drawFlowerTile(ctx, tx, ty, sx, sy, ts) {
    // Green base
    ctx.fillStyle = '#5a9e42';
    ctx.fillRect(sx, sy, ts, ts);

    // Flower spots
    const seed = tx * 23 + ty * 41;
    const colors = ['#ff88aa', '#ffdd44', '#ff6688', '#ffffff', '#ff99bb'];
    for (let i = 0; i < 5; i++) {
        const fi    = (seed * (i + 7)) % 1000;
        const fx    = sx + 4 + (fi % (ts - 8));
        const fy    = sy + 4 + ((fi >> 2) % (ts - 8));
        const fsize = 2 + (fi % 3);
        ctx.fillStyle = colors[i % colors.length];
        ctx.beginPath();
        ctx.arc(fx, fy, fsize, 0, Math.PI * 2);
        ctx.fill();
    }
}

function _drawStartTile(ctx, sx, sy, ts) {
    ctx.fillStyle = '#d4a000';
    ctx.fillRect(sx, sy, ts, ts);
    // Grid pattern
    ctx.strokeStyle = '#b08800';
    ctx.lineWidth = 1;
    for (let i = 0; i < ts; i += 8) {
        ctx.beginPath(); ctx.moveTo(sx + i, sy); ctx.lineTo(sx + i, sy + ts); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sx, sy + i); ctx.lineTo(sx + ts, sy + i); ctx.stroke();
    }
}

// ─── Feature drawing ──────────────────────────────────────────────────────────

function _drawWLDTent(ctx, ts, timestamp) {
    const tx = 3, ty = 55;
    const sx = tx * ts, sy = ty * ts;
    const w  = 7 * ts,  h  = 4 * ts;

    // Tent body
    ctx.fillStyle = '#1a4a8a';
    ctx.fillRect(sx, sy, w, h);

    // Tent roof (triangle)
    ctx.beginPath();
    ctx.moveTo(sx + w / 2, sy - ts * 1.5);
    ctx.lineTo(sx - ts * 0.3, sy);
    ctx.lineTo(sx + w + ts * 0.3, sy);
    ctx.closePath();
    ctx.fillStyle = '#e63030';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // WLD logo
    if (_wldLogoImg && _wldLogoImg.complete && _wldLogoImg.naturalWidth) {
        ctx.drawImage(_wldLogoImg, sx + 4, sy + 4, ts * 2, ts * 1.5);
    } else {
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${ts * 0.55}px "Orbitron", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('WLD', sx + ts * 1.5, sy + ts * 0.75);
    }

    // Start/stop machine
    if (_startStopImg && _startStopImg.complete && _startStopImg.naturalWidth) {
        ctx.drawImage(_startStopImg, sx + ts * 2.5, sy + ts * 0.3, ts * 3.5, ts * 1.5);
    } else {
        ctx.fillStyle = '#ddd';
        ctx.fillRect(sx + ts * 2.5, sy + ts * 0.3, ts * 3.5, ts * 1.5);
        ctx.fillStyle = '#ff8800';
        ctx.font = `bold ${ts * 0.35}px "Share Tech Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('STOP 00:00', sx + ts * 4.25, sy + ts * 1.05);
    }

    // "WLD FoxWave ARDF" banner
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${ts * 0.3}px "Orbitron", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('WLD FoxWave ARDF', sx + w / 2, sy + h - ts * 0.9);

    // Antenna mast
    ctx.strokeStyle = '#aaa';
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(sx + w - ts * 0.5, sy - ts * 0.5);
    ctx.lineTo(sx + w - ts * 0.5, sy - ts * 3);
    ctx.stroke();
    // Signal waves
    const t = timestamp / 600;
    for (let i = 1; i <= 3; i++) {
        const alpha = Math.max(0, Math.sin(t - i * 0.4)) * 0.5;
        ctx.strokeStyle = `rgba(255,215,0,${alpha})`;
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        ctx.arc(sx + w - ts * 0.5, sy - ts * 3, i * 8, -Math.PI * 0.6, -Math.PI * 0.15);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(sx + w - ts * 0.5, sy - ts * 3, i * 8, -Math.PI * 0.85, -Math.PI * 0.4);
        ctx.stroke();
    }

    ctx.textBaseline = 'alphabetic';
}

function _drawFountain(ctx, ts, timestamp) {
    const cx = 49 * ts + ts / 2;
    const cy = 22 * ts + ts / 2;
    const t  = timestamp / 1200;

    // Basin
    ctx.beginPath();
    ctx.arc(cx, cy, ts * 2, 0, Math.PI * 2);
    ctx.fillStyle = '#2b6cb0';
    ctx.fill();
    ctx.strokeStyle = '#7ab4e8';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Water jet animation
    for (let i = 0; i < 8; i++) {
        const a     = (i / 8) * Math.PI * 2 + t;
        const jh    = ts * 0.8 + Math.sin(t * 3 + i) * ts * 0.2;
        const jx    = cx + Math.cos(a) * ts * 0.4;
        const jy    = cy + Math.sin(a) * ts * 0.4;
        const jx2   = cx + Math.cos(a) * ts * 0.8;
        const jy2   = cy + Math.sin(a) * ts * 0.8 - jh;

        ctx.strokeStyle = 'rgba(140,210,255,0.7)';
        ctx.lineWidth   = 2;
        ctx.beginPath();
        ctx.moveTo(jx, jy);
        ctx.quadraticCurveTo(jx2, jy2 - jh * 0.3, jx2, jy2);
        ctx.stroke();
    }

    // Centre spout
    ctx.beginPath();
    ctx.arc(cx, cy, ts * 0.25, 0, Math.PI * 2);
    ctx.fillStyle = '#4db8e8';
    ctx.fill();
}

function _drawZooFences(ctx, ts) {
    // Zoo enclosure at x=61-75, y=6-15
    const x1 = 61 * ts, y1 = 6 * ts, x2 = 75 * ts, y2 = 15 * ts;

    ctx.strokeStyle = '#8B6914';
    ctx.lineWidth   = 3;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(x1 + 2, y1 + 2, x2 - x1 - 4, y2 - y1 - 4);
    ctx.setLineDash([]);

    // Zoo sign
    ctx.fillStyle  = '#ffd700';
    ctx.font       = `bold ${ts * 0.5}px "Orbitron", monospace`;
    ctx.textAlign  = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🦁 ZOO', (x1 + x2) / 2, (y1 + y2) / 2 - 5);
    ctx.fillStyle  = '#c0a000';
    ctx.font       = `${ts * 0.32}px "Share Tech Mono", monospace`;
    ctx.fillText('Dierenpark', (x1 + x2) / 2, (y1 + y2) / 2 + ts * 0.45);
}

function _drawPlayground(ctx, ts) {
    const x1 = 4 * ts, y1 = 6 * ts, x2 = 17 * ts, y2 = 15 * ts;
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;

    // Swings
    ctx.strokeStyle = '#8B6914';
    ctx.lineWidth   = 2;
    ctx.beginPath(); ctx.moveTo(cx - ts * 2, y1 + ts); ctx.lineTo(cx - ts * 2, cy + ts * 0.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - ts * 1, y1 + ts); ctx.lineTo(cx - ts * 1, cy + ts * 0.5); ctx.stroke();
    ctx.fillStyle = '#d4770a'; ctx.fillRect(cx - ts * 2.2, y1 + ts * 0.8, ts * 1.4, ts * 0.2);

    // Slide
    ctx.fillStyle = '#ff6600';
    ctx.fillRect(cx + ts, y1 + ts, ts * 0.4, ts * 1.5);
    ctx.strokeStyle = '#cc4400';
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(cx + ts * 1.2, y1 + ts);
    ctx.lineTo(cx + ts * 2.5, cy + ts);
    ctx.stroke();

    // Label
    ctx.fillStyle  = '#fff';
    ctx.font       = `bold ${ts * 0.4}px "Orbitron", monospace`;
    ctx.textAlign  = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('🎠 SPEELTUIN', cx, y2 - 6);
}

function _drawCafe(ctx, ts) {
    const x1 = 61 * ts, y1 = 43 * ts, x2 = 75 * ts, y2 = 53 * ts;
    const cx = (x1 + x2) / 2;

    // Building face
    ctx.fillStyle = '#8b6914';
    ctx.fillRect(x1, y1, x2 - x1, y2 - y1);

    // Awning
    ctx.fillStyle = '#e63030';
    ctx.fillRect(x1 - 5, y1 - ts * 0.3, x2 - x1 + 10, ts * 0.5);
    // Awning stripes
    for (let i = 0; i < 8; i++) {
        if (i % 2 === 0) {
            const sx = x1 - 5 + i * ((x2 - x1 + 10) / 8);
            ctx.fillStyle = '#fff';
            ctx.fillRect(sx, y1 - ts * 0.3, (x2 - x1 + 10) / 8, ts * 0.5);
        }
    }

    // Windows
    ctx.fillStyle = '#87ceeb';
    ctx.fillRect(x1 + ts * 0.5, y1 + ts * 0.4, ts, ts * 0.9);
    ctx.fillRect(x1 + ts * 2,   y1 + ts * 0.4, ts, ts * 0.9);
    ctx.fillRect(x1 + ts * 3.5, y1 + ts * 0.4, ts, ts * 0.9);

    // Door
    ctx.fillStyle = '#5a3a10';
    ctx.fillRect(cx - ts * 0.4, y2 - ts * 1.5, ts * 0.8, ts * 1.5);

    // Sign
    ctx.fillStyle  = '#ffd700';
    ctx.font       = `bold ${ts * 0.45}px "Orbitron", monospace`;
    ctx.textAlign  = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('☕ BRASSERIE', cx, y1 + ts * 1.9);
}

function _drawTrainMarkers(ctx, tx0, ty0, tx1, ty1, ts, timestamp) {
    // Draw a simple tourist train sprite that moves along outer ring
    const t       = timestamp / 8000;
    const perimX  = [3, 76, 76, 3];  // outer ring corners
    const perimY  = [5,  5, 54, 54];
    // Parametric position along perimeter
    const totalLen = (73 + 49 + 73 + 49);
    const pos      = ((t % 1) * totalLen + totalLen) % totalLen;

    let bx, by, bearing;
    if (pos < 73) { bx = 3 + pos;   by = 5;      bearing = 90;  }
    else if (pos < 73 + 49) { bx = 76; by = 5 + (pos - 73); bearing = 180; }
    else if (pos < 73 + 49 + 73) { bx = 76 - (pos - 122); by = 54; bearing = 270; }
    else { bx = 3; by = 54 - (pos - 195); bearing = 0; }

    _drawTrainSprite(ctx, bx * ts, by * ts, ts, bearing);
}

function _drawTrainSprite(ctx, sx, sy, ts, bearing) {
    ctx.save();
    ctx.translate(sx + ts / 2, sy + ts / 2);
    ctx.rotate(bearing * Math.PI / 180);

    const w = ts * 1.6, h = ts * 0.7;
    // Body
    ctx.fillStyle = '#cc2222';
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 6);
    ctx.fill();
    // Windows
    ctx.fillStyle = '#87ceeb';
    ctx.fillRect(-w / 2 + 4, -h / 2 + 4, w * 0.25, h - 8);
    ctx.fillRect(0, -h / 2 + 4, w * 0.25, h - 8);
    // Wheels
    ctx.fillStyle = '#333';
    for (const wx of [-w * 0.35, w * 0.25]) {
        ctx.beginPath(); ctx.arc(wx, h / 2 - 1, 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
}

function _drawFoxMarkers(ctx, ts, timestamp) {
    for (const beacon of getBeacons()) {
        const dist = Math.hypot(beacon.x - Player.x, beacon.y - Player.y);

        if (beacon.found) {
            // Mark found fox position with a small flag
            const sx = beacon.x * ts, sy = beacon.y * ts;
            _drawFoundMarker(ctx, sx, sy, ts, beacon);
        } else if (dist <= CONFIG.FOX_DETECTION_RADIUS + 2) {
            // Hint glow when very close
            const sx = beacon.x * ts + ts / 2, sy = beacon.y * ts + ts / 2;
            const alpha = Math.max(0, (1 - dist / (CONFIG.FOX_DETECTION_RADIUS + 2))) * 0.6;
            ctx.beginPath();
            ctx.arc(sx, sy, ts * 1.2, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,215,0,${alpha * Math.abs(Math.sin(timestamp / 400))})`;
            ctx.fill();
        }
    }
}

function _drawFoundMarker(ctx, sx, sy, ts, beacon) {
    // Small flag post
    ctx.strokeStyle = '#888';
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(sx + ts / 2, sy + ts * 0.8);
    ctx.lineTo(sx + ts / 2, sy + ts * 0.1);
    ctx.stroke();
    // Flag
    ctx.fillStyle = beacon.color;
    ctx.beginPath();
    ctx.moveTo(sx + ts / 2, sy + ts * 0.1);
    ctx.lineTo(sx + ts,     sy + ts * 0.3);
    ctx.lineTo(sx + ts / 2, sy + ts * 0.5);
    ctx.closePath();
    ctx.fill();
}

function _drawPlayer(ctx, px, py, ts, facing, timestamp) {
    const cx = px + ts / 2;
    const cy = py + ts / 2;
    const r  = ts * 0.32;
    const t  = timestamp / 300;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(facing * Math.PI / 180);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(2, r * 0.4, r * 0.6, r * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.fillStyle = '#1a6a1a';
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 1.2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Backpack
    ctx.fillStyle = '#0a3a0a';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.4, r * 0.5, r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Head
    ctx.fillStyle = '#f4c090';
    ctx.beginPath();
    ctx.arc(0, -r * 0.9, r * 0.4, 0, Math.PI * 2);
    ctx.fill();

    // Receiver antenna (points forward)
    ctx.strokeStyle = '#aaa';
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.5);
    ctx.lineTo(0, -r * 2);
    ctx.stroke();

    ctx.restore();
}

function _drawVignette(ctx, w, h) {
    const grad = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.8);
    grad.addColorStop(0,   'rgba(0,0,0,0)');
    grad.addColorStop(1,   'rgba(0,0,0,0.45)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
}

function _drawStatusBar(ctx, canvasW, gameState, timestamp) {
    ctx.fillStyle = 'rgba(0,10,0,0.75)';
    ctx.fillRect(0, 0, canvasW, 44);

    // Game title
    ctx.fillStyle = '#ffd700';
    ctx.font      = 'bold 16px "Orbitron", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('🦊 WLD FoxWave ARDF', 12, 22);

    // Timer
    const elapsed = Player.getElapsedString();
    ctx.fillStyle = '#4ade80';
    ctx.font      = 'bold 20px "Share Tech Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`⏱ ${elapsed}`, canvasW / 2, 22);

    // Found count
    ctx.fillStyle = '#ffd700';
    ctx.font      = 'bold 16px "Orbitron", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`🦊 ${Player.foundFoxes.size}/${CONFIG.FOX_COUNT}`, canvasW - 12, 22);

    // Mode indicator
    const modeLabels = {
        [STATE.HUNTING]:  { text: '⚡ HUNTING', color: '#4ade80' },
        [STATE.RECEIVER]: { text: '📡 RECEIVER', color: '#ffd700' },
        [STATE.MAP_VIEW]: { text: '🗺  MAP', color: '#44aaff' },
        [STATE.BRIEFING]: { text: '🏕  READY', color: '#aaa' },
    };
    const ml = modeLabels[gameState];
    if (ml) {
        ctx.fillStyle = ml.color;
        ctx.font      = '12px "Share Tech Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(ml.text, canvasW / 2, 36);
    }

    ctx.textBaseline = 'alphabetic';
}
