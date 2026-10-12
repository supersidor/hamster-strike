# Counter-Hamster 3D (web)

First-person Counter-Strike parody in the browser: Petro (CT) vs the Hamster-Terrorists. A three.js port of the Godot game in `../petro3d`: five maps, three wave rounds, then a Hamster King bomb round.

```bash
npm install
npm run dev       # http://localhost:5173  (add ?debug to skip pointer lock and expose window.cs)
npm run build     # static site in dist/
npm run preview   # serve dist/ locally
npm run check     # maps + collision tests in Node
npm run assets    # re-convert assets from ../petro3d (needs cwebp, afconvert, jq)
```

## Deploying

`dist/` is a plain static site with relative asset paths (`base: './'`), so it works from a domain root or a sub-path. Upload the folder to any static host (GitLab Pages, Netlify, S3 + CDN, nginx). No server code, no cookies, no network calls after the page loads. Serve it with gzip or brotli: the sounds (~5 MB WAV) and the weapon mesh (~1.4 MB) compress well. Pointer lock needs a secure context, so serve over HTTPS (localhost is fine for testing).

## Controls

WASD move, mouse look, LMB shoot, RMB scope (AWP), Space jump, Ctrl or C crouch, Shift walk, R reload, Q switch weapon, 1-7 pick a weapon, G HE grenade, F smoke, E (hold) defuse, Esc frees the mouse (the game pauses until you click again).

## Credits

Hamster photos (Wikimedia Commons): `public/hamsters/CREDITS.md`. Weapon models: `public/weapons/CREDITS.md`. The voice lines and gun sounds in `public/sounds` come from the original Godot game; check their licensing before a public launch.
