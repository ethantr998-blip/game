/* ================= game state, scene assembly, cameras, flight loop ================= */
const DEF_CFG = {vehicle: 'starship', block: 'b3', flights: 6, recovery: 'catch', payload: 20000, orbitH: 200000, tod: 'day', wind: 4, clouds: 0.35, failures: true, manual: false, seed: 11};
const G = {
  step: 'vehicle', cfg: Object.assign({}, DEF_CFG, store.get('cfg3d', {})),
  veh: null, padGroup: null, flight: null, plan: null, warp: 1, warpUser: 1, camMode: 'track', focus: 'auto', engStage: 0, sel: null, hover: null, hoverMap: null,
  busy: null, busyT: 0, staticMsg: '', staticLvl: '', staticDone: false, man: {thr: 0.6, tilt: 0}, manualUsed: false, resultShown: false, trails: true, picks: []
};
(function validateCfg() {
  const C = G.cfg; if (!VEHICLES[C.vehicle]) Object.assign(C, DEF_CFG);
  const V = VEHICLES[C.vehicle]; if (!V.blocks[C.block]) C.block = Object.keys(V.blocks)[0];
  if (!V.recoveries[C.recovery]) C.recovery = V.defaultRecovery; if (!TOD[C.tod]) C.tod = 'day';
})();
function saveCfg() { store.set('cfg3d', G.cfg); refreshPanels(); }
const EV_NAMES = {maxq: 'MAX-Q', meco: 'MECO', hotstage: 'HOT STAGE', sep: 'TÁCH', boostback: 'BOOSTBACK', entry: 'ENTRY', landing: 'LANDING', fairing: 'FAIRING', seco: 'SECO', catch: 'BẮT', landed: 'ĐÁP'};
/* ---------- site ---------- */
let siteGroup = null, curSite = null, droneship = null, padLights = [];
function buildSite(key) {
  if (curSite === key) return;
  if (siteGroup) scene.remove(siteGroup);
  siteGroup = key === 'starbase' ? buildStarbase() : buildLC39A(); scene.add(siteGroup); curSite = key;
  if (key === 'starbase') { terrainUniforms.uCoast.value.set(1250, 700, 7300, 300); terrainUniforms.uPadR.value = 140; Object.assign(padSurface, {r: 10, y: 0.6, deckR: 0, deckY: 0}); setChopsticks(1, SITE.starbase.catchY); }
  else { terrainUniforms.uCoast.value.set(3500, 900, 9100, 400); terrainUniforms.uPadR.value = 170; Object.assign(padSurface, {r: 0, y: 0, deckR: 95, deckY: 12.5}); }
}
function placeDroneship() {
  if (droneship) { scene.remove(droneship); droneship = null; }
  if (G.cfg.recovery !== 'asds' || !G.plan || !G.plan.landTarget) return;
  droneship = buildDroneship(); scene.add(droneship); droneship.userData.s = G.plan.landTarget;
}
function updateDroneship(t) {
  if (!droneship) return;
  const a = droneship.userData.s / RE;
  droneship.position.set(Math.sin(a) * RE, Math.cos(a) * RE - RE + 0.4 * Math.sin(t * 0.7), 0);
  droneship.rotation.set(0.012 * Math.sin(t * 0.53), 0, -a + 0.01 * Math.sin(t * 0.61));
}
/* ---------- vehicle on the pad ---------- */
function rebuildVehicle() {
  if (G.padGroup) scene.remove(G.padGroup);
  const C = G.cfg, v = buildVehicle(C.vehicle, {block: C.block, flights: C.flights, seed: C.seed});
  G.veh = v; G.padGroup = new THREE.Group();
  v.stages.forEach(s => { s.group.position.y = s.stackY; G.padGroup.add(s.group); s.engines.forEach(e => { e.tested = false; }); });
  G.padGroup.position.y = SITEINFO[v.V.site].mountH; scene.add(G.padGroup);
  collectPicks(); G.sel = null; G.engStage = 0; G.staticDone = false; G.staticMsg = '';
  planSoon();
}
let rvTimer = 0; function rebuildVehicleSoon() { clearTimeout(rvTimer); rvTimer = setTimeout(rebuildVehicle, 250); }
function collectPicks() { G.picks = []; if (G.padGroup) G.padGroup.traverse(o => { if (o.isMesh && o.userData.engine) G.picks.push(o); }); }
function setVehicle(k) {
  const C = G.cfg; if (C.vehicle === k) return;
  const V = VEHICLES[k]; C.vehicle = k; C.block = Object.keys(V.blocks)[0]; C.recovery = V.defaultRecovery; C.payload = V.payload; C.orbitH = RULES[k].orbitH;
  saveCfg(); buildSite(V.site); rebuildVehicle(); resetCam();
}
function replaceEngine(e) {
  const st = e.stage, i = st.engines.indexOf(e), ne = new Engine(e.type, e.x, e.z, e.ring, e.idx, mulberry(Date.now() & 0xffff));
  ne.stage = st; ne.health = 0.97 + Math.random() * 0.03; ne.flights = 0; ne.tested = true;
  st.engineGroup.remove(e.view.root); st.engineGroup.add(makeEngineView(ne)); st.engines[i] = ne;
  collectPicks(); G.sel = ne; toast(`Đã lắp ${ne.serial} thay cho ${e.serial}`, 'good'); planSoon();
}
function selectEngine(e) { G.sel = e; G.engStage = G.veh.stages.indexOf(e.stage); refreshPanels(); }
/* ---------- planning ---------- */
let planTimer = 0;
function planSoon() { G.plan = null; clearTimeout(planTimer); planTimer = setTimeout(runPlan, 150); refreshPanels(); }
function runPlan() {
  if (!G.veh) return;
  const C = G.cfg, engineState = G.veh.stages.map(s => s.engines.map(e => ({disabled: e.disabled || e.failed, health: e.health})));
  const P = planFlight({recovery: C.recovery, payload: C.payload, orbitH: C.orbitH, seed: C.seed, propLoad: 1, engineState}, C.vehicle, C.block);
  P.events = (P.log || []).filter(e => EV_NAMES[e.type] && e.type !== 'sep' || (e.type === 'sep' && C.vehicle === 'falcon9')).map(e => ({t: e.t, type: e.type, n: EV_NAMES[e.type]}));
  G.plan = P; placeDroneship(); refreshPanels();
}
/* ---------- environment ---------- */
let cloudTimer = 0; function cloudsSoon() { clearTimeout(cloudTimer); cloudTimer = setTimeout(() => buildClouds(G.cfg.clouds, 5), 200); }
function applyEnvironment() {
  setSun(G.cfg.tod); envKey = '';
  const night = G.cfg.tod === 'night' || G.cfg.tod === 'dusk';
  padLights.forEach(l => { l.visible = night; });
  if (cloudShell) cloudShell.material.uniforms.uCover.value = G.cfg.clouds;
}
function buildPadLights() {
  for (const [x, z] of [[130, 120], [-140, 90]]) { const L = new THREE.SpotLight(0xdfe6ff, 2.2e5, 0, 0.22, 0.6, 2); L.position.set(x, 3, z); L.target.position.set(0, 60, 0); scene.add(L, L.target); padLights.push(L); }
}
/* ---------- steps ---------- */
function setStep(s) {
  G.step = s; store.set('step3d', s);
  $$('#steps button').forEach(b => { b.classList.toggle('on', b.dataset.step === s); });
  $$('.panel section').forEach(x => { x.hidden = x.dataset.panel !== s; });
  $('#panel').scrollTop = 0; G.sel = s === 'engines' ? G.sel : null;
  resetCam(); refreshPanels();
  if (s === 'mission') requestAnimationFrame(() => drawPlan($('#planCv'), G.plan && G.plan.trace));
}
$$('#steps button').forEach(b => b.onclick = () => { if (!G.flight) setStep(b.dataset.step); });
function setFlying(on) {
  $('#app').classList.toggle('flying', on); $$('#steps button').forEach(b => b.disabled = on);
  $('#hud').hidden = !on; $('#readout').hidden = on;
}
/* ---------- countdown & flight ---------- */
function startCountdown() {
  if (!G.plan || G.plan.scrub || G.flight || G.busy) return;
  audioInit(); if (SND.ctx && SND.ctx.state === 'suspended') SND.ctx.resume();
  const C = G.cfg;
  G.veh.stages.forEach(s => s.engines.forEach(e => { e.tried = false; e.startAt = null; if (!e.failed) { e.state = 'off'; e.thr = 0; } e.burn = 0; e.heat = 0; e.gx = e.gz = 0; }));
  const f = new Flight({recovery: C.recovery, payload: C.payload, orbitH: C.orbitH, seed: C.seed + (Math.random() * 1e6 | 0), failures: C.failures, kick: G.plan.kick}, G.veh, {target: G.plan.landTarget, t0: -12});
  f.aimOffset = G.plan.aimOffset || 0;
  scene.remove(G.padGroup);
  G.flight = f; G.warp = G.warpUser = 1; G.manualUsed = false; G.focus = 'auto'; G.resultShown = false; G.camMode = 'pad'; G.lastCount = 99;
  G.trailLines = {}; f.bodies.forEach(addBodyToScene);
  G.man = {thr: 0.6, tilt: 0};
  setStep('launch'); setFlying(true); buildCtrls(); resetCam();
  callout('ĐẾM NGƯỢC', VEHICLES[C.vehicle].name + ' · ' + SITEINFO[VEHICLES[C.vehicle].site].name);
}
function addBodyToScene(b) {
  if (b.inScene) return; b.inScene = true; scene.add(b.group);
  if (!b.deb && G.trailLines) { const col = b.id === 'upper' ? 0x6cd4e8 : 0xffad38; b.trail3 = makeTrail(col); }
}
function abortCountdown() { const f = G.flight; if (!f || f.released) return; f.abort('Bạn đã hủy đếm ngược'); }
function endFlightToResult() {
  if (G.resultShown) return; G.resultShown = true; showResult(); setStep('result'); setFlying(false);
  $('#hud').hidden = false; $('#cast').hidden = true; $('#ctrls').hidden = false; $('#manual').hidden = true; $('#readout').hidden = true; paintCtrls();
}
function toConfig(step) {
  const f = G.flight;
  if (f) { f.bodies.forEach(b => { scene.remove(b.group); if (b.trail3) scene.remove(b.trail3); }); }
  G.flight = null; smokeFX.clear(); glowFX.clear(); silenceVoices();
  $('#cast').hidden = false; setFlying(false); $('#hud').hidden = true;
  setChopsticks(1, SITE.starbase ? SITE.starbase.catchY : 96);
  if (SITE.starbase) SITE.starbase.qd.rotation.y = 0; if (SITE.lc39a) SITE.lc39a.te.rotation.x = 0;
  rebuildVehicle(); setStep(step);
}
/* ---------- flight-time controls ---------- */
const CAMS = [['track', 'Theo dõi'], ['chase', 'Bám sát'], ['onboard', 'Gắn thân'], ['engines', 'Gầm động cơ'], ['pad', 'Bệ phóng']];
const WARPS = [1, 2, 5, 10, 30];
function buildCtrls() {
  const c = $('#ctrls'); c.innerHTML = '';
  const mk = (items, get, set) => { const g = el('div', 'seg'); items.forEach(([v, n]) => { const b = el('button', null, n); b.type = 'button'; b.onclick = () => { set(v); paint(); }; b.dataset.v = v; g.append(b); }); const paint = () => g.querySelectorAll('button').forEach(b => b.classList.toggle('on', String(get()) === b.dataset.v)); paint(); g.paint = paint; return g; };
  G.ctl = [mk(CAMS, () => G.camMode, v => { G.camMode = v; resetCam(); }), mk(WARPS.map(w => [w, '×' + w]), () => G.warpUser, v => { G.warpUser = +v; }), mk([['auto', 'Tự động'], ['booster', 'Booster'], ['upper', 'Tầng trên']], () => G.focus, v => { G.focus = v; resetCam(); })];
  const res = el('div', 'seg'); const rb = el('button', null, 'Kết quả'); rb.type = 'button'; rb.onclick = () => endFlightToResult(); res.append(rb); G.resBtn = rb;
  G.ctl.forEach(g => c.append(g)); c.append(res);
}
function paintCtrls() { if (G.ctl) G.ctl.forEach(g => g.paint()); if (G.resBtn) G.resBtn.parentNode.hidden = !(G.flight && !G.resultShown && (G.flight.done || G.endT)); }
/* ---------- render-frame state of every body ---------- */
const BV = new Map();
function bodyView(b, t) {
  let v = BV.get(b); if (!v) { v = {pos: V3(), axis: V3(), vel: V3(), center: V3()}; BV.set(b, v); }
  const ef = b.toEF(t, [0, 0]); v.pos.set(ef[0], ef[1] - RE, 0);
  const a = b.att - OM_E * t; v.axis.set(Math.sin(a), Math.cos(a), 0);
  if (!b.fixed && !b.deb) { const va = b.vAir([0, 0]), th = OM_E * t, c = Math.cos(th), s = Math.sin(th); v.vel.set(va[0] * c - va[1] * s, va[0] * s + va[1] * c, 0); } else v.vel.set(0, 0, 0);
  v.center.copy(v.pos).addScaledVector(v.axis, (b.len || 10) * 0.5);
  return v;
}
function syncBodies(f) {
  for (const b of f.bodies) {
    if (!b.inScene) addBodyToScene(b);
    const v = bodyView(b, f.t);
    b.group.position.copy(v.pos); b.group.rotation.set(0, 0, -(b.att - OM_E * f.t));
    if (b.deb) b.group.rotation.y = f.t * 0.6 * (b.side || 1);
  }
}
function focusBody() {
  const f = G.flight; if (!f) return null;
  const bo = f.booster && f.booster.id === 'booster' ? f.booster : null, up = f.upper && f.upper.id === 'upper' ? f.upper : null;
  if (f.stack) return f.stack;
  if (G.focus === 'booster' && bo) return bo;
  if (G.focus === 'upper' && up) return up;
  if (bo && G.cfg.recovery !== 'expend' && ((['aero', 'entry', 'landing'].includes(bo.phase) && bo.h < 40000) || (bo.outcomeT && f.t - bo.outcomeT < 12))) return bo;
  return up || bo;
}
/* ---------- cameras ---------- */
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08; controls.screenSpacePanning = false;
const CAM = {target: V3(), prevTarget: V3(), fov: 50, look: V3(), smooth: 0};
const PADCAM = {starbase: V3(190, 7, 340), lc39a: V3(240, 16, 310)}, TRACKCAM = {starbase: V3(-2100, 20, 3100), lc39a: V3(-2600, 12, 2800)};
function resetCam() {
  const v = G.veh; if (!v) return;
  const mount = SITEINFO[v.V.site].mountH, H = v.height;
  CAM.smooth = 0; camera.up.set(0, 1, 0);
  if (G.step === 'flight' || G.flight) {
    controls.enabled = G.camMode === 'chase';
    if (G.camMode === 'chase') { const fb = focusBody(); if (fb) { const bv = bodyView(fb, G.flight.t); CAM.prevTarget.copy(bv.center); controls.target.copy(bv.center); camera.position.copy(bv.center).add(V3(fb.len * 1.1, fb.len * 0.2, fb.len * 1.6)); } }
    return;
  }
  controls.enabled = true; controls.autoRotate = false;
  if (G.step === 'engines') {
    const st = v.stages[G.engStage] || v.stages[0], y = mount + st.stackY + st.def.enginePivot - 1.6;
    controls.target.set(0, y, 0); camera.position.set(st.R * 1.5 + 3, y - (G.engStage === 0 ? st.R * 1.6 + 2 : -2), st.R * 1.8 + 3);
    controls.minDistance = 2.5; controls.maxDistance = 90;
  } else {
    controls.target.set(0, mount + H * 0.45, 0); camera.position.set(H * 0.55, mount + H * 0.28, H * 1.05);
    controls.minDistance = 8; controls.maxDistance = 6000; controls.autoRotate = G.step !== 'vehicle'; controls.autoRotateSpeed = 0.35;
  }
  camera.fov = 45; camera.updateProjectionMatrix();
}
function focusEngineCam() { if (G.step === 'engines') resetCam(); }
const _lookM = new THREE.Matrix4(), _q = new THREE.Quaternion(), _up = V3();
function updateCamera(dt) {
  const f = G.flight;
  if (!f) { controls.update(); return; }
  const fb = focusBody(); if (!fb) return;
  const bv = bodyView(fb, f.t), len = fb.len || 20, R = fb.stage ? fb.stage.R : 2;
  const site = curSite, k = 1 - Math.exp(-dt * 4);
  let fov = 50;
  camera.up.set(0, 1, 0);
  if (G.camMode === 'chase') {
    controls.enabled = true;
    const d = _v1.copy(bv.center).sub(CAM.prevTarget); camera.position.add(d); controls.target.copy(bv.center); CAM.prevTarget.copy(bv.center);
    controls.minDistance = len * 0.4; controls.maxDistance = 2e6; controls.update(); fov = 50;
  } else {
    controls.enabled = false;
    if (G.camMode === 'track' || G.camMode === 'pad') {
      let st = (G.camMode === 'pad' ? PADCAM : TRACKCAM)[site];
      const far = bv.center.distanceTo(st);
      if (G.camMode === 'track' && far > 180000) { /* beyond the tracker's horizon: fly a long-lens chase plane */
        st = _v2.copy(bv.center).addScaledVector(bv.axis, -len * 2).add(V3(len * 0.8, -len * 0.3, len * 6));
      }
      camera.position.copy(st);
      CAM.look.lerp(bv.center, CAM.smooth ? k * 2 : 1); camera.lookAt(CAM.look); CAM.smooth = 1;
      const dist = camera.position.distanceTo(bv.center);
      fov = G.camMode === 'pad' ? 55 : clamp(2 * Math.atan(len * 1.7 / (2 * dist)) / DEG, 0.25, 50);
    } else {
      /* attached cameras ride in the stage's frame */
      const st = fb.stage, g = st ? st.group : fb.group; fb.group.updateMatrixWorld(true); /* this frame's pose, not last frame's */
      if (G.camMode === 'onboard') {
        camera.position.copy(V3(R + 0.9, Math.min(len * 0.22, 16), 0.6).applyMatrix4(g.matrixWorld));
        const look = V3(R + 0.2, -40, 0).applyMatrix4(g.matrixWorld);
        _up.set(0, 0, 1).transformDirection(g.matrixWorld); camera.up.copy(_up); camera.lookAt(look); fov = 78;
      } else {
        /* a chase plane slightly below the engine plane: the whole cluster and its plumes */
        camera.position.copy(V3(R * 4.5 + 6, -R * 1.2 - 3, R * 5.5 + 8).applyMatrix4(g.matrixWorld));
        _up.copy(bv.axis); camera.up.copy(_up); camera.lookAt(V3(0, -R * 0.6, 0).applyMatrix4(g.matrixWorld)); fov = 52;
      }
    }
  }
  camera.fov = lerp(camera.fov, fov, CAM.smooth ? Math.min(1, dt * 3) : 1); camera.updateProjectionMatrix();
}
/* ---------- engine picking (inspector) ---------- */
const ray = new THREE.Raycaster(), _ndc = new THREE.Vector2();
let downXY = null;
function pickEngine(ev) {
  const r = canvas.getBoundingClientRect(); _ndc.set((ev.clientX - r.left) / r.width * 2 - 1, -(ev.clientY - r.top) / r.height * 2 + 1);
  ray.setFromCamera(_ndc, camera); const hit = ray.intersectObjects(G.picks, false)[0];
  return hit ? hit.object.userData.engine : null;
}
canvas.addEventListener('pointerdown', ev => { downXY = [ev.clientX, ev.clientY]; });
canvas.addEventListener('pointerup', ev => {
  if (G.step !== 'engines' || G.flight || !downXY) return;
  if (Math.hypot(ev.clientX - downXY[0], ev.clientY - downXY[1]) > 6) return;
  const e = pickEngine(ev); if (e) selectEngine(e);
});
canvas.addEventListener('pointermove', ev => {
  if (G.step !== 'engines' || G.flight) { $('#etip').hidden = true; return; }
  const e = pickEngine(ev); G.hover = e; const tip = $('#etip');
  if (e) { const r = $('#stage').getBoundingClientRect(); tip.hidden = false; tip.style.left = (ev.clientX - r.left) + 'px'; tip.style.top = (ev.clientY - r.top) + 'px'; tip.textContent = `${e.serial} · ${e.spec.short} · ${e.statusText()}`; }
  else tip.hidden = true;
});
/* ---------- static fire & gimbal test on the pad ---------- */
function staticFire() {
  if (G.busy || G.flight) return; audioInit();
  G.busy = 'static'; G.busyT = 0; G.staticMsg = 'Đang thử nổ tĩnh… tên lửa bị kẹp giữ trên bệ.'; G.staticLvl = '';
  const st = G.veh.stages[0]; st.engines.forEach((e, i) => { e.cmd = 0.65; e.startAt = (e.ring === 'center' ? 0 : e.ring === 'outer' ? 0.6 + (i % 10) * 0.05 : 0.3); e.tried = false; if (!e.failed) e.state = 'off'; });
  /* watch from the pad perimeter: under the mount it is all fire and steam */
  const H = G.veh.height, m = SITEINFO[G.veh.V.site].mountH; controls.target.set(0, m + H * 0.3, 0); camera.position.set(H * 1.1, m * 0.6 + 6, H * 1.6);
  refreshPanels();
}
function gimbalTest() { if (G.busy || G.flight) return; G.busy = 'gimbal'; G.busyT = 0; refreshPanels(); }
function tickPadTests(dt) {
  if (!G.veh) return;
  const st = G.veh.stages[0];
  if (G.busy === 'static') {
    G.busyT += dt;
    for (const e of st.engines) {
      if (!e.tried && G.busyT >= e.startAt && !e.disabled && !e.failed) {
        e.tried = true; e.start();
        if (Math.random() < 0.004 + 0.3 * Math.pow(1 - e.health, 2)) setTimeout(() => { if (e.running) { e.fail('static', 'Tự tắt khi thử nổ tĩnh — áp suất buồng thấp'); } }, 400 + Math.random() * 1600);
      }
    }
    if (G.busyT > 5.5) st.engines.forEach(e => e.stop());
    if (G.busyT > 7.5) {
      G.busy = null; G.staticDone = true; award('static');
      const bad = st.engines.filter(e => e.failed), weak = st.engines.filter(e => !e.failed && !e.disabled && e.health < 0.8);
      st.engines.forEach(e => { if (!e.disabled) e.tested = true; });
      G.staticMsg = bad.length || weak.length ? `<b>${bad.length} động cơ tự tắt</b>${bad.length ? ' (' + bad.map(e => e.serial).join(', ') + ')' : ''}, ${weak.length} động cơ yếu. Thay mới hoặc loại khỏi chuyến bay.` : '<b>Tất cả động cơ đạt.</b> Lực đẩy và áp suất buồng đốt trong giới hạn.';
      G.staticLvl = bad.length ? 'crit' : weak.length ? 'warn' : '';
      planSoon(); refreshPanels();
    }
  } else if (G.busy === 'gimbal') {
    G.busyT += dt; const a = G.busyT * 2.4;
    for (const s of G.veh.stages) for (const e of s.engines) if (e.canGimbal) { e.gx = Math.sin(a) * e.spec.gimbal * 0.9; e.gz = Math.cos(a) * e.spec.gimbal * 0.9; }
    if (G.busyT > 5.3) { G.busy = null; G.veh.stages.forEach(s => s.engines.forEach(e => { e.gx = e.gz = 0; })); refreshPanels(); }
  }
  for (const s of G.veh.stages) for (const e of s.engines) e.step(dt);
}
/* ---------- per-frame visuals: engines, lights, merged plumes, particles, vapour cone, sound ---------- */
const _ex = V3(), _dir = V3(), _p = V3();
const FUELCOL = {CH4: [0.88, 0.89, 0.92], 'RP-1': [0.52, 0.49, 0.46]};
function visualBodies() {
  if (G.flight) return G.flight.bodies.filter(b => !b.deb && b.alive !== false || (b.outcome && b.group.visible)).map(b => ({b, v: bodyView(b, G.flight.t), stages: b.stages, h: b.h, amb: b.fixed ? 1 : b.amb, mach: b.mach, len: b.len}));
  if (!G.veh) return [];
  const mount = SITEINFO[G.veh.V.site].mountH, v = {pos: V3(0, mount, 0), axis: V3(0, 1, 0), vel: V3(), center: V3(0, mount + G.veh.height / 2, 0)};
  return [{b: null, v, stages: G.veh.stages, h: mount, amb: 1, mach: 0, len: G.veh.height}];
}
function updateVisuals(dt, t) {
  scene.updateMatrixWorld();
  const lights = [], wind = [-G.cfg.wind, 0, G.cfg.wind * 0.3];
  let voice = 0;
  for (const vb of visualBodies()) {
    const {b, v, stages, h, amb} = vb;
    if (b && b.deb) continue;
    stages.forEach((st, si) => {
      updateStageVisual(st, dt);
      const camDist = camera.position.distanceTo(v.center);
      let Fsum = 0, nRun = 0, thrSum = 0;
      for (const e of st.engines) {
        updateEngineView(e, amb, t, camDist);
        if (e.view && G.step === 'engines' && !G.flight) e.view.hi.visible = e === G.sel || e === G.hover;
        else if (e.view) e.view.hi.visible = false;
        if (e.lit && e.thr > 0.01) { Fsum += e.F(amb * P0) * e.thr; nRun++; thrSum += e.thr; }
      }
      const fuel = st.engines[0] ? st.engines[0].spec.fuel : 'CH4', grp = st.engineGroup;
      if (!grp) return;
      /* cluster light: the flame lights the vehicle, pad and steam */
      st.light.intensity = nRun ? 1600 * Math.sqrt(Fsum / 1e6) * (h < 2000 ? 1 : 0.5) : 0;
      st.light.color.setHex(fuel === 'RP-1' ? 0xffa04a : 0xffb487);
      /* merged plume once the individual plumes balloon in thin air */
      const bp = st.bigPlume; bp.visible = nRun >= 3 && amb < 0.6;
      if (bp.visible) { const u = bp.material.uniforms, R = bp.userData.R, a = amb; u.uR0.value = R * 0.85; u.uLen.value = R * 2 * (5 + 30 * (1 - a)); u.uExp.value = 0.4 + 5 * Math.pow(1 - a, 2); u.uInt.value = 0.22 * (1 - a) / (1 + u.uExp.value * 0.4); u.uThr.value = thrSum / nRun; u.uTime.value = t; u.uDiam.value = 0; setPalette(bp.material, fuel, a, 0); }
      if (!nRun) return;
      grp.updateMatrixWorld(true);
      const exitY = Math.min(...st.engines.map(e => e.view ? e.view.geo.exitY : -3));
      _ex.set(0, exitY, 0).applyMatrix4(grp.matrixWorld); _dir.copy(v.axis).negate();
      if (lights.length < 2) lights.push({pos: _ex.clone().addScaledVector(_dir, 8), I: Math.min(1.1, Fsum / 7e7) * (amb > 0.2 ? 1 : 0.3), col: st.light.color});
      emitExhaust(st, b, v, _ex, _dir, Fsum, amb, h, fuel, dt, wind);
      if (si === 0 || (b && b.stages.length === 1)) { updateVoice(voice++, _ex, Fsum, h - (b ? 0 : 0), clamp(Fsum / 2.5e7, 0, 1) * (fuel === 'CH4' ? 1.2 : 0.8), (G.camMode === 'onboard' || G.camMode === 'engines') && b === focusBody()); }
      /* engine-start sparks (green TEA-TEB flash on Merlins) */
      for (const e of st.engines) if (e.state === 'startup' && e.tState < 0.35 && e.view && Math.random() < 0.7) { e.view.plume.getWorldPosition(_p); sparkBurst(_p, 2, fuel === 'RP-1' ? [0.4, 1, 0.45] : [1, 0.7, 0.4], 18); }
    });
    /* vapour cone through the sound barrier, low and humid */
    if (b && !b.fixed) {
      const m = b.mach, on = m > 0.86 && m < 1.25 && b.h < 16000 && b.F > 0;
      if (on && !b.vcone) { b.vcone = makeVaporCone(); b.group.add(b.vcone); }
      if (b.vcone) { b.vcone.visible = on; if (on) { const R = b.stages[b.stages.length - 1].R, a = Math.exp(-Math.pow((m - 1.0) / 0.12, 2)); b.vcone.position.y = b.len * 0.66; b.vcone.scale.set(R * 1.15, b.len * 0.3, R * 1.15); b.vcone.material.uniforms.uA.value = a * 0.55; b.vcone.material.uniforms.uT.value = t; } }
    }
  }
  for (let i = voice; i < 3; i++) if (SND.voices[i]) SND.voices[i].in.gain.setTargetAtTime(0, SND.ctx.currentTime, 0.2);
  setSmokeLights(lights);
  const um = smokeFX.mat.uniforms; um.uSunCol.value.copy(_sunCol);
  const night = 1 - smooth((sunDir.y + 0.12) / 0.2); um.uAmb.value.setRGB(lerp(0.2, 0.025, night), lerp(0.22, 0.03, night), lerp(0.27, 0.05, night));
  smokeFX.update(dt, wind); glowFX.update(dt, wind); smokeFX.upload(camera.position); glowFX.upload(camera.position);
  updateFlashes(dt);
}
function emitExhaust(st, b, v, ex, dir, F, amb, h, fuel, dt, wind) {
  const PQ = Q.particles, col = FUELCOL[fuel], R = st.R, ground = h - (curSite ? SITEINFO[G.veh.V.site].mountH : 0);
  const n = k => { const x = k * dt; return Math.floor(x) + (Math.random() < x % 1 ? 1 : 0); };
  /* exhaust smoke / steam in the lower atmosphere */
  if (amb > 0.04) {
    const rate = Math.min(150, F / 1e6 * 2.6) * PQ * Math.min(1, amb * 1.6);
    for (let i = n(rate); i--;) {
      const sp = 60 + Math.random() * 120, j = (Math.random() - 0.5) * R * 1.4, jz = (Math.random() - 0.5) * R * 1.4;
      smokeFX.emit(ex.x + j, ex.y, ex.z + jz, v.vel.x * 0.85 + dir.x * sp + (Math.random() - 0.5) * 20, v.vel.y * 0.85 + dir.y * sp, v.vel.z + dir.z * sp + (Math.random() - 0.5) * 20,
        8 + Math.random() * 10, R * 0.55 + Math.random() * 2, 3 + Math.random() * 4, 0.3, col[0], col[1], col[2], 0, 1.4, 0.5);
    }
  }
  /* water deluge / flame trench steam while the plume hits the pad */
  if (ground < 260 && (!b || b.id === 'stack')) {
    const k = Math.min(240, F / 1e6 * 3.5) * PQ * (1 - ground / 260);
    for (let i = n(k); i--;) {
      if (curSite === 'starbase') {
        const a = Math.random() * TAU, sp = 18 + Math.random() * 45;
        smokeFX.emit(Math.cos(a) * 9, 2 + Math.random() * 4, Math.sin(a) * 9, Math.cos(a) * sp, 2 + Math.random() * 8, Math.sin(a) * sp, 9 + Math.random() * 12, 6, 2.2 + Math.random() * 2.5, 0.42, 0.9, 0.91, 0.93, 0, 0.45, 1.1);
      } else {
        const sp = 30 + Math.random() * 50, s = Math.random() < 0.85 ? 1 : -1;
        smokeFX.emit((Math.random() - 0.5) * 10, 9, s * (55 + Math.random() * 20), (Math.random() - 0.5) * 16, 6 + Math.random() * 14, s * sp, 9 + Math.random() * 12, 6, 2.2 + Math.random() * 2.5, 0.42, 0.9, 0.91, 0.93, 0, 0.45, 1.1);
      }
    }
  }
  /* returning booster: its plume scours the deck / pad */
  if (b && b.id === 'booster' && h < 140 && b.phase === 'landing') for (let i = n(Math.min(160, F / 1e6 * 8) * PQ); i--;) {
    const a = Math.random() * TAU, sp = 15 + Math.random() * 30, gy = Math.max(0, h - 140) ;
    smokeFX.emit(v.pos.x + Math.cos(a) * 6, v.pos.y - h + (curSite === 'starbase' && Math.abs(v.pos.x) < 12 ? SITEINFO.starbase.mountH : 2) + 1, v.pos.z + Math.sin(a) * 6, Math.cos(a) * sp, 2, Math.sin(a) * sp, 5 + Math.random() * 5, 4, 2.5, 0.4 * (1 - h / 140), col[0], col[1], col[2], 0, 0.7, 0.8);
  }
  /* contrail in the cold upper troposphere */
  if (h > 7000 && h < 16000) for (let i = n(30 * PQ); i--;) smokeFX.emit(ex.x + (Math.random() - 0.5) * R, ex.y, ex.z, wind[0], 0, wind[2], 50, R * 0.5, 1.2, 0.3, 0.95, 0.96, 0.98, 0, 2, 0);
  /* expanding exhaust in near-vacuum: lit by the sun after sunset below — the twilight "jellyfish" */
  if (h > 28000 && amb < 0.02) for (let i = n(10 * PQ); i--;) {
    const r = () => (Math.random() - 0.5) * 260;
    smokeFX.emit(ex.x, ex.y, ex.z, v.vel.x * 0.3 + dir.x * 300 + r(), v.vel.y * 0.3 + dir.y * 300 + r(), v.vel.z + r(), 22, 30, 140, 0.11, fuel === 'CH4' ? 0.8 : 1, fuel === 'CH4' ? 0.86 : 0.85, fuel === 'CH4' ? 1 : 0.72, 0, 0.05, 0);
  }
}
/* ---------- flight events → effects, sound, captions ---------- */
function handleFlightEvents(f) {
  while (f.queue.length) {
    const e = f.queue.shift(), b = f.bodies.find(x => x.id === e.body) || f.booster;
    const bv = b ? bodyView(b, f.t) : null, at = bv ? bv.center : V3();
    const crit = ['fail', 'rud', 'crash', 'miss', 'abort', 'splash', 'depleted'].includes(e.type) && !(e.type === 'splash' && G.cfg.recovery === 'expend');
    switch (e.type) {
      case 'ignition': callout('KHỞI ĐỘNG ĐỘNG CƠ', e.msg); break;
      case 'liftoff': callout('CẤT CÁNH', VEHICLES[G.cfg.vehicle].name); speak('Cất cánh'); if (SITE.starbase && curSite === 'starbase') SITE.starbase.qd.rotation.y = -1.3; break;
      case 'maxq': callout('MAX-Q', 'Áp suất động lực học cực đại · ' + e.extra); break;
      case 'meco': callout('MECO', e.msg.replace(/^MECO — /, '')); break;
      case 'hotstage': callout('HOT STAGING', 'Ship khởi động Raptor khi vẫn còn gắn với booster'); sparkBurst(at, 60, [1, 0.6, 0.3], 40); break;
      case 'sep': callout('TÁCH TẦNG'); sfx('pop', at, 0.6); break;
      case 'ses': callout('SES-1', 'MVac khởi động — vòi phun chân không đỏ rực dần'); break;
      case 'fairing': toast('Tách vỏ chụp fairing — lộ ra chồng vệ tinh'); sfx('pop', at, 0.4); break;
      case 'boostback': callout('BOOSTBACK', 'Booster đốt ngược về bãi phóng'); break;
      case 'entry': callout('ENTRY BURN', '3 Merlin hãm tốc trước lớp khí quyển dày'); break;
      case 'landing': callout('LANDING BURN', e.msg); if (G.cfg.manual && b) { G.manualUsed = true; G.man.thr = clamp(b.autoThr || 0.7, 0, 1); G.man.tilt = 0; f.manualIn = G.man; } break;
      case 'catch': callout('ĐÃ BẮT ĐƯỢC BOOSTER!', 'Đũa Mechazilla kẹp vào chốt treo · lệch ' + fmt(Math.abs(e.extra.err), 1) + ' m'); sfx('clank', at, 1.2); G.chopClose = 0.01; b.outcomeT = f.t; break;
      case 'landed': callout('HẠ CÁNH THÀNH CÔNG', e.msg); sfx('thud', at, 0.8); b.outcomeT = f.t; for (let i = 0; i < 60; i++) { const a = Math.random() * TAU, s = 6 + Math.random() * 14; smokeFX.emit(bv.pos.x, bv.pos.y + 1, bv.pos.z, Math.cos(a) * s, 1, Math.sin(a) * s, 6, 3, 2, 0.5, 0.8, 0.8, 0.8, 0, 0.6, 0.6); } break;
      case 'miss': callout('TRƯỢT ĐŨA', e.msg); break;
      case 'crash': if (b) { explosion(bv.pos, G.cfg.vehicle === 'starship' ? 2.4 : 1.2); sfx('explosion', bv.pos, 1.4); b.group.visible = false; b.outcomeT = f.t; } callout(b && b.id === 'upper' ? 'MẤT TẦNG TRÊN' : 'BOOSTER BỊ PHÁ HỦY', e.msg); break;
      case 'splash': if (b) { splash(bv.pos); sfx('splash', bv.pos, 1); b.group.visible = false; b.outcomeT = f.t; } toast(e.msg, G.cfg.recovery === 'expend' ? '' : 'crit'); break;
      case 'seco': callout('SECO', e.msg.replace(/^SECO — /, '')); break;
      case 'rud': if (e.extra && e.extra.view) { e.extra.view.plume.getWorldPosition(_p); explosion(_p, 0.25); sfx('explosion', _p, 0.5); } toast(e.msg, 'crit'); break;
      case 'fail': if (e.extra && e.extra.view) { e.extra.view.plume.getWorldPosition(_p); sparkBurst(_p, 30, [1, 0.4, 0.2], 20); } toast(e.msg, 'crit'); break;
      case 'abort': callout('HỦY PHÓNG', e.msg); setTimeout(() => endFlightToResult(), 3500); break;
      default: if (e.msg && e.type !== 'tower') toast(e.msg, crit ? 'crit' : '');
    }
    if (e.type === 'tower') toast('Đã vượt khỏi tháp');
  }
}
/* sonic boom: a booster dropping through Mach 1 low over the coast is heard on the ground */
function checkBooms(f) {
  for (const b of f.bodies) {
    if (b.deb || b.fixed || b.id !== 'booster') continue;
    const m = b.mach, rv = b.vRel();
    if (b.prevMach >= 1.02 && m < 1.02 && b.h < 30000 && rv.vy < 0 && !b.boomed) { b.boomed = true; sfx('boom', bodyView(b, f.t).center, 1.1); }
    b.prevMach = m;
  }
}
/* manual landing input */
const KEYS = {};
document.addEventListener('keyup', e => { KEYS[e.code] = false; });
function tickManual(dt) {
  const m = G.man;
  if (KEYS.KeyW || KEYS.ArrowUp) m.thr = Math.min(1, m.thr + dt * 0.6);
  if (KEYS.KeyS || KEYS.ArrowDown) m.thr = Math.max(0, m.thr - dt * 0.6);
  if (KEYS.KeyA || KEYS.ArrowLeft) m.tilt = Math.max(-15 * DEG, m.tilt - dt * 10 * DEG);
  else if (KEYS.KeyD || KEYS.ArrowRight) m.tilt = Math.min(15 * DEG, m.tilt + dt * 10 * DEG);
  else m.tilt = approach(m.tilt, 0, dt * 5 * DEG);
}
function buildManualTouch() {
  const box = el('div', 'btns'); [['KeyW', 'Ga +'], ['KeyS', 'Ga −'], ['KeyA', '◀'], ['KeyD', '▶']].forEach(([k, n]) => {
    const b = el('button', 'btn', n); b.type = 'button';
    b.onpointerdown = ev => { ev.preventDefault(); KEYS[k] = true; }; b.onpointerup = b.onpointerleave = b.onpointercancel = () => { KEYS[k] = false; };
    box.append(b);
  });
  $('#manual').append(box);
}
document.addEventListener('keydown', e => {
  const t = e.target; if (t && (t.tagName === 'INPUT' && t.type !== 'range' && t.type !== 'checkbox' || t.tagName === 'TEXTAREA') || e.metaKey || e.ctrlKey || e.altKey) return;
  KEYS[e.code] = true;
  const f = G.flight;
  if (e.code === 'Space') { e.preventDefault(); if (f) { if (!(G.cfg.manual && f.booster && f.booster.phase === 'landing')) { G.warpUser = G.warpUser === 1 ? 10 : 1; paintCtrls(); } } else if (G.step === 'launch') startCountdown(); return; }
  if (e.code === 'Escape') { abortCountdown(); return; }
  if (e.code === 'KeyF') { toggleFS(); return; }
  if (e.code === 'KeyM') { $('#snd').click(); return; }
  if (f) {
    if (e.code === 'KeyC') { const i = CAMS.findIndex(c => c[0] === G.camMode); G.camMode = CAMS[(i + 1) % CAMS.length][0]; resetCam(); paintCtrls(); }
    else if (e.code === 'KeyB') { G.focus = 'booster'; resetCam(); paintCtrls(); }
    else if (e.code === 'KeyU') { G.focus = 'upper'; resetCam(); paintCtrls(); }
    else if (e.code === 'KeyT') { G.trails = !G.trails; f.bodies.forEach(b => { if (b.trail3) b.trail3.visible = G.trails; }); }
  } else if (/^Digit[1-4]$/.test(e.code)) setStep(['vehicle', 'engines', 'mission', 'launch'][+e.code.slice(5) - 1]);
});
function toggleFS() { const d = document, el2 = d.documentElement; try { if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d); else { const r = el2.requestFullscreen || el2.webkitRequestFullscreen; const p = r && r.call(el2); if (p && p.catch) p.catch(() => toast('Trình xem này chưa cho phép toàn màn hình')); } } catch (err) { toast('Trình xem này chưa cho phép toàn màn hình'); } }
$('#fs').onclick = toggleFS;
/* readout chips while configuring */
function updateReadout() {
  const r = $('#readout'); if (G.flight || !G.veh) return;
  const specs = vehicleSpecs(), P = G.plan;
  r.innerHTML = [['Tên lửa', VEHICLES[G.cfg.vehicle].name + ' ' + (VEHICLES[G.cfg.vehicle].blocks[G.cfg.block] || {}).name], specs[2] && ['Khối lượng', specs[2][1]], specs[5] && ['Đẩy / nặng', specs[5][1]], ['Quỹ đạo dự kiến', P && P.orbit ? fmt(P.orbit.peri / 1000) + ' × ' + fmt(Math.min(P.orbit.apo, 99999e3) / 1000) + ' km' : P && P.scrub ? 'Không cất cánh' : '…']]
    .filter(Boolean).map(([k, v]) => `<div class="chip"><span>${k}</span><strong>${v}</strong></div>`).join('');
}
/* ---------- main loop ---------- */
let last = performance.now(), tNow = 0, hudT = 0, grT = 0;
function frame(now) {
  const raw = (now - last) / 1000, dt = Math.min(0.1, raw); last = now; tNow += dt; perfTick(raw);
  const f = G.flight;
  if (f) {
    /* time warp drops to real time around the key moments */
    const bo = f.booster && f.booster.id === 'booster' ? f.booster : null;
    const critical = f.t < 25 || !!f.stack && f.stack.phase === 'stage' || (bo && (bo.phase === 'landing' || (bo.phase === 'aero' && bo.h < 9000 && focusBody() === bo))) || (bo && bo.tPhase < 4 && bo.phase === 'sep');
    G.warp = G.testWarp || (critical ? 1 : G.warpUser);
    if (G.cfg.manual && bo && bo.phase === 'landing') tickManual(dt);
    let acc = dt * G.warp, steps = 0;
    while (acc > 1e-6 && steps < 2000) { const h = Math.min(0.02, acc); f.step(h); acc -= h; steps++; }
    if (f.t < 0) { const n = Math.ceil(-f.t); if (n !== G.lastCount && n <= 10) { G.lastCount = n; $('#countdown').hidden = false; $('#countdown').textContent = n; sfx(n <= 3 ? 'beep2' : 'beep'); if (n <= 10) speak(['', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín', 'mười'][n]); } }
    else $('#countdown').hidden = true;
    /* pad hardware during the count: ship QD arm swings away, Falcon's strongback tilts back */
    if (curSite === 'starbase' && SITE.starbase) SITE.starbase.qd.rotation.y = -1.3 * smooth((f.t + 9) / 3);
    if (curSite === 'lc39a' && SITE.lc39a) SITE.lc39a.te.rotation.x = -0.09 * smooth((f.t + 10) / 4);
    handleFlightEvents(f); checkBooms(f); syncBodies(f);
    if (G.chopClose) { G.chopClose = Math.min(1, G.chopClose + dt * 1.6); setChopsticks(1 - G.chopClose, SITE.starbase.catchY - G.chopClose * 0.8); }
    else if (curSite === 'starbase' && bo && bo.phase === 'landing') setChopsticks(1, SITE.starbase.catchY);
    grT += dt * G.warp; if (grT > 0.5) { grT = 0; for (const b of f.bodies) if (b.trail3 && b.released !== false && !b.fixed && f.released) pushTrail(b.trail3, bodyView(b, f.t).center); }
    const up = f.upper && f.upper.id === 'upper' ? f.upper : null, bDone = !bo || !!bo.outcome || G.cfg.recovery === 'expend' && (bo.phase === 'crashed' || !bo.alive), uDone = up && (up.seco || up.outcome);
    if (!G.resultShown && f.released && !f.scrub && bDone && uDone) { G.endT = G.endT || f.t; if (f.t - G.endT > 8) endFlightToResult(); }
    hudT += dt; if (hudT > 0.1 && !$('#hud').hidden && !G.resultShown) { hudT = 0; updateHUD(f); paintCtrls(); }
  } else tickPadTests(dt);
  updateCamera(dt);
  const fb = focusBody(), camAlt = camera.position.clone().sub(EARTH_C).length() - RE;
  const focusPos = fb ? bodyView(fb, f.t).center : controls.target, focusAlt = fb ? fb.h : 0;
  updateSky(camera.position, focusPos, camAlt, focusAlt, clamp((fb ? fb.len : (G.veh ? G.veh.height : 80)) * 1.4, 60, 400));
  refreshEnv(Math.max(focusAlt, camAlt * 0.5));
  updateGround(camera.position, camAlt, tNow);
  updateClouds(tNow, G.cfg.wind);
  updateDroneship(tNow);
  updateVisuals(dt, tNow);
  tickCallout(dt);
  if (SND.ctx) updateAmbience(true, camAlt, G.cfg.wind, 1 - smooth((sunDir.y + 0.1) / 0.2), clamp(1 - Math.abs(camera.position.x - 1500) / 4000, 0, 1));
  if (!f && (hudT += dt) > 0.4) { hudT = 0; updateReadout(); }
  composer.render(dt);
}
/* ---------- boot ---------- */
function boot() {
  buildTextures(); buildMaterials(); buildEngineMaterials(); buildVehicleMaterials();
  buildSky(); buildGround(); buildFX(); buildPadLights();
  applyQuality(); setSun(G.cfg.tod); applyEnvironment(); buildClouds(G.cfg.clouds, 5);
  buildSite(VEHICLES[G.cfg.vehicle].site); rebuildVehicle();
  buildPanels(); buildManualTouch();
  setStep(['vehicle', 'engines', 'mission', 'launch'].includes(store.get('step3d', 'vehicle')) ? store.get('step3d', 'vehicle') : 'vehicle');
  $('#loading').hidden = true;
  window.K20 = {G, setStep, startCountdown, staticFire, gimbalTest, toConfig, setVehicle, saveCfg, planSoon, runPlan, focusBody, resetCam, applyEnvironment};
  renderer.setAnimationLoop(frame);
}
try { boot(); } catch (err) {
  $('#loading').hidden = false; $('#loading').innerHTML = '<div>LỖI KHỞI TẠO<small>' + String(err && err.message || err).replace(/</g, '&lt;') + '</small></div>';
  console.error(err);
}
