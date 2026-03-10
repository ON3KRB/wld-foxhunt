/**
 * ui.js - UI state management, panels, overlays and controls display
 * WLD FoxWave ARDF
 *
 * Manages the right-bottom info panel (controls + found foxes),
 * modal overlays (splash, registration, briefing, found-fox flash),
 * and helper rendering routines.
 */

"use strict";

// ─── Info panel (right-bottom canvas) ────────────────────────────────────────

/**
 * Draw the info / controls panel in the bottom-right canvas.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 * @param {string} gameState
 */
function drawInfoPanel(ctx, width, height, gameState) {
    ctx.fillStyle = '#050f05';
    ctx.fillRect(0, 0, width, height);

    // Border top
    ctx.fillStyle = '#1a4a1a';
    ctx.fillRect(0, 0, width, 2);

    // ── Found foxes strip ─────────────────────────────────────────────────────
    _drawFoundFoxes(ctx, width, height);

    // ── Controls reference ────────────────────────────────────────────────────
    _drawControls(ctx, width, height, gameState);
}

function _drawFoundFoxes(ctx, width, height) {
    const found  = getFoundBeacons();
    const all    = getBeacons();
    const stripH = Math.min(height * 0.45, 120);

    ctx.fillStyle = '#0a1a0a';
    ctx.fillRect(0, 0, width, stripH);

    ctx.fillStyle = '#ffd700';
    ctx.font      = 'bold 12px "Orbitron", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('🦊 VOSSEN GEVONDEN', 8, 6);

    const slotW  = (width - 16) / CONFIG.FOX_COUNT;

    for (let i = 0; i < CONFIG.FOX_COUNT; i++) {
        const code    = CONFIG.FOX_CODES[i];
        const color   = CONFIG.FOX_COLORS[i];
        const isFound = Player.foundFoxes.has(code);
        const sx      = 8 + i * slotW;
        const sy      = 26;

        // Slot background
        ctx.fillStyle = isFound ? `${color}33` : '#0d1a0d';
        ctx.fillRect(sx, sy, slotW - 2, stripH - 32);
        ctx.strokeStyle = isFound ? color : '#2a3a2a';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(sx, sy, slotW - 2, stripH - 32);

        if (isFound) {
            // Fox icon (small)
            ctx.font = `${Math.min(22, slotW * 0.7)}px serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('🦊', sx + slotW / 2 - 1, sy + (stripH - 32) * 0.35);

            ctx.fillStyle = color;
            ctx.font = `bold ${Math.min(10, slotW * 0.35)}px "Orbitron", monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(code, sx + slotW / 2 - 1, sy + (stripH - 32) - 2);
        } else {
            ctx.fillStyle = '#2a4a2a';
            ctx.font = '16px serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('❓', sx + slotW / 2 - 1, sy + (stripH - 32) * 0.4);
        }
    }

    ctx.textBaseline = 'alphabetic';
}

function _drawControls(ctx, width, height, gameState) {
    const y0 = Math.min(height * 0.45, 120) + 4;
    const lineH = 17;

    ctx.fillStyle = '#0d200d';
    ctx.fillRect(0, y0, width, height - y0);

    ctx.fillStyle = '#4ade80';
    ctx.font      = 'bold 11px "Orbitron", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('⌨  CONTROLS', 8, y0 + 4);

    const controls = _getControlsForState(gameState);
    ctx.font = '11px "Share Tech Mono", monospace';

    let y = y0 + 20;
    for (const ctrl of controls) {
        if (y + lineH > height - 4) break;

        // Key badge
        ctx.fillStyle = '#1a3a1a';
        ctx.fillRect(8, y, 36, 13);
        ctx.strokeStyle = '#2a6a2a';
        ctx.lineWidth = 1;
        ctx.strokeRect(8, y, 36, 13);
        ctx.fillStyle = '#ffd700';
        ctx.textAlign = 'center';
        ctx.fillText(ctrl.key, 26, y + 2);

        // Description
        ctx.fillStyle = '#7aaa7a';
        ctx.textAlign = 'left';
        ctx.fillText(ctrl.desc, 50, y + 2);

        y += lineH;
    }

    ctx.textBaseline = 'alphabetic';
}

function _getControlsForState(state) {
    const arrow = '↑↓←→';
    switch (state) {
        case STATE.BRIEFING:
            return [
                { key: 'H',    desc: 'Start Hunting' },
                { key: 'M',    desc: 'Toon Kaart' },
                { key: 'R',    desc: 'Receiver aan' },
            ];
        case STATE.HUNTING:
            return [
                { key: arrow,  desc: 'Verplaatsen' },
                { key: 'R',    desc: 'Receiver aan' },
                { key: 'M',    desc: 'Kaart tonen' },
            ];
        case STATE.RECEIVER:
            return [
                { key: '←→',   desc: 'Receiver draaien' },
                { key: 'R',    desc: 'Receiver uit' },
                { key: 'M',    desc: 'Kaart tonen' },
            ];
        case STATE.MAP_VIEW:
            return [
                { key: '0-9',  desc: 'Peiling invoeren' },
                { key: '↵',    desc: 'Lijn tekenen' },
                { key: '⌫',    desc: 'Wis laatste' },
                { key: 'M/H',  desc: 'Terug' },
            ];
        default:
            return [];
    }
}

// ─── Overlay screens ─────────────────────────────────────────────────────────

/** Show the splash screen overlay div. */
function showSplash() {
    document.getElementById('overlay-splash').classList.remove('hidden');
}
function hideSplash() {
    document.getElementById('overlay-splash').classList.add('hidden');
}

/** Show registration form. */
function showRegistration() {
    document.getElementById('overlay-registration').classList.remove('hidden');
}
function hideRegistration() {
    document.getElementById('overlay-registration').classList.add('hidden');
}

/** Show briefing overlay. */
function showBriefing() {
    document.getElementById('overlay-briefing').classList.remove('hidden');
}
function hideBriefing() {
    document.getElementById('overlay-briefing').classList.add('hidden');
}

/** Show a "Fox Found!" flash (auto-hides after 2.5s). */
function showFoxFoundFlash(beacon) {
    const el = document.getElementById('fox-found-flash');
    const display = getFoxDisplayMorse(beacon.code);
    el.innerHTML = `
        <div class="fox-found-inner">
            <div class="fox-found-icon">🦊</div>
            <div class="fox-found-code" style="color:${beacon.color}">${beacon.code}</div>
            <div class="fox-found-morse">${display}</div>
            <div class="fox-found-msg">VOSJE GEVONDEN!</div>
        </div>
    `;
    el.classList.remove('hidden');
    el.classList.add('show');
    setTimeout(() => {
        el.classList.remove('show');
        el.classList.add('hidden');
    }, 2500);
}

/** Show the finished / return-to-start overlay. */
function showFinishedOverlay() {
    document.getElementById('overlay-finished').classList.remove('hidden');
}
function hideFinishedOverlay() {
    document.getElementById('overlay-finished').classList.add('hidden');
}

/** Update the timer display in the briefing overlay if it is open. */
function updateOverlayTimer() {
    const el = document.getElementById('briefing-timer');
    if (el) el.textContent = Player.getElapsedString();
}
