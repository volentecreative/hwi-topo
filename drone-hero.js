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
 * alike, the same weight everywhere, with nothing behind showing through. The focused motor's casing (base, coil,
 * cap, shaft) draws in the primary colour, with vertical ribs; everything else in the secondary. The model's
 * propellers are replaced with generated blades that turn as the page scrolls, neighbours counter-rotating. A floor
 * grid fades toward the frame's edges. With `track` set, the camera dollies along a path over that section's scroll:
 * from a high wide shot of the whole aircraft down to beneath the focused motor, looking up at it with the rest of
 * the drone above and behind. Without a track it holds the end of the path. Colours come from CSS variables:
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
    track: '',                 // the tall section the canvas is pinned inside ('closest:.section_hero', a selector, or an element); the camera's path runs over its scroll. '' = hold the end view
    damping: 0.12,             // how closely the camera follows the scroll (per frame at 60fps); 1 = instantly
    fov: 30,                   // the camera's vertical field of view, degrees
    // the end of the path: beneath the focused motor, looking up at it
    azimuth: 'auto',           // camera heading in degrees, or 'auto': side-on to the focused arm (arm to the right), turned by `turn`
    turn: -28,                 // degrees the auto heading swings round; negative swings the camera out to the motor's outer side, so the arm recedes toward the body
    elevation: -12,            // camera height above the horizon, degrees; negative looks up from below
    zoom: 0.36,                // the focused motor's height (base to cap) as a fraction of the frame's height
    point: { x: 0.5, y: 0.5 },         // where the motor sits in the frame (fractions of width and height)
    pointNarrow: { x: 0.5, y: 0.45 },  // … on screens up to `breakpoint` wide
    breakpoint: 991,
    // the start of the path: the whole aircraft, centred, from above
    startElevation: 24,        // degrees above the horizon
    sweep: 40,                 // degrees of heading the camera swings through on the way down
    margin: 0.95,              // breathing room round the whole drone at the start (its bounding sphere over-estimates it, so a little under 1 still leaves room)
    propScroll: 0.35,          // propeller turns per 1000px of scrolling; 0 = the props do not follow the scroll
    propSeconds: 0,            // seconds per idle turn of every propeller; 0 = still unless scrolled
    props: 'blades',           // 'blades': generated blades in place of the model's; 'model': the model's own
    blades: 2, bladeChord: 0.2, bladeTwist: 22,   // per propeller: blade count, widest chord as a share of the radius, root twist in degrees
    grid: 0.5, gridFade: 0.3,  // the floor grid's cell, in motor heights (0 = none), and how far from the motor it starts fading (share of the frame's half-size; it is gone by the edges)
    ribs: 24,                  // vertical ribs round the focused motor's casing; 0 = none
    lineWidth: 1,              // line thickness, in screen pixels
    depthEdge: 0.012, normalEdge: 0.25,   // how big a jump in depth (relative) or in normal (1 - cos) draws a line
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

  // the edge pass: pass one writes normal (rgb) and part (a) with depth; pass two draws a line on the nearer side of
  // any jump in depth or normal between a pixel and its neighbours, in that part's colour
  const ID_VERT = 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
  const ID_FRAG = 'uniform float uId; varying vec3 vN; void main(){ gl_FragColor = vec4(normalize(vN) * 0.5 + 0.5, uId); }';
  const EDGE_FRAG = `
    uniform sampler2D tN, tD; uniform vec2 uRes; uniform float uNear, uFar, uWidth, uDepthT, uNormT; uniform vec3 uC1, uC2; varying vec2 vUv;
    float lin(float z){ float zn = 2.0 * z - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - zn * (uFar - uNear)); }
    void main(){
      vec2 px = uWidth / uRes; vec4 c = texture2D(tN, vUv); float d = lin(texture2D(tD, vUv).x); vec3 n = c.xyz * 2.0 - 1.0;
      if (c.a < 0.01) discard;                                   // background: lines are drawn from the object's side
      float e = 0.0;
      for (int i = 0; i < 2; i++) {                              // each axis: the two neighbours either side
        vec2 o = i == 0 ? vec2(px.x, 0.0) : vec2(0.0, px.y);
        vec4 c1 = texture2D(tN, vUv + o), c2 = texture2D(tN, vUv - o); float d1 = lin(texture2D(tD, vUv + o).x), d2 = lin(texture2D(tD, vUv - o).x);
        // depth: a surface seen at a grazing angle changes depth steadily, a silhouette breaks it — so test the
        // second difference, and let the nearer side of the break own the line
        float bend = abs(d1 + d2 - 2.0 * d) / d;
        float ed = smoothstep(uDepthT, uDepthT * 3.0, bend) * step(d, max(d1, d2) - uDepthT * 0.5 * d);
        // normal: a crease between two faces of one surface; the side with the greater normal key draws it
        float en = 0.0;
        for (int k = 0; k < 2; k++) { vec4 cn = k == 0 ? c1 : c2; float dn = k == 0 ? d1 : d2;
          if (cn.a > 0.01 && abs(dn - d) / d < uDepthT * 2.0) { vec3 nn = normalize(cn.xyz * 2.0 - 1.0);
            float key = dot(n, vec3(0.3, 0.59, 0.11)), keyn = dot(nn, vec3(0.3, 0.59, 0.11));
            en = max(en, key >= keyn ? smoothstep(uNormT, uNormT * 2.0, 1.0 - dot(n, nn)) : 0.0); } }
        e = max(e, max(ed, en));
      }
      if (e < 0.02) discard;
      gl_FragColor = vec4(c.a > 0.75 ? uC1 : uC2, e);
    }`;

  function build(host, CONFIG, gltf) {
    const THREE = global.THREE, D2R = Math.PI / 180;
    const RAW = {}; for (const k of COLOR_KEYS) { RAW[k] = CONFIG[k]; CONFIG[k] = resolveColor(host, CONFIG[k]); }
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.style.background = CONFIG.background; host.style.overflow = 'hidden';
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    const PR = Math.min(devicePixelRatio || 1, CONFIG.pixelRatioCap); renderer.setPixelRatio(PR); renderer.setClearColor(0x000000, 0); renderer.autoClear = false;
    Object.assign(renderer.domElement.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' });
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(+CONFIG.fov || 30, 1, 0.05, 200);
    const faceMat = new THREE.MeshBasicMaterial({ color: CONFIG.face, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    const idMat1 = new THREE.ShaderMaterial({ vertexShader: ID_VERT, fragmentShader: ID_FRAG, uniforms: { uId: { value: 1 } } }), idMat2 = new THREE.ShaderMaterial({ vertexShader: ID_VERT, fragmentShader: ID_FRAG, uniforms: { uId: { value: 0.5 } } });
    const lineMat1 = new THREE.LineBasicMaterial({ color: CONFIG.primary });
    const solids = [];   // {mesh, idMat}
    const solid = (g, mine) => { const m = new THREE.Mesh(g, faceMat); m.userData.idMat = mine ? idMat1 : idMat2; solids.push(m); scene.add(m); return m; };
    // the edge pass's target and quad
    const isGL2 = renderer.capabilities.isWebGL2;
    const depthTex = new THREE.DepthTexture(1, 1); depthTex.type = isGL2 ? THREE.UnsignedIntType : THREE.UnsignedShortType;
    const rt = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthTexture: depthTex, depthBuffer: true, stencilBuffer: false });
    const edgeMat = new THREE.ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: EDGE_FRAG,
      uniforms: { tN: { value: rt.texture }, tD: { value: depthTex }, uRes: { value: new THREE.Vector2(1, 1) }, uNear: { value: camera.near }, uFar: { value: camera.far }, uWidth: { value: 1 }, uDepthT: { value: +CONFIG.depthEdge || 0.012 }, uNormT: { value: +CONFIG.normalEdge || 0.25 }, uC1: { value: new THREE.Color(CONFIG.primary) }, uC2: { value: new THREE.Color(CONFIG.secondary) } } });
    const quadScene = new THREE.Scene(), quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), edgeMat));

    // ---- the model, baked into world space; parts are told apart by name (the loader writes spaces as underscores)
    const key = String(CONFIG.focus || 'FR').trim();
    const partOf = name => { const m = /^(Motor[ _]Base|Motor[ _]Coil|Motor[ _]Cap|Motor[ _]Shaft|Prop[ _]Hub|Propeller|Arm)[ _](FR|FL|BR|BL)(?:[ _](2))?$/.exec(name || ''); return m ? { part: m[1].replace('_', ' '), pos: m[2] + (m[3] ? ' 2' : '') } : null; };
    const skip = name => /^mesh_\d+_instance/.test(name || '');
    gltf.scene.updateMatrixWorld(true);
    const motorBox = new THREE.Box3(), armBox = new THREE.Box3(), all = new THREE.Box3(); let coilBox = new THREE.Box3(), coilH = 0;
    const hubs = {}, propInfo = {};
    const meshes = []; gltf.scene.traverse(o => { if (o.isMesh && !skip(o.name)) meshes.push(o); });
    let tris = 0;
    for (const o of meshes) {
      const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); if (!g.attributes.normal) g.computeVertexNormals(); g.computeBoundingBox(); all.union(g.boundingBox);
      const info = partOf(o.name), isFocus = !!(info && info.pos === key);
      const mine = isFocus && /^Motor/.test(info.part);
      if (mine) { motorBox.union(g.boundingBox); const hh = g.boundingBox.max.y - g.boundingBox.min.y; if (info.part !== 'Motor Shaft' && hh > coilH) { coilH = hh; coilBox = g.boundingBox.clone(); } }
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
    // the focused motor's ribbing: vertical lines round the tallest casing part, just off its surface
    if (CONFIG.ribs > 0 && !coilBox.isEmpty()) {
      const c = new THREE.Vector3(); coilBox.getCenter(c); const r = Math.max(coilBox.max.x - coilBox.min.x, coilBox.max.z - coilBox.min.z) / 2 * 1.004, a = [];
      for (let k = 0; k < CONFIG.ribs; k++) { const t = (k + 0.5) / CONFIG.ribs * Math.PI * 2, x = c.x + Math.cos(t) * r, z = c.z + Math.sin(t) * r; a.push(x, coilBox.min.y, z, x, coilBox.max.y, z); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3)); scene.add(new THREE.LineSegments(g, lineMat1));
    }
    // ---- the two ends of the path
    const target = new THREE.Vector3(); motorBox.getCenter(target);
    const motorH = Math.max(1e-3, motorBox.max.y - motorBox.min.y);
    const armDir = new THREE.Vector3(); (armBox.isEmpty() ? all : armBox).getCenter(armDir); armDir.sub(target); armDir.y = 0; if (armDir.lengthSq() < 1e-9) armDir.set(1, 0, 0); armDir.normalize();
    const azimuth = () => CONFIG.azimuth === 'auto' || CONFIG.azimuth === undefined ? Math.atan2(armDir.x, armDir.z) / D2R - 90 + (+CONFIG.turn || 0) : +CONFIG.azimuth;
    const droneC = new THREE.Vector3(); all.getCenter(droneC); const droneR = all.getSize(new THREE.Vector3()).length() / 2;
    // ---- the floor grid, fading by each point's distance from the motor on screen
    let grid = null;
    function buildGrid() {
      if (grid) { scene.remove(grid); grid.geometry.dispose(); grid = null; } const cell = motorH * (+CONFIG.grid || 0); if (!(cell > 0)) return;
      const y = all.min.y, n = Math.ceil(motorH * 12 / cell), pos = [];
      for (let i = -n; i <= n; i++) { const o = i * cell; for (let j = -n; j < n; j++) { const a = j * cell, b = (j + 1) * cell; pos.push(target.x + o, y, target.z + a, target.x + o, y, target.z + b, target.x + a, y, target.z + o, target.x + b, y, target.z + o); } }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
      grid = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true })); scene.add(grid); fadeGrid();
    }
    function fadeGrid() {
      if (!grid) return; const p = grid.geometry.attributes.position.array, c = grid.geometry.attributes.color.array, v = new THREE.Vector3();
      const lineC = new THREE.Color(CONFIG.secondary), bgC = new THREE.Color(CONFIG.face), t = new THREE.Vector3().copy(camTarget).project(camera), f0 = Math.max(0, Math.min(0.95, +CONFIG.gridFade || 0.3));
      for (let i = 0; i < p.length; i += 3) { v.set(p[i], p[i + 1], p[i + 2]).project(camera); const r = Math.hypot(v.x - t.x, v.y - t.y), f = Math.min(1, Math.max(0, (r - f0) / (1 - f0))); const col = lineC.clone().lerp(bgC, 0.55 + 0.45 * f); c[i] = col.r; c[i + 1] = col.g; c[i + 2] = col.b; }
      grid.geometry.attributes.color.needsUpdate = true;
    }
    // ---- the path: spherical about a target that slides from the drone's centre to the motor, distance in log
    // space, heading and height easing between the two ends, the framing point too — one camera, really moving
    let w = 1, h = 1, progress = 0, progressTarget = 0, shownProgress = -1; const camTarget = droneC.clone();
    const trackEl = (() => { const t = CONFIG.track; if (!t) return null; if (t.nodeType) return t; if (typeof t === 'string' && t.startsWith('closest:')) return host.closest(t.slice(8)); return document.querySelector(t); })();
    const readProgress = () => { if (!trackEl) return 1; const r = trackEl.getBoundingClientRect(), run = Math.max(1, r.height - h); return Math.min(1, Math.max(0, -r.top / run)); };
    function placeCam(e) {
      const fov = (+CONFIG.fov || 30) * D2R, a = w / h, hfov = 2 * Math.atan(Math.tan(fov / 2) * a);
      const d0 = droneR * (+CONFIG.margin || 1.12) / Math.sin(Math.min(fov, hfov) / 2);
      const d1 = motorH / (2 * Math.tan(fov / 2) * Math.max(0.05, +CONFIG.zoom || 0.36));
      const dist = Math.exp(Math.log(d0) + (Math.log(d1) - Math.log(d0)) * e);
      const az = (azimuth() + (+CONFIG.sweep || 0) * (1 - e)) * D2R, el = ((+CONFIG.startElevation || 0) + ((+CONFIG.elevation || 0) - (+CONFIG.startElevation || 0)) * e) * D2R;
      camTarget.copy(droneC).lerp(target, e);
      const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
      camera.position.copy(camTarget).add(dir.multiplyScalar(dist)); camera.lookAt(camTarget);
      camera.near = Math.max(0.02, dist * 0.05); camera.far = dist + droneR * 4; edgeMat.uniforms.uNear.value = camera.near; edgeMat.uniforms.uFar.value = camera.far;
      const narrow = global.matchMedia && global.matchMedia('(max-width: ' + (+CONFIG.breakpoint || 991) + 'px)').matches;
      const pe = (narrow && CONFIG.pointNarrow) || CONFIG.point || { x: 0.5, y: 0.5 }, px = 0.5 + (pe.x - 0.5) * e, py = 0.5 + (pe.y - 0.5) * e;
      camera.setViewOffset(w, h, (0.5 - px) * w, (0.5 - py) * h, w, h); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      fadeGrid(); dirty = true;
    }
    function frame() {
      w = host.clientWidth || 1; h = host.clientHeight || 1; renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = +CONFIG.fov || 30;
      rt.setSize(Math.round(w * PR), Math.round(h * PR)); edgeMat.uniforms.uRes.value.set(Math.round(w * PR), Math.round(h * PR)); edgeMat.uniforms.uWidth.value = Math.max(0.5, (+CONFIG.lineWidth || 1) * PR / 1.5);
      if (!trackEl) progress = progressTarget = 1; placeCam(ease(progress)); shownProgress = progress;
    }
    function render() {
      for (const m of solids) { m.userData.faceMat = m.material; m.material = m.userData.idMat; }   // pass one: normals, part and depth, meshes only
      const lines = []; scene.traverse(o => { if (o.isLine || o.isLineSegments) { lines.push(o); o.visible = false; } });
      renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, camera);
      for (const m of solids) m.material = m.userData.faceMat; for (const l of lines) l.visible = true;
      renderer.setRenderTarget(null); renderer.clear(); renderer.render(scene, camera);   // pass two: faces (occluders), ribs and grid
      renderer.render(quadScene, quadCam);                                                  // pass three: the lines
    }
    // ---- the loop: the camera follows the scroll through the track, damped; the props turn with the scroll
    let dirty = true, alive = true, visible = true, lastT = performance.now(), spin = 0, spinTarget = 0, idle = 0;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const onScroll = () => { spinTarget = (global.scrollY || 0) / 1000 * (+CONFIG.propScroll || 0) * Math.PI * 2; progressTarget = trackEl ? readProgress() : 1; };
    addEventListener('scroll', onScroll, { passive: true }); onScroll(); spin = spinTarget; progress = progressTarget;
    const io = new IntersectionObserver(en => { visible = en[0].isIntersecting; }); io.observe(host);
    function tick(now) {
      if (!alive) return; requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
      if (visible && progressTarget !== progress) { progress = reduced ? progressTarget : progress + (progressTarget - progress) * Math.min(1, (+CONFIG.damping || 0.12) * dt * 60); if (Math.abs(progressTarget - progress) < 1e-5) progress = progressTarget; }
      if (visible && progress !== shownProgress) { placeCam(ease(progress)); shownProgress = progress; }
      if (!reduced && visible) {
        if (CONFIG.propSeconds > 0) { idle += dt * Math.PI * 2 / CONFIG.propSeconds; dirty = true; }
        if (Math.abs(spinTarget - spin) > 1e-4) { spin += (spinTarget - spin) * Math.min(1, dt * 6); if (Math.abs(spinTarget - spin) < 1e-4) spin = spinTarget; dirty = true; }
        for (const p of props) p.mesh.rotation.y = p.dir * (spin + idle) + p.phase;
      }
      if (!dirty || !visible) return; dirty = false; render();
    }
    requestAnimationFrame(tick);
    let lastColors = '';
    function applyColors() {
      const next = {}; for (const k of COLOR_KEYS) next[k] = resolveColor(host, RAW[k]);
      const sig = JSON.stringify(next); if (sig === lastColors) return; lastColors = sig; Object.assign(CONFIG, next);
      host.style.background = CONFIG.background; faceMat.color.set(CONFIG.face); lineMat1.color.set(CONFIG.primary); edgeMat.uniforms.uC1.value.set(CONFIG.primary); edgeMat.uniforms.uC2.value.set(CONFIG.secondary); buildGrid(); dirty = true;
    }
    applyColors();
    const themeWatch = setInterval(() => { if (alive) applyColors(); }, 400);
    const ro = global.ResizeObserver ? new ResizeObserver(frame) : null; if (ro) ro.observe(host); else addEventListener('resize', frame);
    frame();
    return {
      set(patch) { Object.assign(CONFIG, patch || {}); for (const k of COLOR_KEYS) if (patch && k in patch) { RAW[k] = patch[k]; lastColors = ''; } edgeMat.uniforms.uDepthT.value = +CONFIG.depthEdge || 0.012; edgeMat.uniforms.uNormT.value = +CONFIG.normalEdge || 0.25; if (patch && ('grid' in patch || 'gridFade' in patch)) buildGrid(); applyColors(); onScroll(); frame(); },
      setProgress(p) { progressTarget = progress = Math.min(1, Math.max(0, +p || 0)); placeCam(ease(progress)); shownProgress = progress; },
      get state() { return { focus: key, azimuth: azimuth(), progress, motorHeight: motorH, triangles: tris, props: props.length }; },
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
  global.DroneHero = { mount, defaults: DEFAULTS, version: '2.0.0' };
})(typeof window !== 'undefined' ? window : this);
