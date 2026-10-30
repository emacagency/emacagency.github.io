// EMAC research section: maps, charts, stat counters and hub filters. Everything is wired by data attributes in the page.
import * as d3 from './lib/d3-lite.js';

const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt = (v, d = 1) => new Intl.NumberFormat('en-US', { maximumFractionDigits: d }).format(v);

let dataP, worldP;
export const indicators = () => (dataP ||= fetch(new URL('data/indicators.json', import.meta.url)).then(r => r.json()));
export const world = () => (worldP ||= fetch(new URL('data/world.json', import.meta.url)).then(r => r.json()).then(t => {
  const fc = d3.feature(t, t.objects.countries);
  fc.features = fc.features.filter(f => f.properties.a3 !== 'ATA');
  return fc;
}));

export const RAMP = {
  amber: ['#552d00', '#814900', '#aa6a00', '#cb8d3e', '#e2b076', '#f6d4ae'],
  blue: ['#003d5b', '#006088', '#2584b2', '#55a5d1', '#87c3e7', '#bae1f9'],
  ember: ['#631d00', '#94340a', '#c1552c', '#e27a55', '#f7a285', '#ffcbb7'],
  rose: ['#611b2c', '#913247', '#bd5167', '#df7789', '#f49fac', '#ffc9d0'],
  moss: ['#114321', '#256738', '#448c56', '#6bad79', '#96caa0', '#c3e5c9'],
  violet: ['#3f2c5d', '#62488c', '#8668b6', '#a68bd6', '#c3aeeb', '#e0d3fc'],
};

// Each map layer: thresholds (5 cut points -> 6 bins), single-hue ramp, unit and how to print a value.
export const LAYERS = {
  food: { name: 'نقص التغذية', unit: '% من السكان', th: [2.6, 5, 10, 20, 35], ramp: 'amber', show: v => v <= 2.5 ? '< 2.5' : fmt(v), bins: ['أقل من 2.5', '2.5–5', '5–10', '10–20', '20–35', 'أكثر من 35'], top: 'الأعلى نسبة', low: null },
  water: { name: 'المياه العذبة المتجددة', unit: 'م³ للفرد سنويًا', th: [500, 1000, 1700, 5000, 20000], ramp: 'blue', show: v => fmt(v, v < 10 ? 1 : 0), bins: ['أقل من 500 (ندرة مطلقة)', '500–1,000 (ندرة)', '1,000–1,700 (إجهاد)', '1,700–5,000', '5,000–20,000', 'أكثر من 20,000'], top: 'الأقل نصيبًا للفرد', asc: true },
  co2pc: { name: 'انبعاثات CO₂ للفرد', unit: 'طن للفرد سنويًا', th: [1, 2.5, 5, 10, 20], ramp: 'ember', show: v => fmt(v), bins: ['أقل من 1', '1–2.5', '2.5–5', '5–10', '10–20', 'أكثر من 20'], top: 'الأعلى للفرد' },
  co2tot: { name: 'إجمالي انبعاثات CO₂', unit: 'مليون طن سنويًا', th: [10, 50, 200, 1000, 5000], ramp: 'ember', show: v => fmt(v, 0), bins: ['أقل من 10', '10–50', '50–200', '200–1,000', '1,000–5,000', 'أكثر من 5,000'], top: 'الأكبر إجمالًا' },
  co2cum: { name: 'الحصة من الانبعاثات التاريخية منذ 1750', unit: '% من إجمالي العالم', th: [0.1, 0.5, 1, 3, 10], ramp: 'violet', show: v => fmt(v, 2), bins: ['أقل من 0.1', '0.1–0.5', '0.5–1', '1–3', '3–10', 'أكثر من 10'], top: 'الأكبر تاريخيًا' },
  renew: { name: 'حصة المتجددة من الكهرباء', unit: '% من توليد الكهرباء', th: [10, 25, 50, 75, 90], ramp: 'moss', show: v => fmt(v), bins: ['أقل من 10', '10–25', '25–50', '50–75', '75–90', 'أكثر من 90'], top: 'الأعلى حصة' },
  malaria: { name: 'الإصابة بالملاريا', unit: 'حالة لكل 1,000 شخص معرّض للخطر', th: [0.01, 1, 10, 100, 250], ramp: 'rose', show: v => v === 0 ? '0' : fmt(v, v < 1 ? 2 : 0), bins: ['صفر', 'أقل من 1', '1–10', '10–100', '100–250', 'أكثر من 250'], top: 'الأعلى إصابة' },
  tb: { name: 'الإصابة بالسل', unit: 'حالة لكل 100,000 نسمة', th: [10, 50, 100, 200, 400], ramp: 'rose', show: v => fmt(v, v < 10 ? 1 : 0), bins: ['أقل من 10', '10–50', '50–100', '100–200', '200–400', 'أكثر من 400'], top: 'الأعلى إصابة' },
};


/* ---------- choropleth ---------- */
async function initMap(fig) {
  const keys = fig.dataset.map.split(',');
  const labels = (fig.dataset.labels || '').split('|');
  const [D, fc] = await Promise.all([indicators(), world()]);
  const stage = fig.querySelector('.stage');
  const head = stage.querySelector('.fig-head');
  const W = 960, H = 470;
  const proj = d3.geoNaturalEarth1().fitExtent([[6, 6], [W - 6, H - 6]], { type: 'Sphere' });
  const path = d3.geoPath(proj);

  const wrap = document.createElement('div'); wrap.className = 'map-wrap';
  stage.append(wrap);
  const svg = d3.select(wrap).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img');
  svg.append('defs').html('<pattern id="nodataHatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="#161B27"/><rect width="2" height="5" fill="#2A3040"/></pattern>');
  const g = svg.append('g');
  g.append('path').attr('class', 'sphere').attr('d', path({ type: 'Sphere' }));
  g.append('path').attr('class', 'grat').attr('d', path(d3.geoGraticule10()));
  const cs = g.selectAll('path.country').data(fc.features).join('path').attr('class', 'country').attr('d', path);

  const tip = document.createElement('div'); tip.className = 'tip'; tip.hidden = true; wrap.append(tip);
  const legend = document.createElement('div'); legend.className = 'legend'; stage.append(legend);
  const ranks = document.createElement('div'); ranks.className = 'ranks'; stage.append(ranks);
  const tbl = document.createElement('div'); tbl.className = 'dtable'; tbl.hidden = true; stage.append(tbl);

  // zoom: buttons plus pinch / wheel with ctrl so the page still scrolls
  const zm = d3.zoom().scaleExtent([1, 8]).translateExtent([[0, 0], [W, H]])
    .filter(e => (e.type === 'wheel' ? e.ctrlKey || e.metaKey : true) && !e.button && (e.type !== 'touchstart' || e.touches.length > 1))
    .on('zoom', e => g.attr('transform', e.transform));
  svg.call(zm);
  const zb = document.createElement('div'); zb.className = 'map-zoom';
  zb.innerHTML = '<button type="button" aria-label="تكبير">+</button><button type="button" aria-label="تصغير">−</button><button type="button" aria-label="إعادة الضبط" style="font-size:13px">⟲</button>';
  wrap.append(zb);
  const [zi, zo, zr] = zb.querySelectorAll('button');
  zi.onclick = () => svg.transition().duration(300).call(zm.scaleBy, 1.6);
  zo.onclick = () => svg.transition().duration(300).call(zm.scaleBy, 1 / 1.6);
  zr.onclick = () => svg.transition().duration(300).call(zm.transform, d3.zoomIdentity);

  const nm = f => D.names[f.properties.a3] || f.properties.ar;
  let cur;
  function draw(key) {
    cur = key;
    const L = LAYERS[key], set = D[key], v = set.v, cols = RAMP[L.ramp];
    const sc = d3.scaleThreshold().domain(L.th).range(cols);
    cs.attr('fill', f => (f.properties.a3 in v ? sc(v[f.properties.a3]) : null))
      .classed('nodata', f => !(f.properties.a3 in v));
    svg.attr('aria-label', `خريطة العالم: ${L.name} (${L.unit})، ${set.year}`);
    legend.innerHTML = `<span class="ttl">${L.unit}</span>` + L.bins.map((b, i) => `<span class="k"><i style="background:${cols[i]}"></i>${b}</span>`).join('') + '<span class="k"><i class="nd"></i>لا بيانات</span>';
    const all = Object.entries(v).map(([k, x]) => ({ n: D.names[k] || k, v: x }));
    all.sort((a, b) => (L.asc ? a.v - b.v : b.v - a.v));
    const top = all.slice(0, 10);
    ranks.innerHTML = `<h4>${L.top} (${set.year})</h4><ol>${top.slice(0, 5).map(r => `<li><span>${r.n}</span><b>${L.show(r.v)}</b></li>`).join('')}</ol><ol start="6" style="counter-reset:r 5">${top.slice(5).map(r => `<li><span>${r.n}</span><b>${L.show(r.v)}</b></li>`).join('')}</ol>`;
    tbl.innerHTML = `<table><thead><tr><th>الدولة</th><th>${L.unit}</th></tr></thead><tbody>${all.slice().sort((a, b) => a.n.localeCompare(b.n, 'ar')).map(r => `<tr><td>${r.n}</td><td class="n">${L.show(r.v)}</td></tr>`).join('')}</tbody></table>`;
  }

  function show(e, f) {
    const L = LAYERS[cur], set = D[cur], val = set.v[f.properties.a3];
    tip.innerHTML = `<div>${nm(f)}</div>` + (val === undefined ? '<span class="u">لا تتوفر بيانات</span>' : `<b>${L.show(val)}</b> <span class="u">${L.unit}</span>`);
    const r = wrap.getBoundingClientRect(), p = e.touches ? e.touches[0] : e;
    let x = p.clientX - r.left, y = p.clientY - r.top;
    tip.hidden = false;
    const tw = tip.offsetWidth / 2;
    x = Math.max(tw + 4, Math.min(r.width - tw - 4, x));
    if (y < 60) y = 60;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }
  cs.on('pointermove', function (e, f) { cs.classed('hl', false); d3.select(this).classed('hl', true).raise(); show(e, f); })
    .on('pointerleave', function () { d3.select(this).classed('hl', false); tip.hidden = true; });
  wrap.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') { const t = e.target.__data__; if (t && t.properties) show(e, t); } });

  // controls: layer toggle + table view
  const ctr = document.createElement('div'); ctr.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
  if (keys.length > 1) {
    const seg = document.createElement('div'); seg.className = 'seg'; seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'المؤشر');
    keys.forEach((k, i) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = labels[i] || LAYERS[k].name; b.setAttribute('aria-pressed', i ? 'false' : 'true'); b.onclick = () => { seg.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); draw(k); if (fig.dataset.sub) head.querySelector('.sub').textContent = subFor(k, D); }; seg.append(b); });
    ctr.append(seg);
  }
  const tb = document.createElement('button'); tb.type = 'button'; tb.className = 'tbtn'; tb.textContent = 'عرض كجدول';
  tb.onclick = () => { tbl.hidden = !tbl.hidden; tb.textContent = tbl.hidden ? 'عرض كجدول' : 'إخفاء الجدول'; };
  ctr.append(tb); head.append(ctr);
  draw(keys[0]);
  if (fig.dataset.sub) head.querySelector('.sub').textContent = subFor(keys[0], D);
}
const subFor = (k, D) => `${LAYERS[k].name} · ${LAYERS[k].unit} · ${D[k].year}`;

/* ---------- line chart ---------- */
// series: [{ name, color, data: [[x, y]] }]; one axis only.
export function lineChart(el, { series, unit, yFmt = v => fmt(v), zero = false, yMin, band, height = 340, area: fillArea = false }) {
  const W = Math.round(Math.max(320, Math.min(1100, el.clientWidth || 960))), H = W < 600 ? Math.round(W * .72) : height, m = { t: 24, r: 14, b: 34, l: W < 600 ? 48 : 64 };
  const xs = series.flatMap(s => s.data.map(d => d[0])), ys = series.flatMap(s => s.data.map(d => d[1])).filter(v => v != null);
  const x = d3.scaleLinear().domain(d3.extent(xs)).range([m.l, W - m.r - (series.length > 1 ? 56 : 10)]);
  let lo = yMin ?? d3.min(ys), hi = d3.max(ys);
  if (zero) lo = Math.min(0, lo);
  const y = d3.scaleLinear().domain([lo, hi]).nice().range([H - m.b, m.t]);
  const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', el.dataset.label || '');
  // axes on the visual left (numbers read LTR)
  const gy = svg.append('g').attr('class', 'grid ax');
  y.ticks(5).forEach(t => { gy.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(t)).attr('y2', y(t)); gy.append('text').attr('x', m.l - 10).attr('y', y(t) + 4).attr('text-anchor', 'end').text(yFmt(t)); });
  const gx = svg.append('g').attr('class', 'ax');
  x.ticks(Math.max(3, Math.min(8, Math.floor(W / 110)))).forEach(t => gx.append('text').attr('x', x(t)).attr('y', H - 10).attr('text-anchor', 'middle').text(t));
  if (lo < 0 || zero) svg.append('line').attr('class', 'base').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(0)).attr('y2', y(0));
  if (band) svg.append('rect').attr('x', x(band[0])).attr('width', x(band[1]) - x(band[0])).attr('y', m.t).attr('height', H - m.t - m.b).attr('fill', 'rgba(159,220,235,.06)');
  svg.append('text').attr('class', 'lbl').attr('x', m.l).attr('y', 12).attr('text-anchor', 'start').style('font-size', '12px').style('fill', 'var(--stage-muted)').text(unit);

  const ln = d3.line().defined(d => d[1] != null).x(d => x(d[0])).y(d => y(d[1])).curve(d3.curveMonotoneX);
  const paths = series.map(s => {
    if (fillArea) svg.append('path').attr('d', d3.area().defined(d => d[1] != null).x(d => x(d[0])).y0(y(Math.max(lo, 0))).y1(d => y(d[1])).curve(d3.curveMonotoneX)(s.data)).attr('fill', s.color).attr('opacity', .12);
    const p = svg.append('path').attr('d', ln(s.data)).attr('fill', 'none').attr('stroke', s.color).attr('stroke-width', 2.2).attr('stroke-linejoin', 'round');
    return p;
  });
  // direct end labels for multi-series
  if (series.length > 1) {
    const ends = series.map(s => { const d = s.data.filter(v => v[1] != null).at(-1); return { s, y: y(d[1]), x: x(d[0]) }; }).sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 16) ends[i].y = ends[i - 1].y + 16;
    ends.forEach(e => svg.append('text').attr('class', 'lbl').attr('x', e.x + 8).attr('y', e.y + 4).attr('text-anchor', 'start').text(e.s.name));
  }
  // draw-in
  if (!still) paths.forEach(p => { const L = p.node().getTotalLength(); p.attr('stroke-dasharray', `${L} ${L}`).attr('stroke-dashoffset', L); el._go = () => paths.forEach(q => q.transition().duration(1600).attr('stroke-dashoffset', 0)); });

  // hover: crosshair + tooltip
  const xh = svg.append('line').attr('class', 'xh').attr('y1', m.t).attr('y2', H - m.b).style('opacity', 0);
  const dots = series.map(s => svg.append('circle').attr('r', 4.5).attr('fill', s.color).attr('stroke', '#0B0D15').attr('stroke-width', 2).style('opacity', 0));
  const tip = document.createElement('div'); tip.className = 'tip'; tip.hidden = true; el.append(tip);
  const all = [...new Set(xs)].sort((a, b) => a - b);
  const bis = d3.bisector(d => d).center;
  svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', W - m.l - m.r).attr('height', H - m.t - m.b).attr('fill', 'transparent')
    .on('pointermove', e => {
      const [px] = d3.pointer(e); const xv = all[bis(all, x.invert(px))];
      xh.attr('x1', x(xv)).attr('x2', x(xv)).style('opacity', 1);
      let html = `<div class="mono">${xv}</div>`;
      series.forEach((s, i) => { const d = s.data.find(v => v[0] === xv); if (d && d[1] != null) { dots[i].attr('cx', x(xv)).attr('cy', y(d[1])).style('opacity', 1); html += `<div><span style="color:${s.color}">●</span> ${series.length > 1 ? s.name + ': ' : ''}<b>${yFmt(d[1])}</b></div>`; } else dots[i].style('opacity', 0); });
      tip.innerHTML = html; tip.hidden = false;
      const r = el.getBoundingClientRect(), sx = r.width / W;
      const tw = tip.offsetWidth / 2;
      tip.style.left = Math.max(tw, Math.min(r.width - tw, x(xv) * sx)) + 'px';
      tip.style.top = Math.max(70, (d3.min(series.map((s, i) => +dots[i].attr('cy') || H)) * sx)) + 'px';
    })
    .on('pointerleave', () => { xh.style('opacity', 0); dots.forEach(d => d.style('opacity', 0)); tip.hidden = true; });
}

const CHARTS = {
  async temp(el) {
    const D = await indicators();
    lineChart(el, { series: [{ name: 'GISTEMP', color: '#F7A285', data: D.temp }], unit: 'الفرق عن متوسط 1951–1980 (°م)', yFmt: v => (v > 0 ? '+' : '') + fmt(v, 2), zero: true, area: true });
  },
  async stripes(el) {
    const D = await indicators();
    const sc = d3.scaleLinear().domain([-0.5, 0, 1.3]).range(['#2E6DA4', '#20232E', '#E0533A']).clamp(true);
    const s = document.createElement('div'); s.className = 'stripes'; s.setAttribute('role', 'img'); s.setAttribute('aria-label', 'شرائط الاحترار: كل شريط سنة من 1880 حتى ' + D.temp.at(-1)[0]);
    s.innerHTML = D.temp.map(([yr, v]) => `<i style="background:${sc(v)}" title="${yr}: ${(v > 0 ? '+' : '') + fmt(v, 2)} °م"></i>`).join('');
    el.append(s);
    const ax = document.createElement('div'); ax.className = 'stripes-ax'; ax.innerHTML = `<span>${D.temp[0][0]}</span><span>1950</span><span>${D.temp.at(-1)[0]}</span>`; el.append(ax);
  },
  async co2(el) {
    const D = await indicators();
    lineChart(el, { series: [{ name: 'العالم', color: '#E27A55', data: D.co2World }], unit: 'مليار طن CO₂ سنويًا', yFmt: v => fmt(v), zero: true, area: true });
  },
  async food(el) {
    const D = await indicators();
    lineChart(el, { series: [{ name: 'العالم', color: '#E2B076', data: D.foodWorld }], unit: '% من سكان العالم يعانون نقص التغذية', yFmt: v => fmt(v) + '%', yMin: 6, band: [2019.5, 2022.5] });
  },
  async elec(el) {
    const D = await indicators(), E = D.elecWorld;
    lineChart(el, { series: [
      { name: 'شمسية', color: '#E3B04B', data: E.map(r => [r[0], r[1]]) },
      { name: 'رياح', color: '#6CC4DC', data: E.map(r => [r[0], r[2]]) },
      { name: 'مائية', color: '#7C8CE0', data: E.map(r => [r[0], r[3]]) },
    ], unit: 'تيراواط ساعة سنويًا (توليد الكهرباء عالميًا)', yFmt: v => fmt(v, 0), zero: true });
  },
  async renewShare(el) {
    const D = await indicators(), E = D.elecWorld;
    lineChart(el, { series: [{ name: 'العالم', color: '#96CAA0', data: E.map(r => [r[0], r[6]]) }], unit: '% من كهرباء العالم من مصادر متجددة', yFmt: v => fmt(v) + '%', zero: true, area: true });
  },
};

/* ---------- counters ---------- */
function count(el) {
  const to = parseFloat(el.dataset.to), d = (el.dataset.to.split('.')[1] || '').length, pre = el.dataset.pre || '', suf = el.dataset.suf || '';
  if (still) { el.textContent = pre + fmt(to, d) + suf; return; }
  const t0 = performance.now(), dur = 1400;
  const step = t => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = pre + fmt(to * e, d) + suf; if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

/* ---------- boot ---------- */
const io = new IntersectionObserver(es => es.forEach(e => {
  if (!e.isIntersecting) return;
  const t = e.target; io.unobserve(t);
  if (t.matches('.reveal')) t.classList.add('on');
  if (t.matches('[data-to]')) count(t);
  if (t._go) t._go();
}), { rootMargin: '0px 0px -10% 0px' });

document.querySelectorAll('[data-map]').forEach(f => initMap(f).catch(err => console.error(err)));
document.querySelectorAll('[data-chart]').forEach(el => (CHARTS[el.dataset.chart]?.(el) || Promise.resolve()).then(() => io.observe(el)).catch(err => console.error(err)));
document.querySelectorAll('[data-to], .reveal').forEach(el => io.observe(el));

// holograms: load three.js only when a stage is near the viewport and WebGL is there
const holos = document.querySelectorAll('[data-holo]');
if (holos.length) {
  const ok = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } })();
  const net = navigator.connection || {};
  if (ok && !net.saveData) {
    const ho = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return; ho.unobserve(e.target);
      import('./holo.js').then(m => m.mount(e.target)).catch(err => console.error(err));
    }), { rootMargin: '200px' });
    holos.forEach(h => ho.observe(h));
  }
}

// hub filter
const fl = document.querySelector('.filters');
if (fl) {
  const cards = [...document.querySelectorAll('.grid .card')];
  const set = c => {
    fl.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.c === c));
    cards.forEach(k => (k.hidden = c !== 'all' && !k.dataset.c.split(' ').includes(c)));
    try { history.replaceState(null, '', c === 'all' ? location.pathname : '#' + c); } catch {}
  };
  fl.addEventListener('click', e => { const b = e.target.closest('button'); if (b) set(b.dataset.c); });
  const h = location.hash.slice(1);
  if (h && fl.querySelector(`[data-c="${h}"]`)) set(h);
}
