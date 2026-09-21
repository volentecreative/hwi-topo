/*!
 * iso-marks.js — small isometric line-work objects for the HWI site: the flag mark, and a conveyor.
 *
 *   <div id="flag" style="width:6rem;height:6rem"></div>
 *   <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
 *   <script src="https://cdn.jsdelivr.net/gh/volentecreative/hwi-topo@<commit>/iso-marks.js"></script>
 *   <script>
 *     IsoMarks.flag('#flag', { hover: '.card' });          // splits into three flags on hover, closes on leave
 *     IsoMarks.conveyor('#belt', { hover: '.card' });      // every hover runs the belt one box along
 *   </script>
 *
 * Faces are one flat colour, edges are lines, both from CSS variables so the objects follow the site's theme:
 *   --iso-face  the faces   (falls back to --topo-block, then #3a3a3a)
 *   --iso-line  the edges   (falls back to --topo-label, then #f2f2f0)
 *   --iso-bg    the canvas  (transparent by default)
 * The camera is orthographic and never moves; each object is framed once so that every state of its animation fits.
 */
(function (global) {
  'use strict';

  const SHARED = {
    azimuth: 45,           // camera heading, degrees; 45 = true isometric, looking from the front-left
    elevation: 30,         // camera height, degrees above the ground; 35.264 = true isometric, 30 sits a little lower
    margin: 1.06,          // breathing room around the animation's extremes, which the frame is fitted to
    hover: '',             // the element whose hover drives it: a selector, 'closest:.card' (an ancestor of the host), or an element; '' = the host
    shade: 0,              // 0 = every face the same colour; 0.08 lightens the tops a little
    faceColor: 'var(--iso-face, var(--topo-block, #3a3a3a))',
    lineColor: 'var(--iso-line, var(--topo-label, #f2f2f0))',
    background: 'var(--iso-bg, transparent)',
    pixelRatioCap: 2
  };
  const COLOR_KEYS = ['faceColor', 'lineColor', 'background'];

  function resolveColor(host, v) {
    if (typeof v !== 'string') return v;
    const m = v.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*(.+?)\s*)?\)$/);
    if (!m) return v;
    const got = getComputedStyle(host).getPropertyValue(m[1]).trim();
    const ok = got && !/var\(/.test(got) && (got === 'transparent' || (global.CSS && CSS.supports && CSS.supports('color', got)));
    return ok ? got : (m[2] ? resolveColor(host, m[2]) : 'transparent');
  }
  function loadThree() {   // one load shared by every mount on the page, however many copies of this script there are
    if (global.THREE) return Promise.resolve();
    if (!global.__threeLoading) global.__threeLoading = new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'; s.onload = res; s.onerror = () => rej(new Error('three.js failed to load')); document.head.appendChild(s); });
    return global.__threeLoading;
  }
  // a critically damped spring step: no overshoot, eased at both ends
  function spring(x, v, target, seconds, dt) { const w = 2 * Math.PI / Math.max(0.15, seconds); const n = Math.max(1, Math.ceil(dt / 0.01)), h = dt / n; for (let i = 0; i < n; i++) { v += (-w * w * (x - target) - 2 * w * v) * h; x += v * h; } if (Math.abs(x - target) < 1e-4 && Math.abs(v) < 1e-4) { x = target; v = 0; } return [x, v]; }

  // ---- the stage every object shares: renderer, fixed orthographic camera, theme colours, hover, the loop
  function stage(host, CONFIG, makeScene) {
    const THREE = global.THREE, D2R = Math.PI / 180;
    const RAW = {}; for (const k of COLOR_KEYS) { RAW[k] = CONFIG[k]; CONFIG[k] = resolveColor(host, CONFIG[k]); }
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.style.background = CONFIG.background;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, CONFIG.pixelRatioCap)); renderer.setClearColor(0x000000, 0);
    Object.assign(renderer.domElement.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' });
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    const faceMat = new THREE.MeshBasicMaterial({ color: CONFIG.faceColor, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    const capMat = faceMat.clone();
    const lineMat = new THREE.LineBasicMaterial({ color: CONFIG.lineColor, transparent: true });
    const mats = [];   // every material in use, for recolouring: {m, kind:'face'|'cap'|'line'}
    mats.push({ m: faceMat, kind: 'face' }, { m: capMat, kind: 'cap' }, { m: lineMat, kind: 'line' });
    // a solid drawn the house way: flat faces (caps may be a touch lighter) and its edges as lines
    const solid = (geometry, own) => { const fm = own ? faceMat.clone() : faceMat, cm = own ? capMat.clone() : capMat, lm = own ? lineMat.clone() : lineMat;
      if (own) { fm.transparent = cm.transparent = true; mats.push({ m: fm, kind: 'face' }, { m: cm, kind: 'cap' }, { m: lm, kind: 'line' }); }
      const n = geometry.groups ? geometry.groups.length : 0, mat = n === 2 ? [cm, fm] : n === 6 ? [fm, fm, cm, cm, fm, fm] : fm;   // an extrusion: caps + sides; a box: its top and bottom are the caps
      if (n !== 2 && n !== 6) geometry.clearGroups();
      const g = new THREE.Group(); g.add(new THREE.Mesh(geometry, mat)); const ls = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 1), lm); ls.renderOrder = 1; g.add(ls);   // lines after faces, so a box's back edges stay behind its front
      g.userData.mats = [fm, cm, lm]; return g; };
    const dispose = g => { scene.remove(g); g.children.forEach(c => c.geometry.dispose()); };
    let dirty = true;
    const S = makeScene({ THREE, scene, solid, dispose, CONFIG, redraw: () => { dirty = true; } });

    function placeCam() {
      const c = S.center(); const el = CONFIG.elevation, az = CONFIG.azimuth;
      const dir = new THREE.Vector3(-Math.cos(el * D2R) * Math.sin(az * D2R), Math.sin(el * D2R), Math.cos(el * D2R) * Math.cos(az * D2R));
      camera.position.copy(dir.multiplyScalar(20)).add(c); camera.lookAt(c); camera.updateMatrixWorld();
    }
    function fit() {
      const w = host.clientWidth || 1, h = host.clientHeight || 1; renderer.setSize(w, h, false); placeCam();
      const inv = camera.matrixWorldInverse; let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const p of S.bounds()) { const q = p.clone().applyMatrix4(inv); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, a = w / h, ext = Math.max((x1 - x0) / a, y1 - y0) / 2 * CONFIG.margin;
      camera.left = cx - ext * a; camera.right = cx + ext * a; camera.top = cy + ext; camera.bottom = cy - ext; camera.updateProjectionMatrix(); dirty = true;
    }
    let alive = true, lastT = performance.now();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    function frame(now) {
      if (!alive) return; requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
      if (S.update(dt, reduced)) dirty = true;
      if (!dirty) return; dirty = false; renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
    // hover on the target (or the host), keyboard focus too; on touch a tap stands in for a hover
    // 'closest:.card' walks up from the host; any other string is a selector; an element is taken as is
    const hs = CONFIG.hover, hov = (hs && hs.nodeType ? hs : typeof hs === 'string' && hs.startsWith('closest:') ? host.closest(hs.slice(8)) : hs ? document.querySelector(hs) : null) || host;
    hov.addEventListener('pointerenter', ev => { if (ev.pointerType !== 'touch') S.enter(); });
    hov.addEventListener('pointerleave', ev => { if (ev.pointerType !== 'touch') S.leave(); });
    hov.addEventListener('pointerdown', ev => { if (ev.pointerType === 'touch') S.tap(); });
    hov.addEventListener('focusin', () => S.enter()); hov.addEventListener('focusout', () => S.leave());
    let lastColors = '';
    function applyColors() {
      const next = {}; for (const k of COLOR_KEYS) next[k] = resolveColor(host, RAW[k]);
      const sig = JSON.stringify(next) + CONFIG.shade; if (sig === lastColors) return; lastColors = sig; Object.assign(CONFIG, next);
      host.style.background = CONFIG.background; const cap = new THREE.Color(CONFIG.faceColor); if (CONFIG.shade) cap.lerp(new THREE.Color('#ffffff'), CONFIG.shade);
      for (const { m, kind } of mats) m.color.set(kind === 'line' ? CONFIG.lineColor : kind === 'cap' ? cap : CONFIG.faceColor); dirty = true;
    }
    applyColors();
    const themeWatch = setInterval(() => { if (alive) applyColors(); }, 400);
    const ro = global.ResizeObserver ? new ResizeObserver(fit) : null; if (ro) ro.observe(host); else addEventListener('resize', fit);
    fit();
    return {
      set(patch) { Object.assign(CONFIG, patch || {}); for (const k of COLOR_KEYS) if (patch && k in patch) { RAW[k] = patch[k]; lastColors = ''; } if (S.set) S.set(patch || {}); applyColors(); fit(); },
      get state() { return S.state(); },
      trigger() { S.enter(); }, release() { S.leave(); },
      destroy() { alive = false; clearInterval(themeWatch); if (ro) ro.disconnect(); else removeEventListener('resize', fit); renderer.dispose(); renderer.domElement.remove(); }
    };
  }

  // ======== the flag: the mark lying flat, extruded up into a block; on hover it splits into flags that lift apart
  // the mark, as polygons in flag units: u across (0 = hoist, 1 = the fly at the bottom), v down (0 = top).
  // The hoist is straight; the fly leans out so the flag is wider at the bottom; the canton narrows toward its
  // foot; nine equal bands, stripes on the odd ones, the short stripes beside the canton, the long ones under it.
  // Traced from the reference render — replace with the polygons of the real SVG when it is to hand.
  function defaultMark() {
    const H = 0.5, h = H / 9, gap = 0.06;
    const fly = v => 0.80 + 0.20 * (v / H), cin = v => 0.42 - 0.06 * (v / (5 * h));
    const polys = [[[0, 0], [cin(0), 0], [cin(5 * h), 5 * h], [0, 5 * h]]];
    for (const k of [0, 2, 4]) { const v0 = k * h, v1 = v0 + h; polys.push([[cin(v0) + gap, v0], [fly(v0), v0], [fly(v1), v1], [cin(v1) + gap, v1]]); }
    for (const k of [6, 8]) { const v0 = k * h, v1 = v0 + h; polys.push([[0, v0], [fly(v0), v0], [fly(v1), v1], [0, v1]]); }
    return { polys, width: 1, height: H };
  }
  const FLAG = Object.assign({}, SHARED, {
    mark: null,            // { polys:[[[u,v],...],...], width, height } — the default is the traced HWI mark
    depth: 0.8,            // extrusion height as a fraction of the mark's width
    slices: 3,             // how many flags it splits into
    gap: 0.6,              // the lift between flags when split, as a fraction of one slice's height
    anchor: 'middle',      // 'middle': the middle flag stays put; 'bottom': the stack grows upward
    seconds: 0.55          // how long the split takes
  });
  function flagScene({ THREE, scene, solid, dispose, CONFIG }) {
    let W, Hm, D, N, sliceH, whole; const slices = [];
    const extrude = (shapes, depth) => { const g = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: false }); g.rotateX(-Math.PI / 2); return g; };   // shape plane → the ground, extrusion → up
    function rebuild() {
      for (const s of slices) dispose(s.grp); slices.length = 0; if (whole) dispose(whole);
      const mark = CONFIG.mark || defaultMark(); W = mark.width; Hm = mark.height; D = W * CONFIG.depth; N = Math.max(1, CONFIG.slices | 0); sliceH = D / N;
      const shapes = mark.polys.map(poly => { const s = new THREE.Shape(); poly.forEach(([u, v], i) => { const x = u - W / 2, y = -(v - Hm / 2); i ? s.lineTo(x, y) : s.moveTo(x, y); }); s.closePath(); return s; });
      for (let k = 0; k < N; k++) { const grp = solid(extrude(shapes, sliceH)); grp.position.y = k * sliceH; scene.add(grp); slices.push({ grp, k }); }
      // the edges of the un-split block, shown while it is whole, so the cuts never show as lines until they open
      whole = solid(extrude(shapes, D)); whole.children[0].visible = false; whole.userData.mats[2] = whole.children[1].material = slices[0].grp.children[1].material.clone(); scene.add(whole);
    }
    rebuild();
    const lift = (k, e) => { const g = CONFIG.gap * sliceH * e; return CONFIG.anchor === 'bottom' ? k * g : (k - (N - 1) / 2) * g; };
    let target = 0, e = 0, vel = 0, shown = -1;
    return {
      center() { return new THREE.Vector3(0, (D + (CONFIG.anchor === 'bottom' ? lift(N - 1, 1) : 0)) / 2, 0); },
      bounds() { const pts = []; for (let k = 0; k < N; k++) for (const ee of [0, 1]) { const y0 = k * sliceH + lift(k, ee); for (const x of [-W / 2, W / 2]) for (const z of [-Hm / 2, Hm / 2]) pts.push(new THREE.Vector3(x, y0, z), new THREE.Vector3(x, y0 + sliceH, z)); } return pts; },
      enter() { target = 1; }, leave() { target = 0; }, tap() { target = target ? 0 : 1; },
      set(p) { if ('depth' in p || 'slices' in p || 'mark' in p) rebuild(); shown = -1; },
      state() { return { split: e }; },
      update(dt, reduced) {
        if (e === target && vel === 0 && shown === e) return false;
        if (reduced) { e = target; vel = 0; } else [e, vel] = spring(e, vel, target, CONFIG.seconds, dt);
        for (const s of slices) s.grp.position.y = s.k * sliceH + lift(s.k, e);
        const open = Math.min(1, e / 0.12); whole.children[1].material.opacity = 1 - open; whole.visible = open < 1;
        for (const s of slices) { s.grp.children[1].material.opacity = open; s.grp.children[1].visible = open > 0; }
        shown = e; return true;
      }
    };
  }

  // ======== the conveyor: a belt out of a gate, boxes on it; every hover runs it one box along — the front box
  // goes off the end and drops away, the next comes through the gate. Never reversed: the belt only runs forward.
  const CONVEYOR = Object.assign({}, SHARED, {
    boxes: 2,              // boxes on the belt at rest (one in the gate, then one per pitch)
    box: 0.72,             // box size, in belt widths
    pitch: 1.45,           // spacing along the belt, in belt widths
    seconds: 1.1,          // one cycle
    drop: 0.9,             // how far the leaving box falls, in belt widths
    tilt: 28               // and how far it tips, degrees
  });
  function conveyorScene({ THREE, scene, solid, dispose, CONFIG }) {
    // belt units: width 1 (x), along the belt is +z (toward the viewer); the gate stands at the back
    const BW = 1, BT = 0.08, Z0 = -1.4, Z1 = 1.85, BX = 0.15;           // belt: x centred on BX, from behind the gate to the front end
    const G = { x0: -0.95, x1: 0.85, y1: 1.6, z0: -0.65, z1: -0.25, ox0: -0.36, ox1: 0.66, oy0: BT, oy1: 0.98 };   // the gate and its opening
    const belt = solid(new THREE.BoxGeometry(BW, BT, Z1 - Z0)); belt.position.set(BX, BT / 2, (Z0 + Z1) / 2); scene.add(belt);
    { const s = new THREE.Shape(); s.moveTo(G.x0, 0); s.lineTo(G.x1, 0); s.lineTo(G.x1, G.y1); s.lineTo(G.x0, G.y1); s.closePath();
      const hole = new THREE.Path(); hole.moveTo(G.ox0, G.oy0); hole.lineTo(G.ox1, G.oy0); hole.lineTo(G.ox1, G.oy1); hole.lineTo(G.ox0, G.oy1); hole.closePath(); s.holes.push(hole);
      const g = new THREE.ExtrudeGeometry(s, { depth: G.z1 - G.z0, bevelEnabled: false }); g.translate(0, 0, G.z0); const gate = solid(g); scene.add(gate); }
    let boxes = [], B, P, M;
    function rebuild() { for (const b of boxes) dispose(b); boxes = []; B = CONFIG.box; P = CONFIG.pitch; M = Math.max(1, CONFIG.boxes | 0) + 2;   // +1 waiting behind the gate, +1 on its way off
      for (let j = 0; j < M; j++) { const b = solid(new THREE.BoxGeometry(B, B, B), true); scene.add(b); boxes.push(b); } }
    rebuild();
    const ZM = G.z1 + B * 0.5 - 0.36;   // slot 0: the box in the mouth of the gate, nosing out of it
    let target = 0, phi = 0, vel = 0, shown = -1;
    const slotOf = (j, ph) => ((j + ph) % M + M) % M - 1;   // slot -1 waits behind the gate, 0 is in the gate, then one per pitch; the last slot is off the end
    function place(b, s) {
      const z = ZM + s * P, over = (z + B / 2) - Z1;   // how far the box's nose is past the end of the belt
      let y = BT + B / 2, rot = 0, a = 1, vis = s > -0.42;   // hidden until it is fully behind the gate's face
      if (over > 0) { const f = Math.min(1, over / B); y -= CONFIG.drop * f * f; rot = -CONFIG.tilt * Math.PI / 180 * f; a = 1 - Math.max(0, (f - 0.35) / 0.65); if (f >= 1) vis = false; }
      b.visible = vis && a > 0.01; b.position.set(BX, y, z); b.rotation.x = rot; for (const m of b.userData.mats) m.opacity = a;
    }
    return {
      center() { return new THREE.Vector3(BX - 0.1, 0.55, (G.z0 + Z1) / 2 + 0.1); },
      bounds() { const pts = []; const add = (x, y, z) => pts.push(new THREE.Vector3(x, y, z));
        for (const x of [G.x0, G.x1]) for (const y of [0, G.y1]) for (const z of [G.z0, G.z1]) add(x, y, z);
        for (const x of [BX - BW / 2, BX + BW / 2]) for (const z of [G.z0, Z1]) add(x, 0, z), add(x, BT, z);
        for (const s of [0, M - 2, M - 2 + 0.5]) { const z = ZM + s * P, over = Math.max(0, (z + B / 2) - Z1), f = Math.min(1, over / B), y = BT + B / 2 - CONFIG.drop * f * f; for (const dx of [-B / 2, B / 2]) for (const dy of [-B / 2, B / 2]) for (const dz of [-B / 2, B / 2]) add(BX + dx, y + dy, z + dz); }
        return pts; },
      enter() { target += 1; }, leave() {}, tap() { target += 1; },
      set(p) { if ('boxes' in p || 'box' in p || 'pitch' in p) { rebuild(); } shown = -1; },
      state() { return { phase: phi, target }; },
      update(dt, reduced) {
        if (phi === target && vel === 0 && shown === phi) return false;
        if (reduced) { phi = target; vel = 0; } else [phi, vel] = spring(phi, vel, target, CONFIG.seconds, dt);
        for (let j = 0; j < M; j++) place(boxes[j], slotOf(j, phi));
        shown = phi; return true;
      }
    };
  }

  function mount(target, config, DEF, sceneFn) {
    const host = typeof target === 'string' ? document.querySelector(target) : target;
    if (!host) return Promise.reject(new Error('IsoMarks: target not found'));
    const CONFIG = Object.assign({}, DEF, config || {});
    return loadThree().then(() => stage(host, CONFIG, sceneFn));
  }
  global.IsoMarks = {
    flag: (t, c) => mount(t, c, FLAG, flagScene),
    conveyor: (t, c) => mount(t, c, CONVEYOR, conveyorScene),
    defaults: { flag: FLAG, conveyor: CONVEYOR }, defaultMark, version: '1.0.0'
  };
})(typeof window !== 'undefined' ? window : this);
