/**
 * audio.js - Web Audio API CW morse tone engine (v3 - bug-fixed)
 * WLD FoxWave ARDF
 *
 * Architecture:
 *  - Single persistent OscillatorNode running at all times
 *  - Signal GainNode carries the on/off morse envelope
 *  - Master GainNode carries signal strength (volume)
 *  - RAF-based look-ahead scheduler (no setTimeout drift)
 *
 * Bug fixes vs v2:
 *  - cancelScheduledValues() called before every new pattern → no double-envelope
 *  - _schedulingLock flag prevents RAF + update() double-schedule race
 *  - Hysteresis on signal threshold (rise: 0.04, fall: 0.015) → no flicker
 *  - stop() + immediate play() safe: new pattern starts 100ms after stop
 *  - Fox-code switch: old scheduled events cancelled before new ones added
 */

"use strict";

class AudioEngine {
    constructor() {
        /** @type {AudioContext|null} */
        this.ctx          = null;
        /** @type {OscillatorNode|null} */
        this._osc         = null;
        /** @type {GainNode|null} morse envelope (0/1) */
        this._sigGain     = null;
        /** @type {GainNode|null} signal strength volume */
        this._masterGain  = null;

        this._isInitialized  = false;
        this._isPlaying      = false;

        this._currentFoxCode = null;
        this._currentVolume  = 0;

        /** Absolute AudioContext time where the NEXT pattern begins */
        this._nextPatternTime = 0;

        /** RAF handle */
        this._rafHandle   = null;
        /** Look-ahead window in seconds */
        this._lookAhead   = 0.35;

        /**
         * Lock to prevent RAF tick and external call scheduling simultaneously.
         * Only one _schedulePattern() runs per scheduler cycle.
         */
        this._schedulingLock = false;

        /**
         * Hysteresis thresholds so we don't toggle audio on every frame
         * at the signal boundary.
         */
        this._THRESHOLD_ON  = 0.04;  // signal must be ABOVE this to start
        this._THRESHOLD_OFF = 0.015; // signal must drop BELOW this to stop

        /** True when signal is currently above threshold */
        this._signalActive = false;
    }

    // ─── Init ────────────────────────────────────────────────────────────────

    /**
     * Create and wire the audio graph.
     * Must be called from a user-gesture (click / keydown).
     */
    init() {
        if (this._isInitialized) {
            if (this.ctx.state === 'suspended') this.ctx.resume();
            return;
        }

        this.ctx = new (window.AudioContext || window.webkitAudioContext)();

        // Master gain — controlled by signal strength
        this._masterGain = this.ctx.createGain();
        this._masterGain.gain.value = 0;          // start silent
        this._masterGain.connect(this.ctx.destination);

        // Signal (envelope) gain — morse on/off
        this._sigGain = this.ctx.createGain();
        this._sigGain.gain.value = 0;
        this._sigGain.connect(this._masterGain);

        // Single persistent oscillator
        this._osc = this.ctx.createOscillator();
        this._osc.type = 'sine';
        this._osc.frequency.value = CONFIG.MORSE_FREQUENCY;
        this._osc.connect(this._sigGain);
        this._osc.start();

        this._isInitialized = true;
        console.log('[Audio] AudioContext created, sampleRate:', this.ctx.sampleRate);
    }

    // ─── Public API ──────────────────────────────────────────────────────────

    /**
     * Called every frame with the current dominant signal.
     * Handles hysteresis, start, stop, volume and fox-code switching.
     * This is the ONLY method main.js needs to call — replaces separate
     * play() / update() / stop() calls from the game loop.
     *
     * @param {string|null} foxCode  dominant fox code, or null if no signal
     * @param {number}      signal   0–1 signal strength
     */
    tick(foxCode, signal) {
        if (!this._isInitialized) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();

        // ── Hysteresis ───────────────────────────────────────────────────────
        if (!this._signalActive && signal >= this._THRESHOLD_ON) {
            this._signalActive = true;
        } else if (this._signalActive && signal < this._THRESHOLD_OFF) {
            this._signalActive = false;
        }

        if (!this._signalActive || !foxCode) {
            // Fade out and stop
            if (this._isPlaying) this._stopInternal();
            return;
        }

        // ── Start or switch ──────────────────────────────────────────────────
        if (!this._isPlaying) {
            this._startInternal(foxCode, signal);
            return;
        }

        // Fox code changed → cancel old envelope, restart
        if (foxCode !== this._currentFoxCode) {
            this._cancelAndRestart(foxCode, signal);
            return;
        }

        // Same fox → just update volume
        this._currentVolume = signal;
        this._applyVolume(signal);
    }

    /**
     * Hard stop — called when leaving receiver mode.
     */
    stop() {
        this._signalActive = false;
        this._stopInternal();
    }

    // ─── Internal ────────────────────────────────────────────────────────────

    _startInternal(foxCode, signal) {
        this._currentFoxCode  = foxCode;
        this._currentVolume   = signal;
        this._isPlaying       = true;
        this._nextPatternTime = this.ctx.currentTime + 0.06;

        this._applyVolume(signal);
        this._cancelGainEvents();          // clean slate
        this._schedulePattern();
        this._startRAF();

        console.log('[Audio] Start:', foxCode, 'vol:', signal.toFixed(2));
    }

    _stopInternal() {
        if (!this._isPlaying) return;
        this._isPlaying      = false;
        this._currentFoxCode = null;

        if (this._rafHandle) {
            cancelAnimationFrame(this._rafHandle);
            this._rafHandle = null;
        }

        if (this._sigGain && this.ctx) {
            this._cancelGainEvents();
            this._sigGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.015);
        }

        this._applyVolume(0);
    }

    _cancelAndRestart(foxCode, signal) {
        // Cancel all pending envelope events
        this._cancelGainEvents();
        // Small gap so the old tone decays cleanly
        this._currentFoxCode  = foxCode;
        this._currentVolume   = signal;
        this._nextPatternTime = this.ctx.currentTime + 0.08;

        this._applyVolume(signal);
        this._schedulePattern();
        // RAF is already running
    }

    // ─── Scheduler ───────────────────────────────────────────────────────────

    _startRAF() {
        if (this._rafHandle) cancelAnimationFrame(this._rafHandle);

        const tick = () => {
            if (!this._isPlaying) return;

            if (!this._schedulingLock &&
                this._nextPatternTime < this.ctx.currentTime + this._lookAhead) {
                this._schedulingLock = true;
                this._schedulePattern();
                this._schedulingLock = false;
            }

            this._rafHandle = requestAnimationFrame(tick);
        };

        this._rafHandle = requestAnimationFrame(tick);
    }

    /**
     * Schedule the full morse pattern starting at this._nextPatternTime.
     * Uses gain.setValueAtTime / linearRampToValueAtTime for sample-accurate
     * on/off keying with 5ms soft edges.
     *
     * Advances this._nextPatternTime past the pattern + repeat pause.
     */
    _schedulePattern() {
        if (!this._currentFoxCode) return;

        const pattern = getFoxPattern(this._currentFoxCode);
        if (!pattern || pattern.length === 0) return;

        const unit  = CONFIG.MORSE_UNIT_MS / 1000;   // seconds per dit
        const ramp  = 0.005;                          // 5ms soft key edge
        const gain  = this._sigGain.gain;

        // Duration map (in units)
        const dur = {
            [SYM.DIT]: 1,
            [SYM.DAH]: 3,
            [SYM.EG]:  1,
            [SYM.CG]:  3,
            [SYM.WG]:  7,
        };

        let t = this._nextPatternTime;

        for (const sym of pattern) {
            const d = (dur[sym] || 1) * unit;

            if (sym === SYM.DIT || sym === SYM.DAH) {
                // Soft on
                gain.setValueAtTime(0, t);
                gain.linearRampToValueAtTime(1, t + ramp);
                // Hold
                if (d > ramp * 2) {
                    gain.setValueAtTime(1, t + d - ramp);
                }
                // Soft off
                gain.linearRampToValueAtTime(0, t + d);
            }
            // Silences: no events needed — gain stays at 0

            t += d;
        }

        // Next pattern starts after silence (repeat pause)
        this._nextPatternTime = t + (CONFIG.MORSE_REPEAT_PAUSE / 1000);
    }

    /** Cancel all future events on the signal gain. */
    _cancelGainEvents() {
        if (!this._sigGain || !this.ctx) return;
        const t = this.ctx.currentTime;
        this._sigGain.gain.cancelScheduledValues(t);
        this._sigGain.gain.setValueAtTime(0, t);
    }

    /**
     * Smoothly set master volume.
     * @param {number} vol 0–1 signal strength
     */
    _applyVolume(vol) {
        if (!this._masterGain || !this.ctx) return;
        const target = vol * CONFIG.AUDIO_MAX_VOLUME;
        this._masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.06);
    }

    // ─── Getters ─────────────────────────────────────────────────────────────
    get isPlaying()     { return this._isPlaying;     }
    get isInitialized() { return this._isInitialized; }
}

// Singleton
const audioEngine = new AudioEngine();
