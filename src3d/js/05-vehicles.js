/* ================= vehicles: real dimensions, masses, engine layouts, 3D construction ================= */
function ringLayout(list, type, n, r, phase, ring) { for (let i = 0; i < n; i++) { const a = phase + i / n * TAU; list.push({type, x: Math.cos(a) * r, z: Math.sin(a) * r, ring}); } }
function superHeavyLayout(t) { const L = []; ringLayout(L, t, 3, 0.95, Math.PI / 2, 'center'); ringLayout(L, t, 10, 2.55, Math.PI / 10, 'inner'); ringLayout(L, t, 20, 3.92, 0, 'outer'); return L; }
function shipLayout(sl, vac) { const L = []; ringLayout(L, sl, 3, 1.05, Math.PI / 2, 'center'); ringLayout(L, vac, 3, 3.0, Math.PI / 2 + Math.PI / 3, 'vac'); return L; }
function octaweb(t) { const L = [{type: t, x: 0, z: 0, ring: 'center'}]; ringLayout(L, t, 8, 1.22, Math.PI / 8, 'ring'); return L; }
/* specs by vehicle / block (masses kg, lengths m). Sources: SpaceX, Wikipedia Super Heavy / Starship / Falcon 9 Block 5 pages. */
const VEHICLES = {
  starship: {
    name: 'Starship', site: 'starbase', fuel: 'CH4',
    blurb: 'Tên lửa lớn nhất từng bay. 33 Raptor trên Super Heavy, 6 trên Ship. Booster quay về để tháp Mechazilla bắt bằng "đũa".',
    blocks: {
      b3: {name: 'Block 3 · Raptor 3', height: 124.4,
        stages: [
          {key: 'booster', name: 'SUPER HEAVY', len: 72.3, dia: 9, dry: 280000, prop: 3650000, lox: 0.78, layout: superHeavyLayout('R3'), fins: 3, enginePivot: 2.0, kind: 'sh'},
          {key: 'ship', name: 'SHIP', len: 52.1, dia: 9, dry: 100000, prop: 1600000, lox: 0.78, layout: shipLayout('R3', 'RV3'), enginePivot: 4.6, kind: 'ship', payloadMax: 100000}
        ]},
      b2: {name: 'Block 2 · Raptor 2', height: 123.1,
        stages: [
          {key: 'booster', name: 'SUPER HEAVY', len: 71, dia: 9, dry: 275000, prop: 3400000, lox: 0.78, layout: superHeavyLayout('R2'), fins: 4, enginePivot: 2.0, kind: 'sh'},
          {key: 'ship', name: 'SHIP', len: 52.1, dia: 9, dry: 95000, prop: 1500000, lox: 0.78, layout: shipLayout('R2', 'RV2'), enginePivot: 4.6, kind: 'ship', payloadMax: 60000}
        ]}
    },
    recoveries: {catch: 'Tháp bắt bằng đũa', expend: 'Bỏ booster xuống biển'},
    defaultRecovery: 'catch', payload: 20000, payloadName: 'Vệ tinh Starlink V3 (mô phỏng)'
  },
  falcon9: {
    name: 'Falcon 9', site: 'lc39a', fuel: 'RP-1',
    blurb: 'Tên lửa tái sử dụng bay nhiều nhất thế giới. 9 Merlin 1D, tầng 1 hạ cánh trên sà lan giữa biển hoặc về bãi.',
    blocks: {
      b5: {name: 'Block 5', height: 70,
        stages: [
          {key: 'booster', name: 'FALCON 9 · TẦNG 1', len: 41.2, dia: 3.66, dry: 25600, prop: 395700, lox: 0.72, layout: octaweb('M1D'), fins: 4, legs: 4, enginePivot: 2.0, kind: 'f9s1'},
          {key: 'ship', name: 'TẦNG 2', len: 13.6, dia: 3.66, dry: 4000, prop: 92670, lox: 0.72, layout: [{type: 'MV', x: 0, z: 0, ring: 'center'}], enginePivot: 0.5, kind: 'f9s2', fairing: {len: 13.1, dia: 5.2, mass: 1900}, payloadMax: 17500}
        ]}
    },
    recoveries: {asds: 'Hạ cánh trên sà lan', rtls: 'Quay về bãi LZ', expend: 'Không thu hồi'},
    defaultRecovery: 'asds', payload: 16500, payloadName: 'Starlink V2 Mini × 24'
  }
};
/* stage-level materials */
const VMAT = {};
function buildVehicleMaterials() {
  const steel = (rx, ry) => { const m = new THREE.MeshStandardMaterial({color: 0xffffff, map: TX.steelMap.clone(), roughnessMap: TX.steelRough.clone(), normalMap: TX.steelNormal.clone(), normalScale: new THREE.Vector2(0.55, 0.55), metalness: 1, roughness: 1, envMapIntensity: 1.1});
    [m.map, m.roughnessMap, m.normalMap].forEach(t => { t.repeat.set(rx, ry); t.needsUpdate = true; }); return m; };
  VMAT.shSteel = steel(4, 72.3 / 7.3); VMAT.shipSteel = steel(4, 34 / 7.3); VMAT.noseSteel = steel(4, 2.5);
  VMAT.scorch = new THREE.MeshStandardMaterial({color: 0x6b6460, map: TX.steelMap, metalness: 0.9, roughness: 0.55});
  VMAT.dark = new THREE.MeshStandardMaterial({color: 0x18191c, metalness: 0.6, roughness: 0.6});
  VMAT.tiles = new THREE.MeshStandardMaterial({color: 0xffffff, map: TX.tileMap.clone(), normalMap: TX.tileNormal.clone(), roughness: 0.82, metalness: 0});
  VMAT.tiles.map.repeat.set(1, 34 / 7); VMAT.tiles.normalMap.repeat.set(1, 34 / 7);
  VMAT.tilesNose = new THREE.MeshStandardMaterial({color: 0xffffff, map: TX.tileMap, normalMap: TX.tileNormal, roughness: 0.82, metalness: 0});
  VMAT.grid = new THREE.MeshStandardMaterial({color: 0x8f9399, metalness: 0.9, roughness: 0.45, alphaMap: TX.gridAlpha, alphaTest: 0.5, side: THREE.DoubleSide});
  VMAT.gridTi = new THREE.MeshStandardMaterial({color: 0x6e6a66, metalness: 0.8, roughness: 0.6, alphaMap: TX.gridAlpha, alphaTest: 0.5, side: THREE.DoubleSide});
  VMAT.frost = new THREE.MeshStandardMaterial({color: 0xf4f8ff, roughness: 0.95, metalness: 0, transparent: true, alphaMap: TX.frost, opacity: 0.5, depthWrite: false});
  VMAT.carbon = new THREE.MeshStandardMaterial({color: 0xffffff, map: TX.carbon, roughness: 0.55, metalness: 0.2});
  VMAT.white = new THREE.MeshStandardMaterial({color: 0xeceef1, roughness: 0.5, metalness: 0.05});
  VMAT.legs = new THREE.MeshStandardMaterial({color: 0x2c2e33, map: TX.carbon, roughness: 0.6, metalness: 0.2});
}
class Stage {
  constructor(def, rng, opts) {
    this.def = def; this.key = def.key; this.name = def.name; this.len = def.len; this.dia = def.dia; this.R = def.dia / 2;
    this.dry = def.dry; this.propMax = def.prop; this.prop = def.prop * (opts.propLoad || 1); this.extra = 0;
    this.engines = def.layout.map((e, i) => { const en = new Engine(e.type, e.x, e.z, e.ring, i, rng); en.stage = this; return en; });
    this.group = new THREE.Group(); this.anim = {fins: 0, legs: 0, frost: 1, finAng: 0};
    this.fairing = null; this.payloadMesh = null; this.light = null; this.bigPlume = null;
  }
  get mass() { return this.dry + this.prop + this.extra; }
  get A() { return Math.PI * this.R * this.R; }
  engineSet(name) {
    const E = this.engines, k = this.def.kind;
    if (name === 'all') return E;
    if (k === 'sh') { if (name === 'boost') return E.filter(e => e.ring !== 'outer'); if (name === 'land13') return E.filter(e => e.ring !== 'outer'); if (name === 'land3' || name === 'center') return E.filter(e => e.ring === 'center'); }
    if (k === 'f9s1') { if (name === 'center' || name === 'land1') return [E[0]]; if (name === 'three' || name === 'boost') return [E[0], E[1], E[5]]; }
    if (k === 'ship') { if (name === 'sl') return E.filter(e => e.ring === 'center'); if (name === 'vac') return E.filter(e => e.ring === 'vac'); }
    return E;
  }
}
/* ---------- 3D construction ---------- */
function cyl(r, h, y0, mat, seg = 64, open = true, thetaStart = 0, thetaLen = TAU) {
  const g = new THREE.CylinderGeometry(r, r, h, seg, 1, open, thetaStart, thetaLen); g.translate(0, y0 + h / 2, 0);
  const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; return m;
}
function ogive(r, L, n = 24) { const pts = []; for (let i = 0; i <= n; i++) { const u = i / n, y = u * L; const rr = r * Math.sqrt(Math.max(0, 1 - Math.pow(u, 1.7))); pts.push(new THREE.Vector2(Math.max(rr, 0.001), y)); } return pts; }
function gridFin(w, d, th, mat) {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w, th, d), mat); frame.castShadow = true; g.add(frame);
  frame.position.z = d / 2; return g;
}
function addEngines(stage, pivotY) {
  stage.engineGroup = new THREE.Group(); stage.engineGroup.position.y = pivotY; stage.group.add(stage.engineGroup);
  stage.engines.forEach(e => stage.engineGroup.add(makeEngineView(e)));
  /* cluster light: the plume lights the vehicle, pad and steam (dynamic local illumination) */
  const L = new THREE.PointLight(0xffa060, 0, 0, 2); L.position.y = -6; stage.engineGroup.add(L); stage.light = L;
  /* merged plume of the whole cluster, visible when the plumes expand and merge at altitude */
  const clusterR = Math.max(...stage.engines.map(e => Math.hypot(e.x, e.z) + e.spec.re));
  const bp = new THREE.Mesh(PLUME_GEO, plumeMaterial(7.7)); bp.position.y = Math.min(...stage.engines.map(e => engineGeometry(e.spec.look).exitY)); bp.visible = false; bp.frustumCulled = false; bp.renderOrder = 4;
  bp.userData.R = clusterR; stage.engineGroup.add(bp); stage.bigPlume = bp;
}
function buildSuperHeavy(st) {
  const g = st.group, L = st.len, R = st.R;
  g.add(cyl(R + 0.05, 2.4, -0.4, VMAT.scorch));
  g.add(cyl(R, L - 1.8 - 2, 2, VMAT.shSteel));
  const d = new THREE.Mesh(new THREE.CircleGeometry(R, 64), VMAT.dark); d.rotation.x = Math.PI / 2; d.position.y = 2.0; g.add(d);
  /* vented hot-staging interstage: steel bars around a dark core */
  const ringY = L - 1.8, bars = [];
  for (let i = 0; i < 36; i++) { const a = i / 36 * TAU; bars.push([new THREE.BoxGeometry(0.42, 1.8, 0.35), M4(Math.cos(a) * (R - 0.15), ringY + 0.9, Math.sin(a) * (R - 0.15), 0, -a, 0)]); }
  bars.push([new THREE.CylinderGeometry(R, R, 0.25, 64, 1, true), M4(0, L - 0.12, 0)]);
  const hs = new THREE.Mesh(mergeTo(bars), VMAT.shSteel); hs.castShadow = true; g.add(hs);
  g.add(cyl(R - 0.6, 1.8, ringY, VMAT.dark, 48, false));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(R - 0.65, 48, 16, 0, TAU, 0, Math.PI / 2), VMAT.shSteel); dome.scale.y = 0.18; dome.position.y = L; g.add(dome);
  /* raceway + chines */
  const rw = new THREE.Mesh(new THREE.BoxGeometry(0.7, L - 8, 0.45), VMAT.shSteel); rw.position.set(Math.sin(1.25 * Math.PI) * (R + 0.15), (L - 8) / 2 + 3, Math.cos(1.25 * Math.PI) * (R + 0.15)); rw.rotation.y = 1.25 * Math.PI; rw.castShadow = true; g.add(rw);
  /* grid fins: block 3 has three ~50% larger fins 90° apart in a T, lower on the vehicle; block 2 has four */
  const n = st.def.fins, big = n === 3, fw = big ? 6.2 : 4.4, fd = big ? 4.4 : 3.2, fy = big ? L - 9 : L - 6.5;
  const angs = big ? [0, Math.PI / 2, Math.PI] : [Math.PI / 6, Math.PI * 5 / 6, Math.PI * 7 / 6, Math.PI * 11 / 6];
  st.finGroups = angs.map(a => { const piv = new THREE.Group(); piv.position.set(Math.sin(a) * R, fy, Math.cos(a) * R); piv.rotation.y = a; const f = gridFin(fw, fd, 0.9, VMAT.grid); piv.add(f); g.add(piv); return piv; });
  /* catch pins (hardpoints) the chopsticks lift on */
  for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.0, 1.4), VMAT.dark); p.position.set(sx * (R + 0.7), fy - 3.2, 0); g.add(p); }
  st.catchY = fy - 3.2;
  /* frost bands over the cryogenic tanks */
  const fr = new THREE.Group(); TX.frost.repeat.set(3, 6); fr.add(cyl(R + 0.04, 34, 5, VMAT.frost, 64), cyl(R + 0.04, 16, 46, VMAT.frost, 64)); fr.children.forEach(m => { m.castShadow = false; }); st.frost = fr; g.add(fr);
  addEngines(st, st.def.enginePivot);
}
function buildShip(st) {
  const g = st.group, R = st.R, body = 34;
  g.add(cyl(R, body, 0, VMAT.shipSteel));
  const nose = new THREE.Mesh(new THREE.LatheGeometry(ogive(R, st.len - body), 64), VMAT.noseSteel); nose.position.y = body; nose.castShadow = true; g.add(nose);
  /* heat-shield tiles on the windward half (≈18 000 silica hex tiles) */
  g.add(cyl(R + 0.04, body - 0.6, 0.6, VMAT.tiles, 64, true, Math.PI / 2, Math.PI));
  const tn = new THREE.Mesh(new THREE.LatheGeometry(ogive(R + 0.04, st.len - body - 0.4), 64, Math.PI / 2, Math.PI), VMAT.tilesNose); tn.position.y = body; g.add(tn);
  /* flaps: two forward, two aft, hinged at the tile line */
  const flap = (root, tip, span, y, side) => {
    const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(span, root * 0.18); s.lineTo(span, root * 0.18 + tip); s.lineTo(0, root); s.lineTo(0, 0);
    const geo = new THREE.ExtrudeGeometry(s, {depth: 0.45, bevelEnabled: false}); geo.translate(0, 0, -0.22);
    const m = new THREE.Mesh(geo, VMAT.tilesNose); m.castShadow = true; m.position.set(side * (R - 0.1), y, 0); if (side < 0) m.rotation.y = Math.PI; g.add(m); return m;
  };
  st.flaps = [flap(11, 7, 3.6, 0.8, 1), flap(11, 7, 3.6, 0.8, -1), flap(7.5, 3.5, 2.6, 38.5, 1), flap(7.5, 3.5, 2.6, 38.5, -1)];
  const d = new THREE.Mesh(new THREE.CircleGeometry(R, 64), VMAT.dark); d.rotation.x = Math.PI / 2; d.position.y = st.def.enginePivot; g.add(d);
  const fr = new THREE.Group(); fr.add(cyl(R + 0.03, 26, 5, VMAT.frost, 64, true, -Math.PI / 2, Math.PI)); st.frost = fr; g.add(fr);
  addEngines(st, st.def.enginePivot);
}
function buildF9S1(st, flights) {
  const g = st.group, R = st.R, tankTop = 36.6;
  const bodyMat = new THREE.MeshStandardMaterial({map: falconBodyTex(flights, 300 + flights), roughness: 0.52, metalness: 0.05});
  g.add(cyl(R + 0.03, 0.9, 0, VMAT.dark, 48));
  g.add(cyl(R, tankTop - 0.9, 0.9, bodyMat));
  g.add(cyl(R, 41.2 - tankTop, tankTop, VMAT.carbon));
  const d = new THREE.Mesh(new THREE.CircleGeometry(R, 48), VMAT.dark); d.rotation.x = Math.PI / 2; d.position.y = 0.9; g.add(d);
  /* titanium grid fins, stowed flat against the interstage until after staging */
  st.finGroups = [0, 1, 2, 3].map(i => {
    const a = i * Math.PI / 2 + Math.PI / 4, piv = new THREE.Group(); piv.position.set(Math.sin(a) * R, 40.4, Math.cos(a) * R); piv.rotation.y = a;
    const f = gridFin(1.25, 1.55, 0.28, VMAT.gridTi); piv.add(f); g.add(piv); return piv;
  });
  /* landing legs: carbon-fibre, hinged near the octaweb, folded up during ascent */
  st.legGroups = [0, 1, 2, 3].map(i => {
    const a = i * Math.PI / 2, piv = new THREE.Group(); piv.position.set(Math.sin(a) * (R + 0.18), 1.6, Math.cos(a) * (R + 0.18)); piv.rotation.y = a;
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.95, 7.8, 0.32), VMAT.legs); leg.position.set(0, 3.9, 0.16); leg.castShadow = true;
    const foot = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 1.2), VMAT.dark); foot.position.set(0, 7.8, 0.3);
    const inner = new THREE.Group(); inner.add(leg, foot); piv.add(inner); g.add(piv); return inner;
  });
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; const t = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.3), VMAT.dark); t.position.set(Math.sin(a) * (R + 0.1), 39, Math.cos(a) * (R + 0.1)); t.rotation.y = a; g.add(t); }
  addEngines(st, st.def.enginePivot);
}
function buildF9S2(st) {
  const g = st.group, R = st.R;
  g.add(cyl(R, st.len, 0, VMAT.white));
  const lab = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.01, R + 0.01, 3, 32, 1, true, -0.5, 1), new THREE.MeshStandardMaterial({map: wordTex('SPACEX', 512, 256, '#1f2533', '#eceef1', '800 150px "Saira Condensed",sans-serif'), roughness: 0.5}));
  lab.position.y = 6; g.add(lab);
  const d = new THREE.Mesh(new THREE.CircleGeometry(R, 48), VMAT.dark); d.rotation.x = Math.PI / 2; d.position.y = 0.02; g.add(d);
  /* payload: a stack of flat-packed Starlink satellites, hidden by the fairing until separation */
  const pay = new THREE.Group();
  for (let i = 0; i < 12; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.42, 1.6), new THREE.MeshStandardMaterial({color: i % 2 ? 0x3a3f48 : 0x2a2e36, metalness: 0.6, roughness: 0.4})); s.position.y = st.len + 0.6 + i * 0.5; pay.add(s); }
  g.add(pay); st.payloadMesh = pay;
  /* fairing: two clamshell halves with boattail */
  const F = st.def.fairing, fr = F.dia / 2, halves = [];
  const prof = [new THREE.Vector2(R + 0.02, 0), new THREE.Vector2(fr, 1.1), new THREE.Vector2(fr, 4.6)];
  ogive(fr, F.len - 4.6, 18).slice(1).forEach(p => prof.push(new THREE.Vector2(p.x, 4.6 + p.y)));
  for (const side of [0, 1]) {
    const geo = new THREE.LatheGeometry(prof, 40, side * Math.PI, Math.PI);
    const m = new THREE.Mesh(geo, VMAT.white); m.castShadow = true;
    const h = new THREE.Group(); h.position.y = st.len; h.add(m); g.add(h); halves.push(h);
  }
  st.fairing = halves; st.extra = F.mass;
  addEngines(st, st.def.enginePivot);
}
/* assemble a vehicle: stages stacked bottom → top inside one group (origin at the booster base) */
function buildVehicle(key, opts) {
  const V = VEHICLES[key], B = V.blocks[opts.block] || Object.values(V.blocks)[0];
  const rng = mulberry(opts.seed || 1);
  const stages = B.stages.map(d => new Stage(d, rng, opts));
  const flights = opts.flights || 0;
  stages.forEach(st => {
    const k = st.def.kind;
    if (k === 'sh') buildSuperHeavy(st); else if (k === 'ship') buildShip(st); else if (k === 'f9s1') buildF9S1(st, flights); else buildF9S2(st);
    if (k === 'f9s1') st.engines.forEach(e => { e.flights = flights; e.health = clamp(0.985 - flights * 0.004 - rng() * 0.06, 0.6, 1); });
    else st.engines.forEach(e => { e.flights = Math.floor(rng() * 4); e.health = clamp(0.93 + rng() * 0.07 - (rng() < 0.08 ? 0.25 : 0), 0.55, 1); });
  });
  /* stack offsets: Falcon's second stage sits on the interstage top, Ship on the hot-staging ring */
  let y = 0; stages.forEach(st => { st.stackY = y; y += st.len; });
  return {key, V, B, stages, height: y};
}
const _fwd = V3();
function updateStageVisual(st, dt) {
  const a = st.anim;
  if (st.finGroups) {
    if (st.def.kind === 'f9s1') st.finGroups.forEach(p => { p.children[0].rotation.x = lerp(-Math.PI / 2, 0, a.fins); p.children[0].rotation.z = a.finAng * a.fins; });
    else st.finGroups.forEach(p => { p.children[0].rotation.z = a.finAng; });
  }
  if (st.legGroups) st.legGroups.forEach(p => { p.rotation.x = 1.83 * smooth(a.legs); });
  if (st.frost) { st.frost.visible = a.frost > 0.02; VMAT.frost.opacity = 0.5 * a.frost; }
}
