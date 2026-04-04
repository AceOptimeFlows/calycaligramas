<p align="center">
  <img src="assets/img/logo.png" alt="C△lyCaLigramas logo" width="112" />
</p>

<h1 align="center">C△lyCaLigramas</h1>
<p align="center"><strong>A local-first typographic drawing studio for calligrams, parametric figures, formula-driven compositions, and animated text art.</strong></p>
<p align="center">Built as a zero-dependency Progressive Web App by <strong>OptimeFlow(s)</strong>.</p>

<p align="center">
  <img alt="PWA" src="https://img.shields.io/badge/PWA-offline--first-111827?logo=pwa&logoColor=white" />
  <img alt="Local first" src="https://img.shields.io/badge/local--first-no%20backend-0f766e" />
  <img alt="Vanilla JavaScript" src="https://img.shields.io/badge/vanilla-JavaScript-f7df1e?logo=javascript&logoColor=111827" />
  <img alt="License MIT" src="https://img.shields.io/badge/license-MIT-16a34a" />
</p>

---

## Overview

**C△lyCaLigramas** is a browser-based creative studio that lets you draw with text instead of ink.
It combines freehand text stamping, generative geometry, formula-based curves, lightweight motion effects, 3D viewing, local audio-assisted video export, multilingual UI, and offline support in a single static web app.

There is **no build step**, **no framework**, and **no backend required** for the core experience.
Open it on a proper local/static server, and you get a fully installable PWA that works offline and keeps the creative workflow entirely on-device.

It is a strong fit for:

- designers exploring experimental typography,
- creative coders prototyping text-based visuals,
- educators demonstrating parametric curves and visual math,
- artists making short motion loops and generative compositions,
- privacy-conscious users who want a fully local workflow.

---

## Why this project stands out

- **Draw with text along any path** using freehand input on canvas.
- **Generate ready-made typographic figures** such as circles, spirals, roses, hearts, polygons, and Lissajous-style curves.
- **Build formula-driven compositions** with `x(t)`, `y(t)`, and `z(t)` expressions.
- **Animate compositions** with typewriter, random reveal, and wave effects.
- **Switch to a 3D view** with rotation controls and auto-camera movement.
- **Export static and motion output** as PNG plus 20-second WebM/MP4 clips.
- **Mix local audio into exports** from uploaded files and/or microphone recording.
- **Save and reload designs** as JSON snapshots.
- **Run offline as a PWA** with a service worker and cached app shell.
- **Use a multilingual interface** with runtime-loaded dictionaries.
- **Keep everything local-first** with no server-side rendering or cloud dependency.

---

## Core features

### 1) Creation modes

#### Free Draw
Stamp the active text along your pointer path with configurable spacing, orientation, jitter, size range, and color interpolation.

#### Shape Generator
Generate text compositions from built-in figure presets:

- Circle
- Spiral
- Rose
- Heart
- Polygon
- Lissajous

#### Formula Mode
Plot text over custom parametric expressions:

- `x(t)`
- `y(t)`
- `z(t)`

Supported math helpers include:

`sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `sqrt`, `abs`, `log`, `exp`, `pow`, `sign`, `min`, `max`, plus constants `PI` and `E`.

---

### 2) Text and styling controls

- Custom text input
- Loop text mode
- Draw by character or by word
- Auto-orient text to the path
- Font family selection
- Font weight control
- Italic toggle
- Letter spacing control
- Minimum/maximum character size

---

### 3) Visual system

- Dual color gradient (`Color A` / `Color B`)
- Alpha control
- 3D brightness shading
- Z-frequency and Z-phase controls
- Stamp spacing and base angle
- Size jitter and angle jitter
- Optional grid
- Dark background toggle
- Multiple interface themes
- Resize-fit behavior for responsive layouts

---

### 4) Motion and 3D

Animation effects:

- None
- Typewriter
- Random reveal
- Wave

View modes:

- 2D
- 3D

3D tools include:

- Rotation on X / Y / Z axes
- Depth control
- Automatic camera movement
- Return-to-start mode
- Inverse camera mode
- Keyboard shortcuts for quick preview rotation

---

### 5) Export and media pipeline

#### Image export
- PNG export directly from the canvas.

#### Video export
- 20-second clip export.
- WebM export when the browser supports `MediaRecorder` for the current pipeline.
- MP4 export only when the browser can **natively** produce a valid MP4 recording.
- Capability probing before enabling MP4.
- Fallback pipeline for MP4 using an intermediate WebM capture and recapture strategy when supported.

#### Audio integration
- Attach a local audio file.
- Record audio from the microphone.
- Mix uploaded and recorded audio into the exported clip locally.

#### Design persistence
- Save the current design as JSON.
- Load a previously saved design file.

---

## Keyboard shortcuts

- **Undo:** `Ctrl/Cmd + Z`
- **Redo:** `Ctrl/Cmd + Y`
- **Redo (alternative):** `Ctrl/Cmd + Shift + Z`
- **3D preview:**
  - `←` / `→` rotate Y
  - `↑` / `↓` rotate X
  - `Q` / `E` rotate Z

---

## Tech stack

This project is intentionally lightweight and buildless.

- **HTML5** for structure
- **CSS3** for the visual shell, layout, themes, and overlays
- **Vanilla JavaScript** for state management, canvas rendering, animation, i18n, and media export
- **Canvas API** for drawing and compositing
- **MediaRecorder + Web Audio API** for recording and audio mixing
- **Service Worker** for offline-first behavior
- **Web App Manifest** for installability

No framework. No bundler. No runtime dependency chain.

---

## Project structure

```text
.
├── index.html
├── styles.css
├── app.js
├── exportmp4.js
├── i18n.js
├── sw.js
├── manifest.json
├── lang/
│   ├── es.json
│   ├── en.json
│   ├── de.json
│   ├── it.json
│   ├── fr.json
│   ├── ko.json
│   ├── ja.json
│   ├── zh.json
│   ├── hi.json
│   ├── ru.json
│   └── ca.json
└── assets/
    └── img/
        ├── logo.png
        ├── calycaligramas180.png
        ├── calycaligramas192.png
        └── calycaligramas512.png
```

### File responsibilities

- **`index.html`** — app shell, panels, canvas stage, overlays, and control layout.
- **`styles.css`** — visual identity, responsive UI, themes, glassmorphism shell, footer/header, overlays, and panel styling.
- **`app.js`** — main application state, canvas drawing logic, shape/formula generation, dynamic effects, UI binding, media controls, export triggers, and runtime localization hooks.
- **`exportmp4.js`** — reliable clip export pipeline for WebM and MP4, including capability probing and transcoding fallback logic.
- **`i18n.js`** — runtime language loading, translation helpers, language normalization, and DOM translation application.
- **`sw.js`** — offline-first service worker with precaching, runtime caching, JSON fallback for languages, navigation fallback, cache cleanup, and instant update handling.
- **`manifest.json`** — install metadata and PWA icons.

> **Note**
> The UI already includes a `pt-br` language slot in the selector and i18n logic. If you want full Brazilian Portuguese coverage, add `lang/pt-br.json`.

---

## Getting started

### 1) Clone or download the project

```bash
git clone <your-repository-url>
cd <your-project-folder>
```

### 2) Serve it locally

Because the app uses **fetch**, **Service Workers**, and **PWA installation**, you should run it from a local/static server rather than opening `index.html` via `file://`.

#### Option A — Python

```bash
python -m http.server 8080
```

#### Option B — Node

```bash
npx serve .
```

### 3) Open the app

```text
http://localhost:8080/
```

For the full PWA behavior, prefer **localhost** during development and **HTTPS** in production.

---

## How to use

1. **Choose a creation mode**: Free Draw, Shape, or Formula.
2. **Enter your text** and configure typography.
3. **Adjust color, depth, spacing, jitter, and layout controls**.
4. **Draw or generate** your composition.
5. **Animate it** if you want motion.
6. **Switch to 3D** for spatial preview and camera movement.
7. **Export** as PNG or a 20-second video clip.
8. **Save the design** as JSON if you want to continue later.

---

## Internationalization

The interface uses runtime-loaded JSON dictionaries.

### Included dictionaries

- Spanish (`es`)
- English (`en`)
- German (`de`)
- Italian (`it`)
- French (`fr`)
- Korean (`ko`)
- Japanese (`ja`)
- Chinese (`zh`)
- Hindi (`hi`)
- Russian (`ru`)
- Catalan (`ca`)

### i18n behavior

- Language is stored in local storage.
- The DOM is translated at runtime.
- Missing keys fall back gracefully.
- The fallback language is **Spanish**.
- Language aliases are normalized (for example `en-US` → `en`, `ca-ES` → `ca`).

---

## PWA and offline behavior

C△lyCaLigramas is designed as an **offline-first Progressive Web App**.

### What is cached

- core app shell files,
- static runtime assets,
- language dictionaries,
- manifest and icons,
- offline navigation fallback for the main installed entry.

### Offline strategy highlights

- precached shell,
- stale-while-revalidate for static same-origin resources,
- safe offline fallback for navigation,
- JSON fallback for language files,
- old cache cleanup on activation,
- instant update flow using `SKIP_WAITING`.

### Installation

On supported browsers, you can install the app like a native experience:

- **Desktop:** use the browser install prompt/button.
- **Mobile:** use **Add to Home Screen**.

---

## Browser support and export notes

The editor itself is lightweight, but some features depend on browser media APIs.

### Best experience

- Recent **Chromium-based browsers** (Chrome, Edge, Brave, Arc)

### Expected behavior by capability

- **Core editor / canvas / shapes / formulas / themes / i18n**: broadly supported in modern browsers.
- **PWA installation and offline caching**: supported in modern browsers with Service Worker support.
- **Audio recording and video export**: depends on `MediaRecorder`, `captureStream`, and related media features.
- **MP4 export**: only enabled when the browser can create a valid MP4 natively.

### Important note about MP4

MP4 is **not assumed**. The app actively checks whether the browser can produce a usable MP4 stream before enabling that option.
That makes the export flow more robust and avoids offering a broken format in unsupported environments.

---

## Privacy

This project is designed to keep creation and processing **on-device**.

- No backend is required for the main editor workflow.
- Drawing, animation, audio mixing, and export are handled locally in the browser.
- Designs can be saved locally as JSON files.
- Media is processed client-side.

If you deploy the app yourself, your hosting choice still determines ordinary web-server logs and analytics outside the editor logic.

---

## Deployment

Because the project is a static web app, it can be deployed easily to any static hosting platform, including:

- GitHub Pages
- Netlify
- Vercel (static output)
- Cloudflare Pages
- Any traditional HTTPS web server

Just make sure the app is served with the expected folder structure so that:

- `lang/*.json` can be fetched,
- `assets/img/*` resolves correctly,
- `manifest.json` and `sw.js` remain in scope.

---

## Contributing

Contributions are welcome.

If you plan to extend the project, a good direction is to preserve the current philosophy:

- keep it lightweight,
- keep it local-first,
- keep it framework-free unless there is a strong reason not to,
- keep offline/PWA support as a first-class feature,
- keep UX responsive on desktop and mobile.

Useful contribution areas could include:

- more generative presets,
- more export options,
- more dictionaries,
- accessibility refinements,
- richer formula helpers,
- timeline-based animation controls,
- presets gallery and shareable design packs.

---

## License

Released under the **MIT License**.

---

## Author

**Andrés Calvo Espinosa**  
OptimeFlow(s)

If you publish this project publicly, it also makes sense to keep the repository connected to the same brand and author information shown in the app footer.

---

## Final note

C△lyCaLigramas is a surprisingly powerful example of what a carefully designed **vanilla web app** can do when it embraces the browser properly: creative tooling, local media workflows, installability, offline support, and multilingual UX — all without a heavy stack.

If your goal is to present a polished, distinctive, technically solid creative PWA, this project already has the right DNA.
