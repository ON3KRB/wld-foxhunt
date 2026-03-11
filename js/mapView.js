/**
 * mapView.js - Park overview map + bearing line UI (v2)
 * WLD FoxWave ARDF
 *
 * Improvements:
 *  - Player-centred minimap with smooth pan
 *  - Cleaner bearing input UI with live preview line
 *  - Intersections highlighted where bearing lines cross
 *  - Tooltip labels for park features
 *  - Delete buttons repositioned for easier clicking
 */

"use strict";

const MAP_COLORS = {
    [TILE.GRASS]:       '#3d6634',
    [TILE.PATH]:        '#b89050',
    [TILE.TREE]:        '#254a18',
    [TILE.WATER]:       '#1f5898',
    [TILE.BUILDING]:    '#6a4c24',
    [TILE.PLAYGROUND]:  '#b86005',
    [TILE.FOUNTAIN]:    '#2a86c8',
    [TILE.TRAIN]:       '#b89050',
    [TILE.ZOO]:         '#4a7520',
    [TILE.START]:       '#e8c800',
    [TILE.DENSE_TREE]:  '#162d0c',
    [TILE.FLOWER]:      '#5a9242',
    [TILE.SHRUB]:       '#326020',
};

// Store clickable delete-button hit areas for mouse handling
let _deleteBtnAreas = [];

/**
 * Draw the park overview map panel.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 */
function drawMapPanel(ctx, width, height) {
    const W = CONFIG.WORLD_WIDTH;
    const H = CONFIG.WORLD_HEIGHT;
    const UI_H   = 118;
    const TITLE_H = 24;
    const mapH   = height - UI_H - TITLE_H;

    // ── Calculate tile size ───────────────────────────────────────────────────
    const ts = Math.min(
        Math.floor(width  / W),
        Math.floor(mapH   / H)
    );
    const mapW = ts * W;
    const mH   = ts * H;
    const offX = Math.floor((width - mapW) / 2);
    const offY = TITLE_H + 4;

    // Background
    ctx.fillStyle = '#030a03';
    ctx.fillRect(0, 0, width, height);

    // Title bar
    ctx.fillStyle = '#0a1a0a';
    ctx.fillRect(0, 0, width, TITLE_H);
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 12px "Orbitron", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🗺  KAART · PARK OVERZICHT', width / 2, TITLE_H / 2);

    // ── Tiles ─────────────────────────────────────────────────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.rect(offX, offY, mapW, mH);
    ctx.clip();
    ctx.translate(offX, offY);

    for (let ty = 0; ty < H; ty++) {
        for (let tx = 0; tx < W; tx++) {
            const tile = getTile(tx, ty);
            ctx.fillStyle = MAP_COLORS[tile] || MAP_COLORS[TILE.GRASS];
            ctx.fillRect(tx * ts, ty * ts, ts, ts);
        }
    }

    // ── Bearing lines ─────────────────────────────────────────────────────────
    for (const line of Player.bearingLines) {
        _drawBearingLine(ctx, line, ts, W, H);
    }

    // Live preview (if typing a bearing)
    if (Player.bearingInput.length > 0) {
        const previewBearing = parseInt(Player.bearingInput, 10) || 0;
        _drawBearingLine(ctx, {
            fromX: Player.x, fromY: Player.y,
            bearing: previewBearing,
            color: 'rgba(255,255,255,0.4)',
            id: -1,
        }, ts, W, H, true);
    }

    // ── Intersection hints ────────────────────────────────────────────────────
    if (Player.bearingLines.length >= 2) {
        _drawIntersections(ctx, Player.bearingLines, ts, W, H);
    }

    // ── Feature labels ────────────────────────────────────────────────────────
    if (ts >= 4) _drawFeatureLabels(ctx, ts);

    // ── Found foxes ───────────────────────────────────────────────────────────
    for (const b of getFoundBeacons()) {
        const bx = b.x * ts + ts / 2;
        const by = b.y * ts + ts / 2;
        ctx.fillStyle = b.color;
        ctx.beginPath(); ctx.arc(bx, by, Math.max(3, ts * 1.2), 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
        if (ts >= 4) {
            ctx.font = `bold ${Math.max(6, ts * 1.1)}px "Orbitron", monospace`;
            ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
            ctx.fillText(b.code, bx, by - ts * 0.8);
        }
    }

    // ── Player dot ────────────────────────────────────────────────────────────
    _drawPlayerDot(ctx, Player.x, Player.y, ts);

    // ── Receiver beam direction (if in receiver mode) ─────────────────────────
    if (window.gameState === STATE.RECEIVER) {
        _drawReceiverBeam(ctx, Player.x, Player.y, ts);
    }

    ctx.restore();

    // ── Map border ────────────────────────────────────────────────────────────
    ctx.strokeStyle = '#1a4a1a'; ctx.lineWidth = 1;
    ctx.strokeRect(offX, offY, mapW, mH);

    // ── Bearing input UI ─────────────────────────────────────────────────────
    _drawBearingUI(ctx, width, height, UI_H);

    ctx.textBaseline = 'alphabetic';
}

// ─── Map drawing helpers ──────────────────────────────────────────────────────

function _drawBearingLine(ctx, line, ts, W, H, dashed = false) {
    const { fromX, fromY, bearing, color } = line;
    const len = Math.max(W, H) * 2;
    const rad = (bearing - 90) * Math.PI / 180;
    const x1  = fromX * ts + ts / 2;
    const y1  = fromY * ts + ts / 2;
    const x2  = x1 + Math.cos(rad) * len * ts;
    const y2  = y1 + Math.sin(rad) * len * ts;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth   = dashed ? 1.5 : 2;
    ctx.globalAlpha = dashed ? 0.6 : 0.9;
    ctx.setLineDash(dashed ? [4, 4] : [6, 3]);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.setLineDash([]);

    // Origin marker
    ctx.globalAlpha = 1;
    ctx.fillStyle   = color;
    ctx.beginPath(); ctx.arc(x1, y1, Math.max(2.5, ts * 0.6), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
}

function _drawIntersections(ctx, lines, ts, W, H) {
    for (let i = 0; i < lines.length; i++) {
        for (let j = i + 1; j < lines.length; j++) {
            const pt = _lineIntersection(lines[i], lines[j], ts, W, H);
            if (pt) {
                // Pulsing yellow dot at intersection
                const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 500);
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, 5 + pulse * 2, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255,215,0,${0.25 * pulse})`;
                ctx.fill();
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
                ctx.fillStyle = '#ffd700';
                ctx.fill();
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
                ctx.stroke();
            }
        }
    }
}

function _lineIntersection(a, b, ts, W, H) {
    const toRad = deg => (deg - 90) * Math.PI / 180;
    const ax1 = a.fromX * ts + ts / 2, ay1 = a.fromY * ts + ts / 2;
    const bx1 = b.fromX * ts + ts / 2, by1 = b.fromY * ts + ts / 2;
    const ax2 = ax1 + Math.cos(toRad(a.bearing)) * W * ts * 2;
    const ay2 = ay1 + Math.sin(toRad(a.bearing)) * H * ts * 2;
    const bx2 = bx1 + Math.cos(toRad(b.bearing)) * W * ts * 2;
    const by2 = by1 + Math.sin(toRad(b.bearing)) * H * ts * 2;

    const dxa = ax2 - ax1, dya = ay2 - ay1;
    const dxb = bx2 - bx1, dyb = by2 - by1;
    const denom = dxa * dyb - dya * dxb;
    if (Math.abs(denom) < 0.001) return null;

    const t = ((bx1 - ax1) * dyb - (by1 - ay1) * dxb) / denom;
    if (t < 0.01 || t > 2) return null;

    const x = ax1 + t * dxa;
    const y = ay1 + t * dya;
    if (x < 0 || x > W * ts || y < 0 || y > H * ts) return null;
    return { x, y };
}

function _drawFeatureLabels(ctx, ts) {
    const features = [
        { tx: 5,  ty: 56, label: 'WLD 🏕', color: '#ffd700' },
        { tx: 49, ty: 22, label: '⛲',     color: '#88ccff' },
        { tx: 68, ty: 11, label: '🦁 ZOO', color: '#ffdd88' },
        { tx: 10, ty: 22, label: '💧',     color: '#88ccff' },
        { tx: 68, ty: 48, label: '☕',     color: '#ffccaa' },
        { tx: 39, ty: 3,  label: '🚂',     color: '#ffaa88' },
        { tx: 10, ty: 10, label: '🎠',     color: '#ffccff' },
    ];
    ctx.font = `${Math.max(7, ts * 1.5)}px serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const f of features) {
        ctx.fillStyle = f.color;
        ctx.fillText(f.label, f.tx * ts, f.ty * ts);
    }
}

function _drawPlayerDot(ctx, px, py, ts) {
    const x = px * ts + ts / 2;
    const y = py * ts + ts / 2;
    const r = Math.max(3, ts * 0.8);

    // Pulse ring
    const p = 0.5 + 0.5 * Math.sin(Date.now() / 350);
    ctx.beginPath(); ctx.arc(x, y, r + 3 + p * 4, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${p * 0.2})`; ctx.fill();

    // Dot
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 1.5; ctx.stroke();

    // Direction arrow
    const rad = (Player.facing - 90) * Math.PI / 180;
    ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(rad) * (r + 5), y + Math.sin(rad) * (r + 5));
    ctx.stroke();
}

function _drawReceiverBeam(ctx, px, py, ts) {
    const cx  = px * ts + ts / 2;
    const cy  = py * ts + ts / 2;
    const rad = (Player.receiverBearing - 90) * Math.PI / 180;
    const len = 30 * ts;
    const halfAngle = CONFIG.RECEIVER_BEAMWIDTH * Math.PI / 180;

    const lAngle = rad - halfAngle;
    const rAngle = rad + halfAngle;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, len, lAngle, rAngle);
    ctx.closePath();
    ctx.fillStyle = 'rgba(74,222,128,0.08)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(74,222,128,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
}

// ─── Bearing input UI ─────────────────────────────────────────────────────────

function _drawBearingUI(ctx, width, height, uiH) {
    const y0 = height - uiH;
    _deleteBtnAreas = [];

    // Panel background
    ctx.fillStyle = '#060e06';
    ctx.fillRect(0, y0, width, uiH);
    ctx.fillStyle = '#1a4a1a';
    ctx.fillRect(0, y0, width, 1);

    // Title
    ctx.fillStyle = '#4ade80';
    ctx.font = 'bold 11px "Orbitron", monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('📐 PEILING INVOEREN', 8, y0 + 6);

    // Input box
    const inputY = y0 + 22;
    const inputW = width - 16;
    const val    = Player.bearingInput;

    ctx.fillStyle = '#040c04';
    ctx.strokeStyle = val.length > 0 ? '#ffd700' : '#1a4a1a';
    ctx.lineWidth = val.length > 0 ? 2 : 1;
    ctx.fillRect(8, inputY, inputW, 26);
    ctx.strokeRect(8, inputY, inputW, 26);

    // Value
    ctx.fillStyle = val.length > 0 ? '#ffd700' : '#2a4a2a';
    ctx.font = `bold 20px "Share Tech Mono", monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(val.length > 0 ? val + '°' : '___°', width / 2, inputY + 13);

    // [Enter] hint
    if (val.length > 0) {
        ctx.fillStyle = '#4ade80';
        ctx.font = '10px "Share Tech Mono", monospace';
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.fillText('[↵ Enter]', width - 10, inputY + 13);
    }

    // Bearing lines list
    const lines = Player.bearingLines;
    const listY = inputY + 32;

    ctx.fillStyle = '#2a4a2a';
    ctx.font = '10px "Share Tech Mono", monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(lines.length > 0 ? 'Peilijnen (klik ✕ om te wissen):' : 'Nog geen peilijnen.', 8, listY);

    const colW  = (width - 16) / 3;
    const rowH  = 18;

    for (let i = 0; i < Math.min(lines.length, 6); i++) {
        const line = lines[i];
        const col  = i % 3;
        const row  = Math.floor(i / 3);
        const lx   = 8 + col * colW;
        const ly   = listY + 12 + row * rowH;

        // Colour swatch
        ctx.fillStyle = line.color;
        ctx.fillRect(lx, ly + 2, 10, 10);

        // Bearing value
        ctx.fillStyle = '#a0c8a0';
        ctx.font = '11px "Share Tech Mono", monospace';
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(`${Math.round(line.bearing)}°`, lx + 13, ly + 1);

        // Delete button
        const delX = lx + 46, delY = ly;
        ctx.fillStyle = '#3a0000';
        ctx.fillRect(delX, delY, 14, 13);
        ctx.strokeStyle = '#ff4444'; ctx.lineWidth = 1;
        ctx.strokeRect(delX, delY, 14, 13);
        ctx.fillStyle = '#ff6666';
        ctx.font = '9px "Share Tech Mono", monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('✕', delX + 7, delY + 6);

        _deleteBtnAreas.push({ id: line.id, x: delX, y: delY, w: 14, h: 13 });
    }

    // Key hints at bottom
    ctx.fillStyle = '#2a4a2a';
    ctx.font = '9px "Share Tech Mono", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('[0-9] type peiling   [Enter] lijn   [⌫] wis   [H/M] terug', width / 2, height - 2);
}

/**
 * Handle click in map panel canvas (delete bearing line buttons).
 * Exposed for use in main.js.
 */
function handleMapPanelClick(e, canvasW, canvasH) {
    const mx = e.offsetX, my = e.offsetY;
    for (const btn of _deleteBtnAreas) {
        if (mx >= btn.x && mx <= btn.x + btn.w && my >= btn.y && my <= btn.y + btn.h) {
            Player.removeBearingLine(btn.id);
            return;
        }
    }
}
