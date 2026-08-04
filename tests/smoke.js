#!/usr/bin/env node
/* tests/smoke.js — 无浏览器的挂载烟雾测试
 *
 * 用最小 DOM 桩把外壳跑起来，验证：
 *   - 三个模块都能注册并挂载，不抛异常
 *   - Store 联动生效：改 Γ 后下游模块的 impact() 数值随之变化
 *   - ID 作用域正确：同一模块挂两次不冲突
 * 这不能替代真实浏览器测试（canvas 渲染、布局、事件都是桩），
 * 但能在 CI 里挡住"改坏了挂载流程"这类回归。
 */
'use strict';
const fs = require('fs'), path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

/* ---------- 最小 DOM 桩 ---------- */
const listeners = {};
function mkCtx() {
  return new Proxy({ font: '', textAlign: '', textBaseline: '', globalAlpha: 1,
    lineWidth: 1, fillStyle: '', strokeStyle: '', imageSmoothingEnabled: true }, {
    get(t, k) { if (k in t) return t[k];
      if (k === 'measureText') return () => ({ width: 20 });
      if (k === 'createImageData') return (a, b) => ({ data: new Uint8ClampedArray(a * b * 4) });
      return () => {}; },
    set(t, k, v) { t[k] = v; return true; } });
}
function mkEl(tag, id) {
  const el = {
    tagName: (tag || 'div').toUpperCase(), id: id || '', _html: '',
    value: /u-p$|u-pmax$/.test(id || '') ? 'mW'
         : /u-f$|u-D$|u-fmax$/.test(id || '') ? 'MHz'
         : /u-w$|u-wmin$/.test(id || '') ? 'µm'
         : /u-d$/.test(id || '') ? 'e·a₀' : '1',
    style: {}, dataset: {}, children: [], open: true, checked: false,
    options: [{ text: 'mW', value: 'mW' }], selectedIndex: 0,
    clientWidth: 700, clientHeight: 500, width: 0, height: 0,
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = v; },
    getAttribute: () => '300', setAttribute() {}, getContext: mkCtx,
    addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); },
    removeEventListener() {}, onclick: null, oninput: null, onchange: null,
    querySelector(sel) { const k = sel.replace('#', '');
      if (!registry[k]) registry[k] = mkEl('div', k);
      return registry[k]; },
    querySelectorAll: () => [],
    appendChild() {}, click() {}, focus() {},
    getBoundingClientRect: () => ({ top: 0, height: 500, left: 0, width: 700 })
  };
  return el;
}
const registry = {};
global.window = globalThis;
global.document = {
  body: mkEl('body'),
  getElementById: id => registry[id] || (registry[id] = mkEl('div', id)),
  createElement: t => mkEl(t),
  querySelector: () => mkEl('div'), querySelectorAll: () => []
};
global.getComputedStyle = () => ({ getPropertyValue: () => '#888' });
global.location = { hash: '', pathname: '/index.html', search: '', href: 'http://x/index.html' };
global.history = { replaceState: (a, b, u) => { global.location.hash = u.slice(u.indexOf('#')); } };
global.requestAnimationFrame = f => { f(); return 1; };
global.performance = { now: () => Date.now() };
try { Object.defineProperty(global, 'navigator', { value: {}, configurable: true }); } catch (e) {}
global.Blob = function () {}; global.URL = { createObjectURL: () => '' };
global.CustomEvent = function (n, o) { this.type = n; this.detail = o && o.detail; };
global.devicePixelRatio = 1;
global.fetch = () => Promise.reject(new Error('no fetch in smoke test'));
global.addEventListener = () => {}; window.addEventListener = () => {};
window.matchMedia = null;

/* ---------- 加载 ---------- */
const errors = [];
const origErr = console.error;
console.error = (...a) => { errors.push(a.map(String).join(' ')); };

['shared/wigner.js','shared/constants.js','shared/physics.js','shared/units.js',
 'shared/urlstate.js','shared/plot.js','shared/version.js',
 'shell/store.js','shell/registry.js',
 'modules/rabi-power.js','modules/raman-qubit.js','modules/hfs-matrix-element.js']
  .forEach(f => { try { eval(R(f)); } catch (e) { errors.push(f + ': ' + e.message); } });

console.error = origErr;

let pass = 0, fail = 0;
function check(name, fn) {
  try { const r = fn(); if (r === false) throw new Error('断言失败');
    console.log('  ✓  ' + name); pass++; }
  catch (e) { console.log('  ✗  ' + name + '  — ' + e.message); fail++; }
}

console.log('\n── 模块注册 ──');
check('三个模块全部注册', () => YBM.list().length === 3);
check('rabi-power 已注册', () => !!YBM.registry['rabi-power']);
check('raman-qubit 已注册', () => !!YBM.registry['raman-qubit']);
check('hfs-matrix-element 已注册', () => !!YBM.registry['hfs-matrix-element']);
check('每个模块都声明了 reads', () =>
  YBM.list().every(m => YBM.registry[m.id].reads.length > 0));

console.log('\n── 挂载 ──');
let iA, iB, iC;
check('rabi-power 挂载不抛异常', () => { iA = YBM.mount('rabi-power', mkEl('div')); return !!iA; });
check('raman-qubit 挂载不抛异常', () => { iB = YBM.mount('raman-qubit', mkEl('div')); return !!iB; });
check('同一模块挂两次 ID 前缀不冲突', () => {
  iC = YBM.mount('rabi-power', mkEl('div'));
  return iC.prefix !== iA.prefix;
});

console.log('\n── Store 联动 ──');
const before = iB.api.impact();
YBStore.update({ 'transition.Gamma_Hz': 182e3 }, 'hfs-matrix-element', { reason: 'τ=874 ns' });
const after = iB.api.impact();
check('改 Γ 后拉曼模块结果随之变化', () => before !== after);
check('派生量确实重算（非缓存）', () => {
  const d = YBStore.derived.d_red_au();
  return Math.abs(d - 0.539180) < 1e-5;
});
YBStore.undo();
check('撤销后恢复', () => Math.abs(YBStore.derived.d_red_au() - 0.540659) < 1e-5);

console.log('\n── 数值锚点（改架构不得改变物理）──');
check('d_red = 0.540659 e·a₀', () => Math.abs(YBStore.derived.d_red_au() - 0.540659) < 1e-5);
check('d_cyc = 0.312150 e·a₀', () =>
  Math.abs(YBStore.derived.d_cyc_SI() / YBC.SI.ea0 - 0.312150) < 1e-5);
check('λ = 555.802363 nm', () => Math.abs(YBStore.derived.lambda_nm() - 555.802363) < 1e-6);
check('Ω_R/2π = 1.7261 MHz', () =>
  Math.abs(Math.abs(YBStore.derived.ramanOmega()) / (2 * Math.PI) / 1e6 - 1.7261) < 1e-3);

console.log('\n── 卸载 ──');
check('卸载不抛异常', () => { YBM.unmount(iC); return YBM.instances.length === 2; });

console.log('\n── 异步就绪竞态（DB 未加载时 render 不抛异常）──');
/* 回归测试：hfs 模块的 toggle 监听器是同步注册的，而 DB 由 loadDB() 异步填充。
 * 在 DB/cur 就绪前展开折叠区会触发 render() → DB[cur.el] 是 undefined → d.tr 抛错。
 * 本烟雾环境里 fetch 直接 reject（line 67），正是「DB 永不就绪」的场景。
 * 挂载 hfs 后直接触发其 toggle 监听器，断言不抛异常。 */
check('DB 未加载时 toggle → render() 不抛异常', () => {
  const inst = YBM.mount('hfs-matrix-element', mkEl('div'));
  const fired = listeners['toggle'] || [];
  if (!fired.length) throw new Error('未注册 toggle 监听器');
  let threw = null;
  const before = errors.length;
  fired.forEach(f => { try { f(); } catch (e) { threw = e; } });
  return threw === null && errors.length === before;
});

console.log('\n── 单一数据源（无第二份元素数据库）──');
/* 任务 2：独立页已改为 fetch data/transitions.json，仓库内不应再有内联
 * 的 const DB=[...] 元素数据库拷贝。扫描全部源码，命中即视为回归。 */
check('仓库内无第二份元素数据库（无 const DB=[ 字面量）', () => {
  const files = ['index.html',
    'shell/store.js','shell/registry.js','shell/panes.js',
    'modules/rabi-power.js','modules/raman-qubit.js','modules/hfs-matrix-element.js',
    'tools/rabi-power.html','tools/raman-qubit.html','tools/hfs-matrix-element.html',
    'shared/constants.js','shared/physics.js','shared/units.js','shared/wigner.js',
    'shared/urlstate.js','shared/plot.js'];
  const hits = files.filter(f => /const\s+DB\s*=\s*\[/.test(R(f)));
  if (hits.length) throw new Error('仍有内联数据库: ' + hits.join(', '));
  return true;
});

console.log('\n' + '='.repeat(50));
if (errors.length) {
  console.log('加载/运行期错误 ' + errors.length + ' 条：');
  errors.slice(0, 10).forEach(e => console.log('  · ' + e.slice(0, 160)));
}
console.log('通过 ' + pass + ' / ' + (pass + fail));
if (fail || errors.length) process.exit(1);
console.log('烟雾测试全部通过');
