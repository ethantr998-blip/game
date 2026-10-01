/* ================= engines: real specs, individually modelled hardware, per-engine plume ================= */
/* thrust in N, Isp in s, chamber pressure in bar, lengths in m (exit radius re, throat radius rt) */
const ENG = {
  R3: {name: 'Raptor 3', short: 'RAPTOR 3', fuel: 'CH4', Fsl: 2.45e6, Fvac: 2.69e6, IspSl: 327, IspVac: 350, pc: 350, minThr: 0.4, gimbal: 15 * DEG, mass: 1525, spool: 1.6, look: 'r3', len: 3.1, re: 0.64, rt: 0.15, vac: false},
  R2: {name: 'Raptor 2', short: 'RAPTOR 2', fuel: 'CH4', Fsl: 2.26e6, Fvac: 2.45e6, IspSl: 327, IspVac: 347, pc: 300, minThr: 0.4, gimbal: 15 * DEG, mass: 1630, spool: 1.8, look: 'r2', len: 3.1, re: 0.64, rt: 0.15, vac: false},
  RV3: {name: 'Raptor 3 Vacuum', short: 'RVAC 3', fuel: 'CH4', Fsl: 1.6e6, Fvac: 2.75e6, IspSl: 230, IspVac: 380, pc: 350, minThr: 0.6, gimbal: 0, mass: 2100, spool: 2.0, look: 'rv3', len: 4.6, re: 1.15, rt: 0.15, vac: true},
  RV2: {name: 'Raptor 2 Vacuum', short: 'RVAC 2', fuel: 'CH4', Fsl: 1.5e6, Fvac: 2.53e6, IspSl: 230, IspVac: 378, pc: 300, minThr: 0.6, gimbal: 0, mass: 2200, spool: 2.2, look: 'rv2', len: 4.6, re: 1.15, rt: 0.15, vac: true},
  M1D: {name: 'Merlin 1D', short: 'MERLIN 1D', fuel: 'RP-1', Fsl: 845e3, Fvac: 914e3, IspSl: 282, IspVac: 311, pc: 97, minThr: 0.4, gimbal: 5 * DEG, mass: 470, spool: 1.0, look: 'm1d', len: 2.6, re: 0.46, rt: 0.115, vac: false},
  MV: {name: 'Merlin 1D Vacuum', short: 'MVAC', fuel: 'RP-1', Fsl: 420e3, Fvac: 981e3, IspSl: 180, IspVac: 348, pc: 97, minThr: 0.39, gimbal: 5 * DEG, mass: 490, spool: 1.2, look: 'mvac', len: 4.5, re: 1.5, rt: 0.115, vac: true}
};
class Engine {
  constructor(type, x, z, ring, idx, rng) {
    this.type = type; this.spec = ENG[type]; this.x = x; this.z = z; this.ring = ring; this.idx = idx;
    this.canGimbal = this.spec.gimbal > 0 && ring !== 'outer';
    const pre = type.startsWith('M') ? (type === 'MV' ? 'MVAC-' : 'M1D-') : (type.startsWith('RV') ? 'RVAC-' : (type === 'R3' ? 'R3-' : 'R2-'));
    this.serial = pre + String(100 + Math.floor(rng() * 899)).padStart(3, '0');
    this.flights = 0; this.health = 0.9 + rng() * 0.1;
    this.state = 'off'; this.tState = 0; this.thr = 0; this.cmd = 1;
    this.disabled = false; this.failed = false; this.failMsg = ''; this.failKind = '';
    this.burn = 0; this.heat = 0; this.gx = 0; this.gz = 0; this.flash = 0;
    this.view = null; this.stage = null;
  }
  F(p) { const s = this.spec, a = clamp(p / P0, 0, 1); return s.Fvac - (s.Fvac - s.Fsl) * a; }
  isp(p) { const s = this.spec, a = clamp(p / P0, 0, 1); return s.IspVac - (s.IspVac - s.IspSl) * a; }
  get running() { return this.state === 'startup' || this.state === 'run'; }
  get lit() { return this.running || (this.state === 'shutdown' && this.thr > 0.02); }
  start() {
    if (this.disabled || this.failed) return false;
    if (this.state === 'off' || this.state === 'shutdown') { this.state = 'startup'; this.tState = 0; this.flash = 1; }
    return true;
  }
  stop() { if (this.running) { this.state = 'shutdown'; this.tState = 0; } }
  fail(kind, msg) { if (this.failed) return; this.failed = true; this.failKind = kind; this.failMsg = msg; this.state = 'failed'; this.thr = 0; }
  step(dt) {
    this.tState += dt; this.flash = Math.max(0, this.flash - dt * 3);
    const s = this.spec;
    if (this.state === 'startup') { this.thr = clamp(this.tState / s.spool, 0, 1) * clamp(this.cmd, s.minThr, 1); if (this.tState >= s.spool) this.state = 'run'; }
    else if (this.state === 'run') this.thr = approach(this.thr, clamp(this.cmd, s.minThr, 1), dt * 1.4);
    else if (this.state === 'shutdown') { this.thr = approach(this.thr, 0, dt * 3.5); if (this.thr <= 0) this.state = 'off'; }
    else this.thr = 0;
    if (this.running) this.burn += dt;
    this.heat = approach(this.heat, this.running ? this.thr : 0, dt / (this.running ? 22 : 50));
  }
  statusText() {
    if (this.failed) return this.failMsg || 'Hỏng';
    if (this.disabled) return 'Loại khỏi chuyến bay';
    return {off: 'Tắt', startup: 'Đang khởi động', run: 'Đang cháy', shutdown: 'Đang tắt'}[this.state];
  }
}
/* ---------- hardware geometry ---------- */
function bellPoints(rt, re, yT, Ln, thN = 32 * DEG, thE = 8 * DEG, n = 18) {
  /* Rao thrust-optimised bell approximated by a quadratic Bézier between throat and exit tangents */
  const P0x = rt, P0y = yT, P2x = re, P2y = yT - Ln;
  const d0x = Math.sin(thN), d0y = -Math.cos(thN), d2x = Math.sin(thE), d2y = -Math.cos(thE);
  const det = d0x * (-d2y) - d0y * (-d2x), tt = ((P2x - P0x) * (-d2y) - (P2y - P0y) * (-d2x)) / det;
  const P1x = P0x + d0x * tt, P1y = P0y + d0y * tt, pts = [];
  for (let i = 1; i <= n; i++) { const u = i / n, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u; pts.push(new THREE.Vector2(a * P0x + b * P1x + c * P2x, a * P0y + b * P1y + c * P2y)); }
  return pts;
}
function tubeGeo(points, r, seg = 20) { return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => V3(...p))), seg, r, 8, false); }
const ENGINE_GEO = {};
function engineGeometry(look) {
  if (ENGINE_GEO[look]) return ENGINE_GEO[look];
  const steel = [], dark = [], copper = [], black = [];
  const I = new THREE.Matrix4();
  let noz, ext = null, exitY, exitR, glowY;
  const isMerlin = look === 'm1d' || look === 'mvac';
  const raptorHead = (style) => {
    if (style === 'r3') {
      /* Raptor 3: plumbing moved inside a smooth shell — no external lines, no heat shield needed */
      const prof = [[0.001, 0], [0.34, -0.02], [0.47, -0.14], [0.5, -0.42], [0.44, -0.72], [0.32, -0.92], [0.25, -1.02]].map(p => new THREE.Vector2(p[0], p[1]));
      steel.push([new THREE.LatheGeometry(prof, 36), I]);
      for (const sx of [-1, 1]) steel.push([new THREE.SphereGeometry(0.25, 20, 14), M4(sx * 0.36, -0.46, 0.04, 0, 0, 0, 1, 1.7, 1)]);
      steel.push([new THREE.TorusGeometry(0.43, 0.035, 8, 36), M4(0, -0.3, 0, Math.PI / 2)]);
    } else {
      /* Raptor 2: two turbopumps, preburners, hot-gas manifold, regen lines — the famous tangle of plumbing */
      steel.push([new THREE.LatheGeometry([[0.001, 0], [0.2, -0.04], [0.27, -0.16], [0.27, -0.34], [0.25, -0.5]].map(p => new THREE.Vector2(p[0], p[1])), 28), I]);
      for (const sx of [-1, 1]) {
        steel.push([new THREE.CylinderGeometry(0.17, 0.19, 0.56, 18), M4(sx * 0.43, -0.48, 0.06)]);
        steel.push([new THREE.SphereGeometry(0.17, 16, 10), M4(sx * 0.43, -0.2, 0.06, 0, 0, 0, 1, 0.6, 1)]);
        dark.push([new THREE.CylinderGeometry(0.11, 0.11, 0.42, 14), M4(sx * 0.25, -0.28, sx * 0.32)]);
        copper.push([tubeGeo([[sx * 0.43, -0.72, 0.06], [sx * 0.4, -0.95, 0.2], [sx * 0.3, -1.2, 0.28], [sx * 0.42, -1.75, 0.2]], 0.045), I]);
        copper.push([tubeGeo([[sx * 0.3, -0.1, -0.2], [sx * 0.5, -0.35, -0.3], [sx * 0.42, -0.9, -0.3], [sx * 0.3, -1.3, -0.25]], 0.035), I]);
        steel.push([tubeGeo([[sx * 0.25, -0.5, sx * 0.32], [sx * 0.2, -0.75, sx * 0.25], [sx * 0.1, -0.88, sx * 0.24]], 0.06), I]);
        dark.push([tubeGeo([[sx * 0.55, -0.3, 0.1], [sx * 0.62, -0.7, 0.0], [sx * 0.48, -1.3, -0.1], [sx * 0.46, -1.9, 0.05]], 0.025), I]);
      }
      steel.push([new THREE.TorusGeometry(0.3, 0.075, 10, 30), M4(0, -0.86, 0, Math.PI / 2)]);
      steel.push([new THREE.TorusGeometry(0.42, 0.045, 8, 36), M4(0, -1.95, 0, Math.PI / 2)]);
      for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; dark.push([tubeGeo([[Math.cos(a) * 0.32, -0.9, Math.sin(a) * 0.32], [Math.cos(a) * 0.38, -1.4, Math.sin(a) * 0.38], [Math.cos(a) * 0.43, -1.92, Math.sin(a) * 0.43]], 0.02, 10), I]); }
    }
    /* gimbal actuators */
    for (const [ax, az] of [[0.55, 0.15], [-0.15, 0.55]]) black.push([tubeGeo([[ax, -0.02, az], [ax * 0.7, -0.5, az * 0.7], [ax * 0.45, -0.95, az * 0.45]], 0.05, 8), I]);
  };
  if (!isMerlin) {
    const big = look === 'rv3' || look === 'rv2';
    raptorHead(look === 'r3' || look === 'rv3' ? 'r3' : 'r2');
    const yT = -1.36, prof = [new THREE.Vector2(0.25, -0.95), new THREE.Vector2(0.25, -1.18), new THREE.Vector2(0.18, -1.3), new THREE.Vector2(0.15, yT)];
    if (!big) {
      prof.push(...bellPoints(0.15, 0.64, yT, 3.1 + yT));
      noz = new THREE.LatheGeometry(prof, 40); exitY = -3.1; exitR = 0.64;
    } else {
      prof.push(...bellPoints(0.15, 0.48, yT, 0.9, 32 * DEG, 18 * DEG, 8));
      noz = new THREE.LatheGeometry(prof, 40);
      ext = new THREE.LatheGeometry([new THREE.Vector2(0.48, yT - 0.9), ...bellPoints(0.48, 1.15, yT - 0.9, 4.6 + yT - 0.9, 16 * DEG, 7 * DEG, 18)], 56);
      for (const y of [-2.6, -3.3, -4.0]) { const r = lerp(0.6, 1.12, (-y - 2.26) / 2.34); dark.push([new THREE.TorusGeometry(r + 0.02, 0.03, 6, 48), M4(0, y, 0, Math.PI / 2)]); }
      exitY = -4.6; exitR = 1.15;
    }
    glowY = yT;
  } else {
    /* Merlin 1D: gas-generator cycle — single turbopump beside the chamber, GG exhaust duct along the nozzle */
    steel.push([new THREE.LatheGeometry([[0.001, 0], [0.18, -0.04], [0.22, -0.16], [0.21, -0.3]].map(p => new THREE.Vector2(p[0], p[1])), 24), I]);
    steel.push([new THREE.CylinderGeometry(0.17, 0.17, 0.62, 16), M4(0.36, -0.36, 0.08, 0, 0, 0.25)]);
    steel.push([new THREE.SphereGeometry(0.16, 14, 10), M4(0.43, -0.08, 0.08)]);
    dark.push([new THREE.CylinderGeometry(0.09, 0.09, 0.3, 12), M4(-0.3, -0.25, 0.18)]);
    copper.push([tubeGeo([[0.36, -0.6, 0.1], [0.3, -0.75, 0.22], [0.12, -0.7, 0.22]], 0.04), I]);
    steel.push([tubeGeo([[-0.3, -0.12, 0.18], [-0.2, -0.3, 0.24], [-0.05, -0.32, 0.2]], 0.045), I]);
    for (const [ax, az] of [[0.4, -0.25], [-0.25, -0.4]]) black.push([tubeGeo([[ax, -0.02, az], [ax * 0.7, -0.35, az * 0.7], [ax * 0.45, -0.62, az * 0.45]], 0.035, 8), I]);
    const yT = -0.86, prof = [new THREE.Vector2(0.21, -0.3), new THREE.Vector2(0.2, -0.66), new THREE.Vector2(0.14, -0.8), new THREE.Vector2(0.115, yT)];
    if (look === 'm1d') {
      prof.push(...bellPoints(0.115, 0.46, yT, 2.6 + yT));
      noz = new THREE.LatheGeometry(prof, 36); exitY = -2.6; exitR = 0.46;
      black.push([tubeGeo([[0.4, -0.66, 0.1], [0.42, -1.2, 0.1], [0.5, -1.9, 0.12], [0.58, -2.45, 0.14]], 0.06, 16), I]);
    } else {
      prof.push(...bellPoints(0.115, 0.44, yT, 0.85, 32 * DEG, 20 * DEG, 8));
      noz = new THREE.LatheGeometry(prof, 36);
      ext = new THREE.LatheGeometry([new THREE.Vector2(0.44, yT - 0.85), ...bellPoints(0.44, 1.5, yT - 0.85, 4.5 + yT - 0.85, 18 * DEG, 6 * DEG, 20)], 64);
      steel.push([new THREE.TorusGeometry(0.47, 0.07, 8, 40), M4(0, yT - 0.82, 0, Math.PI / 2)]);
      exitY = -4.5; exitR = 1.5;
    }
    glowY = yT;
  }
  const m = list => list.length ? mergeTo(list) : null;
  return ENGINE_GEO[look] = {steel: m(steel), dark: m(dark), copper: m(copper), black: m(black), noz, ext, exitY, exitR, glowY, merlin: isMerlin};
}
const EMAT = {};
function buildEngineMaterials() {
  EMAT.steel = new THREE.MeshStandardMaterial({color: 0xa9adb4, metalness: 1, roughness: 0.3});
  EMAT.dark = new THREE.MeshStandardMaterial({color: 0x585c63, metalness: 1, roughness: 0.42});
  EMAT.copper = new THREE.MeshStandardMaterial({color: 0xc47c4a, metalness: 1, roughness: 0.36});
  EMAT.black = new THREE.MeshStandardMaterial({color: 0x17181b, metalness: 0.5, roughness: 0.6});
  EMAT.nozR = new THREE.MeshStandardMaterial({color: 0x9599a0, metalness: 1, roughness: 0.32, normalMap: TX.regenNormal, normalScale: new THREE.Vector2(0.7, 0.7), side: THREE.FrontSide});
  EMAT.nozM = new THREE.MeshStandardMaterial({color: 0x1d1e21, metalness: 0.65, roughness: 0.55, normalMap: TX.regenNormal, normalScale: new THREE.Vector2(0.5, 0.5)});
  EMAT.ext = new THREE.MeshStandardMaterial({color: 0x45474b, metalness: 0.85, roughness: 0.42, side: THREE.DoubleSide});
  EMAT.cover = new THREE.MeshStandardMaterial({color: 0xd2261d, roughness: 0.7, metalness: 0});
  EMAT.hi = new THREE.MeshBasicMaterial({color: 0x6cd4e8, transparent: true, opacity: 0.32, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending});
}
/* ---------- plume shader: per-engine flame with Mach diamonds, expanding with falling ambient pressure ---------- */
const PLUME_GEO = (() => { const g = new THREE.CylinderGeometry(1, 1, 1, 28, 48, true); g.translate(0, -0.5, 0); return g; })();
const PLUME_VS = `#include <common>\n#include <logdepthbuf_pars_vertex>
uniform float uLen; uniform float uR0; uniform float uExp;
varying float vT; varying vec3 vN; varying vec3 vV; varying float vAng;
void main(){
  float t=-position.y; float rad=uR0*(1.+uExp*(0.35*sqrt(t)+0.65*t));
  vec3 p=vec3(position.x*rad,-t*uLen,position.z*rad);
  vT=t; vAng=atan(position.z,position.x);
  vN=normalize(normalMatrix*vec3(position.x,uR0*uExp*0.6/max(uLen,0.01),position.z));
  vec4 mv=modelViewMatrix*vec4(p,1.); vV=-mv.xyz; gl_Position=projectionMatrix*mv;
  #include <logdepthbuf_vertex>
}`;
const PLUME_FS = `#include <logdepthbuf_pars_fragment>
uniform float uThr; uniform float uTime; uniform float uSeed; uniform float uInt; uniform float uDiam; uniform float uSpacing; uniform float uLen;
uniform vec3 uCore; uniform vec3 uMid; uniform vec3 uEdge; uniform vec3 uDiamCol;
varying float vT; varying vec3 vN; varying vec3 vV; varying float vAng;
float hs(float n){ return fract(sin(n)*43758.5453); }
float n1(float x){ float i=floor(x), f=fract(x); return mix(hs(i),hs(i+1.),f*f*(3.-2.*f)); }
void main(){
  #include <logdepthbuf_fragment>
  float f=abs(dot(normalize(vN),normalize(vV)));
  float t=vT;
  float turb=0.75+0.5*n1(t*9.-uTime*38.+uSeed*13.+vAng*1.7);
  float core=pow(f,3.2)*exp(-t*7.);
  float body=pow(f,1.4)*(1.-smoothstep(0.25,1.,t))*turb;
  float edge=pow(1.-f,1.5)*(1.-smoothstep(0.1,0.85,t))*turb;
  float dm=uDiam*pow(0.5+0.5*cos(t*uLen/uSpacing*6.2832),10.)*exp(-t*3.)*pow(f,2.5);
  vec3 c=uCore*core*3.5+uMid*body*1.25+uEdge*edge*0.55+uDiamCol*dm*5.;
  c*=uThr*uInt*(0.92+0.08*hs(floor(uTime*60.)+uSeed));
  gl_FragColor=vec4(c,1.);
}`;
function plumeMaterial(seed) {
  return new THREE.ShaderMaterial({
    uniforms: {uLen: {value: 10}, uR0: {value: 0.6}, uExp: {value: 0.2}, uThr: {value: 0}, uTime: {value: 0}, uSeed: {value: seed}, uInt: {value: 1}, uDiam: {value: 0}, uSpacing: {value: 1.5},
      uCore: {value: new THREE.Color()}, uMid: {value: new THREE.Color()}, uEdge: {value: new THREE.Color()}, uDiamCol: {value: new THREE.Color()}},
    vertexShader: PLUME_VS, fragmentShader: PLUME_FS,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide
  });
}
const PLUME_PAL = {
  CH4: {sl: [[1, 0.93, 0.86], [1, 0.56, 0.24], [1, 0.36, 0.14], [1, 0.86, 0.62]], vac: [[0.78, 0.82, 1], [0.42, 0.36, 0.95], [0.62, 0.3, 0.85], [0.72, 0.82, 1]]},
  'RP-1': {sl: [[1, 0.95, 0.8], [1, 0.6, 0.18], [0.9, 0.34, 0.08], [1, 0.9, 0.6]], vac: [[1, 0.82, 0.62], [0.95, 0.52, 0.24], [0.55, 0.32, 0.24], [1, 0.85, 0.6]]}
};
const _pc = [new THREE.Color(), new THREE.Color()];
function setPalette(mat, fuel, a, flash) {
  const P = PLUME_PAL[fuel], u = mat.uniforms, keys = ['uCore', 'uMid', 'uEdge', 'uDiamCol'];
  keys.forEach((k, i) => { _pc[0].setRGB(...P.sl[i]); _pc[1].setRGB(...P.vac[i]); u[k].value.copy(_pc[1]).lerp(_pc[0], a); });
  if (flash > 0 && fuel === 'RP-1') { /* TEA-TEB igniter: the green flash of a Merlin start */ u.uMid.value.lerp(_pc[0].setRGB(0.25, 1, 0.35), flash); u.uCore.value.lerp(_pc[0].setRGB(0.6, 1, 0.6), flash); }
}
/* ---------- one engine's visual: pivot (gimbal), hardware, hot interior, plume, covers, highlight ---------- */
function makeEngineView(eng) {
  const geo = engineGeometry(eng.spec.look), merlin = geo.merlin;
  const root = new THREE.Group(); root.position.set(eng.x, 0, eng.z);
  const gim = new THREE.Group(); root.add(gim);
  const detail = new THREE.Group(); gim.add(detail);
  const add = (g, m, grp = detail) => { if (!g) return null; const me = new THREE.Mesh(g, m); me.userData.engine = eng; grp.add(me); return me; };
  add(geo.steel, EMAT.steel); add(geo.dark, EMAT.dark); add(geo.copper, EMAT.copper); add(geo.black, EMAT.black);
  const nozMesh = add(geo.noz, merlin ? EMAT.nozM : EMAT.nozR, gim);
  const inner = new THREE.MeshStandardMaterial({color: 0x26262a, metalness: 0.6, roughness: 0.5, emissive: new THREE.Color(1, 0.45, 0.16), emissiveIntensity: 0, side: THREE.BackSide});
  add(geo.noz, inner, gim);
  let extMat = null;
  if (geo.ext) { extMat = EMAT.ext.clone(); extMat.emissive = new THREE.Color(1, 0.32, 0.08); extMat.emissiveIntensity = 0; add(geo.ext, extMat, gim); }
  const cover = new THREE.Mesh(new THREE.CylinderGeometry(geo.exitR * 1.03, geo.exitR * 1.03, 0.08, 32), EMAT.cover);
  cover.position.y = geo.exitY - 0.02; cover.visible = false; gim.add(cover);
  const hi = new THREE.Mesh(geo.ext || geo.noz, EMAT.hi); hi.scale.set(1.1, 1, 1.1); hi.visible = false; gim.add(hi);
  const pm = plumeMaterial(eng.idx * 1.37 + Math.random());
  const plume = new THREE.Mesh(PLUME_GEO, pm); plume.position.y = geo.exitY; plume.frustumCulled = false; plume.visible = false; plume.renderOrder = 5; gim.add(plume);
  eng.view = {root, gim, detail, inner, extMat, cover, hi, plume, geo, nozMesh};
  return root;
}
function updateEngineView(eng, amb, t, camDist) {
  const v = eng.view; if (!v) return;
  v.gim.rotation.set(eng.gx, 0, eng.gz);
  v.cover.visible = eng.disabled;
  v.detail.visible = camDist < 900;
  const lit = eng.lit && eng.thr > 0.005;
  v.inner.emissiveIntensity = lit ? 2.5 + 6 * eng.thr : (eng.failed ? 0.4 * Math.max(0, 1 - eng.tState / 6) : 0);
  if (eng.failed) v.inner.emissive.setRGB(1, 0.15, 0.05); else v.inner.emissive.setRGB(1, 0.45, 0.16);
  if (v.extMat) v.extMat.emissiveIntensity = eng.spec.look === 'mvac' ? eng.heat * 2.2 : eng.heat * 0.5;
  v.plume.visible = lit;
  if (lit) {
    const s = eng.spec, a = clamp(amb, 0, 1), u = v.plume.material.uniforms, D = s.re * 2;
    const vacFactor = s.vac ? 1.6 : 1;
    u.uLen.value = D * (13 + 30 * (1 - a)) * (0.55 + 0.45 * eng.thr) * vacFactor * (eng.state === 'startup' ? 0.4 + 0.6 * clamp(eng.tState / s.spool, 0, 1) : 1);
    u.uR0.value = s.re * 0.96;
    u.uExp.value = (s.vac ? 0.6 : 0.12) + (s.vac ? 3 : 6) * Math.pow(1 - a, 2);
    u.uInt.value = 1 / (1 + u.uExp.value * 0.55);
    u.uThr.value = Math.min(1, eng.thr * 1.1);
    u.uTime.value = t;
    u.uDiam.value = smooth((a - 0.15) / 0.5) * (s.vac ? 0.2 : 1);
    u.uSpacing.value = D * (0.9 + 0.8 * (1 - a));
    setPalette(v.plume.material, s.fuel, a, eng.flash);
  }
}
