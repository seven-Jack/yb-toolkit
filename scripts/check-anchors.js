#!/usr/bin/env node
/* scripts/check-anchors.js — 四个数值锚点的硬校验（由 scripts/verify.sh 调用）
 *
 * 容差：相对误差 2e-4。任何漂移即以非零退出码退出。
 * 锚点的含义与"为什么不能变"见 HANDOFF.md「四个数值锚点」：
 *   d_red / d_cyc / λ / Ω_R 锁死物理约定与默认工作点，
 *   改架构、改公式、改常数后必须纹丝不动。
 *
 * 校验方式：直接加载 shared 与 shell/store，走与页面相同的派生链现算，
 * 不读任何"页面上显示出来的值"，也不读 smoke.js 的输出（避免循环论证）。
 */
'use strict';
const fs = require('fs'), path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

['shared/wigner.js','shared/constants.js','shared/physics.js','shell/store.js']
  .forEach(f => { try { eval(R(f)); } catch (e) {
    console.error('加载失败 ' + f + ': ' + e.message); process.exit(2); } });

const ST = globalThis.YBStore;
if (!ST) { console.error('YBStore 未就绪'); process.exit(2); }

const TOL = 2e-4; /* 相对误差 */
const anchors = [
  { name: 'd_red (e·a₀)',  expect: 0.540659,
    got: () => ST.derived.d_red_au() },
  { name: 'd_cyc (e·a₀)',  expect: 0.312150,
    got: () => ST.derived.d_cyc_SI() / globalThis.YBC.SI.ea0 },
  { name: 'λ (nm)',        expect: 555.802363,
    got: () => ST.derived.lambda_nm() },
  { name: 'Ω_R/2π (MHz)',  expect: 1.7261,
    got: () => Math.abs(ST.derived.ramanOmega()) / (2 * Math.PI) / 1e6 },
];

let ok = true;
for (const a of anchors) {
  const got = a.got();
  const rel = Math.abs(got - a.expect) / Math.abs(a.expect);
  const pass = isFinite(rel) && rel <= TOL;
  const dev = (isFinite(rel) ? rel * 100 : NaN).toFixed(4);
  console.log((pass ? '  ✓ ' : '  ✗ ') + a.name + ' = ' + got + '（期望 ' + a.expect +
    '，相对偏差 ' + dev + '%' + (pass ? '' : '  > 容差 0.02%') + '）');
  if (!pass) ok = false;
}
console.log(ok ? '四锚点确认' : '锚点漂移');
process.exit(ok ? 0 : 1);
