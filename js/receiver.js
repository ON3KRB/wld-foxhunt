/**
 * receiver.js - Receiver mode logic and compass panel rendering
 * WLD FoxWave ARDF
 *
 * The compass panel is drawn on the right-top canvas when the game is in
 * STATE.RECEIVER mode.  It shows:
 *   - A compass rose that rotates with the receiver bearing
 *   - Signal strength bars (S-meter style)
 *   - The dominant fox code being received
 *   - A directional needle pointing to the strongest signal
 */

"use strict";

// ─── Compass Rose Renderer ────────────────────────────────────────────────────

/**
 * Draw the receiver compass panel on the given canvas context.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width   canvas width
 * @param {number} height  canvas height
 */
function drawReceiverPanel(ctx, width, height) {
    const { receiverBearing } = Player;
    const dominant = getDominantSignal(Player.x, Player.y, receiverBearing);

    // Background
    ctx.fillStyle = '#050f05';
    ctx.fillRect(0, 0, width, height);

    // Title bar
    ctx.fillStyle = '#0d2d0d';
    ctx.fillRect(0, 0, width, 36);
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 14px "Orbitron", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('⚡ 80m RECEIVER', width / 2, 22);

    const compassCX = width  / 2;
    const compassCY = height * 0.40;
    const compassR  = Math.min(width, height * 0.55) * 0.38;

    // Compass outer ring
    _drawCompassRose(ctx, compassCX, compassCY, compassR, receiverBearing);

    // Signal strength
    const signalVal = dominant ? dominant.signal : 0;
    _drawSMeter(ctx, 12, height * 0.78, width - 24, 60, signalVal);

    // Received fox code display
    _drawFoxCodeDisplay(ctx, width, height, dominant);

    // Antenna beam visualisation (arc showing beam coverage)
    _drawBeamArc(ctx, compassCX, compassCY, compassR, receiverBearing, signalVal > 0.05);

    // Bearing readout
    ctx.fillStyle = '#4ade80';
    ctx.font = 'bold 18px "Orbitron", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(receiverBearing).toString().padStart(3, '0')}°`, compassCX, compassCY + compassR + 24);

    ctx.fillStyle = '#5a8a5a';
    ctx.font = '11px "Share Tech Mono", monospace';
    ctx.fillText('← → to rotate receiver', width / 2, height - 10);
}

// ─── Internal drawing helpers ─────────────────────────────────────────────────

function _drawCompassRose(ctx, cx, cy, r, bearing) {
    // Outer dark circle
    ctx.beginPath();
    ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
    ctx.fillStyle = '#0a1f0a';
    ctx.fill();
    ctx.strokeStyle = '#2a6a2a';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Tick marks (every 10°), labels (every 30°)
    const labels = { 0: 'N', 30: 'NNE', 60: 'NE', 90: 'E', 120: 'SE', 150: 'SSE',
                     180: 'S', 210: 'SSW', 240: 'SW', 270: 'W', 300: 'NW', 330: 'NNW' };
    const mainLabels = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-bearing * Math.PI / 180);  // rotate the entire rose

    for (let deg = 0; deg < 360; deg += 10) {
        const rad   = deg * Math.PI / 180;
        const isMain   = deg % 90  === 0;
        const isSecond = deg % 30  === 0;
        const tickLen  = isMain ? 14 : isSecond ? 9 : 5;
        const x1 = Math.sin(rad) * (r - tickLen);
        const y1 = -Math.cos(rad) * (r - tickLen);
        const x2 = Math.sin(rad) * r;
        const y2 = -Math.cos(rad) * r;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = isMain ? '#ffd700' : isSecond ? '#4ade80' : '#2a5a2a';
        ctx.lineWidth   = isMain ? 2.5 : 1;
        ctx.stroke();

        // Labels
        if (mainLabels[deg] !== undefined) {
            const lx = Math.sin(rad) * (r - 22);
            const ly = -Math.cos(rad) * (r - 22);
            ctx.fillStyle = '#ffd700';
            ctx.font = `bold ${isMain ? 14 : 11}px "Orbitron", monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(mainLabels[deg], lx, ly);
        } else if (labels[deg] !== undefined) {
            const lx = Math.sin(rad) * (r - 18);
            const ly = -Math.cos(rad) * (r - 18);
            ctx.fillStyle = '#4ade80';
            ctx.font = '9px "Orbitron", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(labels[deg], lx, ly);
        }
    }

    // Inner ring
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.15, 0, Math.PI * 2);
    ctx.fillStyle = '#1a3a1a';
    ctx.fill();
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.restore();

    // Fixed North indicator needle (always points up, the rose rotates)
    const needleLength = r * 0.72;
    // North (red)
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy - needleLength);
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 3;
    ctx.stroke();
    // South (dark)
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy + needleLength * 0.65);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Center dot
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd700';
    ctx.fill();
}

function _drawBeamArc(ctx, cx, cy, r, bearing, hasSignal) {
    const halfAngle = CONFIG.RECEIVER_BEAMWIDTH * Math.PI / 180;
    const startAngle = (bearing - CONFIG.RECEIVER_BEAMWIDTH - 90) * Math.PI / 180;
    const endAngle   = (bearing + CONFIG.RECEIVER_BEAMWIDTH - 90) * Math.PI / 180;

    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.2);
    grad.addColorStop(0, hasSignal ? 'rgba(74,222,128,0.25)' : 'rgba(74,222,128,0.08)');
    grad.addColorStop(1, 'rgba(74,222,128,0)');

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r * 1.2, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
}

function _drawSMeter(ctx, x, y, w, h, signal) {
    // Background
    ctx.fillStyle = '#0a1f0a';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#2a5a2a';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);

    // Label
    ctx.fillStyle = '#4ade80';
    ctx.font = '11px "Share Tech Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('S-METER', x + 4, y + 4);

    // Segment bar
    const segments  = 20;
    const segW      = (w - 8) / segments;
    const lit       = Math.round(signal * segments);
    const barY      = y + 22;
    const barH      = h - 30;

    for (let i = 0; i < segments; i++) {
        const sx = x + 4 + i * segW;
        const pct = i / segments;
        let color;
        if (pct < 0.5)       color = i < lit ? '#4ade80' : '#0d2d0d';
        else if (pct < 0.75) color = i < lit ? '#ffd700' : '#1a1a00';
        else                  color = i < lit ? '#ff4444' : '#2a0000';
        ctx.fillStyle = color;
        ctx.fillRect(sx + 1, barY, segW - 2, barH);
    }

    // Signal level text
    const db = signal > 0.001 ? Math.round(20 * Math.log10(signal)) : -60;
    ctx.fillStyle = '#ffd700';
    ctx.font = '11px "Share Tech Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${db} dBm`, x + w - 4, y + 4);
}

function _drawFoxCodeDisplay(ctx, width, height, dominant) {
    const y = height * 0.73;

    if (!dominant) {
        ctx.fillStyle = '#1a3a1a';
        ctx.font = '12px "Share Tech Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('— NO SIGNAL —', width / 2, y - 6);
        return;
    }

    const { beacon, signal } = dominant;
    const morse = getFoxDisplayMorse(beacon.code);

    // Fox code
    ctx.fillStyle = beacon.color;
    ctx.font = 'bold 16px "Orbitron", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(beacon.code, width / 2, y - 6);

    // Morse display
    ctx.fillStyle = '#4ade80';
    ctx.font = '18px "Share Tech Mono", monospace';
    ctx.fillText(morse, width / 2, y + 14);
}
