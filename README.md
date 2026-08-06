# ¹⁷¹Yb 中性原子量子计算 · 计算工具集

面向实验平台的在线计算器。无构建工具，双击 `index.html` 即可运行。

## 在线使用（Cloudflare Pages）

- **生产版（main）**：https://yb-toolkit.pages.dev —— 组里其他人用，右上角显示 `stable`
- **开发版（dev）**：每次 push 到 `dev` 自动生成独立预览网址，见
  Cloudflare Pages → 项目 → Deployments 里对应构建的链接，右上角显示 commit hash + 「开发版」徽标

## 快速开始

```bash
git clone <repo> && cd yb-toolkit
python3 -m http.server 8000      # 然后打开 http://localhost:8000
node tests/bench.js && python3 tests/bench.py    # 跑测试
```

直接双击 `index.html` 也能用，但 `localStorage` 在 `file://` 下各浏览器行为不一致，
开发时建议起本地服务。

## 两种界面

| | 主页面 `index.html` | 独立页面 `tools/*.html` |
|---|---|---|
| 形态 | 上下分栏，同时看两个模块 | 单页全功能 |
| 数据 | 共享 Store，模块间实时联动 | 各自独立，靠 URL 传参 |
| 功能 | 核心视图 + 可展开 | 全部功能 |
| 适合 | 跨模块工作流、演示、快速估算 | 深入某一个计算 |

**物理不会分叉**：两者都从 `shared/constants.js` 与 `shared/physics.js` 取值，
公式与常数只有一份。`tools/*.html` 三个独立页（rabi-power / raman-qubit /
hfs-matrix-element）都已是只挂载单模块的薄壳，只剩导航与 URL 恢复/写入——
模块与独立页的界面代码已收敛（3b-3 完成）。

## 目录

```
index.html              外壳：顶栏 + 上下分栏
shell/
  store.js              全局状态（只存输入，派生量现算）
  registry.js           模块注册、挂载、变更提示条
  panes.js              分栏、拖拽、紧凑模式、URL
modules/
  rabi-power.js         ★ 模块实现
  raman-qubit.js
  hfs-matrix-element.js
tools/
  rabi-power.html       完整版独立页面
  raman-qubit.html
  hfs-matrix-element.html
shared/
  constants.js          ★ 物理常数唯一来源，每项带出处
  physics.js            ★ 公式唯一来源
  wigner.js             ★ Wigner 3j/6j 与角动量代数
  units.js              单位换算与自动量纲
  urlstate.js           URL 状态编码
  plot.js               画布工具箱（含性能修复，勿回退）
  version.js            版本戳
  style.css             设计系统
tests/
  vectors.json          ★ 两套实现共用的测试向量
  bench.js / bench.py   JS 与 Python 各跑一遍
  crosscheck.js         校验两侧常数逐位一致
  smoke.js              模块挂载与 Store 联动的无浏览器烟雾测试
data/
  references.json       文献值与出处
  calibrations.json     本组实测标定
scripts/stamp.sh        构建时注入 commit/日期
```

## 六条硬规则

**⓪ 绝不存文献 d 值，一律由 Γ 反解。**
偶极矩阵元有多套归一化（`d_Edmonds = √(2J+1)·d_CG`），混用是本项目
栽跟头最多的地方。J=0 基态时该因子恰为 1，所以 Yb 一直没暴露问题，
换到碱金属（J=1/2）就会差 √2。由 Γ 反解可保证约定自洽。

**① 常数只在 `shared/constants.js` 定义一次。**
工具页面里出现任何裸数字都是 bug 的温床。我们已经因为"同一常数各写一份"
栽过三次：d 的两种归一化混用、Δ_hf 符号取反、α 被硬编码为 45°。
每个常数必须带 `src` 说明它从哪来。

**② 公式只在 `shared/physics.js` 定义一次，改动必须先过测试向量。**
`tests/vectors.json` 里的期望值全部来自 notebook 输出或论文原文，
不是"当前代码算出来的值"。这是它有意义的前提。

**③ 不在绘图循环里调 `getComputedStyle`、读 `clientWidth`、或解析单位。**
读布局与写 DOM 交替会触发同步重排，页面在连续输入时会卡死。
`shared/plot.js` 已把主题色和画布尺寸缓存好，用它提供的接口即可；
单位在每次重绘开始时解析一次并缓存，不在循环内反复调 `YBU.resolve`。

**④ Store 只存输入，派生量一律现算。**
存 `transition`（元素/同位素/能级/Γ），不存 `d`、`λ`、`CG`。
缓存派生量会产生"改了同位素但 d 没跟着变"这类静默错误 —— 本项目最危险的一类 bug。

**⑤ 不用脚本批量改写源码或数据文件。**
用精确的小步编辑，每步之后立即 `node --check`（JS）或 `json.load`（JSON）验证。
需要临时构造坏数据做反向验证时，在内存里构造，不写磁盘。
本项目已因违反此条两次损坏文件：一次数据库（`json.dump` 重排/转义/损坏
`data/transitions.json`），一次模块源码（批量删除误删 `compute()` 与 `V.ram`，
模块直接起不来）。

## 分支与部署

| 分支 | 网址 | 谁用 |
|---|---|---|
| `main` | `yb-toolkit.pages.dev` | 组里其他人 |
| `dev` | `Deployments` 页里的预览链接（每次 push 独立网址） | 你 |

推荐 Cloudflare Pages 或 Netlify（每个分支自动生成独立预览网址，免费）。
GitHub Pages 只能部署一个分支，你一改别人就跟着受影响。

部署设置：构建命令 `bash scripts/stamp.sh`，输出目录 `.`（本仓库无需编译）。

日常流程：在 `dev` 上改 → CI 跑测试 → 自己在 dev 网址上验证 → 合并到 `main`。

## URL 状态

所有输入都编码在网址里：

```
tools/rabi-power.html#d=0.5409ea0&P=40mW&w=365um&f=1.726MHz
```

页脚「复制链接」按钮生成当前状态的完整网址。报问题、推荐工作点、
在实验记录里引用某次计算 —— 发链接比发截图有用得多，对方打开就是你那一屏。

未知参数会被原样保留，所以将来加字段不会破坏旧链接。

## 控制台 API

任意工具页面按 F12：

```js
YB.rabiHz(YB.d_cyc, 1e-3, 50e-6)   // 55354135 Hz
YB.powerW(YB.d_red, 1.73e6, 365e-6)
YB.const.D_hf                       // {v: 5.936e9, u:'Hz', src:'...'}
YBU.auto('time', 1.45e-7)           // "145 ns"
```

参数一律 SI。想做批量扫描直接写循环即可，不必改代码。

## 两个易错点

**标度律不同。** 单光子 `f_R ∝ √P`，双光子拉曼 `Ω_R ∝ P`。
功率翻倍时前者快 1.41 倍、后者快 2 倍。两个工具的数字不能混用。

**束腰是 1/e² 强度半径。** 不是直径，也不是 1/e 场半径。
用错会让结果差 2 倍，而且不会有任何报错。

## 加一个新模块

1. 复制 `modules/rabi-power.js` 作模板
2. 用 `ctx.id('x')` 生成带前缀的 id，用 `ctx.$('x')` 取元素 ——
   **不要直接 `getElementById`**，同一模块可能同时挂在两个窗格
3. 声明 `reads` / `writes`：`reads` 决定外部改动时是否弹提示条，
   自己通过 `ctx.set()` 写入的不会触发自己的提示
4. 常数从 `YBC` 取，公式从 `YB` / `YBW` 取，不要新写
5. 新公式先往 `tests/vectors.json` 加向量，两套实现都过了再接界面
6. 实现 `setCompact(bool)`：紧凑模式下收起折叠区、缩小图高
7. 实现 `impact()`：返回一行字符串，显示在别的模块改动时的提示条里
8. 在 `index.html` 末尾加一行 `<script src="modules/xxx.js">`

## 模块契约

```js
YBM.register({
  id: 'rabi-power',
  title: 'Rabi–功率',
  reads:  ['transition.*', 'beam.wx'],
  writes: ['beam.P_laser'],
  template(ctx) { return '<div id="' + ctx.id('v-p') + '">...'; },
  init(ctx) {
    return {
      update(changed, ev) {},   // Store 变化时
      setCompact(on) {},        // 窗格变矮时
      impact() { return '...'; },
      destroy() {}
    };
  }
});
```

## 待办

按优先级：

1. **`data/calibrations.json` 全为 null，待填入实测值。**
   偏振与几何标定（波片零点 θ₀、光束–磁场夹角 Θ_kB）完成前，
   拉曼模块的绝对幅度不应作定量预测。
2. ~~**模块与独立页面收敛（3b-3）。**~~ 已完成：`tools/*.html` 三个独立页都改为
   只挂载单模块的薄壳（raman 含全部功能：光束几何、不确定度滑块、功率扫描图、
   λ/4 波片角度输入、CSV 导出、notebook 对账；hfs 含超精细约化矩阵元表、
   求和扫描、导出、循环徽标），界面代码重复已消除。
3. ~~`tools/raman-qubit.html`（独立页面）的画布代码尚未迁到 `shared/plot.js`，~~
   ~~仍有 v7 之前的布局抖动问题。~~ 已随 3b-3 薄壳消除（模块用 `shared/plot.js`，
   独立页改为薄壳不再有自己的画布）。
4. Γ 长期挂着 183 / 182 两个值终究会出岔子，查一次原始文献定死一个。
5. ~~真实浏览器验证。~~ 已完成：`tests/browser.js`（Playwright + 系统 Chrome）
   覆盖 canvas 渲染（数不透明像素）、布局、拖拽、fetch 加载数据库，已接入 CI。

## 依据

- A. Jenkins et al., *Ytterbium Nuclear-Spin Qubits in an Optical Tweezer Array*,
  PRX **12**, 021027 (2022) 及勘误 PRX **13**, 029902 (2023)
- M. Jones, A. van Kann, J. McFerran, Appl. Opt. **62**, 3932 (2023)（超精细常数）
- 本组 `00_2_yb556_rabi_power_conversion.ipynb`（绝对矩阵元标定）
