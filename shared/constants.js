/* shared/constants.js — 物理常数唯一来源
 *
 * 规则：任何常数只在此处定义一次。工具页面不得硬编码数值。
 * 每一项必须带 src 说明出处，改动必须同时更新 src 与 CHANGELOG。
 *
 * 全局暴露为 window.YBC
 */
(function (root) {
  'use strict';

  /* ---------- CODATA 2018 ---------- */
  var SI = {
    hbar:    1.054571817e-34,   // J·s
    c:       2.99792458e8,      // m/s
    eps0:    8.8541878128e-12,  // F/m
    e:       1.602176634e-19,   // C
    a0:      5.29177210903e-11, // m
    muB_h:   1.39962449e6,      // Hz/G  (玻尔磁子 / h)
    muN_h:   762.2593285        // Hz/G  (核磁子 / h)
  };
  SI.ea0 = SI.e * SI.a0;        // 8.478353625e-30 C·m
  SI.debye = 3.33564095198e-30; // C·m

  /* ---------- ¹⁷¹Yb ----------
   * 归一化约定（务必分清，历史上出过错）：
   *   d_cyc  = 每个球张量分量 q 的裸跃迁矩阵元，由线宽反推
   *   d_red  = ⟨¹S₀‖er‖³P₁⟩ 约化矩阵元 = √3 · d_cyc（Steck 归一化）
   * notebook 的 D_linewidth 表用 d_cyc；v2–v4 拉曼主式用 d_red。
   */
  var YB171 = {
    /* --- 556 nm  ¹S₀ ↔ ³P₁ ---
     * 波长不直接存，改存 NIST 能级并导出真空波长，从根上避免空气/真空混用。
     * 该做法与 hfs-matrix-element-calculator v2.1 一致；notebook cell 3 由
     * rydcalc 独立算出 555.802363 nm，两条路径相互印证。
     */
    Ek_3P1: { v: 17992.007, u: 'cm⁻¹',
      src: 'NIST ASD 激发态能级。真空波长 λ = 10⁷/E_k = 555.802363 nm' },
    lambda_556: { v: 555.802363e-9, u: 'm',
      src: '由 Ek_3P1 导出。此前版本用 556.0 nm，偏差 +0.036%，导致 d 偏高 0.053%' },

    /* --- 线宽 ---
     * 文献分散 182–184 kHz。默认取 183 kHz（notebook 标定所用值），
     * 同时保留 182 kHz（hfs 计算器所用值）供对照。d ∝ √Γ，两者差 0.27%。
     * 换默认值前请先确认全部测试向量的期望值是否随之更新。
     */
    Gamma_556: { v: 183e3, u: 'Hz',
      src: 'Γ/2π，³P₁ 自发衰变率。notebook cell 1 标定输入',
      spread: [182e3, 184e3],
      alt: { v: 182e3, src: 'τ=874 ns，hfs-matrix-element-calculator v2 采用' },
      note: '文献分散 182–184 kHz，对 d 的影响约 ±0.3%，在实验不确定度内' },

    /* --- 偶极矩阵元 ---
     * 纪律：绝不存文献 d 值，一律由 Γ 反解，保证与本框架约定自洽。
     * 归一化陷阱：d_Edmonds = √(2J+1)·d_CG。J=0 基态时该因子为 1，
     * 所以 Yb 一直没暴露问题，但换到碱金属（J=1/2）会差 √2。
     */
    d_cyc: { v: 0.312150, u: 'e·a₀',
      src: '√(3πε₀ℏc³Γ/ω₀³)，Γ=183 kHz、λ=555.802363 nm。每个 q 分量的裸跃迁矩阵元',
      note: '旧值 0.312316 基于 556.0 nm，v0.2.0 起改用 NIST 导出波长' },
    d_red: { v: 0.540659, u: 'e·a₀',
      src: '√3 × d_cyc = ⟨¹S₀‖er‖³P₁⟩，Edmonds/Steck 归一化。与 hfs 计算器逐位一致' },

    /* --- ³P₁ 超精细结构 ---
     * 符号极易搞反：A > 0 ⟹ F′=3/2 在 F′=1/2 之上。
     * v1 曾写成 (Δ − Δ_hf)，导致 +5.9 GHz 处出现虚假发散警告。
     */
    A_3P1: { v: 3957.833e6, u: 'Hz',
      src: 'Jones, van Kann, McFerran, Appl. Opt. 62, 3932 (2023)。A>0' },
    D_hf: { v: +5.936e9, u: 'Hz',
      src: '3A/2 = 5.936 GHz。正号表示 F′=3/2 在上。失谐 Δ 以 F′=3/2 为零点，蓝失谐为正' },
    D_e: { v: 2.65e6, u: 'Hz',
      src: "³P₁ F′=3/2 内部 m′=±1/2 劈裂，Jenkins et al. 工作点值" },

    /* --- g 因子与塞曼 --- */
    gamma_n: { v: 751, u: 'Hz/G',
      src: '¹S₀ 基态纯核自旋，2μ/h with μ=0.4919 μ_N。极小，无法用频率分辨基态 m_F' },
    gF_3P1_32: { v: 1.0, u: '1',
      src: "g_J(³P₁)=1.5, F′=3/2 → g_F=1.0 ⟹ 1.40 MHz/G" },

    /* --- 核自旋（决定 F 取值与 CG 表） --- */
    I_171: { v: 0.5, u: '1', src: '¹⁷¹Yb，丰度 14.3%' },
    I_173: { v: 2.5, u: '1', src: '¹⁷³Yb，丰度 16.1%。CG 表与 ¹⁷¹Yb 完全不同' },
    J_ground: { v: 0, u: '1', src: '¹S₀。J=0 是本框架多处简化的前提' },
    J_3P1: { v: 1, u: '1', src: '³P₁' },

    /* --- 论文工作点，用于回归测试 --- */
    ref_workpoint: {
      src: 'A. Jenkins et al., PRX 12, 021027 (2022) + 勘误 PRX 13, 029902 (2023)',
      detuning_Hz: 180e6,
      power_W: 0.040,
      waist_m: 365e-6,
      alpha_deg: 61.6,
      S3: 0.836,
      Omega_R_Hz: 1.77e6,
      note: '实测 1.77 MHz；本工具算得 1.73 MHz（4% 内）'
    }
  };

  /* ---------- Clebsch–Gordan：由 shared/wigner.js 计算，不再硬编码 ----------
   * 因 ¹S₀ 的 J=0，基态只有一个 F，求和规则使每个激发态子能级的
   * CG 平方和恰为 1，故 6j 因子已被 d_cyc 的定义吸收，不必再乘。
   * ⚠ 此简化仅在 J=0 基态成立；换其他体系必须走完整的 6j。
   *
   * 数值以 d_cyc 为单位（即 Wigner 结果 × √3，因为 d_red = √3 d_cyc）。
   * 若 wigner.js 未加载则退回硬编码值，并在 CG._computed 标记。
   */
  function buildCG() {
    var W = root.YBW;
    if (!W) {
      return {
        F32: { stretched: 1.0, pi: Math.sqrt(2/3), sigma: Math.sqrt(1/3) },
        F12: { stretched: null, pi: -Math.sqrt(1/3), sigma: -Math.sqrt(2/3) },
        _computed: false,
        note: 'wigner.js 未加载，使用硬编码值'
      };
    }
    var I = 0.5, J = 0, Jp = 1, F = 0.5, s3 = Math.sqrt(3);
    function z(Fp, mp, q) { return W.zee(I, J, Jp, F, 0.5, Fp, mp, q) * s3; }
    return {
      F32: { stretched: z(1.5, 1.5, 1), pi: z(1.5, 0.5, 0), sigma: z(1.5, -0.5, -1) },
      F12: { stretched: null,           pi: z(0.5, 0.5, 0), sigma: z(0.5, -0.5, -1) },
      _computed: true,
      note: "F′=1/2 的 CG 为负 —— 这正是拉曼相消干涉因子 Δ_hf/(Δ+Δ_hf) 的来源"
    };
  }
  var CG = buildCG();

  /* ---------- 便捷取值 ---------- */
  function v(entry) { return entry && typeof entry === 'object' ? entry.v : entry; }

  root.YBC = {
    SI: SI,
    YB171: YB171,
    CG: CG,
    rebuildCG: function () { CG = buildCG(); root.YBC.CG = CG; return CG; },
    v: v,
    /* 常用直取 */
    d_cyc_SI: YB171.d_cyc.v * SI.ea0,
    d_cyc_alt182_SI: 0.311295 * SI.ea0,   /* Γ=182 kHz 对照值 */
    d_red_SI: YB171.d_red.v * SI.ea0,

    /* 由线宽反推 d_cyc，供其他跃迁复用 */
    dCycFromLinewidth: function (Gamma_Hz, lambda_m) {
      var G = 2 * Math.PI * Gamma_Hz;
      var w0 = 2 * Math.PI * SI.c / lambda_m;
      return Math.sqrt(3 * Math.PI * SI.eps0 * SI.hbar * SI.c * SI.c * SI.c * G / (w0 * w0 * w0));
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof window !== 'undefined' ? window : globalThis).YBC;
}
