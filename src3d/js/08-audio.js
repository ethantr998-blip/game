/* ================= spatial audio: propagation delay at 343 m/s, air absorption, thin-air fade, crackle, sonic booms ================= */
const SND = {ctx: null, master: null, dry: null, wet: null, conv: null, voices: [], amb: null, muted: store.get('muted', false), brown: null, white: null, crackle: null};
const C_SOUND = 343;
function audioInit() {
  if (SND.ctx || SND.muted) return;
  try {
    const A = SND.ctx = new (window.AudioContext || window.webkitAudioContext)(), sr = A.sampleRate;
    SND.master = A.createGain(); SND.master.gain.value = 0.9;
    const comp = A.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 6; comp.attack.value = 0.01; comp.release.value = 0.3;
    SND.master.connect(comp).connect(A.destination);
    SND.dry = A.createGain(); SND.dry.connect(SND.master);
    SND.conv = A.createConvolver(); SND.wet = A.createGain(); SND.wet.gain.value = 0.8; SND.wet.connect(SND.conv); SND.conv.connect(SND.master);
    /* open-field impulse response: long low rumble tail with distant reflections off the tower / buildings */
    const len = Math.floor(sr * 3.2), ir = A.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); let lp = 0; for (let i = 0; i < len; i++) { const t = i / sr, w = Math.random() * 2 - 1; lp += (w - lp) * clamp(0.5 - t * 0.12, 0.05, 0.5); d[i] = lp * Math.exp(-t * 2.1) * (i < sr * 0.02 ? i / (sr * 0.02) : 1); }
      [0.11, 0.27, 0.6].forEach((e, k) => { const at = Math.floor((e + c * 0.013) * sr); for (let j = 0; j < 600 && at + j < len; j++) d[at + j] += (Math.random() * 2 - 1) * 0.5 * Math.exp(-j / 160) * Math.pow(0.6, k); }); }
    SND.conv.buffer = ir;
    const mk = (fn, secs = 3) => { const b = A.createBuffer(1, sr * secs, sr), d = b.getChannelData(0); fn(d, sr); return b; };
    SND.brown = mk(d => { let l = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; l = (l + 0.02 * w) / 1.02; d[i] = l * 3.2; } });
    SND.white = mk(d => { for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; });
    /* rocket crackle: sparse N-wave-like shocks (the "popcorn" of a big rocket heard from afar) */
    SND.crackle = mk((d, sr) => { let i = 0; while (i < d.length) { i += Math.floor(sr * (0.004 + Math.random() * 0.03)); const a = 0.4 + Math.random() * 0.6, w = Math.floor(sr * (0.0006 + Math.random() * 0.0012)); for (let k = 0; k < w * 2 && i + k < d.length; k++) d[i + k] += (k < w ? a : -a) * (1 - k / (w * 2)); } });
    buildAmbience();
  } catch (e) { SND.ctx = null; }
}
function makeVoice() {
  const A = SND.ctx; if (!A) return null;
  const v = {};
  v.in = A.createGain(); v.in.gain.value = 0;
  const s1 = A.createBufferSource(); s1.buffer = SND.brown; s1.loop = true; v.lp = A.createBiquadFilter(); v.lp.type = 'lowpass'; v.lp.frequency.value = 400; s1.connect(v.lp).connect(v.in); s1.start(0, Math.random() * 2);
  const s2 = A.createBufferSource(); s2.buffer = SND.crackle; s2.loop = true; const hp = A.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 700; v.cr = A.createGain(); v.cr.gain.value = 0; s2.connect(hp).connect(v.cr).connect(v.in); s2.start(0, Math.random() * 2);
  const sub = A.createOscillator(); sub.frequency.value = 31; v.sub = A.createGain(); v.sub.gain.value = 0.25; sub.connect(v.sub).connect(v.in); sub.start();
  v.delay = A.createDelay(170); v.air = A.createBiquadFilter(); v.air.type = 'lowpass'; v.air.frequency.value = 12000;
  v.in.connect(v.delay).connect(v.air);
  let end = v.air; if (A.createStereoPanner) { v.pan = A.createStereoPanner(); v.air.connect(v.pan); end = v.pan; }
  v.dryG = A.createGain(); v.wetG = A.createGain(); end.connect(v.dryG).connect(SND.dry); end.connect(v.wetG).connect(SND.wet);
  return v;
}
/* where the sound is heard from: the camera, except on-board views which hear the structure */
const _rel = V3(), _right = V3();
function spatial(pos, onboard) {
  _rel.copy(pos).sub(camera.position); const d = Math.max(1, _rel.length());
  _right.set(1, 0, 0).applyQuaternion(camera.quaternion);
  const pan = onboard ? 0 : clamp(_rel.dot(_right) / d, -1, 1) * 0.8;
  return {d: onboard ? 3 : d, pan, delay: onboard ? 0 : Math.min(169, d / C_SOUND), gain: onboard ? 0.6 : 1 / (1 + d / 900), lp: onboard ? 900 : clamp(16000 / (1 + d / 3500), 260, 16000), wet: onboard ? 0.05 : clamp(0.25 + d / 30000, 0.25, 0.85)};
}
function updateVoice(i, pos, thrustN, srcAlt, crackK, onboard) {
  const A = SND.ctx; if (!A) return;
  const v = SND.voices[i] || (SND.voices[i] = makeVoice()); if (!v) return;
  const t = A.currentTime, s = spatial(pos, onboard);
  const thin = Math.sqrt(Math.exp(-Math.max(0, srcAlt) / 8000)); // sound barely carries out of thin air
  const lvl = SND.muted ? 0 : clamp(Math.sqrt(thrustN / 8e6), 0, 2.4) * s.gain * thin;
  v.in.gain.setTargetAtTime(lvl * 0.55, t, 0.08);
  v.cr.gain.setTargetAtTime(crackK * (0.5 + 0.5 * Math.random()), t, 0.03);
  v.lp.frequency.setTargetAtTime(onboard ? 260 : 380, t, 0.1);
  v.delay.delayTime.setTargetAtTime(s.delay, t, 0.12);
  v.air.frequency.setTargetAtTime(s.lp, t, 0.12);
  if (v.pan) v.pan.pan.setTargetAtTime(s.pan, t, 0.1);
  v.dryG.gain.setTargetAtTime(1 - s.wet * 0.5, t, 0.2); v.wetG.gain.setTargetAtTime(s.wet, t, 0.2);
}
function silenceVoices() { const A = SND.ctx; if (!A) return; SND.voices.forEach(v => v && v.in.gain.setTargetAtTime(0, A.currentTime, 0.3)); }
/* one-shot at a world position: arrives after distance / 343 s */
function sfx(kind, pos, vol = 1) {
  const A = SND.ctx; if (!A || SND.muted) return;
  const s = pos ? spatial(pos, false) : {d: 1, pan: 0, delay: 0, gain: 1, lp: 16000, wet: 0.2}, t0 = A.currentTime + s.delay;
  const out = A.createBiquadFilter(); out.type = 'lowpass'; out.frequency.value = s.lp;
  let end = out; if (A.createStereoPanner) { const p = A.createStereoPanner(); p.pan.value = s.pan; out.connect(p); end = p; }
  const g = A.createGain(); g.gain.value = s.gain * vol; end.connect(g); g.connect(SND.dry); const w = A.createGain(); w.gain.value = s.gain * vol * s.wet; end.connect(w).connect(SND.wet);
  const noise = (dur, f, q, type, v, att = 0.004, at = t0) => { const src = A.createBufferSource(); src.buffer = SND.white; const bq = A.createBiquadFilter(); bq.type = type; bq.frequency.value = f; bq.Q.value = q; const e = A.createGain(); e.gain.setValueAtTime(0.0001, at); e.gain.linearRampToValueAtTime(v, at + att); e.gain.exponentialRampToValueAtTime(0.0001, at + dur); src.connect(bq).connect(e).connect(out); src.start(at, Math.random() * 2, dur + 0.1); };
  const tone = (f0, f1, dur, type, v, at = t0) => { const o = A.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + dur); const e = A.createGain(); e.gain.setValueAtTime(v, at); e.gain.exponentialRampToValueAtTime(0.0001, at + dur); o.connect(e).connect(out); o.start(at); o.stop(at + dur + 0.05); };
  if (kind === 'boom') {
    /* N-wave pair; a returning booster is famous for a triple boom */
    [0, 0.13, 0.36].forEach((dt, k) => { tone(70, 30, 0.35, 'sine', 1.1 * Math.pow(0.8, k), t0 + dt); noise(0.12, 900, 0.5, 'lowpass', 1.0 * Math.pow(0.8, k), 0.002, t0 + dt); });
  } else if (kind === 'explosion') { noise(3.5, 300, 0.4, 'lowpass', 1.6, 0.01); tone(60, 22, 2.5, 'sine', 1.2); noise(0.6, 2500, 0.7, 'bandpass', 0.6, 0.003); }
  else if (kind === 'clank') { tone(420, 380, 0.9, 'triangle', 0.35); tone(1260, 1190, 0.6, 'sine', 0.15); noise(0.15, 3000, 1.5, 'bandpass', 0.3); }
  else if (kind === 'pop') { noise(0.25, 1200, 0.7, 'bandpass', 0.7, 0.002); tone(140, 50, 0.4, 'sine', 0.6); }
  else if (kind === 'splash') { noise(2.0, 900, 0.5, 'lowpass', 1.0, 0.02); }
  else if (kind === 'thud') { tone(90, 40, 0.5, 'sine', 0.8); noise(0.3, 600, 0.6, 'lowpass', 0.6); }
  else if (kind === 'vent') { noise(1.8, 4200, 0.6, 'highpass', 0.12, 0.2); }
  else if (kind === 'beep') { tone(880, 880, 0.12, 'square', 0.08); }
  else if (kind === 'beep2') { tone(1320, 1320, 0.16, 'square', 0.08); }
}
/* ambience: wind, surf, insects at night / gulls by day */
function buildAmbience() {
  const A = SND.ctx, a = SND.amb = {};
  a.g = A.createGain(); a.g.gain.value = 0; a.g.connect(SND.master);
  const w = A.createBufferSource(); w.buffer = SND.brown; w.loop = true; a.wf = A.createBiquadFilter(); a.wf.type = 'bandpass'; a.wf.frequency.value = 260; a.wf.Q.value = 0.6; a.wg = A.createGain(); a.wg.gain.value = 0.05; w.connect(a.wf).connect(a.wg).connect(a.g); w.start();
  const s = A.createBufferSource(); s.buffer = SND.white; s.loop = true; const sf = A.createBiquadFilter(); sf.type = 'lowpass'; sf.frequency.value = 700; a.sg = A.createGain(); a.sg.gain.value = 0; const lfo = A.createOscillator(); lfo.frequency.value = 0.11; const lg = A.createGain(); lg.gain.value = 0.02; lfo.connect(lg).connect(a.sg.gain); lfo.start(); s.connect(sf).connect(a.sg).connect(a.g); s.start(0, 1);
  a.ig = A.createGain(); a.ig.gain.value = 0; a.ig.connect(a.g);
  [4300, 4620].forEach((f, i) => { const o = A.createOscillator(); o.frequency.value = f; const gate = A.createGain(); gate.gain.value = 0.5; const l = A.createOscillator(); l.frequency.value = 23 + i * 4; const lgn = A.createGain(); lgn.gain.value = 0.5; l.connect(lgn).connect(gate.gain); l.start(); o.connect(gate).connect(a.ig); o.start(); });
}
function updateAmbience(on, camAlt, wind, night, nearCoast) {
  const A = SND.ctx, a = SND.amb; if (!A || !a) return;
  const t = A.currentTime, low = Math.exp(-camAlt / 400);
  a.g.gain.setTargetAtTime(on && !SND.muted ? 1 : 0, t, 0.6);
  a.wg.gain.setTargetAtTime((0.02 + 0.012 * wind) * (0.4 + 0.6 * low), t, 0.4);
  a.sg.gain.setTargetAtTime(0.05 * low * nearCoast, t, 0.5);
  a.ig.gain.setTargetAtTime(0.012 * night * low, t, 0.8);
}
function speak(text) {
  try { if (SND.muted || !window.speechSynthesis) return; const vs = speechSynthesis.getVoices().filter(v => /^vi/i.test(v.lang)); if (!vs.length) return; const u = new SpeechSynthesisUtterance(text); u.voice = vs[0]; u.lang = vs[0].lang; u.rate = 1.05; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) {}
}
const SND_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>';
const SND_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>';
function paintSnd() { $('#snd').innerHTML = SND.muted ? SND_OFF : SND_ON; $('#snd').title = SND.muted ? 'Bật âm thanh' : 'Tắt âm thanh'; }
$('#snd').onclick = () => { SND.muted = !SND.muted; store.set('muted', SND.muted); paintSnd(); if (!SND.muted) { audioInit(); if (SND.ctx && SND.ctx.state === 'suspended') SND.ctx.resume(); } if (SND.master) SND.master.gain.setTargetAtTime(SND.muted ? 0 : 0.9, SND.ctx.currentTime, 0.05); };
document.addEventListener('pointerdown', () => { if (SND.ctx) { if (SND.ctx.state === 'suspended') SND.ctx.resume(); } else audioInit(); }, {passive: true});
paintSnd();
