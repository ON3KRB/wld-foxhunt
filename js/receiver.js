/**
 * receiver.js - ARDF receiver panel with magnetic loop antenna
 * WLD FoxWave ARDF
 *
 * Visual: a handheld 80m ARDF receiver device drawn in the right-top panel.
 * The magnetic loop rotates with the bearing. Signal strength drives glow + S-meter.
 */
"use strict";

function drawReceiverPanel(ctx, W, H) {
    if (!ctx || !W || !H) return;

    const brg     = Player.receiverBearing;
    const dominant = getDominantSignal(Player.x, Player.y, brg);
    const sig      = dominant ? dominant.signal : 0;

    // ── Background ─────────────────────────────────────────────────────────────
    ctx.fillStyle = '#050f05';
    ctx.fillRect(0, 0, W, H);

    // ── Title bar ──────────────────────────────────────────────────────────────
    ctx.fillStyle = '#0a2a0a';
    ctx.fillRect(0, 0, W, 36);
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 12px "Orbitron", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('📡  80m ARDF ONTVANGER', W/2, 18);
    ctx.fillStyle = '#1a4a1a';
    ctx.fillRect(0, 36, W, 1);

    // ── Frequency LCD ──────────────────────────────────────────────────────────
    ctx.fillStyle = '#001400';
    ctx.fillRect(10, 44, W-20, 32);
    ctx.strokeStyle = '#2a6a2a'; ctx.lineWidth = 1;
    ctx.strokeRect(10, 44, W-20, 32);
    ctx.fillStyle = '#00ff55';
    ctx.font = 'bold 18px "Share Tech Mono", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('3.560 MHz  CW  80m', W/2, 60);

    // ── Draw the magnetic loop antenna ────────────────────────────────────────
    _drawMagLoop(ctx, W, H, brg, sig);

    // ── Bearing readout ────────────────────────────────────────────────────────
    const brgY = H * 0.63;
    ctx.fillStyle = '#4ade80';
    ctx.font = 'bold 26px "Orbitron", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(Math.round(brg)).padStart(3,'0') + '°', W/2, brgY);

    ctx.fillStyle = '#2a6a2a';
    ctx.font = '10px "Share Tech Mono", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('PEILING', W/2, brgY + 16);

    // ── S-Meter ────────────────────────────────────────────────────────────────
    const smY = H * 0.70;
    _drawSMeter(ctx, 10, smY, W-20, 46, sig, dominant);

    // ── Fox code readout ───────────────────────────────────────────────────────
    const codeY = smY + 54;
    ctx.fillStyle = '#090f09';
    ctx.fillRect(10, codeY, W-20, 36);
    ctx.strokeStyle = '#1a3a1a'; ctx.lineWidth = 1;
    ctx.strokeRect(10, codeY, W-20, 36);

    if (dominant && sig > CONFIG.AUDIO_MIN_SIGNAL) {
        ctx.fillStyle = dominant.beacon.color;
        ctx.font = 'bold 20px "Orbitron", monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(dominant.beacon.code, W/2, codeY + 12);
        ctx.fillStyle = '#4ade80';
        ctx.font = '11px "Share Tech Mono", monospace';
        ctx.fillText(getFoxDisplayMorse(dominant.beacon.code), W/2, codeY + 27);
    } else {
        ctx.fillStyle = '#2a4a2a';
        ctx.font = '11px "Share Tech Mono", monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('— geen signaal —', W/2, codeY + 18);
    }

    // ── Footer ─────────────────────────────────────────────────────────────────
    ctx.fillStyle = '#1a3a1a';
    ctx.font = '10px "Share Tech Mono", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('← →  antenne draaien  ·  R = terug', W/2, H - 3);

    ctx.textBaseline = 'alphabetic';
}

// ── Magnetic Loop Antenna ─────────────────────────────────────────────────────
function _drawMagLoop(ctx, W, H, bearing, sig) {

    const cx  = W / 2;
    const cy  = H * 0.365;
    const R   = Math.min(W * 0.34, H * 0.22);   // loop radius
    const now = performance.now();

    ctx.save();
    ctx.translate(cx, cy);

    // ── Rotating part (the loop assembly) ─────────────────────────────────────
    // Bearing 0° = loop broadside faces North = min signal from North
    // ARDF loop: NULL in axis direction, MAX broadside = bearing + 90°
    const loopAngle = bearing * Math.PI / 180;
    ctx.rotate(loopAngle);

    // Capacitor tuning box at top of loop
    ctx.fillStyle = '#2a2a2a';
    ctx.beginPath(); ctx.roundRect(-16, -R - 14, 32, 16, 3); ctx.fill();
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1; ctx.stroke();
    // Capacitor label
    ctx.fillStyle = '#aaa';
    ctx.font = '8px "Share Tech Mono", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('CAP', 0, -R - 6);

    // ── Glow (signal-reactive) ─────────────────────────────────────────────────
    if (sig > 0.01) {
        const pulse = 0.3 + 0.25 * Math.sin(now / 180);
        const glowAlpha = Math.min(0.55, sig * 0.7 + pulse * sig * 0.4);
        const glow = ctx.createRadialGradient(0, 0, R*0.3, 0, 0, R*1.5);
        glow.addColorStop(0, `rgba(255,215,0,${glowAlpha})`);
        glow.addColorStop(1, 'rgba(255,215,0,0)');
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(0, 0, R*1.5, 0, Math.PI*2); ctx.fill();
    }

    // ── Outer loop frame (thick pipe) ─────────────────────────────────────────
    // Shadow
    ctx.beginPath(); ctx.arc(2, 3, R, 0, Math.PI*2);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 9; ctx.stroke();

    // Main copper tube
    const tubeGrad = ctx.createLinearGradient(-R, 0, R, 0);
    tubeGrad.addColorStop(0,   '#7a4a10');
    tubeGrad.addColorStop(0.3, '#d4822a');
    tubeGrad.addColorStop(0.5, '#f0a040');
    tubeGrad.addColorStop(0.7, '#d4822a');
    tubeGrad.addColorStop(1,   '#7a4a10');
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI*2);
    ctx.strokeStyle = tubeGrad; ctx.lineWidth = 8; ctx.stroke();

    // Highlight sheen on top of tube
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI*2);
    ctx.strokeStyle = 'rgba(255,220,150,0.35)'; ctx.lineWidth = 2; ctx.stroke();

    // ── Inner loop (coupling loop) — smaller ring inside ───────────────────────
    const innerR = R * 0.38;
    ctx.beginPath(); ctx.arc(0, 0, innerR, 0, Math.PI*2);
    ctx.strokeStyle = '#8a6030'; ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,200,100,0.3)'; ctx.lineWidth = 1; ctx.stroke();

    // ── Feed cable from inner loop to bottom ──────────────────────────────────
    ctx.strokeStyle = '#444'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, innerR); ctx.lineTo(0, R + 14); ctx.stroke();

    // ── Vertical support mast (behind loop, drawn before loop) ────────────────
    ctx.strokeStyle = '#666'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, -R - 14); ctx.lineTo(0, R + 14); ctx.stroke();
    ctx.strokeStyle = '#888'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -R - 14); ctx.lineTo(0, R + 14); ctx.stroke();

    // ── NULL direction indicator (axis = min signal, shown as dashed line) ─────
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(255,80,80,0.6)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -R*1.35); ctx.lineTo(0, R*1.35); ctx.stroke();
    ctx.setLineDash([]);

    // ── MAX signal direction indicator (broadside, shown as arrow) ────────────
    if (sig > 0.05) {
        const arrowAlpha = Math.min(0.9, sig * 1.2);
        ctx.fillStyle = `rgba(74,222,128,${arrowAlpha})`;
        ctx.strokeStyle = `rgba(74,222,128,${arrowAlpha})`;
        ctx.lineWidth = 2;
        // Left arrow
        ctx.beginPath(); ctx.moveTo(-R*1.25, 0); ctx.lineTo(-R*1.05, -8); ctx.lineTo(-R*1.05, 8); ctx.closePath(); ctx.fill();
        // Right arrow
        ctx.beginPath(); ctx.moveTo(R*1.25, 0); ctx.lineTo(R*1.05, -8); ctx.lineTo(R*1.05, 8); ctx.closePath(); ctx.fill();
    }

    ctx.restore();

    // ── Compass N/O/Z/W labels (fixed, not rotating) ──────────────────────────
    const lblR = R + 42;
    const lbls = [['N', -90], ['O', 0], ['Z', 90], ['W', 180]];
    ctx.font = 'bold 11px "Orbitron", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [lbl, deg] of lbls) {
        const a = deg * Math.PI / 180;
        ctx.fillStyle = lbl === 'N' ? '#ff6666' : '#6aaa6a';
        ctx.fillText(lbl, cx + Math.cos(a)*lblR, cy + Math.sin(a)*lblR);
    }

    // ── Receiver body (handheld device below antenna) ─────────────────────────
    const devX = cx - 50, devY = cy + R + 18, devW = 100, devH = 28;
    const dg = ctx.createLinearGradient(devX, devY, devX, devY+devH);
    dg.addColorStop(0, '#2a2a2a'); dg.addColorStop(1, '#181818');
    ctx.fillStyle = dg;
    ctx.beginPath(); ctx.roundRect(devX, devY, devW, devH, 4); ctx.fill();
    ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 1; ctx.stroke();

    // Headphone jack
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(devX+8, devY+devH/2, 4, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#555'; ctx.lineWidth=1; ctx.stroke();

    // Volume knob
    ctx.fillStyle = '#333';
    ctx.beginPath(); ctx.arc(devX+devW-10, devY+devH/2, 6, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#666'; ctx.lineWidth=1; ctx.stroke();
    ctx.fillStyle = '#888';
    ctx.beginPath(); ctx.arc(devX+devW-10, devY+devH/2, 2, 0, Math.PI*2); ctx.fill();

    // Band label
    ctx.fillStyle = '#4ade80';
    ctx.font = 'bold 10px "Share Tech Mono", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('80m ARDF RX', cx, devY + devH/2);

    ctx.textBaseline = 'alphabetic';
}

// ── S-Meter ───────────────────────────────────────────────────────────────────
function _drawSMeter(ctx, x, y, w, h, signal, dominant) {
    ctx.fillStyle = '#060f06';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#1a3a1a'; ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);

    // Scale labels
    ctx.fillStyle = '#3a6a3a';
    ctx.font = '9px "Share Tech Mono", monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('S1  S3  S5  S7  S9  +20  +40', x+4, y+3);

    const barH = Math.floor(h * 0.42);
    const barY = y + h * 0.38;
    const bars = 28;
    const barW = Math.floor((w - 8) / bars);

    for (let i = 0; i < bars; i++) {
        const bx = x + 4 + i * barW;
        const filled = i < Math.floor(signal * bars);
        if (filled) {
            ctx.fillStyle = i<16 ? '#00cc00' : i<22 ? '#aacc00' : i<26 ? '#ffaa00' : '#ff4400';
        } else {
            ctx.fillStyle = '#0a1a0a';
        }
        ctx.fillRect(bx, barY, barW - 1, barH);
    }

    // dBm readout
    const db = signal > 0.005 ? Math.round(20 * Math.log10(signal)) : -99;
    ctx.fillStyle = signal > 0.04 ? '#00ff44' : '#3a5a3a';
    ctx.font = 'bold 11px "Share Tech Mono", monospace';
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText(`${db} dBm`, x+w-4, y+3);
    ctx.textAlign = 'left';
}
