/* ================= world: sky, sun, ground on the real sphere, Earth from orbit, clouds, launch sites ================= */
const EARTH_C = V3(0, -RE, 0); // Earth centre in the site-centred render frame (+x east, +y up, +z north)
const TOD = {
  day: {n: 'Ban ngày', el: 52, az: 140},
  dawn: {n: 'Bình minh', el: 3, az: 98},
  dusk: {n: 'Hoàng hôn', el: -3.5, az: 262},
  night: {n: 'Ban đêm', el: -32, az: 300}
};
const sunDir = V3(0, 1, 0), moonDir = V3(-0.4, 0.6, -0.5).normalize();
function setSun(key) {
  const p = TOD[key] || TOD.day, el = p.el * DEG, az = p.az * DEG;
  sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
  moonDir.set(-sunDir.x, Math.max(0.35, -sunDir.y), -sunDir.z).normalize();
}
/* ---- analytic sky (single-scatter Rayleigh + Mie, apparent horizon dips with altitude, limb glow, stars) ---- */
const SKY_GLSL = `
const float RE_=6371000.;
float airmass(float e){ e=max(e,0.); float d=degrees(e); return 1./(sin(e)+0.50572*pow(d+6.07995,-1.6364)); }
float h31(vec3 p){ p=fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
vec3 skyColor(vec3 d, vec3 sun, vec3 up, float alt, float envMode, float stars){
  alt=max(alt,0.);
  float dip=acos(clamp(RE_/(RE_+alt),0.,1.));
  float e=asin(clamp(dot(d,up),-1.,1.))+dip;
  float sunEl=asin(clamp(dot(sun,up),-1.,1.))+dip;
  float dens=exp(-alt/8000.);
  vec3 bR=vec3(0.058,0.135,0.331)*0.8; vec3 bM=vec3(0.021); vec3 ext=bR+bM;
  float odV=dens*min(airmass(e),38.)+(1.-dens)*exp(-max(e,0.)*30.)*step(-0.003,e)*7.;
  float sunVis=smoothstep(-0.014,0.008,sunEl);
  float odS=dens*min(airmass(sunEl),38.)+(1.-dens)*exp(-max(sunEl,0.)*30.)*6.;
  vec3 Ts=exp(-ext*odS)*sunVis; vec3 Tv=exp(-ext*odV);
  float mu=dot(d,sun);
  float phR=0.0596831*(1.+mu*mu); float g=0.78; float phM=0.0795775*(1.-g*g)/pow(1.+g*g-2.*g*mu,1.5);
  vec3 col=vec3(34.)*Ts*(bR*phR+bM*phM)/ext*(1.-Tv);
  col+=vec3(0.010,0.016,0.032)*dens*smoothstep(-0.3,0.05,sunEl)*(1.-Tv);
  col+=vec3(0.0006,0.0008,0.0015)*(1.-Tv*0.5);
  if(e<0.){ float k=smoothstep(0.,-0.03,e); vec3 gnd=vec3(0.035,0.05,0.06)*(0.08+0.92*clamp(dot(sun,up)+0.05,0.,1.))*sunVis*6.; col=mix(col,gnd+col*0.35,k*envMode+k*0.6*(1.-envMode)); }
  if(envMode<0.5){
    float sd=smoothstep(0.99995,0.999985,mu); col+=Ts*sd*900.;
    col+=Ts*pow(max(mu,0.),900.)*6.;
    float night=clamp(1.-dot(col,vec3(0.3,0.5,0.2))*25.,0.,1.)*step(0.,e);
    vec3 sp=d*620.; vec3 ip=floor(sp); float hh=h31(ip);
    if(hh>0.9965){ vec3 fp=fract(sp)-0.5; float s=smoothstep(0.11,0.0,length(fp)); col+=vec3(0.9,0.95,1.)*s*night*stars*(0.4+(hh-0.9965)*300.)*Tv; }
  }
  return col;
}`;
function skyMaterial(envMode) {
  return new THREE.ShaderMaterial({
    uniforms: {uSun: {value: sunDir}, uUp: {value: V3(0, 1, 0)}, uAlt: {value: 0}, uEnv: {value: envMode}, uStars: {value: 1}, uMoon: {value: moonDir}},
    vertexShader: `varying vec3 vDir; void main(){ vDir=normalize((modelMatrix*vec4(position,0.)).xyz); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: SKY_GLSL + `
uniform vec3 uSun; uniform vec3 uUp; uniform float uAlt; uniform float uEnv; uniform float uStars; uniform vec3 uMoon; varying vec3 vDir;
void main(){ vec3 d=normalize(vDir); vec3 c=skyColor(d,uSun,uUp,uAlt,uEnv,uStars);
  if(uEnv<0.5){ float m=dot(d,uMoon); c+=vec3(0.75,0.78,0.85)*smoothstep(0.99990,0.999935,m)*1.2*(1.-smoothstep(0.,0.2,dot(uSun,uUp))); }
  gl_FragColor=vec4(c,1.); }`,
    side: THREE.BackSide, depthWrite: false, depthTest: false
  });
}
/* JS twin of the sky function: sun colour reaching a point at altitude `alt` */
function airmassJS(e) { e = Math.max(e, 0); const d = e / DEG; return 1 / (Math.sin(e) + 0.50572 * Math.pow(d + 6.07995, -1.6364)); }
function sunTransmit(alt, out) {
  alt = Math.max(alt, 0);
  const dip = Math.acos(clamp(RE / (RE + alt), 0, 1)), sunEl = Math.asin(clamp(sunDir.y, -1, 1)) + dip, dens = Math.exp(-alt / 8000);
  const vis = smooth((sunEl + 0.014) / 0.022), od = dens * Math.min(airmassJS(sunEl), 38) + (1 - dens) * Math.exp(-Math.max(sunEl, 0) * 30) * 6;
  const bR = [0.058 * 0.8, 0.135 * 0.8, 0.331 * 0.8];
  out.setRGB(Math.exp(-(bR[0] + 0.021) * od) * vis, Math.exp(-(bR[1] + 0.021) * od) * vis, Math.exp(-(bR[2] + 0.021) * od) * vis);
  return out;
}
let skyMesh, envScene, envSky, pmrem, envRT = null, envKey = '';
let sunLight, moonLight, ambLight;
function buildSky() {
  skyMesh = new THREE.Mesh(new THREE.SphereGeometry(1e6, 48, 24), skyMaterial(0));
  skyMesh.frustumCulled = false; skyMesh.renderOrder = -1000; scene.add(skyMesh);
  envScene = new THREE.Scene(); envSky = new THREE.Mesh(new THREE.SphereGeometry(50, 48, 24), skyMaterial(1)); envScene.add(envSky);
  pmrem = new THREE.PMREMGenerator(renderer);
  sunLight = new THREE.DirectionalLight(0xffffff, 6);
  sunLight.castShadow = Q.shadows;
  sunLight.shadow.mapSize.set(Q.shadowSize, Q.shadowSize);
  sunLight.shadow.bias = -0.0004; sunLight.shadow.normalBias = 0.04;
  scene.add(sunLight, sunLight.target);
  moonLight = new THREE.DirectionalLight(0x9fb4ff, 0); scene.add(moonLight, moonLight.target);
  ambLight = new THREE.AmbientLight(0x8090b0, 0.02); scene.add(ambLight);
  scene.fog = new THREE.FogExp2(0x9fb3cc, 1 / 60000);
}
function refreshEnv(alt) {
  const key = Math.round(Math.log2(1 + alt / 500)) + '|' + sunDir.x.toFixed(3) + sunDir.y.toFixed(3);
  if (key === envKey) return; envKey = key;
  envSky.material.uniforms.uAlt.value = alt;
  if (envRT) envRT.dispose();
  envRT = pmrem.fromScene(envScene, 0.02, 0.1, 100);
  scene.environment = envRT.texture;
}
const _sunCol = new THREE.Color(), _fogCol = new THREE.Color();
function updateSky(camPos, focusPos, camAlt, focusAlt, shadowSize) {
  skyMesh.position.copy(camPos);
  const up = _v1.copy(camPos).sub(EARTH_C).normalize();
  const u = skyMesh.material.uniforms; u.uUp.value.copy(up); u.uAlt.value = camAlt;
  envSky.material.uniforms.uUp.value.set(0, 1, 0);
  sunTransmit(focusAlt, _sunCol);
  sunLight.color.copy(_sunCol); sunLight.intensity = 7.5 * Math.max(_sunCol.r, 0.0001) > 0.0001 ? 7.5 : 0;
  sunLight.position.copy(focusPos).addScaledVector(sunDir, 3000); sunLight.target.position.copy(focusPos);
  const sc = sunLight.shadow.camera, s = shadowSize;
  if (sc.right !== s) { sc.left = -s; sc.right = s; sc.top = s; sc.bottom = -s; sc.near = 10; sc.far = 6000; sc.updateProjectionMatrix(); }
  const night = 1 - smooth((sunDir.y + 0.12) / 0.2);
  moonLight.intensity = 0.35 * night; moonLight.position.copy(focusPos).addScaledVector(moonDir, 3000); moonLight.target.position.copy(focusPos);
  ambLight.intensity = 0.03 + 0.05 * night;
  /* fog: horizon colour of the air at the camera, thinning with altitude */
  sunTransmit(0, _fogCol);
  const dayK = clamp(sunDir.y * 3 + 0.3, 0, 1);
  _fogCol.setRGB(lerp(0.02, 0.62, dayK) * (0.55 + 0.45 * _fogCol.r), lerp(0.025, 0.7, dayK) * (0.5 + 0.5 * _fogCol.g), lerp(0.05, 0.82, dayK) * (0.45 + 0.55 * _fogCol.b));
  scene.fog.color.copy(_fogCol);
  scene.fog.density = (1 / 70000) * Math.exp(-camAlt / 6000);
  renderer.toneMappingExposure = lerp(0.85, 2.2, night) * (camAlt > 40000 ? 0.9 : 1);
}
/* ---- shared GLSL for land / sea colouring (works on the near patch and on the whole-Earth sphere) ---- */
const TERRAIN_GLSL = `
uniform vec4 uCoast; uniform float uTime; uniform vec3 uPad; uniform float uPadR;
float h21(vec2 p){ p=mod(p,1024.); p=fract(p*vec2(0.1234,0.4567)); p+=dot(p,p+45.32); return fract(p.x*p.y*95.4); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1.,0.)),u.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),u.x),u.y); }
float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*vn(p); p=p*2.03+vec2(17.1,9.3); a*=.5; } return s; }
float coastX(float z){ return uCoast.x+uCoast.y*sin(z/uCoast.z)+uCoast.w*sin(z/(uCoast.z*0.31)+1.3)+900.*(fbm(vec2(z/9000.,3.7))-0.5)+0.000004*z*z; }
/* returns land mask (1 land, 0 water) and fills colour + roughness */
float terrain(vec2 p, out vec3 col, out float rough){
  float cx=coastX(p.y)+260.*(fbm(p/1800.)-0.5);
  float d=cx-p.x; // >0 land
  float land=smoothstep(-6.,6.,d);
  float flats=smoothstep(0.60,0.66,fbm(p/5200.+3.1))*smoothstep(500.,1500.,d)*(1.-smoothstep(9000.,14000.,d));
  float far=smoothstep(0.62,0.66,fbm(p/260000.+11.))*smoothstep(160000.,260000.,-d);
  land=max(land*(1.-flats),far);
  float dune=fbm(p/90.); float scrub=fbm(p/420.+5.);
  vec2 cell=floor(p/1400.); float field=h21(cell+31.);
  vec3 sand=vec3(0.60,0.53,0.40)*(0.85+0.3*dune);
  vec3 veg=mix(vec3(0.20,0.21,0.12),vec3(0.33,0.30,0.18),scrub);
  vec3 farm=mix(vec3(0.30,0.28,0.17),vec3(0.20,0.27,0.13),field)*(0.85+0.3*h21(cell+7.));
  float inland=smoothstep(250.,900.,d);
  vec3 lc=mix(sand,veg,inland); lc=mix(lc,farm,smoothstep(12000.,30000.,d)*0.8);
  lc=mix(lc,vec3(0.42,0.38,0.29)*(0.8+0.4*scrub),far);
  float pad=1.-smoothstep(uPadR*0.85,uPadR,length(p-uPad.xz));
  lc=mix(lc,vec3(0.42,0.42,0.40),pad*land);
  float shore=1.-smoothstep(0.,2200.,max(-d,0.));
  vec3 sea=mix(vec3(0.010,0.045,0.075),vec3(0.03,0.13,0.13),shore*0.8);
  sea=mix(sea,vec3(0.10,0.17,0.16),flats*0.6);
  float foam=(1.-smoothstep(0.,22.,abs(d+8.+6.*sin(uTime*0.7+p.y*0.05))))*(1.-land);
  sea=mix(sea,vec3(0.75,0.78,0.78),foam*0.6);
  col=mix(sea,lc,land);
  rough=mix(0.07+foam*0.5,0.92,land);
  return land;
}`;
let groundMesh, groundMat, groundCenter = V3(1e9, 0, 0), earthMesh, atmoMesh, cloudShell;
const terrainUniforms = {uCoast: {value: new THREE.Vector4(1300, 700, 7300, 300)}, uTime: {value: 0}, uPad: {value: V3()}, uPadR: {value: 140}};
function terrainMaterial(isSphere) {
  const m = new THREE.MeshStandardMaterial({color: 0xffffff, roughness: 0.9, metalness: 0});
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, terrainUniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvWP=(modelMatrix*vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;' + TERRAIN_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 tcol; float trough; vec2 tp=vec2(vWP.x,vWP.z); float tland=terrain(tp,tcol,trough); diffuseColor.rgb=tcol;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=trough;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        ${isSphere ? '' : `{ float dist=length(vWP-cameraPosition); float k=(1.-tland)*exp(-dist/9000.);
          vec2 q=tp; float t=uTime;
          float dx=0.08*cos(q.x*0.11+t*1.3)+0.05*cos(q.x*0.07+q.y*0.05+t*0.9)+0.03*cos(q.y*0.23-t*1.7)+0.12*(vn(q*0.35+t*0.4)-0.5);
          float dz=0.06*cos(q.y*0.09+t*1.1)+0.05*cos(q.x*0.05-q.y*0.08+t*0.8)+0.12*(vn(q*0.35+19.-t*0.4)-0.5);
          vec3 nw=normalize(vec3(-dx*k,1.,-dz*k)); vec3 nv=normalize((viewMatrix*vec4(nw,0.)).xyz); normal=normalize(mix(normal,nv,k)); }`}`);
  };
  m.customProgramCacheKey = () => 'terrain' + (isSphere ? 1 : 0);
  return m;
}
/* the near ground is a polar patch laid exactly on the sphere, re-centred under the camera as it travels */
const PATCH_R = 450e3, PATCH_RINGS = 96, PATCH_SEGS = 160;
function buildGround() {
  groundMat = terrainMaterial(false);
  const g = new THREE.BufferGeometry();
  const nV = 1 + PATCH_RINGS * PATCH_SEGS;
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nV * 3), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nV * 3), 3));
  const idx = [];
  for (let s = 0; s < PATCH_SEGS; s++) idx.push(0, 1 + s, 1 + (s + 1) % PATCH_SEGS);
  for (let r = 0; r < PATCH_RINGS - 1; r++) for (let s = 0; s < PATCH_SEGS; s++) {
    const a = 1 + r * PATCH_SEGS + s, b = 1 + r * PATCH_SEGS + (s + 1) % PATCH_SEGS, c = a + PATCH_SEGS, d = b + PATCH_SEGS;
    idx.push(a, c, b, b, c, d);
  }
  g.setIndex(idx);
  groundMesh = new THREE.Mesh(g, groundMat); groundMesh.receiveShadow = true; groundMesh.frustumCulled = false;
  scene.add(groundMesh);
  earthMesh = new THREE.Mesh(new THREE.SphereGeometry(RE - 600, 384, 192), terrainMaterial(true));
  earthMesh.position.copy(EARTH_C); earthMesh.visible = false; scene.add(earthMesh);
  atmoMesh = new THREE.Mesh(new THREE.SphereGeometry(RE + 90000, 160, 80), new THREE.ShaderMaterial({
    uniforms: {uSun: {value: sunDir}, uC: {value: EARTH_C}, uFade: {value: 0}},
    vertexShader: `#include <common>\n#include <logdepthbuf_pars_vertex>\nvarying vec3 vN; varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; vN=normalize(w.xyz-vec3(0.,-6371000.,0.)); gl_Position=projectionMatrix*viewMatrix*w;\n#include <logdepthbuf_vertex>\n}`,
    fragmentShader: `#include <logdepthbuf_pars_fragment>\nuniform vec3 uSun; uniform float uFade; varying vec3 vN; varying vec3 vW; void main(){\n#include <logdepthbuf_fragment>\n vec3 V=normalize(cameraPosition-vW); float f=1.-abs(dot(vN,V)); float rim=pow(f,5.)*2.2; float l=smoothstep(-0.25,0.3,dot(vN,uSun)); vec3 c=mix(vec3(1.0,0.45,0.2),vec3(0.35,0.6,1.0),smoothstep(0.,0.5,dot(vN,uSun)))*rim*l; gl_FragColor=vec4(c*uFade,1.); }`,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.FrontSide
  }));
  atmoMesh.position.copy(EARTH_C); atmoMesh.visible = false; scene.add(atmoMesh);
  cloudShell = new THREE.Mesh(new THREE.SphereGeometry(RE + 5000, 256, 128), new THREE.ShaderMaterial({
    uniforms: {uSun: {value: sunDir}, uFade: {value: 0}, uCover: {value: 0.5}},
    vertexShader: `#include <common>\n#include <logdepthbuf_pars_vertex>\nvarying vec3 vD; void main(){ vD=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);\n#include <logdepthbuf_vertex>\n}`,
    fragmentShader: `#include <logdepthbuf_pars_fragment>\nuniform vec3 uSun; uniform float uFade; uniform float uCover; varying vec3 vD;
      float h(vec3 p){ p=fract(p*0.3183+0.1)*17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      float n3(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
      void main(){\n#include <logdepthbuf_fragment>\n vec3 p=vD*90.; float s=0., a=.5; for(int i=0;i<6;i++){ s+=a*n3(p); p*=2.1; a*=.5; }
        float c=smoothstep(1.05-uCover*0.6,1.25-uCover*0.6,s+0.35); float l=clamp(dot(vD,uSun)*1.4+0.15,0.,1.);
        gl_FragColor=vec4(vec3(0.95)*l+0.02,c*uFade*0.92); }`,
    transparent: true, depthWrite: false
  }));
  cloudShell.position.copy(EARTH_C); cloudShell.visible = false; scene.add(cloudShell);
}
function rebuildGround(center) {
  groundCenter.copy(center);
  const nc = _v1.copy(center).sub(EARTH_C).normalize();
  const e1 = _v2.set(1, 0, 0).addScaledVector(nc, -nc.x).normalize(), e2 = _v3.crossVectors(nc, e1).normalize();
  const C = V3().copy(EARTH_C).addScaledVector(nc, RE);
  groundMesh.position.copy(C);
  const pos = groundMesh.geometry.attributes.position.array, nor = groundMesh.geometry.attributes.normal.array;
  const write = (i, th, az) => {
    const ct = Math.cos(th), st = Math.sin(th), ca = Math.cos(az), sa = Math.sin(az);
    const nx = nc.x * ct + (e1.x * ca + e2.x * sa) * st, ny = nc.y * ct + (e1.y * ca + e2.y * sa) * st, nz = nc.z * ct + (e1.z * ca + e2.z * sa) * st;
    pos[i * 3] = EARTH_C.x + nx * RE - C.x; pos[i * 3 + 1] = EARTH_C.y + ny * RE - C.y; pos[i * 3 + 2] = EARTH_C.z + nz * RE - C.z;
    nor[i * 3] = nx; nor[i * 3 + 1] = ny; nor[i * 3 + 2] = nz;
  };
  write(0, 0, 0);
  for (let r = 0; r < PATCH_RINGS; r++) {
    const rr = 6 * Math.pow(PATCH_R / 6, (r + 1) / PATCH_RINGS);
    for (let s = 0; s < PATCH_SEGS; s++) write(1 + r * PATCH_SEGS + s, rr / RE, s / PATCH_SEGS * TAU);
  }
  groundMesh.geometry.attributes.position.needsUpdate = true; groundMesh.geometry.attributes.normal.needsUpdate = true;
  groundMesh.geometry.computeBoundingSphere();
}
function updateGround(camPos, camAlt, t) {
  terrainUniforms.uTime.value = t;
  /* ground point under the camera */
  const g = _v1.copy(camPos).sub(EARTH_C).setLength(RE).add(EARTH_C);
  if (g.distanceTo(groundCenter) > Math.max(1500, camAlt * 0.25)) rebuildGround(g);
  const hi = smooth((camAlt - 8000) / 30000);
  earthMesh.visible = camAlt > 6000; atmoMesh.visible = camAlt > 12000; cloudShell.visible = camAlt > 15000;
  atmoMesh.material.uniforms.uFade.value = hi; cloudShell.material.uniforms.uFade.value = smooth((camAlt - 15000) / 25000);
}
/* ---- billboard cumulus / cirrus (instanced quads) ---- */
let cloudMesh = null;
function buildClouds(cover, seed) {
  if (cloudMesh) { scene.remove(cloudMesh); cloudMesh.geometry.dispose(); }
  const r = mulberry(seed), list = [];
  const nClusters = Math.round(cover * 120 * Q.clouds);
  for (let i = 0; i < nClusters; i++) {
    const cx = (r() - 0.35) * 70000, cz = (r() - 0.5) * 70000, alt = 1300 + r() * 1300, sz = 500 + r() * 900;
    if (Math.hypot(cx, cz) < 2500) continue;
    const n = 5 + (r() * 7 | 0);
    for (let k = 0; k < n; k++) list.push([cx + (r() - 0.5) * sz * 2, alt + r() * sz * 0.5, cz + (r() - 0.5) * sz * 1.4, sz * (0.6 + r() * 0.7), r() * TAU, 0.55 + r() * 0.4]);
  }
  for (let i = 0; i < Math.round(cover * 40); i++) list.push([(r() - 0.3) * 160000, 9000 + r() * 2500, (r() - 0.5) * 160000, 5000 + r() * 6000, r() * TAU, 0.18 + r() * 0.15]);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const off = new Float32Array(list.length * 3), prm = new Float32Array(list.length * 3);
  list.forEach((c, i) => { off.set([c[0], c[1], c[2]], i * 3); prm.set([c[3], c[4], c[5]], i * 3); });
  g.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 3));
  g.setAttribute('aPrm', new THREE.InstancedBufferAttribute(prm, 3));
  g.instanceCount = list.length;
  const m = new THREE.ShaderMaterial({
    uniforms: {uTex: {value: TX.cloud}, uSun: {value: sunDir}, uSunCol: {value: new THREE.Color(1, 1, 1)}, uAmb: {value: new THREE.Color(0.3, 0.35, 0.45)}, uFogCol: {value: new THREE.Color()}, uFogD: {value: 1e-5}, uWind: {value: V3()}},
    vertexShader: `#include <common>\n#include <logdepthbuf_pars_vertex>
      attribute vec3 aOff; attribute vec3 aPrm; uniform vec3 uWind; varying vec2 vUv; varying float vA; varying float vDist; varying float vY;
      void main(){ vec3 wp=aOff+uWind; vec4 mv=viewMatrix*vec4(wp,1.); float c=cos(aPrm.y), s=sin(aPrm.y); vec2 q=vec2(c*position.x-s*position.y,s*position.x+c*position.y);
        mv.xy+=q*aPrm.x; vUv=position.xy*0.5+0.5; vY=position.y; vDist=-mv.z; vA=aPrm.z*smoothstep(aPrm.x*0.6,aPrm.x*2.,-mv.z);
        gl_Position=projectionMatrix*mv;\n#include <logdepthbuf_vertex>\n}`,
    fragmentShader: `#include <logdepthbuf_pars_fragment>
      uniform sampler2D uTex; uniform vec3 uSunCol; uniform vec3 uAmb; uniform vec3 uFogCol; uniform float uFogD; varying vec2 vUv; varying float vA; varying float vDist; varying float vY;
      void main(){\n#include <logdepthbuf_fragment>\n vec4 t=texture2D(uTex,vUv); float lit=0.55+0.45*vY; vec3 c=uSunCol*lit*1.6+uAmb;
        float f=1.-exp(-pow(vDist*uFogD,2.)); c=mix(c,uFogCol,f); gl_FragColor=vec4(c,t.a*vA*(1.-f*0.7)); }`,
    transparent: true, depthWrite: false
  });
  cloudMesh = new THREE.Mesh(g, m); cloudMesh.frustumCulled = false; cloudMesh.renderOrder = 2; scene.add(cloudMesh);
}
function updateClouds(t, wind) {
  if (!cloudMesh) return;
  const u = cloudMesh.material.uniforms;
  u.uSunCol.value.copy(_sunCol).multiplyScalar(sunDir.y > -0.05 ? 1 : 0.05);
  const n = 1 - smooth((sunDir.y + 0.12) / 0.2);
  u.uAmb.value.setRGB(lerp(0.28, 0.02, n), lerp(0.32, 0.025, n), lerp(0.42, 0.05, n));
  u.uFogCol.value.copy(scene.fog.color); u.uFogD.value = scene.fog.density * 0.7;
  u.uWind.value.set(t * wind, 0, t * wind * 0.3);
}
/* ---- static structures ---- */
function mergeTo(list) {
  const geos = list.map(([g, m4]) => { const c = g.index ? g.toNonIndexed() : g.clone(); c.applyMatrix4(m4); if (!c.attributes.uv) c.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(c.attributes.position.count * 2), 2)); return c; });
  return mergeGeometries(geos, false);
}
const M4 = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), V3(sx, sy, sz));
/* a beam between two points (box with square section w) */
function beam(list, a, b, w) {
  const d = _v1.subVectors(b, a), L = d.length(); if (L < 1e-3) return;
  const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.clone().normalize());
  list.push([new THREE.BoxGeometry(w, L, w), new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, V3(1, 1, 1))]);
}
/* square lattice tower: legs, rings every `step`, X bracing on each face */
function latticeTower(list, cx, cz, half, H, step, legW, braceW) {
  const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  cs.forEach(([a, b]) => beam(list, V3(cx + a * half, 0, cz + b * half), V3(cx + a * half, H, cz + b * half), legW));
  for (let y = 0; y < H - 0.1; y += step) {
    const y1 = Math.min(H, y + step);
    for (let k = 0; k < 4; k++) {
      const [a1, b1] = cs[k], [a2, b2] = cs[(k + 1) % 4];
      const p1 = V3(cx + a1 * half, y1, cz + b1 * half), p2 = V3(cx + a2 * half, y1, cz + b2 * half);
      beam(list, p1, p2, braceW * 1.2);
      beam(list, V3(cx + a1 * half, y, cz + b1 * half), V3(cx + a2 * half, y1, cz + b2 * half), braceW);
      beam(list, V3(cx + a2 * half, y, cz + b2 * half), V3(cx + a1 * half, y1, cz + b1 * half), braceW);
    }
  }
}
const MAT = {};
function buildMaterials() {
  MAT.paint = new THREE.MeshStandardMaterial({color: 0xd9dbde, map: TX.paint, roughness: 0.62, metalness: 0.35});
  MAT.darkSteel = new THREE.MeshStandardMaterial({color: 0x3a3d43, roughness: 0.55, metalness: 0.8});
  MAT.concrete = new THREE.MeshStandardMaterial({color: 0xffffff, map: TX.concrete, roughness: 0.92, metalness: 0});
  MAT.blackSteel = new THREE.MeshStandardMaterial({color: 0x1b1d21, roughness: 0.5, metalness: 0.7});
  MAT.white = new THREE.MeshStandardMaterial({color: 0xe8eaec, roughness: 0.55, metalness: 0.1});
  MAT.hull = new THREE.MeshStandardMaterial({color: 0x23272d, roughness: 0.7, metalness: 0.4});
  MAT.deck = new THREE.MeshStandardMaterial({map: TX.deck, roughness: 0.85, metalness: 0.3});
  MAT.lz = new THREE.MeshStandardMaterial({map: TX.lz, roughness: 0.9});
  MAT.steelPlate = new THREE.MeshStandardMaterial({color: 0x8d9198, roughness: 0.35, metalness: 1});
}
/* Starbase pad: orbital launch mount + Mechazilla tower with chopsticks */
const SITE = {};
function buildStarbase() {
  const g = new THREE.Group(); g.name = 'starbase';
  const steel = [], dark = [], conc = [];
  const mountH = 21;
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + Math.PI / 6; beam(steel, V3(Math.cos(a) * 8.6, 0, Math.sin(a) * 8.6), V3(Math.cos(a) * 7.2, mountH - 1, Math.sin(a) * 7.2), 2.4); }
  const ring = new THREE.CylinderGeometry(7.6, 7.6, 2.6, 48, 1, true); steel.push([ring, M4(0, mountH - 1.3, 0)]);
  const ringIn = new THREE.CylinderGeometry(5.1, 5.1, 2.6, 48, 1, true); steel.push([ringIn, M4(0, mountH - 1.3, 0, 0, 0, 0)]);
  steel.push([new THREE.RingGeometry(5.1, 7.6, 48, 1), M4(0, mountH, 0, -Math.PI / 2)]);
  steel.push([new THREE.RingGeometry(5.1, 7.6, 48, 1), M4(0, mountH - 2.6, 0, Math.PI / 2)]);
  for (let i = 0; i < 20; i++) { const a = i / 20 * TAU; dark.push([new THREE.BoxGeometry(0.9, 1.4, 1.2), M4(Math.cos(a) * 4.8, mountH + 0.5, Math.sin(a) * 4.8, 0, -a, 0)]); }
  dark.push([new THREE.BoxGeometry(3, 4, 3), M4(-7.5, mountH - 4, -3)]); // booster QD
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 0.6, 48), MAT.steelPlate); plate.position.y = 0.3; plate.receiveShadow = true; g.add(plate);
  conc.push([new THREE.BoxGeometry(70, 1, 70), M4(0, -0.45, -12)]);
  /* tower */
  const tz = -24, th = 146;
  latticeTower(steel, 0, tz, 5, th, 7.3, 1.25, 0.42);
  beam(steel, V3(0, th, tz), V3(0, th + 22, tz), 0.6);
  /* tank farm and the production site on the skyline */
  for (let i = 0; i < 8; i++) { const c = new THREE.CylinderGeometry(4.2, 4.2, 22, 24); steel.push([c, M4(-330 + (i % 4) * 11, 11, -160 + Math.floor(i / 4) * 11)]); }
  for (let i = 0; i < 3; i++) { const c = new THREE.CylinderGeometry(3, 3, 30, 20); steel.push([c, M4(-300 + i * 9, 3.2, -205, 0, 0, Math.PI / 2)]); }
  const bay = new THREE.BoxGeometry(80, 70, 50); steel.push([bay, M4(-2600, 35, 400)]);
  const bay2 = new THREE.BoxGeometry(60, 95, 45); steel.push([bay2, M4(-2700, 47, 300)]);
  const mSteel = new THREE.Mesh(mergeTo(steel), MAT.paint); mSteel.castShadow = true; mSteel.receiveShadow = true;
  const mDark = new THREE.Mesh(mergeTo(dark), MAT.darkSteel); mDark.castShadow = true;
  const mConc = new THREE.Mesh(mergeTo(conc), MAT.concrete); mConc.receiveShadow = true;
  g.add(mSteel, mDark, mConc);
  /* chopsticks: carriage + two arms that pivot at the tower face */
  const chop = new THREE.Group(); chop.position.set(0, 96, tz);
  const carriage = new THREE.Mesh(mergeTo([[new THREE.BoxGeometry(13, 8, 13), M4(0, 0, 0)]]), MAT.darkSteel); chop.add(carriage);
  const arms = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(sx * 5.8, 0, 6);
    const parts = [];
    beam(parts, V3(0, -1.4, 0), V3(0, -1.4, 34), 1.4); beam(parts, V3(0, 1.4, 0), V3(0, 1.4, 34), 1.0);
    for (let z = 0; z < 34; z += 3.4) beam(parts, V3(0, -1.4, z), V3(0, 1.4, z + 3.4), 0.35);
    parts.push([new THREE.BoxGeometry(1.6, 1.2, 4), M4(-sx * 0.9, -2.2, 16)]);
    const arm = new THREE.Mesh(mergeTo(parts), MAT.paint); arm.castShadow = true; pivot.add(arm); chop.add(pivot); arms.push(pivot);
  }
  /* ship quick-disconnect arm */
  const qd = new THREE.Group(); qd.position.set(4.5, 104, tz + 4);
  const qdm = new THREE.Mesh(mergeTo([[new THREE.BoxGeometry(2.2, 2.6, 15), M4(0, 0, 7.5)]]), MAT.paint); qdm.castShadow = true; qd.add(qdm);
  g.add(chop, qd);
  SITE.starbase = {group: g, mountH, chop, arms, qd, towerZ: tz, catchY: 96, padR: 140};
  return g;
}
function setChopsticks(open01, h) {
  const s = SITE.starbase; if (!s) return;
  s.chop.position.y = h;
  s.arms.forEach((p, i) => { p.rotation.y = (i ? 1 : -1) * lerp(0, 0.5, open01); });
}
/* LC-39A: raised pad, fixed service structure, transporter-erector, water tower, LZ */
function buildLC39A() {
  const g = new THREE.Group(); g.name = 'lc39a';
  const steel = [], conc = [], dark = [];
  const deck = 13;
  conc.push([new THREE.CylinderGeometry(95, 150, deck, 48), M4(0, deck / 2 - 0.5, 0)]);
  dark.push([new THREE.BoxGeometry(14, 6, 80), M4(0, deck - 2.9, 70)]); // flame trench exit
  latticeTower(steel, -14, -26, 6, 104, 7.4, 1.1, 0.4);
  beam(steel, V3(-14, 104, -26), V3(-14, 140, -26), 1.2);
  steel.push([new THREE.BoxGeometry(4, 3, 18), M4(-6, deck + 60, -18)]); // crew access arm
  /* water tower */
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.6; beam(steel, V3(320 + Math.cos(a) * 9, 0, -260 + Math.sin(a) * 9), V3(320 + Math.cos(a) * 4, 70, -260 + Math.sin(a) * 4), 1.1); }
  steel.push([new THREE.SphereGeometry(9, 24, 16), M4(320, 78, -260, 0, 0, 0, 1, 0.75, 1)]);
  /* lightning masts */
  for (const [x, z] of [[-110, -110], [110, -110], [-110, 110], [110, 110]]) beam(steel, V3(x, 0, z), V3(x, 120, z), 1.4);
  const mSteel = new THREE.Mesh(mergeTo(steel), MAT.paint); mSteel.castShadow = true; mSteel.receiveShadow = true;
  const mConc = new THREE.Mesh(mergeTo(conc), MAT.concrete); mConc.receiveShadow = true; mConc.castShadow = true;
  const mDark = new THREE.Mesh(mergeTo(dark), MAT.blackSteel);
  g.add(mSteel, mConc, mDark);
  /* transporter-erector strongback, hinged at its base */
  const te = new THREE.Group(); te.position.set(0, deck, -4.2);
  const tp = []; latticeTower(tp, 0, -1.6, 1.4, 66, 3.3, 0.45, 0.16);
  for (let y = 12; y < 66; y += 16) tp.push([new THREE.BoxGeometry(1.2, 0.8, 3.2), M4(0, y, 0.6)]);
  const tem = new THREE.Mesh(mergeTo(tp), MAT.paint); tem.castShadow = true; te.add(tem); g.add(te);
  const lz = new THREE.Mesh(new THREE.CircleGeometry(40, 48), MAT.lz); lz.rotation.x = -Math.PI / 2; lz.position.set(LZ_X, 0.15, 0); lz.receiveShadow = true; g.add(lz);
  SITE.lc39a = {group: g, mountH: deck + 3.2, te, padR: 160};
  return g;
}
const LZ_X = -3200; /* landing zone inland of the pad (RTLS) */
/* autonomous spaceport droneship (A Shortfall of Gravitas class, 91 × 52 m deck) */
function buildDroneship() {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(91, 7, 52), MAT.hull); hull.position.y = -1.6; hull.castShadow = hull.receiveShadow = true;
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(91, 52), MAT.deck); deck.rotation.x = -Math.PI / 2; deck.position.y = 1.95; deck.receiveShadow = true;
  const walls = []; walls.push([new THREE.BoxGeometry(4, 7, 16), M4(-41, 5, -16)], [new THREE.BoxGeometry(4, 7, 16), M4(-41, 5, 16)]);
  for (const z of [-24, 24]) for (const x of [-38, 38]) walls.push([new THREE.CylinderGeometry(1.8, 2.2, 3, 12), M4(x, -5, z)]);
  const w = new THREE.Mesh(mergeTo(walls), MAT.paint); w.castShadow = true;
  g.add(hull, deck, w);
  return g;
}
