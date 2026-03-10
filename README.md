# 🦊 WLD FoxWave ARDF — Vossenjacht Simulator

> **Amateur Radio Direction Finding game** built for the **WLD Radio Amateur Club**
> A fully browser-based ARDF fox-hunting simulation — no install, no backend.

![WLD FoxWave ARDF](assets/hunting.png)

---

## 🎮 What is this?

**WLD FoxWave ARDF** is a JavaScript-based simulation of the ARDF (Amateur Radio Direction Finding) sport, also known as *Vossenjacht* (Fox Hunting) in Dutch/Belgian radio amateur circles.

The player uses:
- A simulated **80m CW receiver** with a directional antenna
- A **compass rose** to read bearings
- A **park map** to draw bearing lines and triangulate fox positions
- Their legs to walk the paths and physically locate the 5 hidden beacons

---

## 🚀 GitHub Pages Deployment

### Option A — Upload directly
1. Fork or clone this repository
2. Go to **Settings → Pages**
3. Set source to **"Deploy from a branch"** → `main` → `/ (root)`
4. Your game is live at `https://<your-username>.github.io/<repo-name>/`

### Option B — GitHub Actions (recommended)
1. Push this folder to your repo root
2. Enable GitHub Pages from Settings
3. Done — no build step needed (pure HTML/CSS/JS)

---

## 📁 Project Structure

```
wld-foxhunt/
├── index.html              # Main page, overlays, canvas layout
├── css/
│   └── style.css           # Full game stylesheet (Orbitron + Share Tech Mono)
├── js/
│   ├── config.js           # Game constants, tile enums, state enum
│   ├── morse.js            # Morse code patterns for ARDF fox codes
│   ├── audio.js            # Web Audio API CW tone engine (sample-accurate)
│   ├── map.js              # Park tile grid builder (80×60 tiles)
│   ├── player.js           # Player state, movement, bearing lines
│   ├── beacons.js          # Fox beacon placement & signal computation
│   ├── receiver.js         # Compass/receiver panel renderer
│   ├── renderer.js         # Main park world renderer (Canvas 2D)
│   ├── mapView.js          # Map overview + bearing line UI
│   ├── ui.js               # Info panel, overlays, fox log
│   ├── certificate.js      # Finish certificate canvas generator
│   └── main.js             # Game loop, input handler, state machine
└── assets/
    ├── wld-logo.png        # WLD Radio Amateur Club logo
    ├── fox.png             # Fox/vos ARDF mascot
    ├── start-stop.png      # WLD Start/Stop timing machine photo
    └── hunting.png         # ARDF banner illustration
```

---

## 🎯 How to Play

| Key | Action |
|-----|--------|
| **H** | Start hunting (starts the timer) |
| **R** | Toggle receiver / compass mode |
| **M** | Toggle map / bearing line mode |
| **↑ ↓ ← →** | Walk along park paths |
| **← →** *(receiver mode)* | Rotate the directional antenna |
| **0-9 + Enter** *(map mode)* | Enter a bearing and draw a line |
| **Backspace** *(map mode)* | Delete last bearing digit |
| **✕** *(map mode)* | Delete a bearing line |

### Game flow
1. **Register** at the WLD tent with your name and callsign
2. Read the **briefing** and press **H** to start
3. Press **R** to activate the receiver — rotate with arrow keys until you hear CW morse
4. The louder the signal, the more on-target your bearing is
5. Press **M** to open the map, type a bearing (e.g. `045`) and press **Enter** — a coloured line appears
6. Walk to the intersection of your bearing lines — the fox is there!
7. Walk close to a beacon to **find** it (golden glow + flash notification)
8. Find all **5 foxes** (MOE · MOI · MOS · MOH · MO5) then return to the **WLD tent**
9. Your time is registered and a **certificate** is generated for download

---

## 🏗 Technical Notes

### Architecture
- **Pure vanilla JS** — no frameworks, no bundler
- **Canvas 2D** for all rendering (park world + compass + minimap)
- **Web Audio API** for sample-accurate CW morse tone generation
- Modular file structure with documented functions in English
- Tile-based world (80×60 grid, 56px/tile in main view, 8px/tile in minimap)

### Signal model
The ARDF directional receiver is simulated with a **cosine-squared beam pattern**:

```
signal = cos²(angleDiff / beamwidth) × (1 - distance/maxRange)²
```

Only the dominant signal (capture effect) plays audio at any time.

### Fox placement
Foxes are placed randomly on walkable tiles at game start, with:
- Minimum distance from start: **12 tiles**
- Minimum distance between foxes: **9 tiles**

---

## 🔊 Audio / Browser Policy

Web Audio requires a user gesture before starting. The first keypress or button click automatically initialises the audio context — no extra action needed.

---

## 🏆 ARDF Fox Codes (standard)

| Fox | Code | Morse |
|-----|------|-------|
| 1   | MOE  | `— — — · · ·` wait `·` |
| 2   | MOI  | `— — — · · ·` wait `· ·` |
| 3   | MOS  | `— — — · · ·` wait `· · ·` |
| 4   | MOH  | `— — — · · ·` wait `· · · ·` |
| 5   | MO5  | `— — — · · ·` wait `· · · · ·` |

---

## 📜 Credits

- **WLD Radio Amateur Club** — concept & branding
- Game design & development: WLD FoxWave ARDF project
- ARDF standard: IARU Region 1 regulations

---

## 📄 License

MIT — free to use, adapt and redistribute with attribution to WLD Radio Amateur Club.
