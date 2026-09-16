# Jackson County topo turntable

Jackson County, Tennessee, in contour lines on a slowly turning stage — and, with `approach: true`, a
scroll-driven descent to it from the whole Earth. Real terrain at three levels (1-arc-second SRTM
over the county, Terrain Tiles at 1 km for the region and 5 km for the continent), the Census county
line, Natural Earth countries. One script plus a `data/` folder, no build step, embeds anywhere.

**Live demo:** open `index.html`, or after enabling GitHub Pages: `https://volentecreative.github.io/hwi-topo/`

## Embed (Webflow "Embed" element, or any HTML)

Every option, with its default. Delete the lines you are happy with — anything left out falls back
to the value shown here.

```html
<div id="topo" style="width:100%;height:600px"></div>
<script src="https://cdn.jsdelivr.net/gh/volentecreative/hwi-topo@9c391e6/topo-turntable.js"></script>
<script>
  TopoTurntable.mount('#topo', {

    // --- terrain ---------------------------------------------------------
    exaggeration:   2,          // vertical exaggeration; 1 = true scale, higher = more dramatic relief
    localInterval:  25,         // metres between contour lines at county scale
    regionInterval: 50,         // on the way in, over the 1 km grid (600 x 500 km); its index lines match contInterval
    contInterval:   100,        // seen from the continent's height, over the 5 km grid; regionInterval's index lines match this
    county:         true,       // draw the county line, draped on the relief

    // --- camera ----------------------------------------------------------
    tilt:          31,          // degrees above the horizon; 90 = straight down, 0 = eye level
    lens:          8,           // field of view; lower = flatter and more isometric
    startHeading:  140.5,       // which way it faces on load, in degrees
    rotateSeconds: 120,         // seconds per full turn; 0 = hold still
    fitMargin:     1.1,         // breathing room around the county; 1 = edge to edge, higher = more padding
    dragToOrbit:   false,       // let visitors drag to spin it; auto-rotation resumes afterwards

    // --- highways & waterways (OpenStreetMap, draped on the terrain) ------
    roads: false,               // TN 53 / 56 / 85 / 135 / 262 — coverage ends ~10 km from town, see below
    water: false,               // the Cumberland, Roaring River and the town streams

    // --- colours (any CSS colour, or a var() that resolves on the page) ---
    background:     'var(--topo-bg, transparent)',
    lineColor:      'var(--topo-line, #d9c49c)',
    lineOpacity:    0.75,
    indexLineColor: 'var(--topo-index, #f2e2bc)',   // every 5th contour
    blockColor:     'var(--topo-block, #1a2129)',   // the relief under the lines, and the globe
    countyColor:    'var(--topo-county, #ff7a5c)',
    roadColor:      'var(--topo-road, #8f948c)',
    waterColor:     'var(--topo-water, #5fa3a8)',

    // --- the pin ---------------------------------------------------------
    label:       'Gainesboro',  // '' hides the pin entirely
    labelHeight: 0.45,          // how far the pin stands above the terrain, as a fraction of the county's half-extent
    labelClass:  '',            // style the text with your own classes instead (see below)
    labelColor:  'var(--topo-label, #ff7a5c)',       // ignored when labelClass is set
    labelFont:   '500 15px/1 "Helvetica Neue", Helvetica, Arial, sans-serif',  // ignored when labelClass is set

    // --- approach: scroll-driven descent from the whole Earth --------------
    approach:        false,     // true = open on the globe with the county facing you and descend to the frame above
    approachScroll:  '',        // selector of the tall track the stage is stuck inside; progress follows its scroll
    approachHeading: 0,         // heading at the top (0 = north up); it swings to startHeading on the way down
    approachLens:    38,        // field of view at the top; it narrows to `lens` on the way down
    approachDamping: 0.12,      // how quickly the view follows the scroll (1 = instantly)

    // --- data ------------------------------------------------------------
    data: {},                   // { base, local, region, lines } — defaults to ./data/ next to the script
    aspectRatio: '16 / 10'      // used only when the container has no height of its own
  });
</script>
```

Or the no-JavaScript way — give any element `data-topo` and it mounts itself:

```html
<div data-topo data-config='{"tilt":40,"rotateSeconds":60}' style="height:500px"></div>
<script src="https://cdn.jsdelivr.net/gh/volentecreative/hwi-topo@9c391e6/topo-turntable.js"></script>
```

> The URL above is pinned to commit `3352ddd`, so it is permanent and served instantly. Swap the hash for a newer commit to pick up changes; `@main` also works but jsDelivr caches it for up to 24 h. The script loads its terrain from `data/` beside itself, so the pin covers the data too.

## The descent

`approach: true` opens on the whole Earth, the county facing you, and descends to the frame the
turntable would otherwise open on. Progress 0 is the globe, 1 is the landing frame. On the way:
the country outlines and a 15° graticule hold until about 1,600 km across, North America in more
detail until 100 km; continental relief contours from about 3,500 km down to 300 km, arriving in
three steps (400 m lines first, 200 m from about 2,000 km, 100 m from about 1,000 km); regional
contours from 500 km down to 90 km, index lines first; the county-scale contours, the county line and
any roads and rivers from 150 km in. So the contour density roughly doubles about six times on the
way down, each step fading in before the last has settled, and the spacing on screen stays much the same.

The camera move is three overlapping phases on one anchor. The look-at point settles on the county
over the first 45%; the heading swings from `approachHeading` to `startHeading` early, easing out
so that nine tenths of the turn is done by about 55% and all of it by 65%; the tilt comes on through the
middle, from 35% to 72%; and the last third is the approach itself — zoom and lens, from
`approachLens` to `lens` — with nothing else moving. Once it lands, rotation and drag take over.

Drive it from scroll with a tall track and a sticky stage:

```html
<section class="track" style="height:600vh;position:relative">
  <div style="position:sticky;top:0;height:100vh">
    <div id="topo" style="width:100%;height:100%"></div>
  </div>
</section>
<script>TopoTurntable.mount('#topo', { approach: true, approachScroll: '.track' });</script>
```

…or drive it yourself: `mount()` resolves to an instance with `setProgress(t)`, a `progress`
getter, and a `state` getter (`{progress, distance, viewWidth, tilt, heading, fov}`) for readouts.

## How the world is built

Everything sits on one sphere, with the town's tangent point at the origin: the globe, the country
and state lines, the regional relief, the county-scale relief and the lines draped on it. At county
scale the sphere is flat to the eye; at continental scale the curvature is real. That is what lets
the descent be one continuous camera move rather than a flat map stitched to a globe.

Terrain comes at three levels, all from the same source family: `data/local.png` is 1-arc-second
SRTM resampled to 200 m over the county and about 22 km around it; `data/region.png` is Terrain
Tiles at 1 km over 600 × 500 km; `data/cont.png` is the same at 5 km over 5,800 × 3,300 km. Each is
Gaussian-smoothed so its contours read as landform, and stored as a 16-bit PNG of heights (R the
high byte, G the low) quantised to 0.25 / 0.5 / 1 m — 8 bits terraced gentle slopes into staircases
that every contour then hugged. The metadata that turns a pixel into metres is baked into the script.

Only one of the three is the ground at any moment: the continental relief from orbit down to about
300 km across, the regional relief from there to about 90 km, the fine relief below that. Each is
drawn opaque under its lines, so a contour behind a ridge is hidden rather than drawn through it, and
each coarser relief keeps a small overlap under the next, in the same colour, so no seam can show.
The contours are cut on the relief's own triangles (marching triangles, not squares), so a line can
never fall below the surface it sits on and come out dashed. The graticule and the country outlines are
draped the same way — on the continental relief where there is land, on the sea-level sphere elsewhere —
so they ride over the terrain rather than being buried under it.

A finer level never arrives as a new layer. Its index lines are cut at the coarser level's interval
— the continental level itself comes in as 400 m, then 200 m, then 100 m lines; the regional index is
every 100 m like those, the fine index every 50 m like the regional ones — and those fade in first, over the coarser lines, which fade out; only once they are
fully in does the finer relief become the ground and the intermediate contours fill in. During that
crossfade the finer lines are drawn without depth testing, so neither surface can dash them. Each
grid's outer margin is blended toward the next coarser field and its lines fade out toward the edge,
so no level ends where its data does. The county line, the pin and the country outlines persist
across every level. The county geometry is cut after the first frame, so the globe is on screen
while it happens, and the pixel ratio is capped at 1.5.

There are no state lines; where they were, the continental relief is.

## Styling the label with your own classes

`labelClass` puts your classes on the pin's text element, so the type is styled once in your
stylesheet rather than repeated in every embed:

```js
TopoTurntable.mount('#topo', {
  labelClass: 'text-size-tiny text-weight-bold text-style-allcaps text-color-alternate'
});
```

The classes own the label completely — the script writes no inline font or colour that could
override them, and its own defaults (letter-spacing, padding) sit at zero specificity so any
class beats them. The pin's line and dot read their colour back off the styled text, so a
theme switch moves the mark with the type.

In Webflow, those need to be real classes in the site stylesheet: style them on any element in
the Designer (a hidden one is fine) so they survive publishing, then name them here.

## Sizing in Webflow

The script fills whatever box the container is given, and re-fits whenever that box changes. It
only needs the page to give the container a width. Inside a horizontal flex row, that means
setting the **Embed** element to `flex: 1` (grow if possible, shrink if needed) or giving it a
width — a flex child left at the default `flex: 0 1 auto` is sized by its content, and the
container has none of its own. Without that the script falls back to a width derived from
`aspectRatio`, capped at the nearest ancestor that has one, which renders correctly but cannot
follow the layout as closely.

## Highways and waterways

`roads: true` and `water: true` add the state highways and the rivers, draped on the terrain.
**Coverage ends about 10 km from Gainesboro** — the OpenStreetMap extract was made for the old
12-mile view and does not reach the county line. Extending it needs a machine that can reach the
Overpass API; the query is the bounding box of `data/local.png` (lon −86.10 to −85.25, lat 36.01
to 36.72) for `highway=primary|secondary|trunk` and `waterway=river|stream`, projected to local
metres about 36.35972, −85.65472 and densified to ~80 m. Until then they are off by default.

## Notes

- ~75 KB script; `data/` is ~1.1 MB (cont.png 476 KB, region.png 274 KB, local.png 153 KB, lines.json 164 KB, ~120 KB gzipped) — the PNGs are already compressed. The globe is on screen as soon as the script and `cont.png` are in; the rest is cut after the first frame. three.js r128 loads from cdnjs automatically if the page doesn't already have `THREE`.
- Pauses rendering when scrolled out of view; honours `prefers-reduced-motion` (stays still, and the descent follows the scroll without damping).
- Terrain: SRTM 1-arc-second (NASA) and Terrain Tiles (Mapzen / AWS Open Data). County: Census cartographic boundary, 1:500k. Countries: Natural Earth 1:110M world, 1:50M North America. The county outline follows the river; the elevation is the true large-scale shape of the terrain, not survey-grade detail.
