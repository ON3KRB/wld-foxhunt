/**
 * map.js - Park map data builder and walkability utilities
 * WLD FoxWave ARDF
 *
 * Tile grid: CONFIG.WORLD_WIDTH × CONFIG.WORLD_HEIGHT
 * Origin (0,0) = top-left corner.
 * Coordinates are integer tile indices.
 *
 * Park layout (80 × 60 tiles):
 *
 *   Outer ring paths  : y=5, y=54, x=3, x=76
 *   Upper cross paths : y=16, y=28, y=42
 *   Vertical grid     : x=18, x=39, x=60
 *
 *   Features (approximate):
 *     WLD Tent       : x=3-9, y=55-58 (south-west)
 *     Playground     : x=4-17, y=6-15 (north-west cell)
 *     Fountain plaza : x=40-59, y=17-27 (north-central cell)
 *     Upper Lake     : x=4-17, y=17-27 (west-central cell)
 *     Lower Lake     : x=4-17, y=29-41 (west-lower cell)
 *     Zoo            : x=61-75, y=6-15 (north-east cell)
 *     Brasserie/Café : x=61-75, y=43-53 (south-east cell)
 *     Flower gardens : remaining north cells
 *     Forest areas   : remaining interior cells
 *
 *   Tourist train  follows the outer ring path.
 */

"use strict";

/** @type {number[][]} 2-D tile array [row][col] */
let parkMap = [];

/** @type {{x:number,y:number}[]} All walkable tile positions (for fox placement) */
let walkableTiles = [];

/**
 * Build the park tile map and populate walkableTiles.
 * Called once during game initialization.
 */
function buildParkMap() {
    const W = CONFIG.WORLD_WIDTH;
    const H = CONFIG.WORLD_HEIGHT;

    // ── Helpers ──────────────────────────────────────────────────────────────
    const grid = [];
    for (let y = 0; y < H; y++) grid.push(new Array(W).fill(TILE.GRASS));

    const set = (x, y, t) => {
        if (x >= 0 && x < W && y >= 0 && y < H) grid[y][x] = t;
    };

    const hline = (x1, x2, y, t = TILE.PATH) => {
        for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) set(x, y, t);
    };

    const vline = (y1, y2, x, t = TILE.PATH) => {
        for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) set(x, y, t);
    };

    const rect = (x1, y1, x2, y2, t) => {
        for (let y = y1; y <= y2; y++)
            for (let x = x1; x <= x2; x++)
                set(x, y, t);
    };

    // ── 1. Outer border — dense trees ────────────────────────────────────────
    rect(0, 0, W - 1, H - 1, TILE.DENSE_TREE);
    rect(2, 2, W - 3, H - 3, TILE.GRASS);

    // ── 2. Main path grid ────────────────────────────────────────────────────
    // Outer ring
    hline(3, 76, 5,  TILE.TRAIN);    // top  (train route)
    hline(3, 76, 54, TILE.TRAIN);    // bottom (train route)
    vline(5, 54,  3, TILE.TRAIN);    // left   (train route)
    vline(5, 54, 76, TILE.TRAIN);    // right  (train route)

    // Interior grid
    hline(3, 76, 16);   // upper horizontal
    hline(3, 76, 28);   // centre horizontal
    hline(3, 76, 42);   // lower horizontal
    vline(5, 54, 18);   // left inner vertical
    vline(5, 54, 39);   // centre vertical
    vline(5, 54, 60);   // right inner vertical

    // ── 3. Features ──────────────────────────────────────────────────────────

    // --- Playground (NW cell) ------------------------------------------------
    rect(4, 6, 17, 15, TILE.PLAYGROUND);

    // --- Flower gardens (N centre cells) -------------------------------------
    rect(19, 6, 38, 15, TILE.FLOWER);
    rect(40, 6, 59, 15, TILE.FLOWER);

    // --- Zoo (NE cell) -------------------------------------------------------
    rect(61, 6, 75, 15, TILE.ZOO);

    // --- Upper Lake (W-centre cell) ------------------------------------------
    rect(4, 17, 17, 27, TILE.WATER);

    // --- Lower Lake (W-lower cell) -------------------------------------------
    rect(4, 29, 17, 41, TILE.WATER);
    // Shore path around lakes (west side via x=3 and east via x=18 already set)
    // Add mid-lake paths
    hline(3, 18, 22);   // path across upper lake (bridge/dock feel)
    hline(3, 18, 35);   // path across lower lake

    // --- Fountain Plaza (N-centre-right cell) --------------------------------
    // Fountain basin
    rect(43, 18, 55, 26, TILE.FOUNTAIN);
    // Cross paths through plaza
    hline(39, 60, 22);                  // H access
    vline(16, 28, 49);                  // V access
    // Fountain center (decorative, blocks single tile)
    set(49, 22, TILE.FOUNTAIN);

    // --- Forest areas (interior cells) ---------------------------------------
    rect(19, 17, 38, 27, TILE.TREE);   // centre-left upper
    rect(19, 29, 38, 41, TILE.TREE);   // centre-left lower
    rect(40, 29, 59, 41, TILE.TREE);   // centre-right lower
    rect(61, 17, 75, 27, TILE.TREE);   // right upper
    rect(61, 29, 75, 41, TILE.TREE);   // right lower
    rect(19, 43, 38, 53, TILE.TREE);   // SW-centre lower
    rect(40, 43, 59, 53, TILE.TREE);   // SE-centre lower

    // Shrub decorations on grass near paths
    for (let x = 20; x < 38; x += 5) set(x, 27, TILE.SHRUB);
    for (let x = 41; x < 59; x += 5) set(x, 42, TILE.SHRUB);

    // --- Café / Brasserie (SE cell) ------------------------------------------
    rect(61, 43, 75, 53, TILE.BUILDING);
    // Café terrace path
    hline(60, 61, 48);
    vline(43, 48, 61);

    // --- WLD Tent (SW corner, south of bottom path) --------------------------
    rect(3, 55, 10, 58, TILE.BUILDING);

    // ── 4. Restore all paths that features may have overwritten ──────────────
    hline(3, 76,  5, TILE.TRAIN);
    hline(3, 76, 54, TILE.TRAIN);
    vline(5, 54,  3, TILE.TRAIN);
    vline(5, 54, 76, TILE.TRAIN);

    hline(3, 76, 16);
    hline(3, 76, 28);
    hline(3, 76, 42);
    vline(5, 54, 18);
    vline(5, 54, 39);
    vline(5, 54, 60);

    hline(39, 60, 22);
    vline(16, 28, 49);
    hline(3, 18, 22);
    hline(3, 18, 35);

    // ── 5. Start position ────────────────────────────────────────────────────
    set(CONFIG.PLAYER_START_X,     CONFIG.PLAYER_START_Y, TILE.START);
    set(CONFIG.PLAYER_START_X + 1, CONFIG.PLAYER_START_Y, TILE.START);

    // ── 6. Commit ────────────────────────────────────────────────────────────
    parkMap = grid;

    // Collect all walkable tiles for fox placement
    walkableTiles = [];
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            if (WALKABLE_TILES.has(grid[y][x])) {
                walkableTiles.push({ x, y });
            }
        }
    }
}

// ─── Public accessors ────────────────────────────────────────────────────────

/**
 * Get the tile type at position (x, y).
 * Returns TILE.DENSE_TREE for out-of-bounds.
 * @param {number} x
 * @param {number} y
 * @returns {number} TILE constant
 */
function getTile(x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi < 0 || xi >= CONFIG.WORLD_WIDTH || yi < 0 || yi >= CONFIG.WORLD_HEIGHT) {
        return TILE.DENSE_TREE;
    }
    return parkMap[yi][xi];
}

/**
 * Returns true if the tile at (x, y) is walkable.
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
function isWalkable(x, y) {
    return WALKABLE_TILES.has(getTile(x, y));
}

/**
 * Return a list of walkable tile positions suitable for fox placement,
 * filtered by minimum distance from start and existing placements.
 * @param {number} minDistFromStart
 * @param {{x:number,y:number}[]} existing  already placed positions
 * @param {number} minDistFromExisting
 * @returns {{x:number,y:number}[]}
 */
function getValidFoxPositions(minDistFromStart, existing, minDistFromExisting) {
    const sx = CONFIG.PLAYER_START_X;
    const sy = CONFIG.PLAYER_START_Y;

    return walkableTiles.filter(tile => {
        // Distance from start
        const dStart = Math.hypot(tile.x - sx, tile.y - sy);
        if (dStart < minDistFromStart) return false;

        // Distance from existing foxes
        for (const e of existing) {
            if (Math.hypot(tile.x - e.x, tile.y - e.y) < minDistFromExisting) return false;
        }

        return true;
    });
}
