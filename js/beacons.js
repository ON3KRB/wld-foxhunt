/**
 * beacons.js - Fox beacon placement, signal computation, detection
 * WLD FoxWave ARDF
 *
 * Each fox beacon:
 *   - Is placed on a random walkable tile at game start
 *   - Transmits its ARDF code (MOE, MOI, …) continuously
 *   - Emits a directional RF signal simulated by:
 *       signal = directionScore(bearing) × distanceScore(distance)
 *   - Is "found" when the player walks within FOX_DETECTION_RADIUS tiles
 */

"use strict";

/**
 * @typedef {Object} Beacon
 * @property {string}  code     ARDF code e.g. 'MOE'
 * @property {number}  index    0-based index (0 = MOE … 4 = MO5)
 * @property {number}  x        tile X position
 * @property {number}  y        tile Y position
 * @property {string}  color    display color
 * @property {boolean} found    whether the player has found this beacon
 */

/** @type {Beacon[]} */
let beacons = [];

// ─── Placement ───────────────────────────────────────────────────────────────

/**
 * Randomly place all fox beacons on the map.
 * Called once at game start (after buildParkMap).
 */
function placeBeacons() {
    beacons = [];

    for (let i = 0; i < CONFIG.FOX_COUNT; i++) {
        const code  = CONFIG.FOX_CODES[i];
        const color = CONFIG.FOX_COLORS[i];

        // Get valid positions given already-placed beacons
        const valid = getValidFoxPositions(
            CONFIG.FOX_MIN_DIST_FROM_START,
            beacons.map(b => ({ x: b.x, y: b.y })),
            CONFIG.FOX_MIN_DIST_FROM_EACH_OTHER
        );

        if (valid.length === 0) {
            console.warn(`Beacon ${code}: no valid position found, relaxing constraints`);
            // Fall back: any walkable tile far enough from start
            const fallback = walkableTiles.filter(t =>
                Math.hypot(t.x - CONFIG.PLAYER_START_X, t.y - CONFIG.PLAYER_START_Y) > 6
            );
            const pos = fallback[Math.floor(Math.random() * fallback.length)];
            beacons.push({ code, index: i, x: pos.x, y: pos.y, color, found: false });
        } else {
            const pos = valid[Math.floor(Math.random() * valid.length)];
            beacons.push({ code, index: i, x: pos.x, y: pos.y, color, found: false });
        }
    }

    console.log('[Beacons] Placed:', beacons.map(b => `${b.code}@(${b.x},${b.y})`).join(' '));
}

// ─── Signal Computation ──────────────────────────────────────────────────────

/**
 * Compute the signal strength received from a beacon at the player's
 * current position with a given receiver bearing.
 *
 * Model:
 *   bearingToBacon = atan2(dx, -dy)  [north-up bearing]
 *   angleDiff      = |receiverBearing - bearingToBeacon| (wrapped to ±180°)
 *   dirScore       = max(0, cos(angleDiff))^2 × (beamwidth factor)
 *   distScore      = max(0, 1 - distance / MAX_RANGE)^2
 *   signal         = dirScore × distScore
 *
 * @param {Beacon} beacon
 * @param {number} playerX
 * @param {number} playerY
 * @param {number} receiverBearing  degrees 0=N, 90=E …
 * @returns {number} 0–1 signal strength
 */
function computeSignal(beacon, playerX, playerY, receiverBearing) {
    const dx = beacon.x - playerX;
    const dy = beacon.y - playerY;
    const distance = Math.hypot(dx, dy);

    if (distance > CONFIG.FOX_AUDIO_RADIUS) return 0;

    // Bearing FROM player TO beacon (north-up degrees)
    const bearingToBeacon = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;

    // Angular difference (±180°)
    let angleDiff = receiverBearing - bearingToBeacon;
    angleDiff = ((angleDiff + 180) % 360 + 360) % 360 - 180; // wrap to [-180, 180]

    // Directional gain: cosine squared model with beamwidth
    const halfBeam = CONFIG.RECEIVER_BEAMWIDTH;
    let dirScore;
    if (Math.abs(angleDiff) >= halfBeam) {
        dirScore = 0;
    } else {
        dirScore = Math.cos(angleDiff * Math.PI / (2 * halfBeam));
        dirScore = dirScore * dirScore;
    }

    // Distance attenuation: quadratic falloff
    const normDist = distance / CONFIG.FOX_AUDIO_RADIUS;
    const distScore = Math.max(0, 1 - normDist * normDist);

    return dirScore * distScore;
}

/**
 * Compute the bearing FROM the player TO a beacon (degrees, 0=N).
 * @param {Beacon} beacon
 * @param {number} playerX
 * @param {number} playerY
 * @returns {number}
 */
function bearingToBeacon(beacon, playerX, playerY) {
    const dx = beacon.x - playerX;
    const dy = beacon.y - playerY;
    return (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
}

/**
 * Return the beacon with the highest signal strength (capture effect).
 * Returns null if no signal is receivable.
 * @param {number} playerX
 * @param {number} playerY
 * @param {number} receiverBearing
 * @returns {{ beacon: Beacon, signal: number }|null}
 */
function getDominantSignal(playerX, playerY, receiverBearing) {
    let best = null;
    let bestStrength = 0.02; // minimum threshold

    for (const beacon of beacons) {
        if (beacon.found) continue;
        const s = computeSignal(beacon, playerX, playerY, receiverBearing);
        if (s > bestStrength) {
            bestStrength = s;
            best = { beacon, signal: s };
        }
    }
    return best;
}

/**
 * Get all signal strengths from unfound beacons.
 * @param {number} playerX
 * @param {number} playerY
 * @param {number} receiverBearing
 * @returns {{ beacon: Beacon, signal: number }[]}
 */
function getAllSignals(playerX, playerY, receiverBearing) {
    return beacons
        .filter(b => !b.found)
        .map(b => ({ beacon: b, signal: computeSignal(b, playerX, playerY, receiverBearing) }))
        .sort((a, b) => b.signal - a.signal);
}

// ─── Detection ───────────────────────────────────────────────────────────────

/**
 * Check if the player is within detection radius of any unfound beacon.
 * Marks found beacons and returns the found beacon (or null).
 * @param {number} playerX
 * @param {number} playerY
 * @returns {Beacon|null}
 */
function checkFoxDetection(playerX, playerY) {
    for (const beacon of beacons) {
        if (beacon.found) continue;
        const dist = Math.hypot(beacon.x - playerX, beacon.y - playerY);
        if (dist <= CONFIG.FOX_DETECTION_RADIUS) {
            beacon.found = true;
            Player.findFox(beacon.code);
            return beacon;
        }
    }
    return null;
}

// ─── Getters ─────────────────────────────────────────────────────────────────

/** @returns {Beacon[]} */
function getBeacons() { return beacons; }

/** @returns {Beacon[]} */
function getUnfoundBeacons() { return beacons.filter(b => !b.found); }

/** @returns {Beacon[]} */
function getFoundBeacons() { return beacons.filter(b => b.found); }
