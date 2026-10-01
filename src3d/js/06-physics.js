/* ================= flight physics + guidance (2D trajectory plane on a rotating Earth) ================= */
/* atmosphere: 1976-standard temperature profile, exponential pressure fit */
function atmo(h, out) {
  h = Math.max(0, h);
  let T;
  if (h < 11000) T = 288.15 - 0.0065 * h; else if (h < 20000) T = 216.65; else if (h < 32000) T = 216.65 + 0.001 * (h - 20000);
  else if (h < 47000) T = 228.65 + 0.0028 * (h - 32000); else if (h < 51000) T = 270.65; else if (h < 71000) T = 270.65 - 0.0028 * (h - 51000);
  else if (h < 86000) T = 214.65 - 0.002 * (h - 71000); else T = 186.9;
  const p = P0 * Math.exp(-h / 7200);
  out.p = p; out.T = T; out.rho = p / (287.05 * T); out.a = Math.sqrt(401.87 * T);
  return out;
}
const cdFwd = M => M < 0.8 ? 0.34 : M < 1.15 ? lerp(0.34, 0.62, smooth((M - 0.8) / 0.35)) : 0.62 - 0.34 * smooth((M - 1.15) / 3);
const cdBack = M => 1.05 + 0.25 * Math.exp(-Math.pow((M - 1.1) / 0.5, 2));
/* vehicle-specific flight rules */
const RULES = {
  starship: {tVert: 10, kickDur: 14, qLim: 33000, mecoH: 64000, gam: {catch: 31, expend: 27}, reserve: {catch: 0.12, expend: 0.02}, ignMax: 6000, startLead: 4.5, abortOut: 3, flipRate: 16, landSets: ['land13', 'land3'], boostSet: 'boost', entry: false, orbitH: 200000, legOff: 0},
  falcon9: {tVert: 7, kickDur: 12, qLim: 32000, mecoH: 68000, gam: {asds: 30, rtls: 42, expend: 26}, reserve: {asds: 0.068, rtls: 0.16, expend: 0.006}, ignMax: 6500, startLead: 3.2, abortOut: 0, flipRate: 9, landSets: ['land1'], boostSet: 'three', entry: true, orbitH: 220000, legOff: 0.75}
};
const _A = {p: 0, T: 0, rho: 0, a: 0};
let OM_E = OMEGA * Math.cos(26 * DEG);
class Body {
  constructor(id, stages, flight) {
    this.id = id; this.stages = stages; this.f = flight;
    this.r = [0, RE]; this.v = [0, 0]; this.att = 0; this.attRate = 0; this.attCmd = 0; this.rateLimit = 3 * DEG;
    this.phase = 'pad'; this.fixed = true; this.ef = [0, RE]; this.efAtt = 0; this.alive = true; this.outcome = null;
    this.q = 0; this.mach = 0; this.h = 0; this.acc = 0; this.F = 0; this.amb = 1; this.latA = 0; this.thrCmd = 1; this.tPhase = 0;
    this.trail = []; this.trailT = -1; this.pred = null; this.predT = 0; this.target = null; this.events = new Set();
    this.group = new THREE.Group(); this.payload = 0; this.manual = false; this.tilt = 0; this.dragA = 0; this.deb = false;
    let y = 0; stages.forEach(s => { s.group.position.y = y; s.offset = y; this.group.add(s.group); y += s.len; });
    this.len = y;
  }
  get mass() { if (this.m0) return this.m0; let m = this.payload; for (const s of this.stages) m += s.mass; return m; }
  get stage() { return this.stages[0]; }
  get area() { let r = 0; for (const s of this.stages) { r = Math.max(r, s.R); if (s.fairing && s.fairing.length) r = Math.max(r, s.def.fairing.dia / 2); } return Math.PI * r * r; }
  /* Earth-fixed position (x east of pad along the surface plane, y from Earth centre) */
  toEF(t, out) { const th = OM_E * t, c = Math.cos(th), s = Math.sin(th); out[0] = this.r[0] * c - this.r[1] * s; out[1] = this.r[0] * s + this.r[1] * c; return out; }
  fromEF(t) { const th = OM_E * t, c = Math.cos(th), s = Math.sin(th), x = this.ef[0], y = this.ef[1]; this.r[0] = x * c + y * s; this.r[1] = -x * s + y * c; this.v[0] = OM_E * this.r[1]; this.v[1] = -OM_E * this.r[0]; this.att = th + this.efAtt; }
  fix(t, upright) { const e = this.toEF(t, [0, 0]); this.ef = e; this.efAtt = upright ? Math.atan2(e[0], e[1]) : this.att - OM_E * t; this.fixed = true; this.attRate = 0; }
  get downrange() { const e = this.toEF(this.f.t, [0, 0]); return RE * Math.atan2(e[0], e[1]); }
  upAngle() { return Math.atan2(this.r[0], this.r[1]); }
  vAir(out) { out[0] = this.v[0] - OM_E * this.r[1]; out[1] = this.v[1] + OM_E * this.r[0]; return out; }
  /* ground-relative vertical & horizontal speed */
  vRel() { const va = this.vAir([0, 0]), rr = Math.hypot(this.r[0], this.r[1]), ux = this.r[0] / rr, uy = this.r[1] / rr; return {vy: va[0] * ux + va[1] * uy, vx: va[0] * uy - va[1] * ux, v: Math.hypot(va[0], va[1])}; }
  engines() { return this.stage.engines; }
  thrustMax(set, p) { let F = 0; for (const e of set) if (!e.failed && !e.disabled) F += e.F(p); return F; }
  step(dt) {
    const f = this.f, t = f.t;
    if (this.fixed) { this.fromEF(t); this.h = Math.hypot(this.r[0], this.r[1]) - RE; if (this.stage) for (const e of this.engines()) e.step(dt); this.F = 0; return; }
    if (this.deb) {
      const rr = Math.hypot(this.r[0], this.r[1]); this.h = rr - RE; atmo(this.h, _A);
      const vax = this.v[0] - OM_E * this.r[1], vay = this.v[1] + OM_E * this.r[0], vr = Math.hypot(vax, vay) || 1, q = 0.5 * _A.rho * vr * vr, D = q * 1.2 * this.dragA / this.m0, g = MU / (rr * rr);
      this.v[0] += (-D * vax / vr - g * this.r[0] / rr + (this.side || 0) * (this.tPhase < 2 ? 1.5 : 0) * this.r[1] / rr) * dt;
      this.v[1] += (-D * vay / vr - g * this.r[1] / rr - (this.side || 0) * (this.tPhase < 2 ? 1.5 : 0) * this.r[0] / rr) * dt;
      this.r[0] += this.v[0] * dt; this.r[1] += this.v[1] * dt; this.att += (this.spin || 0) * dt; this.F = 0; return;
    }
    const x = this.r[0], y = this.r[1], rr = Math.hypot(x, y), ux = x / rr, uy = y / rr;
    this.h = rr - RE; atmo(this.h, _A); this.amb = _A.p / P0;
    const vax = this.v[0] - OM_E * y, vay = this.v[1] + OM_E * x, vr = Math.hypot(vax, vay);
    this.mach = vr / _A.a; this.q = 0.5 * _A.rho * vr * vr;
    /* engines */
    let F = 0, mdot = 0;
    const st = this.stage;
    for (const e of st.engines) {
      e.step(dt);
      if (e.thr > 0) { const fe = e.F(_A.p) * e.thr; F += fe; mdot += fe / (e.isp(_A.p) * G0); }
    }
    if (st.prop <= 0 && F > 0) { st.prop = 0; for (const e of st.engines) e.stop(); F = 0; mdot = 0; f.event('depleted', this, 'Hết nhiên liệu — ' + st.name); }
    this.F = F;
    /* attitude: rate-limited tracking of the guidance command */
    const err = wrapA(this.attCmd - this.att), maxAcc = 8 * DEG * (F > 0 || this.q > 2000 ? 1 : 0.5);
    const want = clamp(err * 1.6, -this.rateLimit, this.rateLimit);
    this.attRate = approach(this.attRate, want, maxAcc * dt); this.att = wrapA(this.att + this.attRate * dt);
    /* gimbal visuals follow the control effort */
    const gim = clamp((want - this.attRate) * 4 + this.attRate * 1.5, -1, 1);
    for (const e of st.engines) { const lim = e.canGimbal ? e.spec.gimbal : 0; e.gz = approach(e.gz, -gim * lim * 0.8 + Math.sin(t * 3 + e.idx) * 0.004 * lim, dt * 0.6); e.gx = approach(e.gx, Math.sin(t * 1.7 + e.idx * 2) * 0.05 * lim, dt * 0.2); }
    const ax0 = Math.sin(this.att), ay0 = Math.cos(this.att);
    /* aerodynamics: nose-first or engines-first drag, plus grid-fin lateral force */
    let Fx = F * ax0, Fy = F * ay0;
    if (vr > 0.5) {
      const ca = (ax0 * vax + ay0 * vay) / vr, cd = ca > 0 ? cdFwd(this.mach) * (0.6 + 0.4 * ca) + (1 - Math.abs(ca)) * 0.9 : cdBack(this.mach) * (0.55 + 0.45 * -ca) + (1 - Math.abs(ca)) * 0.9;
      const D = this.q * cd * (this.dragA || this.area);
      Fx -= D * vax / vr; Fy -= D * vay / vr;
    }
    const m = this.mass;
    if (this.latA) { Fx += uy * this.latA * m; Fy += -ux * this.latA * m; }
    const g = MU / (rr * rr);
    const axT = Fx / m - g * ux, ayT = Fy / m - g * uy;
    this.v[0] += axT * dt; this.v[1] += ayT * dt; this.r[0] += this.v[0] * dt; this.r[1] += this.v[1] * dt;
    this.acc = Math.hypot(Fx, Fy) / m;
    st.prop = Math.max(0, st.prop - mdot * dt);
  }
}
/* Kepler elements in the plane: perigee / apogee altitudes */
function orbitOf(b) {
  const r = Math.hypot(b.r[0], b.r[1]), v2 = b.v[0] * b.v[0] + b.v[1] * b.v[1], eps = v2 / 2 - MU / r;
  const hAng = b.r[0] * b.v[1] - b.r[1] * b.v[0], e = Math.sqrt(Math.max(0, 1 + 2 * eps * hAng * hAng / (MU * MU)));
  if (eps >= 0) return {peri: (hAng * hAng / MU) / (1 + e) - RE, apo: Infinity, e};
  const a = -MU / (2 * eps); return {peri: a * (1 - e) - RE, apo: a * (1 + e) - RE, e};
}
/* ballistic impact prediction for steering a returning booster (Earth-fixed downrange at touchdown) */
function predictImpact(b, targetAlt, extraLat = 0) {
  const r = [b.r[0], b.r[1]], v = [b.v[0], b.v[1]], m = b.mass, A = b.dragA || b.area; let t = b.f.t, n = 0;
  while (n++ < 3000) {
    const rr = Math.hypot(r[0], r[1]), h = rr - RE; if (h <= targetAlt && n > 1) break;
    atmo(h, _A);
    const vax = v[0] - OM_E * r[1], vay = v[1] + OM_E * r[0], vr = Math.hypot(vax, vay);
    const dt = clamp(h / 12000, 0.08, 2), q = 0.5 * _A.rho * vr * vr, D = q * cdBack(vr / _A.a) * A / m;
    const g = MU / (rr * rr), ux = r[0] / rr, uy = r[1] / rr;
    v[0] += (-D * vax / (vr || 1) - g * ux + uy * extraLat) * dt; v[1] += (-D * vay / (vr || 1) - g * uy - ux * extraLat) * dt;
    r[0] += v[0] * dt; r[1] += v[1] * dt; t += dt;
  }
  const th = OM_E * t, c = Math.cos(th), s = Math.sin(th);
  return {s: RE * Math.atan2(r[0] * c - r[1] * s, r[0] * s + r[1] * c), t};
}
/* ---------- the flight: countdown, events, staging, per-body guidance ---------- */
class Flight {
  constructor(cfg, veh, opts = {}) {
    this.cfg = cfg; this.veh = veh; this.rules = RULES[veh.key]; this.headless = !!opts.headless;
    this.t = opts.t0 != null ? opts.t0 : -12; this.bodies = []; this.log = []; this.queue = []; this.done = false; this.result = null;
    this.kick = opts.kick != null ? opts.kick : cfg.kick; this.maxQ = 0; this.maxQt = 0; this.qFlag = false; this.started = false; this.released = false; this.scrub = null;
    this.rng = mulberry(cfg.seed || 7); this.failures = !this.headless && cfg.failures; this.target = opts.target !== undefined ? opts.target : (cfg.landTarget || 0);
    OM_E = OMEGA * Math.cos((veh.V.site === 'starbase' ? 25.99 : 28.6) * DEG);
    const S = veh.stages, mount = SITEINFO[veh.V.site].mountH;
    const stack = new Body('stack', S.slice(), this);
    stack.ef = [0, RE + mount]; stack.efAtt = 0; stack.fromEF(this.t); stack.h = mount;
    stack.payload = cfg.payload; this.stack = stack; this.bodies.push(stack);
    this.booster = stack; this.upper = stack;
    this.catchBase = SITEINFO[veh.V.site].catchBase || 0;
    this.telemetry = [];
  }
  event(type, body, msg, extra) {
    const key = type + ':' + (body ? body.id : '');
    if (this.log.find(e => e.key === key) && !['fail', 'rud'].includes(type)) return;
    const e = {key, type, t: this.t, body: body ? body.id : null, msg, extra};
    this.log.push(e); this.queue.push(e);
  }
  has(type, body) { const key = type + ':' + (body ? body.id : ''); return this.log.some(e => e.key === key); }
  step(dt) {
    const R = this.rules, t = this.t;
    if (!this.released) this.countdown(dt);
    for (const b of this.bodies) {
      if (!b.alive) continue;
      b.tPhase += dt;
      this.guide(b, dt);
      b.step(dt);
      if (this.failures && !b.deb && b.stage) this.randomFailures(b, dt);
      if (!b.fixed && b.alive) this.checkGround(b);
    }
    if (this.stack && this.released) this.trackMaxQ(this.stack);
    if (this.released && this.t - (this.lastTel || -9) >= 1) { this.lastTel = this.t; for (const b of this.bodies) if (b.alive && !b.deb) { const rv = b.fixed ? {v: 0} : b.vRel(); this.telemetry.push([this.t, b.id, this.efX(b), b.h, rv.v]); } }
    this.t += dt;
  }
  countdown(dt) {
    const b = this.stack, R = this.rules, t = this.t, E = b.stage.engines;
    if (!this.started && t >= -R.startLead) {
      this.started = true; this.event('ignition', b, this.veh.key === 'starship' ? 'Khởi động 33 Raptor' : 'Khởi động 9 Merlin');
      /* staggered start: centre first, then rings, as on the real vehicles */
      E.forEach(e => { e.cmd = 1; e.startAt = -R.startLead + (e.ring === 'center' ? 0 : e.ring === 'inner' || e.ring === 'ring' ? 0.35 + (e.idx % 5) * 0.08 : 0.8 + (e.idx % 10) * 0.07); });
    }
    if (this.started) {
      for (const e of E) if (e.state === 'off' && !e.failed && !e.disabled && t >= e.startAt && !e.tried) {
        e.tried = true; e.start();
        if (this.failures && this.rng() < 0.002 + 0.25 * Math.pow(1 - e.health, 2)) { e.fail('start', 'Không đạt áp suất buồng đốt khi khởi động'); this.event('fail', b, `${e.serial} hỏng khi khởi động`, e); }
      }
    }
    if (t >= 0) {
      const out = E.filter(e => e.failed || e.disabled).length, F = b.thrustMax(E.filter(e => e.running), P0) * 0.98, W = b.mass * G0;
      if (out > R.abortOut && E.some(e => e.failed)) { this.abort(`Có ${out} động cơ không hoạt động — máy tính tự hủy phóng`); return; }
      if (F < W * 1.08) { this.abort(`Lực đẩy chỉ ${fmt(F / W, 2)} lần trọng lượng — không thể rời bệ`); return; }
      this.released = true; b.fixed = false; b.phase = 'ascent'; b.tPhase = 0; b.rateLimit = 2 * DEG;
      this.event('liftoff', b, 'Cất cánh!');
    }
  }
  abort(msg) {
    this.scrub = msg; this.released = true; this.done = true;
    for (const e of this.stack.stage.engines) e.stop();
    this.event('abort', this.stack, msg);
  }
  trackMaxQ(b) {
    if (b.q > this.maxQ) { this.maxQ = b.q; this.maxQt = this.t; }
    else if (!this.qFlag && this.maxQ > 8000 && b.q < this.maxQ * 0.97) { this.qFlag = true; this.event('maxq', b, 'Max-Q', fmt(this.maxQ / 1000, 1) + ' kPa'); }
  }
  randomFailures(b, dt) {
    for (const e of b.stage.engines) {
      if (!e.running || e.state === 'startup') continue;
      const lam = 0.00009 * (1 + 30 * Math.pow(1 - e.health, 2));
      if (this.rng() < lam * dt) {
        const rud = this.rng() < 0.2;
        e.fail(rud ? 'rud' : 'shutdown', rud ? 'Nổ động cơ (RUD)' : 'Tự tắt — cảm biến báo bất thường');
        this.event(rud ? 'rud' : 'fail', b, `${e.serial}: ${e.failMsg}`, e);
        if (rud) { const nb = b.stage.engines.filter(o => o !== e && o.running && Math.hypot(o.x - e.x, o.z - e.z) < 1.8); if (nb.length && this.rng() < 0.4) { const o = nb[0]; o.fail('collateral', 'Hư hại do động cơ bên cạnh nổ'); this.event('fail', b, `${o.serial}: hư hại lây`, o); } }
      }
    }
  }
  /* ---------- guidance ---------- */
  guide(b, dt) {
    const R = this.rules, t = this.t;
    if (b.fixed || b.phase === 'pad' || b.deb) return;
    if (b.phase === 'ascent') return this.guideAscent(b, dt);
    if (b.phase === 'stage') return this.guideStaging(b, dt);
    if (b.phase === 'orbit') return this.guideOrbit(b, dt);
    if (b.phase === 'coastUp') { const va = b.vAir([0, 0]); b.attCmd = Math.atan2(va[0], va[1]); b.rateLimit = DEG; if (b.tPhase > 7) { b.phase = 'orbit'; b.tPhase = 0; } return; }
    if (['sep', 'flip', 'boostback', 'coast', 'entry', 'aero', 'landing'].includes(b.phase)) return this.guideReturn(b, dt);
    if (b.phase === 'ballistic') { const va = b.vAir([0, 0]); b.attCmd = Math.atan2(-va[0], -va[1]); b.rateLimit = 2 * DEG; b.latA = 0; }
  }
  guideAscent(b, dt) {
    const R = this.rules, t = this.t, up = b.upAngle(), E = b.stage.engines;
    let cmd = up;
    if (t > R.tVert) {
      const k = smooth((t - R.tVert) / R.kickDur), kickA = up + this.kick * DEG * k;
      const va = b.vAir([0, 0]); const pro = Math.atan2(va[0], va[1]);
      cmd = t < R.tVert + R.kickDur ? kickA : Math.max(pro, up + 0.2 * DEG);
      if (t >= R.tVert + R.kickDur && t < R.tVert + R.kickDur + 6) cmd = lerp(kickA, cmd, (t - R.tVert - R.kickDur) / 6);
    }
    b.attCmd = cmd; b.rateLimit = 2.5 * DEG;
    if (!this.has('tower', b) && b.h > 200 + SITEINFO[this.veh.V.site].mountH) this.event('tower', b, 'Đã vượt khỏi tháp');
    /* throttle bucket around max-Q */
    const thr = b.q > R.qLim * 0.85 ? clamp(1 - (b.q - R.qLim * 0.85) / (R.qLim * 0.35), 0.62, 1) : 1;
    b.thrCmd = thr; for (const e of E) e.cmd = thr;
    /* MECO on reaching the propellant reserve for recovery */
    const res = R.reserve[this.cfg.recovery] != null ? R.reserve[this.cfg.recovery] : 0.02;
    if (b.stage.prop <= b.stage.propMax * res) this.beginStaging(b);
  }
  beginStaging(b) {
    b.phase = 'stage'; b.tPhase = 0; this.tMeco = this.t;
    const st = b.stage, E = st.engines;
    if (this.veh.key === 'starship') { E.filter(e => e.ring === 'outer').forEach(e => e.stop()); this.event('meco', b, 'MECO — tắt 20 động cơ vòng ngoài'); }
    else { E.forEach(e => e.stop()); this.event('meco', b, 'MECO — tắt máy tầng 1'); }
  }
  guideStaging(b, dt) {
    const tp = b.tPhase, st = b.stage, E = st.engines, upper = b.stages[1];
    const va = b.vAir([0, 0]); b.attCmd = Math.atan2(va[0], va[1]); b.rateLimit = 1 * DEG;
    if (this.veh.key === 'starship') {
      /* hot staging: booster keeps 3 centre engines lit at low throttle, Ship lights its Raptors while still attached */
      if (tp > 0.5) E.filter(e => e.ring === 'inner').forEach(e => e.stop());
      E.filter(e => e.ring === 'center').forEach(e => { e.cmd = 0.4; });
      if (tp > 2.2 && !this.has('hotstage', b)) {
        upper.engines.forEach(e => { e.cmd = 1; e.start(); });
        this.event('hotstage', b, 'Hot staging — Ship khởi động Raptor khi còn gắn với booster');
      }
      if (tp > 2.2) for (const e of upper.engines) e.step(dt);
      if (tp > 4.2) this.separate(b, 2.5);
    } else {
      if (tp > 3 && !this.has('sep', b)) this.separate(b, 0.6);
    }
  }
  separate(b, dv) {
    const lower = b.stages[0], uppers = b.stages.slice(1);
    const ub = new Body('upper', uppers, this);
    const ax = Math.sin(b.att), ay = Math.cos(b.att);
    ub.r = [b.r[0] + ax * lower.len, b.r[1] + ay * lower.len]; ub.v = [b.v[0] + ax * dv, b.v[1] + ay * dv];
    ub.att = b.att; ub.attCmd = b.att; ub.fixed = false; ub.phase = this.veh.key === 'starship' ? 'orbit' : 'coastUp'; ub.tPhase = 0; ub.payload = b.payload; ub.rateLimit = 1.5 * DEG;
    b.payload = 0; b.stages = [lower]; b.group.remove(...uppers.map(s => s.group)); b.len = lower.len; b.id = 'booster';
    b.v[0] -= ax * dv * 0.15; b.v[1] -= ay * dv * 0.15;
    b.phase = 'sep'; b.tPhase = 0; this.stack = null; this.booster = b; this.upper = ub;
    this.bodies.push(ub);
    this.event('sep', b, this.veh.key === 'starship' ? 'Tách tầng — Ship bay tiếp' : 'Tách tầng');
    lower.anim.fins = 1;
  }
  /* closed-loop insertion: steer the vertical speed toward a "coast-to-target" profile, cut off at circular speed */
  guideOrbit(b, dt) {
    const t = this.t, H = RE + (this.cfg.orbitH || this.rules.orbitH), st = b.stage;
    if (b.phase === 'orbit' && !b.ignited) {
      if (this.veh.key === 'falcon9') { st.engines.forEach(e => { e.cmd = 1; e.start(); }); this.event('ses', b, 'SES-1 — MVac khởi động'); }
      b.ignited = true;
    }
    const x = b.r[0], y = b.r[1], rr = Math.hypot(x, y), ux = x / rr, uy = y / rr, ex = uy, ey = -ux;
    const vr = b.v[0] * ux + b.v[1] * uy, vt = b.v[0] * ex + b.v[1] * ey;
    const gEff = MU / (rr * rr) - vt * vt / rr;
    /* time-to-go from the rocket equation for the speed still missing, then let vertical speed fall linearly to zero at cutoff */
    let mdot = 0, Fv = 0; atmo(b.h, _A); for (const e of st.engines) if (!e.failed && !e.disabled) { const fe = e.F(_A.p); Fv += fe; mdot += fe / (e.isp(_A.p) * G0); }
    const ve = Fv / Math.max(mdot, 1e-6), dvNeed = Math.max(0, Math.sqrt(MU / H) - vt) + Math.abs(vr) * 0.3, m = b.mass;
    const tgo = clamp((m - m * Math.exp(-dvNeed / Math.max(ve, 1))) / Math.max(mdot, 1e-6), 4, 900);
    const vrDes = clamp(2 * (H - rr) / tgo, -80, 1200);
    const aT = Math.max(b.F / b.mass, 0.5);
    const aR = (vrDes - vr) / clamp(tgo / 5, 6, 30) + gEff;
    const s = clamp(aR / aT, -0.4, 0.92), c = Math.sqrt(1 - s * s);
    b.attCmd = Math.atan2(ux * s + ex * c, uy * s + ey * c); b.rateLimit = 2.5 * DEG;
    if (st.fairing && st.fairing.length && b.h > 110000) this.jettisonFairing(b);
    const vc = Math.sqrt(MU / rr), o = orbitOf(b);
    if (!b.seco && st.engines.some(e => e.running)) {
      if (vt >= vc * 0.999 && o.peri > (H - RE) * 0.85) this.seco(b, o);
      else if (o.peri > H - RE + 40000) this.seco(b, o);
    }
    if (!b.seco && st.prop <= 0) { this.seco(b, o); }
  }
  seco(b, o) {
    b.seco = true; b.stage.engines.forEach(e => e.stop()); b.phase = 'coastOrbit'; b.tPhase = 0;
    const ok = o.peri > 120000;
    this.event('seco', b, ok ? `SECO — vào quỹ đạo ${fmt(o.peri / 1000)} × ${fmt(o.apo / 1000)} km` : `SECO — quỹ đạo dưới chuẩn (cận điểm ${fmt(o.peri / 1000)} km)`, o);
    b.orbit = o; b.outcome = ok ? 'orbit' : 'suborbital';
  }
  jettisonFairing(b) {
    const st = b.stage, halves = st.fairing; st.fairing = []; st.extra = 0;
    halves.forEach((h, i) => {
      const deb = new Body('fairing' + i, [], this); deb.deb = true; deb.fixed = false; deb.phase = 'debris';
      const ax = Math.sin(b.att), ay = Math.cos(b.att);
      deb.r = [b.r[0] + ax * st.len, b.r[1] + ay * st.len]; deb.v = [b.v[0], b.v[1]]; deb.att = b.att; deb.m0 = 950; deb.dragA = 20;
      deb.side = i ? 1 : -1; deb.spin = (i ? 1 : -1) * 0.8;
      st.group.remove(h); deb.group.add(h); h.position.y = 0;
      deb.debMesh = h;
      this.bodies.push(deb);
    });
    this.event('fairing', b, 'Tách vỏ chụp (fairing)');
  }
  /* returning booster: flip, boostback, coast with grid fins, entry burn, landing burn, catch / touchdown */
  guideReturn(b, dt) {
    const R = this.rules, rec = this.cfg.recovery, st = b.stage, E = st.engines, t = this.t, tp = b.tPhase;
    const va = b.vAir([0, 0]), retro = Math.atan2(-va[0], -va[1]), up = b.upAngle();
    const tgtAlt = this.landAlt(), tgtS = this.landS(b);
    if (rec === 'expend') { if (b.phase === 'sep' && tp > 3) { E.forEach(e => e.stop()); b.phase = 'ballistic'; } return; }
    const needBoost = rec === 'catch' || rec === 'rtls';
    if (b.phase === 'sep') {
      b.rateLimit = 2 * DEG; b.attCmd = Math.atan2(va[0], va[1]);
      if (tp > (this.veh.key === 'starship' ? 1.5 : 4)) { b.phase = needBoost ? 'flip' : 'coast'; b.tPhase = 0; if (needBoost) this.event('flip', b, 'Booster lật đầu chuẩn bị boostback'); }
      if (this.veh.key === 'starship') E.filter(e => e.ring === 'center').forEach(e => { e.cmd = 0.4; });
      return;
    }
    if (b.phase === 'flip') {
      /* thrust back toward the pad, nose slightly up */
      const tgt = up - 1.6;
      b.attCmd = tgt; b.rateLimit = R.flipRate * DEG;
      if (this.veh.key === 'starship' && tp > 1) st.engineSet('boost').forEach(e => { e.cmd = 0.6; e.start(); });
      if (Math.abs(wrapA(b.att - tgt)) < 8 * DEG && tp > 3) {
        b.phase = 'boostback'; b.tPhase = 0; st.engineSet(R.boostSet).forEach(e => { e.cmd = 1; e.start(); });
        this.event('boostback', b, 'Boostback — đốt ngược về bãi phóng');
      }
      return;
    }
    if (b.phase === 'boostback') {
      b.attCmd = up - 1.6; b.rateLimit = 6 * DEG;
      const near = b.pred && Math.abs(b.pred.s - tgtS) < 40000;
      if (t - b.predT > (near ? 0.04 : 0.5) || !b.pred) { b.pred = predictImpact(b, tgtAlt); b.predT = t; }
      const over = b.pred.s - tgtS, minProp = this.landingReserve(b);
      for (const e of st.engineSet(R.boostSet)) e.cmd = over < 25000 ? 0.45 : 1;
      if (over < (rec === 'catch' ? 300 : 150) || st.prop < minProp) {
        E.forEach(e => e.stop()); b.phase = 'coast'; b.tPhase = 0;
        this.event('boostbackEnd', b, 'Kết thúc boostback · dự đoán chạm cách đích ' + fmt(Math.abs(over)) + ' m');
      }
      return;
    }
    /* unpowered descent: engines-first, grid fins steer the impact point */
    if (b.phase === 'coast' || b.phase === 'aero' || b.phase === 'entry') {
      st.anim.fins = 1;
      if (b.phase === 'coast' && E.every(e => !e.running) && tp > 2) b.phase = 'aero';
      b.attCmd = retro; b.rateLimit = (b.q > 500 ? 5 : 3) * DEG;
      if (t - b.predT > 0.25 || !b.pred) { b.pred = predictImpact(b, tgtAlt); b.predT = t; }
      const err = b.pred.s - (tgtS + (this.aimOffset || 0)), aMax = Math.min(3.5, b.q / 4000) * (this.veh.key === 'starship' ? 1 : 1.2);
      b.latA = isNaN(this.target) && rec === 'asds' ? 0 : clamp(-err * 0.004, -aMax, aMax); st.anim.finAng = clamp(b.latA / Math.max(aMax, 0.1), -1, 1) * 0.3;
      const rv = b.vRel();
      if (R.entry && b.phase !== 'entry' && !this.has('entry', b) && b.h < (rec === 'rtls' ? 44000 : 62000) && rv.vy < 0 && rv.v > 950) {
        b.phase = 'entry'; b.tPhase = 0; b.entryV = rv.v; st.engineSet('three').forEach(e => { e.cmd = 1; e.start(); }); this.event('entry', b, 'Entry burn — 3 động cơ giảm tốc trước khi vào khí quyển dày');
      }
      if (b.phase === 'entry' && (rv.v < b.entryV * 0.55 + 220 || b.h < 30000 || b.tPhase > 22)) { E.forEach(e => e.stop()); b.phase = 'aero'; b.tPhase = 0; this.event('entryEnd', b, 'Kết thúc entry burn'); }
      if (b.phase === 'aero') this.maybeLandingBurn(b);
      return;
    }
    if (b.phase === 'landing') return this.landingControl(b, dt);
  }
  landS(b) { const rec = this.cfg.recovery; if (rec === 'rtls') return LZ_X; if (rec === 'asds') return isNaN(this.target) ? (b && b.pred ? b.pred.s : 0) : this.target; return 0; }
  landAlt() { const rec = this.cfg.recovery; if (rec === 'catch') return this.catchBase; if (rec === 'asds') return 2.0 + this.rules.legOff; return this.rules.legOff; }
  landingReserve(b) { return this.veh.key === 'starship' ? 26000 : 3200; }
  landingSet(b, i = 0) { return b.stage.engineSet(this.rules.landSets[i]); }
  maybeLandingBurn(b) {
    const set = this.landingSet(b), rv = b.vRel(), hT = b.h - this.landAlt();
    if (rv.vy >= 0 || hT > 16000) return;
    if (b.tPhase - (b.ignT || -9) < 0.08) return; b.ignT = b.tPhase;
    const stopAlt = this.predictStop(b, set, 0.8) - this.landAlt();
    if (stopAlt <= 35) {
      b.phase = 'landing'; b.tPhase = 0; b.landSet = 0; set.forEach(e => { e.cmd = 0.8; e.start(); });
      b.predAtIgn = b.pred ? b.pred.s : this.efX(b);
      this.event('landing', b, this.veh.key === 'starship' ? 'Landing burn — 13 Raptor' : 'Landing burn');
    }
  }
  /* integrate a hypothetical landing burn (thrust against the airflow, drag on) and report where vertical speed reaches zero */
  predictStop(b, set, frac) {
    const r = [b.r[0], b.r[1]], v = [b.v[0], b.v[1]], A = b.dragA || b.area; let m = b.mass, lag = set[0] ? set[0].spec.spool * 0.6 : 1, n = 0;
    while (n++ < 1200) {
      const rr = Math.hypot(r[0], r[1]), h = rr - RE, ux = r[0] / rr, uy = r[1] / rr; atmo(h, _A);
      const vax = v[0] - OM_E * r[1], vay = v[1] + OM_E * r[0], vr = Math.hypot(vax, vay) || 1;
      if (vax * ux + vay * uy >= 0) return h;
      if (h < -500) return h;
      const dt = 0.05, F = lag > 0 ? 0 : b.thrustMax(set, _A.p) * frac, D = 0.5 * _A.rho * vr * vr * cdBack(vr / _A.a) * A, g = MU / (rr * rr);
      lag -= dt;
      v[0] += (-(F + D) * vax / vr / m - g * ux) * dt; v[1] += (-(F + D) * vay / vr / m - g * uy) * dt;
      r[0] += v[0] * dt; r[1] += v[1] * dt; m -= F / (330 * G0) * dt;
    }
    return 0;
  }
  landingControl(b, dt) {
    const st = b.stage, rv = b.vRel(), hT = b.h - this.landAlt(), up = b.upAngle(), rec = this.cfg.recovery;
    const e0 = this.efX(b) - this.landS(b), e = isNaN(e0) || (isNaN(this.target) && rec === 'asds') ? 0 : e0;
    atmo(b.h, _A);
    let set = this.landingSet(b, b.landSet);
    const live = set.filter(x => x.running);
    const Fmax = Math.max(1, b.thrustMax(live.length ? live : set, _A.p));
    /* vertical: constant-deceleration solution far out, gentle descent-rate profile near the target */
    /* aim for a "gate" 8 m above the target at 2.5 m/s, then settle slowly (the hover-in of a catch / touchdown) */
    /* Falcon cannot hover (one Merlin at minimum throttle out-pushes the empty booster): hoverslam to zero at the deck */
    const canHover = this.veh.key === 'starship', hF = canHover ? 8 : 0, vF = canHover ? 2.5 : 0.9;
    let aUp;
    if (hT > hF + 1 && rv.vy < -vF) aUp = (rv.vy * rv.vy - vF * vF) / (2 * (hT - hF)) + G0;
    else if (canHover) { const vDes = -(1.0 + 0.18 * Math.max(hT, 0)); aUp = G0 + (vDes - rv.vy) / 0.6; }
    else aUp = G0 + (-0.9 - rv.vy) / 0.5;
    /* horizontal: E-guidance (zero position AND velocity error at touchdown) onto the pad / deck / chopsticks */
    const tgo = clamp(2 * Math.max(hT, 0) / Math.max(-rv.vy, 0.5), 1.2, 40);
    const maxTilt = (hT > 400 ? 28 : hT > 60 ? 14 : 6) * DEG;
    let ax = clamp(-6 * e / (tgo * tgo) - 4 * rv.vx / tgo, -Math.tan(maxTilt) * aUp, Math.tan(maxTilt) * aUp);
    b.attCmd = up + Math.atan2(ax, aUp);
    b.rateLimit = 9 * DEG; b.latA = 0; st.anim.finAng *= 0.97;
    let thr = b.mass * aUp / (Fmax * Math.max(0.5, Math.cos(b.att - up)));
    /* Super Heavy: drop from 13 to the 3 centre engines once 13 at minimum would decelerate too hard */
    const F3 = this.veh.key === 'starship' ? b.thrustMax(this.landingSet(b, 1), _A.p) : 0;
    if (this.veh.key === 'starship' && b.landSet === 0 && thr * Fmax < F3 * 0.8 && rv.v < 160) {
      b.landSet = 1; const keep = new Set(this.landingSet(b, 1)); set.forEach(x => { if (!keep.has(x)) x.stop(); }); set = this.landingSet(b, 1);
      this.event('land3', b, 'Còn 3 Raptor trung tâm');
    }
    if (this.veh.key === 'falcon9' && hT < 260 && !this.has('legs', b)) { this.event('legs', b, 'Bung chân hạ cánh'); }
    if (this.has('legs', b)) st.anim.legs = Math.min(1, st.anim.legs + dt / 2.2);
    /* the autopilot's answer is kept as the on-screen suggestion; in manual mode the player's stick drives the engines */
    b.autoThr = clamp(thr, 0, 1); b.autoTilt = Math.atan2(ax, aUp);
    if (b.manual && this.manualIn) { thr = this.manualIn.thr; b.attCmd = up + this.manualIn.tilt; }
    for (const x of set) x.cmd = clamp(thr, 0, 1);
    if (rv.vy > 0.6 && hT > 1.5 && !b.manual) for (const x of set) x.cmd = x.spec.minThr; /* climbing back: back off to minimum */
    if (!canHover && !b.manual && rv.vy > -0.2 && hT < 3) for (const x of set) x.stop(); /* hoverslam cut-off */
    if (rec === 'catch' && hT <= 0.25) this.resolveCatch(b, rv, e);
  }
  efX(b) { const ef = b.toEF(this.t, [0, 0]); return RE * Math.atan2(ef[0], ef[1]); }
  resolveCatch(b, rv, e) {
    const tilt = Math.abs(wrapA(b.att - b.upAngle()));
    if (Math.abs(rv.vy) < 3.5 && Math.abs(e) < 4.2 && Math.abs(rv.vx) < 2.5 && tilt < 6 * DEG) {
      b.stage.engines.forEach(x => x.stop()); b.fix(this.t, true); b.phase = 'caught'; b.outcome = 'caught';
      this.event('catch', b, 'ĐÃ BẮT ĐƯỢC BOOSTER!', {err: e, vy: rv.vy});
    } else if (!b.missed) { b.missed = true; this.event('miss', b, 'Trượt đũa! Lệch ' + fmt(Math.abs(e), 1) + ' m, rơi ' + fmt(Math.abs(rv.vy), 1) + ' m/s'); this.catchBase = 0; }
  }
  checkGround(b) {
    if (b.deb) { if (b.h < 0) { b.alive = false; b.group.visible = false; } return; }
    const rec = this.cfg.recovery, s = this.efX(b);
    let ground = 0, onDeck = false;
    if (b.id !== 'stack' && b.id !== 'upper') {
      if (rec === 'asds' && Math.abs(s - this.target) < 46) { ground = 2.0; onDeck = true; }
      if (rec === 'catch' && Math.abs(s) < 12) ground = SITEINFO[this.veh.V.site].mountH;
    }
    const base = ground + (b.phase === 'landing' && this.rules.legOff && b.stage.anim.legs > 0.5 ? this.rules.legOff : 0);
    if (b.h > base) return;
    const rv = b.vRel(), tilt = Math.abs(wrapA(b.att - b.upAngle()));
    b.stage.engines.forEach(x => x.stop());
    const ocean = s > SITEINFO[this.veh.V.site].coast && !onDeck;
    if (b.phase === 'landing' && b.stage.anim.legs > 0.8 && Math.abs(rv.vy) < 4.2 && Math.abs(rv.vx) < 3 && tilt < 8 * DEG && !ocean) {
      b.fix(this.t, true); b.phase = 'landed'; b.outcome = 'landed';
      this.event('landed', b, onDeck ? 'Hạ cánh thành công trên sà lan!' : 'Hạ cánh thành công tại LZ!', {err: s - this.landS(b), vy: rv.vy});
    } else {
      b.alive = ocean ? false : true; b.fix(this.t); b.phase = 'crashed'; b.outcome = ocean ? 'splash' : 'crash';
      if (b.id === 'upper' || b.id === 'stack') b.outcome = 'crash';
      this.event(ocean ? 'splash' : 'crash', b, ocean ? (rec === 'expend' ? 'Booster rơi xuống biển (theo kế hoạch)' : 'Rơi xuống biển') : 'Va chạm mặt đất — nổ', {v: rv.v});
    }
  }
}
const SITEINFO = {
  starbase: {name: 'Starbase, Texas', mountH: 21, catchBase: 35, coast: 1250},
  lc39a: {name: 'LC-39A, Florida', mountH: 16.2, catchBase: 0, coast: 3500}
};
/* ---------- pre-flight planning: pick the pitch kick for the target MECO altitude, then locate the droneship ---------- */
function planFlight(cfg, vehKey, block) {
  const mk = () => buildVehicleHeadless(vehKey, block, cfg);
  const run = (kick, untilSep, target, aim) => {
    const veh = mk(), f = new Flight(Object.assign({}, cfg, {failures: false}), veh, {headless: true, kick, t0: -5, target});
    f.aimOffset = aim || 0;
    let guard = 0;
    while (guard++ < 60000) {
      f.step(0.05);
      if (f.done) return {f, scrub: true};
      if (untilSep && f.tMeco != null) return {f};
      if (!untilSep && f.booster && f.booster.id === 'booster' && (f.booster.fixed || !f.booster.alive || f.booster.phase === 'crashed') && f.upper && f.upper.seco) return {f};
      if (f.t > 1200) return {f};
    }
    return {f};
  };
  const R = RULES[vehKey];
  let lo = 0.3, hi = 14, best = 4;
  for (let i = 0; i < 9; i++) {
    const mid = (lo + hi) / 2, r = run(mid, true);
    if (r.scrub) return {kick: 4, scrub: true};
    const rv = r.f.booster.vRel(), gam = Math.asin(clamp(rv.vy / Math.max(rv.v, 1), -1, 1)) / DEG, gT = R.gam[cfg.recovery] || 30;
    best = mid;
    if (gam > gT) lo = mid; else hi = mid;
  }
  const out = {kick: best};
  /* full flight with this kick to find where the booster comes down (droneship placement) and check the orbit */
  out.aimOffset = 0;
  if (cfg.recovery === 'asds') {
    const r = run(best, false, NaN), b = r.f.booster;
    if (b && b.id === 'booster') { out.landTarget = r.f.efX(b); if (b.predAtIgn != null) out.aimOffset = b.predAtIgn - out.landTarget; }
  } else if (cfg.recovery === 'rtls' || cfg.recovery === 'catch') {
    const r = run(best, false, undefined, 0), b = r.f.booster;
    if (b && b.id === 'booster' && b.predAtIgn != null) out.aimOffset = b.predAtIgn - r.f.efX(b);
  }
  const r2 = run(best, false, out.landTarget, out.aimOffset);
  out.meco = r2.f.tMeco; out.orbit = r2.f.upper && r2.f.upper.orbit; out.secoT = r2.f.log.find(e => e.type === 'seco');
  out.trace = r2.f.telemetry; out.log = r2.f.log;
  return out;
}
function buildVehicleHeadless(key, block, cfg) {
  const V = VEHICLES[key], B = V.blocks[block] || Object.values(V.blocks)[0], rng = mulberry(cfg.seed || 1);
  const stages = B.stages.map(d => new Stage(d, rng, cfg));
  /* same aerodynamic + mass model as the visual vehicle: fairing present (wide drag area) until jettison */
  stages.forEach((st, i) => { if (st.def.fairing) { st.extra = st.def.fairing.mass; st.fairing = [new THREE.Group(), new THREE.Group()]; } st.engines.forEach((e, j) => { const src = cfg.engineState && cfg.engineState[i] && cfg.engineState[i][j]; if (src) { e.disabled = src.disabled; e.health = src.health; } }); });
  return {key, V, B, stages};
}
