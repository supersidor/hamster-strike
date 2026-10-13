# CLAUDE.md

## Rule

After every change to the game, update this file in the same change so it still describes the code (map legend, mechanics, architecture, commands).

## What this is

Browser port (three.js + Vite, plain JS modules, no physics engine) of the Godot game in `../petro3d` ("Counter-Hamster 3D"). Gameplay, constants, maps and AI are ported 1:1; when the Godot game changes, re-run `npm run assets` and port the matching script. The map format, legend and rules are documented in `../petro3d/CLAUDE.md`; the map files in `src/maps/` are copies of `../petro3d/maps/`.

## Commands

```bash
npm run dev       # vite dev server; /?debug skips pointer lock and exposes window.cs = { Game, world, THREE, Input, Audio, renderer, hud }
npm run build     # dist/, static, relative paths
npm run server    # node server/index.mjs on :8080 (online room + serves dist/); vite proxies /ws to it, so run both for online dev
npm run check     # tools/check.mjs (every map: markers, sizes, slopes, reachability, collision/raycast/flow-field-walk) + tools/net-test.mjs (headless 2-player room matches on every map)
npm run assets    # tools/convert-assets.sh: PNG -> WebP, WAV -> mono 32 kHz WAV, FBX -> weapons.json/.bin, copies maps into src/maps
```

A `Makefile` wraps these for local testing: `make dev` (solo), `make debug` (opens `/?debug`), `make online` (game server + vite together, opens `/?online`), `make serve` (build + production server on :8080), `make build`, `make check`, `make assets`; `make help` lists them.

## Deploy

Runs on the k3s homelab. A push triggers `.github/workflows/push.yaml` (`npm run check`, then a multi-arch image `supersidor/hamster-strike:<short sha>` on Docker Hub). The `Dockerfile` builds `dist/` with Node, then runs `node server/index.mjs` (port 8080) in `node:22-alpine`: it serves `dist/` (same cache headers as the old nginx) and the `/ws` WebSocket of the single online room. `chart/` is a minimal Helm chart (Deployment with `replicas: 1` and `Recreate`, because the room lives in memory; Service; Ingress at `hamster-strike.homelab` with 3600 s proxy timeouts for the WebSocket); the ArgoCD Application lives in `~/hobby/argocd/apps/services/hamster-strike.yaml` and passes `image.tag=$ARGOCD_APP_REVISION_SHORT`. The public hostname is added by hand in the Cloudflare tunnel dashboard, pointing at `http://hamster-strike.hamster-strike.svc.cluster.local:80` (the tunnel passes WebSockets).

`tools/bot-test.js` is an aimbot that plays whole solo matches in the page: with the dev server running, open `/?debug` and run `eval(await (await fetch('/tools/bot-test.js')).text())` in the console (or through the browser tool); it returns a JSON report (rounds, kills, kinds seen, errors). Run it on all maps after touching game logic. `tools/bot-client.mjs [ws url] [name] [seconds] [weapon] [autostart]` is a headless online teammate (joins, readies, shoots nearby hamsters). A hidden browser tab gets no `requestAnimationFrame`; on `/?debug` use `await cs.drive(seconds, hook)` to step the frame loop manually.

## Online co-op

Press O on the title screen (or open `/?online`, `?name=Alice`, `?server=ws://host/ws`) to join the one public room: 2-8 Petros fight the same hamster waves and King (no friendly fire). Waves are `ROUND_WAVES * (1 + COOP_WAVE * (n-1))`, King HP `BOSS_HP * (1 + COOP_BOSS * (n-1))` (n = living players at round start). The CT side loses when everyone is dead, the bomb explodes or time runs out. Anyone can pick the map / start in `title` and `match_end`; in `buy` the round goes live when all players pressed Space or the timer ends. Someone joining mid-round spectates (click cycles teammates) until the next freeze. When the room empties it returns to `title`.

- **Roles** (`Game.role`): `solo` (everything local), `server` (headless authority, `Game.visual = false`), `client` (`Game.authority = false`: only animates replicas). `Game.sink` (server) emits events, `Game.out` (client) sends messages; `Game.feedback(soldier, msg)` is the per-player cue (hit marker, kill streak, hurt, death loadout reset) and runs locally in solo.
- **Authority**: the client owns its own movement, aim, weapons, ammo and hitscan and sends `s` (30 Hz state), `hit {id, w, hs, d}` / `hit {k:1,...}` for the King, `ignite`, `shot` (relayed as tracers/muzzle flash), `nade`, `buy`, `ready`, `map`, `start`, `ping`. The server owns hamsters, King, nuts, grenade damage, barrels, bomb, defuse progress, hp/armor/kit/score and all timers; damage comes from `D.WEAPONS[w]`, never from the client. Hits are range- and rate-checked (`Room.onHit`), names are sanitised, JSON frames max 16 KB, 200 msg/s per client.
- **Wire**: server -> client frames are `{e: [events], s?: snapshot}` (events in order, snapshot at 20 Hz: phase/timer/score, soldier rows, hamster/King rows; `src/protocol.js`). Events: `place newmatch map freeze live rend clear mend hs hd hh hm ks kh kd ns nx gs sm bp bx ex snd say feed shake fb shot pong`. A late joiner first gets a `welcome` (map, removed barrels, live hamsters/King/smokes/bomb). Clients draw entities ~100 ms in the past (`Track` interpolation in `net.js`).
- **Server code**: `server/headless.mjs` shims `document` and `Audio` (sounds become `snd` events), builds hamster texture stubs from `public/hamsters/rects.json` (visible rects, generated by `tools/hamster-rects.mjs` from the Godot PNGs; the client uses the same file so hitboxes match) and defines `ServerWorld` (a `SimWorld` that emits spawn events and skips corpses/visuals). `server/room.mjs` is the room (tick loop at fixed 1/120 s, validation, welcome). `server/index.mjs` is HTTP + WebSocket.
- **Sim/render split**: `simworld.js` (`SimWorld`: level, collision, entity lists, spawn helpers, soldier placement) is extended by `world.js` (`World`: scene, lights, effects, viewmodel player, barrels, bomb visual). Hamster/King `update` runs `think` (only if `Game.authority`) and `animate` (only if `Game.visual`); nuts/grenades only damage when `Game.authority`. `Soldier` (`soldier.js`) holds per-player state; `Game.hp/armor/kit/kills/...` are accessors onto `Game.me`, and `Game.target(pos)` is the nearest living soldier used by hamster/King AI. `Level.flowFieldMulti` seeds the flow field from every living soldier.

## Architecture (`src/`)

- `data.js` constants (metres, `WEAPONS`, `HAMSTER_KINDS`, ...). Keys are `KeyboardEvent.code` strings.
- `level.js` pure map logic (no DOM): parse, heights/slopes, `heightAt`, `footing`, `linked`, BFS `flowField`, `steer`, `touching`. Tiles are `[c, r]`; barrel fuses are keyed by `r * cols + c`.
- `collide.js` `Collision`: convex solids per tile for rays (`raycast(from, to, sightOnly)` with a tile DDA; `sightOnly` ignores sandbags; barrels are cylinders and come back as `hit.barrel`), and circle-vs-tile movement (`probe`, `moveCircle`, `support`): a tile blocks when its surface at the nearest point is higher than `feet + climb`, so jumping one step, stairs, ramps and crate tops work without a physics engine. Players use climb 0.3, hamsters and the King `MAX_CLIMB`.
- `levelMesh.js` builds the whole map as one vertex-coloured mesh (noise texture, trims, stairs, ramps) plus bombsite labels.
- `game.js` the `Game` singleton (port of `autoload/game.gd`, extended for several soldiers): phase machine `title → buy → live → round_end → match_end`, rules, spawning, bomb, barrel fuses. `world.js` owns the scene, lights (sun with a player-following shadow frustum, fill, hemisphere, a few permanent point lights to avoid shader recompiles), the effect helpers and the barrel/bomb visuals; entity lists (`hamsters` holds only living ones, corpses live in `corpses`) and spawn helpers are in `simworld.js`.
- `player.js` input, movement, recoil, hitscan (ray vs world, hamster/king cylinders, pierce for the AWP; online it sends hits instead of applying damage) and the viewmodel; `entities/*.js` hamster, king, nut, grenade (own bounce physics via `raycast`), smoke, bomb, barrel, avatar (teammate: Petro face billboard, blue body, gun, name label). `net.js` the browser side of online play (`Net`), `soldier.js`, `protocol.js` and `simworld.js` as described under Online co-op.
- `effects.js` pooled instanced particles, decals, tracers, floating text, explosion light; `sky.js` the cloud sky shader; `audio.js` WebAudio (3D via `PannerNode`); `hud.js` DOM overlay plus a crosshair canvas and the radar; `assets.js` loads textures (computes each hamster's visible rect), weapon meshes, the canister and sounds; `main.js` renderer, fixed 120 Hz simulation step, pause while the pointer is unlocked.
- Fog uses Godot's exponential falloff (the `fog_fragment` chunk is patched in `main.js`). Light intensities are Godot energy × π.
- Differences from the Godot version: no SSAO/glow, decals are quads on the hit surface, crouch is Ctrl or C (browsers eat Ctrl+W), the game pauses when the mouse is released (not online), fullscreen is the browser's (F11), online co-op exists only in the web version.
