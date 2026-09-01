**English** · [Русский](README.ru.md)

# SlowmoFPS — prototype

A first-person shooter on Three.js: a black world, white polygon edges, no fills anywhere. Time moves only when you do — stand still and the world nearly freezes.

![SlowmoFPS](screenshots/gameplay.jpg)

## What's inside

- **Time follows your movement** — with no input `timeScale` eases down to 0.05, WASD brings it back to one; jumping has its own rule so you can still land. The bar on the left of the HUD shows how fast time is running.
- **A world made of edges** — geometry is drawn as black fill plus a white outline, dissolving into fog in the distance.
- **Cinematic grade**: bloom, chromatic aberration, vignette, film grain, scanlines, shake and hit flashes — all through `EffectComposer` with hand-written shader passes.
- **Weapons**: a pistol with reload and recoil, throwing knives, each with its own draw and inspect animation.
- **Enemies** — rigged GLB models repainted into the same wireframe look, cloned through `SkeletonUtils`.
- Controls: `WASD` to move, mouse to look, `Shift` to dash, `R` to reload, `Space` to jump.

## Running it

Needs any static server (ES modules don't work over `file://`):

```bash
python3 -m http.server 8777
```

then open `http://localhost:8777`.

## Stack

Three.js (ES modules from a CDN), plain JS with no bundler. `js/main.js` is the whole game, about 1000 lines.

## Assets

The models in `models/` are off-the-shelf, not mine: samples from the [glTF-Sample-Models](https://github.com/KhronosGroup/glTF-Sample-Assets) repository and the Three.js examples (`Soldier`, `Xbot`, `RobotExpressive`, `CesiumMan`, `BrainStem`, `RiggedFigure`), plus weapon and skeleton models from free libraries. They live in the repo so the prototype stays reproducible.
