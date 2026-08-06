/* modules/hfs-matrix-element.js — 超精细跃迁矩阵元
 *
 * 本模块是 Store 中 transition 的上游：选定元素/同位素/跃迁后写入 Store，
 * 其余模块自动跟随。因此它对 Γ 的改动会直接影响下游数值 —— 提示条必须报出具体变化。
 *
 * 核心视图：跃迁选择 + 约化矩阵元 + 塞曼分量表（前若干行）
 * 折叠区：  完整分量表 / 求和规则检验 / 数据出处
 *
 * 纪律：数据库不存任何文献 d 值，d 一律由 Γ 反解（见 README 规则 ⓪）。
 */
(function () {
  'use strict';

  var W = window.YBW, S = window.YBStore, U = window.YBU, C = window.YBC;
  var DB = null, loadErr = null;

  /* 数据库延迟加载：fetch 在 file:// 下会被 CORS 挡掉，需要明确提示。
   * 模块挂载在 index.html（根）或 tools/*.html（子目录）都能用，按页面位置
   * 选对相对路径，避免先 404 再回退产生的无谓 console error。 */
  function dbPath() {
    return /\/tools\//.test(window.location.pathname)
      ? '../data/transitions.json' : 'data/transitions.json';
  }
  function loadDB() {
    if (DB) return Promise.resolve(DB);
    var p1 = dbPath(), p2 = p1 === 'data/transitions.json'
      ? '../data/transitions.json' : 'data/transitions.json';
    return fetch(p1)
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) { DB = j.elements; return DB; })
      .catch(function (e) {
        return fetch(p2).then(function (r) { return r.json(); })
          .then(function (j) { DB = j.elements; return DB; })
          .catch(function () { loadErr = e; throw e; });
      });
  }

  window.YBM.register({
    id: 'hfs-matrix-element',
    title: '超精细矩阵元',
    subtitle: '⟨F′m′|d_q|Fm⟩  ·  Edmonds 约定',
    reads: ['transition.*'],
    writes: ['transition.*'],

    template: function (c) {
      var i = c.id;
      return '' +
      '<div class="res">' +
        '<div><p class="k">约化矩阵元 ⟨J′‖d‖J⟩</p><p class="v" id="' + i('R-d') + '">—</p>' +
          '<p class="u">e·a₀　由 Γ 反解</p></div>' +
        '<div><p class="k">真空波长 λ</p><p class="v" id="' + i('R-lam') + '">—</p>' +
          '<p class="u">nm　由 NIST 能级导出</p></div>' +
        '<div><p class="k">线宽 Γ/2π</p><p class="v" id="' + i('R-gam') + '">—</p>' +
          '<p class="u" id="' + i('R-gu') + '">—</p></div>' +
        '<div><p class="k">求和规则</p><p class="v" id="' + i('R-sr') + '">—</p>' +
          '<p class="u">Σ|CG|² 应为 1</p></div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="grid3">' +
          '<div><p class="lbl">元素</p><select id="' + i('sel-el') + '"></select></div>' +
          '<div><p class="lbl">跃迁</p><select id="' + i('sel-tr') + '"></select></div>' +
          '<div><p class="lbl">同位素</p><select id="' + i('sel-iso') + '"></select></div>' +
        '</div>' +
        '<div class="grid3" style="margin-top:12px">' +
          '<div><p class="lbl">F（基态）</p><select id="' + i('sel-F') + '"></select></div>' +
          '<div><p class="lbl">F′（激发态）</p><select id="' + i('sel-Fp') + '"></select></div>' +
          '<div><p class="lbl">Γ/2π 覆盖 (kHz)</p><input type="number" id="' + i('v-gam') + '" step="1"></div>' +
        '</div>' +
        '<p class="cap" id="' + i('src') + '"></p>' +
        '<div id="' + i('err') + '"></div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="chead"><span class="t">塞曼分量 ⟨F′m′|d_q|Fm⟩</span>' +
          '<span class="cap">单位 ⟨J′‖d‖J⟩</span>' +
          '<span class="tag" id="' + i('nz') + '" title="循环跃迁：该激发态子能级只有一条衰变通道，散射光子后必然回到原态。可反复散射，是荧光成像与态选择读出的物理基础。D1 线（J′=1/2）无伸展态，故无循环跃迁。">' +
            '<span id="' + i('nz-txt') + '">—</span></span>' +
        '</div>' +
        '<div id="' + i('zt') + '"></div>' +
        '<p class="cap" id="' + i('cyc-note') + '"></p>' +
      '</div>' +

      '<details class="adv" id="' + i('exp1') + '"><summary>超精细约化矩阵元与求和规则检验</summary>' +
        '<div style="margin-top:10px"><b style="font-size:13px">⟨F′‖d‖F⟩</b>' +
          '<div id="' + i('hyf') + '" style="margin-top:6px"></div></div>' +
        '<div id="' + i('sr') + '" style="margin-top:12px"></div>' +
        '<p class="cap">⟨F′‖d‖F⟩ 由 ⟨J′‖d‖J⟩ 经一个 6j 符号分解得到（电偶极算符只作用于电子，核自旋是旁观者）：' +
        'a.u. = 系数 × ⟨J′‖d‖J⟩，相对线强 = 系数²。下方求和规则：对 J=0 基态，每个激发态子能级的 ' +
        'CG 平方和恰为 1 —— 这正是 6j 因子被 d_cyc 定义吸收的依据。若此处不为 1，说明归一化约定有误。</p>' +
      '</details>' +

      '<details class="adv" id="' + i('exp2') + '"><summary>数据出处与约定</summary>' +
        '<div id="' + i('meta') + '" style="margin-top:10px"></div>' +
        '<p class="cap" style="margin-top:12px"><b>① 归一化陷阱：</b>' +
        'd_Edmonds = √(2J+1)·d_CG。J=0 基态时该因子恰为 1，所以 Yb 一直未暴露问题，' +
        '但碱金属（J=1/2）会差 √2。</p>' +
        '<p class="cap"><b>② Edmonds vs CG 约定：</b>两个约定相差 √(2J+1)。文献（如 Steck 数据表）' +
        '常用 CG 归一化，与本框架差一个因子。例：⁸⁷Rb D2 的 ⟨J′‖er‖J⟩，Steck 给 4.227 e·a₀，' +
        '本框架对应 √2×4.227 = 5.978 e·a₀ —— 直接抄 Steck 的数值会差 √2。</p>' +
        '<p class="cap"><b>③ 纪律：</b>数据库<b>不存任何文献 d 值</b>，一律由 Γ 反解，' +
        '保证与本框架约定自洽（见 README 规则 ⓪）。</p>' +
      '</details>' +

      '<details class="adv" id="' + i('exp5') + '"><summary>更新记录</summary>' +
        '<div id="' + i('chg') + '" style="margin-top:10px"></div>' +
      '</details>' +

      '<details class="adv" id="' + i('exp3') + '"><summary>全库 42 组合求和规则扫描</summary>' +
        '<div class="segs" style="margin:12px 0 0">' +
          '<button class="seg mini" id="' + i('btn-scan') + '">运行扫描</button>' +
          '<span style="flex:1"></span><span class="cap">R1/R2/R3 三组求和规则，覆盖全部元素×同位素×跃迁</span>' +
        '</div>' +
        '<div id="' + i('scanout') + '" class="selftest" style="margin-top:10px"></div>' +
      '</details>' +

      '<details class="adv" id="' + i('exp4') + '"><summary>导出：塞曼表 LaTeX / CSV / 全库 JSON</summary>' +
        '<div class="segs" style="margin:12px 0 0">' +
          '<button class="seg mini" id="' + i('btn-tex') + '">复制 LaTeX 表格</button>' +
          '<button class="seg mini" id="' + i('btn-csv') + '">下载 CSV</button>' +
          '<button class="seg mini" id="' + i('btn-json') + '">下载全库 JSON</button>' +
          '<span style="flex:1"></span><span class="cap" id="' + i('texnote') + '"></span>' +
        '</div>' +
        '<textarea id="' + i('texout') + '" rows="8" readonly style="margin-top:10px"></textarea>' +
        '<p class="cap">CSV / LaTeX 为当前塞曼分量表；JSON 为完整数据库，可作下一版数据源（数据与代码分离）。</p>' +
      '</details>';
    },

    init: function (c) {
      var $ = c.$, compact = false, cur = { el: null, tr: null, iso: null };

      function err(msg) {
        $('err').innerHTML = '<div class="note b" style="margin-top:10px">' + msg + '</div>';
      }

      loadDB().then(function () { buildSelectors(); syncFromStore(); render(); })
        .catch(function () {
          err('无法加载 <code>data/transitions.json</code>。本模块需要通过 HTTP 打开：' +
              '<br><code>python3 -m http.server 8000</code>，然后访问 ' +
              '<code>http://localhost:8000</code>。<br>' +
              '（<code>file://</code> 下浏览器会以 CORS 策略拦截 fetch。）');
        });

      function buildSelectors() {
        $('sel-el').innerHTML = DB.map(function (d, k) {
          return '<option value="' + k + '">' + d.el + '　' + d.name + '</option>'; }).join('');
        $('sel-el').onchange = function () { pickEl(+$('sel-el').value); };
        $('sel-tr').onchange = function () { pickTr(+$('sel-tr').value); };
        $('sel-iso').onchange = function () { pickIso(+$('sel-iso').value); };
        $('sel-F').onchange = $('sel-Fp').onchange = function () { pushStore(); render(); };
        $('v-gam').oninput = function () {
          var g = (parseFloat($('v-gam').value) || 0) * 1e3;
          if (g > 0) { c.set({ 'transition.Gamma_Hz': g }, { reason: '手动覆盖' }); render(); }
        };
      }

      /** 从 Store 的当前状态定位到数据库条目 */
      function syncFromStore() {
        var t = S.state.transition, ei = 0, ti = 0, ii = 0;
        DB.forEach(function (d, k) { if (d.el === t.element) ei = k; });
        var d = DB[ei];
        d.tr.forEach(function (x, k) { if (Math.abs((x.ek || 0) - t.Ek_cm) < 1e-6) ti = k; });
        d.iso.forEach(function (x, k) { if (x.a === t.A) ii = k; });
        $('sel-el').value = ei; fillTr(ei, ti); fillIso(ei, ii);
        cur = { el: ei, tr: ti, iso: ii };
        fillF();
      }
      function fillTr(ei, sel) {
        $('sel-tr').innerHTML = DB[ei].tr.map(function (x, k) {
          return '<option value="' + k + '">' + x.n + '</option>'; }).join('');
        $('sel-tr').value = sel || 0;
      }
      function fillIso(ei, sel) {
        $('sel-iso').innerHTML = DB[ei].iso.map(function (x, k) {
          return '<option value="' + k + '">' + DB[ei].el + '-' + x.a + '　I=' +
                 fmtHalf(x.I) + '　' + x.ab + '</option>'; }).join('');
        $('sel-iso').value = sel || 0;
      }
      function fillF() {
        var d = DB[cur.el], t = d.tr[cur.tr], iso = d.iso[cur.iso];
        var Fs = W.frange(d.J, iso.I), Fps = W.frange(t.Jp, iso.I);
        var st = S.state.transition;
        $('sel-F').innerHTML = Fs.map(function (f) {
          return '<option value="' + f + '">F = ' + fmtHalf(f) + '</option>'; }).join('');
        $('sel-Fp').innerHTML = Fps.map(function (f) {
          return '<option value="' + f + '">F′ = ' + fmtHalf(f) + '</option>'; }).join('');
        $('sel-F').value = Fs.indexOf(st.F) >= 0 ? st.F : Fs[0];
        $('sel-Fp').value = Fps.indexOf(st.Fp) >= 0 ? st.Fp : Fps[Fps.length - 1];
      }
      function pickEl(k) { cur.el = k; cur.tr = 0; cur.iso = 0;
        fillTr(k, 0); fillIso(k, 0); fillF(); pushStore(); render(); }
      function pickTr(k) { cur.tr = k; fillF(); pushStore(); render(); }
      function pickIso(k) { cur.iso = k; fillF(); pushStore(); render(); }

      /** 把选择写回 Store。这是本模块作为上游的关键动作。 */
      function pushStore() {
        var d = DB[cur.el], t = d.tr[cur.tr], iso = d.iso[cur.iso];
        var ek = t.ek || (t.lam ? 1e7 / t.lam : null);
        c.set({
          'transition.element': d.el,
          'transition.A': iso.a,
          'transition.I': iso.I,
          'transition.Ek_cm': ek,
          'transition.Jg': d.J,
          'transition.Jp': t.Jp,
          'transition.Gamma_Hz': t.gam,
          'transition.F': parseFloat($('sel-F').value),
          'transition.Fp': parseFloat($('sel-Fp').value),
          'transition.label': d.el + '-' + iso.a + '  ' + t.n.split('  ')[0],
          'transition.src': t.src || ''
        }, { reason: t.gu || '' });
      }

      function fmtHalf(x) {
        if (Math.abs(x - Math.round(x)) < 1e-9) return String(Math.round(x));
        return Math.round(2 * x) + '/2';
      }

      /* ---- 渲染 ---- */
      function render() {
        /* 就绪守卫：DB 由 loadDB() 异步填充，cur 由 syncFromStore() 在其后填写。
         * 两者就绪前（或 file:// 下 loadDB() reject 后）不得访问 DB[cur.el] ——
         * 否则 DB[null] 是 undefined，d.tr 直接抛异常。
         * 同步注册的 toggle 监听器会在这个时间窗内触发 render()。 */
        if (!DB || cur.el === null || cur.tr === null) return;
        var t = S.state.transition, D = S.derived;
        var d = DB[cur.el], tr = d.tr[cur.tr];
        $('R-d').textContent = D.d_red_au().toFixed(6);
        $('R-lam').textContent = D.lambda_nm().toFixed(6);
        $('R-gam').textContent = (t.Gamma_Hz / 1e3).toPrecision(5);
        $('R-gu').textContent = 'kHz　' + (tr.gu || '');
        $('v-gam').value = +(t.Gamma_Hz / 1e3).toPrecision(6);
        $('src').innerHTML = '基态 ' + (d.gcfg || '') + '　激发态 ' + (tr.ecfg || '') +
          '　J=' + fmtHalf(t.Jg) + ' → J′=' + fmtHalf(t.Jp) +
          '　出处：' + (tr.src || '—');

        /* 塞曼分量表 */
        var F = t.F, Fp = t.Fp, I = t.I, rows = [], sr = {}, chan = {};
        /* 通道数须在完整基态流形上统计（含全部 F），才能正确判循环跃迁 ——
         * 只数选中 F 会把 Rb 这类多 F 基态误判为循环。 */
        var allF = W.frange(t.Jg, I), allFp = W.frange(t.Jp, I);
        allF.forEach(function (f) {
          for (var mm = -f; mm <= f + 1e-9; mm++) {
            allFp.forEach(function (fp) {
              for (var qq = -1; qq <= 1; qq++) {
                var mpp = mm + qq;
                if (Math.abs(mpp) > fp + 1e-9) continue;
                if (Math.abs(W.zee(I, t.Jg, t.Jp, f, mm, fp, mpp, qq)) < 1e-12) continue;
                chan[fp + ':' + mpp] = (chan[fp + ':' + mpp] || 0) + 1;
              }
            });
          }
        });
        for (var m = -F; m <= F + 1e-9; m++) {
          for (var q = -1; q <= 1; q++) {
            var mp = m + q;
            if (Math.abs(mp) > Fp + 1e-9) continue;
            var v = W.zee(I, t.Jg, t.Jp, F, m, Fp, mp, q);
            if (Math.abs(v) < 1e-12) continue;
            rows.push({ m: m, mp: mp, q: q, v: v, cyc: false });
            sr[mp] = (sr[mp] || 0) + v * v;
          }
        }
        rows.forEach(function (r) { r.cyc = chan[Fp + ':' + r.mp] === 1; });
        /* 徽标报当前跃迁是否支持循环（在完整流形上统计伸展态子能级），
         * 而非只看选中的 F/F′ —— D1 线无伸展态恒为 0，D2/³P₁ 有伸展态。 */
        var nCycAll = 0;
        allFp.forEach(function (fp) {
          for (var mp2 = -fp; mp2 <= fp + 1e-9; mp2++)
            if (chan[fp + ':' + mp2] === 1) nCycAll++;
        });
        var lim = compact ? 6 : rows.length;
        var POL = { '-1': 'σ⁻', '0': 'π', '1': 'σ⁺' };
        var html = '<table><tr><th>m</th><th>偏振</th><th>m′</th>' +
          '<th style="text-align:right">数值</th><th style="text-align:right">精确值</th></tr>';
        rows.slice(0, lim).forEach(function (r) {
          html += '<tr><td class="n">' + fmtHalf(r.m) + '</td><td>' + POL[r.q] + '</td>' +
            '<td class="n">' + fmtHalf(r.mp) + (r.cyc ? ' <b style="color:var(--bad)" title="循环跃迁">◉</b>' : '') +
            '</td><td class="n">' + r.v.toFixed(6) +
            '</td><td class="n">' + W.pretty(r.v) + '</td></tr>';
        });
        html += '</table>';
        if (lim < rows.length) html += '<p class="cap">已显示 ' + lim + ' / ' + rows.length +
          ' 条（紧凑模式）。拉高窗格可看全部。</p>';
        $('zt').innerHTML = html;
        $('nz-txt').textContent = nCycAll + ' 个循环跃迁子能级';
        /* 循环跃迁说明 —— 徽标与说明放同一处（约束②） */
        $('cyc-note').textContent = nCycAll > 0
          ? '◉ 循环跃迁：该激发态子能级只有一条衰变通道，散射光子后必然回到原态，可反复散射 —— 荧光成像与态选择读出的物理基础。'
          : '无循环跃迁：本跃迁无伸展态（单通道）子能级。D1 线（J′=1/2）无伸展态，做不了循环荧光成像。';

        /* 求和规则 */
        var keys = Object.keys(sr), worst = 0;
        keys.forEach(function (k) { worst = Math.max(worst, Math.abs(sr[k] * (2 * t.Jp + 1) - 1)); });
        var ok = worst < 1e-9;
        $('R-sr').textContent = ok ? '✓ 通过' : '偏差 ' + worst.toExponential(1);
        $('R-sr').className = 'v' + (ok ? '' : ' bad');
        var s2 = '<table><tr><th>m′</th><th style="text-align:right">Σ|CG|²×(2J′+1)</th>' +
          '<th style="text-align:right">偏差</th></tr>';
        keys.forEach(function (k) {
          var val = sr[k] * (2 * t.Jp + 1);
          s2 += '<tr><td class="n">' + fmtHalf(+k) + '</td><td class="n">' + val.toFixed(12) +
            '</td><td class="n">' + (val - 1).toExponential(2) + '</td></tr>';
        });
        $('sr').innerHTML = s2 + '</table>';

        /* 超精细约化矩阵元 ⟨F′‖d‖F⟩（6j 分解；独立页 tA 补进模块） */
        var dRM = D.d_red_au(), Fsg = W.frange(t.Jg, I), Fsp = W.frange(t.Jp, I), A = [];
        Fsg.forEach(function (F) { Fsp.forEach(function (Fp) {
          var cc = W.redHFS(I, t.Jg, t.Jp, F, Fp);
          if (Math.abs(cc) > 1e-11) A.push({ F: F, Fp: Fp, c: cc });
        }); });
        var h2 = '<table><tr><th>F</th><th>F′</th>' +
          '<th style="text-align:right">系数</th><th style="text-align:right">a.u.</th>' +
          '<th style="text-align:right">相对线强</th></tr>';
        A.forEach(function (r) {
          h2 += '<tr><td class="n">' + fmtHalf(r.F) + '</td><td class="n">' + fmtHalf(r.Fp) + '</td>' +
            '<td class="n">' + W.pretty(r.c) + '</td><td class="n">' + (r.c * dRM).toFixed(6) + '</td>' +
            '<td class="n">' + (r.c * r.c).toFixed(4) + '</td></tr>';
        });
        $('hyf').innerHTML = h2 + '</table>';

        /* 出处 */
        $('meta').innerHTML = '<table>' +
          '<tr><td style="width:30%">元素</td><td>' + d.el + '　' + d.name + '　Z=' + d.Z + '</td></tr>' +
          '<tr><td>同位素</td><td>' + d.el + '-' + t.A + '　I=' + fmtHalf(I) +
            '　丰度 ' + (d.iso[cur.iso].ab || '—') + '</td></tr>' +
          '<tr><td>能级 E_k</td><td>' + (tr.ek || '—') + ' cm⁻¹　→ λ_vac = ' +
            S.derived.lambda_nm().toFixed(6) + ' nm</td></tr>' +
          '<tr><td>线宽 Γ/2π</td><td>' + (t.Gamma_Hz / 1e3).toPrecision(6) + ' kHz　' +
            (tr.gu || '') + '</td></tr>' +
          '<tr><td>出处</td><td>' + (tr.src || '—') + '</td></tr>' +
          '</table>';
      }

      /* ---- 全库求和规则扫描（折叠区 exp3）----
       * 覆盖 DB 全部元素×同位素×跃迁（10×24×18≈42 组），三组求和规则：
       *   R1 Σ_F′ |⟨F′‖d‖F⟩|² = (2F+1)/(2J+1)
       *   R2 Σ_F,q |⟨F′m′|d_q|Fm⟩|² = 1/(2J′+1)
       *   R3 Σ_F′,q |⟨F′m′|d_q|Fm⟩|² = 1/(2J+1)
       * 报出最大残差与触发它的组合 —— 只看"全部通过"等于没测。 */
      function runScan() {
        if (!DB) return;
        var n = 0, bad = 0, worst = 0, worstTag = '';
        function rec(r, tag) { if (r > worst) { worst = r; worstTag = tag; } if (r > 1e-8) bad++; }
        DB.forEach(function (d) {
          d.iso.forEach(function (iso) {
            d.tr.forEach(function (t) {
              var I = iso.I, J = d.J, Jp = t.Jp, Fs = W.frange(J, I), Fps = W.frange(Jp, I); n++;
              Fs.forEach(function (F) { var x = 0;
                Fps.forEach(function (Fp) { x += W.redHFS(I, J, Jp, F, Fp) * W.redHFS(I, J, Jp, F, Fp); });
                rec(Math.abs(x - (2 * F + 1) / (2 * J + 1)), 'R1 ' + iso.a + d.el); });
              Fps.forEach(function (Fp) {
                for (var mp = -Fp; mp <= Fp + 1e-9; mp++) { var x = 0;
                  Fs.forEach(function (F) { for (var q = -1; q <= 1; q++) { var m = mp - q;
                    if (Math.abs(m) <= F + 1e-9) x += W.zee(I, J, Jp, F, m, Fp, mp, q) * W.zee(I, J, Jp, F, m, Fp, mp, q); } });
                  rec(Math.abs(x - 1 / (2 * Jp + 1)), 'R2 ' + iso.a + d.el); } });
              Fs.forEach(function (F) {
                for (var m = -F; m <= F + 1e-9; m++) { var x = 0;
                  Fps.forEach(function (Fp) { for (var q = -1; q <= 1; q++) { var mp = m + q;
                    if (Math.abs(mp) <= Fp + 1e-9) x += W.zee(I, J, Jp, F, m, Fp, mp, q) * W.zee(I, J, Jp, F, m, Fp, mp, q); } });
                  rec(Math.abs(x - 1 / (2 * J + 1)), 'R3 ' + iso.a + d.el); } });
            });
          });
        });
        var out = '扫描 ' + n + ' 个（元素×同位素×跃迁）组合，R1/R2/R3 违规 ' + bad + ' 项\n' +
          '  最大残差 ' + worst.toExponential(2) + '（' + worstTag + '），双精度极限约 1e-15';
        $('scanout').textContent = out;
        $('scanout').style.borderLeftColor = bad ? 'var(--bad)' : 'var(--ok)';
      }

      /* ---- LaTeX 导出当前塞曼表（折叠区 exp4） ---- */
      function runTex() {
        var t = S.state.transition, F = t.F, Fp = t.Fp, I = t.I, dRM = S.derived.d_red_au();
        var L = ['\\begin{tabular}{ll l r r}', '\\hline',
          '$F,m$ & pol. & $F\',m\'$ & coeff. & value (a.u.) \\\\', '\\hline'];
        for (var m = -F; m <= F + 1e-9; m++)
          for (var q = -1; q <= 1; q++) {
            var mp = m + q;
            if (Math.abs(mp) > Fp + 1e-9) continue;
            var v = W.zee(I, t.Jg, t.Jp, F, m, Fp, mp, q);
            if (Math.abs(v) < 1e-12) continue;
            var pol = q > 0 ? '\\sigma^+' : q < 0 ? '\\sigma^-' : '\\pi';
            L.push('$' + fmtHalf(F) + ',' + fmtHalf(m) + '$ & $' + pol + '$ & $' +
              fmtHalf(Fp) + ',' + fmtHalf(mp) + '$ & $' + v.toFixed(6) + '$ & $' +
              (v * dRM).toFixed(6) + '$ \\\\');
          }
        L.push('\\hline', '\\end{tabular}');
        $('texout').value = L.join('\n');
        var note = $('texnote');
        if (navigator.clipboard) {
          navigator.clipboard.writeText(L.join('\n')).then(function () {
            note.textContent = '已复制到剪贴板。';
          }).catch(function () { note.textContent = '剪贴板不可用，表格已填入下方文本框。'; });
        } else note.textContent = '表格已填入下方文本框。';
      }

      /* ---- 下载 CSV（折叠区 exp4）---- */
      function runCsv() {
        var t = S.state.transition, F = t.F, Fp = t.Fp, I = t.I, dRM = S.derived.d_red_au();
        var L = ['F,m,q,Fp,mp,coefficient,value_au,cycling'];
        for (var m = -F; m <= F + 1e-9; m++)
          for (var q = -1; q <= 1; q++) {
            var mp = m + q;
            if (Math.abs(mp) > Fp + 1e-9) continue;
            var v = W.zee(I, t.Jg, t.Jp, F, m, Fp, mp, q);
            if (Math.abs(v) < 1e-12) continue;
            L.push([fmtHalf(F), fmtHalf(m), q, fmtHalf(Fp), fmtHalf(mp),
              v.toFixed(9), (v * dRM).toFixed(9),
              (chanCount(F, Fp, I, t, mp) === 1) ? 1 : 0].join(','));
          }
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([L.join('\n')], { type: 'text/csv;charset=utf-8' }));
        a.download = t.A + '' + t.element + '_matrix_elements.csv';
        a.click();
      }
      function chanCount(F, Fp, I, t, mp) {
        /* 在完整基态流形上统计 (Fp,mp) 的衰变通道数（跨全部 F） */
        var n = 0;
        var allF = W.frange(t.Jg, I);
        allF.forEach(function (f) {
          for (var mm = -f; mm <= f + 1e-9; mm++) {
            var q = mp - mm;
            if (Math.abs(q) > 1) continue;
            if (Math.abs(W.zee(I, t.Jg, t.Jp, f, mm, Fp, mp, q)) > 1e-12) n++;
          }
        });
        return n;
      }

      /* ---- 下载全库 JSON（折叠区 exp4）---- */
      function runJson() {
        var out = {
          tool: 'yb-toolkit hfs-matrix-element',
          convention: 'Edmonds (3j)',
          exported: new Date().toISOString().slice(0, 10),
          elements: DB
        };
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
        a.download = 'transitions_export.json';
        a.click();
      }

      /* ---- 更新记录（折叠区 exp5）---- */
      var CHANGELOG = [
        { v: '3b', date: '2026-08-06', by: '模块化',
          chg: ['补 CSV / 全库 JSON 导出与循环跃迁徽标',
                '数据出处与约定扩为三段（归一化陷阱 / Edmonds vs CG / 纪律）',
                '新增 Steck 交叉验证测试向量（steck_cross）'],
          note: '纪律说明与输入配套才有效：紧贴"d 由 Γ 反解"输入，防止直接抄文献 d 值差 √(2J+1)。' },
        { v: '3a', date: '2026-08-04', by: '模块化',
          chg: ['独立页并入外壳，改读 data/transitions.json',
                '新增全库 42 组合求和规则扫描（R1/R2/R3）',
                '新增 LaTeX 导出'],
          note: '' },
        { v: '2.1', date: '2026-07-30', by: '初版协作',
          chg: ['数据库改存激发态能级 E_k，真空波长由 λ = 10⁷/E_k 导出',
                '修正 4 处误填空气波长的条目（Mg/Hg/Cd ¹P₁、Mg ³P₁，约 +290 ppm）',
                '修正 Sr ¹S₀–¹P₁ 线宽 30.5→32 MHz、Yb ¹S₀–¹P₁ 29→28 MHz'],
          note: '约定问题定论：d_Edmonds = √(2J+1)·d_CG。此前两次判断均有误 —— 先错误地把 0.543 除以 √3，' +
                '后又错误地否认 √2 因子存在。查 Steck 原表后确认该因子真实，且 J=0 时恰为 1，' +
                '这解释了为何 Yb 的推导始终未受影响。教训：数据库不存文献 d 值，一律由 Γ 反解。' },
        { v: '2.0', date: '2026-07-30', by: '初版协作',
          chg: ['推广到任意 J，加入 Rb / Cs / K / Na（J=1/2 基态）',
                'I、J′、λ 改为只读；Γ 与 d 保留可调'],
          note: 'Cs D2 有 126 条分量、⁴⁰K D2 有 146 条，筛选是必需而非可选。' }
      ];
      function renderChg() {
        $('chg').innerHTML = CHANGELOG.map(function (c) {
          var s = '<div class="rel"><span class="rel-v">v' + c.v + '</span>' +
            '<div class="rel-d"><b>' + c.date + '</b> · ' + c.by + '</div>' +
            '<ul class="chg">' + c.chg.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>';
          if (c.note) s += '<p class="cap">' + c.note + '</p>';
          return s + '</div>';
        }).join('');
      }

      $('exp1').addEventListener('toggle', render);
      $('exp2').addEventListener('toggle', render);
      $('exp5').addEventListener('toggle', renderChg);
      $('btn-scan').onclick = runScan;
      $('btn-tex').onclick = runTex;
      $('btn-csv').onclick = runCsv;
      $('btn-json').onclick = runJson;

      return {
        update: function () { if (DB) { syncFromStore(); render(); } },
        setCompact: function (on) { compact = on;
          if (on) { $('exp1').open = false; $('exp2').open = false;
            $('exp3').open = false; $('exp4').open = false; $('exp5').open = false; }
          render(); },
        impact: function () {
          return 'd_red = ' + S.derived.d_red_au().toFixed(6) + ' e·a₀　λ = ' +
                 S.derived.lambda_nm().toFixed(4) + ' nm';
        },
        destroy: function () {}
      };
    }
  });
})();
