/**
 * audio.js - Web Audio API CW morse engine
 * WLD FoxWave ARDF
 *
 * Single API: audioEngine.tick(foxCode, signalStrength) called every frame.
 * audioEngine.stop() when leaving receiver mode.
 * audioEngine.init() must be called once from a user gesture.
 */
"use strict";

class AudioEngine {
    constructor() {
        this.ctx         = null;
        this._osc        = null;
        this._envGain    = null;   // morse on/off envelope
        this._volGain    = null;   // signal strength volume
        this._ready      = false;
        this._playing    = false;
        this._foxCode    = null;
        this._volume     = 0;
        this._nextTime   = 0;      // AudioContext time for next scheduled pattern
        this._rafId      = null;
        this._LOOK_AHEAD = 0.4;    // seconds to schedule ahead
    }

    // ── Public API ─────────────────────────────────────────────────────────────

    /** Call once from any user gesture (click / keydown). */
    init() {
        if (this._ready) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
        this.ctx      = new (window.AudioContext || window.webkitAudioContext)();
        this._volGain = this.ctx.createGain(); this._volGain.gain.value = 0;
        this._volGain.connect(this.ctx.destination);
        this._envGain = this.ctx.createGain(); this._envGain.gain.value = 0;
        this._envGain.connect(this._volGain);
        this._osc = this.ctx.createOscillator();
        this._osc.type = 'sine';
        this._osc.frequency.value = CONFIG.MORSE_FREQUENCY;
        this._osc.connect(this._envGain);
        this._osc.start();
        this._ready = true;
        console.log('[Audio] Ready, sampleRate:', this.ctx.sampleRate);
    }

    /**
     * Call every animation frame with current dominant signal.
     * @param {string|null} foxCode  e.g. 'MOE', or null if no signal
     * @param {number}      signal   0–1
     */
    tick(foxCode, signal) {
        if (!this._ready) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();

        const active = foxCode !== null && signal > 0.03;

        if (!active) {
            this._fadeOut();
            return;
        }

        // Fox changed → restart cleanly
        if (foxCode !== this._foxCode) {
            this._foxCode  = foxCode;
            this._playing  = false;
            this._cancelEnvelope();
            this._nextTime = this.ctx.currentTime + 0.05;
        }

        // Update volume smoothly
        this._volume = signal;
        this._volGain.gain.setTargetAtTime(
            signal * CONFIG.AUDIO_MAX_VOLUME, this.ctx.currentTime, 0.06
        );

        if (!this._playing) {
            this._playing = true;
            this._startScheduler();
        }
    }

    /** Hard stop — call when leaving receiver mode. */
    stop() {
        this._playing = false;
        this._foxCode = null;
        if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
        this._fadeOut();
        this._cancelEnvelope();
    }

    get isReady() { return this._ready; }

    // ── Internals ──────────────────────────────────────────────────────────────

    _fadeOut() {
        if (!this._ready) return;
        this._playing = false;
        if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
        this._volGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    }

    _cancelEnvelope() {
        if (!this._envGain) return;
        const t = this.ctx.currentTime;
        this._envGain.gain.cancelScheduledValues(t);
        this._envGain.gain.setValueAtTime(0, t);
    }

    _startScheduler() {
        if (this._rafId) cancelAnimationFrame(this._rafId);
        const tick = () => {
            if (!this._playing) return;
            if (this._nextTime < this.ctx.currentTime + this._LOOK_AHEAD) {
                this._schedulePattern();
            }
            this._rafId = requestAnimationFrame(tick);
        };
        this._rafId = requestAnimationFrame(tick);
    }

    _schedulePattern() {
        if (!this._foxCode) return;
        const pattern = getFoxPattern(this._foxCode);
        if (!pattern || !pattern.length) return;

        const U = CONFIG.MORSE_UNIT_MS / 1000;   // dit duration in seconds
        const R = 0.004;                          // 4 ms soft ramp edge
        const G = this._envGain.gain;
        const unitDur = { [SYM.DIT]:1, [SYM.DAH]:3, [SYM.EG]:1, [SYM.CG]:3, [SYM.WG]:7 };

        let t = this._nextTime;

        for (const sym of pattern) {
            const d = (unitDur[sym] || 1) * U;
            if (sym === SYM.DIT || sym === SYM.DAH) {
                G.setValueAtTime(0, t);
                G.linearRampToValueAtTime(1, t + R);
                G.setValueAtTime(1, t + d - R);
                G.linearRampToValueAtTime(0, t + d);
            }
            t += d;
        }

        // Next repetition after pause
        this._nextTime = t + CONFIG.MORSE_REPEAT_PAUSE / 1000;
    }
}

const audioEngine = new AudioEngine();
