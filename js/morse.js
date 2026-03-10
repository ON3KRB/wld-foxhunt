/**
 * morse.js - Morse code patterns and ARDF fox identification
 * WLD FoxWave ARDF
 *
 * ARDF standard fox codes:
 *   MOE = M O E  →  -- --- .
 *   MOI = M O I  →  -- --- ..
 *   MOS = M O S  →  -- --- ...
 *   MOH = M O H  →  -- --- ....
 *   MO5 = M O 5  →  -- --- .....
 *
 * Timing (unit = CONFIG.MORSE_UNIT_MS):
 *   dit  = 1 unit
 *   dah  = 3 units
 *   element gap (eg) = 1 unit  (between dits/dahs in same char)
 *   char gap    (cg) = 3 units (between characters)
 *   word gap    (wg) = 7 units (between words / end of pattern)
 */

"use strict";

// ─── Symbol constants ────────────────────────────────────────────────────────
const SYM = {
    DIT: 'dit',
    DAH: 'dah',
    EG:  'eg',   // element gap (1 unit silence)
    CG:  'cg',   // character gap (3 units silence)
    WG:  'wg',   // word gap (7 units silence)
};

// ─── Basic character patterns (no gaps between elements) ─────────────────────
const CHAR_PATTERNS = {
    'M': [SYM.DAH, SYM.EG, SYM.DAH],
    'O': [SYM.DAH, SYM.EG, SYM.DAH, SYM.EG, SYM.DAH],
    'E': [SYM.DIT],
    'I': [SYM.DIT, SYM.EG, SYM.DIT],
    'S': [SYM.DIT, SYM.EG, SYM.DIT, SYM.EG, SYM.DIT],
    'H': [SYM.DIT, SYM.EG, SYM.DIT, SYM.EG, SYM.DIT, SYM.EG, SYM.DIT],
    '5': [SYM.DIT, SYM.EG, SYM.DIT, SYM.EG, SYM.DIT, SYM.EG, SYM.DIT, SYM.EG, SYM.DIT],
};

/**
 * Build a flat symbol array for a given string (e.g. "MOE")
 * Characters are separated by char gaps; pattern ends with word gap.
 * @param {string} text - Morse text to encode
 * @returns {string[]} Array of SYM constants
 */
function buildMorsePattern(text) {
    const result = [];
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (CHAR_PATTERNS[ch]) {
            result.push(...CHAR_PATTERNS[ch]);
        }
        if (i < text.length - 1) {
            result.push(SYM.CG);
        }
    }
    result.push(SYM.WG);
    return result;
}

/**
 * Calculate the total wall-clock duration (ms) of a symbol pattern.
 * @param {string[]} pattern
 * @param {number} unitMs
 * @returns {number} duration in milliseconds
 */
function patternDuration(pattern, unitMs) {
    const durations = {
        [SYM.DIT]: 1,
        [SYM.DAH]: 3,
        [SYM.EG]:  1,
        [SYM.CG]:  3,
        [SYM.WG]:  7,
    };
    return pattern.reduce((sum, sym) => sum + (durations[sym] || 0) * unitMs, 0);
}

/**
 * Human-readable morse string for display (dots and dashes).
 * @param {string[]} pattern
 * @returns {string}
 */
function patternToDisplay(pattern) {
    return pattern.map(s => {
        if (s === SYM.DIT) return '·';
        if (s === SYM.DAH) return '—';
        if (s === SYM.EG)  return '';
        if (s === SYM.CG)  return ' ';
        if (s === SYM.WG)  return '  ';
        return '';
    }).join('');
}

// ─── Pre-built fox patterns ──────────────────────────────────────────────────
const FOX_MORSE = {};
for (const code of CONFIG.FOX_CODES) {
    FOX_MORSE[code] = buildMorsePattern(code);
}

/**
 * Get the pattern for a specific fox code.
 * @param {string} code  e.g. 'MOE'
 * @returns {string[]}
 */
function getFoxPattern(code) {
    return FOX_MORSE[code] || [];
}

/**
 * Get a display string for a fox code.
 * @param {string} code
 * @returns {string}
 */
function getFoxDisplayMorse(code) {
    return patternToDisplay(getFoxPattern(code));
}
