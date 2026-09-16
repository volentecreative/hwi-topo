# Jackson County topo turntable

Jackson County, Tennessee, in contour lines on a slowly turning stage — and, with `approach: true`, a
scroll-driven descent to it from the whole Earth. Real terrain (1-arc-second SRTM over the county,
Terrain Tiles at 1 km for the region around it), Census county and state lines, Natural Earth
countries. One script plus a `data/` folder, no build step, embeds anywhere.

**Live demo:** open `index.html`, or after enabling GitHub Pages: `https://volentecreative.github.io/hwi-topo/`

## Embed (Webflow "Embed" element, or any HTML)

Every option, with its default. Delete the lines you are happy with — anything left out falls back
to the value shown here.

```html
<div id="topo" style="width:100%;height:600px"></div>
<script src="https://cdn.jsdelivr.net/gh/volentecreative/hwi-topo@e734575/topo-turntable.js"></script>
<script>
  TopoTurntable.mount('#topo', {

    // --- terrain ---------------------------------------------------------
    exaggeration:   2,          // vertical exaggeration; 1 = true scale, higher = more dramatic relief
    localInterval:  25,         // metres between contour lines at county scale
    regionInterval: 100,        // metres between contour lines on the way in (the 1 km grid, 600 x 500 km)
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
<script src="https://cdn.jsdelivr.net/gh/volentecreative/hwi-topo@e734575/topo-turntable.js"></script>
```

> The URL above is pinned to commit `e734575`, so it is permanent and served instantly. Swap the hash for a newer commit to pick up changes; `@main` also works but jsDelivr caches it for up to 24 h. The script loads its terrain from `data/` beside itself, so the pin covers the data too.

## The descent

`approach: true` opens on the whole Earth, the county facing you, and descends to the frame the
turntable would otherwise open on. Progress 0 is the globe, 1 is the landing frame. On the way:
the country outlines and a 15° graticule hold until about 1,600 km across; state lines and North
America in more detail from 250 km; regional relief contours (the 1 km grid, 600 × 500 km) from
about 1,600 km down to 45 km; the county-scale contours, the county line and any roads and rivers
from 140 km in. The look-at point travels from the Earth's centre to the county over the first half,
the tilt arrives over the second half, the heading swings from `approachHeading` to `startHeading`,
and the lens narrows from `approachLens` to `lens`. Once it lands, rotation and drag take over.

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

The fine terrain (`data/local.png`) is 1-arc-second SRTM resampled to 100 m over the county and about
22 km around it, smoothed so the contours read as landform. The regional terrain (`data/region.png`)
is 1 km over 600 × 500 km, from the same source at zoom 9. Both are 8-bit PNGs of heights; the
metadata that turns a pixel into metres is baked into the script.

The two are made one ground at mount: across the fine grid's outer 14 km the fine heights blend
toward the regional ones, and inside the fine extent the regional grid is resampled from the fine
one, so there is no step where one ends and the other begins. Each is drawn as an opaque relief
under its lines — a contour behind a ridge is hidden rather than drawn through it — and the
contours are cut on the relief's own triangles (marching triangles, not squares), so a line can
never fall below the surface it sits on and come out dashed. The fine layer's lines also fade out
toward the grid's edge rather than ending in a square. It is three levels of detail with
crossfades between them: the globe and its outlines, the regional relief, the county relief; each
is hidden once faded, and the county geometry is cut after the first frame so the globe is on
screen while it happens. Pixel ratio is capped at 1.5, which is all 1-px lines need and roughly
halves the fragment load on a 3× phone.

One thing that looks like a mistake and isn't: at a few hundred kilometres across, a straight
line runs past the county. It is the Kentucky state line — Tennessee's north and south borders
are lines of latitude, 27 km north of Gainesboro and 178 km apart — and it fades out below 100 km.

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

- ~70 KB script; `data/` is ~450 KB (local.png 167 KB, region.png 69 KB, lines.json 218 KB, ~60 KB gzipped). three.js r128 loads from cdnjs automatically if the page doesn't already have `THREE`.
- Pauses rendering when scrolled out of view; honours `prefers-reduced-motion` (stays still, and the descent follows the scroll without damping).
- Terrain: SRTM 1-arc-second (NASA) and Terrain Tiles (Mapzen / AWS Open Data). County: Census cartographic boundary, 1:500k. States: Census 1:10M. Countries: Natural Earth 1:110M world, 1:50M North America. The county outline follows the river; the elevation is the true large-scale shape of the terrain, not survey-grade detail.
