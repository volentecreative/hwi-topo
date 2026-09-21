/*!
 * drone-hero.js — the heavy-lift drone model drawn as line work, framed on one of its motors.
 *
 *   <div id="drone" style="position:absolute;inset:0"></div>
 *   <script src="https://cdn.jsdelivr.net/gh/volentecreative/hwi-topo@<commit>/drone-hero.js"></script>
 *   <script>DroneHero.mount('#drone', { focus: 'FR' });</script>
 *
 * The model (heavy_lift_drone_model.glb, beside this script) is drawn the house way: faces in the page colour so
 * near parts hide far ones, creases and silhouettes as lines. The focused motor's casing — base, coil, cap and
 * shaft — is drawn in the primary colour, everything else in the secondary. The model's propellers are replaced
 * with generated blades (tapered, twisted, a real section), which turn as the page scrolls, neighbours counter-
 * rotating. A floor grid fades out toward its edges. The camera is orthographic, three-quarter-ish from the
 * side of the focused arm, and puts the motor at a chosen point of the frame so the composition holds at any size.
 * Colours come from CSS variables:
 *   --drone-primary    the focused motor      (falls back to --topo-label, then #f2f2f0)
 *   --drone-secondary  the rest of the drone  (falls back to --topo-label-secondary, then #9a9a96)
 *   --drone-face       the faces              (falls back to --topo-block, then #222322)
 *   --drone-bg         the canvas             (transparent by default)
 */
(function (global) {
  'use strict';
  const HERE = (document.currentScript && document.currentScript.src) ? document.currentScript.src.replace(/[^/]*$/, '') : '';

  const DEFAULTS = {
    model: '',                 // URL of the GLB; '' = heavy_lift_drone_model.glb beside this script
    loader: 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js',
    focus: 'FR',               // which motor: FR, FL, BR, BL, or with ' 2' for the lower ring of the coaxial pairs
    azimuth: 'auto',           // camera heading in degrees, or 'auto': side-on to the focused arm (arm to the right), turned by `turn`
    turn: 22,                  // degrees the auto heading swings round toward the body, for a three-quarter view; 0 = side-on, 45 = isometric
    elevation: 18,             // camera height above the horizon, degrees
    zoom: 0.38,                // the focused motor's height (base to cap) as a fraction of the frame's height
    point: { x: 0.5, y: 0.45 },        // where the motor sits in the frame (fractions of width and height)
    pointNarrow: { x: 0.5, y: 0.4 },   // … on screens up to `breakpoint` wide
    breakpoint: 991,
    propScroll: 0.35,          // propeller turns per 1000px of scrolling; 0 = the props do not follow the scroll
    propSeconds: 0,            // seconds per idle turn of every propeller; 0 = still unless scrolled
    props: 'blades',           // 'blades': generated blades in place of the model's; 'model': the model's own
    blades: 2, bladeChord: 0.2, bladeTwist: 22,   // per propeller: blade count, widest chord as a share of the radius, root twist in degrees
    grid: 0.5, gridFade: 0.3,  // the floor grid's cell, in motor heights (0 = none), and how far from the motor it starts fading (share of the frame's half-size; it is gone by the edges)
    ribs: 24,                  // vertical ribs round the focused motor's casing; 0 = none
    crease: 22,                // edges sharper than this many degrees are drawn
    lineWidth: 1.1,            // silhouette line thickness, in screen pixels
    primary: 'var(--drone-primary, var(--topo-label, #f2f2f0))',
    secondary: 'var(--drone-secondary, var(--topo-label-secondary, #9a9a96))',
    face: 'var(--drone-face, var(--topo-block, #222322))',
    background: 'var(--drone-bg, transparent)',
    pixelRatioCap: 1.5
  };
  const COLOR_KEYS = ['primary', 'secondary', 'face', 'background'];

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

  // a propeller: `n` blades about the y axis, radius R, hub radius r0. Each blade is a lofted solid: a thin lens
  // section at stations along the span, chord widest a third of the way out and tapering to the tip, pitched
  // (twisted) most at the root — so it reads as a propeller from every angle, with a sharp leading and trailing edge
  function propellerGeometry(THREE, R, r0, n, chordMax, twistDeg) {
    const pos = [], idx = [], NS = 14, NP = 10;
    for (let b = 0; b < n; b++) {
      const rot = b * Math.PI * 2 / n, base = pos.length / 3;
      for (let s = 0; s <= NS; s++) {
        const t = s / NS, r = r0 + (R - r0) * t;
        const chord = R * chordMax * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.25))) * (1 - 0.55 * Math.max(0, t - 0.6) / 0.4);   // grows from the root, tapers to the tip
        const th = (twistDeg * (1 - 0.65 * t)) * Math.PI / 180, thick = chord * 0.09, sweep = 0.12 * chord * t;
        for (let p = 0; p < NP; p++) {   // the lens: x along the chord, y thickness, about the spanwise axis
          const a = p / NP * Math.PI * 2, cx = Math.cos(a) * chord / 2 + sweep, cy = Math.sin(a) * thick / 2 * (1 - 0.35 * Math.abs(Math.cos(a)));
          const yy = cy * Math.cos(th) - cx * Math.sin(th), zz = cy * Math.sin(th) + cx * Math.cos(th);   // pitched about the span
          const X = r, Y = yy, Z = zz;
          pos.push(X * Math.cos(rot) - Z * Math.sin(rot), Y, X * Math.sin(rot) + Z * Math.cos(rot));
        }
      }
      for (let s = 0; s < NS; s++) for (let p = 0; p < NP; p++) { const a = base + s * NP + p, b2 = base + s * NP + (p + 1) % NP, c = a + NP, d = b2 + NP; idx.push(a, c, b2, b2, c, d); }
      const rootC = pos.length / 3; pos.push(r0 * Math.cos(rot), 0, r0 * Math.sin(rot)); for (let p = 0; p < NP; p++) idx.push(rootC, base + (p + 1) % NP, base + p);   // root cap
      const tipC = pos.length / 3; pos.push(R * Math.cos(rot), 0, R * Math.sin(rot)); const tb = base + NS * NP; for (let p = 0; p < NP; p++) idx.push(tipC, tb + p, tb + (p + 1) % NP);   // tip cap
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  }

  function build(host, CONFIG, gltf) {
    const THREE = global.THREE, D2R = Math.PI / 180;
    const RAW = {}; for (const k of COLOR_KEYS) { RAW[k] = CONFIG[k]; CONFIG[k] = resolveColor(host, CONFIG[k]); }
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.style.background = CONFIG.background; host.style.overflow = 'hidden';
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, CONFIG.pixelRatioCap)); renderer.setClearColor(0x000000, 0);
    Object.assign(renderer.domElement.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' });
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1e5, 1e5);

    // ---- materials: faces hide what is behind them; creases are lines; silhouettes come from a back-face hull pushed
    // out along the normals by a screen-constant amount, so every smooth part gets an outline of the same weight
    const faceMat = new THREE.MeshBasicMaterial({ color: CONFIG.face, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    const push = { value: 0 };
    const hullMat = col => { const m = new THREE.MeshBasicMaterial({ color: col, side: THREE.BackSide }); m.onBeforeCompile = sh => { sh.uniforms.uPush = push; sh.vertexShader = 'uniform float uPush;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed += normalize(normal) * uPush;'); }; return m; };
    const mats = { line1: new THREE.LineBasicMaterial({ color: CONFIG.primary }), line2: new THREE.LineBasicMaterial({ color: CONFIG.secondary }), hull1: hullMat(CONFIG.primary), hull2: hullMat(CONFIG.secondary) };
    const solid = (g, mine) => { const grp = new THREE.Group(); grp.add(new THREE.Mesh(g, faceMat)); const hull = new THREE.Mesh(g, mine ? mats.hull1 : mats.hull2); hull.renderOrder = -1; grp.add(hull); const edges = new THREE.LineSegments(new THREE.EdgesGeometry(g, CONFIG.crease), mine ? mats.line1 : mats.line2); edges.renderOrder = 1; grp.add(edges); return grp; };

    // ---- the model, baked into world space; parts are told apart by name (the loader writes spaces as underscores)
    const key = String(CONFIG.focus || 'FR').trim();
    const partOf = name => { const m = /^(Motor[ _]Base|Motor[ _]Coil|Motor[ _]Cap|Motor[ _]Shaft|Prop[ _]Hub|Propeller|Arm)[ _](FR|FL|BR|BL)(?:[ _](2))?$/.exec(name || ''); return m ? { part: m[1].replace('_', ' '), pos: m[2] + (m[3] ? ' 2' : '') } : null; };
    const skip = name => /^mesh_\d+_instance/.test(name || '');   // stray unnamed instances the exporter left at the origin
    gltf.scene.updateMatrixWorld(true);
    const motorBox = new THREE.Box3(), armBox = new THREE.Box3(), all = new THREE.Box3(); let coilBox = new THREE.Box3(), coilH = 0;   // coilBox: the tallest casing part, which gets the ribs
    const hubs = {}, propInfo = {};   // per position: the hub's box, and the model propeller's box
    const meshes = []; gltf.scene.traverse(o => { if (o.isMesh && !skip(o.name)) meshes.push(o); });
    let tris = 0;
    for (const o of meshes) {
      const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); if (!g.attributes.normal) g.computeVertexNormals(); g.computeBoundingBox(); all.union(g.boundingBox);
      const info = partOf(o.name), isFocus = !!(info && info.pos === key);
      const mine = isFocus && /^Motor/.test(info.part);   // the casing: base, coil, cap, shaft
      if (mine) { motorBox.union(g.boundingBox); const hh = g.boundingBox.max.y - g.boundingBox.min.y; if (info.part !== 'Motor Shaft' && hh > coilH) { coilH = hh; coilBox = g.boundingBox.clone(); } }
      if (isFocus && info.part === 'Arm') armBox.union(g.boundingBox);
      if (info && info.part === 'Prop Hub') hubs[info.pos] = g.boundingBox.clone();
      if (info && info.part === 'Propeller') { propInfo[info.pos] = g.boundingBox.clone(); if (CONFIG.props !== 'model') continue; }
      tris += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
      scene.add(solid(g, mine));
    }
    // ---- propellers: generated blades at each hub, sized from the model's own; neighbours counter-rotate
    const props = [];
    if (CONFIG.props !== 'model') for (const pos of Object.keys(propInfo)) {
      const pb = propInfo[pos], hb = hubs[pos] || pb, c = new THREE.Vector3(); hb.getCenter(c);
      const R = Math.max(pb.max.x - pb.min.x, pb.max.z - pb.min.z) / 2, r0 = Math.max(hb.max.x - hb.min.x, hb.max.z - hb.min.z) / 2 * 0.9, y = (pb.min.y + pb.max.y) / 2;
      const g = propellerGeometry(THREE, R, r0, Math.max(2, CONFIG.blades | 0), +CONFIG.bladeChord || 0.2, +CONFIG.bladeTwist || 22); tris += g.index.count / 3;
      const grp = solid(g, false); grp.position.set(c.x, y, c.z); scene.add(grp);
      const ring = / 2$/.test(pos) ? 1 : 0, quad = /^(FR|BL)/.test(pos) ? 1 : -1;   // FR/BL one way, FL/BR the other; the lower ring the opposite of its partner
      props.push({ grp, dir: quad * (ring ? -1 : 1), phase: Math.random() * Math.PI * 2 });
    }
    // ---- the focused motor's ribbing: vertical lines round the coil, on its surface
    if (CONFIG.ribs > 0 && !coilBox.isEmpty()) {
      const c = new THREE.Vector3(); coilBox.getCenter(c); const r = Math.max(coilBox.max.x - coilBox.min.x, coilBox.max.z - coilBox.min.z) / 2 * 1.003, a = [];
      for (let k = 0; k < CONFIG.ribs; k++) { const t = k / CONFIG.ribs * Math.PI * 2, x = c.x + Math.cos(t) * r, z = c.z + Math.sin(t) * r; a.push(x, coilBox.min.y, z, x, coilBox.max.y, z); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3)); const l = new THREE.LineSegments(g, mats.line1); l.renderOrder = 1; scene.add(l);
    }
    // ---- the view: three-quarter-ish from the side of the arm, the motor at the chosen point of the frame
    const target = new THREE.Vector3(); motorBox.getCenter(target);
    const motorH = Math.max(1e-3, motorBox.max.y - motorBox.min.y);
    const armDir = new THREE.Vector3(); (armBox.isEmpty() ? all : armBox).getCenter(armDir); armDir.sub(target); armDir.y = 0; if (armDir.lengthSq() < 1e-9) armDir.set(1, 0, 0); armDir.normalize();
    const azimuth = () => CONFIG.azimuth === 'auto' || CONFIG.azimuth === undefined ? Math.atan2(armDir.x, armDir.z) / D2R - 90 + (+CONFIG.turn || 0) : +CONFIG.azimuth;
    // ---- the floor grid, fading toward the frame's edges: colours are set per vertex from each point's distance from
    // the motor on screen, so the fade always finishes inside the frame whatever the size or angle
    let grid = null;
    function buildGrid() {
      if (grid) { scene.remove(grid); grid.geometry.dispose(); grid = null; } const cell = motorH * (+CONFIG.grid || 0); if (!(cell > 0)) return;
      const y = all.min.y, n = Math.ceil(motorH * 12 / cell), pos = [];
      for (let i = -n; i <= n; i++) { const o = i * cell; for (let j = -n; j < n; j++) { const a = j * cell, b = (j + 1) * cell; pos.push(target.x + o, y, target.z + a, target.x + o, y, target.z + b, target.x + a, y, target.z + o, target.x + b, y, target.z + o); } }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
      grid = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true })); grid.renderOrder = -2; scene.add(grid); fadeGrid();
    }
    function fadeGrid() {
      if (!grid) return; const p = grid.geometry.attributes.position.array, c = grid.geometry.attributes.color.array, v = new THREE.Vector3();
      const lineC = new THREE.Color(CONFIG.secondary), bgC = new THREE.Color(CONFIG.face), t = new THREE.Vector3().copy(target).project(camera), f0 = Math.max(0, Math.min(0.95, +CONFIG.gridFade || 0.3));
      for (let i = 0; i < p.length; i += 3) { v.set(p[i], p[i + 1], p[i + 2]).project(camera); const r = Math.hypot(v.x - t.x, v.y - t.y), f = Math.min(1, Math.max(0, (r - f0) / (1 - f0))); const col = lineC.clone().lerp(bgC, 0.55 + 0.45 * f); c[i] = col.r; c[i + 1] = col.g; c[i + 2] = col.b; }
      grid.geometry.attributes.color.needsUpdate = true;
    }
    let w = 1, h = 1;
    function placeCam() {
      const az = azimuth() * D2R, el = CONFIG.elevation * D2R;
      const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
      camera.position.copy(target).add(dir.multiplyScalar(all.getSize(new THREE.Vector3()).length() * 2)); camera.lookAt(target); camera.updateMatrixWorld();
    }
    function frame() {
      w = host.clientWidth || 1; h = host.clientHeight || 1; renderer.setSize(w, h, false); placeCam();
      const ext = motorH / Math.max(0.05, CONFIG.zoom) / 2, a = w / h;
      camera.left = -ext * a; camera.right = ext * a; camera.top = ext; camera.bottom = -ext;
      const narrow = global.matchMedia && global.matchMedia('(max-width: ' + (+CONFIG.breakpoint || 991) + 'px)').matches;
      const pt = (narrow && CONFIG.pointNarrow) || CONFIG.point || { x: 0.5, y: 0.5 };
      camera.setViewOffset(w, h, (0.5 - pt.x) * w, (0.5 - pt.y) * h, w, h); camera.updateProjectionMatrix();
      push.value = (+CONFIG.lineWidth || 1) * (camera.right - camera.left) / w;   // the hull's push, in world units per screen pixel
      fadeGrid(); dirty = true;
    }
    // ---- the propellers follow the scroll, smoothed, plus any idle turn
    let dirty = true, alive = true, visible = true, lastT = performance.now(), spin = 0, spinTarget = 0, idle = 0;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const onScroll = () => { spinTarget = (global.scrollY || 0) / 1000 * (+CONFIG.propScroll || 0) * Math.PI * 2; };
    addEventListener('scroll', onScroll, { passive: true }); onScroll(); spin = spinTarget;
    const io = new IntersectionObserver(en => { visible = en[0].isIntersecting; }); io.observe(host);
    function tick(now) {
      if (!alive) return; requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
      if (!reduced && visible) {
        if (CONFIG.propSeconds > 0) { idle += dt * Math.PI * 2 / CONFIG.propSeconds; dirty = true; }
        if (Math.abs(spinTarget - spin) > 1e-4) { spin += (spinTarget - spin) * Math.min(1, dt * 6); if (Math.abs(spinTarget - spin) < 1e-4) spin = spinTarget; dirty = true; }
        for (const p of props) p.grp.rotation.y = p.dir * (spin + idle) + p.phase;
      }
      if (!dirty || !visible) return; dirty = false; renderer.render(scene, camera);
    }
    requestAnimationFrame(tick);
    let lastColors = '';
    function applyColors() {
      const next = {}; for (const k of COLOR_KEYS) next[k] = resolveColor(host, RAW[k]);
      const sig = JSON.stringify(next); if (sig === lastColors) return; lastColors = sig; Object.assign(CONFIG, next);
      host.style.background = CONFIG.background; faceMat.color.set(CONFIG.face); mats.line1.color.set(CONFIG.primary); mats.hull1.color.set(CONFIG.primary); mats.line2.color.set(CONFIG.secondary); mats.hull2.color.set(CONFIG.secondary); buildGrid(); dirty = true;
    }
    applyColors();
    const themeWatch = setInterval(() => { if (alive) applyColors(); }, 400);
    const ro = global.ResizeObserver ? new ResizeObserver(frame) : null; if (ro) ro.observe(host); else addEventListener('resize', frame);
    frame();
    return {
      set(patch) { Object.assign(CONFIG, patch || {}); for (const k of COLOR_KEYS) if (patch && k in patch) { RAW[k] = patch[k]; lastColors = ''; } if (patch && ('grid' in patch || 'gridFade' in patch)) buildGrid(); applyColors(); onScroll(); frame(); },
      get state() { return { focus: key, azimuth: azimuth(), motorHeight: motorH, triangles: tris, props: props.length }; },
      destroy() { alive = false; clearInterval(themeWatch); io.disconnect(); removeEventListener('scroll', onScroll); if (ro) ro.disconnect(); else removeEventListener('resize', frame); renderer.dispose(); renderer.domElement.remove(); }
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
  global.DroneHero = { mount, defaults: DEFAULTS, version: '1.1.0' };
})(typeof window !== 'undefined' ? window : this);
