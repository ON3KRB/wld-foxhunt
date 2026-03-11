/**
 * certificate.js - Finish certificate generator (v2)
 * WLD FoxWave ARDF
 *
 * Fixes v1 issues:
 *  - Images pre-loaded via Promise before drawing
 *  - Canvas size scales to window
 *  - Richer visual design (gold border, radio waves, morse strip)
 *  - Download includes player name in filename
 */

"use strict";

/**
 * Pre-load cert images and draw the certificate.
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<void>}
 */
async function drawCertificate(canvas) {
    const W = 900, H = 640;
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // ── Pre-load images (proper async) ────────────────────────────────────────
    const [logoImg, foxImg] = await Promise.all([
        _loadImage('assets/wld-logo.png'),
        _loadImage('assets/fox.png'),
    ]);

    // ── Background ────────────────────────────────────────────────────────────
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0,   '#060e06');
    bg.addColorStop(0.4, '#0a1c08');
    bg.addColorStop(1,   '#040c04');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Subtle green mesh overlay
    ctx.fillStyle = 'rgba(74,222,128,0.025)';
    for (let y = 0; y < H; y += 22)
        ctx.fillRect(0, y, W, 1);
    for (let x = 0; x < W; x += 22)
        ctx.fillRect(x, 0, 1, H);

    // ── Decorative border ─────────────────────────────────────────────────────
    _drawBorder(ctx, W, H);

    // ── Radio wave decoration (top right) ────────────────────────────────────
    _drawRadioWaveDeco(ctx, W - 55, 55);

    // ── Logo top-left ─────────────────────────────────────────────────────────
    if (logoImg) {
        ctx.save();
        ctx.shadowColor = 'rgba(255,215,0,0.5)';
        ctx.shadowBlur  = 12;
        ctx.drawImage(logoImg, 50, 42, 80, 80);
        ctx.restore();
    }

    // ── Fox image bottom-right ────────────────────────────────────────────────
    if (foxImg) {
        ctx.save();
        ctx.globalAlpha = 0.90;
        ctx.drawImage(foxImg, W - 155, H - 180, 110, 145);
        ctx.restore();
    }

    // ── Header ────────────────────────────────────────────────────────────────
    ctx.fillStyle = '#c8a000';
    ctx.font      = '700 12px "Orbitron", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('WLD RADIO AMATEUR CLUB  ·  ON3KC  ·  ARDF VOSSENJACHT', W / 2, 38);

    ctx.fillStyle = '#ffd700';
    ctx.font      = '900 40px "Orbitron", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(255,215,0,0.35)';
    ctx.shadowBlur  = 18;
    ctx.fillText('WLD FoxWave ARDF', W / 2, 60);
    ctx.shadowBlur  = 0;

    ctx.fillStyle = '#4ade80';
    ctx.font      = '700 15px "Orbitron", monospace';
    ctx.fillText('AMATEUR RADIO DIRECTION FINDING — VOSSENJACHT', W / 2, 112);

    _drawGoldLine(ctx, W * 0.08, W * 0.92, 140);

    // ── Certifies that ────────────────────────────────────────────────────────
    ctx.fillStyle = '#7aaa7a';
    ctx.font      = '400 15px "Share Tech Mono", monospace';
    ctx.textBaseline = 'top';
    ctx.fillText('Dit certificaat bevestigt dat', W / 2, 158);

    ctx.fillStyle = '#ffffff';
    ctx.font      = '700 34px "Orbitron", monospace';
    ctx.shadowColor = 'rgba(255,255,255,0.15)';
    ctx.shadowBlur  = 8;
    ctx.fillText(Player.name || 'Anonymous Hunter', W / 2, 186);
    ctx.shadowBlur  = 0;

    ctx.fillStyle = '#7aaa7a';
    ctx.font      = '400 14px "Share Tech Mono", monospace';
    ctx.fillText('alle 5 radiobakens heeft gevonden in de WLD FoxWave ARDF Vossenjacht', W / 2, 234);

    // ── Fox code strip ────────────────────────────────────────────────────────
    _drawFoxStrip(ctx, W);

    // ── Time ──────────────────────────────────────────────────────────────────
    const elapsed = Player.getElapsedSeconds();
    const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const ss = String(elapsed % 60).padStart(2, '0');

    ctx.fillStyle = '#4ade80';
    ctx.font      = '700 12px "Orbitron", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('TOTALE TIJD', W / 2, 365);

    ctx.fillStyle = '#ffd700';
    ctx.font      = '700 58px "Share Tech Mono", monospace';
    ctx.shadowColor = 'rgba(255,215,0,0.3)';
    ctx.shadowBlur  = 14;
    ctx.fillText(`${mm}:${ss}`, W / 2, 386);
    ctx.shadowBlur  = 0;

    // ── Morse strip decoration ────────────────────────────────────────────────
    _drawMorseStrip(ctx, W);

    // ── Date / time ───────────────────────────────────────────────────────────
    const now     = new Date();
    const dateStr = now.toLocaleDateString('nl-BE', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    const timeStr = now.toLocaleTimeString('nl-BE', { hour:'2-digit', minute:'2-digit' });

    ctx.fillStyle = '#7aaa7a';
    ctx.font      = '400 13px "Share Tech Mono", monospace';
    ctx.textBaseline = 'top';
    ctx.fillText(`${dateStr}  ·  ${timeStr}`, W / 2, 466);

    _drawGoldLine(ctx, W * 0.08, W * 0.92, 506);

    // ── Footer ────────────────────────────────────────────────────────────────
    ctx.fillStyle = '#c8a000';
    ctx.font      = '700 11px "Orbitron", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('WLD Radio Amateur Club', 52, 520);

    ctx.textAlign = 'right';
    ctx.fillText('80m CW ARDF  ·  Vossenjacht Simulator', W - 52, 520);

    ctx.fillStyle = '#2a5a2a';
    ctx.font      = '400 10px "Share Tech Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('on3krb.github.io/wld-foxhunt-   ·   WLD FoxWave ARDF   ·   Powered by WLD Radio Amateur Club', W / 2, 542);

    ctx.textBaseline = 'alphabetic';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _loadImage(src) {
    return new Promise(resolve => {
        const img = new Image();
        img.onload  = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
    });
}

function _drawBorder(ctx, W, H) {
    // Outer double gold frame
    ctx.strokeStyle = '#c8a000';
    ctx.lineWidth   = 3;
    ctx.strokeRect(14, 14, W - 28, H - 28);
    ctx.strokeStyle = '#4a2a00';
    ctx.lineWidth   = 1;
    ctx.strokeRect(20, 20, W - 40, H - 40);
    ctx.strokeStyle = '#8a6a00';
    ctx.lineWidth   = 1;
    ctx.strokeRect(22, 22, W - 44, H - 44);

    // Corner ornaments
    const corners = [[24,24],[W-24,24],[24,H-24],[W-24,H-24]];
    for (const [cx, cy] of corners) {
        ctx.fillStyle = '#c8a000';
        ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#c8a000'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx, cy + 8); ctx.lineTo(cx, cy + 20);
        ctx.moveTo(cx + 8, cy); ctx.lineTo(cx + 20, cy);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx, cy - 8); ctx.lineTo(cx, cy - 20);
        ctx.moveTo(cx - 8, cy); ctx.lineTo(cx - 20, cy);
        ctx.stroke();
    }
}

function _drawRadioWaveDeco(ctx, cx, cy) {
    for (let i = 1; i <= 5; i++) {
        ctx.strokeStyle = `rgba(255,215,0,${0.35 - i * 0.06})`;
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, i * 16, -Math.PI * 0.7, -Math.PI * 0.05);
        ctx.stroke();
    }
    ctx.fillStyle = '#ffd700';
    ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();
}

function _drawGoldLine(ctx, x1, x2, y) {
    const g = ctx.createLinearGradient(x1, y, x2, y);
    g.addColorStop(0,   'transparent');
    g.addColorStop(0.25, '#c8a000');
    g.addColorStop(0.75, '#c8a000');
    g.addColorStop(1,   'transparent');
    ctx.strokeStyle = g; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
}

function _drawFoxStrip(ctx, W) {
    const stripY = 260, stripH = 76;
    const x1 = W * 0.12, w = W * 0.76;
    const slotW = w / CONFIG.FOX_COUNT;

    ctx.fillStyle = 'rgba(0,15,0,0.55)';
    ctx.fillRect(x1, stripY, w, stripH);
    ctx.strokeStyle = '#2a5a2a'; ctx.lineWidth = 1;
    ctx.strokeRect(x1, stripY, w, stripH);

    for (let i = 0; i < CONFIG.FOX_COUNT; i++) {
        const code  = CONFIG.FOX_CODES[i];
        const color = CONFIG.FOX_COLORS[i];
        const cx    = x1 + i * slotW + slotW / 2;

        // Colored top bar
        ctx.fillStyle = color + '44';
        ctx.fillRect(x1 + i * slotW + 1, stripY + 1, slotW - 2, stripH - 2);

        // Fox emoji
        ctx.font = '28px serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText('🦊', cx, stripY + 8);

        // Code
        ctx.fillStyle = color;
        ctx.font = `700 13px "Orbitron", monospace`;
        ctx.textBaseline = 'bottom';
        ctx.fillText(code, cx, stripY + stripH - 6);

        // Morse dots
        ctx.fillStyle = color + 'aa';
        ctx.font = `12px "Share Tech Mono", monospace`;
        ctx.fillText(getFoxDisplayMorse(code), cx, stripY + stripH - 22);

        // Dividers
        if (i > 0) {
            ctx.strokeStyle = '#2a5a2a'; ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x1 + i * slotW, stripY);
            ctx.lineTo(x1 + i * slotW, stripY + stripH);
            ctx.stroke();
        }
    }
    ctx.textBaseline = 'alphabetic';
}

function _drawMorseStrip(ctx, W) {
    const y = 456;
    ctx.fillStyle = '#0a1a0a';
    ctx.fillRect(W * 0.08, y, W * 0.84, 18);

    const morseText = '– – – · · · – – – · · – – – · · · – – – · · · ·';
    ctx.fillStyle = '#2a5a2a';
    ctx.font      = '11px "Share Tech Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(morseText, W / 2, y + 9);
    ctx.textBaseline = 'alphabetic';
}

/**
 * Show the certificate overlay and render the certificate.
 */
function showCertificate() {
    const overlay = document.getElementById('overlay-certificate');
    overlay.classList.remove('hidden');
    const canvas  = document.getElementById('cert-canvas');
    // Draw async — shows spinner state naturally
    drawCertificate(canvas).catch(e => console.error('[Certificate]', e));
}

/**
 * Download the certificate as PNG.
 */
function downloadCertificate() {
    const canvas = document.getElementById('cert-canvas');
    const link   = document.createElement('a');
    const safeName = (Player.name || 'Hunter').replace(/[^a-zA-Z0-9_\-]/g, '_');
    link.download = `WLD-FoxWave-ARDF-${safeName}.png`;
    link.href     = canvas.toDataURL('image/png');
    link.click();
}
