# Gainesboro topo turntable

A slowly rotating 3D contour-line block of the terrain around Gainesboro, Tennessee — real SRTM 30 m elevation, rendered with three.js. One script, no build step, embeds anywhere (Webflow, Squarespace, plain HTML).

**Live demo:** open `index.html`, or after enabling GitHub Pages: `https://volentecreative.github.io/hwi-topo/`

## Embed (Webflow "Embed" element, or any HTML)

Every option, with its default. Delete the lines you are happy with — anything left out
falls back to the value shown here.

```html
<div id="topo" style="width:100%;height:600px"></div>
<script src="https://cdn.jsdelivr.net/gh/volentecreative/hwi-topo@v1.1.0/topo-turntable.js"></script>
<script>
  TopoTurntable.mount('#topo', {

    // --- terrain ---------------------------------------------------------
    radiusMiles:  1.5,          // 1-6, how much land around town is in the block
    shape:        'square',     // 'square' or 'circle'
    rings:        21,           // roughly how many contour lines (the interval snaps to a tidy number)
    exaggeration: 2,            // vertical exaggeration; 1 = true scale, higher = more dramatic relief

    // --- camera ----------------------------------------------------------
    tilt:          31,          // degrees above the horizon; 90 = straight down, 0 = eye level
    lens:          8,           // field of view; lower = flatter and more isometric, higher = more perspective
    startHeading:  140.5,       // which way it faces on load, in degrees
    rotateSeconds: 120,         // seconds per full turn; 0 = hold still
    fitMargin:     1.1,         // breathing room around the block; 1 = edge to edge, higher = more padding
    dragToOrbit:   false,       // let visitors drag to spin it; auto-rotation resumes afterwards

    // --- the block -------------------------------------------------------
    solidBlock:   true,         // filled slab under the contour lines
    blockShading: false,        // true = lit surface, false = flat fill in blockColor
    edgeOutline:  true,         // outline riding the terrain along the top edge
    cornerPosts:  true,         // verticals from the base up to the corners
    baseDepth:    0,            // slab thickness below the lowest ground, as a fraction of the radius
    groundOffset: -0.095,       // where the ground outline sits, as a fraction of the radius;
                                // negative drops it below the terrain, which is what gives the slab
                                // its thickness while baseDepth is 0

    // --- colours (any CSS colour, or a var() that resolves on the page) ---
    background:     'var(--topo-bg, transparent)',
    lineColor:      'var(--topo-line, #d9c49c)',
    lineOpacity:    0.75,
    indexLineColor: 'var(--topo-index, #f2e2bc)',   // every 100 ft
    blockColor:     'var(--topo-block, #1a2129)',

    // --- the pin ---------------------------------------------------------
    label:       'Gainesboro',  // '' hides the pin entirely
    labelHeight: 0.45,          // how far the pin stands above the terrain, as a fraction of the radius
    labelClass:  '',            // style the text with your own classes instead (see below)
    labelColor:  'var(--topo-label, #ff7a5c)',       // ignored when labelClass is set
    labelFont:   '500 15px/1 "Helvetica Neue", Helvetica, Arial, sans-serif',  // ignored when labelClass is set

    // --- sizing ----------------------------------------------------------
    aspectRatio: '16 / 10'      // used only when the container has no height of its own
  });
</script>
```

Or the no-JavaScript way — give any element `data-topo` and it mounts itself:

```html
<div data-topo data-config='{"shape":"circle","rotateSeconds":30}' style="height:500px"></div>
<script src="https://cdn.jsdelivr.net/gh/volentecreative/hwi-topo@v1.1.0/topo-turntable.js"></script>
```

> The URL above is pinned to the `v1.1.0` tag, so it is permanent and served instantly. Bump the tag (or use a commit hash) to pick up changes; `@main` also works but jsDelivr caches it for up to 24 h.

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
the Designer (a hidden one is fine) so they survive publishing, then name them here. Everything
`labelClass` does not set still comes from `labelColor` / `labelFont`, so an empty `labelClass`
leaves the old behaviour untouched.

## Sizing in Webflow

The script fills whatever box the container is given, and re-fits whenever that box changes. It
only needs the page to give the container a width. Inside a horizontal flex row, that means
setting the **Embed** element to `flex: 1` (grow if possible, shrink if needed) or giving it a
width — a flex child left at the default `flex: 0 1 auto` is sized by its content, and the
container has none of its own. Without that the script falls back to a width derived from
`aspectRatio`, capped at the nearest ancestor that has one, which renders correctly but cannot
follow the layout as closely.

## Notes

- ~170 KB script (the elevation grid is baked in). three.js r128 loads from cdnjs automatically if the page doesn't already have `THREE`.
- Pauses rendering when scrolled out of view; honours `prefers-reduced-motion` (stays still).
- Data: NASA SRTM 30 m via OpenTopoData, 37×37 samples over a 12-mile square (6 miles in every direction) centred on 36.35972, -85.65472, spline-interpolated and lightly smoothed. It's the true large-scale shape of the terrain, not survey-grade detail.
