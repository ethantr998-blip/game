/* ================= UI: config panels, engine inspector, webcast HUD, results ================= */
const binders = [];
const bind = f => (binders.push(f), f);
function refreshPanels() { binders.forEach(f => f()); }
let uid = 0;
function grp(title, de, kids) { const g = el('div', 'grp'); g.append(el('h3', null, title + (de ? ` <em>${de}</em>` : ''))); kids.forEach(k => k && g.append(k)); return g; }
function head(t, p) { const h = el('div', 'ph'); h.append(el('h2', null, t)); if (p) h.append(el('p', null, p)); return h; }
function seg(label, get, set, opts) {
  const w = el('div', 'ctl'); if (label) w.append(el('div', 'lab', label));
  const g = el('div', 'seg'); g.setAttribute('role', 'group'); w.append(g);
  let sig = '';
  /* options can depend on the chosen vehicle: rebuild the buttons whenever the list changes */
  bind(() => {
    const list = opts(), s = list.map(o => o[0] + ':' + o[1]).join('|');
    if (s !== sig) { sig = s; g.innerHTML = ''; list.forEach(o => { const b = el('button', null, o[1]); b.type = 'button'; b.dataset.v = o[0]; b.onclick = () => { if (!b.disabled) set(o[0]); }; g.append(b); }); }
    const cur = String(get()); g.querySelectorAll('button').forEach((b, i) => { const on = b.dataset.v === cur; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); b.disabled = !!(list[i] && list[i][2]); });
  });
  return w;
}
function slider(label, get, set, min, max, step, fmtf) {
  const id = 's' + (++uid), w = el('div', 'ctl'), top = el('div', 'row'), lab = el('label', null, label), out = el('output');
  lab.htmlFor = id; top.append(lab, out);
  const inp = el('input'); inp.type = 'range'; inp.id = id; inp.min = min; inp.max = max; inp.step = step;
  inp.oninput = () => set(+inp.value);
  w.append(top, inp);
  bind(() => { const hi = typeof max === 'function' ? max() : max; inp.max = hi; const v = Math.min(get(), hi); if (document.activeElement !== inp) inp.value = v; out.textContent = fmtf(v); inp.style.setProperty('--p', ((v - min) / (hi - min) * 100) + '%'); });
  return w;
}
function kvBox(items) { const b = el('div', 'kv'); bind(() => { b.innerHTML = items().map(([k, v]) => `<div><span>${k}</span><strong>${v}</strong></div>`).join(''); }); return b; }
function tipBox(fn) { const b = el('div', 'tip'); bind(() => { const [html, lvl] = fn(); b.className = 'tip' + (lvl ? ' ' + lvl : ''); b.innerHTML = html; b.hidden = !html; }); return b; }
/* ---------- engine map (top view of the cluster) ---------- */
function drawEngineMap(c, stage, opts = {}) {
  if (!c || !stage) return;
  const dp = Math.min(2, devicePixelRatio || 1), W = c.clientWidth || 86, H = c.clientHeight || 86;
  if (c.width !== Math.round(W * dp)) { c.width = Math.round(W * dp); c.height = Math.round(H * dp); }
  const x = c.getContext('2d'); x.setTransform(dp, 0, 0, dp, 0, 0); x.clearRect(0, 0, W, H);
  const R = stage.R, sc = (Math.min(W, H) / 2 - 3) / (R * 1.04), cx = W / 2, cy = H / 2;
  x.strokeStyle = opts.hud ? 'rgba(255,255,255,.35)' : '#25304d'; x.lineWidth = 1.2; x.beginPath(); x.arc(cx, cy, R * sc, 0, TAU); x.stroke();
  for (const e of stage.engines) {
    const px = cx + e.x * sc, py = cy - e.z * sc, r = e.spec.re * sc * 0.92;
    const sel = opts.sel === e, hov = opts.hover === e;
    x.beginPath(); x.arc(px, py, r, 0, TAU);
    if (e.failed) { x.fillStyle = '#ff6159'; x.fill(); x.strokeStyle = '#2a0805'; x.lineWidth = 1.4; x.beginPath(); x.moveTo(px - r * 0.6, py - r * 0.6); x.lineTo(px + r * 0.6, py + r * 0.6); x.moveTo(px + r * 0.6, py - r * 0.6); x.lineTo(px - r * 0.6, py + r * 0.6); x.stroke(); }
    else if (e.disabled) { x.fillStyle = opts.hud ? 'rgba(255,255,255,.08)' : '#151c31'; x.fill(); x.setLineDash([2, 2]); x.strokeStyle = '#8f9bbb'; x.lineWidth = 1; x.stroke(); x.setLineDash([]); }
    else if (e.lit) { const k = clamp(e.thr, 0, 1); x.fillStyle = e.state === 'startup' ? '#ffc94a' : `rgba(255,${Math.round(235 + 20 * k)},${Math.round(200 + 55 * k)},${0.55 + 0.45 * k})`; x.fill(); }
    else { x.fillStyle = opts.hud ? 'rgba(255,255,255,.06)' : '#151c31'; x.fill(); x.strokeStyle = opts.hud ? 'rgba(255,255,255,.55)' : '#5b6789'; x.lineWidth = 1; x.stroke(); }
    if (!opts.hud && !e.failed && !e.disabled && e.tested && e.health < 0.8) { x.strokeStyle = '#ffc94a'; x.lineWidth = 2; x.beginPath(); x.arc(px, py, r + 1.5, 0, TAU); x.stroke(); }
    if (sel || hov) { x.strokeStyle = sel ? '#6cd4e8' : 'rgba(108,212,232,.6)'; x.lineWidth = 2.2; x.beginPath(); x.arc(px, py, r + 2.5, 0, TAU); x.stroke(); }
  }
}
function engineAt(c, stage, ev) {
  const r = c.getBoundingClientRect(), W = r.width, H = r.height, sc = (Math.min(W, H) / 2 - 3) / (stage.R * 1.04);
  const mx = ev.clientX - r.left - W / 2, my = ev.clientY - r.top - H / 2;
  let best = null, bd = 1e9;
  for (const e of stage.engines) { const d = Math.hypot(mx - e.x * sc, my + e.z * sc); if (d < e.spec.re * sc * 1.1 && d < bd) { bd = d; best = e; } }
  return best;
}
/* ---------- planned trajectory plot (downrange vs altitude) ---------- */
function drawPlan(c, trace) {
  if (!c) return; const dp = Math.min(2, devicePixelRatio || 1), W = c.clientWidth, H = c.clientHeight; if (!W) return;
  c.width = W * dp; c.height = H * dp; const x = c.getContext('2d'); x.setTransform(dp, 0, 0, dp, 0, 0);
  x.fillStyle = '#151c31'; x.fillRect(0, 0, W, H);
  if (!trace || !trace.length) { x.fillStyle = '#8f9bbb'; x.font = '12px "Be Vietnam Pro",sans-serif'; x.fillText('Đang tính quỹ đạo…', 12, 20); return; }
  let sMin = 0, sMax = 1, hMax = 1; for (const p of trace) { sMin = Math.min(sMin, p[2]); sMax = Math.max(sMax, p[2]); hMax = Math.max(hMax, p[3]); }
  const l = 38, r = 10, t = 14, b = 22, X = s => l + (s - sMin) / (sMax - sMin) * (W - l - r), Y = h => H - b - h / hMax * (H - t - b);
  x.strokeStyle = 'rgba(255,255,255,.07)'; x.lineWidth = 1; x.font = '500 10px "JetBrains Mono",monospace'; x.fillStyle = '#8f9bbb';
  for (let i = 0; i <= 4; i++) { const h = hMax * i / 4, y = Y(h); x.beginPath(); x.moveTo(l, y); x.lineTo(W - r, y); x.stroke(); x.textAlign = 'right'; x.fillText(fmt(h / 1000) + '', l - 4, y + 3); }
  x.textAlign = 'left'; x.fillText('km', 4, 10); x.textAlign = 'right'; x.fillText(fmt(sMax / 1000) + ' km ngang', W - r, H - 6);
  const cols = {stack: '#e9edf6', booster: '#ffad38', upper: '#6cd4e8'};
  for (const id of ['stack', 'booster', 'upper']) {
    const pts = trace.filter(p => p[1] === id); if (pts.length < 2) continue;
    x.strokeStyle = cols[id]; x.lineWidth = 1.8; x.beginPath(); pts.forEach((p, i) => i ? x.lineTo(X(p[2]), Y(p[3])) : x.moveTo(X(p[2]), Y(p[3]))); x.stroke();
  }
  x.fillStyle = '#ffad38'; x.fillRect(X(0) - 2, Y(0) - 6, 4, 6);
}
/* ---------- mission clock timeline ---------- */
function drawTimeline(c, f) {
  const dp = Math.min(2, devicePixelRatio || 1), W = c.clientWidth, H = c.clientHeight; if (!W) return;
  if (c.width !== Math.round(W * dp)) { c.width = Math.round(W * dp); c.height = Math.round(H * dp); }
  const x = c.getContext('2d'); x.setTransform(dp, 0, 0, dp, 0, 0); x.clearRect(0, 0, W, H);
  const span = 600, t = f.t, t0 = clamp(t - 120, -15, Infinity), X = tt => 6 + (tt - t0) / span * (W - 12), y = 10;
  x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 2; x.beginPath(); x.moveTo(6, y); x.lineTo(W - 6, y); x.stroke();
  x.strokeStyle = '#fff'; x.beginPath(); x.moveTo(6, y); x.lineTo(X(t), y); x.stroke();
  const evs = (G.plan && G.plan.events || []).map(e => ({t: e.t, n: e.n, done: f.log.some(l => l.type === e.type)}));
  x.font = '600 9px "Be Vietnam Pro",sans-serif'; x.textAlign = 'center';
  let lastLab = -1e9;
  for (const e of evs) {
    const px = X(e.t); if (px < 0 || px > W) continue;
    x.beginPath(); x.arc(px, y, 4, 0, TAU); x.fillStyle = e.done ? '#fff' : '#070a12'; x.fill(); x.strokeStyle = '#fff'; x.lineWidth = 1.5; x.stroke();
    const w = x.measureText(e.n).width; if (px - w / 2 < lastLab + 4) continue; lastLab = px + w / 2;
    x.fillStyle = 'rgba(255,255,255,.75)'; x.fillText(e.n, px, y + 17);
  }
  x.fillStyle = '#ffad38'; x.beginPath(); x.arc(X(t), y, 3, 0, TAU); x.fill();
}
/* ---------- missions ---------- */
const MISSIONS = [
  {id: 'orbit', n: 'Vào quỹ đạo', d: 'Đưa tầng trên lên quỹ đạo có cận điểm trên 120 km'},
  {id: 'catch', n: 'Đũa bắt booster', d: 'Starship: Mechazilla bắt Super Heavy trên không'},
  {id: 'asds', n: 'Hạ cánh giữa biển', d: 'Falcon 9: tầng 1 đáp xuống sà lan tự hành'},
  {id: 'rtls', n: 'Quay về bãi phóng', d: 'Falcon 9: tầng 1 bay ngược về LZ và hạ cánh'},
  {id: 'manual', n: 'Tay lái vàng', d: 'Tự lái booster hạ cánh hoặc vào đũa thành công'},
  {id: 'engineout', n: 'Vượt qua hỏng động cơ', d: 'Vẫn vào quỹ đạo dù có động cơ hỏng khi đang bay'},
  {id: 'static', n: 'Thử nổ tĩnh', d: 'Chạy thử động cơ trên bệ để tìm chiếc yếu'},
  {id: 'twilight', n: 'Sứa hoàng hôn', d: 'Phóng lúc bình minh hoặc hoàng hôn để thấy khí xả phát sáng trên cao'},
  {id: 'reuse20', n: 'Booster 20 chuyến', d: 'Falcon 9: hạ cánh thành công booster đã bay từ 20 lần'}
];
let doneMissions = new Set(store.get('missions', []));
function award(id) { if (doneMissions.has(id)) return false; doneMissions.add(id); store.set('missions', [...doneMissions]); toast('Hoàn thành nhiệm vụ: ' + MISSIONS.find(m => m.id === id).n, 'good'); return true; }
function missionsList(fresh = []) { const ul = el('ul', 'missions'); ul.innerHTML = MISSIONS.map(m => `<li class="${doneMissions.has(m.id) ? 'done' : ''} ${fresh.includes(m.id) ? 'new' : ''}"><i></i><div>${m.n}<small>${m.d}</small></div></li>`).join(''); return ul; }
/* ---------- panels ---------- */
function buildPanels() {
  const C = G.cfg;
  /* 1 — vehicle */
  {
    const p = $('[data-panel=vehicle]');
    p.append(head('Chọn tên lửa', 'Thông số lấy từ phương tiện thật. Kéo để xoay, cuộn để phóng to.'));
    const cards = el('div', 'vcards');
    Object.entries(VEHICLES).forEach(([k, V]) => {
      const b = el('button', 'vcard', `<b>${V.name.toUpperCase()}</b><small>${k === 'starship' ? '124 m · 39 Raptor' : '70 m · 10 Merlin'}</small><small>${SITEINFO[V.site].name}</small>`); b.type = 'button';
      b.onclick = () => setVehicle(k); bind(() => b.classList.toggle('on', C.vehicle === k)); cards.append(b);
    });
    p.append(cards);
    p.append(tipBox(() => [VEHICLES[C.vehicle].blurb]));
    const blk = seg('Phiên bản', () => C.block, v => { C.block = v; saveCfg(); rebuildVehicle(); }, () => Object.entries(VEHICLES[C.vehicle].blocks).map(([k, b]) => [k, b.name]));
    p.append(grp('Cấu hình', 'Konfiguration', [blk,
      bind && (() => { const w = slider('Booster đã bay', () => C.flights, v => { C.flights = v; saveCfg(); rebuildVehicleSoon(); }, 0, 30, 1, v => v ? v + ' chuyến · muội than dày ' + Math.round(clamp(v / 18, 0, 1) * 100) + '%' : 'Booster mới'); bind(() => { w.hidden = C.vehicle !== 'falcon9'; }); return w; })()
    ]));
    p.append(grp('Thông số', 'Specs', [kvBox(() => vehicleSpecs())]));
  }
  /* 2 — engines */
  {
    const p = $('[data-panel=engines]');
    p.append(head('Kiểm tra động cơ', 'Mỗi động cơ là một chiếc riêng: số serial, số lần bay, độ bền. Bấm vào động cơ trên mô hình hoặc trên sơ đồ.'));
    const st = seg('Tầng', () => G.engStage, v => { G.engStage = +v; G.sel = null; refreshPanels(); focusEngineCam(); }, () => G.veh ? G.veh.stages.map((s, i) => [i, s.name]) : []);
    const map = el('canvas', 'emap'); map.id = 'emapCv';
    map.onclick = ev => { const s = G.veh.stages[G.engStage], e = engineAt(map, s, ev); if (e) selectEngine(e); };
    map.onmousemove = ev => { const s = G.veh.stages[G.engStage]; G.hoverMap = engineAt(map, s, ev); drawEngineMap(map, s, {sel: G.sel, hover: G.hoverMap}); };
    bind(() => { if (G.veh) drawEngineMap(map, G.veh.stages[G.engStage], {sel: G.sel}); });
    const info = el('div', 'einfo');
    bind(() => {
      const e = G.sel;
      if (!e) { const s = G.veh && G.veh.stages[G.engStage]; info.innerHTML = s ? `<div class="note">${s.engines.length} × ${[...new Set(s.engines.map(x => x.spec.name))].join(' + ')}. ${G.staticDone ? 'Vòng vàng: động cơ yếu phát hiện qua thử nổ tĩnh.' : 'Độ bền thật chỉ biết sau khi thử nổ tĩnh.'}</div>` : ''; return; }
      const s = e.spec, hp = e.tested ? Math.round(e.health * 100) + '%' : '? · cần thử nổ tĩnh', lv = e.failed ? 'crit' : e.disabled ? 'warn' : (e.tested && e.health < 0.8 ? 'warn' : 'good');
      const ringName = {center: 'Tâm', inner: 'Vòng trong', outer: 'Vòng ngoài (cố định)', ring: 'Vòng octaweb', vac: 'Chân không'}[e.ring];
      info.innerHTML = `<h4>${e.serial}<span class="pill ${lv}">${e.statusText()}</span></h4>
        <div class="kv"><div><span>Loại</span><strong>${s.name}</strong></div><div><span>Vị trí</span><strong>${ringName}</strong></div>
        <div><span>Lực đẩy mặt biển / chân không</span><strong>${fmt(s.Fsl / 9806.65)} / ${fmt(s.Fvac / 9806.65)} tf</strong></div><div><span>Isp</span><strong>${s.IspSl} / ${s.IspVac} s</strong></div>
        <div><span>Áp suất buồng đốt</span><strong>${s.pc} bar</strong></div><div><span>Gimbal</span><strong>${e.canGimbal ? '±' + fmt(s.gimbal / DEG) + '°' : 'Cố định'}</strong></div>
        <div><span>Đã bay</span><strong>${e.flights} chuyến</strong></div><div><span>Độ bền</span><strong>${hp}</strong></div></div>`;
    });
    const acts = el('div', 'btns');
    const bOut = el('button', 'btn'); bOut.type = 'button'; bOut.onclick = () => { if (G.sel) { G.sel.disabled = !G.sel.disabled; G.sel.failed = false; G.sel.state = 'off'; planSoon(); refreshPanels(); } };
    const bNew = el('button', 'btn'); bNew.type = 'button'; bNew.textContent = 'Thay động cơ mới'; bNew.onclick = () => { if (G.sel) replaceEngine(G.sel); };
    bind(() => { bOut.disabled = bNew.disabled = !G.sel || G.busy; bOut.textContent = G.sel && G.sel.disabled ? 'Đưa vào lại' : 'Loại khỏi chuyến bay'; });
    acts.append(bOut, bNew);
    const tests = el('div', 'btns');
    const bFire = el('button', 'btn pri'); bFire.type = 'button'; bFire.textContent = 'Thử nổ tĩnh'; bFire.onclick = () => staticFire();
    const bGim = el('button', 'btn'); bGim.type = 'button'; bGim.textContent = 'Thử gimbal'; bGim.onclick = () => gimbalTest();
    bind(() => { bFire.disabled = bGim.disabled = !!G.busy; });
    tests.append(bFire, bGim);
    p.append(grp('Sơ đồ đáy', 'Engine map', [st, map, info, acts]));
    p.append(grp('Kiểm tra trên bệ', 'Static fire', [el('div', 'note', 'Đốt toàn bộ động cơ 5 giây khi tên lửa còn bị kẹp giữ. Động cơ yếu có thể tự tắt, lộ ra để bạn thay trước khi bay.'), tests, tipBox(() => [G.staticMsg || '', G.staticLvl || ''])]));
  }
  /* 3 — mission */
  {
    const p = $('[data-panel=mission]');
    p.append(head('Kế hoạch bay', 'Máy tính lập quỹ đạo theo cấu hình: góc nghiêng ban đầu, thời điểm MECO, vị trí sà lan.'));
    p.append(grp('Thu hồi tầng 1', 'Recovery', [seg(null, () => C.recovery, v => { C.recovery = v; if (C.vehicle === 'falcon9') C.payload = v === 'rtls' ? 8000 : v === 'expend' ? 22000 : 16500; saveCfg(); planSoon(); }, () => Object.entries(VEHICLES[C.vehicle].recoveries))]));
    p.append(grp('Hàng hoá & quỹ đạo', 'Payload', [
      slider('Khối lượng hàng', () => C.payload / 1000, v => { C.payload = v * 1000; saveCfg(); planSoon(); }, 0, () => G.cfg.vehicle === 'starship' ? 100 : 23, 0.5, v => fmt(v, 1) + ' t'),
      slider('Quỹ đạo mục tiêu', () => C.orbitH / 1000, v => { C.orbitH = v * 1000; saveCfg(); planSoon(); }, 160, 400, 5, v => fmt(v) + ' km tròn')
    ]));
    p.append(grp('Bầu trời & thời tiết', 'Wetter', [
      seg('Thời điểm phóng', () => C.tod, v => { C.tod = v; saveCfg(); applyEnvironment(); }, () => Object.entries(TOD).map(([k, o]) => [k, o.n])),
      slider('Gió mặt đất', () => C.wind, v => { C.wind = v; saveCfg(); }, 0, 15, 0.5, v => fmt(v, 1) + ' m/s' + (v > 12 ? ' · vượt giới hạn' : '')),
      slider('Mây', () => C.clouds, v => { C.clouds = v; saveCfg(); cloudsSoon(); }, 0, 1, 0.05, v => Math.round(v * 100) + '%')
    ]));
    const chk = (label, key) => { const l = el('label', 'row'); l.style.cursor = 'pointer'; const c = el('input'); c.type = 'checkbox'; c.id = 'ck-' + key; c.style.accentColor = '#ffad38'; c.onchange = () => { C[key] = c.checked; saveCfg(); }; l.append(el('span', null, label), c); bind(() => { c.checked = !!C[key]; }); return l; };
    p.append(grp('Độ khó', 'Realismus', [chk('Hỏng động cơ ngẫu nhiên (theo độ bền)', 'failures'), chk('Tự lái booster khi hạ cánh', 'manual')]));
    const plot = el('canvas', 'plan'); plot.id = 'planCv'; bind(() => requestAnimationFrame(() => drawPlan(plot, G.plan && G.plan.trace)));
    p.append(grp('Dự báo', 'Flugplan', [plot, kvBox(() => planSummary()), tipBox(() => planWarning())]));
  }
  /* 4 — launch */
  {
    const p = $('[data-panel=launch]');
    p.append(head('Bệ phóng', 'Giám đốc phóng hỏi GO/NO-GO từng bộ phận. Tất cả GO thì bấm PHÓNG.'));
    const ul = el('ul', 'poll');
    bind(() => { ul.innerHTML = pollItems().map(([n, ok, why]) => `<li class="${ok ? 'go' : 'nogo'}"><span>${n}${why ? `<br><small class="note">${why}</small>` : ''}</span><b>${ok ? 'GO' : 'NO-GO'}</b></li>`).join(''); });
    const go = el('button', 'go', 'PHÓNG'); go.type = 'button'; go.onclick = () => startCountdown();
    bind(() => { go.disabled = !pollItems().every(i => i[1]) || !G.plan || G.busy; });
    p.append(grp('Hỏi trạng thái', 'Go/No-Go poll', [ul]), go, el('div', 'note', 'Phím: <kbd>Space</kbd> phóng / tua nhanh · <kbd>C</kbd> đổi camera · <kbd>B</kbd>/<kbd>U</kbd> theo booster / tầng trên · <kbd>Esc</kbd> hủy trước T−0'));
    const ms = el('div'); bind(() => { ms.innerHTML = ''; ms.append(missionsList()); });
    p.append(grp('Nhiệm vụ', 'Missionen', [ms]));
  }
}
function vehicleSpecs() {
  const v = G.veh; if (!v) return [];
  let m = G.cfg.payload, F = 0;
  v.stages.forEach(s => { m += s.mass; });
  const s0 = v.stages[0]; s0.engines.forEach(e => { if (!e.disabled) F += e.F(P0); });
  const n = v.stages.map(s => s.engines.length).join(' + ');
  return [['Chiều cao', fmt(v.B.height, 1) + ' m'], ['Đường kính', fmt(s0.dia, 2) + ' m'], ['Khối lượng cất cánh', fmt(m / 1000) + ' t'], ['Lực đẩy cất cánh', fmt(F / 9806.65) + ' tf'],
    ['Động cơ', n], ['Tỉ số đẩy / nặng', fmt(F / (m * G0), 2)]];
}
function planSummary() {
  const P = G.plan; if (!P) return [['Trạng thái', 'đang tính…']];
  if (P.scrub) return [['Trạng thái', 'Không thể cất cánh']];
  const o = P.orbit, sec = P.events.find(e => e.type === 'seco'), lt = P.events.find(e => ['catch', 'landed'].includes(e.type));
  return [['Góc nghiêng ban đầu', fmt(P.kick, 1) + '°'], ['MECO', P.meco != null ? tClock(P.meco).slice(3) : '—'], ['SECO', sec ? tClock(sec.t).slice(3) : '—'],
    ['Quỹ đạo dự kiến', o ? fmt(o.peri / 1000) + ' × ' + fmt(Math.min(o.apo, 99999e3) / 1000) + ' km' : '—'],
    ['Thu hồi', G.cfg.recovery === 'expend' ? 'Không thu hồi' : lt ? lt.n + ' ' + tClock(lt.t).slice(3) : 'Rủi ro cao'],
    ['Sà lan cách bệ', G.cfg.recovery === 'asds' && P.landTarget ? fmt(P.landTarget / 1000) + ' km' : '—']];
}
function planWarning() {
  const P = G.plan; if (!P) return ['', ''];
  if (P.scrub) return ['<b>Không đủ lực đẩy để rời bệ.</b> Giảm khối lượng hàng hoặc đưa động cơ trở lại.', 'crit'];
  if (!P.orbit || P.orbit.peri < 120000) return ['<b>Tầng trên không đủ tốc độ vào quỹ đạo.</b> Giảm khối lượng hàng hoặc hạ độ cao quỹ đạo.', 'warn'];
  if (G.cfg.recovery !== 'expend' && !P.events.some(e => ['catch', 'landed'].includes(e.type))) return ['<b>Booster không còn đủ nhiên liệu để hạ cánh an toàn</b> theo mô phỏng trước.', 'warn'];
  return ['Mô phỏng trước cho thấy chuyến bay khả thi. Thực tế còn phụ thuộc hỏng hóc ngẫu nhiên và tay lái của bạn.', ''];
}
function pollItems() {
  const C = G.cfg, v = G.veh; if (!v) return [];
  const s0 = v.stages[0], out = s0.engines.filter(e => e.disabled || e.failed).length, tw = (() => { let m = C.payload, F = 0; v.stages.forEach(s => m += s.mass); s0.engines.forEach(e => { if (!e.disabled && !e.failed) F += e.F(P0); }); return F / (m * G0); })();
  const lim = C.vehicle === 'starship' ? 3 : 0;
  return [
    ['Thời tiết', C.wind <= 12, C.wind > 12 ? 'Gió mặt đất vượt 12 m/s' : ''],
    ['Động cơ tầng 1', out <= lim && tw > 1.1, out > lim ? `${out} động cơ không sẵn sàng (cho phép ${lim})` : tw <= 1.1 ? 'Tỉ số đẩy/nặng quá thấp' : ''],
    ['Nạp nhiên liệu', true, ''],
    ['Dẫn đường', !!G.plan && !G.plan.scrub, !G.plan ? 'Đang lập kế hoạch' : G.plan.scrub ? 'Không có quỹ đạo khả thi' : ''],
    ['Vùng an toàn', true, ''],
    [C.recovery === 'catch' ? 'Tháp bắt booster' : C.recovery === 'asds' ? 'Sà lan tại vị trí' : C.recovery === 'rtls' ? 'Bãi LZ' : 'Thu hồi', true, '']
  ];
}
/* ---------- HUD ---------- */
const HUD = {last: 0};
function updateHUD(f) {
  const t = f.t;
  $('#tclock').textContent = tClock(t);
  const b1 = f.booster, b2 = f.upper && f.upper.id === 'upper' ? f.upper : null, s1 = b1 && b1.stage;
  const fill = (n, b, stage, sel) => {
    if (!b || !stage) { $('#v' + n).textContent = '—'; $('#h' + n).textContent = '—'; return; }
    const rv = b.fixed ? {v: 0} : b.vRel();
    $('#v' + n).textContent = fmt(rv.v * 3.6); $('#h' + n).textContent = fmt(Math.max(0, b.h - (b.fixed && f.released === false ? b.h : 0)) / 1000, b.h < 10000 ? 2 : 1);
    const lox = stage.prop * stage.def.lox / (stage.propMax * stage.def.lox), fu = lox;
    $('#lox' + n).style.width = clamp(lox * 100, 0, 100) + '%'; $('#fuel' + n).style.width = clamp(fu * 100, 0, 100) + '%';
    $('#f' + n + 'lab').textContent = stage.def.kind.startsWith('f9') ? 'RP-1' : 'CH4';
    $('#s' + n).textContent = phaseName(b);
  };
  const st2 = b2 ? b2.stage : (G.veh && G.veh.stages[1]);
  fill(1, b1, s1); fill(2, b2 || (f.stack ? f.stack : null), st2);
  $('#n1').textContent = s1 ? s1.name : ''; $('#n2').textContent = st2 ? st2.name : '';
  if (s1) drawEngineMap($('#map1'), s1, {hud: true});
  if (st2) drawEngineMap($('#map2'), st2, {hud: true});
  drawTimeline($('#tl'), f);
  const fb = focusBody(); if (fb) {
    const rv = fb.fixed ? {v: 0} : fb.vRel(), thr = fb.stage ? fb.stage.engines.filter(e => e.running) : [];
    $('#hPhase').textContent = phaseName(fb);
    $('#hData').innerHTML = `<span>Q <b>${fmt(fb.q / 1000, 1)}</b> kPa</span><span>M <b>${fmt(fb.mach, 2)}</b></span><span>G <b>${fmt(fb.acc / G0, 1)}</b></span><span>ĐC <b>${thr.length}</b></span><span>GA <b>${thr.length ? Math.round(thr.reduce((a, e) => a + e.thr, 0) / thr.length * 100) : 0}%</b></span><span>×<b>${G.warp}</b></span>`;
  }
  updateManualHUD(f);
}
function phaseName(b) {
  const P = {pad: 'TRÊN BỆ', ascent: 'TĂNG TỐC', stage: 'TÁCH TẦNG', orbit: 'ĐỐT VÀO QUỸ ĐẠO', coastUp: 'CHỜ ĐÁNH LỬA', coastOrbit: 'TRÊN QUỸ ĐẠO', sep: 'TÁCH TẦNG', flip: 'LẬT ĐẦU', boostback: 'BOOSTBACK', coast: 'BAY QUÁN TÍNH', aero: 'RƠI · VÂY LƯỚI LÁI', entry: 'ENTRY BURN', landing: 'LANDING BURN', caught: 'ĐÃ BẮT', landed: 'ĐÃ HẠ CÁNH', crashed: 'MẤT PHƯƠNG TIỆN', ballistic: 'RƠI TỰ DO', debris: 'MẢNH VỠ'};
  return P[b.phase] || b.phase.toUpperCase();
}
function updateManualHUD(f) {
  const b = f.booster, on = !!(G.cfg.manual && b && b.id === 'booster' && b.phase === 'landing');
  $('#manual').hidden = !on; if (!on) return;
  b.manual = true;
  const rv = b.vRel(), hT = b.h - f.landAlt(), e = f.efX(b) - f.landS(b);
  $('#mThr').textContent = Math.round(G.man.thr * 100) + '%'; $('#gThr').style.width = G.man.thr * 100 + '%'; $('#gThrAp').style.left = clamp(b.autoThr || 0, 0, 1) * 100 + '%';
  $('#mTilt').textContent = fmt(G.man.tilt / DEG, 1) + '°'; $('#gTilt').style.left = '50%'; $('#gTilt').style.width = '0';
  const tl = clamp(G.man.tilt / (15 * DEG), -1, 1); $('#gTilt').style.left = (50 + Math.min(0, tl) * 50) + '%'; $('#gTilt').style.width = Math.abs(tl) * 50 + '%'; $('#gTiltAp').style.left = (50 + clamp((b.autoTilt || 0) / (15 * DEG), -1, 1) * 50) + '%';
  $('#mVy').textContent = fmt(rv.vy, 1) + ' m/s'; $('#mH').textContent = fmt(Math.max(0, hT), 0) + ' m'; $('#mDx').textContent = fmt(e, 1) + ' m';
}
/* ---------- callouts ---------- */
let calloutT = 0;
function callout(big, small) { const c = $('#callout'); c.innerHTML = big + (small ? `<small>${small}</small>` : ''); c.style.opacity = 1; calloutT = 3.2; }
function tickCallout(dt) { if (calloutT > 0) { calloutT -= dt; if (calloutT <= 0) $('#callout').style.opacity = 0; } }
/* ---------- results ---------- */
function showResult() {
  const f = G.flight, C = G.cfg, p = $('[data-panel=result]'); p.innerHTML = '';
  const up = f.upper && f.upper.id === 'upper' ? f.upper : null, bo = f.booster && f.booster.id === 'booster' ? f.booster : null;
  const orbitOk = up && up.outcome === 'orbit', recOk = bo && ['caught', 'landed'].includes(bo.outcome), failsInFlight = f.log.filter(e => (e.type === 'fail' || e.type === 'rud') && e.t > 0).length;
  const fresh = [];
  if (orbitOk && award('orbit')) fresh.push('orbit');
  if (recOk && C.recovery === 'catch' && award('catch')) fresh.push('catch');
  if (recOk && C.recovery === 'asds' && award('asds')) fresh.push('asds');
  if (recOk && C.recovery === 'rtls' && award('rtls')) fresh.push('rtls');
  if (recOk && G.manualUsed && award('manual')) fresh.push('manual');
  if (orbitOk && failsInFlight && award('engineout')) fresh.push('engineout');
  if ((C.tod === 'dusk' || C.tod === 'dawn') && f.released && !f.scrub && award('twilight')) fresh.push('twilight');
  if (recOk && C.vehicle === 'falcon9' && C.flights >= 20 && award('reuse20')) fresh.push('reuse20');
  let score = 0;
  if (orbitOk) score += 400 + Math.round(200 * Math.exp(-Math.abs(up.orbit.peri - C.orbitH) / 40000));
  if (recOk) { const le = f.log.find(e => e.type === 'catch' || e.type === 'landed'); score += 350 + Math.round(150 * Math.exp(-Math.abs(le && le.extra ? le.extra.err : 10) / 5)) + (G.manualUsed ? 150 : 0); }
  score += failsInFlight && orbitOk ? 150 : 0; if (f.scrub) score = 0;
  const best = store.get('best', 0); if (score > best) store.set('best', score);
  const title = f.scrub ? 'Hủy phóng' : orbitOk && (recOk || C.recovery === 'expend') ? 'Nhiệm vụ thành công' : orbitOk ? 'Vào quỹ đạo, mất booster' : 'Nhiệm vụ thất bại';
  const lvl = f.scrub ? 'warn' : orbitOk && (recOk || C.recovery === 'expend') ? 'good' : orbitOk ? 'warn' : 'crit';
  p.append(head(title, f.scrub || ''));
  p.firstChild.prepend(el('span', 'pill ' + lvl, lvl === 'good' ? 'Thành công' : lvl === 'warn' ? 'Một phần' : 'Thất bại'));
  p.append(el('div', 'score', fmt(score) + '<small>ĐIỂM' + (score > best ? ' · KỶ LỤC MỚI' : '') + '</small>'));
  const mq = f.log.find(e => e.type === 'maxq'), meco = f.log.find(e => e.type === 'meco'), seco = f.log.find(e => e.type === 'seco'), le = f.log.find(e => ['catch', 'landed', 'crash', 'splash', 'miss'].includes(e.type) && e.body === 'booster');
  const kv = el('div', 'kv'); kv.innerHTML = [
    ['Max-Q', mq ? mq.extra + ' · ' + tClock(mq.t).slice(3) : '—'], ['MECO', meco ? tClock(meco.t).slice(3) : '—'], ['SECO', seco ? tClock(seco.t).slice(3) : '—'],
    ['Quỹ đạo', up && up.orbit ? fmt(up.orbit.peri / 1000) + ' × ' + fmt(Math.min(up.orbit.apo, 99999e3) / 1000) + ' km' : '—'],
    ['Booster', bo ? ({caught: 'Đã bắt bằng đũa', landed: 'Đã hạ cánh', crash: 'Bị phá huỷ', splash: C.recovery === 'expend' ? 'Rơi biển (kế hoạch)' : 'Rơi xuống biển'}[bo.outcome] || '—') : '—'],
    ['Sai số đáp', le && le.extra && le.extra.err != null ? fmt(Math.abs(le.extra.err), 1) + ' m' : '—'],
    ['Động cơ hỏng khi bay', String(failsInFlight)], ['Tự lái', G.manualUsed ? 'Có' : 'Không']
  ].map(([k, v]) => `<div><span>${k}</span><strong>${v}</strong></div>`).join('');
  p.append(grp('Dữ liệu bay', 'Flugdaten', [kv]));
  const plot = el('canvas', 'plan'); p.append(grp('Quỹ đạo thực tế', 'Trajectory', [plot]));
  requestAnimationFrame(() => drawPlan(plot, f.telemetry));
  const lg = el('ul', 'list'); lg.innerHTML = f.log.filter(e => !['tower'].includes(e.type)).slice(0, 30).map(e => `<li><b>${tClock(e.t).slice(3)}</b> ${e.msg}</li>`).join('');
  p.append(grp('Nhật ký', 'Log', [lg]));
  const bt = el('div', 'btns'); const b1 = el('button', 'btn pri', 'Bay lại'); b1.type = 'button'; b1.onclick = () => toConfig('launch');
  const b2 = el('button', 'btn', 'Đổi cấu hình'); b2.type = 'button'; b2.onclick = () => toConfig('vehicle');
  bt.append(b1, b2); p.append(bt);
  p.append(grp('Nhiệm vụ', 'Missionen', [missionsList(fresh)]));
}
