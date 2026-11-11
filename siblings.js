// EMAC's siblings: four characters from the character studio, waving at the visitor
// under red and violet xenon light. One renderer, one canvas: it lives in the round
// button under the hero title, and moves into the "إخوة إيماك" dialog when it opens.
import * as THREE from 'three';

const mini = document.getElementById('sib-mini');
const big = document.getElementById('sib-big');
const dlg = document.getElementById('sib-dlg');
const cards = [...document.querySelectorAll('.sib-cards [data-i]')];
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const RTL = document.documentElement.dir === 'rtl';

// always the light body (18k triangles): four of them share one small canvas
const loadMesh = () => fetch('emac-body-m.js').then(r => { if (!r.ok) throw 0; return r.text(); })
  .then(t => JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)));
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

const canvas = document.createElement('canvas');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' }); }
catch { throw new Error('no webgl'); }
const BODY = decode((await loadMesh()).hi);

renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.setClearColor('#06050B', 1);

const RED = new THREE.Color('#FF2A4D'), VIO = new THREE.Color('#9B5CFF');
const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#06050B', 5.5, 11);

// xenon studio as the environment, so metal and pearl pick up red on one side and violet on the other
const pm = new THREE.PMREMGenerator(renderer);
scene.environment = pm.fromScene((() => {
  const e = new THREE.Scene();
  e.add(new THREE.Mesh(new THREE.BoxGeometry(20, 12, 20), new THREE.MeshBasicMaterial({ color: '#0b0a12', side: THREE.BackSide })));
  const panel = (w, h, c, i, p) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(i), side: THREE.DoubleSide })); m.position.set(...p); m.lookAt(0, 1, 0); e.add(m); };
  panel(1.2, 8, '#ff2a4d', 3.2, [-6, 1.5, 3]); panel(1.2, 8, '#9b5cff', 3.2, [6, 1.5, 3]);
  panel(1, 7, '#ff2a4d', 1.6, [-5, 1, -5]); panel(1, 7, '#9b5cff', 1.6, [5, 1, -5]);
  panel(6, 2.2, '#f2eeff', .9, [0, 6, 3]);
  return e;
})(), .03).texture;

scene.add(new THREE.HemisphereLight('#b9b0ff', '#09070d', .35));
const key = new THREE.DirectionalLight('#fff1f4', .9); key.position.set(0, 3, 5); scene.add(key);
const pr = new THREE.PointLight(RED, 9, 7, 1.6); pr.position.set(-1.7, 1.5, .9); scene.add(pr);
const pv = new THREE.PointLight(VIO, 9, 7, 1.6); pv.position.set(1.7, 1.4, .9); scene.add(pv);
const pTop = new THREE.PointLight('#ff6fae', 2.5, 5, 2); pTop.position.set(0, 2.6, .4); scene.add(pTop);

// soft round glow texture for the light halos
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.25, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
})();
const halo = (col, sx, sy, op) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); s.scale.set(sx, sy, 1); return s; };

// back wall: dark, with a red haze on one side and violet on the other
const wall = (() => {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const x = c.getContext('2d');
  x.fillStyle = '#07060c'; x.fillRect(0, 0, 512, 256);
  const hz = (cx, col) => { const g = x.createRadialGradient(cx, 150, 0, cx, 150, 260); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 512, 256); };
  hz(70, 'rgba(255,42,77,.55)'); hz(442, 'rgba(155,92,255,.6)');
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 4.5), new THREE.MeshBasicMaterial({ map: t, fog: false }));
  m.position.set(0, 1.6, -1.6); return m;
})();
scene.add(wall);

// xenon tubes: two upright bars and a ceiling bar that flickers on like a real discharge lamp
const tubes = [];
const tube = (col, len, pos, rotZ) => {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.CylinderGeometry(.014, .014, len, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff').lerp(col, .35).multiplyScalar(1.6), fog: false }));
  g.add(core);
  const h1 = halo(col, .22, len * 1.08, .9), h2 = halo(col, .9, len * 1.25, .35);
  g.add(h1, h2); g.position.set(...pos); g.rotation.z = rotZ || 0; scene.add(g);
  tubes.push({ core, h1, h2, base: [.9, .35], on: 0, delay: tubes.length * .22 });
};
tube(RED, 2.3, [-1.55, 1.15, -1.1]);
tube(VIO, 2.3, [1.55, 1.15, -1.1]);
tube(new THREE.Color('#d24bff'), 2.4, [0, 2.38, -1.25], Math.PI / 2);

// glossy black floor that catches both colours
const floor = new THREE.Mesh(new THREE.CircleGeometry(4, 64), new THREE.MeshStandardMaterial({ color: '#09080e', metalness: .65, roughness: .28, envMapIntensity: .9 }));
floor.rotation.x = -Math.PI / 2; scene.add(floor);
const pool = (col, x) => { const s = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.6), new THREE.MeshBasicMaterial({ map: glowTex, color: col, transparent: true, opacity: .45, blending: THREE.AdditiveBlending, depthWrite: false })); s.rotation.x = -Math.PI / 2; s.position.set(x, .003, -.4); scene.add(s); };
pool(RED, -1.2); pool(VIO, 1.2);

// ---- the wave: rotate forearm about the elbow, then the whole arm about the shoulder ----
const U = { uT: { value: 0 } };
const HEAD = `
uniform float uT, uSide, uUp, uPh;
vec2 sibRot(vec2 p, vec2 c, float a) { float s = sin(a), k = cos(a); p -= c; return c + vec2(p.x * k - p.y * s, p.x * s + p.y * k); }
vec4 sibK(vec3 p) {
  float sx = p.x * uSide;
  float thr = mix(.205, .158, smoothstep(.95, 1.05, p.y));
  float wA = smoothstep(thr, thr + .025, sx) * (1. - smoothstep(1.27, 1.41, p.y));
  float wF = wA * (1. - smoothstep(1.03, 1.11, p.y));
  float wave = sin(uT * 6.2 + uPh);
  return vec4(wA, wF, uUp * (1.72 + .07 * wave) * uSide * wA, uUp * (1.05 + .42 * wave) * uSide * wF);
}`;
const EL = 'vec2(.25 * uSide, 1.07)', SH = 'vec2(.21 * uSide, 1.37)';
function waver(mat, side, ph) {
  const u = { uSide: { value: side }, uUp: { value: 0 }, uPh: { value: ph } };
  mat.userData.u = u;
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + HEAD)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
  { vec4 k = sibK(position); objectNormal.xy = sibRot(objectNormal.xy, vec2(0.), k.w); objectNormal.xy = sibRot(objectNormal.xy, vec2(0.), k.z); }`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  { vec4 k = sibK(position); transformed.xy = sibRot(transformed.xy, ${EL}, k.w); transformed.xy = sibRot(transformed.xy, ${SH}, k.z); }`);
  };
  mat.customProgramCacheKey = () => 'sib-wave';
  return mat;
}

// ---- the four siblings (materials follow the character studio) ----
const SIBS = [
  { // سُها · space: mirror steel with a dark iridescent film, three tiny planets on Kepler orbits
    mats: () => [new THREE.MeshPhysicalMaterial({ color: '#C9CED6', metalness: 1, roughness: .08, iridescence: .75, iridescenceIOR: 1.6, clearcoat: .4, envMapIntensity: 1.25 })],
    extra(g) {
      const orb = [];
      [['#8FB4FF', .34, 1.4], ['#E08A4C', .46, .9], ['#B9A7F0', .58, .6]].forEach(([c, r, w], i) => {
        const p = new THREE.Mesh(new THREE.SphereGeometry(.028, 16, 10), new THREE.MeshBasicMaterial({ color: c })); p.add(halo(c, .12, .12, .7));
        g.add(p); orb.push({ p, r, w, o: i * 2.1 });
      });
      return t => orb.forEach(o => { const a = t * o.w + o.o; o.p.position.set(Math.cos(a) * o.r, 1.05 + Math.sin(a * .7) * .12, Math.sin(a) * o.r * .55); });
    }
  },
  { // نَبض · medicine: pearl ceramic like living tissue, with a red heart beating in the chest
    mats: () => [new THREE.MeshPhysicalMaterial({ color: '#EBDDD8', metalness: 0, roughness: .34, sheen: 1, sheenColor: new THREE.Color('#ffd9de'), clearcoat: .5, envMapIntensity: 1 })],
    extra(g) {
      const heart = new THREE.Mesh(new THREE.SphereGeometry(.045, 20, 14), new THREE.MeshBasicMaterial({ color: '#ff3355' }));
      heart.position.set(.03, 1.34, .1); const hh = halo('#ff2a4d', .32, .32, .9); heart.add(hh); g.add(heart);
      return t => { const b = Math.pow(Math.max(0, Math.sin(t * 7.4)), 8) + .6 * Math.pow(Math.max(0, Math.sin(t * 7.4 - .9)), 10); heart.scale.setScalar(1 + b * .35); hh.material.opacity = .55 + b * .45; };
    }
  },
  { // خوارزمي · software: a lavender wireframe of light over a dark core, bits blinking around it
    mats: () => [
      new THREE.MeshStandardMaterial({ color: '#1A1630', metalness: .2, roughness: .35, emissive: '#2c2160', emissiveIntensity: .6 }),
      new THREE.MeshBasicMaterial({ color: '#B6A2FF', wireframe: true, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false })
    ],
    extra(g) {
      const bits = [];
      for (let i = 0; i < 18; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(.03, .03, .03), new THREE.MeshBasicMaterial({ color: i % 3 ? '#9C86F0' : '#6FE3C8', transparent: true }));
        const a = i / 18 * Math.PI * 2; m.position.set(Math.cos(a) * (.36 + (i % 3) * .05), .3 + (i * .37 % 1.4), Math.sin(a) * .26); g.add(m); bits.push(m);
      }
      return t => bits.forEach((m, i) => { m.material.opacity = .25 + .75 * (Math.sin(t * 3 + i * 1.7) > .2 ? 1 : 0); m.rotation.y = t + i; });
    }
  },
  { // غَد · theories & sci-fi: holographic metal whose colour drifts through the others
    mats: () => [new THREE.MeshPhysicalMaterial({ color: '#D8DEE6', metalness: .85, roughness: .14, iridescence: 1, iridescenceIOR: 1.8, clearcoat: .6, envMapIntensity: 1.35, emissive: '#5FE1F0', emissiveIntensity: .28 })],
    extra(g, mats) {
      const rings = [];
      for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(.42 + i * .07, .004, 6, 120), new THREE.MeshBasicMaterial({ color: '#5FE1F0', transparent: true, opacity: .6, blending: THREE.AdditiveBlending, depthWrite: false })); r.rotation.x = Math.PI / 2; g.add(r); rings.push(r); }
      const c = new THREE.Color();
      return t => {
        mats[0].color.copy(c.setHSL((t * .06) % 1, .5, .78)); mats[0].emissive.setHSL((t * .06 + .5) % 1, .8, .5);
        rings.forEach((r, i) => { const k = (t * .35 + i / 3) % 1; r.position.y = .05 + k * 1.7; r.scale.setScalar(1 - Math.abs(k - .5) * .5); r.material.opacity = Math.sin(k * Math.PI) * .7; });
      };
    }
  }
];

const XS = [-.93, -.31, .31, .93];
const figs = SIBS.map((S, i) => {
  const g = new THREE.Group();
  const side = i % 2 ? -1 : 1;
  const mats = S.mats().map(m => waver(m, side, i * 1.3));
  mats.forEach((m, j) => { const mesh = new THREE.Mesh(BODY, m); if (j) mesh.renderOrder = 2; g.add(mesh); });
  const tick = S.extra(g, mats);
  // card i sits first in reading order; in Arabic that is the right-hand side
  const x = RTL ? -XS[i] : XS[i];
  g.position.set(x, 0, -Math.abs(x) * .28);
  g.rotation.y = -x * .22;
  scene.add(g);
  const ring = new THREE.Mesh(new THREE.RingGeometry(.2, .23, 48), new THREE.MeshBasicMaterial({ color: i % 2 ? VIO : RED, transparent: true, opacity: .0, blending: THREE.AdditiveBlending, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(g.position.x, .006, g.position.z); scene.add(ring);
  return { g, mats, tick, x, ring, up: 0, focus: 0 };
});

// ---- camera framing for the round button and for the wide dialog stage ----
const camera = new THREE.PerspectiveCamera(30, 1, .05, 30);
let host = null, W = 1, H = 1;
function frame() {
  const a = W / H, tan = Math.tan(THREE.MathUtils.degToRad(15));
  const roundish = host === mini;
  const needW = roundish ? 2.45 : 3.05, needH = roundish ? 2.2 : 2.15;
  const d = Math.max(needH / 2 / tan, needW / 2 / (tan * a));
  camera.aspect = a; camera.position.set(0, roundish ? 1.05 : 1.1, d); camera.lookAt(0, roundish ? .9 : .98, 0); camera.updateProjectionMatrix();
}
function size() {
  if (!host) return;
  const r = host.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height);
  renderer.setSize(W, H, false); frame();
}
const ro = new ResizeObserver(size);
function attach(h) {
  if (host) ro.unobserve(host);
  host = h; h.appendChild(canvas); ro.observe(h); size(); render(); h.classList.add('live');
}

// ---- motion ----
let active = -1;
const ease = x => x * x * (3 - 2 * x);
function greet(t, i) { // each sibling raises a hand in turn: up 4.2 s, down 2 s, staggered
  if (still) return 1;
  const k = (t + i * 1.55) % 6.2;
  if (k < .55) return ease(k / .55);
  if (k < 4.2) return 1;
  if (k < 4.75) return 1 - ease((k - 4.2) / .55);
  return 0;
}
const clock = new THREE.Clock();
let t = 3;
function render() {
  const dt = Math.min(clock.getDelta(), .05);
  if (!still) t += dt;
  U.uT.value = still ? .4 : t;
  figs.forEach((f, i) => {
    const want = active < 0 ? greet(t, i) : (i === active ? 1 : .0);
    f.up += (want - f.up) * Math.min(1, dt * (active < 0 ? 60 : 6));
    f.mats.forEach(m => { m.userData.u.uUp.value = f.up; });
    f.focus += ((i === active ? 1 : 0) - f.focus) * Math.min(1, dt * 6);
    f.g.position.y = still ? 0 : Math.sin(t * 1.7 + i * 1.3) * .012 + f.focus * .04;
    f.g.rotation.y = -f.x * .22 * (1 - f.focus) + (still ? 0 : Math.sin(t * .6 + i * 2) * .1);
    f.g.scale.setScalar(1 + f.focus * .06);
    f.ring.material.opacity = .15 + f.focus * .75;
    f.tick(still ? 1 : t);
  });
  tubes.forEach((tb, i) => { // strike then settle, with the faint xenon shimmer
    const age = t - 3 - tb.delay; let k = age < 0 ? 0 : age < .5 ? (Math.random() > .5 ? 1 : .15) : 1;
    if (still) k = 1;
    const sh = .94 + Math.sin(t * 47 + i) * .03 + Math.sin(t * 13.3 + i * 2) * .03;
    tb.core.material.opacity = 1; tb.core.visible = k > .1;
    tb.h1.material.opacity = tb.base[0] * k * sh; tb.h2.material.opacity = tb.base[1] * k * sh;
  });
  pr.intensity = 9 * (.92 + Math.sin(t * 2.1) * .08); pv.intensity = 9 * (.92 + Math.sin(t * 1.7 + 1) * .08);
  renderer.render(scene, camera);
}

let raf = 0, seen = false;
const want = () => !document.hidden && (dlg.open || seen);
function loop() { raf = 0; if (!want()) return; render(); if (!still) raf = requestAnimationFrame(loop); }
const kick = () => { if (!raf && want()) { clock.getDelta(); raf = requestAnimationFrame(loop); } };
new IntersectionObserver(([e]) => { seen = e.isIntersecting; kick(); }).observe(mini);
document.addEventListener('visibilitychange', kick);

attach(mini);
kick();

// the dialog takes the canvas while it is open, and gives it back on close
dlg.addEventListener('sib:open', () => { attach(big); active = -1; kick(); });
dlg.addEventListener('close', () => { active = -1; cards.forEach(c => c.removeAttribute('aria-current')); attach(mini); kick(); });
cards.forEach(c => {
  const i = +c.dataset.i;
  const on = () => { active = i; cards.forEach(x => x.toggleAttribute('aria-current', x === c)); kick(); };
  c.addEventListener('pointerenter', on); c.addEventListener('focus', on);
  c.addEventListener('pointerleave', () => { if (active === i) { active = -1; c.removeAttribute('aria-current'); } });
  c.addEventListener('blur', () => { if (active === i) { active = -1; c.removeAttribute('aria-current'); } });
});
