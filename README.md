**English** · [Русский](README.ru.md)

# SlowmoFPS Runner

An endless runner for phones, held in portrait. The world rushes at you across three lanes; you stand still and change lane, jump, shoot and slow time down when it gets tight. Black world, white polygon edges, red enemies — nothing else on screen.

**▶ [Play in the browser](https://johninwork.github.io/slowmo-fps/)** — made for a phone, works on desktop too.

<p align="center">
  <img src="screenshots/menu.jpg" width="38%" alt="Main menu">
  <img src="screenshots/gameplay.jpg" width="38%" alt="Running down the lanes">
</p>

## How it plays

- **Three lanes.** Swipe left or right to change lane, swipe up to jump. The player never moves forward — the world does.
- **Two weapons.** Pistol or knife, picked before the run; tap to attack, hold to inspect the weapon in your hand.
- **Time is a resource.** The button at the bottom slows everything down. Blue capsules on the track refill the meter, so the way to keep slow motion running is to keep hitting them.
- **Enemies.** Red mannequins in single lanes, and a wireframe giant that blocks two at once and takes three hits — the three cores on its chest are its health.
- **The look is the same as the original**: black fills, white edges, bloom, chromatic aberration, grain and scanlines — all retuned for a portrait screen, where the old settings turned the frame into a fisheye and ate the near floor.

## Running it

Needs any static server (ES modules don't work over `file://`):

```bash
python3 -m http.server 8777
```

then open `http://localhost:8777`.

The earlier first-person arena is still here as `arena.html` — same world, free movement, time that only flows when you do.

## Stack

Three.js (ES modules from a CDN), plain JS with no bundler. `js/runner.js` is the whole game.

## Assets

Models in `models/` are off-the-shelf: samples from [glTF-Sample-Models](https://github.com/KhronosGroup/glTF-Sample-Assets) and the Three.js examples, plus weapon models from free libraries.
