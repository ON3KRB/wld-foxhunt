/**
 * renderer.js - Main game canvas renderer (v2 - improved visuals + compat fixes)
 * WLD FoxWave ARDF
 *
 * Changes vs v1:
 *  - roundRect() polyfill for Safari/Firefox <112
 *  - Richer tile rendering (grass variation, path gravel dots, water shimmer)
 *  - Player animation (walking bob)
 *  - Better tree crowns with highlight
 *  - Improved WLD tent scene
 *  - Smoother status bar
 */

"use strict";

// ─── roundRect polyfill ───────────────────────────────────────────────────────
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
        r = Math.min(r, w / 2, h / 2);
        this.beginPath();
        this.moveTo(x + r, y);
        this.lineTo(x + w - r, y);
        this.arcTo(x + w, y, x + w, y + r, r);
        this.lineTo(x + w, y + h - r);
        this.arcTo(x + w, y + h, x + w - r, y + h, r);
        this.lineTo(x + r, y + h);
        this.arcTo(x, y + h, x, y + h - r, r);
        this.lineTo(x, y + r);
        this.arcTo(x, y, x + r, y, r);
        this.closePath();
        return this;
    };
}

// ─── Image assets ─────────────────────────────────────────────────────────────
let _wldLogoImg   = null;
let _startStopImg = null;
let _foxImg       = null;
let _assetsLoaded = false;

function loadRendererAssets(callback) {
    let pending = 3;
    const done = () => { if (--pending === 0) { _assetsLoaded = true; if (callback) callback(); } };
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

// ─── Main render ──────────────────────────────────────────────────────────────

/**
 * Render the park view centred on the player.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} canvasW
 * @param {number} canvasH
 * @param {number} timestamp
 * @param {string} gameState
 */
function renderMainView(ctx, canvasW, canvasH, timestamp, gameState) {
    const ts = CONFIG.TILE_SIZE_MAIN;
    const px = Player.x;
    const py = Player.y;

    const camX = canvasW / 2 - px * ts - ts / 2;
    const camY = canvasH / 2 - py * ts - ts / 2;

    const tx0 = Math.floor(-camX / ts) - 1;
    const ty0 = Math.floor(-camY / ts) - 1;
    const tx1 = Math.ceil((canvasW - camX) / ts) + 1;
    const ty1 = Math.ceil((canvasH - camY) / ts) + 1;

    ctx.clearRect(0, 0, canvasW, canvasH);

    // ── Draw world (translated) ────────────────────────────────────────────
    ctx.save();
    ctx.translate(camX, camY);

    // Tiles
    for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
            _drawTile(ctx, tx, ty, getTile(tx, ty), tx * ts, ty * ts, ts, timestamp);
        }
    }

    // Features
    _drawWLDTent(ctx, ts, timestamp);
    _drawFountain(ctx, ts, timestamp);
    _drawZooArea(ctx, ts, timestamp);
    _drawPlayground(ctx, ts);
    _drawCafe(ctx, ts);
    _drawTrainSprite(ctx, ts, timestamp);

    // Fox markers
    _drawFoxMarkers(ctx, ts, timestamp);

    // Detection radius hint (glow around player when receiver active)
    if (gameState === STATE.RECEIVER) {
        _drawReceiverGlow(ctx, px * ts + ts / 2, py * ts + ts / 2, ts, timestamp);
    }

    // Player
    _drawPlayer(ctx, px * ts + ts / 2, py * ts + ts / 2, ts, Player.facing, timestamp, gameState);

    ctx.restore();

    // ── Screen-space overlays ──────────────────────────────────────────────
    _drawVignette(ctx, canvasW, canvasH);
    _drawStatusBar(ctx, canvasW, gameState, timestamp);

    // "Return to tent!" banner when all foxes found
    if (Player.allFoxesFound && gameState === STATE.HUNTING) {
        _drawReturnBanner(ctx, canvasW, canvasH, timestamp);
    }
}

// ─── Tile renderers ───────────────────────────────────────────────────────────

function _drawTile(ctx, tx, ty, tile, sx, sy, ts, timestamp) {
    ctx.fillStyle = TILE_COLORS[tile] || TILE_COLORS[TILE.GRASS];
    ctx.fillRect(sx, sy, ts, ts);

    switch (tile) {
        case TILE.GRASS:       _tileGrass(ctx, tx, ty, sx, sy, ts); break;
        case TILE.PATH:        _tilePath(ctx, tx, ty, sx, sy, ts, false); break;
        case TILE.TRAIN:       _tilePath(ctx, tx, ty, sx, sy, ts, true); break;
        case TILE.TREE:        _tileTree(ctx, tx, ty, sx, sy, ts, false); break;
        case TILE.DENSE_TREE:  _tileTree(ctx, tx, ty, sx, sy, ts, true); break;
        case TILE.WATER:       _tileWater(ctx, sx, sy, ts, timestamp); break;
        case TILE.FLOWER:      _tileFlower(ctx, tx, ty, sx, sy, ts); break;
        case TILE.START:       _tileStart(ctx, sx, sy, ts, timestamp); break;
        case TILE.FOUNTAIN:    _tileFountainBase(ctx, sx, sy, ts); break;
        case TILE.ZOO:         _tileZoo(ctx, tx, ty, sx, sy, ts); break;
        case TILE.PLAYGROUND:  _tilePlayground(ctx, tx, ty, sx, sy, ts); break;
        case TILE.BUILDING:    _tileBuilding(ctx, sx, sy, ts); break;
    }
}

function _tileGrass(ctx, tx, ty, sx, sy, ts) {
    const h = (Math.sin(tx * 7.3 + ty * 13.1) * 0.5 + 0.5);
    ctx.fillStyle = `hsl(112,${38 + h * 8}%,${28 + h * 7}%)`;
    ctx.fillRect(sx, sy, ts, ts);
    // Sparse blade tufts
    if ((tx * 31 + ty * 17) % 9 === 0) {
        ctx.fillStyle = `hsl(112,45%,${24 + h * 6}%)`;
        for (let b = 0; b < 3; b++) {
            const bx = sx + 4 + (tx * 23 + ty * 7 + b * 11) % (ts - 8);
            const by = sy + ts * 0.55;
            ctx.fillRect(bx, by, 2, 5 + b);
        }
    }
}

function _tilePath(ctx, tx, ty, sx, sy, ts, isTrain) {
    // Base gravel
    const base = isTrain ? '#c4a060' : '#b08040';
    ctx.fillStyle = base;
    ctx.fillRect(sx + 2, sy + 2, ts - 4, ts - 4);

    if (isTrain) {
        // Wooden sleepers
        ctx.fillStyle = '#5a3a1a';
        for (let i = 0; i < 4; i++) {
            ctx.fillRect(sx + 2, sy + i * (ts / 3.5) + 2, ts - 4, ts / 6 - 1);
        }
        // Rails
        ctx.fillStyle = '#888';
        ctx.fillRect(sx + ts * 0.18, sy, ts * 0.08, ts);
        ctx.fillRect(sx + ts * 0.74, sy, ts * 0.08, ts);
    } else {
        // Gravel dots
        ctx.fillStyle = 'rgba(0,0,0,0.08)';
        for (let i = 0; i < 5; i++) {
            const gx = sx + 4 + (tx * 17 + ty * 23 + i * 7) % (ts - 8);
            const gy = sy + 4 + (tx * 11 + ty * 31 + i * 13) % (ts - 8);
            ctx.beginPath(); ctx.arc(gx, gy, 1.5, 0, Math.PI * 2); ctx.fill();
        }
    }
}

function _tileTree(ctx, tx, ty, sx, sy, ts, dense) {
    ctx.fillStyle = dense ? '#0e1f08' : '#1a3a10';
    ctx.fillRect(sx, sy, ts, ts);

    const seed = tx * 17 + ty * 31;
    const ox   = ((seed % 5) - 2) * 2;
    const oy   = (((seed >> 3) % 5) - 2) * 2;
    const cr   = ts * 0.40 + (seed % 4) - 1;
    const cx   = sx + ts / 2 + ox;
    const cy   = sy + ts / 2 + oy;

    // Shadow
    ctx.beginPath();
    ctx.ellipse(cx + 3, cy + 4, cr * 0.85, cr * 0.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fill();

    // Crown gradient
    const grad = ctx.createRadialGradient(cx - cr * 0.25, cy - cr * 0.25, cr * 0.1, cx, cy, cr);
    grad.addColorStop(0,   dense ? '#3a6a20' : '#4a8a28');
    grad.addColorStop(0.6, dense ? '#254a18' : '#32621c');
    grad.addColorStop(1,   dense ? '#0e1f08' : '#1a3a10');
    ctx.beginPath();
    ctx.arc(cx, cy, cr, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Highlight
    ctx.beginPath();
    ctx.arc(cx - cr * 0.28, cy - cr * 0.28, cr * 0.25, 0, Math.PI * 2);
    ctx.fillStyle = dense ? 'rgba(80,140,40,0.3)' : 'rgba(100,180,50,0.3)';
    ctx.fill();
}

function _tileWater(ctx, sx, sy, ts, timestamp) {
    const t   = timestamp / 2000;
    const ripX = Math.sin(sx / 50 + t) * 2;
    const ripY = Math.cos(sy / 45 + t * 0.9) * 2;

    const grad = ctx.createLinearGradient(sx, sy, sx + ts, sy + ts);
    grad.addColorStop(0,   '#1a5a9f');
    grad.addColorStop(0.5, `hsl(${210 + ripX * 3},60%,${32 + ripY}%)`);
    grad.addColorStop(1,   '#134080');
    ctx.fillStyle = grad;
    ctx.fillRect(sx, sy, ts, ts);

    // Ripple lines
    const alpha = 0.15 + 0.08 * Math.sin(t * 2 + sx);
    ctx.strokeStyle = `rgba(140,210,255,${alpha})`;
    ctx.lineWidth = 1;
    for (let i = 0; i < 2; i++) {
        const ry = sy + ts * (0.35 + i * 0.3) + ripY;
        ctx.beginPath();
        ctx.moveTo(sx + 3, ry);
        ctx.quadraticCurveTo(sx + ts / 2, ry + ripX, sx + ts - 3, ry);
        ctx.stroke();
    }

    // Subtle surface highlight
    ctx.fillStyle = `rgba(180,230,255,${0.04 + 0.03 * Math.sin(t + sx / 30)})`;
    ctx.fillRect(sx, sy, ts, ts / 3);
}

function _tileFlower(ctx, tx, ty, sx, sy, ts) {
    ctx.fillStyle = '#5a9e42';
    ctx.fillRect(sx, sy, ts, ts);
    const seed   = tx * 23 + ty * 41;
    const colors = ['#ff88aa', '#ffdd44', '#ff6688', '#ffffff', '#ff99bb', '#aa88ff', '#ffaa44'];
    for (let i = 0; i < 6; i++) {
        const fi = (seed * (i + 7) * 1103515245 + 12345) & 0x7fffffff;
        const fx = sx + 3 + fi % (ts - 6);
        const fy = sy + 3 + (fi >> 6) % (ts - 6);
        ctx.fillStyle = colors[fi % colors.length];
        ctx.beginPath();
        ctx.arc(fx, fy, 1.8 + (fi % 2), 0, Math.PI * 2);
        ctx.fill();
    }
}

function _tileStart(ctx, sx, sy, ts, timestamp) {
    ctx.fillStyle = '#d4a000';
    ctx.fillRect(sx, sy, ts, ts);
    // Animated pulsing border
    const pulse = 0.5 + 0.5 * Math.sin(timestamp / 500);
    ctx.strokeStyle = `rgba(255,255,120,${0.5 + pulse * 0.5})`;
    ctx.lineWidth = 2 + pulse;
    ctx.strokeRect(sx + 2, sy + 2, ts - 4, ts - 4);
    // Checkerboard
    for (let i = 0; i < ts; i += 12) {
        for (let j = 0; j < ts; j += 12) {
            if ((i + j) % 24 === 0) {
                ctx.fillStyle = 'rgba(200,150,0,0.4)';
                ctx.fillRect(sx + i, sy + j, 12, 12);
            }
        }
    }
}

function _tileFountainBase(ctx, sx, sy, ts) {
    ctx.fillStyle = '#2b8acc';
    ctx.fillRect(sx, sy, ts, ts);
    ctx.strokeStyle = '#5ab8ee';
    ctx.lineWidth = 1;
    ctx.strokeRect(sx + 1, sy + 1, ts - 2, ts - 2);
}

function _tileZoo(ctx, tx, ty, sx, sy, ts) {
    ctx.fillStyle = '#4a7a25';
    ctx.fillRect(sx, sy, ts, ts);
}

function _tilePlayground(ctx, tx, ty, sx, sy, ts) {
    ctx.fillStyle = '#c06a05';
    ctx.fillRect(sx, sy, ts, ts);
    ctx.fillStyle = 'rgba(255,200,100,0.15)';
    ctx.fillRect(sx, sy, ts, ts);
}

function _tileBuilding(ctx, sx, sy, ts) {
    ctx.fillStyle = '#7a5c2e';
    ctx.fillRect(sx, sy, ts, ts);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(sx, sy + ts - 4, ts, 4);
    ctx.fillRect(sx + ts - 4, sy, 4, ts);
}

// ─── Feature objects ──────────────────────────────────────────────────────────

function _drawWLDTent(ctx, ts, timestamp) {
    const tx = 3, ty = 55;
    const sx = tx * ts, sy = ty * ts;
    const w  = 7 * ts, h = 4 * ts;

    // Ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(sx + w / 2 + 6, sy + h + 8, w / 2 + 4, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Tent body
    const tentGrad = ctx.createLinearGradient(sx, sy, sx + w, sy + h);
    tentGrad.addColorStop(0, '#1e5a9a');
    tentGrad.addColorStop(1, '#0e3060');
    ctx.fillStyle = tentGrad;
    ctx.fillRect(sx, sy, w, h);

    // Tent roof
    ctx.beginPath();
    ctx.moveTo(sx + w / 2, sy - ts * 1.8);
    ctx.lineTo(sx - ts * 0.4, sy + 2);
    ctx.lineTo(sx + w + ts * 0.4, sy + 2);
    ctx.closePath();
    const roofGrad = ctx.createLinearGradient(sx, sy - ts * 1.8, sx, sy);
    roofGrad.addColorStop(0, '#cc1a1a');
    roofGrad.addColorStop(1, '#8a1010');
    ctx.fillStyle = roofGrad;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Tent flap (entrance)
    ctx.fillStyle = '#0d2050';
    ctx.fillRect(sx + w * 0.38, sy + h * 0.3, w * 0.24, h * 0.7);

    // WLD logo
    if (_wldLogoImg && _wldLogoImg.complete && _wldLogoImg.naturalWidth > 0) {
        ctx.drawImage(_wldLogoImg, sx + 6, sy + 6, ts * 2.2, ts * 1.6);
    } else {
        ctx.fillStyle = '#ffd700';
        ctx.font = `bold ${ts * 0.6}px "Orbitron", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('WLD', sx + ts * 1.2, sy + ts * 0.8);
    }

    // Start/stop machine on table
    const tableX = sx + ts * 2.4, tableY = sy + ts * 0.4;
    // Table surface
    ctx.fillStyle = '#5a4020';
    ctx.fillRect(tableX - 6, tableY + ts * 1.5, ts * 4.5 + 12, 6);
    ctx.fillStyle = '#4a3010';
    ctx.fillRect(tableX, tableY + ts * 1.5 + 6, 6, ts * 0.4);
    ctx.fillRect(tableX + ts * 4, tableY + ts * 1.5 + 6, 6, ts * 0.4);

    if (_startStopImg && _startStopImg.complete && _startStopImg.naturalWidth > 0) {
        ctx.save();
        ctx.shadowColor = 'rgba(255,150,0,0.4)';
        ctx.shadowBlur = 8;
        ctx.drawImage(_startStopImg, tableX, tableY, ts * 4, ts * 1.5);
        ctx.restore();
    } else {
        ctx.fillStyle = '#ddd';
        ctx.fillRect(tableX, tableY, ts * 4, ts * 1.5);
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(tableX + 4, tableY + ts * 0.35, ts * 4 - 8, ts * 0.8);
        ctx.fillStyle = '#ff8800';
        ctx.font = `bold ${ts * 0.38}px "Share Tech Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('STOP  00:00:00', tableX + ts * 2, tableY + ts * 0.75);
    }

    // Banner text
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${ts * 0.28}px "Orbitron", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('WLD FoxWave ARDF', sx + w / 2, sy + h - ts * 0.85);

    // Antenna mast
    ctx.strokeStyle = '#aaa';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sx + w - ts * 0.6, sy);
    ctx.lineTo(sx + w - ts * 0.6, sy - ts * 3.5);
    ctx.stroke();
    // Cross-arms
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx + w - ts * 0.6 - ts * 0.6, sy - ts * 2.8);
    ctx.lineTo(sx + w - ts * 0.6 + ts * 0.6, sy - ts * 2.8);
    ctx.stroke();

    // Animated radio waves
    const t = timestamp / 700;
    for (let i = 1; i <= 4; i++) {
        const age   = ((t + i * 0.5) % 4) / 4;
        const alpha = Math.max(0, 1 - age * 1.5) * 0.7;
        const rad   = i * 12 + age * 30;
        ctx.strokeStyle = `rgba(255,215,0,${alpha})`;
        ctx.lineWidth   = 2 - age;
        ctx.beginPath();
        ctx.arc(sx + w - ts * 0.6, sy - ts * 2.8, rad, -Math.PI * 0.65, -Math.PI * 0.05);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(sx + w - ts * 0.6, sy - ts * 2.8, rad, -Math.PI * 0.95, -Math.PI * 0.35);
        ctx.stroke();
    }

    ctx.textBaseline = 'alphabetic';
}

function _drawFountain(ctx, ts, timestamp) {
    const cx = 49 * ts + ts / 2;
    const cy = 22 * ts + ts / 2;
    const t  = timestamp / 1400;
    const r  = ts * 2.2;

    // Basin rim
    ctx.beginPath();
    ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
    ctx.fillStyle = '#8aabb8';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#1a7abf';
    ctx.fill();

    // Water shimmer
    ctx.strokeStyle = 'rgba(180,230,255,0.3)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + t * 0.3;
        const rx = cx + Math.cos(a) * r * 0.5;
        const ry = cy + Math.sin(a) * r * 0.3;
        ctx.beginPath(); ctx.arc(rx, ry, r * 0.15 + Math.sin(t * 2 + i) * 3, 0, Math.PI * 2); ctx.stroke();
    }

    // Jets
    for (let i = 0; i < 8; i++) {
        const a   = (i / 8) * Math.PI * 2 + t * 0.2;
        const jh  = ts * 0.9 + Math.sin(t * 3 + i * 1.3) * ts * 0.25;
        const jx1 = cx + Math.cos(a) * ts * 0.35;
        const jy1 = cy + Math.sin(a) * ts * 0.35;
        const jx2 = cx + Math.cos(a) * ts * 0.8;
        const jy2 = cy + Math.sin(a) * ts * 0.8 - jh;
        ctx.strokeStyle = `rgba(160,220,255,${0.6 + Math.sin(t + i) * 0.2})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(jx1, jy1);
        ctx.quadraticCurveTo((jx1 + jx2) / 2, jy1 - jh * 0.6, jx2, jy2);
        ctx.stroke();
        // Droplet
        ctx.beginPath();
        ctx.arc(jx2, jy2, 2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(200,235,255,0.7)';
        ctx.fill();
    }

    // Centre spout
    ctx.beginPath();
    ctx.arc(cx, cy, ts * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = '#5bc8ee';
    ctx.fill();
    ctx.strokeStyle = '#8ad8f8';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Label
    ctx.fillStyle = '#d4f4ff';
    ctx.font = `bold ${ts * 0.35}px "Orbitron", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('FONTEIN', cx, cy - r - 4);
    ctx.textBaseline = 'alphabetic';
}

function _drawZooArea(ctx, ts, timestamp) {
    const x1 = 61 * ts, y1 = 6 * ts, x2 = 75 * ts, y2 = 15 * ts;
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;

    // Fence
    ctx.strokeStyle = '#8B6914';
    ctx.lineWidth = 3;
    ctx.setLineDash([7, 5]);
    ctx.strokeRect(x1 + 3, y1 + 3, x2 - x1 - 6, y2 - y1 - 6);
    ctx.setLineDash([]);

    // Fence posts
    ctx.fillStyle = '#6a4a10';
    for (let fx = x1 + 3; fx <= x2 - 3; fx += ts) {
        ctx.fillRect(fx - 3, y1, 6, 10);
        ctx.fillRect(fx - 3, y2 - 10, 6, 10);
    }

    // Animals (emoji, always fun)
    ctx.font = `${ts * 0.7}px serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const animals = ['🦁','🦒','🐘','🦓'];
    for (let i = 0; i < animals.length; i++) {
        const ax = x1 + ts * 1.5 + i * ts * 2.5;
        const ay = cy + Math.sin(timestamp / 1200 + i) * 4;
        ctx.fillText(animals[i], ax, ay);
    }

    ctx.fillStyle = '#ffd700';
    ctx.font = `bold ${ts * 0.45}px "Orbitron", monospace`;
    ctx.fillText('🐾 DIERENPARK', cx, y2 - ts * 0.35);
    ctx.textBaseline = 'alphabetic';
}

function _drawPlayground(ctx, ts) {
    const x1 = 4 * ts, y1 = 6 * ts, x2 = 17 * ts, y2 = 15 * ts;
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;

    // Swingset frame
    ctx.strokeStyle = '#7a4a00';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x1 + ts, y1 + ts); ctx.lineTo(x1 + ts, cy + ts); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x1 + ts * 2, y1 + ts); ctx.lineTo(x1 + ts * 2, cy + ts); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x1 + ts * 0.6, y1 + ts); ctx.lineTo(x1 + ts * 2.4, y1 + ts); ctx.stroke();
    // Swing seat
    ctx.fillStyle = '#cc5500';
    ctx.fillRect(x1 + ts * 0.7, cy + ts * 0.3, ts * 1.6, ts * 0.2);

    // Slide
    ctx.strokeStyle = '#dd4400'; ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx + ts * 0.5, y1 + ts * 0.5);
    ctx.lineTo(cx + ts * 2, cy + ts);
    ctx.stroke();

    // Sandbox
    ctx.fillStyle = '#e8c870';
    ctx.beginPath(); ctx.arc(cx - ts * 0.5, cy + ts * 0.8, ts * 0.6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#c8a050'; ctx.lineWidth = 2; ctx.stroke();

    // Label
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${ts * 0.38}px "Orbitron", monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('🎠 SPEELTUIN', cx, y2 - 4);
    ctx.textBaseline = 'alphabetic';
}

function _drawCafe(ctx, ts) {
    const x1 = 61 * ts, y1 = 43 * ts, x2 = 75 * ts, y2 = 53 * ts;
    const cx = (x1 + x2) / 2;

    // Roof/awning
    ctx.fillStyle = '#c01818';
    ctx.fillRect(x1 - 6, y1 - ts * 0.4, x2 - x1 + 12, ts * 0.55);
    for (let i = 0; i < 9; i++) {
        if (i % 2 === 0) {
            const ax = x1 - 6 + i * ((x2 - x1 + 12) / 9);
            ctx.fillStyle = '#fff';
            ctx.fillRect(ax, y1 - ts * 0.4, (x2 - x1 + 12) / 9, ts * 0.55);
        }
    }

    // Facade
    const facadeGrad = ctx.createLinearGradient(x1, y1, x1, y2);
    facadeGrad.addColorStop(0, '#9a7230');
    facadeGrad.addColorStop(1, '#6a4a18');
    ctx.fillStyle = facadeGrad;
    ctx.fillRect(x1, y1, x2 - x1, y2 - y1);

    // Windows with reflection
    const winH = ts * 0.9, winW = ts * 0.9;
    [[x1 + ts * 0.4, y1 + ts * 0.5],
     [x1 + ts * 1.8, y1 + ts * 0.5],
     [x1 + ts * 3.2, y1 + ts * 0.5]].forEach(([wx, wy]) => {
        ctx.fillStyle = '#87ceeb';
        ctx.fillRect(wx, wy, winW, winH);
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(wx, wy, winW * 0.4, winH);
        ctx.strokeStyle = '#5a3a10'; ctx.lineWidth = 2;
        ctx.strokeRect(wx, wy, winW, winH);
    });

    // Door
    ctx.fillStyle = '#4a2a08';
    ctx.fillRect(cx - ts * 0.45, y2 - ts * 1.6, ts * 0.9, ts * 1.6);
    ctx.fillStyle = '#d4a840';
    ctx.beginPath(); ctx.arc(cx + ts * 0.25, y2 - ts * 0.8, 3, 0, Math.PI * 2); ctx.fill();

    // Sign
    ctx.fillStyle = '#ffd700';
    ctx.font = `bold ${ts * 0.42}px "Orbitron", monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('☕ BRASSERIE', cx, y1 + ts * 1.95);
    ctx.textBaseline = 'alphabetic';
}

function _drawTrainSprite(ctx, ts, timestamp) {
    const totalLen = (73 + 49 + 73 + 49);
    const speed    = totalLen / 12; // tiles per second
    const pos      = ((timestamp / 1000 * speed / totalLen) % 1) * totalLen;

    let bx, by, bearing;
    if      (pos < 73)         { bx = 3 + pos;           by = 5;             bearing = 90;  }
    else if (pos < 73 + 49)    { bx = 76;                by = 5 + pos - 73;  bearing = 180; }
    else if (pos < 73 + 49 + 73){ bx = 76 - (pos - 122); by = 54;            bearing = 270; }
    else                        { bx = 3;                 by = 54 - (pos - 195); bearing = 0; }

    const sx = bx * ts, sy = by * ts;
    ctx.save();
    ctx.translate(sx + ts / 2, sy + ts / 2);
    ctx.rotate(bearing * Math.PI / 180);

    const w = ts * 1.8, h = ts * 0.72;
    // Body
    ctx.fillStyle = '#cc1a1a';
    ctx.roundRect(-w / 2, -h / 2, w, h, 5);
    ctx.fill();
    // Windows
    ctx.fillStyle = '#87ceeb';
    for (let i = 0; i < 3; i++) {
        ctx.fillRect(-w / 2 + 6 + i * (w / 3.2), -h / 2 + 5, w / 4.2, h - 10);
    }
    // Wheels
    ctx.fillStyle = '#222';
    for (const wx of [-w * 0.32, w * 0.22]) {
        ctx.beginPath(); ctx.arc(wx, h / 2, 4, 0, Math.PI * 2); ctx.fill();
    }
    // Front light
    ctx.fillStyle = '#ffee88';
    ctx.beginPath(); ctx.arc(w / 2 - 3, 0, 4, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
}

// ─── Fox markers ──────────────────────────────────────────────────────────────

function _drawFoxMarkers(ctx, ts, timestamp) {
    for (const beacon of getBeacons()) {
        const dist = Math.hypot(beacon.x - Player.x, beacon.y - Player.y);
        if (beacon.found) {
            _drawFoundFlag(ctx, beacon.x * ts + ts / 2, beacon.y * ts + ts / 2, ts, beacon, timestamp);
        } else if (dist <= CONFIG.FOX_DETECTION_RADIUS + 3) {
            // Proximity glow
            const pct   = 1 - dist / (CONFIG.FOX_DETECTION_RADIUS + 3);
            const pulse = Math.abs(Math.sin(timestamp / 350));
            ctx.beginPath();
            ctx.arc(beacon.x * ts + ts / 2, beacon.y * ts + ts / 2, ts * 1.5 * pct, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,215,0,${pct * pulse * 0.5})`;
            ctx.fill();
        }
    }
}

function _drawFoundFlag(ctx, sx, sy, ts, beacon, timestamp) {
    // Pole
    ctx.strokeStyle = '#ccc'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(sx, sy + ts * 0.4); ctx.lineTo(sx, sy - ts * 0.7); ctx.stroke();
    // Flag wave
    const wave = Math.sin(timestamp / 400) * 3;
    ctx.fillStyle = beacon.color;
    ctx.beginPath();
    ctx.moveTo(sx, sy - ts * 0.7);
    ctx.quadraticCurveTo(sx + ts * 0.5 + wave, sy - ts * 0.5 + wave * 0.3, sx + ts * 0.5, sy - ts * 0.3);
    ctx.lineTo(sx, sy - ts * 0.3);
    ctx.closePath();
    ctx.fill();
    // Fox emoji
    ctx.font = `${ts * 0.55}px serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('🦊', sx, sy - ts * 0.2);
    ctx.textBaseline = 'alphabetic';
}

// ─── Player ───────────────────────────────────────────────────────────────────

function _drawPlayer(ctx, px, py, ts, facing, timestamp, gameState) {
    const r   = ts * 0.30;
    const bob = (gameState === STATE.HUNTING)
              ? Math.sin(timestamp / 140) * 2  // walking bob
              : 0;

    ctx.save();
    ctx.translate(px, py + bob);
    ctx.rotate(facing * Math.PI / 180);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(2, r * 0.5 - bob, r * 0.65, r * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();

    // Backpack
    ctx.fillStyle = '#0d2d0d';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.3, r * 0.55, r * 0.65, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body jacket
    const bodyGrad = ctx.createRadialGradient(-r * 0.2, -r * 0.2, 0, 0, 0, r);
    bodyGrad.addColorStop(0, '#2a8a2a');
    bodyGrad.addColorStop(1, '#0f4a0f');
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 1.15, 0, 0, Math.PI * 2);
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    // Head
    ctx.fillStyle = '#f4c090';
    ctx.beginPath(); ctx.arc(0, -r * 0.9, r * 0.38, 0, Math.PI * 2); ctx.fill();
    // Hair
    ctx.fillStyle = '#7a4a18';
    ctx.beginPath(); ctx.arc(0, -r * 1.05, r * 0.3, Math.PI, 0); ctx.fill();

    // Receiver antenna (forward)
    ctx.strokeStyle = '#ccc'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-3, -r * 0.5); ctx.lineTo(-3, -r * 1.9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3,  -r * 0.5); ctx.lineTo(3,  -r * 1.9); ctx.stroke();
    // Crossbar
    ctx.beginPath(); ctx.moveTo(-ts * 0.22, -r * 1.5); ctx.lineTo(ts * 0.22, -r * 1.5); ctx.stroke();

    // Receiver box (held in hand)
    if (gameState === STATE.RECEIVER) {
        ctx.fillStyle = '#333';
        ctx.fillRect(r * 0.5, -r * 0.3, r * 0.7, r * 0.4);
        ctx.fillStyle = '#00ff44';
        ctx.fillRect(r * 0.55, -r * 0.25, r * 0.55, r * 0.15);
    }

    ctx.restore();
}

// ─── Screen overlays ──────────────────────────────────────────────────────────

function _drawReceiverGlow(ctx, px, py, ts, timestamp) {
    const pulse = 0.4 + 0.3 * Math.sin(timestamp / 300);
    const bearing = Player.receiverBearing;
    const halfAngle = CONFIG.RECEIVER_BEAMWIDTH;
    const startAngle = (bearing - halfAngle - 90) * Math.PI / 180;
    const endAngle   = (bearing + halfAngle - 90) * Math.PI / 180;

    const grad = ctx.createRadialGradient(px, py, 0, px, py, ts * CONFIG.FOX_AUDIO_RADIUS * 0.3);
    grad.addColorStop(0,   `rgba(74,222,128,${pulse * 0.35})`);
    grad.addColorStop(0.6, `rgba(74,222,128,${pulse * 0.1})`);
    grad.addColorStop(1,    'rgba(74,222,128,0)');

    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.arc(px, py, ts * CONFIG.FOX_AUDIO_RADIUS * 0.3, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
}

function _drawVignette(ctx, w, h) {
    const grad = ctx.createRadialGradient(w / 2, h / 2, h * 0.28, w / 2, h / 2, h * 0.82);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
}

function _drawStatusBar(ctx, w, gameState, timestamp) {
    // Bar background
    const barH = 46;
    ctx.fillStyle = 'rgba(2,8,2,0.82)';
    ctx.fillRect(0, 0, w, barH);
    ctx.fillStyle = '#1a4a1a';
    ctx.fillRect(0, barH, w, 2);

    // Title
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 15px "Orbitron", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('🦊 WLD FoxWave ARDF', 12, barH / 2);

    // Timer
    ctx.fillStyle = '#4ade80';
    ctx.font = 'bold 22px "Share Tech Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('⏱ ' + Player.getElapsedString(), w / 2, barH / 2);

    // Fox count
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 15px "Orbitron", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`🦊 ${Player.foundFoxes.size} / ${CONFIG.FOX_COUNT}`, w - 12, barH / 2);

    // Mode pill
    const modes = {
        [STATE.HUNTING]:  { t: '⚡ HUNTING',  c: '#4ade80' },
        [STATE.RECEIVER]: { t: '📡 RECEIVER', c: '#ffd700' },
        [STATE.MAP_VIEW]: { t: '🗺  MAP',     c: '#44aaff' },
        [STATE.BRIEFING]: { t: '🏕  READY',  c: '#888'    },
        [STATE.FINISHED]: { t: '🏁 RETURN!', c: '#ff8800' },
    };
    const m = modes[gameState];
    if (m) {
        ctx.fillStyle = m.c;
        ctx.font = '11px "Share Tech Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(m.t, w / 2, barH + 4);
    }
    ctx.textBaseline = 'alphabetic';
}

function _drawReturnBanner(ctx, w, h, timestamp) {
    const pulse = 0.7 + 0.3 * Math.sin(timestamp / 400);
    ctx.fillStyle = `rgba(2,8,2,${0.88 * pulse})`;
    ctx.fillRect(w * 0.15, h - 70, w * 0.70, 54);
    ctx.strokeStyle = `rgba(255,136,0,${pulse})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(w * 0.15, h - 70, w * 0.70, 54);

    ctx.fillStyle = `rgba(255,150,0,${pulse})`;
    ctx.font = 'bold 18px "Orbitron", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🏁 Alle vossen! Keer terug naar het WLD-tent!', w / 2, h - 43);
    ctx.textBaseline = 'alphabetic';
}
