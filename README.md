# Counter-Hamster 3D (web)

First-person Counter-Strike parody in the browser: Petro (CT) vs the Hamster-Terrorists. A three.js port of the Godot game in `../petro3d`: five maps, three wave rounds, then a Hamster King bomb round.

```bash
npm install
npm run dev       # http://localhost:5173  (add ?debug to skip pointer lock and expose window.cs)
npm run build     # static site in dist/
npm run preview   # serve dist/ locally
npm run server    # online room + static files on :8080 (needs npm run build for the page itself)
npm run check     # maps + collision tests + headless online room test in Node
npm run assets    # re-convert assets from ../petro3d (needs cwebp, afconvert, jq)
```

## Online co-op

Press O on the title screen to join the public room (or open `/?online`): up to 8 players fight the same hamster waves and the King together. In development run `npm run server` and `npm run dev` side by side (vite proxies `/ws`). `npm run build && npm start` serves the game and the room from one Node process.

## Deploying

`npm run build` makes a static `dist/` with relative paths, which is enough for solo play on any static host. Online play needs the Node server (`server/index.mjs`, which also serves `dist/`) and a WebSocket-capable proxy; the `Dockerfile` and `chart/` do exactly that. Run a single replica, because the room lives in memory. Pointer lock needs a secure context, so serve over HTTPS (localhost is fine for testing).

## Controls

WASD move, mouse look, LMB shoot, RMB scope (AWP), Space jump, Ctrl or C crouch, Shift walk, R reload, Q switch weapon, 1-7 pick a weapon, G HE grenade, F smoke, E (hold) defuse, Tab scoreboard (online), Esc frees the mouse (solo pauses until you click again).

## Credits

Hamster photos (Wikimedia Commons): `public/hamsters/CREDITS.md`. Weapon models: `public/weapons/CREDITS.md`. The voice lines and gun sounds in `public/sounds` come from the original Godot game; check their licensing before a public launch.
