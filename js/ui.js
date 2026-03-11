/**
 * ui.js - Info panel (right-bottom canvas) + overlay helpers
 * WLD FoxWave ARDF
 *
 * Right-bottom panel layout (top → bottom):
 *   ① Found-fox strip  — 5 fox slots, highlight when found
 *   ② Mode banner      — active mode shown with colour
 *   ③ Controls table   — all keybindings, active section highlighted
 *   ④ Morse legend     — ARDF codes with dot/dash symbols
 */

"use strict";

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Draw the entire right-bottom info / controls panel.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 * @param {string} gameState
 */
function drawInfoPanel(ctx, width, height, gameState) {
    ctx.fillStyle = '#050f05';
    ctx.fillRect(0, 0, width, height);

    const foxH = _drawFoundFoxes(ctx, width, height);
    _drawModeBanner(ctx, width, foxH, gameState);
    _drawControlsTable(ctx, width, height, foxH + 20, gameState);
    _drawMorseLegend(ctx, width, height);
}

// ─── ① Found-fox strip ───────────────────────────────────────────────────────

/**
 * Draw 5 fox slots across the top.
 * @returns {number} height consumed (px)
 */
function _drawFoundFoxes(ctx, width, height) {
    const stripH = Math.min(Math.floor(height * 0.30), 90);
    const slotW  = Math.floor((width - 12) / CONFIG.FOX_COUNT);

    // Background
    ctx.fillStyle = '#080f08';
    ctx.fillRect(0, 0, width, stripH);
    ctx.fillStyle = '#1a3a1a';
    ctx.fillRect(0, stripH - 1, width, 1);

    // Title
    ctx.fillStyle    = '#ffd700';
    ctx.font         = `bold ${Math.min(11, Math.floor(stripH * 0.14))}px "Orbitron", monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('🦊  VOSSEN GEVONDEN', width / 2, 5);

    const topPad = Math.floor(stripH * 0.22);

    for (let i = 0; i < CONFIG.FOX_COUNT; i++) {
        const code    = CONFIG.FOX_CODES[i];
        const color   = CONFIG.FOX_COLORS[i];
        const isFound = Player.foundFoxes.has(code);
        const sx      = 6 + i * slotW;
        const sy      = topPad;
        const sw      = slotW - 3;
        const sh      = stripH - topPad - 6;

        // Slot box
        ctx.fillStyle   = isFound ? color + '28' : '#0a120a';
        ctx.strokeStyle = isFound ? color : '#1e3a1e';
        ctx.lineWidth   = isFound ? 1.5 : 0.8;
        ctx.fillRect(sx, sy, sw, sh);
        ctx.strokeRect(sx, sy, sw, sh);

        const cx = sx + sw / 2;
        const cy = sy + sh / 2;
        const fs = Math.min(18, sw * 0.55);

        if (isFound) {
            // Fox emoji
            ctx.font         = `${fs}px serif`;
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('🦊', cx, cy - sh * 0.12);
            // Code label
            ctx.fillStyle    = color;
            ctx.font         = `bold ${Math.min(9, sw * 0.28)}px "Orbitron", monospace`;
            ctx.textBaseline = 'bottom';
            ctx.fillText(code, cx, sy + sh - 3);
        } else {
            // Question mark placeholder
            ctx.fillStyle    = '#263a26';
            ctx.font         = `${fs * 0.8}px serif`;
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('?', cx, cy);
            // Number
            ctx.fillStyle = '#2a4a2a';
            ctx.font      = `bold ${Math.min(8, sw * 0.25)}px "Orbitron", monospace`;
            ctx.textBaseline = 'bottom';
            ctx.fillText(`#${i + 1}`, cx, sy + sh - 2);
        }
    }

    ctx.textBaseline = 'alphabetic';
    return stripH;
}

// ─── ② Mode banner ───────────────────────────────────────────────────────────

function _drawModeBanner(ctx, width, y, gameState) {
    const bannerH = 20;
    const modeMap = {
        [STATE.BRIEFING]:  { bg: '#0d1a0d', label: '🏕  KLAAR OM TE STARTEN',  col: '#888888' },
        [STATE.HUNTING]:   { bg: '#0a1f0a', label: '🦶  WANDELMODUS ACTIEF',    col: '#4ade80' },
        [STATE.RECEIVER]:  { bg: '#1f1f04', label: '📡  RECEIVER ACTIEF',       col: '#ffd700' },
        [STATE.MAP_VIEW]:  { bg: '#04101f', label: '🗺   KAARTMODUS ACTIEF',     col: '#44aaff' },
        [STATE.FINISHED]:  { bg: '#1f0f04', label: '🏁  TERUG NAAR WLD-TENT!', col: '#ff8844' },
        [STATE.CERTIFICATE]: { bg: '#1f1a04', label: '🏆  GEFELICITEERD!',       col: '#ffd700' },
    };
    const m = modeMap[gameState] || { bg: '#0a1a0a', label: '', col: '#444' };

    ctx.fillStyle    = m.bg;
    ctx.fillRect(0, y, width, bannerH);
    ctx.fillStyle    = m.col;
    ctx.font         = `bold 10px "Orbitron", monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(m.label, width / 2, y + bannerH / 2);

    // Bottom border
    ctx.fillStyle = '#1a3a1a';
    ctx.fillRect(0, y + bannerH, width, 1);

    ctx.textBaseline = 'alphabetic';
}

// ─── ③ Controls table ─────────────────────────────────────────────────────────

/**
 * Full keybinding reference — all modes, always visible.
 * Active section for current gameState is highlighted.
 */
function _drawControlsTable(ctx, width, height, startY, gameState) {
    // Reserve bottom for morse legend
    const legendH   = 18;
    const availH    = height - startY - legendH - 4;

    // All controls, grouped by section
    const sections = [
        {
            id: STATE.HUNTING,
            icon: '🦶', title: 'WANDELEN',
            rows: [
                { key: '↑',    desc: 'Stap naar Noord (pad)'    },
                { key: '↓',    desc: 'Stap naar Zuid (pad)'     },
                { key: '←',    desc: 'Stap naar West (pad)'     },
                { key: '→',    desc: 'Stap naar Oost (pad)'     },
            ],
        },
        {
            id: STATE.RECEIVER,
            icon: '📡', title: 'RECEIVER / KOMPAS',
            rows: [
                { key: 'R',    desc: 'Receiver AAN / UIT'        },
                { key: '← →', desc: 'Antenne draaien (5° stap)' },
                { key: '— —', desc: 'Sterker = betere richting'  },
            ],
        },
        {
            id: STATE.MAP_VIEW,
            icon: '🗺', title: 'KAART & PEILINGEN',
            rows: [
                { key: 'M',    desc: 'Kaart tonen / sluiten'     },
                { key: '0–9', desc: 'Peiling typen (bijv. 045)'  },
                { key: '↵',   desc: 'Peillijn tekenen op kaart'  },
                { key: '⌫',   desc: 'Laatste cijfer wissen'      },
                { key: '✕',   desc: 'Klik op ✕ = lijn wissen'   },
            ],
        },
        {
            id: 'general',
            icon: '⚙', title: 'ALGEMEEN',
            rows: [
                { key: 'H',    desc: 'Hunting starten/hervatten'  },
                { key: '— —', desc: 'Vind alle 5 vossen!'         },
                { key: '— —', desc: 'Keer terug naar WLD-tent'    },
            ],
        },
    ];

    // Dynamically size rows to fit available height
    const totalRows = sections.reduce((s, sec) => s + 1 + sec.rows.length, 0);
    const rowH      = Math.max(10, Math.min(15, Math.floor(availH / totalRows)));
    const secH      = rowH + 1;
    const fs        = Math.max(7, Math.min(10, rowH - 2));
    const keyW      = Math.min(30, Math.floor(width * 0.24));
    const pad       = 6;

    let cy = startY + 3;

    for (const sec of sections) {
        if (cy + secH > height - legendH - 4) break;

        const isActive = sec.id === gameState || sec.id === 'general';

        // Section header
        ctx.fillStyle = isActive ? '#0f2a0f' : '#080f08';
        ctx.fillRect(0, cy, width, secH);

        ctx.fillStyle    = isActive ? '#4ade80' : '#2a4a2a';
        ctx.font         = `bold ${fs}px "Orbitron", monospace`;
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${sec.icon}  ${sec.title}`, pad, cy + secH / 2);
        cy += secH;

        for (const row of sec.rows) {
            if (cy + rowH > height - legendH - 4) break;

            const isDash = row.key.startsWith('— —');

            // Row background
            ctx.fillStyle = isActive ? '#070f07' : '#050a05';
            ctx.fillRect(0, cy, width, rowH);

            if (!isDash) {
                // Key badge
                ctx.fillStyle   = isActive ? '#122212' : '#090f09';
                ctx.strokeStyle = isActive ? '#2a5a2a' : '#141e14';
                ctx.lineWidth   = 0.7;
                ctx.fillRect(pad + 2, cy + 1, keyW, rowH - 3);
                ctx.strokeRect(pad + 2, cy + 1, keyW, rowH - 3);

                ctx.fillStyle    = isActive ? '#ffd700' : '#2a4a2a';
                ctx.font         = `bold ${fs}px "Share Tech Mono", monospace`;
                ctx.textAlign    = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(row.key, pad + 2 + keyW / 2, cy + rowH / 2);

                // Description
                ctx.fillStyle = isActive ? '#9ad49a' : '#233823';
                ctx.font      = `${fs}px "Share Tech Mono", monospace`;
                ctx.textAlign = 'left';
                ctx.fillText(row.desc, pad + 2 + keyW + 4, cy + rowH / 2);
            } else {
                // Info / tip row (no key badge)
                ctx.fillStyle = isActive ? '#4a7a4a' : '#1a2a1a';
                ctx.font      = `${fs - 1}px "Share Tech Mono", monospace`;
                ctx.textAlign = 'left';
                ctx.fillText('  ℹ  ' + row.desc, pad + 2, cy + rowH / 2);
            }

            cy += rowH;
        }

        // Thin separator after section
        if (cy < height - legendH - 4) {
            ctx.fillStyle = '#0f1f0f';
            ctx.fillRect(0, cy, width, 1);
            cy += 1;
        }
    }

    ctx.textBaseline = 'alphabetic';
}

// ─── ④ Morse code legend ─────────────────────────────────────────────────────

function _drawMorseLegend(ctx, width, height) {
    const legendH = 18;
    const y       = height - legendH;

    ctx.fillStyle = '#040a04';
    ctx.fillRect(0, y, width, legendH);
    ctx.fillStyle = '#0f2a0f';
    ctx.fillRect(0, y, width, 1);

    // Build compact legend: MOE:—·· MOI:—·· etc.
    const parts = CONFIG.FOX_CODES.map((code, i) => {
        const m = getFoxDisplayMorse(code);
        return `${code}:${m}`;
    });
    const line = parts.join('   ');

    ctx.font         = `${Math.max(7, 9)}px "Share Tech Mono", monospace`;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';

    // Clip and scroll if too wide
    ctx.save();
    ctx.beginPath();
    ctx.rect(4, y + 1, width - 8, legendH - 2);
    ctx.clip();

    // Animate scroll
    const scrollX = (Date.now() / 60) % (width + ctx.measureText(line).width + 20);

    for (let i = 0; i < CONFIG.FOX_CODES.length; i++) {
        const code    = CONFIG.FOX_CODES[i];
        const color   = CONFIG.FOX_COLORS[i];
        const morse   = getFoxDisplayMorse(code);
        const chunk   = `${code}:${morse}`;
        // Position: fixed chunks spread across width
        const chunkW  = (width - 8) / CONFIG.FOX_COUNT;
        const cx      = 4 + i * chunkW;

        ctx.fillStyle = Player.foundFoxes.has(code) ? color : '#2a4a2a';
        ctx.fillText(chunk, cx, y + legendH / 2);
    }

    ctx.restore();
    ctx.textBaseline = 'alphabetic';
}

// ─── Overlay helpers ──────────────────────────────────────────────────────────

function showSplash()        { document.getElementById('overlay-splash').classList.remove('hidden'); }
function hideSplash()        { document.getElementById('overlay-splash').classList.add('hidden');    }
function showRegistration()  { document.getElementById('overlay-registration').classList.remove('hidden'); }
function hideRegistration()  { document.getElementById('overlay-registration').classList.add('hidden');    }
function showBriefing()      { document.getElementById('overlay-briefing').classList.remove('hidden'); }
function hideBriefing()      { document.getElementById('overlay-briefing').classList.add('hidden');    }
function showFinishedOverlay(){ document.getElementById('overlay-finished').classList.remove('hidden'); }
function hideFinishedOverlay(){ document.getElementById('overlay-finished').classList.add('hidden');    }

/**
 * Flash a "Fox Found!" notification for 2.5 seconds.
 * @param {Beacon} beacon
 */
function showFoxFoundFlash(beacon) {
    const el     = document.getElementById('fox-found-flash');
    const morse  = getFoxDisplayMorse(beacon.code);
    el.innerHTML = `
        <div class="fox-found-inner">
            <div class="fox-found-icon">🦊</div>
            <div class="fox-found-code" style="color:${beacon.color}">${beacon.code}</div>
            <div class="fox-found-morse">${morse}</div>
            <div class="fox-found-msg">VOSJE GEVONDEN!</div>
            <div class="fox-found-count" style="color:#aaa;font-size:0.75rem;margin-top:4px;">
                ${Player.foundFoxes.size} / ${CONFIG.FOX_COUNT} gevonden
            </div>
        </div>`;
    el.classList.remove('hidden');
    el.classList.add('show');
    setTimeout(() => { el.classList.remove('show'); el.classList.add('hidden'); }, 2500);
}
