/* modules/raman-qubit.js — 核自旋比特拉曼驱动
 *
 * 核心视图：结论条 + 误差预算 + 能级图
 * 折叠区：  功率–失谐设计图 / 偏振 / 适用性检查
 *
 * 注意标度律与 rabi-power 不同：拉曼 Ω_R ∝ P，单光子 f_R ∝ √P。
 * 使用 d_red（约化矩阵元），不是 d_cyc。
 */
(function () {
  'use strict';

  var P = window.YBP, S = window.YBStore, U = window.YBU, C = window.YBC, YB = window.YB;
  var D2R = Math.PI / 180;

  window.YBM.register({
    id: 'raman-qubit',
    title: '拉曼比特',
    subtitle: '双光子拉曼  Ω_R ∝ P',
    reads: ['transition.*', 'beam.*', 'raman.*', 'limits.*'],
    writes: ['raman.detuning_Hz', 'beam.S3', 'beam.alpha_deg', 'beam.theta_kB_deg', 'beam.B_G'],

    template: function (c) {
      var i = c.id;
      return '' +
      '<div class="res">' +
        '<div><p class="k">拉曼 Ω_R/2π</p><p class="v" id="' + i('R-om') + '">—</p>' +
          '<p class="u" id="' + i('R-omu') + '">—</p></div>' +
        '<div><p class="k">π/2 脉冲时间</p><p class="v" id="' + i('R-t') + '">—</p>' +
          '<p class="u" id="' + i('R-tu') + '">—</p></div>' +
        '<div><p class="k">π/2 门总误差</p><p class="v" id="' + i('R-e') + '">—</p>' +
          '<p class="u" id="' + i('R-eu') + '">—</p></div>' +
        '<div><p class="k">几何因子 |S₃|·sinΘ</p><p class="v" id="' + i('R-g') + '">—</p>' +
          '<p class="u" id="' + i('R-gu') + '">—</p></div>' +
      '</div>' +

      '<div class="card" style="padding:10px 12px">' +
        '<svg id="' + i('lvl') + '" viewBox="0 0 700 230" style="width:100%;display:block"></svg>' +
      '</div>' +

      '<div class="card">' +
        '<div class="grid3">' +
          '<div><p class="lbl">Δ 失谐（相对 F′=3/2）</p><div class="iu">' +
            '<input type="number" id="' + i('v-D') + '" step="10">' +
            '<select id="' + i('u-D') + '">' + U.optionsHTML('freq') + '</select></div>' +
            '<div class="segs" style="margin:8px 0 0">' +
              '<button class="seg mini" data-d="180e6">180 M</button>' +
              '<button class="seg mini" data-d="1e9">1 G</button>' +
              '<button class="seg mini" data-d="13e9">13 G</button>' +
              '<button class="seg mini" data-d="-2.1e9">−2.1 G</button></div></div>' +
          '<div><p class="lbl">S₃ 圆偏振度</p>' +
            '<input type="number" id="' + i('v-s3') + '" step="0.01" min="0" max="1">' +
            '<p class="cap" style="margin-top:6px">0 = 线偏振（耦合为零）　1 = 圆偏振</p></div>' +
          '<div><p class="lbl">椭圆倾角 α (°)</p><input type="number" id="' + i('v-a') + '" step="0.5">' +
            '<p class="cap" style="margin-top:6px">tanα = |E_y/E_z|，影响两腿分配</p></div>' +
        '</div>' +
        '<div class="rw" style="margin-top:12px"><span class="n">光束与 B 夹角 Θ_kB (°)</span>' +
          '<input type="range" id="' + i('r-k') + '" min="0" max="90" step="1">' +
          '<span class="o" id="' + i('o-k') + '">—</span></div>' +
        '<div class="rw"><span class="n">磁场 B (G)</span>' +
          '<input type="range" id="' + i('r-b') + '" min="0.1" max="20" step="0.02">' +
          '<span class="o" id="' + i('o-b') + '">—</span></div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="chead"><span class="t">π/2 门误差预算</span>' +
          '<label style="font-size:12px;color:var(--fg2);cursor:pointer">' +
          '<input type="checkbox" id="' + i('c-comp') + '"> 光频移已由 Z 门补偿</label></div>' +
        '<div class="grid4">' +
          '<div class="mc"><p class="k">散射</p><p class="v" id="' + i('e-sc') + '">—</p>' +
            '<div class="bar"><i id="' + i('b-sc') + '"></i></div></div>' +
          '<div class="mc"><p class="k">光频移失谐</p><p class="v" id="' + i('e-ls') + '">—</p>' +
            '<div class="bar"><i id="' + i('b-ls') + '"></i></div></div>' +
          '<div class="mc"><p class="k">强度噪声 1%</p><p class="v" id="' + i('e-in') + '">—</p>' +
            '<div class="bar"><i id="' + i('b-in') + '"></i></div></div>' +
          '<div class="mc"><p class="k">合计</p><p class="v" id="' + i('e-tot') + '">—</p>' +
            '<p class="u" id="' + i('e-dom') + '">—</p></div>' +
        '</div>' +
        '<p class="cap">Δ_LS = δ_Z(8Ω_σ²+Ω_π²)/(4Δ²)。光频移是论文工作点上最大的单项误差，' +
        '可被 Z 门标定补偿，但补偿本身有残差。</p>' +
      '</div>' +

      '<div id="' + i('warn') + '"></div>' +

      '<details class="adv" id="' + i('exp1') + '"><summary>Ω_R 与门误差随失谐变化</summary>' +
        '<div style="margin-top:12px"><canvas id="' + i('c1') + '" height="300"></canvas></div>' +
        '<p class="cap">左轴 Ω_R，右轴 π/2 门误差。竖虚线为当前工作点。' +
        '含 F′=1/2 相消干涉因子 Δ_hf/(Δ+Δ_hf)，大失谐下标度由 1/Δ 转为 1/Δ²。</p>' +
      '</details>' +

      '<details class="adv" id="' + i('exp2') + '"><summary>派生量与适用性</summary>' +
        '<div class="grid4" style="margin-top:12px">' +
          '<div class="mc"><p class="k">Ω_π/2π</p><p class="v" id="' + i('m-op') + '">—</p></div>' +
          '<div class="mc"><p class="k">Ω_σ/2π</p><p class="v" id="' + i('m-og') + '">—</p></div>' +
          '<div class="mc"><p class="k">微分光频移</p><p class="v" id="' + i('m-ls') + '">—</p></div>' +
          '<div class="mc"><p class="k">Δ/Ω_π 绝热余量</p><p class="v" id="' + i('m-ad') + '">—</p></div>' +
          '<div class="mc"><p class="k">超精细干涉因子</p><p class="v" id="' + i('m-hf') + '">—</p></div>' +
          '<div class="mc"><p class="k">净比特劈裂</p><p class="v" id="' + i('m-dn') + '">—</p></div>' +
          '<div class="mc"><p class="k">Z 轴进动</p><p class="v" id="' + i('m-pr') + '">—</p></div>' +
          '<div class="mc"><p class="k">d_red</p><p class="v" id="' + i('m-d') + '">—</p></div>' +
        '</div>' +
      '</details>';
    },

    init: function (c) {
      var $ = c.$, compact = false, V = {};

      function fill() {
        var s = S.state;
        $('v-D').value = +(U.fromSI('freq', s.raman.detuning_Hz, U.resolve('freq', $('u-D').value))).toPrecision(7);
        $('v-s3').value = s.beam.S3;
        $('v-a').value = s.beam.alpha_deg;
        $('r-k').value = s.beam.theta_kB_deg;
        $('r-b').value = s.beam.B_G;
        $('o-k').textContent = s.beam.theta_kB_deg + '°';
        $('o-b').textContent = (+s.beam.B_G).toFixed(2) + ' G';
      }

      function compute() {
        var s = S.state, D = S.derived, Y = C.YB171;
        V.d = D.d_red_SI();
        V.Pat = D.P_atom();
        V.E0 = D.E0();
        V.geom = D.geom();
        V.Dh = s.raman.detuning_Hz;
        V.Om = Math.abs(D.ramanOmega());
        var legs = YB.ramanLegs(V.d, V.E0, s.beam.alpha_deg * D2R);
        V.op = legs.pi; V.og = legs.sigma;
        V.dLS = YB.lightShift(V.op, V.og, V.Dh);
        V.dN = V.dLS - 2 * Math.PI * Y.gamma_n.v * s.beam.B_G;
        V.t2 = V.Om ? (Math.PI / 2) / V.Om : 0;
        V.prec = V.dN * V.t2;
        V.eSC = YB.scatterError(V.Dh);
        V.eLS = YB.areaError(V.prec);
        V.eIN = YB.areaError((Math.PI / 2) * 0.01);
        V.comp = $('c-comp').checked;
        V.eTOT = V.eSC + (V.comp ? 0 : V.eLS) + V.eIN;
        V.hf = YB.hfFactor(V.Dh);
      }

      function paint() {
        var s = S.state;
        $('R-om').textContent = U.auto('freq', V.Om / (2 * Math.PI), 5);
        $('R-omu').textContent = 'Ω_R ∝ P（非 √P）';
        $('R-t').textContent = V.t2 ? U.auto('time', V.t2, 4) : '—';
        $('R-tu').textContent = V.t2 ? 'π 脉冲 ' + U.auto('time', 2 * V.t2, 4) : '—';
        $('R-e').textContent = isFinite(V.eTOT) ? V.eTOT.toExponential(2) : '∞';
        $('R-eu').textContent = V.comp ? '光频移已补偿' : '含光频移未补偿';
        $('R-g').textContent = V.geom.toFixed(4);
        $('R-gu').textContent = V.geom < 0.02 ? '⚠ 耦合趋零' : 'S₃=' + s.beam.S3;
        $('R-om').className = 'v' + (V.geom < 0.02 ? ' bad' : '');

        var mx = Math.max(V.eSC, V.eLS, V.eIN, 1e-30);
        $('e-sc').textContent = V.eSC.toExponential(2);
        $('e-ls').textContent = V.eLS.toExponential(2);
        $('e-in').textContent = V.eIN.toExponential(2);
        $('e-tot').textContent = V.eTOT.toExponential(2);
        $('e-dom').textContent = V.comp ? '光频移已扣除' :
          (V.eSC >= V.eLS && V.eSC >= V.eIN ? '散射主导' :
           V.eLS >= V.eIN ? '光频移主导' : '强度噪声主导');
        $('b-sc').style.width = (V.eSC / mx * 100) + '%';
        $('b-ls').style.width = (V.eLS / mx * 100) + '%';
        $('b-in').style.width = (V.eIN / mx * 100) + '%';

        if ($('exp2').open) {
          $('m-op').textContent = U.auto('freq', V.op / (2 * Math.PI), 4);
          $('m-og').textContent = U.auto('freq', V.og / (2 * Math.PI), 4);
          $('m-ls').textContent = U.auto('freq', V.dLS / (2 * Math.PI), 4);
          $('m-ad').textContent = V.op ? Math.abs(2 * Math.PI * V.Dh / V.op).toFixed(1) : '—';
          $('m-hf').textContent = V.hf.toFixed(4);
          $('m-dn').textContent = U.auto('freq', V.dN / (2 * Math.PI), 4);
          $('m-pr').textContent = (V.prec * 180 / Math.PI).toFixed(2) + ' °';
          $('m-d').textContent = (V.d / C.SI.ea0).toFixed(6) + ' e·a₀';
        }

        var w = [], bad = false, s2 = S.state;
        if (V.geom < 0.02) { w.push('几何因子 ≈ 0：线偏振或光束平行于 B，<b>拉曼耦合为零</b>'); bad = true; }
        if (V.op && Math.abs(2 * Math.PI * V.Dh / V.op) < 10)
          w.push('Δ/Ω_π = ' + Math.abs(2 * Math.PI * V.Dh / V.op).toFixed(1) + ' < 10，绝热消除余量不足');
        if (Math.abs(V.Dh + C.YB171.D_hf.v) < 1.5e9) {
          w.push('Δ 接近 F′=1/2 共振（−5.94 GHz），散射急剧上升'); bad = true; }
        if (!V.comp && V.eLS > 2 * V.eSC)
          w.push('光频移是主导误差，建议加大失谐或用 Z 门补偿');
        if (s2.transition.Jg !== 0)
          { w.push('当前跃迁基态 J≠0，本模块的核自旋比特模型不适用'); bad = true; }
        $('warn').innerHTML = w.length
          ? '<div class="note ' + (bad ? 'b' : 'w') + '">' +
            w.map(function (t) { return '· ' + t; }).join('<br>') + '</div>'
          : '<div class="note g">当前工作点在适用范围内</div>';
      }

      /* ---- 能级图 ---- */
      function drawLevel() {
        var f2 = P.color('--fg2'), fg = P.color('--fg'), acc = P.color('--accent'), bad = P.color('--bad');
        var y32 = 62, y12 = 130, s = '', i;
        function ln(x1, y, x2, col, w) { return '<line x1="' + x1 + '" y1="' + y + '" x2="' + x2 +
          '" y2="' + y + '" stroke="' + col + '" stroke-width="' + (w || 2.5) + '" stroke-linecap="round"/>'; }
        function tx(x, y, t, col, an, sz) { return '<text x="' + x + '" y="' + y + '" fill="' + col +
          '" font-size="' + (sz || 11) + '" text-anchor="' + (an || 'start') +
          '" font-family="ui-monospace,Menlo,monospace">' + t + '</text>'; }
        for (i = 0; i < 4; i++) s += ln(300 + i * 78, y32 - 9 + i * 6, 350 + i * 78, acc);
        s += tx(296, y32 - 22, "³P₁  F′=3/2", acc, 'start', 12);
        for (i = 0; i < 2; i++) s += ln(340 + i * 78, y12, 390 + i * 78, bad);
        s += tx(336, y12 + 20, "³P₁  F′=1/2", bad, 'start', 12);
        s += '<line x1="618" y1="' + (y32 + 9) + '" x2="618" y2="' + y12 +
             '" stroke="' + f2 + '" stroke-width="1"/>';
        s += tx(626, (y32 + y12) / 2 + 4, '5.936 GHz', f2);
        s += ln(70, 196, 148, fg) + ln(70, 206, 148, fg);
        s += tx(66, 222, '¹S₀  F=1/2', fg, 'start', 12);
        s += tx(153, 200, '|↑⟩ |↓⟩ 核自旋比特', f2);
        var D = S.state.raman.detuning_Hz;
        var off = 80 * Math.asinh(D / 1e9) / Math.asinh(20);
        var yl = Math.max(20, Math.min(180, y32 - off));
        s += '<line x1="268" y1="' + yl + '" x2="600" y2="' + yl + '" stroke="' + f2 +
             '" stroke-width="1.4" stroke-dasharray="6 4"/>';
        s += tx(264, yl + 4, 'Δ = ' + U.auto('freq', D, 4), f2, 'end');
        s += '<path d="M148 200 Q 210 ' + ((200 + yl) / 2) + ' 266 ' + yl +
             '" fill="none" stroke="' + acc + '" stroke-width="1.6" opacity=".85"/>';
        s += '<path d="M266 ' + yl + ' Q 210 ' + ((200 + yl) / 2 + 14) +
             ' 148 214" fill="none" stroke="' + bad + '" stroke-width="1.6" opacity=".85" stroke-dasharray="4 3"/>';
        s += tx(196, (200 + yl) / 2 - 6, 'σ±', acc, 'middle', 12);
        s += tx(196, (200 + yl) / 2 + 28, 'π', bad, 'middle', 12);
        s += tx(400, 218, '两支 CG 反号 ⟹ 相消干涉因子 Δ_hf/(Δ+Δ_hf)', f2, 'middle', 10);
        $('lvl').innerHTML = s;
      }

      /* ---- 失谐扫描图 ---- */
      function drawC1(cs) {
        if (!$('exp1').open) return;
        var o = P.prep(c.id('c1')), g = o.g, W = o.W, H = o.H, M = { l: 58, r: 56, t: 14, b: 34 };
        var s = S.state, Dmn = 20e6, Dmx = 5e10;
        var fx = P.scaleLog(Dmn / 1e6, Dmx / 1e6, M.l, W - M.r);
        var ref = Math.abs(YB.ramanOmega(V.d, V.Pat, s.beam.wx, s.beam.wy, Dmn, V.geom)) / (2 * Math.PI);
        var Fmx = Math.pow(10, Math.ceil(P.L10(Math.max(ref, 10)))), Fmn = Fmx / 1e6;
        var fy = P.scaleLog(Fmn, Fmx, H - M.b, M.t), fe = P.scaleLog(1e-8, 1e-1, H - M.b, M.t);
        P.axes(g, M, W, H, fx, fy, P.ticksLog(Dmn / 1e6, Dmx / 1e6), P.ticksLog(Fmn, Fmx),
               '失谐 Δ/2π (MHz，蓝失谐)', 'Ω_R/2π (Hz)');
        var acc = P.color('--accent'), bad = P.color('--bad'), f2 = P.color('--fg2');
        var N = cs ? 90 : 200;
        P.clip(g, M, W, H, function () {
          var i, Dv;
          g.strokeStyle = acc; g.lineWidth = 2; g.beginPath();
          for (i = 0; i <= N; i++) {
            Dv = Math.pow(10, P.L10(Dmn) + i / N * (P.L10(Dmx) - P.L10(Dmn)));
            var v = Math.abs(YB.ramanOmega(V.d, V.Pat, s.beam.wx, s.beam.wy, Dv, V.geom)) / (2 * Math.PI);
            if (i) g.lineTo(fx(Dv / 1e6), fy(v)); else g.moveTo(fx(Dv / 1e6), fy(v));
          }
          g.stroke();
          g.strokeStyle = bad; g.lineWidth = 2; g.beginPath();
          for (i = 0; i <= N; i++) {
            Dv = Math.pow(10, P.L10(Dmn) + i / N * (P.L10(Dmx) - P.L10(Dmn)));
            if (i) g.lineTo(fx(Dv / 1e6), fe(YB.scatterError(Dv)));
            else g.moveTo(fx(Dv / 1e6), fe(YB.scatterError(Dv)));
          }
          g.stroke();
          if (V.Dh > Dmn && V.Dh < Dmx) {
            var x = fx(V.Dh / 1e6);
            g.strokeStyle = f2; g.globalAlpha = .55; g.setLineDash([2, 3]);
            g.beginPath(); g.moveTo(x, M.t); g.lineTo(x, H - M.b); g.stroke();
            g.setLineDash([]); g.globalAlpha = 1;
          }
        });
        g.font = '10px ui-monospace,Menlo,monospace'; g.fillStyle = f2;
        g.textAlign = 'left'; g.textBaseline = 'middle';
        P.ticksLog(1e-8, 1e-1).forEach(function (t) {
          if (!t.major) return; var y = fe(t.v);
          if (y < M.t || y > H - M.b) return;
          g.fillText(t.v.toExponential(0).replace('e-', 'e−'), W - M.r + 6, y);
        });
        g.save(); g.translate(W - 9, (M.t + H - M.b) / 2); g.rotate(Math.PI / 2);
        g.textAlign = 'center'; g.textBaseline = 'top'; g.font = '11px ui-monospace,Menlo,monospace';
        g.fillText('π/2 门误差', 0, 0); g.restore();
      }

      var sched = new P.Scheduler(
        function () { compute(); paint(); drawLevel(); drawC1(true); },
        function () { P.measure([c.id('c1')]); compute(); paint(); drawLevel(); drawC1(false); }, 170);

      /* ---- 事件 ---- */
      function push() {
        var patch = {};
        var Dv = U.toSI('freq', parseFloat($('v-D').value) || 0, U.resolve('freq', $('u-D').value));
        var s3 = Math.max(0, Math.min(1, parseFloat($('v-s3').value) || 0));
        var a = parseFloat($('v-a').value) || 0;
        var k = parseFloat($('r-k').value), b = parseFloat($('r-b').value);
        if (Dv !== S.state.raman.detuning_Hz) patch['raman.detuning_Hz'] = Dv;
        if (s3 !== S.state.beam.S3) patch['beam.S3'] = s3;
        if (a !== S.state.beam.alpha_deg) patch['beam.alpha_deg'] = a;
        if (k !== S.state.beam.theta_kB_deg) patch['beam.theta_kB_deg'] = k;
        if (b !== S.state.beam.B_G) patch['beam.B_G'] = b;
        $('o-k').textContent = k + '°'; $('o-b').textContent = b.toFixed(2) + ' G';
        if (Object.keys(patch).length) c.set(patch);
        sched.tick();
      }
      ['v-D', 'v-s3', 'v-a'].forEach(function (k) { $(k).addEventListener('input', push); });
      ['r-k', 'r-b'].forEach(function (k) { $(k).addEventListener('input', push); });
      $('u-D').addEventListener('change', function () { fill(); sched.flush(); });
      $('c-comp').addEventListener('change', function () { sched.flush(); });
      c.container.querySelectorAll('[data-d]').forEach(function (b) {
        b.onclick = function () {
          c.set({ 'raman.detuning_Hz': parseFloat(b.dataset.d) }); fill(); sched.flush(); };
      });
      ['exp1', 'exp2'].forEach(function (k) {
        $(k).addEventListener('toggle', function () { P.measure([c.id('c1')]); sched.flush(); }); });

      fill(); P.measure([c.id('c1')]); sched.flush();

      return {
        update: function () { fill(); sched.flush(); },
        setCompact: function (on) {
          if (on === compact) return;
          compact = on;
          if (on) { $('exp1').open = false; $('exp2').open = false; }
          $('lvl').style.display = on ? 'none' : 'block';
          sched.flush();
        },
        impact: function () {
          compute();
          return 'Ω_R = ' + U.auto('freq', V.Om / (2 * Math.PI), 5) +
                 '　总误差 ' + V.eTOT.toExponential(2);
        },
        destroy: function () {}
      };
    }
  });
})();
