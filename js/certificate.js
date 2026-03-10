/**
 * certificate.js - Finish certificate canvas generator
 * WLD FoxWave ARDF
 *
 * Generates a printable/downloadable certificate on a Canvas element
 * when the player has found all 5 foxes and returned to the start.
 */

"use strict";

/**
 * Draw the completion certificate onto the given canvas.
 * @param {HTMLCanvasElement} canvas
 */
function drawCertificate(canvas) {
    const W = canvas.width  = 900;
    const H = canvas.height = 640;
    const ctx = canvas.getContext('2d');

    // ── Background gradient ───────────────────────────────────────────────────
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0,   '#0a1a08');
    bgGrad.addColorStop(0.5, '#0f2a0c');
    bgGrad.addColorStop(1,   '#0a1a08');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // ── Decorative border ─────────────────────────────────────────────────────
    _drawCertBorder(ctx, W, H);

    // ── Header ────────────────────────────────────────────────────────────────
    ctx.fillStyle = '#ffd700';
    ctx.font      = 'bold 13px "Orbitron", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('WLD RADIO AMATEUR CLUB', W / 2, 36);

    ctx.fillStyle = '#ffd700';
    ctx.font      = 'bold 38px "Orbitron", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('WLD FoxWave ARDF', W / 2, 58);

    ctx.fillStyle = '#4ade80';
    ctx.font      = 'bold 18px "Orbitron", monospace';
    ctx.fillText('AMATEUR RADIO DIRECTION FINDING — VOSSENJACHT', W / 2, 108);

    // Divider
    _drawGoldLine(ctx, W * 0.1, W * 0.9, 138);

    // ── "This certifies that" ─────────────────────────────────────────────────
    ctx.fillStyle = '#aacfaa';
    ctx.font      = '16px "Share Tech Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Dit is om te certificeren dat', W / 2, 162);

    ctx.fillStyle = '#ffffff';
    ctx.font      = `bold 36px "Orbitron", monospace`;
    ctx.fillText(Player.name || 'Anonymous Hunter', W / 2, 200);

    ctx.fillStyle = '#aacfaa';
    ctx.font      = '16px "Share Tech Mono", monospace';
    ctx.fillText('heeft alle 5 vossen gevonden in de WLD FoxWave ARDF Vossenjacht', W / 2, 244);

    // ── Fox codes strip ───────────────────────────────────────────────────────
    _drawFoxCodeStrip(ctx, W, H);

    // ── Time block ───────────────────────────────────────────────────────────
    const elapsed  = Player.getElapsedSeconds();
    const mm       = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const ss       = String(elapsed % 60).padStart(2, '0');
    const timeStr  = `${mm}:${ss}`;

    ctx.fillStyle = '#ffd700';
    ctx.font      = 'bold 14px "Orbitron", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('TOTALE TIJD', W / 2, 360);

    ctx.fillStyle = '#4ade80';
    ctx.font      = 'bold 60px "Share Tech Mono", monospace';
    ctx.fillText(timeStr, W / 2, 430);

    // ── Date ─────────────────────────────────────────────────────────────────
    const now       = new Date();
    const dateStr   = now.toLocaleDateString('nl-BE', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    const timeOfDay = now.toLocaleTimeString('nl-BE', { hour:'2-digit', minute:'2-digit' });

    ctx.fillStyle = '#aacfaa';
    ctx.font      = '14px "Share Tech Mono", monospace';
    ctx.fillText(`${dateStr}  ·  ${timeOfDay}`, W / 2, 462);

    // ── Logos / images ────────────────────────────────────────────────────────
    _drawImages(ctx, W, H);

    // ── Footer ────────────────────────────────────────────────────────────────
    _drawGoldLine(ctx, W * 0.1, W * 0.9, 520);

    ctx.fillStyle = '#ffd700';
    ctx.font      = 'bold 12px "Orbitron", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('WLD Radio Amateur Club', W * 0.1, 540);

    ctx.textAlign = 'right';
    ctx.fillText('ON3KC · 80m ARDF · Vossenjacht', W * 0.9, 540);

    ctx.fillStyle = '#3a6a3a';
    ctx.font      = '11px "Share Tech Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('WLD FoxWave ARDF — powered by WLD Radio Amateur Club — wld-ardf.github.io', W / 2, 565);

    ctx.textBaseline = 'alphabetic';
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function _drawCertBorder(ctx, W, H) {
    // Outer gold frame
    ctx.strokeStyle = '#c8a000';
    ctx.lineWidth   = 4;
    ctx.strokeRect(16, 16, W - 32, H - 32);

    // Inner green frame
    ctx.strokeStyle = '#2a5a2a';
    ctx.lineWidth   = 2;
    ctx.strokeRect(24, 24, W - 48, H - 48);

    // Corner ornaments
    const corners = [[30,30], [W-30,30], [30,H-30], [W-30,H-30]];
    for (const [cx, cy] of corners) {
        ctx.fillStyle = '#c8a000';
        ctx.beginPath();
        ctx.arc(cx, cy, 6, 0, Math.PI * 2);
        ctx.fill();
    }

    // Radio wave pattern at top-right corner
    ctx.strokeStyle = 'rgba(200,160,0,0.3)';
    ctx.lineWidth   = 1.5;
    for (let i = 1; i <= 4; i++) {
        ctx.beginPath();
        ctx.arc(W - 40, 40, i * 14, -Math.PI * 0.7, -Math.PI * 0.1);
        ctx.stroke();
    }
}

function _drawGoldLine(ctx, x1, x2, y) {
    const grad = ctx.createLinearGradient(x1, y, x2, y);
    grad.addColorStop(0,   'transparent');
    grad.addColorStop(0.3, '#c8a000');
    grad.addColorStop(0.7, '#c8a000');
    grad.addColorStop(1,   'transparent');
    ctx.strokeStyle = grad;
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.stroke();
}

function _drawFoxCodeStrip(ctx, W, H) {
    const stripY = 270;
    const stripH = 68;
    const slotW  = (W * 0.7) / CONFIG.FOX_COUNT;
    const startX = W * 0.15;

    ctx.fillStyle = 'rgba(0,20,0,0.5)';
    ctx.fillRect(startX, stripY, W * 0.7, stripH);
    ctx.strokeStyle = '#2a5a2a';
    ctx.lineWidth   = 1;
    ctx.strokeRect(startX, stripY, W * 0.7, stripH);

    for (let i = 0; i < CONFIG.FOX_COUNT; i++) {
        const code  = CONFIG.FOX_CODES[i];
        const color = CONFIG.FOX_COLORS[i];
        const cx    = startX + i * slotW + slotW / 2;

        ctx.fillStyle = color;
        ctx.font      = 'bold 22px "Share Tech Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('🦊', cx, stripY + 6);

        ctx.fillStyle = color;
        ctx.font      = `bold 13px "Orbitron", monospace`;
        ctx.fillText(code, cx, stripY + 44);
    }

    ctx.textBaseline = 'alphabetic';
}

function _drawImages(ctx, W, H) {
    // WLD logo bottom left
    const logo = new Image();
    logo.onload = () => ctx.drawImage(logo, W * 0.06, H - 140, 90, 90);
    logo.src    = 'assets/wld-logo.png';

    // Fox image bottom right
    const fox = new Image();
    fox.onload = () => {
        ctx.save();
        ctx.drawImage(fox, W * 0.82, H - 155, 100, 130);
        ctx.restore();
    };
    fox.src = 'assets/fox.png';
}

/**
 * Show the certificate overlay and render the certificate canvas.
 */
function showCertificate() {
    const overlay = document.getElementById('overlay-certificate');
    overlay.classList.remove('hidden');
    const canvas = document.getElementById('cert-canvas');
    drawCertificate(canvas);
}

/**
 * Trigger a PNG download of the certificate canvas.
 */
function downloadCertificate() {
    const canvas = document.getElementById('cert-canvas');
    const link   = document.createElement('a');
    link.download = `WLD-FoxWave-ARDF-${Player.name.replace(/\s+/g,'_')}.png`;
    link.href    = canvas.toDataURL('image/png');
    link.click();
}
