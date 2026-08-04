/* shell/registry.js — 模块注册与挂载
 *
 * 模块契约：
 *   YBM.register({
 *     id, title, subtitle,
 *     reads:  ['transition.*','beam.wx'],   // 外部改动命中才弹提示
 *     writes: ['beam.P_laser'],             // 自己写入的不弹提示
 *     template(ctx) -> HTML 字符串           // 用 ctx.id('x') 生成带前缀的 id
 *     init(ctx) -> { update(changed, ev), setCompact(bool), destroy() }
 *   })
 *
 * ID 作用域：同一模块可能被同时挂到两个窗格，且不同模块用了相同的 id 名
 * （rabi-power 与 raman-qubit 都有 v-p / v-d / v-f）。因此每个挂载实例
 * 分配唯一前缀，模块内一律用 ctx.$('v-p') 取元素，不得直接 getElementById。
 *
 * 全局暴露为 window.YBM
 */
(function (root) {
  'use strict';

  var REG = {};
  var instances = [];
  var uid = 0;

  function register(def) {
    ['id', 'title', 'template', 'init'].forEach(function (k) {
      if (!def[k]) throw new Error('模块缺少必填字段: ' + k + ' (' + (def.id || '?') + ')');
    });
    def.reads = def.reads || [];
    def.writes = def.writes || [];
    REG[def.id] = def;
    if (root.dispatchEvent && typeof CustomEvent === 'function')
      root.dispatchEvent(new CustomEvent('ybm:registered', { detail: def.id }));
    return def;
  }

  function list() {
    return Object.keys(REG).map(function (k) {
      return { id: k, title: REG[k].title, subtitle: REG[k].subtitle || '' };
    });
  }

  /** 挂载一个模块到容器。返回实例句柄。 */
  function mount(moduleId, container, opts) {
    var def = REG[moduleId];
    if (!def) throw new Error('未注册的模块: ' + moduleId);
    opts = opts || {};
    var prefix = 'm' + (++uid) + '_';

    var ctx = {
      moduleId: moduleId,
      prefix: prefix,
      container: container,
      compact: !!opts.compact,
      id: function (name) { return prefix + name; },
      $: function (name) { return container.querySelector('#' + prefix + name); },
      $$: function (sel) { return container.querySelectorAll(sel); },
      store: root.YBStore,
      /** 写入 Store 时自动带上本模块 id，避免自己触发自己的提示条 */
      set: function (patch, meta) { return root.YBStore.update(patch, moduleId, meta); },
      /** 供模块声明"某个数值变了"，由外壳决定是否显示提示 */
      notify: function (html, level) { showBanner(inst, html, level); }
    };

    container.innerHTML =
      '<div class="mod-banner" id="' + prefix + '__banner"></div>' +
      '<div class="mod-body">' + def.template(ctx) + '</div>';

    var api = def.init(ctx) || {};
    var inst = {
      moduleId: moduleId, prefix: prefix, container: container,
      ctx: ctx, api: api, def: def, unsub: null
    };

    /* 订阅 reads 声明的路径 */
    if (def.reads.length) {
      inst.unsub = root.YBStore.subscribe(moduleId, def.reads, function (e) {
        if (api.update) { try { api.update(e.changed, e.event); }
                          catch (err) { console.error('[' + moduleId + '] update:', err); } }
        if (e.foreign) reportForeign(inst, e);
      });
    }
    if (opts.compact && api.setCompact) api.setCompact(true);
    instances.push(inst);
    return inst;
  }

  function unmount(inst) {
    if (inst.unsub) inst.unsub();
    if (inst.api.destroy) { try { inst.api.destroy(); } catch (e) { console.error(e); } }
    inst.container.innerHTML = '';
    instances = instances.filter(function (x) { return x !== inst; });
  }

  /* ---------- 变更提示条 ----------
   * 必须报出：哪个模块改的、哪个量、从多少到多少。
   * 只说「跃迁已改变」没有意义 —— 使用者需要能立刻判断影响有多大。
   */
  var LABEL = {
    'transition.Gamma_Hz': { name: 'Γ/2π', fmt: function (v) { return (v / 1e3).toPrecision(4) + ' kHz'; } },
    'transition.Ek_cm':    { name: '能级 E_k', fmt: function (v) { return v + ' cm⁻¹'; } },
    'transition.A':        { name: '同位素', fmt: function (v) { return 'A=' + v; } },
    'transition.I':        { name: '核自旋 I', fmt: function (v) { return String(v); } },
    'transition.Fp':       { name: "F′", fmt: function (v) { return String(v); } },
    'beam.wx':      { name: 'w_x', fmt: function (v) { return (v * 1e6).toPrecision(4) + ' µm'; } },
    'beam.wy':      { name: 'w_y', fmt: function (v) { return (v * 1e6).toPrecision(4) + ' µm'; } },
    'beam.eta':     { name: '透过率 η', fmt: function (v) { return v.toPrecision(3); } },
    'beam.P_laser': { name: '激光功率', fmt: function (v) { return (v * 1e3).toPrecision(4) + ' mW'; } },
    'beam.S3':      { name: 'S₃', fmt: function (v) { return v.toPrecision(3); } },
    'beam.B_G':     { name: '磁场 B', fmt: function (v) { return v.toPrecision(3) + ' G'; } },
    'raman.detuning_Hz': { name: '失谐 Δ', fmt: function (v) {
      return Math.abs(v) >= 1e9 ? (v / 1e9).toPrecision(4) + ' GHz' : (v / 1e6).toPrecision(4) + ' MHz'; } },
    'transition.element': { name: '元素', fmt: function (v) { return String(v); } },
    'transition.Jg':    { name: '基态 J', fmt: function (v) { return String(v); } },
    'transition.Jp':    { name: "激发态 J′", fmt: function (v) { return String(v); } },
    'transition.F':     { name: 'F', fmt: function (v) { return String(v); } },
    'transition.label': { name: '跃迁', fmt: function (v) { return String(v); } },
    'transition.src':   { name: '出处', fmt: function (v) { return String(v).slice(0, 40); } },
    'beam.theta0_deg':  { name: '波片零点 θ₀', fmt: function (v) { return v + '°'; } },
    'beam.theta_kB_deg':{ name: '光束–B 夹角 Θ', fmt: function (v) { return v + '°'; } },
    'beam.alpha_deg':   { name: '椭圆倾角 α', fmt: function (v) { return v + '°'; } },
    'limits.Pmax':      { name: '可用最大功率', fmt: function (v) { return (v * 1e3).toPrecision(4) + ' mW'; } },
    'limits.fRmax':     { name: '模型 Rabi 上限', fmt: function (v) { return (v / 1e6).toPrecision(4) + ' MHz'; } },
    'limits.wmin':      { name: '衍射极限', fmt: function (v) { return (v * 1e6).toPrecision(4) + ' µm'; } }
  };
  function describe(c) {
    var L = LABEL[c.path];
    if (!L) return c.path + ': ' + c.from + ' → ' + c.to;
    return L.name + ' ' + L.fmt(c.from) + ' → <b>' + L.fmt(c.to) + '</b>';
  }

  function reportForeign(inst, e) {
    var src = REG[e.event.origin];
    var who = src ? src.title : (e.event.origin || '外部');
    var rel = e.event.changes.filter(function (c) {
      return inst.def.reads.some(function (p) { return root.YBStore.matches(p, c.path); });
    });
    if (!rel.length) return;
    var msg = '<b>' + who + '</b> 改变了：' + rel.map(describe).join('；');
    if (inst.api.impact) {
      var imp = inst.api.impact();
      if (imp) msg += '<br>本模块结果：' + imp;
    }
    showBanner(inst, msg, 'warn', true);
  }

  function showBanner(inst, html, level, withUndo) {
    var el = document.getElementById(inst.prefix + '__banner');
    if (!el) return;
    el.className = 'mod-banner on ' + (level || 'warn');
    el.innerHTML =
      '<span class="bm">' + html + '</span>' +
      '<span class="bb">' +
      (withUndo ? '<button class="seg mini" data-act="undo">撤销</button>' : '') +
      '<button class="seg mini" data-act="ok">知道了</button></span>';
    el.querySelectorAll('button').forEach(function (b) {
      b.onclick = function () {
        if (b.dataset.act === 'undo') root.YBStore.undo();
        el.className = 'mod-banner'; el.innerHTML = '';
      };
    });
  }

  root.YBM = {
    register: register, list: list, mount: mount, unmount: unmount,
    get registry() { return REG; },
    get instances() { return instances; },
    describe: describe, LABEL: LABEL
  };
})(typeof window !== 'undefined' ? window : globalThis);
