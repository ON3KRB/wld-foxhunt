/**
 * mapView.js - Park map overview and bearing line renderer
 * WLD FoxWave ARDF
 *
 * Draws the park as a small overhead map in the right-top panel.
 * Also handles bearing line input display and management.
 */

"use strict";

// Tile colours for the minimap (simplified palette)
const MAP_COLORS = {
    [TILE.GRASS]:       '#4a7c3f',
    [TILE.PATH]:        '#c8a060',
    [TILE.TREE]:        '#2d5a1f',
    [TILE.WATER]:       '#2b6cb0',
    [TILE.BUILDING]:    '#7a5c2e',
    [TILE.PLAYGROUND]:  '#d4770a',
    [TILE.FOUNTAIN]:    '#3498db',
    [TILE.TRAIN]:       '#c8a060',
    [TILE.ZOO]:         '#5a8a2a',
    [TILE.START]:       '#ffd700',
    [TILE.DENSE_TREE]:  '#1a3a10',
    [TILE.FLOWER]:      '#6aae52',
    [TILE.SHRUB]:       '#3a6a20',
};

/**
 * Draw the full park overview map.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width   canvas width
 * @param {number} height  canvas height
 */
function drawMapPanel(ctx, width, height) {
    const W  = CONFIG.WORLD_WIDTH;
    const H  = CONFIG.WORLD_HEIGHT;

    // Reserve bottom area for bearing input UI
    const UI_H  = 110;
    const mapH  = height - UI_H;

    // Calculate tile size to fit map
    const ts = Math.min(
        Math.floor(width  / W),
        Math.floor(mapH   / H)
    );
    const mapDisplayW = ts * W;
    const mapDisplayH = ts * H;
    const offX = Math.floor((width - mapDisplayW) / 2);
    const offY = 4;

    // Background
    ctx.fillStyle = '#050f05';
    ctx.fillRect(0, 0, width, height);

    // Title
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 13px "Orbitron", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('🗺  PARK MAP', width / 2, 4);

    // ── Draw tiles ────────────────────────────────────────────────────────────
    ctx.save();
    ctx.translate(offX, offY + 20);

    for (let ty = 0; ty < H; ty++) {
        for (let tx = 0; tx < W; tx++) {
            const tile = getTile(tx, ty);
            ctx.fillStyle = MAP_COLORS[tile] || MAP_COLORS[TILE.GRASS];
            ctx.fillRect(tx * ts, ty * ts, ts, ts);
        }
    }

    // ── Draw bearing lines ────────────────────────────────────────────────────
    for (const line of Player.bearingLines) {
        _drawBearingLine(ctx, line, ts);
    }

    // ── Draw feature labels ───────────────────────────────────────────────────
    if (ts >= 5) {
        _drawMapFeatureLabels(ctx, ts);
    }

    // ── Draw player position ─────────────────────────────────────────────────
    _drawPlayerDot(ctx, Player.x, Player.y, ts);

    // ── Draw found fox markers ────────────────────────────────────────────────
    for (const b of getFoundBeacons()) {
        _drawFoxDot(ctx, b.x, b.y, b.color, ts);
    }

    ctx.restore();

    // ── Bearing input UI ─────────────────────────────────────────────────────
    _drawBearingInputUI(ctx, width, height, UI_H);

    ctx.textBaseline = 'alphabetic';
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function _drawBearingLine(ctx, line, ts) {
    const { fromX, fromY, bearing, color } = line;
    const len = Math.max(CONFIG.WORLD_WIDTH, CONFIG.WORLD_HEIGHT) * 2;

    const rad = (bearing - 90) * Math.PI / 180;
    const x1  = fromX * ts + ts / 2;
    const y1  = fromY * ts + ts / 2;
    const x2  = x1 + Math.cos(rad) * len * ts;
    const y2  = y1 + Math.sin(rad) * len * ts;

    ctx.strokeStyle = color;
    ctx.lineWidth   = 2;
    ctx.setLineDash([5, 3]);
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Origin dot
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x1, y1, 3, 0, Math.PI * 2);
    ctx.fill();
}

function _drawPlayerDot(ctx, px, py, ts) {
    const x = px * ts + ts / 2;
    const y = py * ts + ts / 2;

    // Pulsing glow
    const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 400);
    ctx.beginPath();
    ctx.arc(x, y, 5 + pulse * 3, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${0.2 + pulse * 0.2})`;
    ctx.fill();

    // Dot
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Direction arrow
    const rad = (Player.facing - 90) * Math.PI / 180;
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(rad) * 8, y + Math.sin(rad) * 8);
    ctx.stroke();
}

function _drawFoxDot(ctx, fx, fy, color, ts) {
    const x = fx * ts + ts / 2;
    const y = fy * ts + ts / 2;

    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
}

function _drawMapFeatureLabels(ctx, ts) {
    const labels = [
        { x: 6,  y: 10, text: 'SPEELTUIN', color: '#ffd700' },
        { x: 49, y: 22, text: 'FONTEIN',  color: '#4db8e8' },
        { x: 68, y: 11, text: 'ZOO',       color: '#ffd700' },
        { x: 10, y: 22, text: 'VIJVER',    color: '#87ceeb' },
        { x: 68, y: 48, text: 'CAFÉ',      color: '#ffd700' },
        { x:  5, y: 56, text: 'WLD',       color: '#ffd700' },
    ];
    ctx.font = `bold ${Math.max(7, ts * 0.8)}px "Orbitron", monospace`;
    ctx.textBaseline = 'middle';
    for (const l of labels) {
        ctx.fillStyle = l.color;
        ctx.textAlign = 'center';
        ctx.fillText(l.text, l.x * ts, l.y * ts);
    }
}

// ─── Bearing input UI ─────────────────────────────────────────────────────────

function _drawBearingInputUI(ctx, width, height, uiH) {
    const y0 = height - uiH;

    // Separator
    ctx.fillStyle = '#0d2d0d';
    ctx.fillRect(0, y0, width, uiH);
    ctx.fillStyle = '#2a5a2a';
    ctx.fillRect(0, y0, width, 1);

    // Title
    ctx.fillStyle = '#4ade80';
    ctx.font = 'bold 12px "Orbitron", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('📐 ADD BEARING', 8, y0 + 6);

    // Input box
    const inputVal = Player.bearingInput;
    const display  = inputVal.length > 0 ? inputVal + '°' : '___°';

    ctx.fillStyle = '#0a2a0a';
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 1.5;
    ctx.fillRect(8, y0 + 24, width - 16, 28);
    ctx.strokeRect(8, y0 + 24, width - 16, 28);

    ctx.fillStyle = inputVal.length > 0 ? '#ffd700' : '#3a5a3a';
    ctx.font = 'bold 22px "Share Tech Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(display, width / 2, y0 + 38);

    // Bearing line legend
    const lines = Player.bearingLines;
    ctx.font = '10px "Share Tech Mono", monospace';
    ctx.textBaseline = 'top';
    const lineY = y0 + 58;

    ctx.fillStyle = '#3a5a3a';
    ctx.textAlign = 'left';
    ctx.fillText('Bearing lines: (click 🗑 to delete)', 8, lineY);

    let col = 0;
    for (const line of lines.slice(0, 6)) {
        const lx = 8 + col * (width / 3 - 2);
        const ly = lineY + 14;

        ctx.fillStyle = line.color;
        ctx.fillRect(lx, ly, 12, 12);
        ctx.fillStyle = '#aaa';
        ctx.fillText(`${Math.round(line.bearing)}°`, lx + 15, ly + 1);

        // Delete icon (clickable area stored in UI module)
        ctx.fillStyle = '#ff4444';
        ctx.fillText('✕', lx + 38, ly + 1);

        col++;
        if (col >= 3) { col = 0; }
    }

    // Controls hint
    ctx.fillStyle = '#3a5a3a';
    ctx.font = '9px "Share Tech Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('[0-9] type bearing  [Enter] confirm  [⌫] delete', width / 2, height - 2);
}

/**
 * Handle a bearing line delete click in map panel.
 * @param {MouseEvent} e  mouse event relative to map panel canvas
 * @param {number} canvasW
 * @param {number} canvasH
 */
function handleMapPanelClick(e, canvasW, canvasH) {
    const uiH  = 110;
    const y0   = canvasH - uiH;
    const lineY = y0 + 58 + 14;
    const lines = Player.bearingLines;

    for (let i = 0; i < Math.min(lines.length, 6); i++) {
        const col  = i % 3;
        const lx   = 8 + col * (canvasW / 3 - 2);
        const delX = lx + 38;
        const delY = lineY;

        const mx = e.offsetX, my = e.offsetY;
        if (mx >= delX && mx <= delX + 12 && my >= delY && my <= delY + 14) {
            Player.removeBearingLine(lines[i].id);
            return;
        }
    }
}
