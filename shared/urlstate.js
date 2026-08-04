/* shared/urlstate.js — 把工具状态编码进 URL
 *
 * 任何一次计算都能变成一条可分享、可复现、可存档的链接：
 *   tools/rabi-power.html#d=0.5409ea0&P=40mW&w=365um&f=1.726MHz
 *
 * 设计原则：
 *  - 值带单位后缀，链接自解释，人能直接读懂
 *  - 用 replaceState，不污染浏览器后退历史
 *  - 未知参数原样保留，便于将来加字段而不破坏旧链接
 *
 * 全局暴露为 window.YBURL
 */
(function (root) {
  'use strict';

  /* URL 安全的单位别名（避免 µ 和 · 被百分号编码得难以阅读） */
  var ALIAS = {
    'µW': 'uW', 'µm': 'um', 'µs': 'us',
    'e·a₀': 'ea0', 'C·m': 'Cm', '°': 'deg'
  };
  var UNALIAS = {};
  for (var k in ALIAS) UNALIAS[ALIAS[k]] = k;

  function enc(unit) { return ALIAS[unit] || unit; }
  function dec(alias) { return UNALIAS[alias] || alias; }

  /** 读取当前 hash → {key: {value, unit}} */
  function read() {
    var h = (root.location && root.location.hash || '').replace(/^#/, '');
    var out = {};
    if (!h) return out;
    h.split('&').forEach(function (pair) {
      if (!pair) return;
      var i = pair.indexOf('=');
      if (i < 0) return;
      var key = decodeURIComponent(pair.slice(0, i));
      var raw = decodeURIComponent(pair.slice(i + 1));
      var m = raw.match(/^(-?[\d.]+(?:[eE][-+]?\d+)?)(.*)$/);
      if (m) out[key] = { value: parseFloat(m[1]), unit: m[2] ? dec(m[2]) : null, raw: raw };
      else out[key] = { value: null, unit: null, raw: raw };
    });
    return out;
  }

  /** 写入 hash。obj 形如 {P:{value:40,unit:'mW'}, d:{value:0.5409,unit:'e·a₀'}} */
  var writeTimer = 0;
  function write(obj, immediate) {
    var doWrite = function () {
      var parts = [];
      for (var key in obj) {
        var o = obj[key];
        if (o === null || o === undefined) continue;
        var s;
        if (typeof o === 'object' && o.value !== undefined) {
          if (!isFinite(o.value)) continue;
          s = parseFloat(o.value.toPrecision(8)) + (o.unit ? enc(o.unit) : '');
        } else {
          s = String(o);
        }
        parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(s).replace(/%2C/g, ','));
      }
      var hash = '#' + parts.join('&');
      if (root.history && root.history.replaceState) {
        root.history.replaceState(null, '', root.location.pathname + root.location.search + hash);
      } else {
        root.location.hash = hash;
      }
    };
    if (immediate) { clearTimeout(writeTimer); doWrite(); return; }
    clearTimeout(writeTimer);
    writeTimer = setTimeout(doWrite, 250);   // 节流，避免每次按键都写 history
  }

  /** 当前完整链接 */
  function link() {
    return root.location.href;
  }

  /** 复制链接到剪贴板，返回 Promise<boolean> */
  function copyLink() {
    var url = link();
    if (root.navigator && root.navigator.clipboard) {
      return root.navigator.clipboard.writeText(url).then(function () { return true; },
                                                          function () { return false; });
    }
    return Promise.resolve(false);
  }

  /** 把 read() 的结果套用到一组 YBU.bind 句柄上。
   *  map 形如 {P: handleP, d: handleD}；单位不匹配时自动换算。 */
  function apply(map, kinds) {
    var st = read(), used = [];
    for (var key in map) {
      var h = map[key], e = st[key];
      if (!h || !e || e.value === null) continue;
      var kind = (kinds && kinds[key]) || h.kind;
      if (e.unit && root.YBU) {
        try { h.setSI(root.YBU.toSI(kind, e.value, e.unit)); used.push(key); continue; }
        catch (err) { /* 单位不认识则按当前单位填入 */ }
      }
      if (root.YBU) { h.setSI(root.YBU.toSI(kind, e.value, h.unit())); used.push(key); }
    }
    return used;
  }

  root.YBURL = { read: read, write: write, link: link, copyLink: copyLink, apply: apply,
                 ALIAS: ALIAS };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && module.exports)
  module.exports = (typeof window !== 'undefined' ? window : globalThis).YBURL;
