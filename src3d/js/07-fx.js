/* ================= effects: particles (steam, smoke, contrails, twilight "jellyfish" gas, sparks, fireballs), vapour cone, trails ================= */
const PART_VS = `#include <common>\n#include <logdepthbuf_pars_vertex>
attribute vec3 aPos; attribute vec4 aCol; attribute vec2 aSR;
uniform vec3 uSun; uniform vec3 uSunCol; uniform vec3 uAmb; uniform vec4 uL0; uniform vec3 uL0c; uniform vec4 uL1; uniform vec3 uL1c; uniform float uGlow;
varying vec2 vUv; varying vec4 vCol; varying vec3 vLit;
void main(){
  vec4 mv=viewMatrix*vec4(aPos,1.); float c=cos(aSR.y), s=sin(aSR.y);
  vec2 q=vec2(c*position.x-s*position.y,s*position.x+c*position.y); mv.xy+=q*aSR.x;
  vUv=position.xy*0.5+0.5; vCol=aCol;
  if(uGlow>0.5){ vLit=vec3(1.); }
  else {
    vec3 ec=vec3(0.,-6371000.,0.); vec3 up=normalize(aPos-ec); float alt=max(length(aPos-ec)-6371000.,0.);
    float dip=acos(clamp(6371000./(6371000.+alt),0.,1.)); float el=asin(clamp(dot(uSun,up),-1.,1.))+dip;
    float sunVis=smoothstep(-0.015,0.02,el);
    vec3 lit=uAmb+uSunCol*sunVis*(0.5+0.2*position.y);
    float d0=distance(aPos,uL0.xyz); lit+=uL0c*uL0.w/(1.+d0*d0*0.006);
    float d1=distance(aPos,uL1.xyz); lit+=uL1c*uL1.w/(1.+d1*d1*0.006);
    vLit=lit;
  }
  gl_Position=projectionMatrix*mv;
  #include <logdepthbuf_vertex>
}`;
const PART_FS = `#include <logdepthbuf_pars_fragment>
uniform sampler2D uTex; varying vec2 vUv; varying vec4 vCol; varying vec3 vLit;
void main(){
  #include <logdepthbuf_fragment>
  vec4 t=texture2D(uTex,vUv); vec3 c=vCol.rgb*vLit; c=c/(1.+max(max(c.r,c.g),c.b)*0.35); /* soft-clip: lit smoke never blooms into a white-out */
  gl_FragColor=vec4(c,t.a*vCol.a);
}`;
class Particles {
  constructor(max, glow, tex) {
    this.max = max; this.n = 0; this.glow = glow;
    this.P = new Float32Array(max * 3); this.V = new Float32Array(max * 3); this.C = new Float32Array(max * 3);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max); this.s0 = new Float32Array(max); this.grow = new Float32Array(max);
    this.a0 = new Float32Array(max); this.rot = new Float32Array(max); this.rotV = new Float32Array(max); this.kind = new Uint8Array(max); this.drag = new Float32Array(max); this.buoy = new Float32Array(max);
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3)); g.setIndex([0, 1, 2, 0, 2, 3]);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aSR = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aPos', this.aPos); g.setAttribute('aCol', this.aCol); g.setAttribute('aSR', this.aSR); g.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {uTex: {value: tex}, uSun: {value: sunDir}, uSunCol: {value: new THREE.Color(1, 1, 1)}, uAmb: {value: new THREE.Color(0.3, 0.3, 0.35)},
        uL0: {value: new THREE.Vector4(0, 0, 0, 0)}, uL0c: {value: new THREE.Color(1, 0.6, 0.3)}, uL1: {value: new THREE.Vector4(0, 0, 0, 0)}, uL1c: {value: new THREE.Color(1, 0.6, 0.3)}, uGlow: {value: glow ? 1 : 0}},
      vertexShader: PART_VS, fragmentShader: PART_FS, transparent: true, depthWrite: false,
      blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = glow ? 6 : 3;
    scene.add(this.mesh); this.order = new Uint32Array(max); this.dist = new Float32Array(max);
  }
  emit(x, y, z, vx, vy, vz, life, size, grow, alpha, r, g, b, kind = 0, drag = 0.6, buoy = 0) {
    const cap = Math.floor(this.max * Q.particles);
    let i = this.n;
    if (i >= cap) { i = (Math.random() * this.n) | 0; } else this.n++;
    this.P[i * 3] = x; this.P[i * 3 + 1] = y; this.P[i * 3 + 2] = z; this.V[i * 3] = vx; this.V[i * 3 + 1] = vy; this.V[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life; this.s0[i] = size; this.grow[i] = grow; this.a0[i] = alpha; this.C[i * 3] = r; this.C[i * 3 + 1] = g; this.C[i * 3 + 2] = b;
    this.rot[i] = Math.random() * TAU; this.rotV[i] = (Math.random() - 0.5) * 0.4; this.kind[i] = kind; this.drag[i] = drag; this.buoy[i] = buoy;
  }
  update(dt, wind) {
    let j = 0;
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) continue;
      if (j !== i) this.copy(i, j);
      const k = j * 3, d = Math.exp(-this.drag[j] * dt);
      this.V[k] = wind[0] + (this.V[k] - wind[0]) * d; this.V[k + 1] = (this.V[k + 1]) * d + (this.kind[j] === 2 ? -9.8 * dt : this.buoy[j] * dt); this.V[k + 2] = wind[2] + (this.V[k + 2] - wind[2]) * d;
      this.P[k] += this.V[k] * dt; this.P[k + 1] += this.V[k + 1] * dt; this.P[k + 2] += this.V[k + 2] * dt;
      /* exhaust that reaches the ground spreads out sideways (deluge / flame trench) */
      const gy = surfaceY(this.P[k], this.P[k + 2]);
      if (this.P[k + 1] < gy + 0.5 * this.s0[j]) {
        this.P[k + 1] = gy + 0.5 * this.s0[j];
        if (this.V[k + 1] < 0) { const sp = -this.V[k + 1] * 0.55, hx = this.P[k] - padX, hz = this.P[k + 2] - padZ, hl = Math.hypot(hx, hz) || 1; this.V[k] += hx / hl * sp; this.V[k + 2] += hz / hl * sp; this.V[k + 1] = sp * 0.12; }
      }
      this.rot[j] += this.rotV[j] * dt;
      j++;
    }
    this.n = j;
  }
  copy(i, j) {
    for (let c = 0; c < 3; c++) { this.P[j * 3 + c] = this.P[i * 3 + c]; this.V[j * 3 + c] = this.V[i * 3 + c]; this.C[j * 3 + c] = this.C[i * 3 + c]; }
    this.life[j] = this.life[i]; this.maxLife[j] = this.maxLife[i]; this.s0[j] = this.s0[i]; this.grow[j] = this.grow[i]; this.a0[j] = this.a0[i];
    this.rot[j] = this.rot[i]; this.rotV[j] = this.rotV[i]; this.kind[j] = this.kind[i]; this.drag[j] = this.drag[i]; this.buoy[j] = this.buoy[i];
  }
  upload(cam) {
    const n = this.n, P = this.P;
    /* back-to-front for the alpha-blended system */
    if (!this.glow) {
      const cx = cam.x, cy = cam.y, cz = cam.z;
      for (let i = 0; i < n; i++) { this.order[i] = i; const dx = P[i * 3] - cx, dy = P[i * 3 + 1] - cy, dz = P[i * 3 + 2] - cz; this.dist[i] = dx * dx + dy * dy + dz * dz; }
      const o = this.order.subarray(0, n), D = this.dist; o.sort((a, b) => D[b] - D[a]);
    }
    const ap = this.aPos.array, ac = this.aCol.array, as = this.aSR.array;
    for (let m = 0; m < n; m++) {
      const i = this.glow ? m : this.order[m], age = 1 - this.life[i] / this.maxLife[i];
      ap[m * 3] = P[i * 3]; ap[m * 3 + 1] = P[i * 3 + 1]; ap[m * 3 + 2] = P[i * 3 + 2];
      const fadeIn = Math.min(1, age * 10), fadeOut = this.glow ? 1 - age : Math.pow(1 - age, 1.3);
      ac[m * 4] = this.C[i * 3]; ac[m * 4 + 1] = this.C[i * 3 + 1]; ac[m * 4 + 2] = this.C[i * 3 + 2]; ac[m * 4 + 3] = this.a0[i] * fadeIn * fadeOut;
      as[m * 2] = this.s0[i] + this.grow[i] * this.maxLife[i] * age; as[m * 2 + 1] = this.rot[i];
    }
    this.mesh.geometry.instanceCount = n;
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSR.needsUpdate = true;
    this.aPos.updateRanges = [{start: 0, count: n * 3}]; this.aCol.updateRanges = [{start: 0, count: n * 4}]; this.aSR.updateRanges = [{start: 0, count: n * 2}];
  }
  clear() { this.n = 0; this.mesh.geometry.instanceCount = 0; }
}
let smokeFX, glowFX, padX = 0, padZ = 0, padSurface = {r: 10, y: 0.6, deckR: 0, deckY: 0};
function surfaceY(x, z) {
  const d = Math.hypot(x - padX, z - padZ);
  if (padSurface.deckR && d < padSurface.deckR) return padSurface.deckY;
  return d < padSurface.r ? padSurface.y : 0;
}
function buildFX() {
  smokeFX = new Particles(MOBILE ? 2600 : 5200, false, TX.smoke);
  glowFX = new Particles(MOBILE ? 900 : 1800, true, TX.spark);
}
const _tmpV = V3(), _tmpV2 = V3();
/* light the smoke from the engine clusters */
function setSmokeLights(lights) {
  const u = smokeFX.mat.uniforms;
  const L = lights.slice(0, 2);
  [['uL0', 'uL0c'], ['uL1', 'uL1c']].forEach(([p, c], i) => { const l = L[i]; if (l) { u[p].value.set(l.pos.x, l.pos.y, l.pos.z, l.I); u[c].value.copy(l.col); } else u[p].value.w = 0; });
}
/* ---- vapour cone (Prandtl–Glauert condensation) around the vehicle near Mach 1 ---- */
function makeVaporCone() {
  const g = new THREE.CylinderGeometry(1, 1.9, 1, 40, 8, true);
  const m = new THREE.ShaderMaterial({
    uniforms: {uA: {value: 0}, uT: {value: 0}},
    vertexShader: `#include <common>\n#include <logdepthbuf_pars_vertex>\nvarying vec3 vN; varying vec3 vV; varying vec2 vUv; void main(){ vUv=uv; vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.); vV=-mv.xyz; gl_Position=projectionMatrix*mv;\n#include <logdepthbuf_vertex>\n}`,
    fragmentShader: `#include <logdepthbuf_pars_fragment>\nuniform float uA; uniform float uT; varying vec3 vN; varying vec3 vV; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
      float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
      void main(){\n#include <logdepthbuf_fragment>\n float f=1.-abs(dot(normalize(vN),normalize(vV))); float edge=smoothstep(0.,0.25,vUv.y)*(1.-smoothstep(0.55,1.,vUv.y));
        float n=n2(vec2(vUv.x*40.,vUv.y*6.-uT*3.))*0.6+0.4; gl_FragColor=vec4(vec3(0.92,0.94,0.97),uA*edge*n*(0.25+0.75*f)); }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(g, m); mesh.renderOrder = 4; mesh.visible = false; return mesh;
}
/* ---- trajectory trails ---- */
function makeTrail(color) {
  const N = 4000, g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3)); g.setDrawRange(0, 0);
  const l = new THREE.Line(g, new THREE.LineBasicMaterial({color, transparent: true, opacity: 0.75, depthWrite: false}));
  l.frustumCulled = false; l.userData.n = 0; l.userData.N = N; scene.add(l); return l;
}
function pushTrail(line, p) {
  const u = line.userData; if (u.n >= u.N) return;
  const a = line.geometry.attributes.position; a.setXYZ(u.n, p.x, p.y, p.z); u.n++;
  line.geometry.setDrawRange(0, u.n); a.needsUpdate = true; a.updateRanges = [{start: Math.max(0, (u.n - 2) * 3), count: 6}];
}
/* ---- explosions & bursts ---- */
const flashes = [];
function explosion(pos, scale = 1) {
  for (let i = 0; i < 160 * scale; i++) {
    const a = Math.random() * TAU, e = Math.random() * Math.PI - Math.PI / 2, s = (6 + Math.random() * 30) * Math.sqrt(scale);
    glowFX.emit(pos.x, pos.y, pos.z, Math.cos(a) * Math.cos(e) * s, Math.abs(Math.sin(e)) * s * 0.8 + 4, Math.sin(a) * Math.cos(e) * s, 1.2 + Math.random() * 1.6, 8 * scale, 14, 1.6, 1, 0.45 + Math.random() * 0.2, 0.12, 0, 1.1);
  }
  for (let i = 0; i < 120 * scale; i++) {
    const a = Math.random() * TAU, s = (3 + Math.random() * 16) * Math.sqrt(scale);
    smokeFX.emit(pos.x + (Math.random() - 0.5) * 10, pos.y + Math.random() * 10, pos.z + (Math.random() - 0.5) * 10, Math.cos(a) * s, 4 + Math.random() * 10, Math.sin(a) * s, 10 + Math.random() * 14, 10 * scale, 3.5, 0.85, 0.12, 0.1, 0.09, 0, 0.35, 2.2);
  }
  for (let i = 0; i < 80; i++) { const a = Math.random() * TAU, s = 20 + Math.random() * 60; glowFX.emit(pos.x, pos.y, pos.z, Math.cos(a) * s, 10 + Math.random() * 40, Math.sin(a) * s, 1 + Math.random() * 2, 1.2, 0, 1.5, 1, 0.7, 0.3, 2, 0.4); }
  const L = new THREE.PointLight(0xff8a3a, 4e5 * scale, 0, 2); L.position.copy(pos); scene.add(L); flashes.push({L, t: 0, I: 4e5 * scale});
}
function splash(pos) {
  for (let i = 0; i < 140; i++) { const a = Math.random() * TAU, s = 4 + Math.random() * 22; smokeFX.emit(pos.x, 1, pos.z, Math.cos(a) * s, 10 + Math.random() * 35, Math.sin(a) * s, 3 + Math.random() * 4, 4, 2.2, 0.9, 0.9, 0.93, 0.96, 2, 0.5); }
}
function sparkBurst(pos, n, col = [1, 0.6, 0.25], speed = 25) {
  for (let i = 0; i < n; i++) { const a = Math.random() * TAU, e = (Math.random() - 0.3) * 2, s = speed * (0.4 + Math.random()); glowFX.emit(pos.x, pos.y, pos.z, Math.cos(a) * s, e * s * 0.5, Math.sin(a) * s, 0.3 + Math.random() * 0.6, 0.6, 0, 1.5, col[0], col[1], col[2], 2, 0.8); }
}
function updateFlashes(dt) {
  for (let i = flashes.length - 1; i >= 0; i--) { const f = flashes[i]; f.t += dt; f.L.intensity = f.I * Math.exp(-f.t * 2.2); if (f.t > 3) { scene.remove(f.L); flashes.splice(i, 1); } }
}
