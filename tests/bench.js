#!/usr/bin/env node
/* tests/bench.js — 用 tests/vectors.json 校验 JS 实现
 * 用法: node tests/bench.js
 * CI 会在每次 push 时运行。失败即阻止部署。
 */
'use strict';
const fs = require('fs');
const path = require('path');

global.window = globalThis;
require(path.join(__dirname, '..', 'shared', 'wigner.js'));
require(path.join(__dirname, '..', 'shared', 'constants.js'));
require(path.join(__dirname, '..', 'shared', 'physics.js'));
const YB = globalThis.YB, YBC = globalThis.YBC, YBW = globalThis.YBW;
const ea0 = YBC.SI.ea0;
const V = JSON.parse(fs.readFileSync(path.join(__dirname, 'vectors.json'), 'utf8'));

const D2R = Math.PI / 180;

const IMPL = {
  dCycFromLinewidth: a => ({ d_ea0: YB.dCycFromLinewidth(a.Gamma_Hz, a.lambda_m) / ea0 }),
  identity: a => ({ value: a.value }),
  rabiHz: a => ({ fR_Hz: YB.rabiHz(a.d_ea0 * ea0, a.P_W, a.wx_m, a.wy_m) }),
  intensity: a => ({ I_Wm2: YB.intensity(a.P_W, a.wx_m, a.wy_m) }),
  efieldFromPower: a => ({ E_Vm: YB.efield(YB.intensity(a.P_W, a.wx_m, a.wy_m)) }),
  powerW: a => ({ P_W: YB.powerW(a.d_ea0 * ea0, a.fR_Hz, a.wx_m, a.wy_m) }),
  roundtrip: a => {
    const d = a.d_ea0 * ea0;
    const f = YB.rabiHz(d, a.P_W, a.wx_m, a.wy_m);
    return { P_W: YB.powerW(d, f, a.wx_m, a.wy_m) };
  },
  separable_vs_chain: a => {
    const d = a.d_ea0 * ea0;
    const chain = d * YB.efield(YB.intensity(a.P_W, a.wx_m, a.wy_m)) / YBC.SI.hbar / (2 * Math.PI);
    const sep = YB.rabiHz(d, a.P_W, a.wx_m, a.wy_m);
    return { rel_diff: Math.abs(chain - sep) / chain };
  },
  hfFactor: a => ({ factor: YB.hfFactor(a.D_Hz) }),
  cg: a => ({ value: YB.CG[a.branch][a.leg] }),
  cg_ratio: a => ({ value: YB.CG[a.branch].pi / YB.CG[a.branch].sigma }),
  geomFactor: a => ({ value: YB.geomFactor(a.S3, a.theta_kB_deg * D2R) }),
  qwp_S3: a => ({ S3: YB.qwp(a.u_deg * D2R).S3 }),
  scatterError: a => ({ value: YB.scatterError(a.D_Hz) }),
  ramanOmega: a => {
    const g = YB.geomFactor(a.S3, a.theta_kB_deg * D2R);
    const Om = YB.ramanOmega(a.d_ea0 * ea0, a.P_W, a.wx_m, a.wy_m, a.D_Hz, g);
    return { Omega_2pi_Hz: Math.abs(Om) / (2 * Math.PI) };
  },
  lightShift_workpoint: a => {
    const d = a.d_ea0 * ea0;
    const E0 = YB.efield(YB.intensity(a.P_W, a.wx_m, a.wy_m));
    const legs = YB.ramanLegs(d, E0, a.alpha_deg * D2R);
    return { shift_Hz: YB.lightShift(legs.pi, legs.sigma, a.D_Hz) / (2 * Math.PI) };
  }  ,
  w3j: a => ({ value: YBW.w3j(a.j[0], a.j[1], a.j[2], a.m[0], a.m[1], a.m[2]) }),
  w6j: a => ({ value: YBW.w6j.apply(null, a.a) }),
  cg_computed: a => ({ value: YBW.zee(0.5, 0, 1, 0.5, 0.5, a.Fp, a.mp, a.q) * Math.sqrt(3) }),
  sumrule: a => {
    let s = 0;
    for (const m of [0.5, -0.5]) for (const q of [-1, 0, 1]) {
      const v = YBW.zee(a.I, a.J, a.Jp, 0.5, m, a.Fp, a.mp, q);
      s += v * v;
    }
    return { value: s * 3 };   /* ×3 因 zee 以 d_red 为单位，d_red²=3 d_cyc² */
  },
  lamVac: a => ({ lam_nm: YBW.lamVacFromLevel(a.ek_cm) }),
  dFromGamma: a => ({ d_au: YBW.dFromGamma(a.gamma_Hz, a.lam_nm, a.Jp) }),
  dcyc_valid: a => ({ ok: (a.Jg === 0) ? 1 : 0 }),
  dipole_crosscheck: a => {
    const dEdmonds = YBW.dFromGamma(a.gamma_Hz, a.lam_nm, 1);
    const dCyc = YB.dCycFromLinewidth(a.gamma_Hz, a.lam_nm * 1e-9) / YBC.SI.ea0;
    return { ratio: dEdmonds / (Math.sqrt(3) * dCyc) };
  },
  steck_cross: a => {
    if (a.case === 'd_cg') {
      /* 跨归一化：Steck 用 CG，本框架用 Edmonds，相差 √(2J+1)（J 为基态） */
      const dEd = YBW.dFromGamma(a.gamma_Hz, a.lam_nm, a.Jp);
      return { value: dEd / Math.sqrt(2 * a.Jg + 1) };
    }
    if (a.case === 'cyc') {
      /* 伸展循环跃迁系数 × d_Edmonds：经完整 Wigner 链 zee */
      const dEd = YBW.dFromGamma(a.gamma_Hz, a.lam_nm, a.Jp);
      return { value: YBW.zee(a.I, a.Jg, a.Jp, a.F, a.F, a.Fp, a.Fp, 1) * dEd };
    }
    if (a.case === 'air_lam') {
      /* 真空→空气：Edlén 折射率（760 torr, 22 °C, 干空气） */
      const k = 1000 / a.lam_nm, k2 = k * k;
      const t = 8342.13 + 2406030 / (130 - k2) + 15997 / (38.9 - k2);
      const n = 1 + t * (0.00138823 * 760 / (1 + 0.003671 * 22)) * 1e-8;
      return { value: a.lam_nm / n };
    }
    throw new Error('未知 steck_cross case: ' + a.case);
  }
};

let pass = 0, fail = 0;
const failures = [];

for (const group of Object.keys(V)) {
  if (group.startsWith('_')) continue;
  console.log(`\n── ${group} ──`);
  for (const t of V[group]) {
    const impl = IMPL[t.fn];
    if (!impl) { console.log(`  ?? ${t.name}  (未实现 ${t.fn})`); fail++;
                 failures.push(`${t.name}: 未实现 ${t.fn}`); continue; }
    let got;
    try { got = impl(t.args); }
    catch (e) { console.log(`  ✗  ${t.name}  抛出 ${e.message}`); fail++;
                failures.push(`${t.name}: ${e.message}`); continue; }
    let ok = true, detail = [];
    for (const key of Object.keys(t.expect)) {
      const exp = t.expect[key], act = got[key];
      let good;
      if (t.atol !== undefined) good = Math.abs(act - exp) <= t.atol;
      else good = Math.abs(act - exp) <= Math.abs(exp) * (t.rtol || 1e-6);
      if (!good) ok = false;
      const rel = exp !== 0 ? (act - exp) / Math.abs(exp) : act - exp;
      detail.push(`${key}: ${fmtNum(act)} (期望 ${fmtNum(exp)}, 偏差 ${(rel * 100).toFixed(4)}%)`);
    }
    if (ok) { pass++; console.log(`  ✓  ${t.name}`); }
    else { fail++; console.log(`  ✗  ${t.name}`);
           detail.forEach(d => console.log(`       ${d}`));
           if (t.src) console.log(`       出处: ${t.src}`);
           failures.push(t.name); }
  }
}

function fmtNum(v) {
  if (v === undefined) return 'undefined';
  if (v === 0) return '0';
  const a = Math.abs(v);
  return (a >= 1e5 || a < 1e-3) ? v.toExponential(6) : v.toPrecision(8);
}

console.log(`\n${'='.repeat(50)}`);
console.log(`通过 ${pass} / ${pass + fail}`);
if (fail) { console.log('失败项:'); failures.forEach(f => console.log('  · ' + f)); process.exit(1); }
console.log('全部通过');
