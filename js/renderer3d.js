/**
 * renderer3d.js - First-person raycasting renderer
 * WLD FoxWave ARDF
 *
 * Algorithm: DDA (Digital Differential Analysis), same as Wolfenstein 3D.
 * One vertical strip per canvas column, camera-plane based (no fish-eye).
 *
 * Coordinate system
 *   Player.x / Player.y  : tile position (float, centre of tile = x+0.5)
 *   Player.viewAngle      : degrees, 0=North, 90=East, clockwise
 *   dirX = sin(viewAngle) : eastward component
 *   dirY = -cos(viewAngle): southward component (Y increases downward)
 *
 * Pipeline per frame:
 *   1. Sky gradient
 *   2. Floor gradient
 *   3. Wall strips   → fills zBuffer[]
 *   4. Sprites       → depth-tested against zBuffer[]
 *   5. Weapon/antenna overlay
 *   6. Vignette
 *   7. Status bar + minimap
 */

"use strict";

// ─── Per-frame Z-buffer (perpendicular wall distance per column) ──────────────
let _zBuf = new Float32Array(1);

// ─── Wall colour palette per tile type ───────────────────────────────────────
const WALL_BASE = {
    [TILE.TREE]:        { r:38,  g:108, b:28  },
    [TILE.DENSE_TREE]:  { r:18,  g:55,  b:12  },
    [TILE.BUILDING]:    { r:140, g:100, b:48  },
    [TILE.WATER]:       { r:30,  g:90,  b:180 },
    [TILE.FOUNTAIN]:    { r:40,  g:130, b:200 },
    [TILE.ZOO]:         { r:60,  g:120, b:30  },
    [TILE.PLAYGROUND]:  { r:180, g:100, b:20  },
};

const WALL_BASE_DEFAULT = { r:50, g:80, b:40 };

// Sky colours
const SKY_TOP = { r:28,  g:60,  b:100 };
const SKY_HOR = { r:130, g:170, b:200 };

// Floor colours
const FLR_NEAR = { r:58,  g:90,  b:40  };
const FLR_FAR  = { r:20,  g:35,  b:18  };

// Fog colour (blended at distance)
const FOG_COL  = { r:120, g:155, b:185 };

// ─── Main entry point (called by main.js game loop) ──────────────────────────

/**
 * Render the first-person raycasting view.
 * This function is a drop-in replacement for the 2D renderMainView().
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} W      canvas width
 * @param {number} H      canvas height
 * @param {number} timestamp  requestAnimationFrame timestamp
 * @param {string} gameState  current STATE value
 */
function renderMainView(ctx, W, H, timestamp, gameState) {
    // Grow Z-buffer if canvas was resized
    if (_zBuf.length !== W) _zBuf = new Float32Array(W);
    _zBuf.fill(RC.MAX_DIST + 1);

    const px = Player.x + 0.5;
    const py = Player.y + 0.5;

    // Pre-compute view direction and camera plane
    const vRad   = Player.viewAngle * Math.PI / 180;
    const dirX   = Math.sin(vRad);
    const dirY   = -Math.cos(vRad);
    // Camera plane perpendicular to dir, length = tan(FOV/2)
    const planeLen = Math.tan((RC.FOV / 2) * Math.PI / 180);
    const planeX   = Math.cos(vRad) * planeLen;
    const planeY   = Math.sin(vRad) * planeLen;

    // ── 1+2. Sky and floor ───────────────────────────────────────────────────
    _drawSkyAndFloor(ctx, W, H, timestamp);

    // ── 3. Walls ─────────────────────────────────────────────────────────────
    _drawWalls(ctx, W, H, px, py, dirX, dirY, planeX, planeY, timestamp);

    // ── 4. Sprites ───────────────────────────────────────────────────────────
    _drawSprites(ctx, W, H, px, py, dirX, dirY, planeX, planeY, timestamp);

    // ── 5. Weapon ────────────────────────────────────────────────────────────
    _drawWeapon(ctx, W, H, timestamp, gameState);

    // ── 6. Vignette ──────────────────────────────────────────────────────────
    _drawVignette(ctx, W, H);

    // ── 7. HUD ───────────────────────────────────────────────────────────────
    _drawStatusBar(ctx, W, gameState, timestamp);
    _drawMinimap(ctx, W, H, px, py);

    // Return-to-tent banner
    if (Player.allFoxesFound && gameState === STATE.HUNTING) {
        _drawReturnBanner(ctx, W, H, timestamp);
    }
}

// ─── Sky + Floor ─────────────────────────────────────────────────────────────

function _drawSkyAndFloor(ctx, W, H, timestamp) {
    const midY = H / 2;
    const t    = timestamp / 6000;

    // Sky gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, midY);
    skyGrad.addColorStop(0, `rgb(${SKY_TOP.r},${SKY_TOP.g},${SKY_TOP.b})`);
    skyGrad.addColorStop(1, `rgb(${SKY_HOR.r},${SKY_HOR.g},${SKY_HOR.b})`);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, midY);

    // Subtle cloud streaks
    ctx.save();
    ctx.globalAlpha = 0.07;
    for (let i = 0; i < 5; i++) {
        const cx = ((t * (0.4 + i * 0.15) + i * 0.22) % 1.4 - 0.2) * W;
        const cy = midY * (0.1 + i * 0.14);
        const cw = W * (0.18 + i * 0.07);
        const ch = midY * 0.05;
        const cg = ctx.createRadialGradient(cx + cw / 2, cy, 0, cx + cw / 2, cy, cw / 2);
        cg.addColorStop(0,   'rgba(255,255,255,1)');
        cg.addColorStop(1,   'rgba(255,255,255,0)');
        ctx.fillStyle = cg;
        ctx.fillRect(cx, cy - ch, cw, ch * 2);
    }
    ctx.restore();

    // Floor gradient
    const flrGrad = ctx.createLinearGradient(0, midY, 0, H);
    flrGrad.addColorStop(0,   `rgb(${FLR_NEAR.r},${FLR_NEAR.g},${FLR_NEAR.b})`);
    flrGrad.addColorStop(1,   `rgb(${FLR_FAR.r},${FLR_FAR.g},${FLR_FAR.b})`);
    ctx.fillStyle = flrGrad;
    ctx.fillRect(0, midY, W, H - midY);
}

// ─── Wall strips ─────────────────────────────────────────────────────────────

function _drawWalls(ctx, W, H, px, py, dirX, dirY, planeX, planeY, timestamp) {
    for (let x = 0; x < W; x++) {
        // Camera-plane x: maps column to [-1, 1]
        const camX = 2 * x / W - 1;
        const rayDX = dirX + planeX * camX;
        const rayDY = dirY + planeY * camX;

        // DDA setup
        let mapX = Math.floor(px);
        let mapY = Math.floor(py);

        const ddX = Math.abs(rayDX) < 1e-10 ? 1e30 : Math.abs(1 / rayDX);
        const ddY = Math.abs(rayDY) < 1e-10 ? 1e30 : Math.abs(1 / rayDY);

        let stepX, sdX, stepY, sdY;
        if (rayDX < 0) { stepX = -1; sdX = (px - mapX) * ddX; }
        else           { stepX =  1; sdX = (mapX + 1 - px) * ddX; }
        if (rayDY < 0) { stepY = -1; sdY = (py - mapY) * ddY; }
        else           { stepY =  1; sdY = (mapY + 1 - py) * ddY; }

        // DDA march
        let hit = false, side = 0, steps = 0;
        while (!hit && steps++ < RC.MAX_DIST * 2) {
            if (sdX < sdY) { sdX += ddX; mapX += stepX; side = 0; }
            else           { sdY += ddY; mapY += stepY; side = 1; }
            if (isSolid3D(mapX, mapY)) hit = true;
        }
        if (!hit) continue;

        // Perpendicular wall distance (no fish-eye)
        const perpDist = side === 0
            ? (mapX - px + (1 - stepX) / 2) / rayDX
            : (mapY - py + (1 - stepY) / 2) / rayDY;

        if (perpDist <= 0) continue;
        _zBuf[x] = perpDist;

        // Wall height on screen
        const wallH     = Math.min(H * 3, Math.floor(H / perpDist));
        const wallTop   = Math.max(0, Math.floor(H / 2 - wallH / 2));
        const wallBot   = Math.min(H, Math.floor(H / 2 + wallH / 2));
        const wallDraw  = wallBot - wallTop;

        // Exact hit position on tile face (for texture variation)
        let wallHitFrac;
        if (side === 0) wallHitFrac = py + perpDist * rayDY;
        else            wallHitFrac = px + perpDist * rayDX;
        wallHitFrac -= Math.floor(wallHitFrac);

        // Wall colour
        const tile  = getTile(mapX, mapY);
        const base  = WALL_BASE[tile] || WALL_BASE_DEFAULT;

        // Side shading: Y-side walls 30% darker
        const shade = side === 1 ? 0.68 : 1.0;

        // Texture: subtle brightness variation based on hit fraction
        const tex   = 0.82 + 0.18 * Math.sin(wallHitFrac * Math.PI * 6);

        // Distance fog
        const fogT  = Math.min(1, Math.max(0,
                        (perpDist - RC.FOG_START) / (RC.FOG_END - RC.FOG_START)));
        const fr    = _fogBlend(base.r * shade * tex, FOG_COL.r, fogT);
        const fg    = _fogBlend(base.g * shade * tex, FOG_COL.g, fogT);
        const fb    = _fogBlend(base.b * shade * tex, FOG_COL.b, fogT);

        // Top-to-bottom brightness gradient on tall walls
        ctx.fillStyle = `rgb(${Math.round(fr)},${Math.round(fg)},${Math.round(fb)})`;
        ctx.fillRect(x, wallTop, 1, wallDraw);

        // Darker base strip for grounding
        if (wallDraw > 4) {
            const darkR = Math.round(fr * 0.55);
            const darkG = Math.round(fg * 0.55);
            const darkB = Math.round(fb * 0.55);
            ctx.fillStyle = `rgb(${darkR},${darkG},${darkB})`;
            ctx.fillRect(x, wallBot - Math.max(2, Math.floor(wallDraw * 0.12)), 1, Math.max(2, Math.floor(wallDraw * 0.12)));
        }

        // Cap highlight at very top of wall
        if (wallDraw > 6 && perpDist < 8) {
            const hiR = Math.min(255, Math.round(fr * 1.3));
            const hiG = Math.min(255, Math.round(fg * 1.3));
            const hiB = Math.min(255, Math.round(fb * 1.3));
            ctx.fillStyle = `rgb(${hiR},${hiG},${hiB})`;
            ctx.fillRect(x, wallTop, 1, Math.max(1, Math.floor(wallDraw * 0.06)));
        }
    }
}

// ─── Sprites ─────────────────────────────────────────────────────────────────

/**
 * Sprite definition list — built each frame.
 * Each entry: { x, y, type, data }
 *
 * Types: 'fox_unfound', 'fox_found', 'tent', 'fountain', 'train'
 */
function _buildSpriteList(timestamp) {
    const sprites = [];

    // Fox beacons
    for (const b of getBeacons()) {
        sprites.push({
            wx: b.x + 0.5, wy: b.y + 0.5,
            type: b.found ? 'fox_found' : 'fox_unfound',
            data: b,
        });
    }

    // WLD Tent (landmark near start)
    sprites.push({ wx: 6.5, wy: 56.5, type: 'tent',     data: null });
    // Fountain
    sprites.push({ wx: 49.5, wy: 22.5, type: 'fountain', data: null });

    return sprites;
}

function _drawSprites(ctx, W, H, px, py, dirX, dirY, planeX, planeY, timestamp) {
    const sprites = _buildSpriteList(timestamp);

    // Sort back-to-front (painter's algorithm)
    sprites.sort((a, b) =>
        (Math.hypot(b.wx - px, b.wy - py)) - (Math.hypot(a.wx - px, a.wy - py))
    );

    const invDet = 1 / (planeX * dirY - dirX * planeY);

    for (const sp of sprites) {
        const relX = sp.wx - px;
        const relY = sp.wy - py;

        // Transform sprite to camera space
        const transX = invDet * (dirY * relX - dirX * relY);
        const transY = invDet * (-planeY * relX + planeX * relY);

        if (transY <= 0.15) continue; // behind or too close

        const dist = Math.hypot(relX, relY);
        if (dist > RC.MAX_DIST) continue;

        // Fog factor
        const fogT = Math.min(1, Math.max(0,
                      (dist - RC.FOG_START) / (RC.FOG_END - RC.FOG_START)));
        if (fogT >= 0.98) continue;

        // Screen X
        const screenX = Math.floor(W / 2 * (1 + transX / transY));

        // Sprite height/width on screen
        const sprH   = Math.abs(Math.floor(H / transY));
        const sprW   = sprH;

        const drawY0 = Math.max(0, Math.floor(H / 2 - sprH / 2));
        const drawY1 = Math.min(H, Math.floor(H / 2 + sprH / 2));
        const drawX0 = Math.max(0, screenX - sprW / 2);
        const drawX1 = Math.min(W, screenX + sprW / 2);

        if (drawX1 <= drawX0) continue;

        _renderSpriteStrips(ctx, sp, drawX0, drawX1, drawY0, drawY1, sprW, sprH,
                             transY, W, H, fogT, timestamp);
    }
}

function _renderSpriteStrips(ctx, sp, x0, x1, y0, y1, sprW, sprH, depth, W, H, fogT, ts) {
    // Draw column by column, checking Z-buffer
    for (let sx = x0; sx < x1; sx++) {
        const col = sx - (sx - sprW / 2 + W / 2 - sprW / 2) % sprW | 0;
        if (sx < 0 || sx >= W) continue;
        if (_zBuf[sx] < depth) continue; // occluded by wall

        const alpha = 1 - fogT;
        ctx.save();
        ctx.globalAlpha = alpha;
        _drawSpriteColumn(ctx, sp, sx, y0, y1, sprH, depth, ts);
        ctx.restore();
    }
}

function _drawSpriteColumn(ctx, sp, x, y0, y1, sprH, depth, ts) {
    const h = y1 - y0;
    if (h <= 0) return;

    switch (sp.type) {

        case 'fox_unfound': {
            // Radio mast: vertical line with horizontal bars (Yagi)
            const b = sp.data;
            const pulse = 0.5 + 0.5 * Math.sin(ts / 400);
            ctx.strokeStyle = `rgba(255,215,0,${0.7 + pulse * 0.3})`;
            ctx.lineWidth = Math.max(1, 3 / depth);
            ctx.beginPath();
            ctx.moveTo(x, y0 + h * 0.05);
            ctx.lineTo(x, y1 - h * 0.05);
            ctx.stroke();
            // Horizontal elements (Yagi directors)
            const armW = Math.max(2, Math.floor(h * 0.18 / depth));
            for (let i = 0; i < 4; i++) {
                const ay = y0 + h * (0.15 + i * 0.22);
                ctx.beginPath();
                ctx.moveTo(x - armW, ay);
                ctx.lineTo(x + armW, ay);
                ctx.stroke();
            }
            // Fox code label (only when close)
            if (depth < 6) {
                ctx.fillStyle = `rgba(${_hexToRgb(b.color)},${0.9})`;
                ctx.font = `bold ${Math.max(8, Math.floor(12 / depth))}px "Orbitron", monospace`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.fillText(b.code, x, y0 - 2);
            }
            break;
        }

        case 'fox_found': {
            const b = sp.data;
            // Flag post
            ctx.strokeStyle = 'rgba(200,200,200,0.9)';
            ctx.lineWidth = Math.max(1, 2 / depth);
            ctx.beginPath();
            ctx.moveTo(x, y0 + h * 0.1);
            ctx.lineTo(x, y1);
            ctx.stroke();
            // Flag (triangle shape projected as horizontal stroke)
            const flagH = Math.floor(h * 0.25);
            const grad = ctx.createLinearGradient(x, y0 + h * 0.1, x, y0 + h * 0.35);
            grad.addColorStop(0, b.color);
            grad.addColorStop(1, b.color + '66');
            ctx.fillStyle = grad;
            ctx.fillRect(x, y0 + h * 0.1, Math.max(2, 8 / depth), flagH);
            break;
        }

        case 'tent': {
            // Blue rectangle (tent facade)
            const tGrad = ctx.createLinearGradient(x, y0, x, y1);
            tGrad.addColorStop(0, 'rgba(180,60,60,0.85)');
            tGrad.addColorStop(0.3, 'rgba(30,80,160,0.85)');
            tGrad.addColorStop(1,   'rgba(15,45,100,0.85)');
            ctx.fillStyle = tGrad;
            ctx.fillRect(x, y0, 1, h);
            // Golden "WLD" tint strip
            if (depth < 10) {
                ctx.fillStyle = 'rgba(255,215,0,0.15)';
                ctx.fillRect(x, y0 + h * 0.35, 1, h * 0.25);
            }
            break;
        }

        case 'fountain': {
            const wGrad = ctx.createLinearGradient(x, y0, x, y1);
            wGrad.addColorStop(0,   'rgba(150,220,255,0.7)');
            wGrad.addColorStop(0.5, 'rgba(40,120,200,0.7)');
            wGrad.addColorStop(1,   'rgba(20,70,140,0.7)');
            ctx.fillStyle = wGrad;
            ctx.fillRect(x, y0, 1, h);
            break;
        }
    }
}

// ─── Weapon (antenna) overlay ─────────────────────────────────────────────────

function _drawWeapon(ctx, W, H, timestamp, gameState) {
    const t       = timestamp / 800;
    const bob     = gameState === STATE.HUNTING
                  ? Math.sin(t * 2) * 4 + Math.sin(t * 1.3) * 2
                  : 0;

    const cx      = W * 0.72;
    const baseY   = H * 0.98 + bob;
    const scale   = H / 600;

    ctx.save();
    ctx.translate(cx, baseY);

    if (gameState === STATE.RECEIVER) {
        // Receiver + directional Yagi — rotated to bearing relative to viewAngle
        const relBearing = ((Player.receiverBearing - Player.viewAngle) % 360 + 360) % 360;
        // Map bearing offset to screen tilt: 0°=centre, 90°=right, -90°=left
        let tiltDeg = relBearing > 180 ? relBearing - 360 : relBearing;
        tiltDeg = Math.max(-50, Math.min(50, tiltDeg * 0.6));
        ctx.rotate(tiltDeg * Math.PI / 180);
        _drawYagiAntenna(ctx, scale, true, timestamp);
    } else {
        // Standard hunting mode: antenna pointing forward (straight up)
        _drawYagiAntenna(ctx, scale, false, timestamp);
    }

    ctx.restore();
}

function _drawYagiAntenna(ctx, scale, receiverMode, timestamp) {
    const S   = scale * 55;
    const pul = receiverMode ? (0.5 + 0.5 * Math.sin(timestamp / 350)) : 0;

    // Boom (main element - horizontal)
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth   = 3 * scale;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(-S * 1.4, 0);
    ctx.lineTo( S * 1.4, 0);
    ctx.stroke();

    // Directors (shorter, in front)
    const directors = [-S * 0.9, -S * 0.3, S * 0.3, S * 0.9];
    directors.forEach((bx, i) => {
        const len = S * (0.75 - i * 0.05);
        ctx.strokeStyle = i < 2 ? '#aaaaaa' : '#888888';
        ctx.lineWidth   = 2 * scale;
        ctx.beginPath();
        ctx.moveTo(bx, -len);
        ctx.lineTo(bx,  len);
        ctx.stroke();
    });

    // Reflector (behind, longest)
    ctx.strokeStyle = '#666666';
    ctx.lineWidth   = 2.5 * scale;
    ctx.beginPath();
    ctx.moveTo(S * 1.2, -S * 0.95);
    ctx.lineTo(S * 1.2,  S * 0.95);
    ctx.stroke();

    // Handle / grip
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(-S * 0.18, 0, S * 0.36, S * 1.8);
    ctx.fillStyle = '#444';
    ctx.fillRect(-S * 0.12, S * 0.2, S * 0.24, S * 1.2);

    // Receiver box
    if (receiverMode) {
        ctx.fillStyle = `rgba(20,40,20,0.9)`;
        ctx.fillRect(-S * 0.4, S * 0.6, S * 0.8, S * 0.55);
        // LED indicator
        ctx.fillStyle = `rgba(0,${Math.round(200 + pul * 55)},0,${0.8 + pul * 0.2})`;
        ctx.beginPath();
        ctx.arc(S * 0.2, S * 0.87, S * 0.08, 0, Math.PI * 2);
        ctx.fill();
        // Signal glow
        if (pul > 0.4) {
            ctx.shadowColor  = '#00ff44';
            ctx.shadowBlur   = 8 * pul;
            ctx.beginPath();
            ctx.arc(S * 0.2, S * 0.87, S * 0.08, 0, Math.PI * 2);
            ctx.fillStyle = '#00ff44';
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    }
}

// ─── Minimap ──────────────────────────────────────────────────────────────────

function _drawMinimap(ctx, W, H, px, py) {
    const SIZE  = Math.min(W, H) * 0.22;
    const TS    = 3;   // tile size on minimap
    const TILES = Math.floor(SIZE / TS);
    const half  = Math.floor(TILES / 2);

    const mx = W - SIZE - 10;
    const my = H - SIZE - 54;

    // Background
    ctx.fillStyle = 'rgba(2,8,2,0.82)';
    ctx.fillRect(mx, my, SIZE, SIZE);
    ctx.strokeStyle = '#1a4a1a';
    ctx.lineWidth = 1;
    ctx.strokeRect(mx, my, SIZE, SIZE);

    // Tiles
    for (let dy = -half; dy <= half; dy++) {
        for (let dx = -half; dx <= half; dx++) {
            const tx = Math.floor(px) + dx;
            const ty = Math.floor(py) + dy;
            const tile = getTile(tx, ty);
            let col;
            if      (SOLID_3D.has(tile))               col = '#1a3a10';
            else if (tile === TILE.WATER)               col = '#1a3a6a';
            else if (tile === TILE.PATH || tile === TILE.TRAIN) col = '#8a6a38';
            else if (tile === TILE.START)               col = '#a08000';
            else                                         col = '#2a4a20';

            const sx = mx + (dx + half) * TS;
            const sy = my + (dy + half) * TS;
            ctx.fillStyle = col;
            ctx.fillRect(sx, sy, TS - 1, TS - 1);
        }
    }

    // Bearing lines on minimap
    for (const line of Player.bearingLines) {
        const lx0 = mx + (line.fromX - Math.floor(px) + half) * TS;
        const ly0 = my + (line.fromY - Math.floor(py) + half) * TS;
        const rad  = (line.bearing - 90) * Math.PI / 180;
        ctx.strokeStyle = line.color;
        ctx.lineWidth   = 1;
        ctx.setLineDash([3,2]);
        ctx.beginPath();
        ctx.moveTo(lx0, ly0);
        ctx.lineTo(lx0 + Math.cos(rad) * SIZE, ly0 + Math.sin(rad) * SIZE);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // Fox beacon dots
    for (const b of getBeacons()) {
        const bx = mx + (b.x - Math.floor(px) + half) * TS + TS / 2;
        const by = my + (b.y - Math.floor(py) + half) * TS + TS / 2;
        if (bx < mx || bx > mx + SIZE || by < my || by > my + SIZE) continue;
        ctx.fillStyle = b.found ? b.color : 'rgba(255,215,0,0.5)';
        ctx.beginPath();
        ctx.arc(bx, by, b.found ? 3 : 2, 0, Math.PI * 2);
        ctx.fill();
    }

    // Player dot + view direction
    const pcx = mx + half * TS + TS / 2;
    const pcy = my + half * TS + TS / 2;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(pcx, pcy, 3, 0, Math.PI * 2); ctx.fill();

    // View cone
    const vrad  = Player.viewAngle * Math.PI / 180;
    const fovR  = (RC.FOV / 2) * Math.PI / 180;
    const coneL = SIZE * 0.35;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.moveTo(pcx, pcy);
    ctx.arc(pcx, pcy, coneL, vrad - fovR - Math.PI / 2, vrad + fovR - Math.PI / 2);
    ctx.closePath();
    ctx.fill();

    // Direction arrow
    ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pcx, pcy);
    ctx.lineTo(pcx + Math.sin(vrad) * 8, pcy - Math.cos(vrad) * 8);
    ctx.stroke();

    // Label
    ctx.fillStyle = '#4ade80';
    ctx.font = '8px "Share Tech Mono", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('KAART', mx + SIZE / 2, my + SIZE + 1);
    ctx.textBaseline = 'alphabetic';
}

// ─── HUD elements ─────────────────────────────────────────────────────────────

function _drawVignette(ctx, W, H) {
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.85);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
}

function _drawStatusBar(ctx, W, gameState, timestamp) {
    const barH = 46;
    ctx.fillStyle = 'rgba(2,8,2,0.85)';
    ctx.fillRect(0, 0, W, barH);
    ctx.fillStyle = '#1a4a1a';
    ctx.fillRect(0, barH, W, 2);

    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 14px "Orbitron", monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('🦊 WLD FoxWave ARDF', 12, barH / 2);

    ctx.fillStyle = '#4ade80';
    ctx.font = 'bold 20px "Share Tech Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('⏱ ' + Player.getElapsedString(), W / 2, barH / 2);

    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 14px "Orbitron", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`🦊 ${Player.foundFoxes.size}/${CONFIG.FOX_COUNT}`, W - 12, barH / 2);

    // Mode + bearing
    const modeMap = {
        [STATE.HUNTING]:  { t: '⚡ HUNTING', c: '#4ade80' },
        [STATE.RECEIVER]: { t: `📡 RECEIVER  ${Math.round(Player.receiverBearing).toString().padStart(3,'0')}°`, c: '#ffd700' },
        [STATE.MAP_VIEW]: { t: '🗺  MAP',    c: '#44aaff' },
        [STATE.BRIEFING]: { t: '🏕  READY',  c: '#888' },
        [STATE.FINISHED]: { t: '🏁 RETURN!', c: '#ff8800' },
    };
    const m = modeMap[gameState];
    if (m) {
        ctx.fillStyle = m.c;
        ctx.font = '11px "Share Tech Mono", monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(m.t, W / 2, barH + 3);
    }

    // Crosshair
    _drawCrosshair(ctx, W, barH);

    ctx.textBaseline = 'alphabetic';
}

function _drawCrosshair(ctx, W, statusH) {
    const cx  = W / 2;
    const cy  = (window.innerHeight - statusH) / 2 + statusH;
    const len = 10;
    const gap = 4;

    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth   = 1.5;
    ctx.lineCap     = 'round';

    // Horizontal
    ctx.beginPath();
    ctx.moveTo(cx - gap - len, cy); ctx.lineTo(cx - gap, cy); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + gap, cy);       ctx.lineTo(cx + gap + len, cy); ctx.stroke();
    // Vertical
    ctx.beginPath();
    ctx.moveTo(cx, cy - gap - len); ctx.lineTo(cx, cy - gap); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy + gap);       ctx.lineTo(cx, cy + gap + len); ctx.stroke();
    // Centre dot
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.arc(cx, cy, 1.5, 0, Math.PI * 2); ctx.fill();
}

function _drawReturnBanner(ctx, W, H, timestamp) {
    const pulse = 0.7 + 0.3 * Math.sin(timestamp / 380);
    ctx.fillStyle = `rgba(2,8,2,${0.9 * pulse})`;
    ctx.fillRect(W * 0.12, H - 74, W * 0.76, 52);
    ctx.strokeStyle = `rgba(255,140,0,${pulse})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(W * 0.12, H - 74, W * 0.76, 52);
    ctx.fillStyle = `rgba(255,160,0,${pulse})`;
    ctx.font = 'bold 17px "Orbitron", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🏁  Alle vossen gevonden!  Keer terug naar het WLD-tent!', W / 2, H - 48);
    ctx.textBaseline = 'alphabetic';
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Linear blend between two colour values with fog factor.
 * @param {number} wallVal  original wall colour channel
 * @param {number} fogVal   fog colour channel
 * @param {number} t        0=no fog, 1=full fog
 * @returns {number}
 */
function _fogBlend(wallVal, fogVal, t) {
    return Math.round(wallVal * (1 - t) + fogVal * t);
}

/**
 * Convert CSS hex colour to comma-separated RGB string for rgba().
 * Falls back gracefully if input is not a hex colour.
 * @param {string} hex  e.g. '#ff4444'
 * @returns {string}    e.g. '255,68,68'
 */
function _hexToRgb(hex) {
    const m = (hex || '#ffffff').match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (!m) return '255,255,255';
    return `${parseInt(m[1],16)},${parseInt(m[2],16)},${parseInt(m[3],16)}`;
}

// ─── Asset loader (kept for API compatibility with main.js) ──────────────────

function loadRendererAssets(callback) {
    // 3D renderer does not need pre-loaded images for walls (procedural)
    // Fox image still used for certificate — loaded there
    if (callback) callback();
}
