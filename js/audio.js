/**
 * audio.js - Web Audio API CW (morse) tone engine
 * WLD FoxWave ARDF
 *
 * Uses the Web Audio API scheduling system for sample-accurate morse timing.
 * Generates a sine-wave CW tone with smooth envelope to avoid clicks.
 * Volume is set per-playback based on signal strength (0–1).
 */

"use strict";

class AudioEngine {
    constructor() {
        /** @type {AudioContext|null} */
        this.ctx = null;
        /** @type {GainNode|null} */
        this.masterGain = null;

        this._isInitialized = false;
        this._isPlaying     = false;
        this._loopHandle    = null;   // setTimeout for repeat loop

        this._currentFoxCode   = null;
        this._currentVolume    = 0;
        this._scheduleAheadMs  = 150; // schedule this far ahead of playback
    }

    // ─── Initialization ───────────────────────────────────────────────────────

    /**
     * Must be called from a user-gesture handler (click/keydown) to satisfy
     * browser autoplay policy.
     */
    init() {
        if (this._isInitialized) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0;
        this.masterGain.connect(this.ctx.destination);
        this._isInitialized = true;
    }

    // ─── Public API ───────────────────────────────────────────────────────────

    /**
     * Start playing a fox morse code on loop.
     * @param {string} foxCode  e.g. 'MOE'
     * @param {number} volume   0–1 signal strength
     */
    play(foxCode, volume) {
        if (!this._isInitialized) this.init();
        if (this.ctx.state === 'suspended') this.ctx.resume();

        this._currentFoxCode = foxCode;
        this._currentVolume  = Math.max(0, Math.min(1, volume));

        if (!this._isPlaying) {
            this._isPlaying = true;
            this._scheduleLoop();
        }
    }

    /**
     * Smoothly update signal volume without interrupting the morse sequence.
     * @param {string} foxCode
     * @param {number} volume
     */
    update(foxCode, volume) {
        if (!this._isInitialized) return;
        const newVol = Math.max(0, Math.min(1, volume));

        // If fox changed, restart
        if (foxCode !== this._currentFoxCode) {
            this.stop();
            this.play(foxCode, newVol);
            return;
        }
        this._currentVolume  = newVol;
        this._currentFoxCode = foxCode;
    }

    /**
     * Stop the morse playback immediately.
     */
    stop() {
        this._isPlaying = false;
        if (this._loopHandle) {
            clearTimeout(this._loopHandle);
            this._loopHandle = null;
        }
        if (this.ctx) {
            this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
            this.masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
        }
    }

    // ─── Internal Scheduling ─────────────────────────────────────────────────

    /**
     * Schedule one full morse pattern and queue the next via setTimeout.
     */
    _scheduleLoop() {
        if (!this._isPlaying) return;

        const pattern  = getFoxPattern(this._currentFoxCode);
        const vol      = this._currentVolume * CONFIG.AUDIO_MAX_VOLUME;
        const unit     = CONFIG.MORSE_UNIT_MS / 1000; // seconds
        const startAt  = this.ctx.currentTime + (this._scheduleAheadMs / 1000);

        const endTime = this._schedulePattern(pattern, startAt, vol);

        // Total duration of this cycle in ms
        const cycleDuration = (endTime - startAt) * 1000
                            + CONFIG.MORSE_REPEAT_PAUSE;

        // Schedule next cycle
        this._loopHandle = setTimeout(() => this._scheduleLoop(), cycleDuration);
    }

    /**
     * Schedule a pattern of morse symbols starting at `startTime` (AudioContext time).
     * Returns the end time of the pattern.
     * @param {string[]} pattern
     * @param {number}   startTime
     * @param {number}   volume
     * @returns {number} end AudioContext time
     */
    _schedulePattern(pattern, startTime, volume) {
        const unit = CONFIG.MORSE_UNIT_MS / 1000;
        const unitDurations = {
            [SYM.DIT]: 1,
            [SYM.DAH]: 3,
            [SYM.EG]:  1,
            [SYM.CG]:  3,
            [SYM.WG]:  7,
        };

        let t = startTime;

        for (const sym of pattern) {
            const dur = (unitDurations[sym] || 1) * unit;

            if (sym === SYM.DIT || sym === SYM.DAH) {
                this._scheduleBeep(t, dur, volume);
            }
            // Silences (EG, CG, WG) need no scheduling — they are simply gaps
            t += dur;
        }

        return t;
    }

    /**
     * Schedule a single CW beep with soft attack/release to prevent clicks.
     * @param {number} startTime  AudioContext time
     * @param {number} duration   seconds
     * @param {number} volume     0–1
     */
    _scheduleBeep(startTime, duration, volume) {
        const ctx     = this.ctx;
        const freq    = CONFIG.MORSE_FREQUENCY;
        const ramp    = Math.min(0.006, duration * 0.1); // 6 ms envelope

        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type            = 'sine';
        osc.frequency.value = freq;
        osc.connect(gain);
        gain.connect(this.masterGain);

        // Smooth envelope
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(volume, startTime + ramp);
        gain.gain.setValueAtTime(volume, startTime + duration - ramp);
        gain.gain.linearRampToValueAtTime(0, startTime + duration);

        osc.start(startTime);
        osc.stop(startTime + duration + 0.01);
    }

    // ─── Getters ─────────────────────────────────────────────────────────────
    get isPlaying()     { return this._isPlaying;     }
    get isInitialized() { return this._isInitialized; }
}

// Singleton
const audioEngine = new AudioEngine();
