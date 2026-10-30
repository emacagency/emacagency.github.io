// EMAC hero character: the chosen body form from the character studio, rendered behind the hero.
// Pick the form with data-form on #hero3d, or preview another with ?form=bands|steel|glass|facet|cloud|holo
import * as THREE from 'three';

const host = document.getElementById('hero3d');
const canvas = host.querySelector('canvas');
const FORMS = ['bands', 'steel', 'glass', 'facet', 'cloud', 'holo'];
const q = new URLSearchParams(location.search).get('form');
const FORM = FORMS.includes(q) ? q : (host.dataset.form || 'bands');
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

// phones get a lighter body (18k triangles, ~165 KB) instead of the full 70k
const SMALL = matchMedia('(max-width: 820px)').matches;

function loadMesh() {
  if (window.MESH) return Promise.resolve();
  return new Promise((ok, no) => { const s = document.createElement('script'); s.src = SMALL ? 'emac-body-m.js' : 'emac-body.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
}

function decode(o) {
  const b = s => Uint8Array.from(atob(s), c => c.charCodeAt(0)).buffer;
  const qq = new Uint16Array(b(o.p)), p = new Float32Array(qq.length);
  for (let i = 0; i < qq.length; i++) { const a = i % 3; p[i] = o.lo[a] + (o.hi[a] - o.lo[a]) * qq[i] / 65535; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setIndex(new THREE.BufferAttribute(o.i32 ? new Uint32Array(b(o.i)) : new Uint16Array(b(o.i)), 1));
  g.computeVertexNormals(); g.computeBoundingSphere();
  return g;
}

let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' }); }
catch { throw new Error('no webgl'); }
await loadMesh();

renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.setClearColor(0x000000, 0);
const scene = new THREE.Scene();
const ACC = new THREE.Color('#DCE2E8'), STEEL = new THREE.Color('#C9CED4');

// dark studio environment so brushed steel reads as steel
const pm = new THREE.PMREMGenerator(renderer);
scene.environment = pm.fromScene((() => {
  const e = new THREE.Scene();
  e.add(new THREE.Mesh(new THREE.BoxGeometry(20, 12, 20), new THREE.MeshBasicMaterial({ color: '#1d1f26', side: THREE.BackSide })));
  const panel = (w, h, c, i, p) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(i), side: THREE.DoubleSide })); m.position.set(...p); m.lookAt(0, 1, 0); e.add(m); };
  panel(6, 3, '#ffffff', 2.0, [0, 5.5, 2]); panel(1.2, 7, '#fff1e2', 2.4, [6, 1.5, 5]);
  panel(1, 7, '#d0d8e2', 2.2, [-7, 1.5, -4]); panel(1, 6, '#a8c0ff', .8, [-7, 1, 4]); panel(8, 5, '#e9e6f5', .5, [0, 2, 9]);
  return e;
})(), .02).texture;
scene.add(new THREE.HemisphereLight('#c9cfe0', '#0b0b0f', .25));
const key = new THREE.DirectionalLight('#fff4ea', 1.5); key.position.set(2.2, 4, 3); scene.add(key);
const rim = new THREE.DirectionalLight('#c9d2dc', 1.4); rim.position.set(-2.5, 2.2, -3); scene.add(rim);

const HI = decode(MESH.hi), LO = decode(MESH.lo);
const ray = new THREE.Raycaster(), probe = new THREE.Mesh(HI);
const surfaceZ = (x, y) => { ray.set(new THREE.Vector3(x, y, .6), new THREE.Vector3(0, 0, -1)); const h = ray.intersectObject(probe)[0]; return h ? h.point.z : .08; };
const EYE = [-1, 1].map(s => new THREE.Vector3(s * .031, 1.684, surfaceZ(s * .031, 1.684)));
const CORE = new THREE.Vector3(.034, 1.36, surfaceZ(.034, 1.36));
const HEART = new THREE.Vector3(.03, 1.355, .02);
const J = {
  neck: [0, 1.53, -.015], sh: s => [s * .188, 1.432, -.018], el: s => [s * .252, 1.135, -.04], wr: s => [s * .29, .88, -.005],
  kn: s => [s * .1, .505, .01], an: s => [s * .106, .085, -.012], hip: s => [s * .092, .925, 0], toe: s => [s * .112, .025, .14],
};
const v3 = a => new THREE.Vector3(...a);

const U = { uT: { value: 0 }, uAcc: { value: ACC.clone() } };
function patch(mat, head, body, emis) {
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U, mat.userData.u || {});
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvW=(modelMatrix*vec4(transformed,1.)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vW; uniform float uT; uniform vec3 uAcc;\n' + head)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + body)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + (emis || ''));
  };
  return mat;
}
const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.25, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
const glow = (size, op = 1) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: ACC, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false })); s.scale.setScalar(size); return s; };

function identity(opts = {}) {
  const g = new THREE.Group();
  const eyeM = new THREE.MeshBasicMaterial({ color: new THREE.Color('#eef2f6') });
  EYE.forEach(p => { const e = new THREE.Mesh(new THREE.SphereGeometry(.0105, 24, 12), eyeM); e.scale.set(1.25, .38, .35); e.position.copy(p); g.add(e); const gl = glow(.05, .55); gl.position.copy(p).add(new THREE.Vector3(0, 0, .004)); g.add(gl); });
  if (opts.heart !== false) {
    const h = new THREE.Mesh(new THREE.IcosahedronGeometry(.024, 3), new THREE.MeshBasicMaterial({ color: '#f2f5f8' }));
    h.position.copy(HEART); g.add(h); const hg = glow(.26, .9); hg.position.copy(HEART); g.add(hg); g.userData.heart = [h, hg];
  }
  const orbits = [];
  [[.165, .42, .2], [.2, -.3, 1.7]].forEach(([r, tilt, spin]) => {
    const o = new THREE.Group(); o.position.set(0, 1.695, -.005); o.rotation.set(Math.PI / 2 + tilt, 0, spin);
    o.add(new THREE.Mesh(new THREE.TorusGeometry(r, .0011, 6, 200), new THREE.MeshBasicMaterial({ color: ACC, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false })));
    const bead = new THREE.Mesh(new THREE.SphereGeometry(.0065, 16, 8), new THREE.MeshBasicMaterial({ color: '#f4f6f8' })); bead.add(glow(.06, .8)); o.add(bead);
    o.userData = { r, bead, ph: Math.random() * 6.28 }; orbits.push(o); g.add(o);
  });
  g.userData.orbits = orbits;
  return g;
}

// brushed, matte steel to match the logo
const steelMat = (o = {}) => new THREE.MeshPhysicalMaterial(Object.assign({ color: STEEL, metalness: 1, roughness: .32, clearcoat: .15, clearcoatRoughness: .4, envMapIntensity: 1.05 }, o));

const BUILD = {
  bands() {
    const g = new THREE.Group();
    const m = patch(steelMat({ side: THREE.DoubleSide }), ``,
      `float bb = fract(vW.y*31.0 - uT*0.035); if (bb > 0.58) discard; if (!gl_FrontFacing) diffuseColor.rgb *= 0.18;`,
      `totalEmissiveRadiance += uAcc * smoothstep(0.50, 0.58, bb) * (gl_FrontFacing ? 0.55 : 0.25);`);
    g.add(new THREE.Mesh(HI, m));
    const inner = new THREE.PointLight(ACC, .9, .7, 2); inner.position.copy(HEART); g.add(inner);
    g.add(identity()); return g;
  },
  steel() {
    const g = new THREE.Group();
    const seams = [J.neck, J.sh(1), J.sh(-1), J.el(1), J.el(-1), J.wr(1), J.wr(-1), J.kn(1), J.kn(-1), J.an(1), J.an(-1)];
    const R = [.085, .075, .075, .05, .05, .034, .034, .056, .056, .05, .05];
    const m = steelMat();
    m.userData.u = { uJ: { value: seams.map((p, i) => new THREE.Vector4(p[0], p[1], p[2], R[i])) }, uCore: { value: CORE } };
    patch(m,
      `uniform vec4 uJ[11]; uniform vec3 uCore; float ln(float d, float w){ return 1.0 - smoothstep(w*0.45, w, abs(d)); }`,
      `float seam = 0.0;
       for (int i = 0; i < 11; i++) seam = max(seam, ln(length(vW - uJ[i].xyz) - uJ[i].w, 0.0032));
       if (abs(vW.x) < 0.19) seam = max(seam, ln(vW.y - 1.055, 0.003));
       float dc = length(vW - uCore); float core = 1.0 - smoothstep(0.016, 0.021, dc); float ring = ln(dc - 0.031, 0.0028);
       seam = max(seam, ring); diffuseColor.rgb *= 1.0 - seam * 0.88;`,
      `totalEmissiveRadiance += uAcc * (core * (2.2 + 0.6*sin(uT*2.2)) + ring * 0.9);`);
    g.add(new THREE.Mesh(HI, m));
    g.add(identity({ heart: false }));
    const cg = glow(.16, .7); cg.position.copy(CORE).add(new THREE.Vector3(0, 0, .01)); g.add(cg); g.userData.coreGlow = cg;
    return g;
  },
  glass() {
    const g = new THREE.Group();
    g.add(Object.assign(new THREE.Mesh(HI, new THREE.MeshPhysicalMaterial({ color: '#eef1ff', metalness: 0, roughness: .1, transmission: .9, thickness: .08, ior: 1.45, iridescence: .9, clearcoat: 1, envMapIntensity: 1.3, transparent: true, opacity: .55 })), { renderOrder: 2 }));
    const bone = steelMat({ roughness: .35, color: '#c9ced6' });
    const cap = (a, b, r) => { const A = v3(a), B = v3(b), L = A.distanceTo(B); const c = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(.001, L - r * 2), 6, 14), bone); c.position.copy(A).lerp(B, .5); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()); g.add(c); };
    const ball = (p, r, sc) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 18), bone); m.position.copy(v3(p)); if (sc) m.scale.set(...sc); g.add(m); };
    ball([0, 1.712, -.012], .066, [1, 1.08, 1.2]); ball([0, 1.628, .03], .042, [1, .9, 1.05]);
    for (let i = 0; i < 24; i++) { const t = i / 23; ball([0, .98 + t * .6, -.06 + Math.sin(t * Math.PI * 1.3) * .02 - t * .01], .0105 + (1 - t) * .007, [1.3, .75, 1]); }
    for (let i = 0; i < 10; i++) { const k = Math.sin((i + 2) / 12 * Math.PI), sx = .085 + k * .04, r = new THREE.Mesh(new THREE.TorusGeometry(1, .0048 / sx, 8, 64), bone); r.scale.set(sx, .072 + k * .03, sx); r.rotation.x = Math.PI / 2 + .32; r.position.set(0, 1.2 + i * .026, -.01); g.add(r); }
    for (const s of [-1, 1]) {
      cap(J.sh(s), J.el(s), .014); cap(J.el(s), J.wr(s), .008); cap(J.hip(s), J.kn(s), .019); cap(J.kn(s), J.an(s), .015); cap([s * .108, .04, -.04], J.toe(s), .012);
      ball(J.sh(s), .028); ball(J.el(s), .02); ball(J.kn(s), .028);
    }
    g.add(identity()); return g;
  },
  facet() {
    const g = new THREE.Group();
    const flat = LO.toNonIndexed(); flat.computeVertexNormals();
    g.add(new THREE.Mesh(flat, steelMat({ flatShading: true, color: '#aeb4bd', polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })));
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(LO, 1), new THREE.LineBasicMaterial({ color: ACC, transparent: true, opacity: .75, blending: THREE.AdditiveBlending, depthWrite: false })));
    g.add(new THREE.Points(LO, new THREE.PointsMaterial({ color: '#f2f5f8', size: .0075, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false })));
    g.add(identity()); return g;
  },
  cloud() {
    const g = new THREE.Group();
    const occ = new THREE.Mesh(HI, new THREE.MeshBasicMaterial({ colorWrite: false })); occ.scale.setScalar(.992); occ.position.y = .007; g.add(occ);
    const pos = HI.attributes.position.array, nor = HI.attributes.normal.array, idx = HI.index.array;
    const T = idx.length / 3, area = new Float32Array(T); let tot = 0;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let t = 0; t < T; t++) { a.fromArray(pos, idx[t * 3] * 3); b.fromArray(pos, idx[t * 3 + 1] * 3); c.fromArray(pos, idx[t * 3 + 2] * 3); tot += b.sub(a).cross(c.sub(a)).length() * .5; area[t] = tot; }
    const N = 60000, P = new Float32Array(N * 3), Nn = new Float32Array(N * 3), Rr = new Float32Array(N);
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < N; i++) {
      const u = rnd() * tot; let lo = 0, hi = T - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (area[mid] < u) lo = mid + 1; else hi = mid; }
      let r1 = rnd(), r2 = rnd(); if (r1 + r2 > 1) { r1 = 1 - r1; r2 = 1 - r2; }
      const i0 = idx[lo * 3] * 3, i1 = idx[lo * 3 + 1] * 3, i2 = idx[lo * 3 + 2] * 3;
      for (let k = 0; k < 3; k++) { P[i * 3 + k] = pos[i0 + k] + (pos[i1 + k] - pos[i0 + k]) * r1 + (pos[i2 + k] - pos[i0 + k]) * r2; Nn[i * 3 + k] = nor[i0 + k]; }
      Rr[i] = rnd();
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(Nn, 3)); geo.setAttribute('rnd', new THREE.BufferAttribute(Rr, 1));
    g.add(new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: { uT: U.uT, uAcc: U.uAcc, uPx: { value: renderer.getPixelRatio() } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float rnd; uniform float uT, uPx; varying float vA; varying float vR; varying float vWave;
        void main(){ vec3 p = position + normal * (0.0025 + 0.003*sin(uT*1.3 + rnd*40.0));
          float wave = exp(-pow((p.y - mod(uT*0.32, 2.4) + 0.3) * 7.0, 2.0)); vWave = wave; vR = rnd;
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = (1.1 + rnd*1.6 + wave*2.0) * uPx * (2.6 / -mv.z);
          vA = 0.45 + 0.55*pow(0.5 + 0.5*sin(uT*2.0 + rnd*90.0), 3.0); }`,
      fragmentShader: `uniform vec3 uAcc; varying float vA; varying float vR; varying float vWave;
        void main(){ vec2 q = gl_PointCoord - 0.5; float d = dot(q,q); if (d > 0.25) discard;
          vec3 col = mix(vec3(0.84,0.86,0.9), uAcc, step(0.72, vR)); col = mix(col, vec3(1.0), vWave*0.6);
          gl_FragColor = vec4(col * (vA + vWave), (1.0 - d*4.0)); }`
    })));
    g.add(identity()); return g;
  },
  holo() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(HI, new THREE.ShaderMaterial({
      uniforms: { uT: U.uT, uAcc: U.uAcc }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vW;
        void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - w.xyz);
          gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float uT; uniform vec3 uAcc; varying vec3 vN; varying vec3 vV; varying vec3 vW;
        void main(){ float f = pow(1.0 - abs(dot(normalize(vN), vV)), 2.2);
          float scan = 0.55 + 0.45*smoothstep(0.35, 0.0, abs(fract(vW.y*140.0 - uT*0.6) - 0.5));
          float sweep = exp(-pow((vW.y - mod(uT*0.42, 2.3) + 0.25)*14.0, 2.0));
          vec3 c = mix(uAcc, vec3(0.92,0.95,1.0), f*0.5);
          gl_FragColor = vec4(c * (0.025 + f*1.1 + sweep*0.6) * scan, 1.0); }`
    })));
    g.add(identity()); return g;
  },
};

const fig = BUILD[FORM](); scene.add(fig);
const camera = new THREE.PerspectiveCamera(30, 1, .02, 40);
camera.position.set(0, 1.05, 4.1); camera.lookAt(0, .95, 0);

let w = 0, h = 0;
function resize() {
  const r = host.getBoundingClientRect(); w = r.width; h = r.height;
  renderer.setSize(w, h, false); camera.aspect = w / h;
  const wide = w > 820;
  camera.fov = wide ? 30 : 34;
  // on wide screens move the figure into the left column; RTL text stays on the right
  if (wide) camera.setViewOffset(w, h, w * .27, 0, w, h); else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

let mx = 0; addEventListener('pointermove', e => { mx = (e.clientX / innerWidth - .5); }, { passive: true });
let visible = true;
new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(host);

const clock = new THREE.Clock();
function frame() {
  const t = clock.getElapsedTime(); U.uT.value = t;
  fig.rotation.y = (still ? -.35 : t * .45) + mx * .3;
  fig.position.y = still ? 0 : Math.sin(t * .8) * .008;
  fig.traverse(o => {
    if (o.userData.orbits) o.userData.orbits.forEach((ob, i) => { ob.rotation.z += .0016 * (i ? -1 : 1); const a = t * (.35 + i * .12) + ob.userData.ph; ob.userData.bead.position.set(Math.cos(a) * ob.userData.r, Math.sin(a) * ob.userData.r, 0); });
    if (o.userData.heart) { const p = 1 + .12 * Math.pow(Math.max(0, Math.sin(t * 2.4)), 6); o.userData.heart[0].scale.setScalar(p); }
    if (o.userData.coreGlow) o.userData.coreGlow.material.opacity = .45 + .25 * Math.sin(t * 2.2);
  });
  renderer.render(scene, camera);
}
if (still) { frame(); addEventListener('resize', frame); }
else renderer.setAnimationLoop(() => { if (visible) frame(); });
host.classList.add('on');
