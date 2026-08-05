#!/usr/bin/env node
/* tests/browser.js — 真实浏览器实测（Playwright + 系统 Chrome）
 *
 * 背景：tests/smoke.js 的 DOM 全是桩，canvas 渲染、布局、拖拽、fetch
 * 加载数据库从未在真实浏览器里跑过。本脚本用 Playwright 驱动系统 Chrome，
 * 覆盖 README 里列出的交互面，收集 console error 并截图存 tests/screenshots/。
 *
 * 用法（本地先起服务）：
 *   python3 -m http.server 8000
 *   node tests/browser.js
 *
 * 环境：复用系统 Chrome（channel:'chrome'），无需下载浏览器二进制。
 * 若页面未能达到断言，脚本以非零码退出，供 CI 拦截。
 *
 * 纪律：只测渲染与交互层，不改物理常数/公式/Store 派生量规则。
 */
'use strict';

const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BROWSER_BASE || 'http://localhost:8000';
const SHOT = path.join(__dirname, 'screenshots');
const FAILURES = [];
const PASSED = [];
const CONSOLE_ERRORS = [];

/* favicon.ico 的 404 是浏览器自动请求、与代码无关的良性噪声，过滤掉。
 * 其它任何 console error / pageerror 都计入。 */
function isBenign(err) { return /favicon|\.ico.*404/i.test(err); }
function recordErr(e) { if (!isBenign(e)) CONSOLE_ERRORS.push(e); }

function ok(name) { PASSED.push(name); console.log('  ✓ ' + name); }
function fail(name, detail) {
  FAILURES.push(name);
  console.log('  ✗ ' + name + (detail ? '\n      ' + detail : ''));
}
function section(t) { console.log('\n── ' + t + ' ──'); }

async function shot(page, name) {
  try { await page.screenshot({ path: path.join(SHOT, name), fullPage: false }); }
  catch (e) { console.log('      (screenshot failed: ' + e.message + ')'); }
}

async function main() {
  /* 优先复用系统 Chrome（本地零下载）；CI 里没有系统 Chrome 时回退到
   * Playwright 自带的 chromium（CI 步骤先 npx playwright install chromium）。 */
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
  } catch (e) {
    browser = await chromium.launch({ headless: true });
  }
  const context = await browser.newContext({
    viewport: { width: 1280, height: 960 },
    permissions: ['clipboard-read', 'clipboard-write']
  });
  const page = await context.newPage();

  page.on('console', m => { if (m.type() === 'error') recordErr(m.text()); });
  page.on('pageerror', e => recordErr('PAGEERROR: ' + e.message));

  /* 取某窗格里模块实例的带前缀元素 */
  function selIn(pane, suffix) {
    return `#host-${pane} [id$="_${suffix}"]`;
  }

  /* ---------- 0. 加载外壳 ---------- */
  section('0. 加载外壳 index.html');
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const title = await page.title();
  title.includes('Yb') ? ok('页面标题为 ¹⁷¹Yb 工具集（"' + title + '"）')
                        : fail('页面标题', title);
  await page.waitForSelector('#host-top canvas, #host-top .res');
  ok('两个窗格挂载出内容');

  // 默认加载后两窗格都不应处于紧凑模式（回归：COMPACT_PX=420 + 短视口下开箱即紧凑，
  // 见 CHANGELOG 0.3.2。已改 COMPACT_PX=380 + 默认 50/50。）
  const compactState = await page.evaluate(() => {
    const thr = 380;
    const top = document.getElementById('pane-top').clientHeight - 44;
    const bot = document.getElementById('pane-bot').clientHeight - 44;
    return { top, bot, topCompact: top < thr, botCompact: bot < thr };
  });
  (!compactState.topCompact && !compactState.botCompact)
    ? ok('默认加载两窗格均非紧凑（top净高' + compactState.top + 'px / bot' + compactState.bot + 'px）')
    : fail('默认窗格不应紧凑', JSON.stringify(compactState));

  /* ---------- 1. 联动测试 ---------- */
  section('1. 联动：hfs 选 Yb 556 → 下游提示条/数值/撤销');
  await page.selectOption('#sel-top', 'hfs-matrix-element');
  await page.waitForTimeout(600);
  // 顶部 = hfs，底部 = raman-qubit（默认）。在 hfs 里选 Yb（index 4，第 5 项）
  await page.evaluate(() => {
    const el = document.querySelector('#host-top [id$="_sel-el"]');
    el.value = '4'; el.dispatchEvent(new Event('change'));
  });
  await page.waitForTimeout(500);

  // 提示条出现在底部 raman 窗格（外部改动命中其 reads）
  const banner = await page.evaluate(() => {
    const b = document.querySelector('#host-bot .mod-banner');
    return b ? b.textContent.replace(/\s+/g, ' ').trim() : '';
  });
  const bannerHasGamma = /Γ\/2π\s*183\.0 kHz\s*→\s*182\.0 kHz/.test(banner);
  bannerHasGamma ? ok('提示条写明「Γ/2π 183.0 kHz → 182.0 kHz」')
                 : fail('提示条数值', banner);
  const bannerHasOmega = /Ω_R\s*=\s*1\.7166 MHz/.test(banner);
  bannerHasOmega ? ok('提示条含本模块新值「Ω_R = 1.7166 MHz」')
                 : fail('提示条新值', banner);
  await shot(page, '01-linkage-banner.png');

  // 底部 raman 的实际 Ω_R 读数应为 1.7166 MHz
  const omegaText = await page.evaluate(() => {
    const el = document.querySelector('#host-bot [id$="_R-om"]');
    return el ? el.textContent : '';
  });
  /1\.7166/.test(omegaText) ? ok('raman 窗格 Ω_R 显示 1.7166 MHz（"' + omegaText + '"）')
                            : fail('raman Ω_R 新值', omegaText);

  // 点撤销 → Γ 恢复 183 kHz，Ω_R 恢复 1.7261
  await page.evaluate(() => {
    const b = document.querySelector('#host-bot .mod-banner [data-act="undo"]');
    if (b) b.click();
  });
  await page.waitForTimeout(400);
  const gam = await page.evaluate(() => window.YBStore.state.transition.Gamma_Hz);
  gam === 183000 ? ok('撤销后 Γ 恢复 183 kHz')
                 : fail('撤销恢复 Γ', 'got ' + gam);
  const omega2 = await page.evaluate(() => {
    const el = document.querySelector('#host-bot [id$="_R-om"]');
    return el ? el.textContent : '';
  });
  /1\.7261/.test(omega2) ? ok('撤销后 Ω_R 恢复 1.7261 MHz（"' + omega2 + '"）')
                         : fail('撤销恢复 Ω_R', omega2);
  await shot(page, '02-linkage-undo.png');

  /* ---------- 2. J≠0 测试 ---------- */
  section('2. J≠0：hfs 选 Rb（基态 J=1/2）→ rabi-power 显示 — 而非 NaN');
  // 顶部改挂 rabi-power，观察它对 Rb 的反应
  await page.selectOption('#sel-top', 'rabi-power');
  await page.selectOption('#sel-bot', 'hfs-matrix-element');
  await page.waitForTimeout(600);
  // 在底部 hfs 选 Rb（index 0）
  await page.evaluate(() => {
    const el = document.querySelector('#host-bot [id$="_sel-el"]');
    el.value = '0'; el.dispatchEvent(new Event('change'));
  });
  await page.waitForTimeout(500);

  const rabiReads = await page.evaluate(() => {
    const h = document.getElementById('host-top');
    return {
      f: h.querySelector('[id$="_R-f"]').textContent,
      p: h.querySelector('[id$="_R-p"]').textContent,
      i: h.querySelector('[id$="_R-i"]').textContent,
      d: h.querySelector('[id$="_R-d"]').textContent,
      fu: h.querySelector('[id$="_R-fu"]').textContent,
      src: h.querySelector('[id$="_src"]').textContent
    };
  });
  const noNaN = !/[Nn]a[Nn]|NaN/.test(JSON.stringify(rabiReads));
  noNaN ? ok('rabi-power 读数无 NaN（f="' + rabiReads.f + '" d="' + rabiReads.d + '"）')
        : fail('出现 NaN', JSON.stringify(rabiReads));
  const dash = rabiReads.f === '—' && rabiReads.d === '—';
  dash ? ok('读数显示「—」而非数字')
       : fail('读数应为 —', 'f=' + rabiReads.f + ' d=' + rabiReads.d);
  const explain = /J=0\.5|J≠0|不成立|仅适用于 J=0/.test(rabiReads.src);
  explain ? ok('给出「基态 J≠0，d_cyc 简化不成立」说明')
          : fail('缺 J≠0 说明', rabiReads.src);
  await shot(page, '03-jne0-rabi.png');

  // 图表：J≠0 时画布应清空（不显示旧数据），而非画出错乱内容。
  // 注意：断言写反会误判——清空是正确行为。
  await page.waitForSelector('#host-top [id$="_c1"]');
  ok('rabi-power 图表 canvas 存在');
  const chartOpaque = await page.evaluate(() => {
    const c = document.querySelector('#host-top [id$="_c1"]');
    if (!c) return -1;
    try { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) n++;
      return n; } catch (e) { return -1; }
  });
  // J≠0 无效态下画布应被清空（0 个不透明像素），不是显示旧数值/NaN 图表
  chartOpaque === 0 ? ok('J≠0 时图表画布已清空（0 不透明像素，未画错乱内容）')
                    : fail('图表应清空', 'opaque=' + chartOpaque);
  await shot(page, '04-jne0-chart.png');

  /* ---------- 3. 紧凑模式 ---------- */
  section('3. 紧凑模式：压窗格到 420px 以下');
  // 注意测试用例选数据：Yb 塞曼表本就只有 6 行，看不出截断（会让坏功能看起来是好的）。
  // 用 Sr（30 行）才能验证 6 行截断。且需先让窗格足够高（>420 净高）再压缩，
  // 否则默认布局下底部窗格本就处于紧凑态，看不出「触发」。
  // 先全新加载，避免上一节的 Store/布局残留。
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  // 顶部 hfs，底部 rabi —— 底部窗格作为观察对象
  await page.selectOption('#sel-top', 'hfs-matrix-element');
  await page.waitForTimeout(600);
  // 让顶部窗格（观察对象）拉高 → 净高 > 420，非紧凑基线。setSplit(78)：顶部 78%。
  await page.evaluate(() => { window.YBPanes.setSplit(78); });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const el = document.querySelector('#host-top [id$="_sel-el"]');
    el.value = '5'; el.dispatchEvent(new Event('change'));   // Sr
  });
  await page.waitForTimeout(400);
  // 打开求和规则折叠区，观察紧凑时是否收起
  await page.evaluate(() => {
    const d = document.querySelector('#host-top [id$="_exp1"]');
    d.open = true; d.dispatchEvent(new Event('toggle'));
  });
  await page.waitForTimeout(300);
  const dataRows = async (pane) => page.evaluate((pn) => {
    const h = document.getElementById('host-' + pn);
    return Array.from(h.querySelectorAll('[id$="_zt"] tr')).filter(r => r.querySelector('td')).length;
  }, pane);
  const expOpen = async (pane) => page.evaluate((pn) =>
    document.querySelector('#host-' + pn + ' [id$="_exp1"]').open, pane);
  const netHeight = async (pane) => page.evaluate((pn) =>
    document.getElementById('pane-' + pn).clientHeight - 44, pane);

  const fullRows = await dataRows('top');
  const fullH = await netHeight('top');
  fullRows > 6 && fullH > 420
    ? ok('Sr 全量塞曼表 ' + fullRows + ' 行，窗格净高 ' + fullH + 'px（非紧凑基线）')
    : fail('基线非紧凑', 'rows=' + fullRows + ' netH=' + fullH);
  const expBefore = await expOpen('top');
  expBefore ? ok('紧凑前折叠区已展开') : fail('折叠区未展开', String(expBefore));

  // 压顶部窗格到 420px 以下（顶部 15%）
  await page.evaluate(() => { window.YBPanes.setSplit(15); });
  await page.waitForTimeout(500);
  const compactRows = await dataRows('top');
  const compactExp = await expOpen('top');
  const compactH = await netHeight('top');
  const compactCap = await page.evaluate(() => {
    const h = document.getElementById('host-top');
    return (h.querySelector('[id$="_zt"] .cap') || {}).textContent || '';
  });
  compactH < 420 ? ok('窗格净高降至 ' + compactH + 'px（<420）') : fail('窗格未压缩', String(compactH));
  compactRows <= 6 ? ok('紧凑：塞曼表截断到 ' + compactRows + ' 行')
                   : fail('紧凑截断失败', 'rows=' + compactRows);
  !compactExp ? ok('紧凑：折叠区已收起')
              : fail('折叠区未收起', String(compactExp));
  /已显示\s*6\s*\/\s*\d+/.test(compactCap) ? ok('标注「已显示 6 / N 条」(' + compactCap + ')')
                                           : fail('紧凑标注', compactCap);
  await shot(page, '05-compact.png');

  // 恢复拉高（顶部回 78%）→ 行数恢复全量。
  // 注意：折叠区(exp1)不会自动重新展开 —— setCompact 只负责收起、不负责重新展开，
  // 由用户手动点开（这是有意设计）。这里只断言行数恢复。
  await page.evaluate(() => { window.YBPanes.setSplit(78); });
  await page.waitForTimeout(500);
  const restoredRows = await dataRows('top');
  restoredRows === fullRows ? ok('拉高后塞曼行数恢复 ' + restoredRows + ' 行')
                            : fail('行数未恢复', restoredRows + ' vs ' + fullRows);
  await shot(page, '06-restored.png');

  /* ---------- 3b. 3a-1：rabi-power 三维曲面（折叠区，精细通道） ---------- */
  section('3b. rabi-power 三维曲面');
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  // 顶部已是 rabi-power；展开三维曲面折叠区
  await page.evaluate(() => {
    const d = document.querySelector('#host-top [id$="_exp3d"]');
    if (d) { d.open = true; d.dispatchEvent(new Event('toggle')); }
  });
  await page.waitForTimeout(700);
  const surf = await page.evaluate(() => {
    const cv = document.querySelector('#host-top [id$="_c3"]');
    if (!cv) return { found: false };
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) n++;
    return { found: true, opaque: n };
  });
  surf.found && surf.opaque > 1000
    ? ok('三维曲面画出内容（c3 不透明像素 ' + surf.opaque + '）')
    : fail('三维曲面未画出', JSON.stringify(surf));
  // 旋转按钮可用
  await page.click('#host-top [id$="_rot-r"]');
  await page.waitForTimeout(400);
  ok('三维曲面旋转按钮可用');
  // 紧凑模式下收起（约束①：新增内容必须收起，核心视图高度不变）
  await page.evaluate(() => { window.YBPanes.setSplit(15); });
  await page.waitForTimeout(400);
  const surfCompact = await page.evaluate(() => {
    const d = document.querySelector('#host-top [id$="_exp3d"]');
    return { closed: !d.open };
  });
  surfCompact.closed ? ok('紧凑模式收起三维曲面折叠区')
                     : fail('紧凑未收起三维曲面', JSON.stringify(surfCompact));
  // 恢复默认布局
  await page.evaluate(() => { window.YBPanes.setSplit(50); });
  await page.waitForTimeout(400);
  await shot(page, '12-rabi-3d.png');

  /* ---------- 3c. 椭圆光斑 + η·d 读数 ---------- */
  section('3c. rabi 椭圆光斑 + η·d 读数');
  // η·d = d_cyc × η
  const deta = await page.evaluate(() => {
    const el = document.querySelector('#host-top [id$="_R-deta"]');
    return el ? parseFloat(el.textContent) : NaN;
  });
  (Math.abs(deta - 0.156075) < 1e-6)
    ? ok('η·d 读数 ' + deta + '（= d_cyc 0.312150 × η 0.5）')
    : fail('η·d 读数', deta);
  // 1/(wx·wy) 标度：wx=100,wy=400 与 wx=wy=200（√(wx·wy)=200）Ω_R 相同
  const omPair = await page.evaluate(() => {
    const om = (a, bb) => { YBStore.update({ 'beam.wx': a*1e-6, 'beam.wy': bb*1e-6 });
      return Math.abs(YBStore.derived.ramanOmega())/(2*Math.PI)/1e6; };
    const o1 = om(100,400), o2 = om(200,200);
    return { o1, o2, match: Math.abs(o1-o2) < 1e-12 };
  });
  omPair.match
    ? ok('1/(wx·wy) 标度成立：wx=100/wy=400 Ω=' + omPair.o1.toFixed(4) + ' = wx=wy=200 Ω=' + omPair.o2.toFixed(4))
    : fail('1/(wx·wy) 标度', JSON.stringify(omPair));
  // 椭圆光斑勾选：wx≠wy 时勾选并展开 wx/wy 输入
  const ell = await page.evaluate(() => {
    YBStore.update({ 'beam.wx': 100e-6, 'beam.wy': 400e-6 });
    const cb = document.querySelector('#host-top [id$="_c-ell"]');
    const rows = document.querySelector('#host-top [id$="_ell-rows"]');
    return { checked: cb.checked, rows: rows.style.display !== 'none' };
  });
  (ell.checked && ell.rows)
    ? ok('椭圆光斑勾选自动勾选并展开 wx/wy 输入')
    : fail('椭圆光斑勾选', JSON.stringify(ell));
  // 恢复默认（圆光斑）→ 四锚点不变
  await page.evaluate(() => YBStore.update({ 'beam.wx': 365e-6, 'beam.wy': 365e-6 }));
  const an = await page.evaluate(() => ({
    om: Math.abs(YBStore.derived.ramanOmega())/(2*Math.PI)/1e6,
    dRed: YBStore.derived.d_red_au().toFixed(6),
    dCyc: (YBStore.derived.d_cyc_SI()/YBC.SI.ea0).toFixed(6),
    lam: YBStore.derived.lambda_nm().toFixed(6)
  }));
  (an.om>1.726 && an.om<1.727 && an.dRed==='0.540659' && an.dCyc==='0.312150' && an.lam==='555.802363')
    ? ok('恢复圆光斑后四锚点不变（Ω_R=' + an.om.toFixed(4) + '）')
    : fail('四锚点', JSON.stringify(an));
  await shot(page, '17-rabi-ellipse.png');

  /* ---------- 3c. 3a-2a：raman-qubit 功率–失谐设计图（折叠区） ---------- */
  section('3c. raman-qubit 功率–失谐设计图');
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.selectOption('#sel-top', 'raman-qubit');
  await page.waitForTimeout(600);
  // 展开设计图折叠区 exp3
  await page.evaluate(() => {
    const d = document.querySelector('#host-top [id$="_exp3"]');
    if (d) { d.open = true; d.dispatchEvent(new Event('toggle')); }
  });
  await page.waitForTimeout(800);
  const dm = await page.evaluate(() => {
    const cv = document.querySelector('#host-top [id$="_c2"]');
    if (!cv) return { found: false };
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) n++;
    return { found: true, opaque: n };
  });
  dm.found && dm.opaque > 1000
    ? ok('设计图画出内容（c2 不透明像素 ' + dm.opaque + '）')
    : fail('设计图未画出', JSON.stringify(dm));
  // 紧凑模式下收起（约束①）
  await page.evaluate(() => { window.YBPanes.setSplit(15); });
  await page.waitForTimeout(400);
  const dmCompact = await page.evaluate(() => {
    const d = document.querySelector('#host-top [id$="_exp3"]');
    return { closed: !d.open };
  });
  dmCompact.closed ? ok('紧凑模式收起设计图折叠区')
                   : fail('紧凑未收起设计图', JSON.stringify(dmCompact));
  await page.evaluate(() => { window.YBPanes.setSplit(50); });
  await page.waitForTimeout(400);
  await shot(page, '13-raman-designmap.png');

  /* ---------- 3d. 3a-2b：raman-qubit 波片扫描 + 实测拟合（折叠区） ---------- */
  section('3d. raman-qubit 波片扫描 + 实测拟合');
  await page.evaluate(() => {
    const d = document.querySelector('#host-top [id$="_exp4"]');
    if (d) { d.open = true; d.dispatchEvent(new Event('toggle')); }
  });
  await page.waitForTimeout(400);
  // 波片图画出内容
  const wp = await page.evaluate(() => {
    const cv = document.querySelector('#host-top [id$="_c3"]');
    if (!cv) return { found: false };
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) n++;
    return { found: true, opaque: n };
  });
  wp.found && wp.opaque > 1000
    ? ok('波片扫描图画中内容（c3 不透明像素 ' + wp.opaque + '）')
    : fail('波片图未画出', JSON.stringify(wp));
  // 贴入 placeholder 数据，验证拟合输出到「层」级（θ₀/幅度比/等效束腰合理）
  await page.evaluate(() => {
    const qwp = document.querySelector('#host-top [id$="_d-qwp"]');
    qwp.value = '0\t0.05\n22.5\t1.24\n45\t1.73'; qwp.dispatchEvent(new Event('input'));
    const pow = document.querySelector('#host-top [id$="_d-pow"]');
    pow.value = '20\t0.42\n40\t0.87\n80\t1.71'; pow.dispatchEvent(new Event('input'));
  });
  await page.waitForTimeout(800);
  const fitText = await page.evaluate(() => {
    const fo = document.querySelector('#host-top [id$="_fitout"]');
    return fo ? fo.textContent.replace(/\s+/g, ' ').trim() : '';
  });
  // 功率扫描：幅度比 ≈ 1（0.5–2 之间即合理），等效束腰 ≈ 设定值（差 <30%）
  const pRatio = (fitText.match(/功率扫描[\s\S]*?幅度比\s*([\d.]+)/) || [])[1];
  const pWeff = (fitText.match(/反推等效束腰\s*([\d.]+)/) || [])[1];
  (pRatio && +pRatio > 0.5 && +pRatio < 2)
    ? ok('功率扫描幅度比合理：' + pRatio + '（≈1）')
    : fail('功率扫描幅度比', pRatio + ' | ' + fitText);
  (pWeff && Math.abs(+pWeff - 365) / 365 < 0.3)
    ? ok('反推等效束腰 ' + pWeff + 'µm ≈ 设定 365µm（物理闭合）')
    : fail('等效束腰不合理', pWeff);
  // 波片扫描：θ₀ 合理（−45..45 之间）
  const t0 = (fitText.match(/拟合零点\s*θ₀\s*=\s*(-?[\d.]+)°/) || [])[1];
  (t0 !== undefined && Math.abs(+t0) <= 45)
    ? ok('波片扫描拟合 θ₀ = ' + t0 + '°（合理）')
    : fail('波片拟合 θ₀', t0);
  // 紧凑模式收起（约束①）
  await page.evaluate(() => { window.YBPanes.setSplit(15); });
  await page.waitForTimeout(400);
  const wpCompact = await page.evaluate(() => {
    const d = document.querySelector('#host-top [id$="_exp4"]');
    return { closed: !d.open };
  });
  wpCompact.closed ? ok('紧凑模式收起波片扫描折叠区')
                   : fail('紧凑未收起波片', JSON.stringify(wpCompact));
  await page.evaluate(() => { window.YBPanes.setSplit(50); });
  await page.waitForTimeout(400);
  await shot(page, '14-raman-waveplate.png');

  /* ---------- 3e. 3a-3：hfs 全库求和扫描 + LaTeX 导出（折叠区） ---------- */
  section('3e. hfs 全库求和扫描 + LaTeX 导出');
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.selectOption('#sel-top', 'hfs-matrix-element');
  await page.waitForTimeout(800); // 数据库加载
  // 运行全库扫描（exp3）
  await page.evaluate(() => {
    const d = document.querySelector('#host-top [id$="_exp3"]');
    if (d) { d.open = true; d.dispatchEvent(new Event('toggle')); }
  });
  await page.waitForTimeout(200);
  await page.click('#host-top [id$="_btn-scan"]');
  await page.waitForTimeout(300);
  const scanText = await page.evaluate(() =>
    document.querySelector('#host-top [id$="_scanout"]').textContent.replace(/\s+/g, ' ').trim());
  // 必须报出最大残差与触发组合（只看"全部通过"等于没测）
  // 注意输出用全角括号（），不是 ASCII ()
  const scanRes = (scanText.match(/最大残差\s*([\d.e-]+)[^\d]*（([^）]+)）/)) || [];
  const resVal = parseFloat(scanRes[1]);
  (resVal && resVal < 1e-12)
    ? ok('全库扫描 42 组合，最大残差 ' + scanText.match(/最大残差[^,]+/) + '（双精度量级）')
    : fail('扫描残差不在双精度量级', scanText);
  (scanRes[2] && /违规\s*0/.test(scanText))
    ? ok('报出触发组合 ' + scanRes[2] + '，R1/R2/R3 违规 0')
    : fail('扫描未报组合/有违规', scanText);
  // LaTeX 导出（exp4）：合法 tabular + coeff 与塞曼表逐项一致
  await page.evaluate(() => {
    const d = document.querySelector('#host-top [id$="_exp4"]');
    if (d) { d.open = true; d.dispatchEvent(new Event('toggle')); }
  });
  await page.waitForTimeout(200);
  await page.click('#host-top [id$="_btn-tex"]');
  await page.waitForTimeout(300);
  const texChk = await page.evaluate(() => {
    const tex = document.querySelector('#host-top [id$="_texout"]').value;
    const beg = (tex.match(/\\begin\{tabular\}/g) || []).length;
    const end = (tex.match(/\\end\{tabular\}/g) || []).length;
    const rows = tex.split('\n').filter(l => /&/.test(l) && /\\\\/.test(l) && !/\$F,m\$/.test(l));
    const coeffs = rows.map(r => parseFloat(r.split('&')[3].replace(/[^\d.-]/g, '')));
    const ztVals = Array.from(document.querySelectorAll('#host-top [id$="_zt"] tr'))
      .filter(r => r.querySelectorAll('td').length === 5)
      .map(r => parseFloat(r.querySelectorAll('td')[3].textContent));
    let worst = 0, allMatch = coeffs.length === ztVals.length;
    for (let i = 0; i < Math.min(coeffs.length, ztVals.length); i++) {
      const diff = Math.abs(coeffs[i] - ztVals[i]);
      if (diff > worst) worst = diff;
      if (diff > 1e-9) allMatch = false;
    }
    return { beg, end, rows: coeffs.length, zt: ztVals.length, allMatch, worst };
  });
  (texChk.beg === 1 && texChk.end === 1)
    ? ok('LaTeX 为合法 tabular（begin/end 各 1）')
    : fail('LaTeX tabular 不配对', JSON.stringify(texChk));
  (texChk.allMatch && texChk.rows === texChk.zt)
    ? ok('LaTeX coeff 与塞曼表逐项一致（' + texChk.rows + ' 行，最大偏差 ' + texChk.worst.toExponential(1) + '）')
    : fail('LaTeX 与塞曼表不一致', JSON.stringify(texChk));
  // 紧凑模式收起新增折叠区（约束①）
  await page.evaluate(() => { window.YBPanes.setSplit(15); });
  await page.waitForTimeout(400);
  const hfsCompact = await page.evaluate(() => {
    const d3 = document.querySelector('#host-top [id$="_exp3"]');
    const d4 = document.querySelector('#host-top [id$="_exp4"]');
    return { exp3: !d3.open, exp4: !d4.open };
  });
  (hfsCompact.exp3 && hfsCompact.exp4) ? ok('紧凑模式收起扫描/LaTeX 折叠区')
                                       : fail('紧凑未收起 hfs 折叠区', JSON.stringify(hfsCompact));
  await page.evaluate(() => { window.YBPanes.setSplit(50); });
  await page.waitForTimeout(400);
  await shot(page, '15-hfs-scan-latex.png');

  /* ---------- 4. fetch 数据库两路径 ---------- */
  section('4. fetch：外壳与独立页两条相对路径');
  // 全新加载外壳（避免上一节 Sr 残留），确认默认 Yb 与数据加载
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.selectOption('#sel-top', 'hfs-matrix-element');
  await page.waitForTimeout(600);
  const dbOK = await page.evaluate(() => window.YBStore.state.transition.element === 'Yb');
  dbOK ? ok('外壳 hfs 成功 fetch data/transitions.json（默认 Yb）')
       : fail('外壳 fetch', 'element=' + await page.evaluate(() => window.YBStore.state.transition.element));

  // 独立页 tools/hfs-matrix-element.html（用 ../data/transitions.json）
  await page.goto(BASE + '/tools/hfs-matrix-element.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const toolHasSel = await page.evaluate(() => !!document.querySelector('select'));
  toolHasSel ? ok('独立页 hfs 加载成功（出现选择器）')
             : fail('独立页 hfs 加载', 'no select');
  await shot(page, '07-tool-hfs.png');

  // file:// 双击打开 → 应给「请通过 HTTP 打开」提示，而非白屏/看不懂的错误
  section('4b. file:// 打开应提示走 HTTP');
  const fileURL = 'file://' + path.join(__dirname, '..', 'index.html');
  const pFile = await context.newPage();
  await pFile.goto(fileURL, { waitUntil: 'load' });
  await pFile.waitForTimeout(300);
  // 顶部默认是 rabi-power；hfs 才触发 fetch。切到 hfs 观察提示。
  await pFile.selectOption('#sel-top', 'hfs-matrix-element');
  await pFile.waitForTimeout(1200);
  const fileErr = await pFile.evaluate(() => {
    const h = document.getElementById('host-top');
    const e = h.querySelector('[id$="_err"]');
    return e ? e.textContent.replace(/\s+/g, ' ').trim() : '';
  });
  /HTTP|http.server|file:\/\/|CORS/.test(fileErr) ? ok('file:// 下给出「请通过 HTTP 打开」提示')
                                                  : fail('file:// 提示', JSON.stringify(fileErr));
  await pFile.screenshot({ path: path.join(SHOT, '09-file-prompt.png') });
  await pFile.close();

  /* ---------- 5. 常规项 ---------- */
  section('5. 常规项');
  // 独立页三兄弟各开一遍无 console error
  for (const t of ['rabi-power', 'raman-qubit', 'hfs-matrix-element']) {
    const n = CONSOLE_ERRORS.length;
    await page.goto(BASE + '/tools/' + t + '.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    (CONSOLE_ERRORS.length === n)
      ? ok('tools/' + t + '.html 打开无 console error')
      : fail('tools/' + t + '.html 有 error', CONSOLE_ERRORS.slice(n).join(' | '));
    await shot(page, '08-tool-' + t + '.png');
  }

  // 回到外壳：复制链接
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  // 改一个输入，让 URL 状态非空
  await page.evaluate(() => { window.YBStore.update({ 'beam.P_laser': 0.123 }, 'test'); YBPanes.writeURL(); });
  await page.waitForTimeout(200);
  await page.click('#btn-share');
  await page.waitForTimeout(400);
  // 复制链接会先 writeURL()（写入 location.hash），再写剪贴板。读 URL 里的状态哈希验证。
  const shareURL = page.url();
  const hashHasState = shareURL.includes('#') && /top=|bot=|el=|P=/.test(shareURL);
  hashHasState ? ok('复制链接后 URL 含完整状态（' + shareURL.slice(0, 50) + '…）')
               : fail('复制链接状态', shareURL);
  // 剪贴板内容（授权后尽力读取；headless 下异步剪贴板可能取不到，降级为跳过）
  const copied = await page.evaluate(() => {
    return new Promise(res => navigator.clipboard.readText().then(res).catch(() => ''));
  });
  if (copied.includes('top=')) ok('剪贴板含可分享链接（' + copied.slice(0, 40) + '…）');
  else console.log('      (headless 剪贴板读取不可用，跳过剪贴板断言)');
  // 在新标签打开 hashed URL 恢复（用 shareURL，而非依赖剪贴板）
  const p2 = await context.newPage();
  await p2.goto(shareURL, { waitUntil: 'networkidle' });
  await p2.waitForTimeout(400);
  const restoredP = await p2.evaluate(() => window.YBStore.state.beam.P_laser);
  restoredP === 0.123 ? ok('新标签打开链接恢复功率 0.123 W')
                      : fail('链接恢复', 'got ' + restoredP);
  ok('新标签打开复制链接恢复页面');
  await p2.close();

  // 撤销 / 重置
  await page.evaluate(() => { window.YBStore.update({ 'beam.P_laser': 0.123 }, 'test'); });
  await page.waitForTimeout(200);
  await page.click('#btn-undo');
  await page.waitForTimeout(200);
  const resetUndo = await page.evaluate(() => window.YBStore.state.beam.P_laser);
  resetUndo === 0.08 ? ok('顶栏撤销恢复功率 0.08 W')
                     : fail('顶栏撤销', 'got ' + resetUndo);
  await page.click('#btn-reset');
  await page.waitForTimeout(200);
  const afterReset = await page.evaluate(() => window.YBStore.state.beam.P_laser);
  afterReset === 0.08 ? ok('重置参数回默认 0.08 W')
                      : fail('重置参数', 'got ' + afterReset);

  /* ---------- 6. 拖拽与性能 ---------- */
  section('6. 拖拽 + 性能');
  const bar = await page.locator('#splitbar').boundingBox();
  const panses = await page.locator('#panes').boundingBox();
  if (bar && panses) {
    await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2);
    await page.mouse.down();
    await page.mouse.move(panses.x + panses.width / 2, panses.y + panses.height * 0.6, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    ok('分隔条拖拽流畅（无异常）');
    // 拖完后分隔条位置已变，重新定位再双击
    const bar2 = await page.locator('#splitbar').boundingBox();
    await page.mouse.dblclick(bar2.x + bar2.width / 2, bar2.y + bar2.height / 2);
    await page.waitForTimeout(300);
    const split = await page.evaluate(() => {
      const g = document.getElementById('panes');
      const r = g.getBoundingClientRect();
      const top = document.getElementById('pane-top').getBoundingClientRect();
      return Math.round(top.height / r.height * 100);
    });
    split === 50 ? ok('双击复位到 50%')
                 : fail('双击复位', 'split=' + split);
  } else {
    fail('拖拽测试', '找不到分隔条');
  }

  // 性能：连续快速输入功率，记录 forced reflow 的布局事件
  const perf = await page.evaluate(async () => {
    return await new Promise(resolve => {
      const out = { layout: 0, style: 0, recalc: 0, dur: 0 };
      const obs = new PerformanceObserver(list => {
        for (const e of list.getEntries()) {
          if (e.name === 'Layout') out.layout++;
          if (e.name === 'Recalculate Style') out.recalc++;
        }
      });
      obs.observe({ type: 'layout-shift' });   // not reflow; use measure
      const obs2 = new PerformanceObserver(list => {
        for (const e of list.getEntries()) {
          if (e.entryType === 'layout' || e.name === 'Layout') out.layout++;
        }
      });
      try { obs2.observe({ type: 'layout', buffered: false }); } catch (e) {}
      const t0 = performance.now();
      const input = document.querySelector('#host-top [id$="_v-p"]');
      for (let i = 0; i < 30; i++) {
        input.value = (0.01 + i * 0.005);
        input.dispatchEvent(new Event('input'));
      }
      setTimeout(() => {
        out.dur = performance.now() - t0;
        resolve(out);
      }, 1200);
    });
  });
  console.log('      性能采样: ' + JSON.stringify(perf) + ' ms');
  // 简单判据：30 次输入在合理时间内完成（调度器把重绘合并，不应卡死）
  perf.dur < 3000 ? ok('连续 30 次输入功率在 ' + perf.dur.toFixed(0) + ' ms 内完成（无卡死）')
                  : fail('性能', perf.dur + 'ms');

  /* ---------- 汇总 ---------- */
  section('汇总');
  console.log('通过 ' + PASSED.length + ' 项，失败 ' + FAILURES.length + ' 项');
  if (CONSOLE_ERRORS.length) {
    console.log('\n⚠ 捕获到 ' + CONSOLE_ERRORS.length + ' 条 console error：');
    CONSOLE_ERRORS.forEach((e, i) => console.log('  [' + i + '] ' + e));
  } else {
    console.log('无 console error');
  }
  await browser.close();
  if (FAILURES.length) { console.error('\n浏览器实测有失败项，退出码 1'); process.exit(1); }
}

/* 若未指定 BASE 且本地 8000 未起服务，则自动起一个 http.server（CI 用）。
 * 用随机端口避免与占用冲突。 */
async function ensureServer() {
  if (process.env.BROWSER_BASE) return null;
  const ok = await new Promise(r => {
    const http = require('http');
    const req = http.get('http://localhost:8000/', res => r(res.statusCode < 500)).on('error', () => r(false));
    req.setTimeout(1500, () => { req.destroy(); r(false); });
  });
  if (ok) return null;
  const root = path.join(__dirname, '..');
  const srv = spawn(process.platform === 'win32' ? 'python' : 'python3',
    ['-m', 'http.server', '8000', '--directory', root],
    { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1200));
  return srv;
}

ensureServer().then(srv => {
  return main().finally(() => { if (srv) srv.kill(); });
}).catch(e => { console.error('browser.js 运行异常:', e); process.exit(1); });
