'use strict';
// Prototype simulator used only to produce the concept-art images and the numbers shown in them.
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

/* ================= utils ================= */
function rng32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function shuffle(a, r) { for (let i = a.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) { const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val); while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; } k[i] = key; v[i] = val; }
  peek() { return this.v[0]; }
  pop() { const k = this.k, v = this.v, top = v[0], lk = k.pop(), lv = v.pop(), n = k.length; if (n > 0) { let i = 0; for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && k[c + 1] < k[c]) c++; if (k[c] >= lk) break; k[i] = k[c]; v[i] = v[c]; i = c; } k[i] = lk; v[i] = lv; } return top; }
}
function hilbertD(n, x, y) { let d = 0; for (let s = n >> 1; s > 0; s >>= 1) { const rx = (x & s) > 0 ? 1 : 0, ry = (y & s) > 0 ? 1 : 0; d += s * s * ((3 * rx) ^ ry); if (ry === 0) { if (rx === 1) { x = n - 1 - x; y = n - 1 - y; } const t = x; x = y; y = t; } } return d; }

/* ================= space ================= */
function makeGrid(W, H, D = 1) {
  const N = W * H * D, nb = new Array(N), X = new Int16Array(N), Y = new Int16Array(N), Z = new Int16Array(N);
  for (let z = 0; z < D; z++) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = x + y * W + z * W * H; X[i] = x; Y[i] = y; Z[i] = z; const a = [];
    if (x > 0) a.push(i - 1); if (x < W - 1) a.push(i + 1);
    if (y > 0) a.push(i - W); if (y < H - 1) a.push(i + W);
    if (z > 0) a.push(i - W * H); if (z < D - 1) a.push(i + W * H);
    nb[i] = a;
  }
  const idx = (x, y, z = 0) => x + y * W + z * W * H;
  const dist = (a, b) => Math.abs(X[a] - X[b]) + Math.abs(Y[a] - Y[b]) + Math.abs(Z[a] - Z[b]);
  return { W, H, D, N, nb, X, Y, Z, idx, dist };
}
function wallsQuad(g, r, n, clearX, clearY) {
  const set = new Set(), hw = g.W >> 1, hh = g.H >> 1;
  for (let k = 0; k < n; k++) {
    let w = 2 + ((r() * 6) | 0), h = 1 + ((r() * 2) | 0); if (r() < 0.45) { const t = w; w = h; h = t; }
    const x0 = (r() * (hw - w)) | 0, y0 = (r() * (hh - h)) | 0;
    if (x0 < clearX && y0 < clearY) continue;
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++)
      for (const [xx, yy] of [[x, y], [g.W - 1 - x, y], [x, g.H - 1 - y], [g.W - 1 - x, g.H - 1 - y]]) set.add(g.idx(xx, yy));
  }
  return [...set];
}
function wallsRot(g, r, n, bases) {
  const set = new Set();
  const near = (x, y) => bases.some(b => Math.max(Math.abs(g.X[b] - x), Math.abs(g.Y[b] - y)) <= 3);
  for (let k = 0; k < n; k++) {
    let w = 2 + ((r() * 5) | 0), h = 1 + ((r() * 2) | 0); if (r() < 0.5) { const t = w; w = h; h = t; }
    const x0 = (r() * (g.W - w)) | 0, y0 = (r() * (g.H - h)) | 0;
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++)
      for (const [xx, yy] of [[x, y], [g.W - 1 - x, g.H - 1 - y]]) if (!near(xx, yy)) set.add(g.idx(xx, yy));
  }
  return [...set];
}

/* ================= level 1: classic algorithms as frontier policies ================= */
function heapPol(ctx, keyFn) {
  const { g, owner } = ctx, hp = new Heap(), seen = new Uint8Array(g.N);
  return {
    onClaim(c) { for (const n of g.nb[c]) if (!seen[n] && owner[n] === 0) { seen[n] = 1; hp.push(keyFn(n, c), n); } },
    pick() { while (hp.size && owner[hp.peek()] !== 0) hp.pop(); return hp.size ? hp.peek() : -1; }
  };
}
const nearest = (g, n, list) => { let d = 1e9; for (const e of list) { const v = g.dist(n, e); if (v < d) d = v; } return d; };
const POL = {
  bfs(ctx) { const { g, owner } = ctx, q = [], seen = new Uint8Array(g.N); let h = 0;
    return { onClaim(c) { for (const n of g.nb[c]) if (!seen[n] && owner[n] === 0) { seen[n] = 1; q.push(n); } },
      pick() { while (h < q.length && owner[q[h]] !== 0) h++; return h < q.length ? q[h] : -1; } }; },
  dfs(ctx) { const { g, owner, rng } = ctx, st = [];
    return { onClaim(c) { const ns = shuffle(g.nb[c].filter(n => owner[n] === 0), rng); for (const n of ns) st.push(n); },
      pick() { while (st.length && owner[st[st.length - 1]] !== 0) st.pop(); return st.length ? st[st.length - 1] : -1; } }; },
  eden(ctx) { const { g, owner, rng } = ctx, fr = [], inF = new Uint8Array(g.N);
    return { onClaim(c) { for (const n of g.nb[c]) if (!inF[n] && owner[n] === 0) { inF[n] = 1; fr.push(n); } },
      pick() { while (fr.length) { const i = (rng() * fr.length) | 0, c = fr[i]; if (owner[c] === 0) return c; fr[i] = fr[fr.length - 1]; fr.pop(); } return -1; } }; },
  rwalk(ctx) { const { g, owner, rng } = ctx, fr = [], inF = new Uint8Array(g.N); let pos = ctx.base;
    return { onClaim(c) { pos = c; for (const n of g.nb[c]) if (!inF[n] && owner[n] === 0) { inF[n] = 1; fr.push(n); } },
      pick() { const e = g.nb[pos].filter(n => owner[n] === 0); if (e.length) return e[(rng() * e.length) | 0];
        while (fr.length) { const i = (rng() * fr.length) | 0, c = fr[i]; if (owner[c] === 0) return c; fr[i] = fr[fr.length - 1]; fr.pop(); } return -1; } }; },
  greedy(ctx) { const { g, rng } = ctx; return heapPol(ctx, n => nearest(g, n, ctx.enemies) + rng() * 0.5); },
  astar(ctx) { const { g, rng } = ctx, gc = new Int32Array(g.N), tg = ctx.center;
    return heapPol(ctx, (n, p) => { gc[n] = gc[p] + 1; return gc[n] + g.dist(n, tg) - gc[n] * 0.001 + rng() * 0.0005; }); },
  prim(ctx) { const { rng } = ctx; return heapPol(ctx, () => rng()); },
  spiral(ctx) { const { g } = ctx, b = ctx.base;
    return heapPol(ctx, n => { const dx = g.X[n] - g.X[b], dy = g.Y[n] - g.Y[b]; return Math.max(Math.abs(dx), Math.abs(dy)) + (Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI) * 0.999; }); },
  scan(ctx) { const { g } = ctx, b = ctx.base; return heapPol(ctx, n => Math.abs(g.Y[n] - g.Y[b]) * 1000 + Math.abs(g.X[n] - g.X[b])); },
  hilbert(ctx) { const { g } = ctx; let s = 1; while (s < Math.max(g.W, g.H)) s <<= 1; const hb = hilbertD(s, g.X[ctx.base], g.Y[ctx.base]);
    return heapPol(ctx, n => Math.abs(hilbertD(s, g.X[n], g.Y[n]) - hb)); },
  voronoi(ctx) { const { g, rng } = ctx, b = ctx.base;
    return heapPol(ctx, n => { const de = nearest(g, n, ctx.enemies); return Math.abs(g.dist(n, b) - de) + de * 0.001 + rng() * 0.0005; }); },
};
function runL1(o) {
  const { g, walls, bases, kinds, seed, maxTicks = 1e9, stopFill = 1, sample = 10 } = o;
  const rng = rng32(seed), P = kinds.length, owner = new Uint8Array(g.N), ct = new Int32Array(g.N).fill(-1);
  let free = g.N; if (walls) for (const w of walls) { owner[w] = 255; free--; }
  const center = g.idx(g.W >> 1, g.H >> 1, g.D >> 1);
  const ag = kinds.map((k, i) => POL[k]({ g, owner, id: i + 1, base: bases[i], enemies: bases.filter((_, j) => j !== i), rng: rng32(seed * 31 + i * 7 + 1), center }));
  const cnt = new Array(P).fill(0), hist = [];
  const claim = (i, c, t) => { owner[c] = i + 1; ct[c] = t; cnt[i]++; ag[i].onClaim(c); };
  for (let i = 0; i < P; i++) claim(i, bases[i], 0);
  hist.push(cnt.slice()); if (o.onSample) o.onSample(owner, cnt, 0);
  let t = 0, filled = P; const prop = new Map();
  for (t = 1; t <= maxTicks; t++) {
    prop.clear(); let any = false;
    for (let i = 0; i < P; i++) { const c = ag[i].pick(); if (c >= 0) { any = true; const a = prop.get(c); if (a) a.push(i); else prop.set(c, [i]); } }
    if (!any) { t--; break; }
    for (const [c, a] of prop) { const w = a.length === 1 ? a[0] : a[(rng() * a.length) | 0]; claim(w, c, t); filled++; }
    if (t % sample === 0) { hist.push(cnt.slice()); if (o.onSample) o.onSample(owner, cnt, t); }
    if (filled / free >= stopFill) break;
  }
  return { owner, ct, cnt, hist, ticks: Math.min(t, maxTicks), free };
}

/* ================= level 2: energy, attack, supply lines ================= */
const dBase = (S, n) => { let d = 1e9; for (let j = 0; j < S.bases.length; j++) if (j !== S.me && S.alive[j]) { const v = S.g.dist(n, S.bases[j]); if (v < d) d = v; } return d; };
const ownNb = (S, n) => { let k = 0; for (const m of S.g.nb[n]) if (S.owner[m] === S.id) k++; return k; };
const BOT = {
  cheap: (S, n, cost, r) => cost + r() * 0.9,
  rush: (S, n, cost, r) => cost + 0.3 * dBase(S, n) + r() * 0.3,
  compact: (S, n, cost, r) => cost - 0.8 * ownNb(S, n) + r() * 0.3,
  cutter: (S, n, cost, r) => { const ow = S.owner[n]; if (ow === 0) return 1.6 + r() * 0.3; let sx = 0, sy = 0;
    for (const m of S.g.nb[n]) if (S.owner[m] === ow) { if (S.g.Y[m] === S.g.Y[n]) sx++; else sy++; }
    if ((sx === 2 && sy === 0) || (sx === 0 && sy === 2)) return 0.8 + r() * 0.2; if (sx + sy === 1) return 1.9 + r() * 0.3; return cost + 0.4 + r() * 0.5; },
};
function runL2(o) {
  const { g, walls, bases, kinds, seed, maxTicks, snaps = [], slots = 6 } = o;
  const N = g.N, P = kinds.length, rng = rng32(seed);
  const owner = new Uint8Array(N), chg = new Int32Array(N).fill(-9999), cut = new Int32Array(N).fill(-9999);
  let free = N; if (walls) for (const w of walls) { owner[w] = 255; free--; }
  const energy = new Array(P).fill(0), alive = new Array(P).fill(true), cnt = new Array(P).fill(0), taken = new Array(P).fill(0), lost = new Array(P).fill(0), ms = new Array(P).fill(0);
  const events = [], hist = [], out = [];
  bases.forEach((b, i) => { owner[b] = i + 1; cnt[i] = 1; });
  const prs = kinds.map((_, i) => rng32(seed * 131 + i * 17 + 5));
  const ctxs = kinds.map((_, i) => ({ g, owner, id: i + 1, me: i, bases, alive }));
  const mark = new Uint32Array(N), queue = new Int32Array(N); let stamp = 0;
  const baseIdx = new Map(bases.map((b, i) => [b, i]));
  const costOf = c => { const ow = owner[c]; if (ow === 0) return 1; let k = 1; for (const n of g.nb[c]) if (owner[n] === ow) k++; if (baseIdx.get(c) === ow - 1) k += 40; return k; };
  const adj = (c, id) => { for (const n of g.nb[c]) if (owner[n] === id) return true; return false; };
  const snap = (t, why) => out.push({ t, why, owner: owner.slice(), chg: chg.slice(), cut: cut.slice(), cnt: cnt.slice(), energy: energy.map(e => Math.round(e)), alive: alive.slice(), taken: taken.slice(), lost: lost.slice(), events: events.slice(), hist: hist.map(h => h.slice()), free, ms: ms.map(v => v / t) });
  let hold = 0, t = 0, empties = free - P, fullAt = 0; const met = new Set();
  for (t = 1; t <= maxTicks; t++) {
    const hitBy = new Array(P).fill(-1);
    for (let i = 0; i < P; i++) if (alive[i]) energy[i] = Math.min(60, energy[i] + 1 + cnt[i] / 150);
    for (let s = 0; s < slots; s++) {
      const prop = new Map();
      for (let i = 0; i < P; i++) {
        if (!alive[i]) continue;
        const t0 = process.hrtime.bigint(), id = i + 1, r = prs[i], score = BOT[kinds[i]], S = ctxs[i]; let best = -1, bs = Infinity, bc = 0;
        for (let c = 0; c < N; c++) {
          if (owner[c] !== id) continue;
          for (const n of g.nb[c]) { const ow = owner[n]; if (ow === id || ow === 255) continue; const cost = costOf(n), sc = score(S, n, cost, r); if (sc < bs) { bs = sc; best = n; bc = cost; } }
        }
        ms[i] += Number(process.hrtime.bigint() - t0) / 1e6;
        if (best >= 0 && energy[i] >= bc) { const a = prop.get(best); if (a) a.push(i); else prop.set(best, [i]); }
      }
      if (!prop.size) break;
      for (const [c, a] of prop) {
        const w = a.length === 1 ? a[0] : a[(rng() * a.length) | 0], id = w + 1, cost = costOf(c);
        if (energy[w] < cost || !adj(c, id)) continue;
        const prev = owner[c]; energy[w] -= cost; owner[c] = id; chg[c] = t; cnt[w]++;
        if (prev >= 1 && prev <= P) { cnt[prev - 1]--; taken[w]++; lost[prev - 1]++; hitBy[prev - 1] = w; } else empties--;
        for (const n of g.nb[c]) { const on = owner[n]; if (on >= 1 && on <= P && on !== id) { const key = Math.min(on, id) * 10 + Math.max(on, id); if (!met.has(key)) { met.add(key); events.push({ t, type: 'contact', a: w, b: on - 1 }); } } }
      }
    }
    for (let i = 0; i < P; i++) if (alive[i] && owner[bases[i]] !== i + 1) {
      const by = owner[bases[i]] - 1; alive[i] = false; let n = 0;
      for (let c = 0; c < N; c++) if (owner[c] === i + 1) { owner[c] = 0; cut[c] = t; n++; }
      cnt[i] = 0; energy[i] = 0; empties += n; events.push({ t, type: 'elim', who: i, by, cells: n });
    }
    if (!fullAt && empties <= free * 0.01) { fullAt = t; events.push({ t, type: 'full' }); }
    for (let i = 0; i < P; i++) {
      if (!alive[i]) continue; const id = i + 1; stamp++; let qh = 0, qt = 0; queue[qt++] = bases[i]; mark[bases[i]] = stamp;
      while (qh < qt) { const c = queue[qh++]; for (const n of g.nb[c]) if (owner[n] === id && mark[n] !== stamp) { mark[n] = stamp; queue[qt++] = n; } }
      if (qt < cnt[i]) { let n = 0; for (let c = 0; c < N; c++) if (owner[c] === id && mark[c] !== stamp) { owner[c] = 0; cut[c] = t; n++; }
        cnt[i] -= n; empties += n; if (n >= 4) events.push({ t, type: 'cut', who: i, by: hitBy[i], cells: n }); }
    }
    if (t % 10 === 0) hist.push(cnt.slice());
    if (snaps.includes(t)) snap(t, 'snap');
    const nAlive = alive.filter(Boolean).length; if (nAlive <= 1) { snap(t, 'last-standing'); break; }
    const lead = Math.max(...cnt); if (lead / free >= 0.6) { hold++; if (hold >= 50) { snap(t, 'domination'); break; } } else hold = 0;
  }
  if (t > maxTicks) snap(maxTicks, 'tick-cap');
  return out;
}

/* ================= drawing ================= */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function writePNG(file, w, h, rgba) {
  const raw = Buffer.alloc((w * 3 + 1) * h); let o = 0;
  for (let y = 0; y < h; y++) { raw[o++] = 0; let i = y * w * 4; for (let x = 0; x < w; x++, i += 4) { raw[o++] = rgba[i]; raw[o++] = rgba[i + 1]; raw[o++] = rgba[i + 2]; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
}
const mix = (c, d, t) => [c[0] + (d[0] - c[0]) * t, c[1] + (d[1] - c[1]) * t, c[2] + (d[2] - c[2]) * t];
const mul = (c, k) => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];
class Img {
  constructor(w, h, bg) { this.w = w; this.h = h; this.d = new Uint8Array(w * h * 4); const d = this.d; for (let i = 0; i < d.length; i += 4) { d[i] = bg[0]; d[i + 1] = bg[1]; d[i + 2] = bg[2]; d[i + 3] = 255; } }
  span(y, xa, xb, c, a) { const d = this.d; xa = Math.max(0, xa); xb = Math.min(this.w, xb); if (y < 0 || y >= this.h) return; let i = (y * this.w + xa) * 4;
    if (a >= 1) for (let x = xa; x < xb; x++, i += 4) { d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; }
    else for (let x = xa; x < xb; x++, i += 4) { d[i] += (c[0] - d[i]) * a; d[i + 1] += (c[1] - d[i + 1]) * a; d[i + 2] += (c[2] - d[i + 2]) * a; } }
  rect(x, y, w, h, c, a = 1) { x = Math.round(x); y = Math.round(y); for (let yy = y; yy < y + h; yy++) this.span(yy, x, x + w, c, a); }
  poly(pts, c, a = 1) {
    let y0 = Infinity, y1 = -Infinity; for (const p of pts) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    y0 = Math.max(0, Math.floor(y0)); y1 = Math.min(this.h - 1, Math.ceil(y1)); const n = pts.length, xs = [];
    for (let y = y0; y <= y1; y++) { const sy = y + 0.5; xs.length = 0;
      for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; if ((p[1] <= sy && q[1] > sy) || (q[1] <= sy && p[1] > sy)) xs.push(p[0] + (sy - p[1]) * (q[0] - p[0]) / (q[1] - p[1])); }
      xs.sort((u, v) => u - v); for (let k = 0; k + 1 < xs.length; k += 2) this.span(y, Math.round(xs[k]), Math.round(xs[k + 1]), c, a); }
  }
  line(p, q, w, c, a = 1) { const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L * w / 2, ny = dx / L * w / 2; this.poly([[p[0] + nx, p[1] + ny], [q[0] + nx, q[1] + ny], [q[0] - nx, q[1] - ny], [p[0] - nx, p[1] - ny]], c, a); }
  down(f) { const w = (this.w / f) | 0, h = (this.h / f) | 0, o = new Img(w, h, [0, 0, 0]), s = this.d, d = o.d, k = 1 / (f * f);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let r = 0, g = 0, b = 0; for (let yy = 0; yy < f; yy++) { let i = ((y * f + yy) * this.w + x * f) * 4; for (let xx = 0; xx < f; xx++, i += 4) { r += s[i]; g += s[i + 1]; b += s[i + 2]; } } const j = (y * w + x) * 4; d[j] = r * k; d[j + 1] = g * k; d[j + 2] = b * k; }
    return o; }
  blit(src, dx, dy) { for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) { const i = (y * src.w + x) * 4, j = ((y + dy) * this.w + x + dx) * 4; this.d[j] = src.d[i]; this.d[j + 1] = src.d[i + 1]; this.d[j + 2] = src.d[i + 2]; } }
  save(name) { writePNG(path.join(OUT, name), this.w, this.h, this.d); return this; }
}
const COL = [[230, 159, 0], [86, 180, 233], [204, 121, 167], [0, 158, 115]];
const BG = [12, 14, 17], EMPTY = [22, 26, 32], WALL = [62, 70, 83], WHITE = [255, 255, 255], NEUT = [74, 81, 94];
function drawMap(g, owner, o) {
  const cs = o.cs, gap = o.gap, z = o.z || 0, W = g.W, H = g.H, img = new Img(W * cs + gap, H * cs + gap, BG), cols = o.cols || COL;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = g.idx(x, y, z), ow = owner[c]; let col;
    if (ow === 0) { const s = o.infl ? o.infl[c] : 0; col = (o.cut && o.tick - o.cut[c] < 150) ? NEUT : (s >= 1 && s < 255) ? mix(EMPTY, cols[s - 1], o.tint || 0.17) : EMPTY; }
    else if (ow === 255) col = WALL;
    else { col = cols[ow - 1];
      if (o.l2) { let front = false; for (const n of g.nb[c]) { const on = owner[n]; if (on !== ow && on !== 0 && on !== 255) { front = true; break; } }
        const age = o.tick - o.chg[c]; col = age < 14 ? mix(col, WHITE, 0.5 * (1 - age / 14) + 0.14) : front ? mix(col, WHITE, 0.14) : mix(col, BG, 0.3); }
      else if (o.ct) { const age = o.tick - o.ct[c]; col = age < o.recent ? mix(col, WHITE, 0.5 * (1 - age / o.recent)) : mix(col, BG, 0.14); } }
    img.rect(gap + x * cs, gap + y * cs, cs - gap, cs - gap, col);
  }
  if (o.bases) o.bases.forEach((b, i) => { const x = g.X[b], y = g.Y[b], x0 = (x - 1) * cs, y0 = (y - 1) * cs, S = 3 * cs + gap, th = Math.max(2, gap * 2);
    const col = o.baseCols ? o.baseCols[i] : (o.dead && o.dead[i] ? [128, 136, 148] : WHITE);
    img.rect(x0, y0, S, th, col); img.rect(x0, y0 + S - th, S, th, col); img.rect(x0, y0, th, S, col); img.rect(x0 + S - th, y0, th, S, col);
    img.rect(gap + x * cs, gap + y * cs, cs - gap, cs - gap, col); });
  return img;
}
function drawThumb(g, owner, ct, ticks, me) {
  const cs = 8, gap = 1, img = new Img(g.W * cs + gap, g.H * cs + gap, BG);
  for (let y = 0; y < g.H; y++) for (let x = 0; x < g.W; x++) { const c = g.idx(x, y), ow = owner[c];
    const col = ow === 0 ? EMPTY : ow === me ? mix([52, 88, 136], [238, 243, 250], Math.pow(ct[c] / ticks, 0.8)) : [70, 77, 90];
    img.rect(gap + x * cs, gap + y * cs, cs - gap, cs - gap, col); }
  return img;
}
function drawIso(g, owner, o) {
  const ss = o.ss, s = o.s * ss, a = 0.866 * s, b = 0.5 * s, W = g.W, H = g.H, D = g.D, m = 30 * ss;
  const iw = Math.ceil((W + H) * a + 2 * m), ih = Math.ceil((W + H) * b + D * s + 2 * m), ox = m + H * a, oy = m + D * s;
  const P = (x, y, z) => [ox + (x - y) * a, oy + (x + y) * b - z * s];
  const img = new Img(iw, ih, BG), lw = 1.1 * ss, gc = [70, 79, 94];
  img.poly([P(0, 0, 0), P(W, 0, 0), P(W, H, 0), P(0, H, 0)], [20, 24, 30]);
  img.poly([P(0, 0, 0), P(0, H, 0), P(0, H, D), P(0, 0, D)], [17, 20, 25]);
  img.poly([P(0, 0, 0), P(W, 0, 0), P(W, 0, D), P(0, 0, D)], [15, 18, 22]);
  for (let i = 0; i <= W; i += 5) { img.line(P(i, 0, 0), P(i, H, 0), lw, gc, 0.45); img.line(P(i, 0, 0), P(i, 0, D), lw, gc, 0.45); }
  for (let i = 0; i <= H; i += 5) { img.line(P(0, i, 0), P(W, i, 0), lw, gc, 0.45); img.line(P(0, i, 0), P(0, i, D), lw, gc, 0.45); }
  for (let i = 0; i <= D; i += 5) { img.line(P(0, 0, i), P(0, H, i), lw, gc, 0.45); img.line(P(0, 0, i), P(W, 0, i), lw, gc, 0.45); }
  const list = []; for (let c = 0; c < g.N; c++) if (owner[c] >= 1 && owner[c] < 255) list.push(c);
  list.sort((p, q) => (g.X[p] + g.Y[p] + g.Z[p]) - (g.X[q] + g.Y[q] + g.Z[q]));
  const open = (x, y, z) => x >= W || y >= H || z >= D || owner[g.idx(x, y, z)] === 0;
  const inset = (pts, k) => { let cx = 0, cy = 0; for (const p of pts) { cx += p[0]; cy += p[1]; } cx /= pts.length; cy /= pts.length; return pts.map(p => [cx + (p[0] - cx) * k, cy + (p[1] - cy) * k]); };
  const face = (pts, col) => { img.poly(pts, mul(col, 0.6)); img.poly(inset(pts, 0.88), col); };
  const dmax = W + H + D - 3;
  for (const c of list) {
    const x = g.X[c], y = g.Y[c], z = g.Z[c], base = o.cols[owner[c] - 1], f = 0.5 + 0.5 * (x + y + z) / dmax;
    if (open(x, y + 1, z)) face([P(x, y + 1, z), P(x + 1, y + 1, z), P(x + 1, y + 1, z + 1), P(x, y + 1, z + 1)], mul(base, 0.6 * f));
    if (open(x + 1, y, z)) face([P(x + 1, y, z), P(x + 1, y + 1, z), P(x + 1, y + 1, z + 1), P(x + 1, y, z + 1)], mul(base, 0.82 * f));
    if (open(x, y, z + 1)) face([P(x, y, z + 1), P(x + 1, y, z + 1), P(x + 1, y + 1, z + 1), P(x, y + 1, z + 1)], mul(mix(base, WHITE, 0.16), f));
  }
  const ec = [150, 160, 176], e = (p, q) => img.line(p, q, 1.3 * ss, ec, 0.55);
  e(P(W, 0, D), P(W, H, D)); e(P(W, H, D), P(0, H, D)); e(P(W, H, 0), P(W, H, D)); e(P(W, 0, 0), P(W, H, 0)); e(P(W, H, 0), P(0, H, 0));
  e(P(W, 0, 0), P(W, 0, D)); e(P(0, H, 0), P(0, H, D)); e(P(0, 0, D), P(W, 0, D)); e(P(0, 0, D), P(0, H, D));
  if (o.sliceZ != null) { const h = o.sliceZ + 0.5, q = [P(0, 0, h), P(W, 0, h), P(W, H, h), P(0, H, h)]; for (let i = 0; i < 4; i++) img.line(q[i], q[(i + 1) % 4], 2 * ss, WHITE, 0.85); }
  return img.down(ss);
}
// Same voxel view, but from any yaw angle around the vertical axis (used for the turntable frames).
function drawSpin(g, owner, o) {
  const ss = o.ss, s = o.s * ss, W = g.W, H = g.H, D = g.D, m = 30 * ss, SP = 0.5774, CP = 0.8165, R = Math.hypot(W, H) / 2;
  const iw = Math.ceil(2 * R * s + 2 * m), ih = Math.ceil(2 * R * s * SP + D * s * CP + 2 * m), ox = iw / 2, oy = m + D * s * CP + R * s * SP, cx = W / 2, cy = H / 2;
  const c = Math.cos(o.yaw), sn = Math.sin(o.yaw);
  const xr = (x, y) => (x - cx) * c + (y - cy) * sn, yr = (x, y) => -(x - cx) * sn + (y - cy) * c;
  const P = (x, y, z) => [ox + xr(x, y) * s, oy + yr(x, y) * s * SP - z * s * CP];
  const depth = (x, y, z) => yr(x, y) * CP + z * SP;
  const img = new Img(iw, ih, BG), lw = 1.1 * ss, gc = [70, 79, 94];
  const nearX = -sn > 1e-9, nearY = c > 1e-9, xf = nearX ? 0 : W, yf = nearY ? 0 : H;
  img.poly([P(0, 0, 0), P(W, 0, 0), P(W, H, 0), P(0, H, 0)], [20, 24, 30]);
  img.poly([P(xf, 0, 0), P(xf, H, 0), P(xf, H, D), P(xf, 0, D)], [17, 20, 25]);
  img.poly([P(0, yf, 0), P(W, yf, 0), P(W, yf, D), P(0, yf, D)], [15, 18, 22]);
  for (let i = 0; i <= W; i += 5) { img.line(P(i, 0, 0), P(i, H, 0), lw, gc, 0.45); img.line(P(i, yf, 0), P(i, yf, D), lw, gc, 0.45); }
  for (let i = 0; i <= H; i += 5) { img.line(P(0, i, 0), P(W, i, 0), lw, gc, 0.45); img.line(P(xf, i, 0), P(xf, i, D), lw, gc, 0.45); }
  for (let i = 0; i <= D; i += 5) { img.line(P(xf, 0, i), P(xf, H, i), lw, gc, 0.45); img.line(P(0, yf, i), P(W, yf, i), lw, gc, 0.45); }
  const list = [], dep = new Float32Array(g.N);
  for (let i = 0; i < g.N; i++) if (owner[i] >= 1 && owner[i] < 255) { list.push(i); dep[i] = depth(g.X[i] + 0.5, g.Y[i] + 0.5, g.Z[i] + 0.5); }
  list.sort((p, q) => dep[p] - dep[q]);
  const emptyAt = (x, y, z) => x < 0 || y < 0 || x >= W || y >= H || z >= D || owner[g.idx(x, y, z)] === 0;
  const inset = (pts, k) => { let ax = 0, ay = 0; for (const p of pts) { ax += p[0]; ay += p[1]; } ax /= pts.length; ay /= pts.length; return pts.map(p => [ax + (p[0] - ax) * k, ay + (p[1] - ay) * k]); };
  const face = (pts, col) => { img.poly(pts, mul(col, 0.6)); img.poly(inset(pts, 0.88), col); };
  const bx = 0.56 + 0.20 * Math.abs(sn) + 0.16 * (nearX ? c : -c), by = 0.56 + 0.20 * Math.abs(c) + 0.16 * (nearY ? sn : -sn);
  let d0 = Infinity, d1 = -Infinity;
  for (const [x, y, z] of [[0, 0, 0], [W, 0, 0], [0, H, 0], [W, H, 0], [0, 0, D], [W, 0, D], [0, H, D], [W, H, D]]) { const d = depth(x, y, z); if (d < d0) d0 = d; if (d > d1) d1 = d; }
  for (const i of list) {
    const x = g.X[i], y = g.Y[i], z = g.Z[i], base = o.cols[owner[i] - 1], f = 0.5 + 0.5 * (dep[i] - d0) / (d1 - d0), fx = nearX ? x + 1 : x, fy = nearY ? y + 1 : y;
    if (emptyAt(x, nearY ? y + 1 : y - 1, z)) face([P(x, fy, z), P(x + 1, fy, z), P(x + 1, fy, z + 1), P(x, fy, z + 1)], mul(base, by * f));
    if (emptyAt(nearX ? x + 1 : x - 1, y, z)) face([P(fx, y, z), P(fx, y + 1, z), P(fx, y + 1, z + 1), P(fx, y, z + 1)], mul(base, bx * f));
    if (emptyAt(x, y, z + 1)) face([P(x, y, z + 1), P(x + 1, y, z + 1), P(x + 1, y + 1, z + 1), P(x, y + 1, z + 1)], mul(mix(base, WHITE, 0.16), f));
  }
  const ec = [150, 160, 176], E = (p, q) => img.line(P(p[0], p[1], p[2]), P(q[0], q[1], q[2]), 1.3 * ss, ec, 0.55), cs = [[0, 0], [W, 0], [W, H], [0, H]], far = p => p[0] === xf && p[1] === yf;
  for (let k = 0; k < 4; k++) { const a = cs[k], b = cs[(k + 1) % 4];
    E([a[0], a[1], D], [b[0], b[1], D]);
    if (!far(a) && !far(b)) E([a[0], a[1], 0], [b[0], b[1], 0]);
    if (!far(a)) E([a[0], a[1], 0], [a[0], a[1], D]); }
  if (o.sliceZ != null) { const h = o.sliceZ + 0.5, q = [P(0, 0, h), P(W, 0, h), P(W, H, h), P(0, H, h)]; for (let i = 0; i < 4; i++) img.line(q[i], q[(i + 1) % 4], 2 * ss, WHITE, 0.85); }
  return img.down(ss);
}
function polylines(hist, w, h) { const P = hist[0].length, n = hist.length; let mx = 1; for (const r of hist) for (const v of r) if (v > mx) mx = v; mx *= 1.08;
  const pts = []; for (let p = 0; p < P; p++) pts.push(hist.map((r, i) => `${(i / (n - 1) * w).toFixed(1)},${(h - r[p] / mx * h).toFixed(1)}`).join(' ')); return { max: Math.round(mx), pts }; }

// Sphere of influence: every empty cell goes to the player whose territory is nearest (ties = contested).
function influence(g, owner, P) {
  const N = g.N, src = new Uint8Array(N), dist = new Int32Array(N).fill(-1), q = new Int32Array(N); let qh = 0, qt = 0;
  for (let c = 0; c < N; c++) { const ow = owner[c]; if (ow >= 1 && ow <= P) { src[c] = ow; dist[c] = 0; q[qt++] = c; } }
  while (qh < qt) { const c = q[qh++], s = src[c], d = dist[c] + 1; for (const n of g.nb[c]) { if (owner[n] !== 0) continue; if (dist[n] < 0) { dist[n] = d; src[n] = s; q[qt++] = n; } else if (dist[n] === d && src[n] !== s) src[n] = 255; } }
  const infl = new Array(P).fill(0); let contested = 0, unreachable = 0;
  for (let c = 0; c < N; c++) if (owner[c] === 0) { const s = src[c]; if (s >= 1 && s <= P) infl[s - 1]++; else if (s === 255) contested++; else unreachable++; }
  return { src, infl, contested, unreachable };
}
const pct = (a, tot) => a.map(c => +(100 * c / tot).toFixed(1));

/* ================= scenes ================= */
const stats = {}, T0 = Date.now();
const which = new Set(process.argv.slice(2)); const want = k => !which.size || which.has(k);

if (want('2d')) {
  const g = makeGrid(128, 72), walls = wallsQuad(g, rng32(7), 18, 22, 16);
  const bases = [g.idx(11, 9), g.idx(116, 9), g.idx(11, 62), g.idx(116, 62)];
  const ow0 = new Uint8Array(g.N); for (const w of walls) ow0[w] = 255;
  drawMap(g, ow0, { cs: 16, gap: 2, bases, baseCols: COL }).save('map_empty.png');
  for (const [name, kinds, fill] of [['C', ['bfs', 'astar', 'voronoi', 'eden'], 0.58], ['D', ['bfs', 'dfs', 'voronoi', 'eden'], 0.58], ['E', ['bfs', 'dfs', 'voronoi', 'prim'], 0.64]]) {
    const est = [], P = kinds.length;
    const r = runL1({ g, walls, bases, kinds, seed: 20261115, stopFill: fill, sample: 30, onSample: (ow, cnt) => { const f = influence(g, ow, P); est.push(cnt.map((c, i) => c + f.infl[i])); } });
    const f = influence(g, r.owner, P); est.push(r.cnt.map((c, i) => c + f.infl[i]));
    const full = runL1({ g, walls, bases, kinds, seed: 20261115, sample: 30 });
    drawMap(g, r.owner, { cs: 16, gap: 2, bases, ct: r.ct, tick: r.ticks, recent: 60, infl: f.src }).save(`map2d_${name}.png`);
    const e = r.cnt.map((c, i) => c + f.infl[i]);
    stats['map2d_' + name] = { kinds, tick: r.ticks, totalTicks: full.ticks, free: r.free, walls: walls.length, cnt: r.cnt, share: pct(r.cnt, r.free), infl: f.infl, contested: f.contested, unreachable: f.unreachable, est: e, estShare: pct(e, r.free), finalCnt: full.cnt, finalShare: pct(full.cnt, full.free), lines: polylines(est, 300, 100) };
  }
}
if (want('3d')) {
  const g = makeGrid(40, 40, 20), bases = [g.idx(1, 1, 1), g.idx(38, 38, 1), g.idx(38, 1, 18), g.idx(1, 38, 18)];
  for (const [name, kinds, fill] of [['V1', ['bfs', 'eden', 'voronoi', 'dfs'], 0.30], ['V2', ['voronoi', 'eden', 'dfs', 'bfs'], 0.30], ['V3', ['bfs', 'prim', 'voronoi', 'eden'], 0.30]]) {
    const r = runL1({ g, bases, kinds, seed: 99, stopFill: fill, sample: 50 }), full = runL1({ g, bases, kinds, seed: 99, sample: 50 }), f = influence(g, r.owner, 4);
    drawIso(g, r.owner, { s: 18, ss: 3, cols: COL, sliceZ: 9 }).save(`map3d_${name}.png`);
    drawMap(g, r.owner, { cs: 16, gap: 2, z: 9, infl: f.src }).save(`slice3d_${name}.png`);
    const e = r.cnt.map((c, i) => c + f.infl[i]);
    stats['map3d_' + name] = { kinds, tick: r.ticks, totalTicks: full.ticks, free: r.free, cnt: r.cnt, share: pct(r.cnt, r.free), infl: f.infl, contested: f.contested, est: e, estShare: pct(e, r.free), finalShare: pct(full.cnt, full.free) };
  }
}
if (want('thumb')) {
  const TH = { bfs: {}, dfs: {}, eden: {}, prim: {}, spiral: {}, scan: {}, hilbert: {}, rwalk: {}, astar: { base: [5, 30] }, greedy: { duel: 1 }, voronoi: { duel: 1 } };
  for (const k of Object.keys(TH)) {
    const g = makeGrid(36, 36), t = TH[k];
    const bases = t.duel ? [g.idx(8, 27), g.idx(27, 8)] : [t.base ? g.idx(t.base[0], t.base[1]) : g.idx(18, 18)];
    const r = runL1({ g, bases, kinds: t.duel ? [k, 'bfs'] : [k], seed: 5, maxTicks: 400 });
    drawThumb(g, r.owner, r.ct, r.ticks, 1).save(`th_${k}.png`);
  }
}
if (want('tour')) {
  const kinds = ['bfs', 'dfs', 'eden', 'prim', 'rwalk', 'spiral', 'scan', 'hilbert', 'astar', 'greedy', 'voronoi'], K = kinds.length, nSeeds = 30;
  const win = kinds.map(() => new Array(K).fill(0)), games = kinds.map(() => new Array(K).fill(0)), shareSum = new Array(K).fill(0), shareN = new Array(K).fill(0);
  let total = 0;
  for (let a = 0; a < K; a++) for (let b = a + 1; b < K; b++) for (let s = 0; s < nSeeds; s++) for (let sw = 0; sw < 2; sw++) {
    const g = makeGrid(48, 48), r = rng32(1000 + s), x = 3 + ((r() * 12) | 0), y = 3 + ((r() * 42) | 0);
    const bases = [g.idx(x, y), g.idx(47 - x, 47 - y)], walls = wallsRot(g, r, 14, bases);
    const res = runL1({ g, walls, bases, kinds: sw ? [kinds[b], kinds[a]] : [kinds[a], kinds[b]], seed: 5000 + s * 2 + sw });
    const ca = res.cnt[sw ? 1 : 0], cb = res.cnt[sw ? 0 : 1]; total++;
    if (ca > cb) win[a][b]++; else if (cb > ca) win[b][a]++; else { win[a][b] += 0.5; win[b][a] += 0.5; }
    games[a][b]++; games[b][a]++; shareSum[a] += ca / (ca + cb); shareSum[b] += cb / (ca + cb); shareN[a]++; shareN[b]++;
  }
  let p = new Array(K).fill(1);
  for (let it = 0; it < 500; it++) { const q = p.map((_, i) => { let w = 0, d = 0; for (let j = 0; j < K; j++) if (j !== i) { w += win[i][j] + 0.5; d += (games[i][j] + 1) / (p[i] + p[j]); } return w / d; });
    const gm = Math.exp(q.reduce((u, v) => u + Math.log(v), 0) / K); p = q.map(v => v / gm); }
  stats.tour = { kinds, gamesPerPair: nSeeds * 2, total, map: '48x48', winPct: win.map((row, i) => row.map((v, j) => i === j ? null : Math.round(100 * v / games[i][j]))),
    overall: kinds.map((_, i) => +(100 * win[i].reduce((u, v) => u + v, 0) / games[i].reduce((u, v) => u + v, 0)).toFixed(1)), avgShare: shareSum.map((v, i) => +(100 * v / shareN[i]).toFixed(1)), elo: p.map(v => Math.round(1500 + 400 * Math.log10(v))) };
}
if (want('l2')) {
  const g = makeGrid(96, 54), walls = wallsQuad(g, rng32(11), 12, 18, 13), bases = [g.idx(9, 7), g.idx(86, 7), g.idx(9, 46), g.idx(86, 46)], kinds = ['cutter', 'rush', 'compact', 'cheap'];
  const snaps = runL2({ g, walls, bases, kinds, seed: 4242, maxTicks: 3000, snaps: [450, 540, 555, 570, 600] });
  stats.l2 = { kinds, free: snaps[0].free, snaps: snaps.map(s => { drawMap(g, s.owner, { cs: 16, gap: 2, bases, l2: 1, chg: s.chg, cut: s.cut, tick: s.t, dead: s.alive.map(v => !v) }).save(`mapl2_${s.t}.png`);
    return { t: s.t, why: s.why, cnt: s.cnt, share: s.cnt.map(c => +(100 * c / s.free).toFixed(1)), energy: s.energy, alive: s.alive, taken: s.taken, lost: s.lost, events: s.events.slice(-12) }; }) };
}
if (want('duel')) {
  const g = makeGrid(64, 40), bases = [g.idx(7, 20), g.idx(56, 19)], walls = wallsRot(g, rng32(3), 10, bases), kinds = ['rush', 'cheap'];
  const snaps = runL2({ g, walls, bases, kinds, seed: 77, maxTicks: 2000, snaps: [150, 250, 400, 550, 700, 900, 1200, 1600] });
  stats.duel = { kinds, free: snaps[0].free, snaps: snaps.map(s => { drawMap(g, s.owner, { cs: 16, gap: 2, bases, l2: 1, chg: s.chg, cut: s.cut, tick: s.t, dead: s.alive.map(v => !v), cols: [COL[1], COL[0]] }).save(`duel_${s.t}.png`);
    return { t: s.t, why: s.why, cnt: s.cnt, share: s.cnt.map(c => +(100 * c / s.free).toFixed(1)), energy: s.energy, alive: s.alive, taken: s.taken, lost: s.lost, msPerTick: s.ms.map(v => +v.toFixed(3)), events: s.events.slice(-8) }; }) };
}
if (which.has('spin')) {
  const g = makeGrid(40, 40, 20), bases = [g.idx(1, 1, 1), g.idx(38, 38, 1), g.idx(38, 1, 18), g.idx(1, 38, 18)], kinds = ['bfs', 'eden', 'voronoi', 'dfs'];
  const r = runL1({ g, bases, kinds, seed: 99, stopFill: 0.30, sample: 50 }), N = 24; let sheet = null;
  for (let k = 0; k < N; k++) {
    const img = drawSpin(g, r.owner, { s: 17, ss: 2, cols: COL, sliceZ: 9, yaw: (-45 + k * 15) * Math.PI / 180 });
    img.save(`spin_${String(k).padStart(2, '0')}.png`);
    const sm = img.down(4); if (!sheet) sheet = new Img(sm.w * 6, sm.h * 4, BG); sheet.blit(sm, (k % 6) * sm.w, ((k / 6) | 0) * sm.h);
  }
  sheet.save('spin_sheet.png'); stats.spin = { frames: N, tick: r.ticks, cnt: r.cnt };
}
fs.writeFileSync(path.join(OUT, `stats_${[...which].join('_') || 'all'}.json`), JSON.stringify(stats, null, 1));
console.log('done in', Date.now() - T0, 'ms;', fs.readdirSync(OUT).length, 'files');
