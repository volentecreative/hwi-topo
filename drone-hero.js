/*!
 * drone-hero.js — the heavy-lift drone model drawn as line work, framed on one of its motors.
 *
 *   <div id="drone" style="position:absolute;inset:0"></div>
 *   <script src="https://cdn.jsdelivr.net/gh/volentecreative/hwi-topo@<commit>/drone-hero.js"></script>
 *   <script>DroneHero.mount('#drone', { focus: 'FR' });</script>
 *
 * The model (heavy_lift_drone_model.glb, beside this script) is drawn the house way: faces in the page colour so
 * near parts hide far ones, creases and silhouettes as lines. The focused motor — its base, coil, cap, shaft, hub
 * and propeller — is drawn in the primary colour, everything else in the secondary. The camera is orthographic,
 * looks at the motor from the side so its arm runs off to the right, and puts the motor at a chosen point of the
 * frame, so the composition holds at any size. The focused propeller turns slowly. Colours come from CSS variables:
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
    focus: 'FR',               // which motor: FR, FL, BR, BL, or with ' 2' for the second ring (e.g. 'FR 2')
    azimuth: 'auto',           // camera heading in degrees, or 'auto': side-on to the focused arm, arm to the right
    elevation: 8,              // camera height above the horizon, degrees
    zoom: 0.5,                 // the focused motor's height (base to cap) as a fraction of the frame's height
    point: { x: 0.5, y: 0.45 },        // where the motor sits in the frame (fractions of width and height)
    pointNarrow: { x: 0.5, y: 0.4 },   // … on screens up to `breakpoint` wide
    breakpoint: 991,
    propSeconds: 8,            // seconds per turn of the focused propeller; 0 = still
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

    // ---- the model, baked into world space; the focused motor's parts are told apart by name
    const key = String(CONFIG.focus || 'FR').trim();
    // names come through the loader with spaces as underscores: Motor_Base_FR, Propeller_FR_2 …
    const partOf = name => { const m = /^(Motor[ _]Base|Motor[ _]Coil|Motor[ _]Cap|Motor[ _]Shaft|Prop[ _]Hub|Propeller|Arm)[ _](FR|FL|BR|BL)(?:[ _](2))?$/.exec(name || ''); return m ? { part: m[1].replace('_', ' '), pos: m[2] + (m[3] ? ' 2' : '') } : null; };
    const skip = name => /^mesh_\d+_instance/.test(name || '');   // stray unnamed instances the exporter left at the origin
    gltf.scene.updateMatrixWorld(true);
    const focusBox = new THREE.Box3(), motorBox = new THREE.Box3(), armBox = new THREE.Box3(), all = new THREE.Box3(); let prop = null, propGeo = null;
    const meshes = []; gltf.scene.traverse(o => { if (o.isMesh && !skip(o.name)) meshes.push(o); });
    for (const o of meshes) {
      const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); if (!g.attributes.normal) g.computeVertexNormals();
      const info = partOf(o.name), mine = !!(info && info.pos === key && info.part !== 'Arm');
      g.computeBoundingBox(); all.union(g.boundingBox);
      if (mine) { focusBox.union(g.boundingBox); if (/^Motor/.test(info.part) || info.part === 'Prop Hub') motorBox.union(g.boundingBox); }
      if (info && info.pos === key && info.part === 'Arm') armBox.union(g.boundingBox);
      const grp = new THREE.Group();
      grp.add(new THREE.Mesh(g, faceMat));
      const hull = new THREE.Mesh(g, mine ? mats.hull1 : mats.hull2); hull.renderOrder = -1; grp.add(hull);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(g, CONFIG.crease), mine ? mats.line1 : mats.line2); edges.renderOrder = 1; grp.add(edges);
      if (mine && info.part === 'Propeller') { prop = grp; propGeo = g; }
      scene.add(grp);
    }
    // the focused propeller turns about its own axis: recentre its geometry on the hub and spin the group
    if (prop) { const c = new THREE.Vector3(); motorBox.getCenter(c); c.y = 0; const done = new Set(); for (const ch of prop.children) { if (done.has(ch.geometry)) continue; done.add(ch.geometry); ch.geometry.translate(-c.x, 0, -c.z); } prop.position.set(c.x, 0, c.z); }

    // ---- the view: from the side of the arm, the motor at the chosen point of the frame, sized by zoom
    const target = new THREE.Vector3(); motorBox.getCenter(target);
    const motorH = Math.max(1e-3, motorBox.max.y - motorBox.min.y);
    const armDir = new THREE.Vector3(); (armBox.isEmpty() ? all : armBox).getCenter(armDir); armDir.sub(target); armDir.y = 0; if (armDir.lengthSq() < 1e-9) armDir.set(1, 0, 0); armDir.normalize();
    const azimuth = () => CONFIG.azimuth === 'auto' || CONFIG.azimuth === undefined ? Math.atan2(armDir.x, armDir.z) / D2R - 90 : +CONFIG.azimuth;   // side-on, so the arm runs to the right
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
      dirty = true;
    }
    let dirty = true, alive = true, visible = true, lastT = performance.now();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const io = new IntersectionObserver(en => { visible = en[0].isIntersecting; }); io.observe(host);
    function tick(now) {
      if (!alive) return; requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
      if (prop && CONFIG.propSeconds > 0 && !reduced && visible) { prop.rotation.y += dt * Math.PI * 2 / CONFIG.propSeconds; dirty = true; }
      if (!dirty || !visible) return; dirty = false; renderer.render(scene, camera);
    }
    requestAnimationFrame(tick);
    let lastColors = '';
    function applyColors() {
      const next = {}; for (const k of COLOR_KEYS) next[k] = resolveColor(host, RAW[k]);
      const sig = JSON.stringify(next); if (sig === lastColors) return; lastColors = sig; Object.assign(CONFIG, next);
      host.style.background = CONFIG.background; faceMat.color.set(CONFIG.face); mats.line1.color.set(CONFIG.primary); mats.hull1.color.set(CONFIG.primary); mats.line2.color.set(CONFIG.secondary); mats.hull2.color.set(CONFIG.secondary); dirty = true;
    }
    applyColors();
    const themeWatch = setInterval(() => { if (alive) applyColors(); }, 400);
    const ro = global.ResizeObserver ? new ResizeObserver(frame) : null; if (ro) ro.observe(host); else addEventListener('resize', frame);
    frame();
    return {
      set(patch) { Object.assign(CONFIG, patch || {}); for (const k of COLOR_KEYS) if (patch && k in patch) { RAW[k] = patch[k]; lastColors = ''; } applyColors(); frame(); },
      get state() { return { focus: key, azimuth: azimuth(), motorHeight: motorH, triangles: meshes.reduce((n, m) => n + (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3, 0) }; },
      destroy() { alive = false; clearInterval(themeWatch); io.disconnect(); if (ro) ro.disconnect(); else removeEventListener('resize', frame); renderer.dispose(); renderer.domElement.remove(); }
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
  global.DroneHero = { mount, defaults: DEFAULTS, version: '1.0.0' };
})(typeof window !== 'undefined' ? window : this);
