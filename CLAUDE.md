# CLAUDE.md

## Rule

After every change to the game, update this file in the same change so it still describes the code (map legend, mechanics, architecture, commands).

## What this is

Browser port (three.js + Vite, plain JS modules, no physics engine) of the Godot game in `../petro3d` ("Counter-Hamster 3D"). Gameplay, constants, maps and AI are ported 1:1; when the Godot game changes, re-run `npm run assets` and port the matching script. The map format, legend and rules are documented in `../petro3d/CLAUDE.md`; the map files in `src/maps/` are copies of `../petro3d/maps/`.

## Commands

```bash
npm run dev       # vite dev server; /?debug skips pointer lock and exposes window.cs = { Game, world, THREE, Input, Audio, renderer, hud }
npm run build     # dist/, static, relative paths
npm run check     # tools/check.mjs: every map (markers, sizes, slopes, reachability) + collision/raycast/flow-field-walk tests
npm run assets    # tools/convert-assets.sh: PNG -> WebP, WAV -> mono 32 kHz WAV, FBX -> weapons.json/.bin, copies maps into src/maps
```

`tools/bot-test.js` is an aimbot that plays whole matches in the page: with the dev server running, open `/?debug` and run `eval(await (await fetch('/tools/bot-test.js')).text())` in the console (or through the browser tool); it returns a JSON report (rounds, kills, kinds seen, errors). Run it on all maps after touching game logic.

## Architecture (`src/`)

- `data.js` constants (metres, `WEAPONS`, `HAMSTER_KINDS`, ...). Keys are `KeyboardEvent.code` strings.
- `level.js` pure map logic (no DOM): parse, heights/slopes, `heightAt`, `footing`, `linked`, BFS `flowField`, `steer`, `touching`. Tiles are `[c, r]`; barrel fuses are keyed by `r * cols + c`.
- `collide.js` `Collision`: convex solids per tile for rays (`raycast(from, to, sightOnly)` with a tile DDA; `sightOnly` ignores sandbags; barrels are cylinders and come back as `hit.barrel`), and circle-vs-tile movement (`probe`, `moveCircle`, `support`): a tile blocks when its surface at the nearest point is higher than `feet + climb`, so jumping one step, stairs, ramps and crate tops work without a physics engine. Players use climb 0.3, hamsters and the King `MAX_CLIMB`.
- `levelMesh.js` builds the whole map as one vertex-coloured mesh (noise texture, trims, stairs, ramps) plus bombsite labels.
- `game.js` the `Game` singleton (port of `autoload/game.gd`): phase machine `title → buy → live → round_end → match_end`, rules, spawning, bomb, barrel fuses. `world.js` owns the scene, lights (sun with a player-following shadow frustum, fill, hemisphere, a few permanent point lights to avoid shader recompiles), entity lists (`hamsters` holds only living ones, corpses live in `corpses`) and the spawn/effect helpers.
- `player.js` input, movement, recoil, hitscan (ray vs world, hamster/king cylinders, pierce for the AWP) and the viewmodel; `entities/*.js` hamster, king, nut, grenade (own bounce physics via `raycast`), smoke, bomb, barrel.
- `effects.js` pooled instanced particles, decals, tracers, floating text, explosion light; `sky.js` the cloud sky shader; `audio.js` WebAudio (3D via `PannerNode`); `hud.js` DOM overlay plus a crosshair canvas and the radar; `assets.js` loads textures (computes each hamster's visible rect), weapon meshes, the canister and sounds; `main.js` renderer, fixed 120 Hz simulation step, pause while the pointer is unlocked.
- Fog uses Godot's exponential falloff (the `fog_fragment` chunk is patched in `main.js`). Light intensities are Godot energy × π.
- Differences from the Godot version: no SSAO/glow, decals are quads on the hit surface, crouch is Ctrl or C (browsers eat Ctrl+W), the game pauses when the mouse is released, fullscreen is the browser's (F11).
