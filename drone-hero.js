/*!
 * drone-hero.js — the heavy-lift drone model drawn as line work, on a scroll-driven camera move onto one of its motors.
 *
 *   <section class="section_hero">                       <!-- ~200vh tall: the track -->
 *     <div class="hero_sticky">                          <!-- sticky, one viewport tall -->
 *       <div id="drone" style="position:absolute;inset:0"></div>
 *       …the copy…
 *     </div>
 *   </section>
 *   <script src="https://cdn.jsdelivr.net/gh/volentecreative/hwi-topo@<commit>/drone-hero.js"></script>
 *   <script>DroneHero.mount('#drone', { focus: 'FR', track: 'closest:.section_hero' });</script>
 *
 * The model (heavy_lift_drone_model.glb, beside this script) is drawn as lines found on screen: a first pass writes
 * each pixel's normal, depth and part, a second draws a one-pixel line wherever those jump — silhouettes and creases
 * alike, the same weight everywhere, with nothing behind showing through. The landing-gear struts, which the model
 * stops short, are carried on down to the skids. The motors' casings (base, coil, cap, shaft) draw in the primary
 * colour, with vertical ribs; everything else in the secondary. The ribs and the floor grid are drawn as screen-space
 * quads with their own coverage, so they stay antialiased at any width. The model's
 * propellers are replaced with generated blades that turn as the page scrolls, neighbours counter-rotating. A floor
 * grid fades toward the frame's edges. With `track` set, the camera dollies along a path over that section's scroll
 * (and writes its progress to a CSS custom property, so the page's copy can move with it):
 * from the whole aircraft, head-on, round and down to beneath the focused motor, looking up at it with the rest of
 * the drone above and behind. Without a track it holds the end of the path. Colours come from CSS variables:
 *   --drone-primary    the motors             (falls back to --topo-label, then #f2f2f0)
 *   --drone-secondary  the rest of the drone  (falls back to --topo-label-secondary, then #9a9a96)
 *   --drone-grid       the floor grid         (falls back to --drone-secondary)
 *   --drone-face       the faces              (falls back to --topo-block, then #222322)
 *   --drone-bg         the canvas             (transparent by default)
 */
(function (global) {
  'use strict';
  const HERE = (document.currentScript && document.currentScript.src) ? document.currentScript.src.replace(/[^/]*$/, '') : '';

  const DEFAULTS = {
    model: '',                 // URL of the GLB; '' = heavy_lift_drone_model.glb beside this script
    loader: 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js',
    focus: 'FL',               // which motor the path ends on: FR, FL, BR, BL, or with ' 2' for the lower ring of the coaxial pairs
    track: '',                 // the tall section the canvas is pinned inside ('closest:.section_hero', a selector, or an element); the camera's path runs over its scroll. '' = hold the end view
    runEnd: '',                // optional: a selector (inside the track) for the element whose top reaching the canvas's top ends the path — e.g. the section the drone is meant to arrive in — instead of the track's own end
    damping: 0.12,             // how closely the camera follows the scroll (per frame at 60fps); 1 = instantly
    fov: 30,                   // the camera's vertical field of view, degrees
    // the end of the path: beneath the focused motor and out to its side, looking up at it. Headings are about the
    // drone: 0 = from the front, positive = round to the drone's right, negative = round to its left
    azimuth: -28,              // camera heading in degrees at the end; or 'auto': side-on to the focused arm, turned by `turn`
    turn: -28,                 // (only with azimuth 'auto') degrees the side-on heading swings round
    elevation: -14,            // camera height above the horizon at the end, degrees; negative looks up from below
    zoom: 0.36,                // the focused motor's height (base to cap) as a fraction of the frame's height
    point: { x: 0.5, y: 0.5 },         // where the ribbed casing sits in the frame at the end (fractions of width and height)
    pointNarrow: { x: 0.5, y: 0.45 },  // … on screens up to `breakpoint` wide
    startPoint: { x: 0.5, y: 0.5 },    // where the whole drone's centre sits at the start; y above 1 puts it below the frame, so only its top peeks in
    startPointNarrow: null,            // … on narrow screens (null = the same)
    breakpoint: 991,
    progressVar: '--drone-progress',   // a CSS custom property the eased, damped progress (0-1) is written to on the track and the host, so the page's own layout can follow the move; '' = none
    flag: false,               // an American flag hung behind the drone, in the same line work, waving slowly as if in a light breeze; true = on
    flagWidth: 37,             // its width in the model's units (the drone spans about 7.5); height follows the 1:1.9 ratio
    flagBottom: 2, flagZ: -22, flagX: 0,   // where its bottom edge hangs, how far back it is, and its centre's x
    flagSway: 0.04,            // the wave's amplitude as a share of the flag's height
    flagSeconds: 16,           // roughly one wave cycle every so many seconds
    flagOpacity: 0.85,         // the stripes' and stars' opacity (their colour is the secondary)
    flagFade: [0.5, 0.85],     // [from, to]: the window of the path's progress over which the flag fades away, so the close-up never shows its edge cut across the frame; null = never
    primaryIn: null,           // [from, to]: the window of the path's progress over which the motors go from the secondary colour to the primary (null = primary throughout)
    exitVar: '',               // a CSS custom property that runs 0-1 over the last viewport of the track's scroll, as the pinned canvas begins to leave with the track's end; '' = none (it costs a layout read per scroll event)
    // the inspection: once the path has arrived (the runEnd section at the top), that section's own scroll steps the
    // camera through three resting poses round the motor, each with a hotspot on the motor and a feature row made
    // active. null = none. See INSPECT for the defaults; pass any subset to change them
    inspect: null,
    // the start of the path: the whole aircraft, centred, level, from the front
    startAzimuth: 0,           // camera heading at the start; 0 = the front view
    startElevation: 0,         // degrees above the horizon at the start; 0 = dead level
    margin: 1.25,              // breathing room round the whole drone at the start (1 = its silhouette touches the frame)
    propScroll: 0.35,          // propeller turns per 1000px of scrolling; 0 = the props do not follow the scroll
    propSeconds: 0,            // seconds per idle turn of every propeller; 0 = still unless scrolled
    props: 'blades',           // 'blades': generated blades in place of the model's; 'model': the model's own
    blades: 2, bladeChord: 0.2, bladeTwist: 22,   // per propeller: blade count, widest chord as a share of the radius, root twist in degrees
    grid: 1, gridFade: 0.3,    // the floor grid's cell, in motor heights (0 = none), and how far from the motor it starts fading (share of the frame's half-size; it is gone by the edges — and by the grid's own edge, in every direction)
    gridExtent: 24, gridWidth: 1,   // how far the grid reaches from the drone's centre, in motor heights, and its line width in CSS pixels
    ribs: 24, ribWidth: 1, ribOpacity: 0.8,   // vertical ribs round each motor's casing (0 = none), their width in CSS pixels and opacity
    lineWidth: 1,              // the edge lines' thickness, in screen pixels
    depthEdge: 0.012, normalEdge: 0.25,   // how big a jump in depth (relative) or in normal (1 - cos) draws a line
    supersample: 2,            // the edge pass runs at this many times the canvas resolution and averages, so the lines are antialiased
    pixelBudget: 8e6,          // the most pixels the edge pass holds at once; a frame that needs more is rendered in tiles, so the quality never drops
    primary: 'var(--drone-primary, var(--topo-label, #f2f2f0))',
    secondary: 'var(--drone-secondary, var(--topo-label-secondary, #9a9a96))',
    gridColor: 'var(--drone-grid, var(--drone-secondary, var(--topo-label-secondary, #9a9a96)))',   // the floor grid's lines, before their fade toward the face colour
    face: 'var(--drone-face, var(--topo-block, #222322))',
    background: 'var(--drone-bg, transparent)',
    pixelRatioCap: 2,
    // on touch devices (a coarse pointer) the work per frame is cut: the canvas at a lower pixel ratio, and at most this many frames a second
    pixelRatioCapCoarse: 1.5,
    fpsCoarse: 30
  };
  const COLOR_KEYS = ['primary', 'secondary', 'gridColor', 'face', 'background'];
  const INSPECT = {
    // the three poses: heading and height about the motor (degrees, the same convention as `azimuth`/`elevation`),
    // the housing's height as a share of the frame, and where the hotspot sits on the housing: `angle` is a heading
    // round it, `height` runs 0-1 from the bottom of the wall to the top (beyond either for the cap or the mount),
    // `radius` is a multiple of the housing's radius. The label is the hotspot's caption
    // the camera passes through each pose at `at` (of the section's scroll; the centre of its window when not given) on
    // one smooth curve from the arrival view: it never stops between poses, only eases to rest after the last. A pose
    // may also move the look-at point from the motor's housing toward the drone's centre (`centre`, 0-1) and put it
    // elsewhere in the frame (`point`, as the top-level one); the anchor is the hotspot's place on the housing
    poses: [
      { azimuth: -40, elevation: -12, zoom: 0.26, anchor: { angle: -42, height: 0.62, radius: 1 }, label: '01' },   // from below and a little round to the left: the whole aircraft
      { azimuth: -90, elevation: 2, zoom: 0.24, anchor: { angle: -70, height: 0.5, radius: 1 }, label: '02' },       // the profile, from the drone's left, dead level
      { azimuth: -180, elevation: 90, zoom: 0.085, centre: 1, anchor: { angle: -135, height: 1.14, radius: 0.55 }, label: '03' }   // straight down, the drone centred, its nose up
    ],
    windows: [[0.4, 0.6], [0.6, 0.8], [0.8, 1]],   // of the section's scroll: each pose's window, where its hotspot shows and its row is active; before the first is the intro
    settle: 0.04,              // the hotspot fades in over this much scroll after its window begins, and out over as much before it ends
    rows: '[data-inspect]',    // the feature rows, numbered 1.. in that attribute; the active one gets `activeClass`
    activeClass: 'is-active',
    hotspotClass: '',          // CSS class(es) for the hotspot labels (e.g. the site's eyebrow style)
    leader: [-72, -36, -64],   // the leader line from the hotspot: out by (dx, dy) px, then a run of this many px (negative = leftward, the label at its end)
    inspectVar: '--drone-inspect'   // a CSS custom property the inspection's progress (0-1) is written to
  };

  function resolveColor(host, v) {
    if (typeof v !== 'string') return v;
    const m = v.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*(.+?)\s*)?\)$/);
    if (!m) return v;
    const got = getComputedStyle(host).getPropertyValue(m[1]).trim();
    const ok = got && !/var\(/.test(got) && (got === 'transparent' || (global.CSS && CSS.supports && CSS.supports('color', got)));
    return ok ? got : (m[2] ? resolveColor(host, m[2]) : 'transparent');
  }
  const loadScript = (src, ready) => { if (ready()) return Promise.resolve(); const key = '__loading_' + src; if (!global[key]) global[key] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('failed to load ' + src)); document.head.appendChild(s); }); return global[key]; };
  const loadThree = () => loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', () => !!global.THREE);
  const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  // a propeller: `n` blades about the y axis, radius R, hub radius r0. Each blade is a lofted solid: a thin lens
  // section at stations along the span, chord widest a third of the way out and tapering to the tip, pitched
  // (twisted) most at the root — so it reads as a propeller from every angle, with a sharp leading and trailing edge
  function propellerGeometry(THREE, R, r0, n, chordMax, twistDeg) {
    const pos = [], idx = [], NS = 14, NP = 10;
    for (let b = 0; b < n; b++) {
      const rot = b * Math.PI * 2 / n, base = pos.length / 3;
      for (let s = 0; s <= NS; s++) {
        const t = s / NS, r = r0 + (R - r0) * t;
        const chord = R * chordMax * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.25))) * (1 - 0.55 * Math.max(0, t - 0.6) / 0.4);
        const th = (twistDeg * (1 - 0.65 * t)) * Math.PI / 180, thick = chord * 0.09, sweep = 0.12 * chord * t;
        for (let p = 0; p < NP; p++) {
          const a = p / NP * Math.PI * 2, cx = Math.cos(a) * chord / 2 + sweep, cy = Math.sin(a) * thick / 2 * (1 - 0.35 * Math.abs(Math.cos(a)));
          const yy = cy * Math.cos(th) - cx * Math.sin(th), zz = cy * Math.sin(th) + cx * Math.cos(th);
          pos.push(r * Math.cos(rot) - zz * Math.sin(rot), yy, r * Math.sin(rot) + zz * Math.cos(rot));
        }
      }
      for (let s = 0; s < NS; s++) for (let p = 0; p < NP; p++) { const a = base + s * NP + p, b2 = base + s * NP + (p + 1) % NP, c = a + NP, d = b2 + NP; idx.push(a, c, b2, b2, c, d); }
      const rootC = pos.length / 3; pos.push(r0 * Math.cos(rot), 0, r0 * Math.sin(rot)); for (let p = 0; p < NP; p++) idx.push(rootC, base + (p + 1) % NP, base + p);
      const tipC = pos.length / 3; pos.push(R * Math.cos(rot), 0, R * Math.sin(rot)); const tb = base + NS * NP; for (let p = 0; p < NP; p++) idx.push(tipC, tb + p, tb + (p + 1) % NP);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  }

  // the edge pass: pass one writes normal (rgb) and part (a: one id per mesh, the focused motor's casing in the top
  // range) with depth; pass two draws a line, in that part's colour, on the nearer side wherever two parts meet on
  // screen (or a part meets the background), on a part's own silhouette over itself, and along its creases
  const ID_VERT = 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
  const ID_FRAG = 'uniform float uId; varying vec3 vN; void main(){ gl_FragColor = vec4(normalize(vN) * 0.5 + 0.5, uId); }';
  const EDGE_FRAG = `
    uniform sampler2D tN, tD; uniform vec2 uRes; uniform vec4 uTile; uniform float uNear, uFar, uWidth, uDepthT, uNormT, uFlagA; uniform vec3 uC1, uC2;
    float lin(float z){ float zn = 2.0 * z - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - zn * (uFar - uNear)); }
    // the line at one point of the (supersampled) pass: 0 = none, 1 = a line, and which colour it takes
    float edgeAt(vec2 uv, out vec3 col){
      vec2 px = uWidth / uRes; vec4 c = texture2D(tN, uv); float d = lin(texture2D(tD, uv).x); vec3 n = c.xyz * 2.0 - 1.0;
      col = c.a > 0.75 ? uC1 : uC2; float fa = (c.a > 0.35 && c.a < 0.55) ? uFlagA : 1.0;   // the flag's ids sit in the middle range, so its lines can fade
      if (c.a < 0.002) return 0.0;                               // background (ids start at 1/255): lines are drawn from the object's side
      float e = 0.0;
      for (int i = 0; i < 2; i++) {                              // each axis: the two neighbours either side
        vec2 o = i == 0 ? vec2(px.x, 0.0) : vec2(0.0, px.y);
        vec4 c1 = texture2D(tN, uv + o), c2 = texture2D(tN, uv - o); float d1 = lin(texture2D(tD, uv + o).x), d2 = lin(texture2D(tD, uv - o).x);
        bool own1 = abs(c1.a - c.a) < 0.002, own2 = abs(c2.a - c.a) < 0.002;   // the neighbour is on this same part
        // another part, or the background: the boundary is a line, owned by whichever side is nearer
        if (!own1 && (c1.a < 0.002 || d < d1)) e = 1.0;
        if (!own2 && (c2.a < 0.002 || d < d2)) e = 1.0;
        // this part over itself: a surface seen at a grazing angle changes depth steadily, a silhouette breaks it —
        // so test the second difference, and let the nearer side of the break own the line
        if (own1 && own2) { float bend = abs(d1 + d2 - 2.0 * d) / d;
          e = max(e, smoothstep(uDepthT, uDepthT * 3.0, bend) * step(d, max(d1, d2) - uDepthT * 0.5 * d)); }
        // a crease between two faces of this part; the side with the greater normal key draws it
        for (int k = 0; k < 2; k++) { vec4 cn = k == 0 ? c1 : c2; float dn = k == 0 ? d1 : d2; bool own = k == 0 ? own1 : own2;
          if (own && abs(dn - d) / d < uDepthT * 2.0) { vec3 nn = normalize(cn.xyz * 2.0 - 1.0);
            float key = dot(n, vec3(0.3, 0.59, 0.11)), keyn = dot(nn, vec3(0.3, 0.59, 0.11));
            e = max(e, key >= keyn ? smoothstep(uNormT, uNormT * 2.0, 1.0 - dot(n, nn)) : 0.0); } }
      }
      return e * fa;
    }
    void main(){
      // this canvas pixel's place in the tile's pass (uTile: the tile's origin and size in canvas pixels), then four
      // points inside the pixel, averaged: coverage, so the line is antialiased (premultiplied out)
      vec2 uv = (gl_FragCoord.xy - uTile.xy) / uTile.zw, q = 0.25 / uTile.zw; vec3 rgb = vec3(0.0), col; float a = 0.0, e;
      e = edgeAt(uv + vec2(-q.x, -q.y), col); rgb += col * e; a += e;
      e = edgeAt(uv + vec2( q.x, -q.y), col); rgb += col * e; a += e;
      e = edgeAt(uv + vec2(-q.x,  q.y), col); rgb += col * e; a += e;
      e = edgeAt(uv + vec2( q.x,  q.y), col); rgb += col * e; a += e;
      if (a < 0.02) discard;
      gl_FragColor = vec4(rgb, a) * 0.25;
    }`;

  // drawn lines (the ribs and the grid): each segment is a quad the vertex shader expands on screen to the line's width
  // plus a pixel of feather, and the fragment fades by its distance from the centreline — antialiased at any width,
  // which GL lines are not. A segment crossing the near plane is clipped to it first. The grid fades by each end's
  // distance from the focus on screen.
  const LINE_VERT = `
    uniform vec2 uRes, uFocus, uCentre; uniform float uHalf, uNear, uFade0, uFadeOn, uExtent;
    attribute vec3 pointA, pointB; attribute vec2 corner; varying vec2 vD; varying float vLen, vF;
    void main(){
      vec4 va = modelViewMatrix * vec4(pointA, 1.0), vb = modelViewMatrix * vec4(pointB, 1.0); float nz = -uNear * 1.001;
      if (va.z > nz && vb.z > nz) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vD = vec2(0.0); vLen = 0.0; vF = 1.0; return; }
      if (va.z > nz) va = mix(va, vb, (nz - va.z) / (vb.z - va.z)); else if (vb.z > nz) vb = mix(vb, va, (nz - vb.z) / (va.z - vb.z));
      vec4 ca = projectionMatrix * va, cb = projectionMatrix * vb;
      vec2 sa = ca.xy / ca.w * uRes * 0.5, sb = cb.xy / cb.w * uRes * 0.5;
      vec2 d = sb - sa; float len = max(length(d), 1e-4); d /= len; vec2 n = vec2(-d.y, d.x);
      bool B = corner.x > 0.5; vec4 c = B ? cb : ca; vec2 s = (B ? sb : sa) + (B ? d : -d) * uHalf + n * corner.y * uHalf;
      vD = vec2(corner.y * uHalf, B ? len + uHalf : -uHalf); vLen = len;
      float r = distance(c.xy / c.w, uFocus), rw = distance((B ? pointB : pointA).xz, uCentre) / uExtent;   // on screen, and on the ground
      vF = uFadeOn * max(clamp((r - uFade0) / (1.0 - uFade0), 0.0, 1.0), smoothstep(0.4, 0.95, rw));
      gl_Position = vec4(s / (uRes * 0.5) * c.w, c.z, c.w);
    }`;
  const LINE_FRAG = `
    uniform vec3 uColor, uBg; uniform float uWidth, uOpacity, uFadeOn; varying vec2 vD; varying float vLen, vF;
    void main(){
      float w = uWidth * 0.5;
      float a = (1.0 - smoothstep(w - 0.5, w + 0.5, abs(vD.x))) * (1.0 - smoothstep(w - 0.5, w + 0.5, -vD.y)) * (1.0 - smoothstep(w - 0.5, w + 0.5, vD.y - vLen));
      if (a < 0.003) discard;
      gl_FragColor = vec4(mix(uColor, uBg, uFadeOn * (0.55 + 0.45 * vF)), a * uOpacity);
    }`;

  function build(host, CONFIG, gltf) {
    const THREE = global.THREE, D2R = Math.PI / 180;
    const RAW = {}; for (const k of COLOR_KEYS) { RAW[k] = CONFIG[k]; CONFIG[k] = resolveColor(host, CONFIG[k]); }
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.style.background = CONFIG.background; host.style.overflow = 'hidden';
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });   // the faces, ribs and grid get multisampling; the lines are supersampled in their own pass
    renderer.setClearColor(0x000000, 0); renderer.autoClear = false;
    Object.assign(renderer.domElement.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' });
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(+CONFIG.fov || 30, 1, 0.05, 200);
    const faceMat = new THREE.MeshBasicMaterial({ color: CONFIG.face, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    const lineMaterial = (color, fade, opacity) => new THREE.ShaderMaterial({ vertexShader: LINE_VERT, fragmentShader: LINE_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uRes: { value: new THREE.Vector2(1, 1) }, uFocus: { value: new THREE.Vector2() }, uHalf: { value: 1 }, uWidth: { value: 1 }, uNear: { value: 0.05 }, uFade0: { value: 0.3 }, uFadeOn: { value: fade ? 1 : 0 }, uCentre: { value: new THREE.Vector2() }, uExtent: { value: 1 }, uColor: { value: new THREE.Color(color) }, uBg: { value: new THREE.Color(CONFIG.face) }, uOpacity: { value: opacity } } });
    const ribMat = lineMaterial(CONFIG.primary, false, +CONFIG.ribOpacity), gridMat = lineMaterial(CONFIG.gridColor, true, 1), lineMats = [ribMat, gridMat];
    const lineMesh = (segs, mat) => {   // segs: ax ay az bx by bz per segment; four corners each (A-, A+, B-, B+)
      const n = segs.length / 6, A = new Float32Array(n * 12), B = new Float32Array(n * 12), C = new Float32Array(n * 8), idx = [];
      for (let i = 0; i < n; i++) { for (let k = 0; k < 4; k++) { const v = i * 4 + k; for (let j = 0; j < 3; j++) { A[v * 3 + j] = segs[i * 6 + j]; B[v * 3 + j] = segs[i * 6 + 3 + j]; } C[v * 2] = k >> 1; C[v * 2 + 1] = (k & 1) ? 1 : -1; } const b = i * 4; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(A, 3)); g.setAttribute('pointA', new THREE.BufferAttribute(A, 3)); g.setAttribute('pointB', new THREE.BufferAttribute(B, 3)); g.setAttribute('corner', new THREE.BufferAttribute(C, 2)); g.setIndex(idx);
      const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.userData.isLines = true; return m; };
    const solids = []; let ids = [0, 255];   // part ids: the rest count up from 1, the focused motor's casing down from 255 (the edge pass colours ids above 191 primary)
    const solid = (g, mine, fixedId) => { const m = new THREE.Mesh(g, faceMat); const id = fixedId || (mine ? ids[1]-- : ++ids[0]);
      m.userData.idMat = new THREE.ShaderMaterial({ vertexShader: ID_VERT, fragmentShader: ID_FRAG, uniforms: { uId: { value: id / 255 } } }); solids.push(m); scene.add(m); return m; };
    // the edge pass's target and quad
    const isGL2 = renderer.capabilities.isWebGL2;
    const depthTex = new THREE.DepthTexture(1, 1); depthTex.type = isGL2 ? THREE.UnsignedIntType : THREE.UnsignedShortType;
    const rt = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthTexture: depthTex, depthBuffer: true, stencilBuffer: false });
    const edgeMat = new THREE.ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation, vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: EDGE_FRAG,
      uniforms: { tN: { value: rt.texture }, tD: { value: depthTex }, uRes: { value: new THREE.Vector2(1, 1) }, uTile: { value: new THREE.Vector4(0, 0, 1, 1) }, uNear: { value: camera.near }, uFar: { value: camera.far }, uWidth: { value: 1 }, uDepthT: { value: +CONFIG.depthEdge || 0.012 }, uNormT: { value: +CONFIG.normalEdge || 0.25 }, uFlagA: { value: 1 }, uC1: { value: new THREE.Color(CONFIG.primary) }, uC2: { value: new THREE.Color(CONFIG.secondary) } } });
    // the quad the lines are drawn with covers one tile of the canvas at a time
    const quadGeo = new THREE.BufferGeometry(); quadGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3)); quadGeo.setIndex([0, 1, 2, 0, 2, 3]);
    const quadScene = new THREE.Scene(), quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); const quad = new THREE.Mesh(quadGeo, edgeMat); quad.frustumCulled = false; quadScene.add(quad);
    const setQuad = (x0, y0, x1, y1) => { const p = quadGeo.attributes.position; p.setXYZ(0, x0, y0, 0); p.setXYZ(1, x1, y0, 0); p.setXYZ(2, x1, y1, 0); p.setXYZ(3, x0, y1, 0); p.needsUpdate = true; };   // NDC corners

    // ---- the model, baked into world space; parts are told apart by name (the loader writes spaces as underscores)
    const key = String(CONFIG.focus || 'FR').trim();
    const partOf = name => { const m = /^(Motor[ _]Base|Motor[ _]Coil|Motor[ _]Cap|Motor[ _]Shaft|Prop[ _]Hub|Propeller|Arm)[ _](FR|FL|BR|BL)(?:[ _](2))?$/.exec(name || ''); return m ? { part: m[1].replace('_', ' '), pos: m[2] + (m[3] ? ' 2' : '') } : null; };
    const skip = name => /^mesh_\d+_instance/.test(name || '');
    gltf.scene.updateMatrixWorld(true);
    const motorBox = new THREE.Box3(), armBox = new THREE.Box3(), all = new THREE.Box3(); const coils = {};   // per motor: its housing (the Motor Base): box, centre, radius and the straight wall's y-range, for the ribs and rims
    const hubs = {}, propInfo = {};
    const meshes = []; gltf.scene.traverse(o => { if (o.isMesh && !skip(o.name)) meshes.push(o); });
    // the skids (the long tubes), so the struts can be carried down to them
    const skids = []; for (const o of meshes) if (/^Skid[ _](Left|Right)$/.test(o.name)) { const b = o.geometry.clone().applyMatrix4(o.matrixWorld); b.computeBoundingBox(); skids.push(b.boundingBox); }
    const extendLeg = (o, g) => {   // the strut is a cylinder along its local y; shear it so its lower end lands inside the nearest skid
      if (!/^Leg[ _]/.test(o.name) || !skids.length) return; const lb = o.geometry.boundingBox || (o.geometry.computeBoundingBox(), o.geometry.boundingBox);
      let A = new THREE.Vector3(0, lb.max.y, 0).applyMatrix4(o.matrixWorld), B = new THREE.Vector3(0, lb.min.y, 0).applyMatrix4(o.matrixWorld); if (B.y > A.y) [A, B] = [B, A];
      const skid = skids.reduce((best, b) => { const c = b.getCenter(new THREE.Vector3()); const d = Math.abs(c.x - B.x); return d < best.d ? { d, b, c } : best; }, { d: Infinity }); if (!skid.b) return;
      const r = (skid.b.max.y - skid.b.min.y) / 2, Bn = new THREE.Vector3(skid.c.x, skid.c.y + r * 0.5, B.z);   // land a little above the tube's axis, inside it
      const u = B.clone().sub(A), L = u.length(); if (L < 1e-6) return; u.divideScalar(L); const shift = Bn.sub(B);
      const p = g.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const t = v.clone().sub(A).dot(u) / L; v.addScaledVector(shift, t); p.setXYZ(i, v.x, v.y, v.z); }
      p.needsUpdate = true; g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere();   // the sphere too: the tiled pass culls by it
    };
    let tris = 0;
    for (const o of meshes) {
      const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); extendLeg(o, g); if (!g.attributes.normal) g.computeVertexNormals(); g.computeBoundingBox(); all.union(g.boundingBox);
      const info = partOf(o.name), isFocus = !!(info && info.pos === key);
      const mine = !!(info && /^Motor/.test(info.part));
      if (mine) { if (isFocus) motorBox.union(g.boundingBox);
        if (info.part === 'Motor Base') {   // the housing: its widest radius, and the y-range of the straight wall at that radius (inside any fillets at the ends)
          const b = g.boundingBox, c = new THREE.Vector3(); b.getCenter(c); const p = g.attributes.position; let r = 0; for (let i = 0; i < p.count; i++) r = Math.max(r, Math.hypot(p.getX(i) - c.x, p.getZ(i) - c.z));
          let y0 = Infinity, y1 = -Infinity; for (let i = 0; i < p.count; i++) if (Math.hypot(p.getX(i) - c.x, p.getZ(i) - c.z) >= r * 0.995) { y0 = Math.min(y0, p.getY(i)); y1 = Math.max(y1, p.getY(i)); }
          if (!(y1 > y0)) { y0 = b.min.y; y1 = b.max.y; } coils[info.pos] = { box: b.clone(), c, r, y0, y1 }; } }
      if (isFocus && info.part === 'Arm') armBox.union(g.boundingBox);
      if (info && info.part === 'Prop Hub') hubs[info.pos] = g.boundingBox.clone();
      if (info && info.part === 'Propeller') { propInfo[info.pos] = g.boundingBox.clone(); if (CONFIG.props !== 'model') continue; }
      tris += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
      solid(g, mine);
    }
    const props = [];
    if (CONFIG.props !== 'model') for (const pos of Object.keys(propInfo)) {
      const pb = propInfo[pos], hb = hubs[pos] || pb, c = new THREE.Vector3(); hb.getCenter(c);
      const R = Math.max(pb.max.x - pb.min.x, pb.max.z - pb.min.z) / 2, r0 = Math.max(hb.max.x - hb.min.x, hb.max.z - hb.min.z) / 2 * 0.9, y = (pb.min.y + pb.max.y) / 2;
      const g = propellerGeometry(THREE, R, r0, Math.max(2, CONFIG.blades | 0), +CONFIG.bladeChord || 0.2, +CONFIG.bladeTwist || 22); tris += g.index.count / 3;
      const m = solid(g, false); m.position.set(c.x, y, c.z);
      const ring = / 2$/.test(pos) ? 1 : 0, quad = /^(FR|BL)/.test(pos) ? 1 : -1;
      props.push({ mesh: m, dir: quad * (ring ? -1 : 1), phase: Math.random() * Math.PI * 2 });
    }
    // the motors' ribbing: vertical lines round each one's tallest casing part, just off its surface
    // the housings' ribbing: vertical lines along each one's straight wall, just off its surface, and a rim line round
    // each end of the wall (the model rounds those edges, so the edge pass finds no crease there)
    if (CONFIG.ribs > 0) { const a = [], N = 96;
      for (const pos of Object.keys(coils)) { const { c, y0, y1 } = coils[pos], r = coils[pos].r * 1.004;
        for (let k = 0; k < CONFIG.ribs; k++) { const t = (k + 0.5) / CONFIG.ribs * Math.PI * 2, x = c.x + Math.cos(t) * r, z = c.z + Math.sin(t) * r; a.push(x, y0, z, x, y1, z); }
        for (const y of [y0, y1]) for (let k = 0; k < N; k++) { const t0 = k / N * Math.PI * 2, t1 = (k + 1) / N * Math.PI * 2; a.push(c.x + Math.cos(t0) * r, y, c.z + Math.sin(t0) * r, c.x + Math.cos(t1) * r, y, c.z + Math.sin(t1) * r); } }
      if (a.length) scene.add(lineMesh(a, ribMat));
    }
    // ---- the flag: a cloth hung from its top edge behind the drone, its faces occluding like the rest, the stripes,
    // canton and stars drawn as lines on the surface; every point is displaced each frame by a slow, soft wave
    let flag = null, flagReach = 0;   // how far the scene extends behind the drone because of the flag, for the far plane
    if (CONFIG.flag) {
      const W = +CONFIG.flagWidth || 37, H = W / 1.9, X0 = (+CONFIG.flagX || 0) - W / 2, Y0 = +CONFIG.flagBottom || 0, Z0 = +CONFIG.flagZ || -22, A = H * (+CONFIG.flagSway || 0.04);
      flagReach = Math.abs(Z0) + Math.hypot(W, H);
      const NX = 48, NY = 26, cloth = new THREE.PlaneGeometry(W, H, NX, NY); cloth.translate(X0 + W / 2, Y0 + H / 2, Z0);
      const clothBase = Float32Array.from(cloth.attributes.position.array); const clothMesh = solid(cloth, false, 110); clothMesh.frustumCulled = false;   // id 110: the middle range the edge pass fades tris += cloth.index.count / 3;
      const seg = [], uv = [];   // the lines: base points as (u, v) on the flag, u from the hoist, v from the bottom
      const add = (u0, v0, u1, v1) => { seg.push(0, 0, 0, 0, 0, 0); uv.push(u0, v0, u1, v1); };
      const poly = (pts, n) => { for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; for (let k = 0; k < n; k++) add(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n, a[0] + (b[0] - a[0]) * (k + 1) / n, a[1] + (b[1] - a[1]) * (k + 1) / n); } };
      const cw = 0.76 * H, ch = 7 / 13 * H;   // the canton
      for (let i = 1; i < 13; i++) { const v = H * i / 13, u0 = v > H - ch ? cw : 0; for (let k = 0; k < NX; k++) { const a = u0 + (W - u0) * k / NX, b = u0 + (W - u0) * (k + 1) / NX; add(a, v, b, v); } }
      for (let k = 0; k < 20; k++) add(cw * k / 20, H - ch, cw * (k + 1) / 20, H - ch);   // the canton's bottom edge…
      for (let k = 0; k < 12; k++) add(cw, H - ch + ch * k / 12, cw, H - ch + ch * (k + 1) / 12);   // … and its stripe-side edge
      poly([[0, 0], [W, 0], [W, H], [0, H]], 24);   // the outer edge
      const rs = 0.0308 * H, r2 = rs * 0.382; for (let row = 0; row < 9; row++) { const n = row % 2 ? 5 : 6; for (let col = 0; col < n; col++) {   // fifty stars, five points each
        const cx = cw * (row % 2 ? (col + 1) / 6 : (col + 0.5) / 6) , cy = H - ch + ch * (9 - row - 0.5) / 9, pts = []; for (let k = 0; k < 10; k++) { const a = Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? r2 : rs; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } poly(pts, 1); } }
      const flagMat = lineMaterial(CONFIG.secondary, false, +CONFIG.flagOpacity || 0.85); lineMats.push(flagMat); const lines = lineMesh(seg, flagMat); scene.add(lines);
      const wave = (u, v, t, out) => {   // the displacement of the point (u, v) at time t: fixed along the top edge, growing toward the bottom, slow crossing waves, and a lazy sideways sway
        const hang = 1 - v / H, w = hang * hang, ph = t * Math.PI * 2 / (+CONFIG.flagSeconds || 16);
        out[0] = A * 0.3 * Math.sin(ph * 0.37 + v / H) * hang; out[1] = 0;
        out[2] = A * (0.62 * Math.sin(u / W * 4.2 - ph + v / H * 1.3) + 0.38 * Math.sin(u / W * 7.5 + ph * 0.61 + 1.7)) * (0.15 + 0.85 * w) * (0.55 + 0.45 * u / W);
      };
      const d = [0, 0, 0];
      flag = { mat: flagMat, update(t) {
        const p = cloth.attributes.position; for (let i = 0; i < p.count; i++) { const bx = clothBase[i * 3], by = clothBase[i * 3 + 1]; wave(bx - X0, by - Y0, t, d); p.setXYZ(i, bx + d[0], by + d[1], clothBase[i * 3 + 2] + d[2]); } p.needsUpdate = true; cloth.computeVertexNormals();
        const A_ = lines.geometry.attributes.pointA, B_ = lines.geometry.attributes.pointB, P_ = lines.geometry.attributes.position, n = uv.length / 4;
        for (let i = 0; i < n; i++) { const u0 = uv[i * 4], v0 = uv[i * 4 + 1], u1 = uv[i * 4 + 2], v1 = uv[i * 4 + 3];
          wave(u0, v0, t, d); const ax = X0 + u0 + d[0], ay = Y0 + v0, az = Z0 + d[2] + 0.04; wave(u1, v1, t, d); const bx = X0 + u1 + d[0], by = Y0 + v1, bz = Z0 + d[2] + 0.04;
          for (let k = 0; k < 4; k++) { const j = i * 4 + k; A_.setXYZ(j, ax, ay, az); B_.setXYZ(j, bx, by, bz); P_.setXYZ(j, ax, ay, az); } }
        A_.needsUpdate = B_.needsUpdate = P_.needsUpdate = true;
      } };
      flag.update(0);
    }
    // ---- the two ends of the path
    // the camera aims at the centre of the ribbed casing (the motor's tallest part), not of the whole motor with its shaft, so the casing sits where `point` says
    const target = new THREE.Vector3(); (coils[key] ? coils[key].box : motorBox).getCenter(target);
    const motorH = Math.max(1e-3, motorBox.max.y - motorBox.min.y);
    const armDir = new THREE.Vector3(); (armBox.isEmpty() ? all : armBox).getCenter(armDir); armDir.sub(target); armDir.y = 0; if (armDir.lengthSq() < 1e-9) armDir.set(1, 0, 0); armDir.normalize();
    const azimuth = () => CONFIG.azimuth === 'auto' || CONFIG.azimuth === undefined ? Math.atan2(armDir.x, armDir.z) / D2R - 90 + (+CONFIG.turn || 0) : +CONFIG.azimuth;
    const azimuth0 = () => CONFIG.startAzimuth === 'auto' || CONFIG.startAzimuth === undefined ? azimuth() : +CONFIG.startAzimuth;
    // the opening distance: the drone's box, seen from the start heading, fitted to the frame with the margin
    const fitDistance = (azDeg, elDeg, fov, a) => { const az = azDeg * D2R, el = elDeg * D2R; const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
      const cam = new THREE.PerspectiveCamera(fov / D2R, a, 0.01, 1000); cam.position.copy(droneC).add(dir); cam.lookAt(droneC); cam.updateMatrixWorld(); const inv = cam.matrixWorldInverse;
      let need = 0; for (const x of [all.min.x, all.max.x]) for (const y of [all.min.y, all.max.y]) for (const z of [all.min.z, all.max.z]) { const q = new THREE.Vector3(x, y, z).applyMatrix4(inv); const depth = -q.z;   // camera space: the point's offset from the target's depth
        need = Math.max(need, Math.abs(q.y) / Math.tan(fov / 2) + depth, Math.abs(q.x) / (Math.tan(fov / 2) * a) + depth); }   // the distance at which this corner just fits
      return need; };
    const droneC = new THREE.Vector3(); all.getCenter(droneC); const droneR = all.getSize(new THREE.Vector3()).length() / 2;
    // ---- the floor grid: centred under the drone, one segment per cell edge so its fade (by each point's distance
    // from the focus on screen and from the centre on the ground, in the shader) follows the frame and never shows an edge
    let grid = null;
    function buildGrid() {
      if (grid) { scene.remove(grid); grid.geometry.dispose(); grid = null; } const cell = motorH * (+CONFIG.grid || 0); if (!(cell > 0)) return;
      const y = all.min.y, n = Math.ceil(motorH * (+CONFIG.gridExtent || 24) / cell), pos = [], cx = droneC.x, cz = droneC.z;
      for (let i = -n; i <= n; i++) { const o = i * cell; for (let j = -n; j < n; j++) { const a = j * cell, b = (j + 1) * cell; pos.push(cx + o, y, cz + a, cx + o, y, cz + b, cx + a, y, cz + o, cx + b, y, cz + o); } }
      gridMat.uniforms.uCentre.value.set(cx, cz); gridMat.uniforms.uExtent.value = n * cell;
      grid = lineMesh(pos, gridMat); scene.add(grid); fadeGrid();
    }
    let motorMix = 1;   // 0 = the motors in the secondary colour, 1 = in the primary
    function motorColor(e) {
      const w = CONFIG.primaryIn; motorMix = Array.isArray(w) && w.length === 2 && w[1] > w[0] ? Math.min(1, Math.max(0, (e - w[0]) / (w[1] - w[0]))) : 1;
      const c = new THREE.Color(CONFIG.secondary).lerp(new THREE.Color(CONFIG.primary), motorMix); ribMat.uniforms.uColor.value.copy(c); edgeMat.uniforms.uC1.value.copy(c);
    }
    function fadeGrid() {   // where the focus sits on screen, and how far out the fade starts
      const t = new THREE.Vector3().copy(camTarget).project(camera); gridMat.uniforms.uFocus.value.set(t.x, t.y); gridMat.uniforms.uFade0.value = Math.max(0, Math.min(0.95, +CONFIG.gridFade || 0.3));
    }
    // ---- the path: spherical about a target that slides from the drone's centre to the motor, distance in log
    // space, heading and height easing between the two ends, the framing point too — one camera, really moving
    // pos: the approach and the inspection as one scroll value (0-2), damped as one so the hand-over never jumps
    let w = 1, h = 1, progress = 0, progressTarget = 0, shownProgress = -1, insp = 0, inspTarget = 0, shownInsp = -1, pos = 0, posTarget = 0; const camTarget = droneC.clone(); const T = { nx: 1, ny: 1, w: 1, h: 1, g: 3, PR: 1, S: 1, W: 1, H: 1 };   // the edge pass's tiling
    const trackEl = (() => { const t = CONFIG.track; if (!t) return null; if (t.nodeType) return t; if (typeof t === 'string' && t.startsWith('closest:')) return host.closest(t.slice(8)); return document.querySelector(t); })();
    const endEl = trackEl && CONFIG.runEnd ? (typeof CONFIG.runEnd === 'string' ? trackEl.querySelector(CONFIG.runEnd) : CONFIG.runEnd) : null;
    const readProgress = () => { if (!trackEl) return 1; const r = trackEl.getBoundingClientRect();
      if (endEl) { const er = endEl.getBoundingClientRect(), hr = host.getBoundingClientRect(); return Math.min(1, Math.max(0, 1 - (er.top - hr.top) / Math.max(1, er.top - r.top))); }   // done when the end element reaches the canvas's top
      const run = Math.max(1, r.height - h); return Math.min(1, Math.max(0, -r.top / run)); };
    // the inspection's progress: how far the end section has scrolled past the canvas's top, over its extra height
    const inspect = CONFIG.inspect ? Object.assign({}, INSPECT, CONFIG.inspect) : null;
    const readInspect = () => { if (!inspect || !endEl) return 0; const er = endEl.getBoundingClientRect(), hr = host.getBoundingClientRect(); return Math.min(1, Math.max(0, (hr.top - er.top) / Math.max(1, er.height - hr.height))); };
    // a CSS custom property on the host and the track, in steps of 0.01 and only when it changes: each write invalidates the track's styles
    const varLast = {}; const setVar = (name, v) => { if (!name) return; const s = v.toFixed(2); if (varLast[name] === s) return; varLast[name] = s; host.style.setProperty(name, s); if (trackEl) trackEl.style.setProperty(name, s); };
    const isNarrow = () => !!(global.matchMedia && global.matchMedia('(max-width: ' + (+CONFIG.breakpoint || 991) + 'px)').matches);
    const endPoint = () => (isNarrow() && CONFIG.pointNarrow) || CONFIG.point || { x: 0.5, y: 0.5 };
    const zoomDist = z => motorH / (2 * Math.tan((+CONFIG.fov || 30) * D2R / 2) * Math.max(0.05, z || 0.36));
    // the camera at a heading (radians) and distance from camTarget, with the target at (px, py) of the frame
    function aim(az, el, dist, px, py) {
      const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
      camera.up.set(-Math.sin(az) * Math.sin(el), Math.cos(el), -Math.cos(az) * Math.sin(el));   // the roll stays continuous up to straight overhead
      camera.position.copy(camTarget).add(dir.multiplyScalar(dist)); camera.lookAt(camTarget);
      camera.near = Math.max(0.02, dist * 0.05); camera.far = dist + droneR * 4 + flagReach; edgeMat.uniforms.uNear.value = camera.near; edgeMat.uniforms.uFar.value = camera.far; for (const m of lineMats) m.uniforms.uNear.value = camera.near;
      camera.setViewOffset(w, h, (0.5 - px) * w, (0.5 - py) * h, w, h); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    }
    // ---- the inspection: the camera orbits the motor through the poses, on one smooth curve, as the end section scrolls
    let hot = null;   // the hotspots' overlay: { svg, items: [{ g, dot, ring, path, label }] }
    function buildHotspots() {
      if (!inspect) return; const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
      Object.assign(svg.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' });
      const items = inspect.poses.map(p => { const g = document.createElementNS(NS, 'g'); g.style.opacity = '0';
        const ring = document.createElementNS(NS, 'circle'); ring.setAttribute('r', '8'); ring.setAttribute('fill', 'none'); ring.setAttribute('stroke-width', '1'); ring.setAttribute('opacity', '0.7');
        const dot = document.createElementNS(NS, 'circle'); dot.setAttribute('r', '2.5');
        const path = document.createElementNS(NS, 'path'); path.setAttribute('fill', 'none'); path.setAttribute('stroke-width', '1');
        g.append(ring, dot, path); svg.appendChild(g);
        const label = document.createElement('div'); if (inspect.hotspotClass) label.className = inspect.hotspotClass; label.textContent = p.label || '';
        Object.assign(label.style, { position: 'absolute', left: '0', top: '0', whiteSpace: 'nowrap', pointerEvents: 'none', opacity: '0', margin: '0' }); host.appendChild(label);
        return { g, dot, ring, path, label }; });
      host.appendChild(svg); hot = { svg, items };
    }
    const anchorOf = p => { const hs = coils[key], a = p.anchor || {}; if (!hs) return target.clone(); const ang = (+a.angle || 0) * D2R, r = hs.r * (a.radius == null ? 1 : +a.radius);
      return new THREE.Vector3(hs.c.x + Math.sin(ang) * r, hs.y0 + (a.height == null ? 0.5 : +a.height) * (hs.y1 - hs.y0), hs.c.z + Math.cos(ang) * r); };
    const rowEls = () => { if (!inspect || !inspect.rows) return []; const out = []; document.querySelectorAll(inspect.rows).forEach(el => { const n = parseInt(el.getAttribute('data-inspect'), 10); if (n > 0) out.push({ el, n }); }); return out; };
    let rows = null, activeRow = -1;
    // a monotone cubic through (ts[i], vs[i]), steady at the start and flat at the end: no overshoot, no stop between the knots
    function spline(ts, vs, q) {
      const n = ts.length; if (q <= ts[0]) return vs[0]; if (q >= ts[n - 1]) return vs[n - 1];
      const d = []; for (let i = 0; i + 1 < n; i++) d.push((vs[i + 1] - vs[i]) / (ts[i + 1] - ts[i])); const m = [d[0]];
      for (let i = 1; i + 1 < n; i++) { const a = d[i - 1], b = d[i]; if (a * b <= 0) { m.push(0); continue; } const g = (vs[i + 1] - vs[i - 1]) / (ts[i + 1] - ts[i - 1]), lim = 3 * Math.min(Math.abs(a), Math.abs(b)); m.push(Math.sign(g) * Math.min(Math.abs(g), lim)); }
      m.push(0); let i = 0; while (q > ts[i + 1]) i++;
      const hh = ts[i + 1] - ts[i], t = (q - ts[i]) / hh, t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * vs[i] + (t3 - 2 * t2 + t) * hh * m[i] + (-2 * t3 + 3 * t2) * vs[i + 1] + (t3 - t2) * hh * m[i + 1];
    }
    // where the camera is at this much of the inspection: its heading and zoom on the curve through the poses, the
    // hotspots' opacities and which feature is active
    function inspectAt(q) {
      const P = inspect.poses, W = inspect.windows, st = +inspect.settle || 0.04;
      const pe = endPoint(), ts = [0], az = [azimuth()], el = [+CONFIG.elevation || 0], lz = [Math.log(+CONFIG.zoom || 0.36)], ce = [0], px = [pe.x], py = [pe.y];
      P.forEach((p, k) => { const w = W[k] || [1, 1], t = p.at == null ? (w[0] + w[1]) / 2 : +p.at; if (t <= ts[ts.length - 1]) return; ts.push(t); az.push(+p.azimuth); el.push(+p.elevation); lz.push(Math.log(+p.zoom || 0.36)); ce.push(+p.centre || 0); px.push(p.point ? +p.point.x : pe.x); py.push(p.point ? +p.point.y : pe.y); });
      const hots = P.map((p, k) => { const w = W[k]; if (!w || q < w[0] || q > w[1]) return 0; return Math.min(1, (q - w[0]) / st, (w[1] - q) / st); });
      let active = -1; P.forEach((p, k) => { const w = W[k]; if (w && q >= w[0] && (q < w[1] || (k === P.length - 1 && q <= w[1]))) active = k; });
      return { az: spline(ts, az, q), el: spline(ts, el, q), zoom: Math.exp(spline(ts, lz, q)), centre: spline(ts, ce, q), px: spline(ts, px, q), py: spline(ts, py, q), hots, active };
    }
    function placeInspect(q) {
      const s = inspectAt(q); camTarget.copy(target).lerp(droneC, s.centre);
      aim(s.az * D2R, s.el * D2R, zoomDist(s.zoom), s.px, s.py);
      fadeGrid(); motorColor(1);
      if (flag) { const w = CONFIG.flagFade, f = Array.isArray(w) && w.length === 2 ? 0 : 1; flag.mat.uniforms.uOpacity.value = (+CONFIG.flagOpacity || 0.85) * f; edgeMat.uniforms.uFlagA.value = f; }
      // the hotspots: the anchor projected to the frame, the leader out from it, the label at the leader's end
      if (hot) { const [dx, dy, run] = inspect.leader || [-64, -40, -56], v = new THREE.Vector3();
        inspect.poses.forEach((p, k) => { const it = hot.items[k], o = s.hots[k]; it.g.style.opacity = o.toFixed(3); it.label.style.opacity = o.toFixed(3); if (o <= 0) return;
          v.copy(anchorOf(p)).project(camera); const x = (v.x + 1) / 2 * w, y = (1 - v.y) / 2 * h, ex = x + dx, ey = y + dy, lx = ex + run;
          it.dot.setAttribute('cx', x.toFixed(1)); it.dot.setAttribute('cy', y.toFixed(1)); it.ring.setAttribute('cx', x.toFixed(1)); it.ring.setAttribute('cy', y.toFixed(1));
          it.path.setAttribute('d', 'M' + x.toFixed(1) + ' ' + y.toFixed(1) + ' L' + ex.toFixed(1) + ' ' + ey.toFixed(1) + ' L' + lx.toFixed(1) + ' ' + ey.toFixed(1));
          it.label.style.transform = 'translate(' + (run < 0 ? 'calc(' + (lx - 6).toFixed(1) + 'px - 100%)' : (lx + 6).toFixed(1) + 'px') + ', calc(' + ey.toFixed(1) + 'px - 50%))'; }); }
      // the feature rows
      if (rows === null) rows = rowEls();
      if (s.active !== activeRow) { activeRow = s.active; for (const r of rows) r.el.classList.toggle(inspect.activeClass || 'is-active', r.n === s.active + 1); }
      dirty = true;
      setVar(inspect.inspectVar, q);
    }
    function placeCam(e) {
      const fov = (+CONFIG.fov || 30) * D2R, a = w / h, hfov = 2 * Math.atan(Math.tan(fov / 2) * a);
      const d0 = fitDistance(azimuth0(), +CONFIG.startElevation || 0, fov, a) * (+CONFIG.margin || 1.25);
      const d1 = zoomDist(+CONFIG.zoom || 0.36);
      const dist = Math.exp(Math.log(d0) + (Math.log(d1) - Math.log(d0)) * e);
      const az = (azimuth0() + (azimuth() - azimuth0()) * e) * D2R, el = ((+CONFIG.startElevation || 0) + ((+CONFIG.elevation || 0) - (+CONFIG.startElevation || 0)) * e) * D2R;
      camTarget.copy(droneC).lerp(target, e);
      const pe = endPoint(), ps = (isNarrow() && CONFIG.startPointNarrow) || CONFIG.startPoint || { x: 0.5, y: 0.5 }, px = ps.x + (pe.x - ps.x) * e, py = ps.y + (pe.y - ps.y) * e;
      aim(az, el, dist, px, py);
      fadeGrid(); motorColor(e);
      if (hot) for (const it of hot.items) { it.g.style.opacity = '0'; it.label.style.opacity = '0'; }
      if (rows === null && inspect) rows = rowEls(); if (activeRow !== -1 && rows) { activeRow = -1; for (const r of rows) r.el.classList.remove(inspect.activeClass || 'is-active'); }
      if (flag) { const w = CONFIG.flagFade, f = Array.isArray(w) && w.length === 2 && w[1] > w[0] ? 1 - Math.min(1, Math.max(0, (e - w[0]) / (w[1] - w[0]))) : 1; flag.mat.uniforms.uOpacity.value = (+CONFIG.flagOpacity || 0.85) * f; edgeMat.uniforms.uFlagA.value = f; }
      dirty = true;
      setVar(CONFIG.progressVar, e);
    }
    function frame() {
      w = host.clientWidth || 1; h = host.clientHeight || 1; camera.aspect = w / h; camera.fov = +CONFIG.fov || 30;
      // the canvas at the device's pixel ratio (capped); the edge pass at `supersample` times that, in as many tiles as
      // the pixel budget (and the largest texture) asks for, each with a guard band so the lines run across tile edges
      const PR = Math.min(devicePixelRatio || 1, coarse ? (+CONFIG.pixelRatioCapCoarse || 1.5) : (+CONFIG.pixelRatioCap || 2)); renderer.setPixelRatio(PR); renderer.setSize(w, h, false);
      const S = Math.max(1, +CONFIG.supersample || 1), W = Math.round(w * PR), H = Math.round(h * PR), maxT = Math.min(8192, renderer.capabilities.maxTextureSize || 8192), budget = +CONFIG.pixelBudget || 8e6;
      T.nx = Math.max(1, Math.ceil(W * S / maxT)); T.ny = Math.max(1, Math.ceil(H * S / maxT), Math.ceil(W * S * H * S / (budget * T.nx)));
      T.w = Math.ceil(W / T.nx); T.h = Math.ceil(H / T.ny); T.g = 3; T.PR = PR; T.S = S; T.W = W; T.H = H;
      const rw = Math.round((T.w + 2 * T.g) * S), rh = Math.round((T.h + 2 * T.g) * S); rt.setSize(rw, rh); edgeMat.uniforms.uRes.value.set(rw, rh);
      edgeMat.uniforms.uWidth.value = Math.max(0.5, (+CONFIG.lineWidth || 1) * S * PR / 1.5);
      ribMat.uniforms.uWidth.value = Math.max(0.3, (+CONFIG.ribWidth || 1) * PR); gridMat.uniforms.uWidth.value = Math.max(0.3, (+CONFIG.gridWidth || 1) * PR); ribMat.uniforms.uOpacity.value = +CONFIG.ribOpacity;
      for (const m of lineMats) { if (m !== ribMat && m !== gridMat) m.uniforms.uWidth.value = Math.max(0.3, (+CONFIG.gridWidth || 1) * PR); m.uniforms.uRes.value.set(W, H); m.uniforms.uHalf.value = m.uniforms.uWidth.value / 2 + 1; }
      if (!trackEl) progress = progressTarget = pos = posTarget = 1; place();
    }
    // the camera for the current progress: the approach until it has arrived, then the inspection
    function place() { if (inspect && progress >= 1 && insp > 0 && !isNarrow()) placeInspect(insp); else placeCam(ease(progress)); shownProgress = progress; shownInsp = insp; }
    function render() {
      renderer.setRenderTarget(null); renderer.clear(); renderer.render(scene, camera);   // the faces (occluders), ribs and grid, multisampled
      const v = camera.view, fw = v.fullWidth, fh = v.fullHeight, ox = v.offsetX, oy = v.offsetY, vw = v.width, vh = v.height;   // the framing
      for (const m of solids) { m.userData.faceMat = m.material; m.material = m.userData.idMat; }
      const lines = []; scene.traverse(o => { if (o.userData.isLines) { lines.push(o); o.visible = false; } });
      const { nx, ny, w: tw, h: th, g, PR, W, H } = T;
      for (let ty = 0; ty < ny; ty++) for (let tx = 0; tx < nx; tx++) {
        const x0 = tx * tw, y0 = ty * th;   // the tile, in canvas pixels from the top left
        // pass one, this tile plus its guard band: normals, part and depth, meshes only
        camera.setViewOffset(fw, fh, ox + (x0 - g) / PR, oy + (y0 - g) / PR, (tw + 2 * g) / PR, (th + 2 * g) / PR); camera.updateProjectionMatrix();
        renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, camera);
        // pass two: the lines, onto the tile's part of the canvas
        edgeMat.uniforms.uTile.value.set(x0 - g, H - (y0 + th) - g, tw + 2 * g, th + 2 * g);
        setQuad(x0 / W * 2 - 1, 1 - (y0 + th) / H * 2, (x0 + tw) / W * 2 - 1, 1 - y0 / H * 2);
        renderer.setRenderTarget(null); renderer.render(quadScene, quadCam);
      }
      camera.setViewOffset(fw, fh, ox, oy, vw, vh); camera.updateProjectionMatrix();
      for (const m of solids) m.material = m.userData.faceMat; for (const l of lines) l.visible = true;
    }
    // ---- the loop: the camera follows the scroll through the track, damped; the props turn with the scroll
    let dirty = true, alive = true, visible = true, lastT = performance.now(), spin = 0, spinTarget = 0, idle = 0, flagT = 0;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches, coarse = matchMedia('(pointer: coarse)').matches, frameMs = coarse && +CONFIG.fpsCoarse > 0 ? 1000 / +CONFIG.fpsCoarse : 0; let lastRender = 0;
    const onScroll = () => { spinTarget = (global.scrollY || 0) / 1000 * (+CONFIG.propScroll || 0) * Math.PI * 2; progressTarget = trackEl ? readProgress() : 1; inspTarget = readInspect(); posTarget = progressTarget + inspTarget;
      if (trackEl && CONFIG.exitVar) { const tr = trackEl.getBoundingClientRect(), hr = host.getBoundingClientRect(); const ex = Math.min(1, Math.max(0, 1 - (tr.bottom - hr.top) / Math.max(1, hr.height))).toFixed(4); host.style.setProperty(CONFIG.exitVar, ex); trackEl.style.setProperty(CONFIG.exitVar, ex); } };
    addEventListener('scroll', onScroll, { passive: true }); onScroll(); spin = spinTarget; progress = progressTarget; insp = inspTarget; pos = posTarget;
    const io = new IntersectionObserver(en => { visible = en[0].isIntersecting; }); io.observe(host);
    function tick(now) {
      if (!alive) return; requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
      if (visible && posTarget !== pos) { pos = reduced ? posTarget : pos + (posTarget - pos) * Math.min(1, (+CONFIG.damping || 0.12) * dt * 60); if (Math.abs(posTarget - pos) < 1e-5) pos = posTarget; progress = Math.min(1, pos); insp = Math.max(0, pos - 1); }
      if (visible && (progress !== shownProgress || insp !== shownInsp)) place();
      if (!reduced && visible) {
        if (CONFIG.propSeconds > 0) { idle += dt * Math.PI * 2 / CONFIG.propSeconds; dirty = true; }
        if (Math.abs(spinTarget - spin) > 1e-4) { spin += (spinTarget - spin) * Math.min(1, dt * 6); if (Math.abs(spinTarget - spin) < 1e-4) spin = spinTarget; dirty = true; }
        for (const p of props) p.mesh.rotation.y = p.dir * (spin + idle) + p.phase;
        if (flag) { flagT += dt; flag.update(flagT); dirty = true; }
      }
      if (!dirty || !visible || now - lastRender < frameMs - 2) return; dirty = false; lastRender = now; render();
    }
    requestAnimationFrame(tick);
    let lastColors = '';
    function applyColors() {
      const next = {}; for (const k of COLOR_KEYS) next[k] = resolveColor(host, RAW[k]);
      const sig = JSON.stringify(next); if (sig === lastColors) return; lastColors = sig; Object.assign(CONFIG, next);
      host.style.background = CONFIG.background; faceMat.color.set(CONFIG.face); if (hot) for (const it of hot.items) { it.dot.setAttribute('fill', CONFIG.primary); it.ring.setAttribute('stroke', CONFIG.primary); it.path.setAttribute('stroke', CONFIG.primary); it.label.style.color = CONFIG.primary; } gridMat.uniforms.uColor.value.set(CONFIG.gridColor); for (const m of lineMats) { m.uniforms.uBg.value.set(CONFIG.face); if (m !== ribMat && m !== gridMat) m.uniforms.uColor.value.set(CONFIG.secondary); } edgeMat.uniforms.uC2.value.set(CONFIG.secondary); motorColor(ease(progress)); if (!grid) buildGrid(); dirty = true;
    }
    buildHotspots(); applyColors();
    const themeWatch = setInterval(() => { if (alive) applyColors(); }, 400);
    const ro = global.ResizeObserver ? new ResizeObserver(frame) : null; if (ro) ro.observe(host); else addEventListener('resize', frame);
    frame();
    return {
      set(patch) { Object.assign(CONFIG, patch || {}); for (const k of COLOR_KEYS) if (patch && k in patch) { RAW[k] = patch[k]; lastColors = ''; } edgeMat.uniforms.uDepthT.value = +CONFIG.depthEdge || 0.012; edgeMat.uniforms.uNormT.value = +CONFIG.normalEdge || 0.25; if (patch && ('grid' in patch || 'gridExtent' in patch)) buildGrid(); applyColors(); onScroll(); frame(); },
      setProgress(p, q) { progressTarget = progress = Math.min(1, Math.max(0, +p || 0)); inspTarget = insp = Math.min(1, Math.max(0, +q || 0)); posTarget = pos = progress + insp; place(); },
      get state() { const d = camera.position.clone().sub(camTarget); return { focus: key, azimuth: azimuth(), startAzimuth: azimuth0(), progress, inspect: insp, heading: [Math.atan2(d.x, d.z) / D2R, Math.atan2(d.y, Math.hypot(d.x, d.z)) / D2R, d.length()], motorHeight: motorH, triangles: tris, props: props.length, pixelRatio: renderer.getPixelRatio(), edgePass: [rt.width, rt.height], tiles: T.nx * T.ny }; },
      destroy() { alive = false; clearInterval(themeWatch); io.disconnect(); removeEventListener('scroll', onScroll); if (ro) ro.disconnect(); else removeEventListener('resize', frame); rt.dispose(); renderer.dispose(); renderer.domElement.remove(); }
    };
  }

  function mount(target, config) {
    const host = typeof target === 'string' ? document.querySelector(target) : target;
    if (!host) return Promise.reject(new Error('DroneHero: target not found'));
    const CONFIG = Object.assign({}, DEFAULTS, config || {});
    return loadThree().then(() => loadScript(CONFIG.loader, () => !!(global.THREE && global.THREE.GLTFLoader)))
      .then(() => new Promise((res, rej) => new global.THREE.GLTFLoader().load(CONFIG.model || (HERE + 'heavy_lift_drone_model.glb'), res, undefined, rej)))
      .then(gltf => build(host, CONFIG, gltf));
  }
  global.DroneHero = { mount, defaults: DEFAULTS, version: '2.15.0' };
})(typeof window !== 'undefined' ? window : this);
