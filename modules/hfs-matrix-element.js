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

  /* 数据库延迟加载：fetch 在 file:// 下会被 CORS 挡掉，需要明确提示 */
  function loadDB() {
    if (DB) return Promise.resolve(DB);
    return fetch('data/transitions.json')
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) { DB = j.elements; return DB; })
      .catch(function (e) {
        return fetch('../data/transitions.json').then(function (r) { return r.json(); })
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
          '<span class="cap">单位 ⟨J′‖d‖J⟩</span></div>' +
        '<div id="' + i('zt') + '"></div>' +
      '</div>' +

      '<details class="adv" id="' + i('exp1') + '"><summary>求和规则逐项检验</summary>' +
        '<div id="' + i('sr') + '" style="margin-top:10px"></div>' +
        '<p class="cap">对 J=0 基态，每个激发态子能级的 CG 平方和恰为 1 —— ' +
        '这正是 6j 因子被 d_cyc 定义吸收的依据。若此处不为 1，说明归一化约定有误。</p>' +
      '</details>' +

      '<details class="adv" id="' + i('exp2') + '"><summary>数据出处与约定</summary>' +
        '<div id="' + i('meta') + '" style="margin-top:10px"></div>' +
        '<p class="cap"><b>归一化陷阱：</b>d_Edmonds = √(2J+1)·d_CG。J=0 基态时该因子恰为 1，' +
        '所以 Yb 一直未暴露问题，但碱金属（J=1/2）会差 √2。' +
        '因此数据库<b>不存任何文献 d 值</b>，一律由 Γ 反解，保证与本框架约定自洽。</p>' +
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
        var F = t.F, Fp = t.Fp, I = t.I, rows = [], sr = {};
        for (var m = -F; m <= F + 1e-9; m++) {
          for (var q = -1; q <= 1; q++) {
            var mp = m + q;
            if (Math.abs(mp) > Fp + 1e-9) continue;
            var v = W.zee(I, t.Jg, t.Jp, F, m, Fp, mp, q);
            if (Math.abs(v) < 1e-12) continue;
            rows.push({ m: m, mp: mp, q: q, v: v });
            sr[mp] = (sr[mp] || 0) + v * v;
          }
        }
        var lim = compact ? 6 : rows.length;
        var POL = { '-1': 'σ⁻', '0': 'π', '1': 'σ⁺' };
        var html = '<table><tr><th>m</th><th>偏振</th><th>m′</th>' +
          '<th style="text-align:right">数值</th><th style="text-align:right">精确值</th></tr>';
        rows.slice(0, lim).forEach(function (r) {
          html += '<tr><td class="n">' + fmtHalf(r.m) + '</td><td>' + POL[r.q] + '</td>' +
            '<td class="n">' + fmtHalf(r.mp) + '</td><td class="n">' + r.v.toFixed(6) +
            '</td><td class="n">' + W.pretty(r.v) + '</td></tr>';
        });
        html += '</table>';
        if (lim < rows.length) html += '<p class="cap">已显示 ' + lim + ' / ' + rows.length +
          ' 条（紧凑模式）。拉高窗格可看全部。</p>';
        $('zt').innerHTML = html;

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

      $('exp1').addEventListener('toggle', render);
      $('exp2').addEventListener('toggle', render);

      return {
        update: function () { if (DB) { syncFromStore(); render(); } },
        setCompact: function (on) { compact = on;
          if (on) { $('exp1').open = false; $('exp2').open = false; }
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
