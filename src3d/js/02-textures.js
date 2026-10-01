/* ================= procedural textures (no external assets) ================= */
function cvs(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function mkTex(c, {srgb = true, repeat = [1, 1], aniso = 8, clampEdge = false} = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = clampEdge ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = Math.min(aniso, renderer.capabilities.getMaxAnisotropy());
  return t;
}
/* tileable value-noise fBm on a gx×gy lattice, `oct` octaves, values 0..1 */
function tnoise(W, H, seed, gx, gy, oct) {
  const out = new Float32Array(W * H); let amp = 1, tot = 0;
  for (let o = 0; o < oct; o++) {
    const nx = Math.max(1, gx << o), ny = Math.max(1, gy << o), r = mulberry(seed + o * 977), g = new Float32Array(nx * ny);
    for (let i = 0; i < g.length; i++) g[i] = r();
    for (let y = 0; y < H; y++) {
      const fy = y / H * ny, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty), ya = y0 % ny, yb = (y0 + 1) % ny;
      for (let x = 0; x < W; x++) {
        const fx = x / W * nx, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx), xa = x0 % nx, xb = (x0 + 1) % nx;
        out[y * W + x] += amp * (g[ya * nx + xa] * (1 - sx) * (1 - sy) + g[ya * nx + xb] * sx * (1 - sy) + g[yb * nx + xa] * (1 - sx) * sy + g[yb * nx + xb] * sx * sy);
      }
    }
    tot += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}
function pixels(W, H, fn) {
  const c = cvs(W, H), x = c.getContext('2d'), im = x.createImageData(W, H), d = im.data;
  for (let i = 0; i < W * H; i++) { const p = fn(i % W, (i / W) | 0, i); d[i * 4] = p[0]; d[i * 4 + 1] = p[1]; d[i * 4 + 2] = p[2]; d[i * 4 + 3] = p[3] == null ? 255 : p[3]; }
  x.putImageData(im, 0, 0); return c;
}
/* normal map from a height field (Float32Array), tileable Sobel */
function normalMap(W, H, hf, strength) {
  return pixels(W, H, (x, y) => {
    const h = (a, b) => hf[((b + H) % H) * W + ((a + W) % W)];
    const dx = (h(x + 1, y) - h(x - 1, y)) * strength, dy = (h(x, y + 1) - h(x, y - 1)) * strength;
    const n = Math.hypot(dx, dy, 1);
    return [Math.round((-dx / n * 0.5 + 0.5) * 255), Math.round((dy / n * 0.5 + 0.5) * 255), Math.round((1 / n * 0.5 + 0.5) * 255)];
  });
}
const TX = {};
function buildTextures() {
  /* --- Starship stainless: ring welds every 1.83 m, staggered vertical seams, dents, brushed grain, heat tint --- */
  {
    const W = 512, H = 512, rings = 4, dents = tnoise(W, H, 11, 3, 3, 4), grain = tnoise(W, H, 12, 128, 4, 2), tint = tnoise(W, H, 13, 2, 2, 3);
    const hf = new Float32Array(W * H), seam = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, ry = y / H * rings, ring = Math.floor(ry), fy = ry - ring;
      const dh = Math.min(fy, 1 - fy) * H / rings; // px to horizontal weld
      const vx = ((ring * 0.37 + 0.13) % 1) * W, dv = Math.min(Math.abs(x - vx), W - Math.abs(x - vx));
      const s = Math.max(Math.exp(-dh * dh / 3), Math.exp(-dv * dv / 3));
      seam[i] = s;
      hf[i] = dents[i] * 1.4 + s * 0.9 + grain[i] * 0.08;
    }
    TX.steelMap = mkTex(pixels(W, H, (x, y, i) => {
      const b = 168 + (dents[i] - 0.5) * 30 + (grain[i] - 0.5) * 22 - seam[i] * 40, t = tint[i];
      return [b + 10 * t + seam[i] * 18, b + 4 * t, b - 6 * t + 8 * (1 - t) - seam[i] * 10];
    }));
    TX.steelRough = mkTex(pixels(W, H, (x, y, i) => { const r = 42 + grain[i] * 38 + seam[i] * 70 + dents[i] * 22; return [0, r, 0]; }), {srgb: false});
    TX.steelNormal = mkTex(normalMap(W, H, hf, 2.2), {srgb: false});
  }
  /* --- hexagonal heat-shield tiles (silica, pinned), slight shade variation, grout gaps --- */
  {
    const W = 512, H = 512, c = cvs(W, H), x = c.getContext('2d'), r = mulberry(5), R = 11, hh = Math.sqrt(3) * R;
    x.fillStyle = '#3b3d42'; x.fillRect(0, 0, W, H);
    const hc = cvs(W, H), hx = hc.getContext('2d'); hx.fillStyle = '#000'; hx.fillRect(0, 0, W, H);
    for (let row = -1; row * hh * 0.5 < H + hh; row++) for (let col = -1; col * R * 1.5 < W + R * 2; col++) {
      const cx = col * R * 1.5, cy = row * hh + (col % 2 ? hh / 2 : 0); const v = r();
      const g = v < 0.012 ? 120 : 18 + Math.floor(r() * 14);
      for (const [ox, oy] of [[0, 0], [W, 0], [0, H], [-W, 0], [0, -H]]) {
        x.beginPath(); hx.beginPath();
        for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3, px = cx + ox + Math.cos(a) * (R - 1.2), py = cy + oy + Math.sin(a) * (R - 1.2); k ? (x.lineTo(px, py), hx.lineTo(px, py)) : (x.moveTo(px, py), hx.moveTo(px, py)); }
        x.fillStyle = `rgb(${g},${g + 1},${g + 4})`; x.fill(); hx.fillStyle = '#fff'; hx.fill();
      }
    }
    TX.tileMap = mkTex(c);
    const hd = hx.getImageData(0, 0, W, H).data, hf = new Float32Array(W * H); for (let i = 0; i < W * H; i++) hf[i] = hd[i * 4] / 255;
    TX.tileNormal = mkTex(normalMap(W, H, hf, 1.6), {srgb: false});
  }
  /* --- carbon composite (F9 interstage, legs) --- */
  {
    const W = 256, H = 256, n = tnoise(W, H, 21, 8, 8, 3);
    TX.carbon = mkTex(pixels(W, H, (x, y, i) => { const tow = (((x >> 3) + (y >> 3)) & 1) ? 1 : 0, v = 24 + tow * 9 + n[i] * 12; return [v, v, v + 2]; }));
  }
  /* --- grid fin lattice (alpha) --- */
  {
    const c = cvs(256, 256), x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, 256, 256);
    x.strokeStyle = '#fff'; x.lineWidth = 7; x.strokeRect(4, 4, 248, 248); x.lineWidth = 3.2;
    x.save(); x.translate(128, 128); x.rotate(Math.PI / 4);
    for (let i = -10; i <= 10; i++) { x.beginPath(); x.moveTo(i * 19, -200); x.lineTo(i * 19, 200); x.stroke(); x.beginPath(); x.moveTo(-200, i * 19); x.lineTo(200, i * 19); x.stroke(); }
    x.restore(); TX.gridAlpha = mkTex(c, {srgb: false, clampEdge: true});
  }
  /* --- concrete / pad --- */
  {
    const W = 512, H = 512, a = tnoise(W, H, 31, 6, 6, 5), b = tnoise(W, H, 32, 48, 48, 2), r = mulberry(33);
    TX.concrete = mkTex(pixels(W, H, (x, y, i) => { const v = 120 + (a[i] - 0.5) * 60 + (b[i] - 0.5) * 30 - (r() > 0.995 ? 30 : 0) - ((x % 128 < 2 || y % 128 < 2) ? 25 : 0); return [v, v - 1, v - 4]; }));
  }
  /* --- painted steel (towers, buildings) with rust streaks --- */
  {
    const W = 256, H = 256, a = tnoise(W, H, 41, 4, 4, 4), st = tnoise(W, H, 42, 32, 2, 3);
    TX.paint = mkTex(pixels(W, H, (x, y, i) => { const rust = clamp((st[i] - 0.62) * 4, 0, 1) * 0.6; const v = 168 + (a[i] - 0.5) * 30; return [v - rust * 20 + rust * 30, v - rust * 50, v - rust * 80]; }));
  }
  /* --- droneship deck: dark steel, worn white ring + X, hatch lines --- */
  {
    const W = 1024, H = 576, c = cvs(W, H), x = c.getContext('2d'), n = tnoise(256, 144, 51, 8, 6, 4);
    const nc = pixels(256, 144, (a, b, i) => { const v = 52 + n[i] * 40; return [v, v + 1, v + 4]; });
    x.imageSmoothingEnabled = true; x.drawImage(nc, 0, 0, W, H);
    x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 2; for (let i = 1; i < 12; i++) { x.beginPath(); x.moveTo(i * W / 12, 0); x.lineTo(i * W / 12, H); x.stroke(); }
    x.strokeStyle = 'rgba(235,238,242,.85)'; x.lineWidth = 16; x.beginPath(); x.arc(W / 2, H / 2, H * 0.38, 0, TAU); x.stroke();
    x.lineWidth = 34; x.beginPath(); x.moveTo(W / 2 - H * 0.2, H / 2 - H * 0.2); x.lineTo(W / 2 + H * 0.2, H / 2 + H * 0.2); x.moveTo(W / 2 + H * 0.2, H / 2 - H * 0.2); x.lineTo(W / 2 - H * 0.2, H / 2 + H * 0.2); x.stroke();
    x.fillStyle = 'rgba(20,20,22,.35)'; for (let i = 0; i < 60; i++) { x.beginPath(); x.arc(W / 2 + (Math.random() - 0.5) * 300, H / 2 + (Math.random() - 0.5) * 260, 10 + Math.random() * 40, 0, TAU); x.fill(); }
    TX.deck = mkTex(c, {clampEdge: true});
  }
  /* --- landing zone pad --- */
  {
    const c = cvs(512, 512), x = c.getContext('2d'); x.drawImage(TX.concrete.image, 0, 0);
    x.strokeStyle = '#e9e6dc'; x.lineWidth = 10; x.beginPath(); x.arc(256, 256, 200, 0, TAU); x.stroke();
    x.lineWidth = 26; x.beginPath(); x.moveTo(176, 176); x.lineTo(336, 336); x.moveTo(336, 176); x.lineTo(176, 336); x.stroke();
    TX.lz = mkTex(c, {clampEdge: true});
  }
  /* --- frost (cryogenic tank frost, alpha) --- */
  {
    /* cryogenic frost: fine crystalline speckle in horizontal bands with run-down streaks */
    const W = 256, H = 256, a = tnoise(W, H, 61, 16, 3, 4), b = tnoise(W, H, 62, 96, 96, 2), c = tnoise(W, H, 63, 48, 2, 2);
    TX.frost = mkTex(pixels(W, H, (x, y, i) => { const v = clamp((a[i] - 0.38) * 1.6, 0, 1) * (0.55 + 0.45 * b[i]) + clamp((c[i] - 0.62) * 2, 0, 0.4); return [255, 255, 255, Math.round(clamp(v, 0, 1) * 255)]; }), {srgb: false});
  }
  /* --- regen-cooling tube ridges for nozzles (normal map) --- */
  {
    const W = 512, H = 16, hf = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) hf[y * W + x] = Math.abs(Math.sin(x / W * Math.PI * 96));
    TX.regenNormal = mkTex(normalMap(W, H, hf, 3), {srgb: false});
  }
  /* --- soft sprites for smoke / steam / clouds / sparks --- */
  TX.smoke = mkTex(puffCanvas(128, 7, 14, [255, 255, 255]), {clampEdge: true});
  TX.cloud = mkTex(puffCanvas(256, 9, 22, [255, 255, 255]), {clampEdge: true});
  {
    const c = cvs(64, 64), x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64); TX.spark = mkTex(c, {clampEdge: true});
  }
}
function puffCanvas(S, seed, blobs, rgbv) {
  const c = cvs(S, S), x = c.getContext('2d'), r = mulberry(seed);
  for (let i = 0; i < blobs; i++) {
    const a = r() * TAU, d = Math.pow(r(), 0.7) * S * 0.22, bx = S / 2 + Math.cos(a) * d, by = S / 2 + Math.sin(a) * d, br = S * (0.13 + r() * 0.2), al = 0.3 + r() * 0.4;
    const g = x.createRadialGradient(bx, by, 0, bx, by, br);
    g.addColorStop(0, `rgba(${rgbv},${al})`); g.addColorStop(0.55, `rgba(${rgbv},${al * 0.5})`); g.addColorStop(1, `rgba(${rgbv},0)`);
    x.fillStyle = g; x.fillRect(0, 0, S, S);
  }
  return c;
}
/* Falcon booster livery: white paint, panel lines, vertical SPACEX wordmark, soot from re-entries (more flights → darker) */
function falconBodyTex(flights, seed) {
  const W = 512, H = 2048, c = cvs(W, H), x = c.getContext('2d');
  const n = tnoise(128, 512, seed, 4, 16, 4), m = tnoise(128, 512, seed + 1, 32, 4, 2);
  const base = pixels(128, 512, (a, b, i) => { const v = 232 + (n[i] - 0.5) * 10; return [v, v + 1, v + 3]; });
  x.drawImage(base, 0, 0, W, H);
  x.strokeStyle = 'rgba(120,125,135,.35)'; x.lineWidth = 2;
  for (let i = 1; i < 14; i++) { const y = i * H / 14; x.beginPath(); x.moveTo(0, y); x.lineTo(W, y); x.stroke(); }
  x.save(); x.translate(W * 0.25, H * 0.42); x.rotate(-Math.PI / 2); x.font = '900 118px "Saira Condensed","Arial Narrow",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#1f2533'; x.fillText('SPACEX', 0, 0); x.restore();
  x.save(); x.translate(W * 0.75, H * 0.62); x.rotate(-Math.PI / 2); x.font = '700 52px "Saira Condensed","Arial Narrow",sans-serif'; x.textAlign = 'center'; x.fillStyle = '#2b3242'; x.fillText('FALCON 9', 0, 0); x.restore();
  const k = clamp(flights / 18, 0, 1);
  if (k > 0) {
    const soot = pixels(128, 512, (a, b, i) => {
      const yb = b / 512, fromBottom = Math.exp(-yb * 3.2), streak = clamp((m[i] - 0.35) * 2.2, 0, 1), side = 0.55 + 0.45 * Math.sin(a / 128 * TAU + 1);
      const al = clamp((fromBottom * 0.9 + streak * 0.6 * side) * k * (0.6 + n[i] * 0.8), 0, 0.92);
      return [38, 33, 30, Math.round(al * 255)];
    });
    x.drawImage(soot, 0, 0, W, H);
  }
  return mkTex(c);
}
function wordTex(text, W, H, color, bg, font) {
  const c = cvs(W, H), x = c.getContext('2d'); x.fillStyle = bg; x.fillRect(0, 0, W, H);
  x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = color; x.fillText(text, W / 2, H / 2);
  return mkTex(c);
}
