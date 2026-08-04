/* shared/physics.js — 物理公式唯一来源
 *
 * 任何工具页面不得自行实现这些公式。改动必须先通过 tests/vectors.json。
 * 全局暴露为 window.YB（同时作为控制台 API，见 README）
 */
(function (root) {
  'use strict';

  var C = root.YBC;
  var SI = C.SI, Y = C.YB171;

  /* =========================================================
   * 一、高斯光束（单光子共振，与 notebook / .py 完全一致）
   * ========================================================= */

  /** 峰值光强 I₀ = 2P/(π w_x w_y) */
  function intensity(P_W, wx_m, wy_m) {
    return 2 * P_W / (Math.PI * wx_m * wy_m);
  }

  /** 峰值电场 E₀ = √(2I₀/cε₀) */
  function efield(I_Wm2) {
    return Math.sqrt(2 * I_Wm2 / (SI.c * SI.eps0));
  }

  /** 可分离系数 C：f_R = C·√P/√(w_x w_y)。绘图热路径用，数值与逐步链条一致 */
  function Ccoef(d_SI) {
    return d_SI / (Math.PI * SI.hbar * Math.sqrt(Math.PI * SI.c * SI.eps0));
  }

  /** 单光子 Rabi 频率 f_R = Ω/2π (Hz)。d_SI 为 C·m */
  function rabiHz(d_SI, P_W, wx_m, wy_m) {
    if (wy_m === undefined) wy_m = wx_m;
    var wg = Math.sqrt(wx_m * wy_m);
    return wg > 0 ? Ccoef(d_SI) * Math.sqrt(Math.max(P_W, 0)) / wg : 0;
  }

  /** 逆向：达到 f_R 所需功率 (W) */
  function powerW(d_SI, fR_Hz, wx_m, wy_m) {
    if (wy_m === undefined) wy_m = wx_m;
    var Cc = Ccoef(d_SI);
    if (Cc <= 0) return 0;
    var s = fR_Hz * Math.sqrt(wx_m * wy_m) / Cc;
    return s * s;
  }

  /* =========================================================
   * 二、双光子拉曼（¹⁷¹Yb 核自旋比特，经 ³P₁）
   * 注意标度律与单光子不同：Ω_R ∝ P，而非 √P
   * ========================================================= */

  /** 超精细相消干涉因子 Δ_hf/(Δ+Δ_hf)。Δ 以 F′=3/2 为零点，蓝失谐为正 */
  function hfFactor(D_Hz) {
    return Y.D_hf.v / (D_Hz + Y.D_hf.v);
  }

  /** 几何因子 = |S₃|·sinΘ_kB。线偏振或光束∥B 时为零 */
  function geomFactor(S3, theta_kB_rad) {
    return Math.abs(S3) * Math.sin(theta_kB_rad);
  }

  /** λ/4 波片：线偏振入射，S₃ = -sin2(θ-θ₀)，同时返回椭圆倾角 α */
  function qwp(u_rad) {
    var c = Math.cos(u_rad), s = Math.sin(u_rad);
    var Ez = [c * c, s * s], Ep = [s * c, -s * c];
    var mz = Math.hypot(Ez[0], Ez[1]), mp = Math.hypot(Ep[0], Ep[1]);
    return {
      S3: 2 * (Ep[1] * Ez[0] - Ep[0] * Ez[1]) / (mz * mz + mp * mp),
      alpha: Math.atan2(mp, mz)
    };
  }

  /** 拉曼 Rabi 频率 Ω_R (rad/s)。d_SI 应为 d_red（约化矩阵元） */
  function ramanOmega(d_SI, P_W, wx_m, wy_m, D_Hz, geom) {
    var Dr = 2 * Math.PI * D_Hz;
    if (Dr === 0) return 0;
    return (2 / 9) * geom * hfFactor(D_Hz) * d_SI * d_SI * P_W /
           (Math.PI * SI.c * SI.eps0 * SI.hbar * SI.hbar * wx_m * wy_m * Dr);
  }

  /** 两条腿的单光子 Rabi 频率 (rad/s)，α 为椭圆倾角 */
  function ramanLegs(d_SI, E0, alpha_rad) {
    return {
      pi:    Math.SQRT2 / 3 * d_SI * E0 * Math.cos(alpha_rad) / SI.hbar,
      sigma: (1 / 3) * d_SI * E0 * Math.sin(alpha_rad) / Math.SQRT2 / SI.hbar
    };
  }

  /** 微分光频移 Δ_LS = δ_Z(8Ω_σ²+Ω_π²)/(4Δ²)，返回 rad/s */
  function lightShift(Om_pi, Om_sigma, D_Hz) {
    var Dr = 2 * Math.PI * D_Hz;
    if (Dr === 0) return 0;
    return (2 * Math.PI * Y.D_e.v) / (4 * Dr * Dr) * (8 * Om_sigma * Om_sigma + Om_pi * Om_pi);
  }

  /** π/2 门散射误差（Raman + Rayleigh） */
  function scatterError(D_Hz) {
    if (D_Hz === 0 || D_Hz + Y.D_hf.v === 0) return Infinity;
    return (Math.PI / 2) * (Y.Gamma_556.v / (Math.sqrt(6) * Math.abs(D_Hz))) *
           Math.abs(Y.D_hf.v / (D_Hz + Y.D_hf.v));
  }

  /** 转角误差 sin²(θ√(2/π))，用于光频移失谐与强度噪声 */
  function areaError(theta_rad) {
    var s = Math.sin(Math.abs(theta_rad) * Math.sqrt(2 / Math.PI));
    return s * s;
  }

  /* =========================================================
   * 三、适用性检查（返回警告数组，两个工具共用）
   * ========================================================= */
  function checkValidity(o) {
    var w = [];
    if (o.Omega_pi && o.D_Hz) {
      var ad = Math.abs(2 * Math.PI * o.D_Hz / o.Omega_pi);
      if (ad < 10) w.push({ level: 'warn', key: 'adiabatic',
        msg: 'Δ/Ω_π = ' + ad.toFixed(1) + ' < 10，绝热消除余量不足' });
    }
    if (o.D_Hz !== undefined && Math.abs(o.D_Hz + Y.D_hf.v) < 1.5e9) {
      w.push({ level: 'bad', key: 'hf_resonance',
        msg: 'Δ 接近 F′=1/2 共振（−5.94 GHz）' });
    }
    if (o.fR_Hz && o.B_G) {
      var zeeman = Y.gF_3P1_32.v * SI.muB_h * o.B_G;
      if (o.fR_Hz > 0.2 * zeeman) w.push({ level: 'warn', key: 'multi_branch',
        msg: 'Ω 未远小于激发态塞曼劈裂 ' + (zeeman / 1e6).toFixed(2) +
             ' MHz，多条 m_F 支路会同时被驱动' });
    }
    return w;
  }

  root.YB = {
    /* 常数直通 */
    const: C.YB171, SI: SI, CG: C.CG,
    d_cyc: C.d_cyc_SI, d_red: C.d_red_SI,
    /* 单光子 */
    intensity: intensity, efield: efield, Ccoef: Ccoef,
    rabiHz: rabiHz, powerW: powerW,
    dCycFromLinewidth: C.dCycFromLinewidth,
    /* 拉曼 */
    hfFactor: hfFactor, geomFactor: geomFactor, qwp: qwp,
    ramanOmega: ramanOmega, ramanLegs: ramanLegs,
    lightShift: lightShift, scatterError: scatterError, areaError: areaError,
    /* 检查 */
    checkValidity: checkValidity
  };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof window !== 'undefined' ? window : globalThis).YB;
}
