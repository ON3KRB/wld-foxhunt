/**
 * config.js - Global game configuration constants
 * WLD FoxWave ARDF - Amateur Radio Direction Finding Fox Hunt
 * WLD Radio Amateur Club
 */

"use strict";

const CONFIG = {
    // ─── World Dimensions ──────────────────────────────────────────────────
    WORLD_WIDTH:  80,   // tiles wide
    WORLD_HEIGHT: 60,   // tiles tall

    // ─── Tile Rendering ────────────────────────────────────────────────────
    TILE_SIZE_MAIN: 56,   // px per tile in main game view
    TILE_SIZE_MAP:   8,   // px per tile in minimap overview

    // ─── Player ────────────────────────────────────────────────────────────
    PLAYER_START_X:    5,   // starting tile X
    PLAYER_START_Y:   54,   // starting tile Y
    PLAYER_MOVE_DELAY: 160, // ms between tile steps (walking speed)

    // ─── Fox Beacons ───────────────────────────────────────────────────────
    FOX_COUNT:                     5,
    FOX_DETECTION_RADIUS:        2.8,  // tiles — proximity to "find" a fox
    FOX_AUDIO_RADIUS:             22,  // tiles — max range for audio signal
    FOX_MIN_DIST_FROM_START:      12,  // tiles — minimum spawn distance from start
    FOX_MIN_DIST_FROM_EACH_OTHER:  9,  // tiles — minimum distance between foxes

    // ARDF standard fox identification codes
    FOX_CODES: ['MOE', 'MOI', 'MOS', 'MOH', 'MO5'],
    FOX_COLORS: ['#ff4d4d', '#ffcc00', '#44ff88', '#44aaff', '#ff44ff'],

    // ─── Receiver / Compass ────────────────────────────────────────────────
    RECEIVER_ROTATE_STEP: 5,    // degrees per arrow key press
    RECEIVER_BEAMWIDTH:   55,   // degrees half-beamwidth (half-power point)

    // ─── Morse Code Audio ──────────────────────────────────────────────────
    MORSE_UNIT_MS:      85,    // ms per dit  (~12 WPM)
    MORSE_FREQUENCY:   700,    // Hz — classic CW sidetone
    MORSE_REPEAT_PAUSE: 2200,  // ms pause after complete pattern

    // ─── Bearing Line Colors ───────────────────────────────────────────────
    BEARING_COLORS: [
        '#ff4444', '#44ff88', '#4499ff',
        '#ffcc00', '#ff44ff', '#44ffcc',
        '#ff8800', '#88ff00', '#ff0088', '#00ccff'
    ],

    // ─── Audio ─────────────────────────────────────────────────────────────
    AUDIO_MAX_VOLUME: 0.75,

    // ─── Game ──────────────────────────────────────────────────────────────
    MAX_GAME_TIME_MS: 3_600_000,  // 1 hour hard cap

    // ─── Park Feature Coordinates (tiles) ──────────────────────────────────
    // Used by renderer for decorative labels / icons
    FEATURES: {
        tent:       { x: 5,  y: 55, label: 'WLD Tent' },
        fountain:   { x: 49, y: 22, label: 'Fontein'  },
        playground: { x: 11, y: 11, label: 'Speeltuin'},
        cafe:       { x: 68, y: 48, label: 'Brasserie'},
        pond_upper: { x: 10, y: 22, label: 'Vijver'   },
        pond_lower: { x: 10, y: 35, label: 'Vijver'   },
        zoo:        { x: 68, y: 11, label: 'Dierentuin'},
        train_stop: { x: 39, y:  5, label: '🚂 Trein' },
    },
};

// ─── Tile Type Enum ─────────────────────────────────────────────────────────
const TILE = {
    GRASS:       0,
    PATH:        1,
    TREE:        2,
    WATER:       3,
    BUILDING:    4,
    PLAYGROUND:  5,
    FOUNTAIN:    6,
    TRAIN:       7,
    ZOO:         8,
    START:       9,
    DENSE_TREE: 10,
    FLOWER:     11,
    SHRUB:      12,
};

// Tiles the player is allowed to walk on
const WALKABLE_TILES = new Set([
    TILE.PATH, TILE.TRAIN, TILE.START
]);

// ─── Game State Enum ────────────────────────────────────────────────────────
const STATE = {
    SPLASH:       'splash',
    REGISTRATION: 'registration',
    BRIEFING:     'briefing',
    HUNTING:      'hunting',
    RECEIVER:     'receiver',
    MAP_VIEW:     'map_view',
    FINISHED:     'finished',
    CERTIFICATE:  'certificate',
};
