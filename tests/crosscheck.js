#!/usr/bin/env node
/* tests/crosscheck.js — 确认 bench.py 里的常数与 shared/constants.js 一致
 * 常数在两处各写一份是必要的（Python 侧不能 require JS），
 * 但必须机器校验，否则一定会漂移。这是我们踩过的坑。
 */
'use strict';
const fs = require('fs');
const path = require('path');
global.window = globalThis;
require(path.join(__dirname, '..', 'shared', 'constants.js'));
const C = globalThis.YBC;

const py = fs.readFileSync(path.join(__dirname, 'bench.py'), 'utf8');
function grab(name) {
  const m = py.match(new RegExp('^' + name + '\\s*=\\s*([+-]?[\\d.]+(?:e[+-]?\\d+)?)', 'm'));
  return m ? parseFloat(m[1]) : null;
}

const CHECKS = [
  ['HBAR',      C.SI.hbar],
  ['C',         C.SI.c],
  ['EPS0',      C.SI.eps0],
  ['E_CHARGE',  C.SI.e],
  ['A0',        C.SI.a0],
  ['GAMMA_556', C.YB171.Gamma_556.v],
  ['D_HF',      C.YB171.D_hf.v],
  ['D_E',       C.YB171.D_e.v]
];

let bad = 0;
console.log('常数一致性检查  shared/constants.js  ↔  tests/bench.py\n');
for (const [name, jsVal] of CHECKS) {
  const pyVal = grab(name);
  if (pyVal === null) { console.log(`  ?? ${name}  在 bench.py 中未找到`); bad++; continue; }
  const same = Math.abs(pyVal - jsVal) <= Math.abs(jsVal) * 1e-12;
  console.log(`  ${same ? '✓ ' : '✗ '} ${name.padEnd(10)} JS=${jsVal}  PY=${pyVal}`);
  if (!same) bad++;
}
console.log('');
if (bad) { console.log(`${bad} 项不一致 —— 两套实现已漂移，必须修正`); process.exit(1); }
console.log('全部一致');
