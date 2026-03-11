/**
 * config.js - Global game configuration
 * WLD FoxWave ARDF — WLD Radio Amateur Club
 */
"use strict";

const CONFIG = {
    WORLD_WIDTH:  80,
    WORLD_HEIGHT: 60,

    TILE_SIZE_MAIN: 40,   // 40px tiles — paths clearly visible
    TILE_SIZE_MAP:   8,

    PLAYER_START_X:    5,
    PLAYER_START_Y:   54,
    PLAYER_MOVE_DELAY: 160,

    FOX_COUNT:                     5,   // overridden at game start (3 or 5)
    FOX_DETECTION_RADIUS:        2.5,
    FOX_AUDIO_RADIUS:             20,
    FOX_MIN_DIST_FROM_START:      10,
    FOX_MIN_DIST_FROM_EACH_OTHER:  8,

    FOX_CODES:  ['MOE','MOI','MOS','MOH','MO5'],
    FOX_COLORS: ['#ff5555','#ffcc00','#44ff88','#44aaff','#ff66ff'],

    RECEIVER_ROTATE_STEP: 5,
    RECEIVER_BEAMWIDTH:   55,

    // Morse — 90ms per dit, 700 Hz CW tone
    MORSE_UNIT_MS:      90,
    MORSE_FREQUENCY:   700,
    MORSE_REPEAT_PAUSE: 2200,

    // ON4BB VHF hint system
    ON4BB_CALLSIGN: 'ON4BB',
    WLD_VHF_FREQ:   '145.225',
    HINT_COOLDOWN_MS: 15000,

    BEARING_COLORS: [
        '#ff4444','#44ff88','#4499ff','#ffcc00','#ff44ff',
        '#44ffcc','#ff8800','#88ff00','#ff0088','#00ccff'
    ],

    AUDIO_MAX_VOLUME: 0.85,

    NPC_COUNT:      3,
    NPC_CALLSIGNS:  ['ON3AB','ON4XY','OT5WLD'],
    NPC_MOVE_DELAY: 380,
};

const TILE = {
    GRASS:0, PATH:1, TREE:2, WATER:3, BUILDING:4,
    PLAYGROUND:5, FOUNTAIN:6, TRAIN:7, ZOO:8, START:9,
    DENSE_TREE:10, FLOWER:11, SHRUB:12,
};

const WALKABLE_TILES = new Set([TILE.PATH, TILE.TRAIN, TILE.START]);

const STATE = {
    SPLASH:'splash', REGISTRATION:'registration', BRIEFING:'briefing',
    HUNTING:'hunting', RECEIVER:'receiver', MAP_VIEW:'map_view',
    FINISHED:'finished', CERTIFICATE:'certificate',
};
