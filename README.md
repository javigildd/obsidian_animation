# Obsidian Graph Animator

A web app for designing and recording animations that look like the Obsidian graph view: a force-directed mesh of particles that repel each other, connect with links, and form a dense central cluster surrounded by a halo of smaller chains.

You configure parameters (zoom, particle size, particle count, repulsion, link distance, opacities, pan), keyframe them over a timeline, scrub/play to preview, and export the result to MP4 — all in the browser.

## Stack

- **Vite + React + TypeScript** — UI shell with hot reload.
- **d3-force** — node–link force simulation (`charge`, `link`, `center`, `collide`).
- **Canvas 2D** — render path; handles 1k+ nodes easily.
- **Zustand** — timeline + keyframe state.
- **ffmpeg.wasm (libx264)** — in-browser MP4 encode, no server.

## Running

```bash
npm install
npm run dev
```

Then open the URL Vite prints (default `http://localhost:5173`).

> The dev server sets the COOP/COEP headers required for `SharedArrayBuffer`, which `ffmpeg.wasm` needs. If you serve the production build behind another server, you must replicate these headers:
>
> ```
> Cross-Origin-Opener-Policy: same-origin
> Cross-Origin-Embedder-Policy: require-corp
> ```

## Using the app

### Layout
- **Left panel** — parameter sliders.
- **Center** — live preview viewport.
- **Right panel** — export controls (resolution, CRF, seed, warmup).
- **Bottom** — timeline with one track per animatable parameter.

### Animatable parameters
| Parameter | Range | Description |
| --- | --- | --- |
| Zoom | 0.1× – 6× | World-space zoom. |
| Pan X / Pan Y | −400 – 400 | World-space pan. |
| Particle size | 0.2 – 6 | Base radius multiplier. |
| Particle count | 50 – 3000 | Live add/remove nodes. |
| Node opacity | 0 – 1 | |
| Link opacity | 0 – 1 | |
| Repulsion | −200 – 0 | `forceManyBody` strength. |
| Link distance | 5 – 120 | Ideal link length. |

### Keyframing
- Click the **diamond** next to a slider to toggle a keyframe at the current time.
- With at least one keyframe present, moving the slider creates/updates a keyframe at the playhead.
- With no keyframes, the slider edits the **default** value (constant across the whole animation).
- **Double-click** an empty spot on a timeline lane to drop a keyframe with the current value.
- **Shift-click** a keyframe diamond to delete it.
- **Alt-click** a keyframe diamond to cycle its easing: `linear → easeIn → easeOut → easeInOut`.

### Playback
- ▶/⏸ in the timeline toolbar. ⏮ jumps to start, ⏭ to end.
- Drag anywhere on the timeline body to scrub.
- Configure **Duration** and **FPS** in the timeline toolbar.

### Export
- Choose a resolution preset (1080p / square / 720p / 4K) and CRF (18–23 is a sweet spot).
- Seed and warmup control the deterministic offline render: same seed + warmup ⇒ identical output across runs.
- Click **Export MP4**. Progress shows render + encode phases.
- The file downloads automatically when done.

> 4K is supported but slow in the browser — expect minutes for short clips.

## Project structure

```
src/
├── graph/
│   ├── generator.ts     # procedural graph (clusters + outer ring)
│   ├── simulation.ts    # d3-force wrapper, runtime parameter updates
│   └── renderer.ts      # canvas 2D draw, DPI-aware
├── timeline/
│   ├── interpolate.ts   # easing + keyframe sampling
│   ├── store.ts         # zustand timeline + keyframe store
│   └── Timeline.tsx     # timeline UI
├── export/
│   └── recorder.ts      # offline render + ffmpeg.wasm encode
└── ui/
    ├── App.tsx
    ├── Viewport.tsx     # live render loop
    ├── ControlPanel.tsx # parameter sliders
    └── ExportPanel.tsx
```
