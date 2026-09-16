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
<script src="https://cdn.jsdelivr.net/gh/volentecreative/hwi-topo@24a0b74/topo-turntable.js"></script>
<script>
  TopoTurntable.mount('#topo', {

    // --- terrain ---------------------------------------------------------
    exaggeration:   2,          // vertical exaggeration; 1 = true scale, higher = more dramatic relief
    localInterval:  12.5,       // finest contour interval, in metres, over the county-scale grid
    regionInterval: 25,         // finest interval over the 1 km grid (600 x 500 km)
    contInterval:   100,        // finest interval over the 5 km grid (5,800 x 3,300 km)
    contourSpacing: 16,         // a contour set resolves in once its lines would fall this many CSS px apart (see below)
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
    // each falls back to the site palette's own variable, so defining --map-bg, --topo, --boundary, --water and
    // --label once on the page is enough
    background:    'var(--topo-bg, var(--map-bg, #222322))',
    lineColor:     'var(--topo-line, var(--topo, #525352))',        // every contour, at every level
    lineOpacity:   1,
    mutedColor:    'var(--topo-muted, #3f4040)',                    // the graticule and the rest of the world's outlines
    boundaryColor: 'var(--topo-boundary, var(--boundary, #626362))', // country outlines
    blockColor:    'var(--topo-block, var(--map-bg, #222322))',     // the relief under the lines, and the globe
    countyColor:   'var(--topo-county, var(--boundary, #626362))',
    roadColor:     'var(--topo-road, var(--boundary, #626362))',
    waterColor:    'var(--topo-water, var(--water, #3f6063))',

    // --- the pin ---------------------------------------------------------
    label:       'Gainesboro',  // '' hides the pin entirely
    labelHeight: 0.45,          // how far the pin stands above the terrain, as a fraction of the county's half-extent
    labelClass:  '',            // style the text with your own classes instead (see below)
    labelColor:  'var(--topo-label, var(--label, #f2f2f0))',  // ignored when labelClass is set
    labelFont:   '500 15px/1 "Helvetica Neue", Helvetica, Arial, sans-serif',  // ignored when labelClass is set

    // --- approach: scroll-driven descent from the whole Earth --------------
    approach:        false,     // true = open on the globe with the county facing you and descend to the frame above
    approachScroll:  '',        // selector of the tall track the stage is stuck inside; progress follows its scroll
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
<script src="https://cdn.jsdelivr.net/gh/volentecreative/hwi-topo@24a0b74/topo-turntable.js"></script>
```

> The URL above is pinned to commit `24a0b74`, so it is permanent and served instantly. Swap the hash for a newer commit to pick up changes; `@main` also works but jsDelivr caches it for up to 24 h. The script loads its terrain from `data/` beside itself, so the pin covers the data too.

## The descent

`approach: true` opens on the whole Earth, the county facing you, and descends to the frame the
turntable would otherwise open on. Progress 0 is the globe, 1 is the landing frame. On the way the
country outlines and a 15° graticule hold until about 1,600 km across and North America in more
detail until 100 km; the county line arrives once its shape can be read, from about 700 km; roads and
rivers from 90 km. The contours never arrive in bands: see "How the world is built".

The camera holds `startHeading` the whole way down — there is no swing — so the only moves are the
descent itself and the tilt. The look-at point settles on the county over the first 45%, the tilt
comes on through the middle (35% to 72%, so it has settled before the county-scale contours are in),
and the last third is only the approach: zoom, and the lens narrowing from `approachLens` to `lens`.
Once it lands, rotation and drag take over.

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

The three reliefs are nested, and each is the ground wherever it is the finest one there: the
continental relief has a hole where the regional one is, the regional a hole where the fine one is,
and each hole's edge lies in the coarser grid's blended margin, so the two surfaces meet within a few
metres, in one colour. Each is drawn opaque under its lines, so a contour behind a ridge is hidden
rather than drawn through it. The contours are cut on the relief's own triangles (marching triangles,
not squares), so a line can never fall below the surface it sits on and come out dashed. The graticule
and the country outlines are draped the same way — on the continental relief where there is land, on
the sea-level sphere elsewhere — so they ride over the terrain rather than being buried under it.

There are no contour levels of detail to see, because no line is ever switched as a layer. Every
contour, from every grid, is drawn by one material — one colour, one width, one depth rule — and each
segment decides for itself whether it is on screen, in the vertex shader, from three things:

- **Room.** Contour levels nest (a 100 m line is also a 200 m, 400 m, 800 m line), so each level is
  tagged with the coarsest set it belongs to, up to 1,600 m. A segment resolves in once the lines of
  *that* set would fall `contourSpacing` pixels apart at the segment's own depth on screen — the set's
  interval over the local slope, times pixels per metre there. So the 800 m lines are on from orbit
  where the land is gentle enough, the 400 m lines fill in between them where there is room, then
  the 200 m, and so on down to the finest interval; nothing is ever replaced, only added between what
  is already there, and steep ground resolves later than flat ground rather than all at once.
- **Resolution.** A grid's lines also wait until its own finest feature (its smoothing scale: 15 km,
  2.5 km, 250 m) spans about four pixels, so a fine line never arrives as a scribble; inside a finer
  grid's extent the coarser grid's lines go out on exactly the same test, per vertex, and the finer
  grid's lines — the same levels, from nearly the same heights — come in. A set that was on stays on:
  each set is judged by the slope field of the grid that first carried it, whichever grid a line is
  cut from. The tests are in CSS pixels, so on a narrow phone the county-scale lines may never
  quite resolve at the landing frame; the regional lines stand in, and the map stays legible.
- **Margins.** Each grid's outer margin is blended toward the next coarser field and its lines fade out
  across it while the coarser lines fade in, so no level ends where its data does, at any view.

Ramps are short (about ±10% of the zoom) and the tests are by pixels per metre, not by scroll
progress, so they stay right if the track or the lens changes. The county geometry is cut after the
first frame, so the globe is on screen while it happens, and the pixel ratio is capped at 1.5.

There are no state lines and no index lines; where they were, the relief is.

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
