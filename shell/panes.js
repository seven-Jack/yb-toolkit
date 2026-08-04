/* shell/panes.js — 上下分栏、拖拽、URL 编码
 *
 * 布局：两个窗格上下排列，中间可拖拽的分隔条。
 * 每个窗格独立选择模块、独立滚动。窗格高度低于阈值时模块自动进入紧凑模式。
 *
 * URL 形如  #top=rabi-power&bot=raman-qubit&split=55&d=...&P=...
 * 前三个是布局，其余交给 shared/urlstate.js 的状态编码。
 *
 * 全局暴露为 window.YBPanes
 */
(function (root) {
  'use strict';

  var COMPACT_PX = 380;      /* 窗格净高低于此值 → 紧凑模式（原 420：常见短视口下
                                开箱即触发，见 CHANGELOG 0.3.2） */
  var panes = {};            /* {top:{el,sel,inst,moduleId}, bot:{...}} */
  var splitPct = 50;         /* 默认 50/50，双击复位到 50 */
  var singleMode = false;

  function init(opts) {
    opts = opts || {};
    ['top', 'bot'].forEach(function (k) {
      panes[k] = {
        key: k,
        wrap: document.getElementById('pane-' + k),
        host: document.getElementById('host-' + k),
        sel: document.getElementById('sel-' + k),
        inst: null, moduleId: null
      };
      fillSelector(panes[k]);
      panes[k].sel.addEventListener('change', function () {
        setModule(k, panes[k].sel.value);
        writeURL();
      });
    });
    initDrag();
    root.addEventListener('resize', debounce(applyCompact, 150));
    var st = readURL();
    setSplit(st.split || splitPct);
    setModule('top', st.top || opts.defaultTop || firstId());
    setModule('bot', st.bot || opts.defaultBot || secondId());
  }

  function firstId()  { var l = root.YBM.list(); return l[0] && l[0].id; }
  function secondId() { var l = root.YBM.list(); return (l[1] || l[0] || {}).id; }

  function fillSelector(p) {
    p.sel.innerHTML = root.YBM.list().map(function (m) {
      return '<option value="' + m.id + '">' + m.title + '</option>';
    }).join('') + '<option value="__none__">— 关闭此窗格 —</option>';
  }

  function setModule(key, moduleId) {
    var p = panes[key];
    if (!p) return;
    if (p.inst) { root.YBM.unmount(p.inst); p.inst = null; }
    p.moduleId = moduleId;
    if (moduleId === '__none__') {
      p.host.innerHTML = '<p class="pane-empty">窗格已关闭</p>';
      setSingle(key === 'top' ? 'bot' : 'top');
      return;
    }
    setSingle(null);
    p.sel.value = moduleId;
    p.inst = root.YBM.mount(moduleId, p.host, { compact: isCompact(p) });
    /* 模块是核心视图；完整功能仍在 tools/ 下的独立页面 */
    var note = document.getElementById('note-' + key);
    if (note) note.innerHTML = '<a href="tools/' + moduleId +
      '.html" target="_blank" style="color:var(--fg2)">完整版 ↗</a>';
    applyCompact();
  }

  function isCompact(p) {
    return p.wrap.clientHeight - 44 < COMPACT_PX;   /* 44 = 窗格标题栏 */
  }
  function applyCompact() {
    ['top', 'bot'].forEach(function (k) {
      var p = panes[k];
      if (p && p.inst && p.inst.api.setCompact) {
        try { p.inst.api.setCompact(isCompact(p)); } catch (e) { console.error(e); }
      }
    });
  }

  /* ---------- 分隔条 ---------- */
  function setSplit(pct) {
    splitPct = Math.max(15, Math.min(85, pct));
    document.getElementById('panes').style.gridTemplateRows =
      splitPct + 'fr 8px ' + (100 - splitPct) + 'fr';
    applyCompact();
  }
  function setSingle(onlyKey) {
    singleMode = !!onlyKey;
    var g = document.getElementById('panes');
    if (onlyKey) g.style.gridTemplateRows = (onlyKey === 'top' ? '1fr 8px 0' : '0 8px 1fr');
    else setSplit(splitPct);
  }
  function initDrag() {
    var bar = document.getElementById('splitbar'), dragging = false;
    function move(e) {
      if (!dragging) return;
      var g = document.getElementById('panes').getBoundingClientRect();
      var y = (e.touches ? e.touches[0].clientY : e.clientY) - g.top;
      setSplit(y / g.height * 100);
      e.preventDefault();
    }
    function stop() { if (!dragging) return; dragging = false;
      document.body.style.cursor = ''; document.body.style.userSelect = ''; writeURL(); }
    bar.addEventListener('mousedown', function () { dragging = true;
      document.body.style.cursor = 'row-resize'; document.body.style.userSelect = 'none'; });
    bar.addEventListener('touchstart', function () { dragging = true; }, { passive: true });
    root.addEventListener('mousemove', move);
    root.addEventListener('touchmove', move, { passive: false });
    root.addEventListener('mouseup', stop);
    root.addEventListener('touchend', stop);
    bar.addEventListener('dblclick', function () { setSplit(50); writeURL(); });
  }

  /* ---------- URL ---------- */
  function readURL() {
    var st = root.YBURL.read();
    return {
      top: st.top ? st.top.raw : null,
      bot: st.bot ? st.bot.raw : null,
      split: st.split ? st.split.value : null
    };
  }
  function writeURL() {
    var s = root.YBStore.state, d = root.YBStore.derived;
    root.YBURL.write({
      top: panes.top.moduleId,
      bot: panes.bot.moduleId,
      split: { value: Math.round(splitPct), unit: '' },
      el: s.transition.element + s.transition.A,
      Ek: { value: s.transition.Ek_cm, unit: '' },
      G: { value: s.transition.Gamma_Hz / 1e3, unit: 'kHz' },
      P: { value: s.beam.P_laser * 1e3, unit: 'mW' },
      wx: { value: s.beam.wx * 1e6, unit: 'um' },
      wy: { value: s.beam.wy * 1e6, unit: 'um' },
      eta: { value: s.beam.eta, unit: '' },
      D: { value: s.raman.detuning_Hz / 1e6, unit: 'MHz' },
      S3: { value: s.beam.S3, unit: '' }
    });
  }
  /** 从 URL 恢复 Store（在模块挂载前调用） */
  function restoreStore() {
    var st = root.YBURL.read(), patch = {};
    if (st.Ek)  patch['transition.Ek_cm'] = st.Ek.value;
    if (st.G)   patch['transition.Gamma_Hz'] = st.G.value * 1e3;
    if (st.P)   patch['beam.P_laser'] = st.P.value * 1e-3;
    if (st.wx)  patch['beam.wx'] = st.wx.value * 1e-6;
    if (st.wy)  patch['beam.wy'] = st.wy.value * 1e-6;
    if (st.eta) patch['beam.eta'] = st.eta.value;
    if (st.D)   patch['raman.detuning_Hz'] = st.D.value * 1e6;
    if (st.S3)  patch['beam.S3'] = st.S3.value;
    if (Object.keys(patch).length) root.YBStore.update(patch, '__url__');
  }

  function debounce(fn, ms) { var t = 0;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }

  root.YBPanes = { init: init, setModule: setModule, setSplit: setSplit,
                   writeURL: writeURL, restoreStore: restoreStore,
                   get panes() { return panes; } };
})(typeof window !== 'undefined' ? window : globalThis);
