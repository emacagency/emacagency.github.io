// EMAC research holograms: one small three.js stage per article (Mars, a living cell, a data globe, a desalination membrane, a fusion reactor).
// Mounted by research.js when a [data-holo] stage nears the viewport. Drag to turn; buttons in .hotspots[data-for] highlight parts.
import * as THREE from 'three';
import * as d3 from './lib/d3-lite.js';
import { indicators, world, LAYERS, RAMP } from './research.js';

const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const HOLO = new THREE.Color('#9FDCEB');

const NOISE = `
float h3(vec3 p){ p = fract(p * .3183099 + .1); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p){ float a = .5, s = 0.; for (int i = 0; i < 5; i++) { s += a * n3(p); p *= 2.03; a *= .5; } return s; }`;

// Fresnel-rim hologram shell with moving scan lines. surface=1 adds a noisy albedo (Mars, membranes).
function holoMat(color = HOLO, { alpha = 1, rim = 2.2, surface = 0, base = .06, hi = '#FFFFFF' } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uHiC: { value: new THREE.Color(hi) }, uTime: { value: 0 }, uAlpha: { value: alpha }, uRim: { value: rim }, uSurf: { value: surface }, uBase: { value: base }, uHi: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vW; varying vec3 vO;
      void main(){ vO = position; vec4 wp = modelMatrix * vec4(position, 1.); vW = wp.xyz; vN = normalize(normalMatrix * normal); vec4 mv = viewMatrix * wp; vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform vec3 uHiC; uniform float uTime, uAlpha, uRim, uSurf, uBase, uHi; varying vec3 vN; varying vec3 vV; varying vec3 vW; varying vec3 vO; ${NOISE}
      void main(){
        float f = pow(1. - abs(dot(normalize(vN), normalize(vV))), uRim);
        float scan = .78 + .22 * sin(vW.y * 70. - uTime * 3.);
        float s = 0.;
        if (uSurf > 0.) { float n = fbm(vO * 3.2); float d = fbm(vO * 9. + 4.); s = uSurf * (smoothstep(.42, .7, n) * .55 + d * .25 + smoothstep(.9, .96, abs(normalize(vO).y)) * .9); }
        float a = (uBase + f + s) * scan * uAlpha;
        vec3 c = mix(uColor, vec3(1.), f * .35 + s * .2);
        c = mix(c, uHiC, uHi * .55);
        a *= 1. + uHi * .9;
        gl_FragColor = vec4(c * a, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}
const lineMat = (c = HOLO, o = .35) => new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
function dotTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.35, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}
let DOT;
const ptsMat = (c, size, o = .9, vc = false) => new THREE.PointsMaterial({ color: vc ? 0xffffff : c, size, map: (DOT ||= dotTex()), transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, vertexColors: vc, sizeAttenuation: true });
const ll = (lat, lon, r = 1) => { const a = lat * Math.PI / 180, b = lon * Math.PI / 180; return new THREE.Vector3(r * Math.cos(a) * Math.cos(b), r * Math.sin(a), -r * Math.cos(a) * Math.sin(b)); };
const rnd = (a, b) => a + Math.random() * (b - a);
function graticule(r, step = 15) {
  const p = [];
  for (let lat = -75; lat <= 75; lat += step) for (let lon = 0; lon < 360; lon += 4) p.push(ll(lat, lon, r), ll(lat, lon + 4, r));
  for (let lon = 0; lon < 360; lon += step) for (let lat = -88; lat < 88; lat += 4) p.push(ll(lat, lon, r), ll(lat + 4, lon, r));
  return new THREE.BufferGeometry().setFromPoints(p);
}
const mats = o => { const out = []; o.traverse(n => { if (n.material) out.push(n.material); }); return out; };

/* ---------------- scenes ---------------- */
const SCENES = {
  mars(S) {
    const g = new THREE.Group(); S.root.add(g);
    const tint = new THREE.Color('#F2A07B');
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), holoMat(tint, { surface: .9, rim: 2.4, base: .1 }));
    g.add(body, new THREE.LineSegments(graticule(1.004), lineMat('#F6C2A6', .12)));
    const atm = new THREE.Mesh(new THREE.SphereGeometry(1.07, 64, 48), holoMat('#F6B08E', { rim: 4, base: 0, alpha: .55 }));
    g.add(atm);
    // Olympus Mons and landers (lat, lon east)
    const sites = [[18.4, 77.5], [-4.6, 137.4], [4.5, 135.6], [25.1, 109.9], [22.3, -48.0], [-1.9, -5.5], [18.65, -133.8]];
    const pins = sites.map(([la, lo]) => {
      const p = new THREE.Group(), a = ll(la, lo, 1.0), b = ll(la, lo, 1.18);
      const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), lineMat('#FFFFFF', .7));
      const dot = new THREE.Points(new THREE.BufferGeometry().setFromPoints([b]), ptsMat('#9FDCEB', .09, 1));
      const ring = new THREE.Mesh(new THREE.RingGeometry(.035, .045, 32), new THREE.MeshBasicMaterial({ color: '#9FDCEB', transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      ring.position.copy(ll(la, lo, 1.003)); ring.lookAt(ll(la, lo, 2));
      p.add(ln, dot, ring); g.add(p); return { p, dot, ring, v: a };
    });
    // Phobos on its orbit
    const orb = new THREE.Group(); S.root.add(orb); orb.rotation.x = .35;
    const oc = []; for (let i = 0; i <= 128; i++) { const t = i / 128 * Math.PI * 2; oc.push(new THREE.Vector3(Math.cos(t) * 1.75, 0, Math.sin(t) * 1.75)); }
    orb.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(oc), lineMat('#F6C2A6', .18)));
    const ph = new THREE.Mesh(new THREE.IcosahedronGeometry(.06, 1), holoMat('#F6C2A6', { base: .3 })); orb.add(ph);
    S.focus = i => { pins.forEach((q, j) => { q.ring.scale.setScalar(j === i ? 2.2 : 1); q.dot.material.size = j === i ? .16 : .09; }); if (i >= 0) S.turnTo(-Math.atan2(pins[i].v.x, pins[i].v.z), Math.asin(pins[i].v.y) * .6); };
    S.tick = t => { orb.children[1].position.set(Math.cos(t * .5) * 1.75, 0, Math.sin(t * .5) * 1.75); ph.rotation.y = t; pins.forEach(q => q.ring.material.opacity = .5 + .4 * Math.sin(t * 3)); };
    S.cam.position.set(0, 0, 4.7);
  },

  cell(S) {
    const g = new THREE.Group(); S.root.add(g);
    const parts = {};
    const mem = new THREE.IcosahedronGeometry(1.55, 6), pos = mem.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); const k = 1 + .06 * Math.sin(v.x * 3.1) * Math.cos(v.y * 2.7) + .04 * Math.sin(v.z * 5.3 + v.x); v.multiplyScalar(k); v.y *= .82; pos.setXYZ(i, v.x, v.y, v.z); }
    mem.computeVertexNormals();
    parts.membrane = new THREE.Mesh(mem, holoMat(HOLO, { rim: 2.6, surface: .12, base: .015 }));
    const nuc = new THREE.Group(); nuc.position.set(-.25, .05, 0);
    nuc.add(new THREE.Mesh(new THREE.SphereGeometry(.52, 64, 48), holoMat('#B9A6F2', { rim: 1.8, base: .08 })));
    nuc.add(new THREE.Mesh(new THREE.SphereGeometry(.17, 32, 24), holoMat('#E0D3FC', { rim: 1.2, base: .35 })));
    const pore = []; for (let i = 0; i < 180; i++) pore.push(new THREE.Vector3().randomDirection().multiplyScalar(.53));
    nuc.add(new THREE.Points(new THREE.BufferGeometry().setFromPoints(pore), ptsMat('#E0D3FC', .035, .9)));
    // chromatin as a tangled curve inside
    const ch = []; let p = new THREE.Vector3(); for (let i = 0; i < 900; i++) { p.add(new THREE.Vector3().randomDirection().multiplyScalar(.035)); if (p.length() > .42) p.multiplyScalar(.9); ch.push(p.clone()); }
    nuc.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ch), lineMat('#C3AEEB', .25)));
    parts.nucleus = nuc;
    // endoplasmic reticulum: folded sheets around the nucleus
    const er = new THREE.Group(); er.position.copy(nuc.position);
    for (let i = 0; i < 7; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(.66 + i * .07, .012, 6, 120, Math.PI * rnd(.9, 1.5)), holoMat('#7FD4C1', { rim: 1, base: .5, alpha: .8 })); t.rotation.set(rnd(-.6, .6), rnd(-.6, .6), rnd(0, 6.28)); er.add(t); }
    parts.er = er;
    // golgi: stacked curved cisternae
    const go = new THREE.Group(); go.position.set(.75, .32, .25); go.rotation.set(.3, .4, -.5);
    for (let i = 0; i < 5; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(.26 - i * .025, .018, 6, 40, Math.PI * .9), holoMat('#F2C46B', { rim: 1, base: .45 })); t.position.z = i * .045; t.scale.y = .5; go.add(t); }
    parts.golgi = go;
    // mitochondria with cristae
    const mi = new THREE.Group();
    const spots = [[.85, -.35, .3], [.4, -.7, -.35], [-.9, -.55, .35], [-1.0, .5, -.2], [.25, .75, -.45], [1.0, .05, -.45], [-.2, -.75, .55], [.65, .55, .6]];
    for (const s of spots) {
      const m = new THREE.Group(); m.position.set(...s); m.rotation.set(rnd(0, 3), rnd(0, 3), rnd(0, 3));
      m.add(new THREE.Mesh(new THREE.CapsuleGeometry(.075, .22, 6, 16), holoMat('#F59E7C', { rim: 1.6, base: .12 })));
      const cr = []; for (let k = -4; k <= 4; k++) { const y = k * .03; cr.push(new THREE.Vector3(-.06, y, 0), new THREE.Vector3(.06, y + .012, 0)); }
      m.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(cr), lineMat('#FFC3AD', .6)));
      mi.add(m);
    }
    parts.mito = mi;
    // ribosomes: thousands of specks in the cytoplasm
    const rb = []; while (rb.length < 2600) { const q = new THREE.Vector3(rnd(-1.45, 1.45), rnd(-1.2, 1.2), rnd(-1.45, 1.45)); if (q.length() < 1.4 && q.distanceTo(nuc.position) > .58) rb.push(q); }
    parts.ribo = new THREE.Points(new THREE.BufferGeometry().setFromPoints(rb), ptsMat('#BFE9F5', .022, .7));
    // cytoskeleton filaments
    const cy = []; for (let i = 0; i < 46; i++) { const d = new THREE.Vector3().randomDirection(); cy.push(d.clone().multiplyScalar(.55).add(nuc.position), d.clone().multiplyScalar(1.38).setY(d.y * 1.1)); }
    parts.cyto = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(cy), lineMat('#9FDCEB', .12));
    // vesicles
    const ves = new THREE.Group(); for (let i = 0; i < 14; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(rnd(.03, .055), 16, 12), holoMat('#F2C46B', { base: .3, rim: 1 })); b.position.set(rnd(-1, 1.1), rnd(-.8, .8), rnd(-1, 1)); b.userData.ph = rnd(0, 6); ves.add(b); }
    parts.golgi.userData.ves = ves; g.add(ves);
    Object.values(parts).forEach(o => g.add(o));
    const order = ['membrane', 'nucleus', 'mito', 'er', 'golgi', 'ribo'];
    S.focus = i => {
      order.forEach((k, j) => mats(parts[k]).forEach(m => {
        if (m.uniforms) { m.uniforms.uHi.value = j === i ? 1 : 0; m.uniforms.uAlpha.value = i < 0 || j === i ? (k === 'er' ? .8 : 1) : .3; }
        else { m.userData.o ??= m.opacity; m.opacity = i < 0 || j === i ? m.userData.o * (j === i ? 1.6 : 1) : m.userData.o * .3; }
      }));
    };
    S.tick = t => { ves.children.forEach(b => { b.position.y += Math.sin(t * .8 + b.userData.ph) * .0012; }); mi.children.forEach((m, i) => { m.rotation.z += .002 * (i % 2 ? 1 : -1); }); };
    S.cam.position.set(0, .3, 5.3);
  },

  async earth(S, el) {
    const key = el.dataset.ind || 'co2pc', L = LAYERS[key];
    const [D, fc] = await Promise.all([indicators(), world()]);
    const g = new THREE.Group(); S.root.add(g);
    g.add(new THREE.Mesh(new THREE.SphereGeometry(1, 72, 48), holoMat(HOLO, { rim: 2.8, base: .025 })));
    g.add(new THREE.LineSegments(graticule(1.002, 30), lineMat(HOLO, .07)));
    // borders
    const segs = [];
    const addRing = r => { for (let i = 1; i < r.length; i++) segs.push(ll(r[i - 1][1], r[i - 1][0], 1.003), ll(r[i][1], r[i][0], 1.003)); };
    fc.features.forEach(f => { const c = f.geometry.coordinates; if (f.geometry.type === 'Polygon') c.forEach(addRing); else c.forEach(p => p.forEach(addRing)); });
    g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(segs), lineMat(HOLO, .32)));
    // data spikes at centroids, height on a log scale, colour from the map ramp
    const vals = D[key].v, ramp = d3.scaleThreshold().domain(L.th).range(RAMP[L.ramp]);
    const items = fc.features.filter(f => vals[f.properties.a3] > 0).map(f => ({ c: d3.geoCentroid(f), v: vals[f.properties.a3] }));
    const mx = Math.log10(Math.max(...items.map(i => i.v)) + 1);
    const geo = new THREE.BoxGeometry(.016, 1, .016); geo.translate(0, .5, 0);
    const inst = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ transparent: true, opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false }), items.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    const hs = items.map(i => .03 + .32 * Math.log10(i.v + 1) / mx);
    const place = k => items.forEach((it, i) => { const p = ll(it.c[1], it.c[0], 1.0); q.setFromUnitVectors(up, p.clone().normalize()); m4.compose(p, q, new THREE.Vector3(1, Math.max(.001, hs[i] * k), 1)); inst.setMatrixAt(i, m4); });
    items.forEach((it, i) => inst.setColorAt(i, col.set(ramp(it.v)).lerp(new THREE.Color('#ffffff'), .15)));
    place(still ? 1 : 0); g.add(inst);
    const tops = new THREE.Points(new THREE.BufferGeometry().setFromPoints(items.map((it, i) => ll(it.c[1], it.c[0], 1 + hs[i]))), ptsMat('#FFFFFF', .03, .8));
    tops.visible = still; g.add(tops);
    let grow = still ? 1 : 0;
    S.tick = () => { if (grow < 1) { grow = Math.min(1, grow + .012); place(1 - Math.pow(1 - grow, 3)); inst.instanceMatrix.needsUpdate = true; if (grow === 1) tops.visible = true; } };
    g.rotation.x = .35; S.root.rotation.y = -0.6;
    S.hud('DATA GLOBE · ' + key.toUpperCase(), String(D[key].year));
    S.cam.position.set(0, 0, 3.9);
  },

  water(S) {
    // reverse osmosis: pressure pushes water molecules through the membrane, salt ions stay behind
    const g = new THREE.Group(); S.root.add(g);
    const mem = new THREE.Group();
    const grid = []; for (let i = -10; i <= 10; i++) { grid.push(new THREE.Vector3(0, i * .1, -1), new THREE.Vector3(0, i * .1, 1)); grid.push(new THREE.Vector3(0, -1, i * .1), new THREE.Vector3(0, 1, i * .1)); }
    mem.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(grid), lineMat(HOLO, .28)));
    mem.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateY(Math.PI / 2), holoMat(HOLO, { rim: .6, base: .08, alpha: .6 })));
    g.add(mem);
    const box = []; const bx = (x0, x1) => { const c = [[x0, -1, -1], [x1, -1, -1], [x1, 1, -1], [x0, 1, -1], [x0, -1, 1], [x1, -1, 1], [x1, 1, 1], [x0, 1, 1]].map(a => new THREE.Vector3(...a)); [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]].forEach(([a, b]) => box.push(c[a], c[b])); };
    bx(-1.9, 0); bx(0, 1.9);
    g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(box), lineMat(HOLO, .16)));
    const N = 520, S2 = 90;
    const wp = new Float32Array(N * 3), sp = new Float32Array(S2 * 3), sc = new Float32Array(S2 * 3);
    const wv = [], sv = [];
    for (let i = 0; i < N; i++) { wp.set([rnd(-1.85, i < 120 ? 1.85 : -.05), rnd(-.95, .95), rnd(-.95, .95)], i * 3); wv.push(new THREE.Vector3().randomDirection().multiplyScalar(.006)); }
    const na = new THREE.Color('#F2C46B'), cl = new THREE.Color('#96CAA0');
    for (let i = 0; i < S2; i++) { sp.set([rnd(-1.85, -.08), rnd(-.95, .95), rnd(-.95, .95)], i * 3); sv.push(new THREE.Vector3().randomDirection().multiplyScalar(.004)); (i % 2 ? na : cl).toArray(sc, i * 3); }
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.BufferAttribute(wp, 3));
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setAttribute('color', new THREE.BufferAttribute(sc, 3));
    const wpts = new THREE.Points(wg, ptsMat('#7CCBF0', .085, 1)), spts = new THREE.Points(sg, ptsMat(0xffffff, .17, 1, true));
    g.add(wpts, spts);
    // pressure arrow
    const arr = new THREE.Group(); arr.position.set(-2.25, 0, 0);
    arr.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-.4, 0, 0), new THREE.Vector3(.15, 0, 0)]), lineMat('#FFFFFF', .7)));
    const head = new THREE.Mesh(new THREE.ConeGeometry(.06, .16, 16).rotateZ(-Math.PI / 2), holoMat('#FFFFFF', { base: .6 })); head.position.x = .2; arr.add(head);
    g.add(arr);
    let flow = 1;
    S.tick = () => {
      if (still) return;
      for (let i = 0; i < N; i++) {
        const o = i * 3, v = wv[i]; v.x += .00045 * flow; v.multiplyScalar(.985); v.add(new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(.0012));
        let x = wp[o] + v.x, y = wp[o + 1] + v.y, z = wp[o + 2] + v.z;
        if (x > 1.85) { x = rnd(-1.85, -1.2); }
        if (x < -1.85) { x = -1.85; v.x *= -1; }
        if (Math.abs(y) > .95) { v.y *= -1; y = Math.sign(y) * .95; } if (Math.abs(z) > .95) { v.z *= -1; z = Math.sign(z) * .95; }
        wp[o] = x; wp[o + 1] = y; wp[o + 2] = z;
      }
      for (let i = 0; i < S2; i++) {
        const o = i * 3, v = sv[i]; v.x += .0002 * flow; v.add(new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(.0009)); v.multiplyScalar(.985);
        let x = sp[o] + v.x, y = sp[o + 1] + v.y, z = sp[o + 2] + v.z;
        if (x > -.07) { x = -.07; v.x = -Math.abs(v.x); } if (x < -1.85) { x = -1.85; v.x = Math.abs(v.x); }
        if (Math.abs(y) > .95) { v.y *= -1; y = Math.sign(y) * .95; } if (Math.abs(z) > .95) { v.z *= -1; z = Math.sign(z) * .95; }
        sp[o] = x; sp[o + 1] = y; sp[o + 2] = z;
      }
      wg.attributes.position.needsUpdate = true; sg.attributes.position.needsUpdate = true;
      head.position.x = .2 + Math.sin(performance.now() / 300) * .03;
    };
    S.focus = i => { flow = i === 1 ? 0 : 1; mem.children.forEach(m => { if (m.material.uniforms) m.material.uniforms.uHi.value = i === 2 ? 1 : 0; }); spts.material.size = i === 3 ? .28 : .17; };
    S.hud('REVERSE OSMOSIS', 'SEAWATER → FRESH');
    S.root.rotation.set(.32, -.55, 0); S.cam.position.set(0, 0, 4.6); S.autoSpin = .0012;
  },

  energy(S) {
    // tokamak: plasma ring held by toroidal field coils around a central solenoid
    const g = new THREE.Group(); S.root.add(g); g.rotation.x = .55;
    const R = 1.15, r = .42;
    const vessel = new THREE.Mesh(new THREE.TorusGeometry(R, r, 48, 140), holoMat(HOLO, { rim: 2, base: .02, alpha: .8 }));
    vessel.rotation.x = Math.PI / 2; g.add(vessel);
    const coils = new THREE.Group();
    for (let i = 0; i < 18; i++) { const c = new THREE.Mesh(new THREE.TorusGeometry(r + .12, .022, 8, 64), holoMat('#C3C9CF', { rim: 1.2, base: .14, alpha: .7 })); const a = i / 18 * Math.PI * 2; c.position.set(Math.cos(a) * R, 0, Math.sin(a) * R); c.rotation.y = -a; coils.add(c); }
    g.add(coils);
    const sol = new THREE.Mesh(new THREE.CylinderGeometry(.24, .24, 1.5, 48, 1, true), holoMat('#B9A6F2', { rim: 1.4, base: .12 }));
    g.add(sol);
    const solL = []; for (let k = 0; k < 24; k++) { const y = -.72 + k * .0625; for (let j = 0; j < 48; j++) { const a = j / 48 * 6.283, b = (j + 1) / 48 * 6.283; solL.push(new THREE.Vector3(Math.cos(a) * .245, y, Math.sin(a) * .245), new THREE.Vector3(Math.cos(b) * .245, y, Math.sin(b) * .245)); } }
    sol.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(solL), lineMat('#C3AEEB', .18)));
    const N = 2200, pp = new Float32Array(N * 3), pc = new Float32Array(N * 3), st = [];
    const c1 = new THREE.Color('#F49FAC'), c2 = new THREE.Color('#9FDCEB'), cc = new THREE.Color();
    for (let i = 0; i < N; i++) { st.push({ ph: rnd(0, 6.283), th: rnd(0, 6.283), rr: Math.sqrt(Math.random()) * .26, sp: rnd(.6, 1.2) }); cc.copy(c1).lerp(c2, Math.random()).toArray(pc, i * 3); }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pp, 3)); pg.setAttribute('color', new THREE.BufferAttribute(pc, 3));
    const plasma = new THREE.Points(pg, ptsMat(0xffffff, .045, .9, true)); g.add(plasma);
    const upd = dt => { for (let i = 0; i < N; i++) { const s = st[i]; s.ph += .01 * s.sp * dt; s.th += .033 * s.sp * dt; const rad = R + s.rr * Math.cos(s.th); pp.set([Math.cos(s.ph) * rad, s.rr * Math.sin(s.th), Math.sin(s.ph) * rad], i * 3); } pg.attributes.position.needsUpdate = true; };
    upd(0);
    const parts = [plasma, coils, sol, vessel];
    S.focus = i => parts.forEach((p, j) => mats(p).forEach(m => { if (m.uniforms) { m.uniforms.uHi.value = j === i ? 1 : 0; m.uniforms.uAlpha.value = i < 0 || j === i ? 1 : .3; } else m.opacity = i < 0 || j === i ? .9 : .25; }));
    S.tick = () => { if (!still) upd(1); };
    S.hud('TOKAMAK · D + T → He + n', '150,000,000 K');
    S.cam.position.set(0, .2, 5.2); S.autoSpin = .0016;
  },
};

/* ---------------- stage ---------------- */
export async function mount(el) {
  const kind = el.dataset.holo; if (!SCENES[kind]) return;
  const canvas = document.createElement('canvas'); el.prepend(canvas);
  const ren = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  ren.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); ren.setClearColor(0x000000, 0);
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(38, 1, .05, 50);
  const root = new THREE.Group(); scene.add(root);
  const hud = el.querySelector('.hud') || Object.assign(document.createElement('div'), { className: 'hud' });
  if (!hud.parentNode) el.append(hud);
  const S = { root, cam, autoSpin: .0022, tick: null, focus: null,
    hud(a, b) { hud.innerHTML = `<span>${a}</span><span>${b}</span>`; },
    turnTo(y, x = 0) { tgt = { y: y + Math.round((root.rotation.y - y) / (Math.PI * 2)) * Math.PI * 2, x }; } };
  let tgt = null;
  await SCENES[kind](S, el);
  el.classList.add('live');

  const size = () => { const r = el.getBoundingClientRect(); ren.setSize(r.width, r.height, false); cam.aspect = r.width / r.height; cam.fov = cam.aspect < .8 ? 50 : 38; cam.updateProjectionMatrix(); };
  new ResizeObserver(size).observe(el); size();

  // drag to turn (horizontal mostly; vertical swipes keep scrolling the page on touch)
  let drag = null, vy = 0, spin = true;
  el.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, ry: root.rotation.y, rx: root.rotation.x }; tgt = null; spin = false; vy = 0; });
  addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; const ny = drag.ry + dx * .008; vy = ny - root.rotation.y; root.rotation.y = ny; if (e.pointerType === 'mouse') root.rotation.x = Math.max(-.8, Math.min(.8, drag.rx + dy * .005)); });
  addEventListener('pointerup', () => { if (drag) { drag = null; setTimeout(() => (spin = true), 2500); } });

  // hotspots
  const hs = document.querySelector(`.hotspots[data-for="${el.id}"]`), info = document.querySelector(`.hs-info[data-for="${el.id}"]`);
  if (hs && S.focus) {
    const btns = [...hs.querySelectorAll('button')];
    hs.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const i = btns.indexOf(b), on = b.getAttribute('aria-pressed') !== 'true';
      btns.forEach(x => x.setAttribute('aria-pressed', x === b && on));
      S.focus(on ? i : -1);
      if (info) info.innerHTML = on ? `<strong>${b.textContent}</strong>${b.dataset.info}` : info.dataset.idle;
      spin = !on;
    });
    if (info) info.dataset.idle = info.innerHTML;
  }

  let vis = true, t0 = performance.now();
  new IntersectionObserver(es => { vis = es[0].isIntersecting; if (vis) loop(); }).observe(el);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loop(); });
  let raf = 0;
  function frame() {
    raf = 0;
    const t = (performance.now() - t0) / 1000;
    scene.traverse(o => { if (o.material?.uniforms?.uTime) o.material.uniforms.uTime.value = t; });
    if (tgt) { root.rotation.y += (tgt.y - root.rotation.y) * .06; root.rotation.x += (tgt.x - root.rotation.x) * .06; if (Math.abs(tgt.y - root.rotation.y) < .002) tgt = null; }
    else if (!drag) { if (Math.abs(vy) > .0005) { root.rotation.y += vy; vy *= .94; } else if (spin && !still) root.rotation.y += S.autoSpin; }
    S.tick?.(t);
    ren.render(scene, cam);
    if (vis && !document.hidden) loop();
  }
  function loop() { if (!raf) raf = requestAnimationFrame(frame); }
  loop();
}
