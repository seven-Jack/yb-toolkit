/* shell/store.js — 全局状态
 *
 * 硬规则：只存"输入"，绝不存"派生量"。
 *   存 transition（元素/同位素/能级/Γ），不存 d、λ、CG
 *   存 beam（束腰/功率/透过率），不存 I₀、E₀、Ω
 * 派生量一律由 shared/physics.js 与 shared/wigner.js 现算。
 * 违反此规则会产生"改了同位素但 d 没跟着变"这类静默错误 —— 本项目最危险的一类 bug。
 *
 * 全局暴露为 window.YBStore
 */
(function (root) {
  'use strict';

  var C = root.YBC;

  /* ---------- 默认状态 ---------- */
  function defaults() {
    return {
      transition: {
        element: 'Yb', A: 171, I: C.YB171.I_171.v,
        Ek_cm: C.YB171.Ek_3P1.v,
        Jg: 0, Jp: C.YB171.J_3P1.v,
        Gamma_Hz: C.YB171.Gamma_556.v,
        F: 0.5, Fp: 1.5,
        label: 'Yb-171  ¹S₀ → ³P₁',
        src: C.YB171.Ek_3P1.src
      },
      beam: {
        wx: 365e-6, wy: 365e-6, eta: 0.5, P_laser: 0.080,
        theta0_deg: 0, theta_kB_deg: 90, B_G: 1.66, S3: 0.836, alpha_deg: 61.6
      },
      raman: { detuning_Hz: 180e6 },
      limits: { Pmax: 0.5, fRmax: 20e6, wmin: 1e-6 },
      units: { power: 'mW', freq: 'MHz', length: 'µm', dipole: 'e·a₀' }
    };
  }

  var state = defaults();
  var subs = [];          /* {id, paths, fn} */
  var seq = 0;

  /* ---------- 路径工具 ---------- */
  function get(path) {
    var parts = path.split('.'), o = state;
    for (var i = 0; i < parts.length && o != null; i++) o = o[parts[i]];
    return o;
  }
  function setPath(path, v) {
    var parts = path.split('.'), o = state;
    for (var i = 0; i < parts.length - 1; i++) o = o[parts[i]];
    var k = parts[parts.length - 1], old = o[k];
    o[k] = v;
    return old;
  }
  /** 'transition.*' 匹配 'transition.Gamma_Hz'；'beam.wx' 精确匹配 */
  function matches(pattern, path) {
    if (pattern === path) return true;
    if (pattern.slice(-2) === '.*') return path.indexOf(pattern.slice(0, -1)) === 0;
    return false;
  }

  /* ---------- 变更 ----------
   * origin 是发起模块的 id。订阅者收到通知时可据此判断
   * 「是我自己改的」（不弹提示）还是「别人改的」（弹提示）。
   */
  function update(patch, origin, meta) {
    var changes = [];
    for (var path in patch) {
      var nv = patch[path], ov = get(path);
      if (ov === nv) continue;
      setPath(path, nv);
      changes.push({ path: path, from: ov, to: nv });
    }
    if (!changes.length) return [];
    var ev = { changes: changes, origin: origin || null, meta: meta || {}, seq: ++seq };
    history.push({ ev: ev, snapshot: changes.map(function (c) {
      return { path: c.path, value: c.from }; }) });
    if (history.length > 50) history.shift();
    notify(ev);
    return changes;
  }
  function notify(ev) {
    var paths = ev.changes.map(function (c) { return c.path; });
    subs.forEach(function (s) {
      var hit = paths.filter(function (p) {
        return s.paths.some(function (pat) { return matches(pat, p); });
      });
      if (hit.length) {
        try { s.fn({ changed: hit, event: ev, foreign: ev.origin !== s.id }); }
        catch (e) { console.error('[store] 订阅者 ' + s.id + ' 抛出:', e); }
      }
    });
  }

  var history = [];
  /** 撤销最近一次变更（提示条上的「撤销」按钮） */
  function undo() {
    var last = history.pop();
    if (!last) return false;
    var patch = {};
    last.snapshot.forEach(function (s) { patch[s.path] = s.value; });
    var saved = history.length;
    update(patch, '__undo__', { undoOf: last.ev.seq });
    history.length = saved;   /* 撤销本身不进历史 */
    return true;
  }

  function subscribe(id, paths, fn) {
    var s = { id: id, paths: paths, fn: fn };
    subs.push(s);
    return function () { subs = subs.filter(function (x) { return x !== s; }); };
  }

  function reset() { state = defaults(); history.length = 0; notify({
    changes: [{ path: '*', from: null, to: null }], origin: '__reset__', meta: {}, seq: ++seq }); }

  /* ---------- 派生量：一律现算，绝不缓存 ---------- */
  var derived = {
    /** 真空波长 (m)，由 NIST 能级导出 */
    lambda_m: function () { return root.YBW.lamVacFromLevel(state.transition.Ek_cm) * 1e-9; },
    lambda_nm: function () { return root.YBW.lamVacFromLevel(state.transition.Ek_cm); },
    /** Edmonds 约化矩阵元 ⟨J′‖d‖J⟩ (C·m)，由 Γ 反解 —— 绝不存文献 d 值 */
    d_red_SI: function () {
      var t = state.transition;
      return root.YBW.dFromGamma(t.Gamma_Hz, derived.lambda_nm(), t.Jp) * C.SI.ea0;
    },
    d_red_au: function () { return derived.d_red_SI() / C.SI.ea0; },
    /** 每个 q 分量的裸矩阵元。仅在 J=0 基态下 d_cyc = d_red/√(2J′+1)。
     *  J≠0 时该简化不成立（6j 因子不再被吸收），返回 NaN。
     *  调用方必须用 derived.dCycValid() 判断并给出说明，不得直接显示 NaN。 */
    d_cyc_SI: function () {
      var t = state.transition;
      if (t.Jg !== 0) return NaN;
      return derived.d_red_SI() / Math.sqrt(2 * t.Jp + 1);
    },
    /** d_cyc 是否适用；不适用时 reason 说明原因，供界面直接显示 */
    dCycValid: function () {
      var t = state.transition;
      if (t.Jg !== 0) return { ok: false, reason:
        '当前跃迁基态 J=' + t.Jg + ' ≠ 0，d_cyc = d_red/√(2J′+1) 的简化不成立' +
        '（6j 因子不再被 d_cyc 的定义吸收）。本模块的单光子换算仅适用于 J=0 基态，' +
        '如 Yb / Sr / Ca / Mg / Hg / Cd 的 ¹S₀。碱金属需走完整的超精细约化矩阵元。' };
      return { ok: true, reason: '' };
    },
    /** 到达原子的功率 (W) */
    P_atom: function () { return state.beam.eta * state.beam.P_laser; },
    /** 峰值光强与电场 */
    I0: function () { return root.YB.intensity(derived.P_atom(), state.beam.wx, state.beam.wy); },
    E0: function () { return root.YB.efield(derived.I0()); },
    /** 光斑几何平均 */
    wg: function () { return Math.sqrt(state.beam.wx * state.beam.wy); },
    /** 单光子 Rabi (Hz)，用 d_cyc */
    fR_single: function () {
      return root.YB.rabiHz(derived.d_cyc_SI(), derived.P_atom(), state.beam.wx, state.beam.wy);
    },
    /** 拉曼几何因子 */
    geom: function () {
      return root.YB.geomFactor(state.beam.S3, state.beam.theta_kB_deg * Math.PI / 180);
    },
    /** 拉曼 Ω_R (rad/s)，用 d_red */
    ramanOmega: function () {
      return root.YB.ramanOmega(derived.d_red_SI(), derived.P_atom(),
        state.beam.wx, state.beam.wy, state.raman.detuning_Hz, derived.geom());
    }
  };

  root.YBStore = {
    get state() { return state; },
    get: get, update: update, subscribe: subscribe,
    undo: undo, reset: reset, defaults: defaults,
    derived: derived, matches: matches,
    get history() { return history; }
  };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && module.exports)
  module.exports = (typeof window !== 'undefined' ? window : globalThis).YBStore;
