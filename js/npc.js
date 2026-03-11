/**
 * npc.js - NPC ARDF hunters roaming the park paths
 * WLD FoxWave ARDF
 *
 * NPCs walk randomly along walkable tiles, carrying directional antennas.
 * They appear with callsigns above their heads.
 */
"use strict";

/** @type {Array<{x,y,facing,callsign,color,_lastMove,_targetX,_targetY}>} */
let npcs = [];

const NPC_COLORS = ['#ff8844','#44ccff','#ff44aa','#88ff44'];

/**
 * Initialise NPC hunters at random walkable positions.
 * Called after buildParkMap().
 */
function initNPCs() {
    npcs = [];
    const spread = walkableTiles.filter(t =>
        Math.hypot(t.x - CONFIG.PLAYER_START_X, t.y - CONFIG.PLAYER_START_Y) > 8
    );

    for (let i = 0; i < CONFIG.NPC_COUNT; i++) {
        const pos = spread[Math.floor(Math.random() * spread.length)];
        npcs.push({
            x:         pos.x,
            y:         pos.y,
            facing:    [0, 90, 180, 270][Math.floor(Math.random() * 4)],
            callsign:  CONFIG.NPC_CALLSIGNS[i] || `ON${i+1}XX`,
            color:     NPC_COLORS[i % NPC_COLORS.length],
            _lastMove: 0,
            _steps:    0,          // steps in current direction
            _dir:      'right',
        });
    }
}

/**
 * Update all NPCs (called every frame with performance.now()).
 * @param {number} now
 */
function updateNPCs(now) {
    for (const npc of npcs) {
        if (now - npc._lastMove < CONFIG.NPC_MOVE_DELAY) continue;

        // Try to continue current direction; if blocked pick new one
        const dirs = ['up','down','left','right'];
        let moved = false;

        // Bias: continue same direction for a few steps
        npc._steps = (npc._steps || 0) + 1;
        const tryOrder = npc._steps < 6
            ? [npc._dir, ...dirs.filter(d => d !== npc._dir).sort(() => Math.random() - 0.5)]
            : dirs.sort(() => Math.random() - 0.5);

        for (const dir of tryOrder) {
            const nx = npc.x + (dir === 'right' ? 1 : dir === 'left' ? -1 : 0);
            const ny = npc.y + (dir === 'down'  ? 1 : dir === 'up'   ? -1 : 0);
            if (isWalkable(nx, ny)) {
                npc.x = nx; npc.y = ny;
                npc.facing = { up:0, right:90, down:180, left:270 }[dir];
                if (dir !== npc._dir) { npc._dir = dir; npc._steps = 0; }
                moved = true;
                break;
            }
        }

        npc._lastMove = now;
    }
}

/** @returns {Array} NPC array */
function getNPCs() { return npcs; }
