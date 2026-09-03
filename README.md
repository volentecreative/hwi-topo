# Gainesboro topo turntable

A slowly rotating 3D contour-line block of the terrain around Gainesboro, Tennessee — real SRTM 30 m elevation, rendered with three.js. One script, no build step, embeds anywhere (Webflow, Squarespace, plain HTML).

**Live demo:** open `index.html`, or after enabling GitHub Pages: `https://jpfeland.github.io/gainesboro-topo/`

## Embed (Webflow "Embed" element, or any HTML)

```html
<div id="topo" style="width:100%;height:600px"></div>
<script src="https://cdn.jsdelivr.net/gh/jpfeland/gainesboro-topo@main/topo-turntable.js"></script>
<script>
  TopoTurntable.mount('#topo', {
    rotateSeconds: 40,        // one full turn; 0 = still
    background: 'transparent' // or any CSS colour
  });
</script>
```

Or the no-JavaScript way — just give any element `data-topo` and it mounts itself:

```html
<div data-topo data-config='{"shape":"circle","rotateSeconds":30}' style="height:500px"></div>
<script src="https://cdn.jsdelivr.net/gh/jpfeland/gainesboro-topo@main/topo-turntable.js"></script>
```

> jsDelivr caches `@main` for up to 24 h. For an instant, permanent version pin a commit or tag instead, e.g. `@v1.0.0`.

## Options

| option | default | what it does |
|---|---|---|
| `radiusMiles` | `3` | 1–6, how much terrain around town |
| `shape` | `'square'` | `'square'` or `'circle'` |
| `rings` | `26` | number of contour lines |
| `exaggeration` | `2.0` | vertical exaggeration |
| `rotateSeconds` | `40` | seconds per full turn; `0` disables |
| `tilt` | `32` | camera angle above the horizon, degrees |
| `lens` | `30` | field of view; lower = flatter / more isometric |
| `background` | `'transparent'` | CSS colour or `'transparent'` |
| `lineColor` / `indexLineColor` | `#d8d8d8` / `#ffffff` | contour colours (index = every 100 ft) |
| `solidBlock` / `blockColor` | `true` / `#2b2b2b` | filled block under the lines |
| `edgeOutline` | `true` | outline riding the terrain edge |
| `cornerPosts` | `true` | verticals from base to edge |
| `baseDepth` | `0.12` | block thickness below the lowest terrain, as a fraction of the radius |
| `label` / `labelColor` / `labelHeight` / `labelFont` | `'Gainesboro'` … | the pin; `''` hides it |
| `dragToOrbit` | `true` | visitors can drag to spin; auto-rotation resumes after |

`TopoTurntable.mount()` returns a promise resolving to `{ destroy() }`.

## Notes

- ~170 KB script (the elevation grid is baked in). three.js r128 loads from cdnjs automatically if the page doesn't already have `THREE`.
- Pauses rendering when scrolled out of view; honours `prefers-reduced-motion` (stays still).
- Data: NASA SRTM 30 m via OpenTopoData, 37×37 samples over a 6-mile square centred on 36.35972, -85.65472, spline-interpolated and lightly smoothed. It's the true large-scale shape of the terrain, not survey-grade detail.
