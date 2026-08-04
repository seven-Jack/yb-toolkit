/* shared/units.js — 单位换算与下拉框绑定
 * 内部一律用 SI，界面按用户选择换算。切换单位时物理量不变。
 * 全局暴露为 window.YBU
 */
(function (root) {
  'use strict';
  var ea0 = 8.478353625e-30, debye = 3.33564095198e-30;

  var TABLE = {
    power:  { def: 'mW',  u: { 'pW':1e-12,'nW':1e-9,'µW':1e-6,'mW':1e-3,'W':1 } },
    freq:   { def: 'MHz', u: { 'Hz':1,'kHz':1e3,'MHz':1e6,'GHz':1e9 } },
    length: { def: 'µm',  u: { 'nm':1e-9,'µm':1e-6,'mm':1e-3,'m':1 } },
    dipole: { def: 'e·a₀',u: { 'e·a₀':ea0,'D':debye,'C·m':1 } },
    field:  { def: 'G',   u: { 'G':1,'mT':10,'T':1e4 } },
    time:   { def: 'ns',  u: { 'ps':1e-12,'ns':1e-9,'µs':1e-6,'ms':1e-3,'s':1 } },
    angle:  { def: '°',   u: { '°':Math.PI/180,'rad':1 } }
  };

  function factor(kind, name) {
    var t = TABLE[kind];
    if (!t) throw new Error('unknown unit kind: ' + kind);
    var f = t.u[name];
    if (f === undefined) throw new Error('unknown unit: ' + kind + '/' + name);
    return f;
  }
  function toSI(kind, value, name)   { return value * factor(kind, name); }
  function fromSI(kind, si, name)    { return si / factor(kind, name); }
  function names(kind)               { return Object.keys(TABLE[kind].u); }
  function has(kind, name)           { return !!(TABLE[kind] && TABLE[kind].u[name]); }
  /** 容错解析：非法单位名退回该量纲的默认单位，而不是抛异常。
   *  非法值可能来自畸形 URL 或用户手改，不应让整个模块崩掉。 */
  var warned = {};
  function resolve(kind, name) {
    if (has(kind, name)) return name;
    var k = kind + '/' + name;
    if (name != null && name !== '' && !warned[k]) {
      warned[k] = 1;
      console.warn('[units] 未知单位 ' + k + '，退回默认。仅提示一次。');
    }
    return TABLE[kind].def;
  }

  /** 生成 <select> 的 option HTML */
  function optionsHTML(kind, selected) {
    var t = TABLE[kind], sel = selected || t.def, out = '';
    for (var k in t.u) out += '<option value="' + k + '"' +
      (k === sel ? ' selected' : '') + '>' + k + '</option>';
    return out;
  }

  /** 绑定一个 input+select 对。切换单位时自动换算显示值。
   *  用法: YBU.bind('v-p','u-p','power', onChange) */
  function bind(inputId, selectId, kind, onChange) {
    var inp = document.getElementById(inputId);
    var sel = document.getElementById(selectId);
    if (!inp || !sel) return null;
    if (!sel.options.length) sel.innerHTML = optionsHTML(kind);
    var handle = {
      kind: kind,
      unit: function () { return sel.value; },
      si:   function () { return toSI(kind, parseFloat(inp.value) || 0, sel.value); },
      setSI: function (si, sig) {
        inp.value = parseFloat(fromSI(kind, si, sel.value).toPrecision(sig || 7));
      }
    };
    sel.addEventListener('change', function () {
      var old = handle._prev || TABLE[kind].def;
      var phys = toSI(kind, parseFloat(inp.value) || 0, old);
      inp.value = parseFloat(fromSI(kind, phys, sel.value).toPrecision(8));
      handle._prev = sel.value;
      if (onChange) onChange();
    });
    handle._prev = sel.value;
    return handle;
  }

  /** 自动量纲格式化：取使数值 ≥1 且最小的单位。3.2e-7 s → "320 ns" */
  function auto(kind, si, sig) {
    var t = TABLE[kind], best = t.def, bestV = null, fallback = null, fbV = 0;
    for (var k in t.u) {
      var v = Math.abs(si / t.u[k]);
      if (v >= 1 && (bestV === null || v < bestV)) { bestV = v; best = k; }
      if (v > fbV) { fbV = v; fallback = k; }
    }
    if (bestV === null && fallback) best = fallback;
    return parseFloat((si / t.u[best]).toPrecision(sig || 4)) + ' ' + best;
  }

  root.YBU = { TABLE: TABLE, toSI: toSI, fromSI: fromSI, names: names,
               optionsHTML: optionsHTML, bind: bind, auto: auto, factor: factor,
               has: has, resolve: resolve };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && module.exports)
  module.exports = (typeof window !== 'undefined' ? window : globalThis).YBU;
