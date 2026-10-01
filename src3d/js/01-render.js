/* ================= renderer, post-processing, adaptive resolution ================= */
const canvas = $('#gl');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({canvas, antialias: false, logarithmicDepthBuffer: true, powerPreference: 'high-performance', stencil: false});
} catch (e) {
  $('#loading').innerHTML = '<div>TRÌNH DUYỆT KHÔNG HỖ TRỢ WEBGL<small>Hãy bật tăng tốc phần cứng hoặc thử Chrome / Edge / Firefox bản mới.</small></div>';
  throw e;
}
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.3, 4e7);
camera.position.set(-160, 40, 220);

/* quality tiers — "auto" keeps the high feature set and trades render resolution for frame rate */
const QUAL = {
  low: {name: 'THẤP', maxPR: 0.8, shadows: false, shadowSize: 1024, bloom: false, msaa: 0, fxaa: true, particles: 0.45, clouds: 0.5},
  high: {name: 'CAO', maxPR: 1.5, shadows: true, shadowSize: 2048, bloom: true, msaa: 4, fxaa: false, particles: 1, clouds: 1},
  auto: {name: 'AUTO', maxPR: 1.25, shadows: true, shadowSize: 2048, bloom: true, msaa: 0, fxaa: true, particles: 1, clouds: 1}
};
let qKey = store.get('q', MOBILE ? 'low' : 'auto');
if (!QUAL[qKey]) qKey = 'auto';
let Q = Object.assign({}, QUAL[qKey]);
let resScale = 1, featureDrop = 0;
const perf = {ema: 16.7, cool: 3, upHold: 0, fps: 60, paint: 0, slowFor: 0};

let composer, renderPass, bloomPass, fxaaPass, outputPass, viewW = 1, viewH = 1, pixelRatio = 1;
function buildComposer() {
  if (composer) { composer.renderTarget1.dispose(); composer.renderTarget2.dispose(); }
  const rt = new THREE.WebGLRenderTarget(1, 1, {type: THREE.HalfFloatType, samples: Q.msaa});
  composer = new EffectComposer(renderer, rt);
  renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.55, 1.05);
  bloomPass.enabled = Q.bloom && featureDrop < 2;
  composer.addPass(bloomPass);
  outputPass = new OutputPass();
  composer.addPass(outputPass);
  fxaaPass = new ShaderPass(FXAAShader);
  fxaaPass.enabled = Q.fxaa;
  composer.addPass(fxaaPass);
  resize();
}
function resize() {
  const r = $('#stage').getBoundingClientRect();
  viewW = Math.max(1, Math.round(r.width)); viewH = Math.max(1, Math.round(r.height));
  pixelRatio = clamp(Math.min(window.devicePixelRatio || 1, Q.maxPR) * resScale, 0.4, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(viewW, viewH, false);
  camera.aspect = viewW / viewH; camera.updateProjectionMatrix();
  if (composer) {
    composer.setPixelRatio(pixelRatio);
    composer.setSize(viewW, viewH);
    fxaaPass.material.uniforms.resolution.value.set(1 / (viewW * pixelRatio), 1 / (viewH * pixelRatio));
  }
}
function applyQuality() {
  Q = Object.assign({}, QUAL[qKey]);
  if (featureDrop >= 1) Q.shadows = false;
  if (featureDrop >= 2) { Q.bloom = false; Q.particles *= 0.6; }
  renderer.shadowMap.enabled = Q.shadows;
  if (typeof sunLight !== 'undefined' && sunLight) {
    sunLight.castShadow = Q.shadows;
    if (sunLight.shadow.mapSize.x !== Q.shadowSize) { sunLight.shadow.mapSize.set(Q.shadowSize, Q.shadowSize); if (sunLight.shadow.map) { sunLight.shadow.map.dispose(); sunLight.shadow.map = null; } }
  }
  scene.traverse(o => { if (o.material && o.material.needsUpdate !== undefined && o.receiveShadow) o.material.needsUpdate = true; });
  buildComposer();
  paintGfx();
}
function paintGfx() {
  const b = $('#gfx');
  b.textContent = Q.name + ' · ' + Math.round(perf.fps) + ' fps';
  b.title = 'Chất lượng đồ họa: ' + Q.name + ' · độ phân giải render ' + Math.round(pixelRatio * 100) + '%' + (featureDrop ? ' · đã tắt bớt hiệu ứng để giữ khung hình' : '');
}
$('#gfx').onclick = () => {
  qKey = qKey === 'auto' ? 'high' : qKey === 'high' ? 'low' : 'auto';
  store.set('q', qKey); resScale = 1; featureDrop = 0; perf.cool = 3; applyQuality();
  toast('Đồ họa: ' + ({auto: 'Tự động — giữ từ 30 FPS trở lên', high: 'Cao — MSAA 4×, bóng 2048', low: 'Thấp — tiết kiệm pin và máy yếu'})[qKey]);
};
/* dynamic resolution scaling: hold >= 30 fps by trading pixels first, effects second */
function perfTick(raw) {
  if (raw > 0.5 || document.hidden) return;
  perf.ema += (raw * 1000 - perf.ema) * 0.05;
  perf.fps += (1000 / perf.ema - perf.fps) * 0.15;
  perf.cool -= raw; perf.upHold -= raw; perf.paint += raw;
  if (perf.paint > 0.5) { perf.paint = 0; paintGfx(); }
  if (qKey !== 'auto' || perf.cool > 0) return;
  if (perf.ema > 37) {
    if (resScale > 0.55) { resScale = Math.max(0.5, resScale - 0.12); perf.cool = 1.5; perf.upHold = 12; resize(); }
    else { perf.slowFor += raw; if (perf.slowFor > 4 && featureDrop < 2) { featureDrop++; perf.slowFor = 0; perf.cool = 3; applyQuality(); toast('Tự tắt bớt hiệu ứng để giữ khung hình'); } }
  } else {
    perf.slowFor = 0;
    if (perf.ema < 22 && resScale < 1 && perf.upHold <= 0) { resScale = Math.min(1, resScale + 0.1); perf.cool = 2.5; resize(); }
  }
}
new ResizeObserver(() => resize()).observe($('#stage'));
