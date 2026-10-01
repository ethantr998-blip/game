import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {FXAAShader} from 'three/addons/shaders/FXAAShader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

/* ================= core utilities ================= */
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const TAU = Math.PI * 2, DEG = Math.PI / 180;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const wrapA = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const approach = (v, t, rate) => v < t ? Math.min(t, v + rate) : Math.max(t, v - rate);
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const fmt = (v, d = 0) => (+v).toLocaleString('vi-VN', {minimumFractionDigits: d, maximumFractionDigits: d});
const store = {
  get(k, d) { try { const v = localStorage.getItem('k20x.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('k20x.' + k, JSON.stringify(v)); } catch (e) {} }
};
function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
function toast(msg, cls = '') {
  const t = el('div', 'toast ' + cls, msg); $('#toasts').append(t);
  setTimeout(() => t.remove(), 3200);
  while ($('#toasts').children.length > 3) $('#toasts').firstChild.remove();
}
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MOBILE = matchMedia('(hover:none)').matches || Math.min(screen.width, screen.height) < 700;

/* ================= physical constants ================= */
const RE = 6371000, MU = 3.986004418e14, G0 = 9.80665, OMEGA = 7.2921159e-5, P0 = 101325;
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _v1 = V3(), _v2 = V3(), _v3 = V3(), _q1 = new THREE.Quaternion(), _m1 = new THREE.Matrix4();
/* clock text "T+ 00:02:41" */
function tClock(t) {
  const s = Math.abs(t), sign = t < 0 ? '−' : '+';
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = Math.floor(s) % 60;
  return `T${sign} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
