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
    writes: ['raman.detuning_Hz', 'beam.S3', 'beam.alpha_deg', 'beam.theta_kB_deg', 'beam.B_G',
             'beam.P_laser', 'beam.wx', 'beam.wy', 'beam.eta', 'limits.Pmax'],

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
        '<div class="grid3" style="margin-top:12px">' +
          '<div><p class="lbl">P_laser 激光输出功率</p><div class="iu">' +
            '<input type="number" id="' + i('v-p') + '" step="1">' +
            '<select id="' + i('u-p') + '">' + U.optionsHTML('power') + '</select></div></div>' +
          '<div><p class="lbl">w 束腰 (1/e² 强度半径)</p><div class="iu">' +
            '<input type="number" id="' + i('v-w') + '" step="1">' +
            '<select id="' + i('u-w') + '">' + U.optionsHTML('length') + '</select></div>' +
            '<label class="cbx" style="margin-top:8px"><input type="checkbox" id="' + i('c-ell') + '"> ' +
            '椭圆光斑（wx≠wy）</label></div>' +
          '<div><p class="lbl">可用最大功率 (mW)</p><input type="number" id="' + i('v-pmax') + '" step="10"></div>' +
        '</div>' +
        '<div class="grid2" id="' + i('ell-rows') + '" style="display:none">' +
          '<div><p class="lbl">w_x (1/e² 强度半径)</p><div class="iu">' +
            '<input type="number" id="' + i('v-wx') + '" step="1">' +
            '<select id="' + i('u-wx') + '">' + U.optionsHTML('length') + '</select></div></div>' +
          '<div><p class="lbl">w_y (1/e² 强度半径)</p><div class="iu">' +
            '<input type="number" id="' + i('v-wy') + '" step="1">' +
            '<select id="' + i('u-wy') + '">' + U.optionsHTML('length') + '</select></div></div>' +
        '</div>' +
        '<div class="rw" style="margin-top:12px"><span class="n">光路透过率 η</span>' +
          '<input type="range" id="' + i('r-eta') + '" min="0.02" max="1" step="0.01">' +
          '<span class="o" id="' + i('o-eta') + '">—</span></div>' +
        '<div class="rw"><span class="n">光束与 B 夹角 Θ_kB (°)</span>' +
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
      '</details>' +

      '<details class="adv" id="' + i('exp3') + '"><summary>功率–失谐设计图</summary>' +
        '<div style="margin-top:12px"><canvas id="' + i('c2') + '" height="360"></canvas></div>' +
        '<p class="cap">色块为 Ω_R，白色虚线为等 Ω_R，白色实线为等总误差。' +
        '竖线下方灰区为可用功率上限。十字为当前工作点。</p>' +
      '</details>' +

      '<details class="adv" id="' + i('exp4') + '"><summary>λ/4 波片扫描 + 实测标定</summary>' +
        '<div style="margin-top:12px"><canvas id="' + i('c3') + '" height="300"></canvas></div>' +
        '<div class="grid2" style="margin-top:10px">' +
          '<div><p class="lbl">波片扫描：θ(°) ↹ Ω_R/2π (MHz)</p>' +
            '<textarea id="' + i('d-qwp') + '" rows="3" placeholder="0↹0.05\n22.5↹1.24\n45↹1.73"></textarea></div>' +
          '<div><p class="lbl">功率扫描：P(mW) ↹ Ω_R/2π (MHz)</p>' +
            '<textarea id="' + i('d-pow') + '" rows="3" placeholder="20↹0.42\n40↹0.87\n80↹1.71"></textarea></div>' +
        '</div>' +
        '<div id="' + i('fitout') + '" style="margin-top:10px"></div>' +
        '<p class="cap">贴入实测数据后这里给出 θ₀/幅度比/等效束腰的拟合、RMS 残差与反推标定。</p>' +
      '</details>';
    },

    init: function (c) {
      var $ = c.$, compact = false, V = {}, ellOn = false;

      /* 单位在每次重绘开始时解析一次并缓存（规则③：热路径不反复解析） */
      var _uP = 'mW', _uW = 'µm', _uWx = 'µm', _uWy = 'µm';
      function syncUnits() {
        _uP = U.resolve('power', $('u-p').value);
        _uW = U.resolve('length', $('u-w').value);
        _uWx = U.resolve('length', $('u-wx').value);
        _uWy = U.resolve('length', $('u-wy').value);
      }
      function uP() { return _uP; }
      function uW() { return _uW; }
      function uWx() { return _uWx; }
      function uWy() { return _uWy; }

      function fill() {
        var s = S.state;
        $('v-D').value = +(U.fromSI('freq', s.raman.detuning_Hz, U.resolve('freq', $('u-D').value))).toPrecision(7);
        $('v-s3').value = s.beam.S3;
        $('v-a').value = s.beam.alpha_deg;
        $('r-k').value = s.beam.theta_kB_deg;
        $('r-b').value = s.beam.B_G;
        $('o-k').textContent = s.beam.theta_kB_deg + '°';
        $('o-b').textContent = (+s.beam.B_G).toFixed(2) + ' G';
        /* 光束几何：束腰/椭圆/透过率/上限（照 rabi 模块同一模式，共享同一份 Store） */
        $('v-p').value = +(U.fromSI('power', s.beam.P_laser, uP())).toPrecision(7);
        $('r-eta').value = s.beam.eta;
        $('o-eta').textContent = (+s.beam.eta).toFixed(2);
        $('v-pmax').value = +(s.limits.Pmax * 1e3).toPrecision(6);
        if (Math.abs(s.beam.wx - s.beam.wy) > 1e-12) ellOn = true;
        $('c-ell').checked = ellOn;
        $('ell-rows').style.display = ellOn ? '' : 'none';
        $('v-w').value = +(U.fromSI('length', S.derived.wg(), uW())).toPrecision(7);
        $('v-wx').value = +(U.fromSI('length', s.beam.wx, uWx())).toPrecision(7);
        $('v-wy').value = +(U.fromSI('length', s.beam.wy, uWy())).toPrecision(7);
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
        /* 耦合系数一律由 shared/physics.js 的 ramanOmega 反推，不在此另写公式（硬规则②）。
         * ramanOmega(d,P,wx,wy,D,geom) 含 geom=|S3|·sinΘ 因子，正是独立页 Kco 的 g。
         * ram(P_eff, g)：给有效功率（已含 η）与几何因子 g，返回 Ω_R/2π (Hz)。 */
        V.ram = function (P_eff, g) {
          return Math.abs(YB.ramanOmega(V.d, P_eff, s.beam.wx, s.beam.wy, V.Dh, g)) / (2 * Math.PI);
        };
        V.eta = s.beam.eta; V.Plas = s.beam.P_laser; V.D = s.raman.detuning_Hz;
        V.thk = s.beam.theta_kB_deg * D2R;
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

      /* 解析文本区数据：每行 "θ↹Ω" 或 "θ,Ω"，返回 [x,y][] */
      function parseXY(id) {
        var r = $(id).value.trim(); if (!r) return [];
        return r.split(/[\n;]/).map(function (ln) {
          var p = ln.trim().split(/[\s,\t↹]+/);
          if (p.length < 2) return null;
          var x = parseFloat(p[0]), y = parseFloat(p[1]);
          return (isFinite(x) && isFinite(y)) ? [x, y] : null;
        }).filter(Boolean);
      }

      /* ---- 功率–失谐设计图（折叠区 exp3） ---- */
      function drawC2(cs) {
        if (!$('exp3').open) return;
        var o = P.prep(c.id('c2')), g = o.g, W = o.W, H = o.H, M = { l: 62, r: 18, t: 16, b: 36 };
        var s = S.state, Dmn = 20e6, Dmx = 5e10, Pmn = 0.1, Pmx = 1e4;
        var fx = P.scaleLog(Dmn / 1e6, Dmx / 1e6, M.l, W - M.r), fy = P.scaleLog(Pmn, Pmx, H - M.b, M.t);
        var pw = W - M.l - M.r, ph = H - M.t - M.b, nx = 180, ny = 110;
        var b = P.buffer(nx, ny), dt = b.data, lo = 4, hi = 8;
        var k, i, j;
        for (j = 0; j < ny; j++) {
          var Pl = Math.pow(10, P.L10(Pmn) + ((ny - 1 - j) / (ny - 1)) * (P.L10(Pmx) - P.L10(Pmn))) * 1e-3;
          for (i = 0; i < nx; i++) {
            var D = Math.pow(10, P.L10(Dmn) + i / (nx - 1) * (P.L10(Dmx) - P.L10(Dmn)));
            var Om = Math.abs(YB.ramanOmega(V.d, s.beam.eta * Pl, s.beam.wx, s.beam.wy, D, V.geom)) / (2 * Math.PI);
            var t = (P.L10(Om) - lo) / (hi - lo);
            t = t < 0 ? 0 : t > 1 ? 1 : t; var q = (t * 255 | 0) * 3;
            var k2 = (j * nx + i) * 4;
            dt[k2] = P.PLASMA[q]; dt[k2 + 1] = P.PLASMA[q + 1]; dt[k2 + 2] = P.PLASMA[q + 2]; dt[k2 + 3] = 255;
          } }
        P.blit(g, nx, ny, M.l, M.t, pw, ph);
        P.clip(g, M, W, H, function () {
          var nm = { 10000: '10 kHz', 100000: '100 kHz', 1000000: '1 MHz', 10000000: '10 MHz', 100000000: '100 MHz' };
          [1e4, 1e5, 1e6, 1e7, 1e8].forEach(function (Om) {
            var pts = [];
            for (var i2 = 0; i2 <= 160; i2++) {
              var D2 = Math.pow(10, P.L10(Dmn) + i2 / 160 * (P.L10(Dmx) - P.L10(Dmn)));
              /* 反推等 Ω_R 线所需功率：Ω = K·d²·η·P → P = Ω/(K·d²·η)。
                 K·d²·η 由 ram(η 有效功率) 给出（不再单独写 Kco 公式）。 */
              var Keff = Math.abs(YB.ramanOmega(V.d, s.beam.eta, s.beam.wx, s.beam.wy, D2, V.geom)) / (2 * Math.PI);
              var Pw = Keff > 0 ? Om / Keff * 1e3 : 0;
              pts.push((Pw < Pmn * 0.4 || Pw > Pmx * 2.5) ? null : [fx(D2 / 1e6), fy(Pw)]);
            }
            g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1.3; g.setLineDash([5, 4]);
            g.beginPath(); var pen = false;
            pts.forEach(function (p) { if (!p) { pen = false; return; } pen ? g.lineTo(p[0], p[1]) : (g.moveTo(p[0], p[1]), pen = true); });
            g.stroke(); g.setLineDash([]);
            var lb = pts.filter(function (p) { return p && p[0] > M.l + 40 && p[0] < W - M.r - 30 && p[1] > M.t + 16 && p[1] < H - M.b - 8; });
            if (lb.length) { var pp = lb[Math.floor(lb.length * 0.7)], txt = nm[Om];
              g.font = '600 10px ui-monospace,Menlo,monospace'; var tw = g.measureText(txt).width;
              g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(pp[0] - tw / 2 - 3, pp[1] - 14, tw + 6, 13);
              g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText(txt, pp[0], pp[1] - 2); }
          });
          var ym = fy(s.limits.Pmax * 1e3);
          if (ym > M.t && ym < H - M.b) {
            g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(M.l, M.t, pw, ym - M.t);
            g.strokeStyle = P.color('--bad'); g.lineWidth = 1.6; g.beginPath();
            g.moveTo(M.l, ym); g.lineTo(W - M.r, ym); g.stroke();
            g.fillStyle = '#fff'; g.font = '600 10px ui-monospace,Menlo,monospace';
            g.textAlign = 'left'; g.textBaseline = 'bottom'; g.fillText('可用功率上限', M.l + 8, ym - 4); }
          if (V.D > Dmn && V.D < Dmx && V.Plas * 1e3 > Pmn && V.Plas * 1e3 < Pmx) {
            var x = fx(V.D / 1e6), y = fy(V.Plas * 1e3);
            g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 6, 0, 6.2832); g.stroke();
            g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 2.2, 0, 6.2832); g.fill(); }
        });
        var c2f = P.color('--fg2');
        g.font = '10px ui-monospace,Menlo,monospace'; g.fillStyle = c2f;
        P.ticksLog(Dmn / 1e6, Dmx / 1e6).forEach(function (t) { if (!t.major) return; var x = fx(t.v);
          if (x < M.l || x > W - M.r) return; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText(P.fmt(t.v), x, H - M.b + 5); });
        P.ticksLog(Pmn, Pmx).forEach(function (t) { if (!t.major) return; var y = fy(t.v);
          if (y < M.t || y > H - M.b) return; g.textAlign = 'right'; g.textBaseline = 'middle'; g.fillText(P.fmt(t.v), M.l - 6, y); });
        g.strokeStyle = P.color('--line'); g.lineWidth = 1; g.strokeRect(M.l + 0.5, M.t + 0.5, pw - 1, ph - 1);
        g.fillStyle = c2f; g.font = '11px ui-monospace,Menlo,monospace';
        g.textAlign = 'center'; g.textBaseline = 'top';
        g.fillText('失谐 Δ/2π (MHz，蓝失谐)', (M.l + W - M.r) / 2, H - 14);
        g.save(); g.translate(11, (M.t + H - M.b) / 2); g.rotate(-Math.PI / 2);
        g.textBaseline = 'top'; g.fillText('激光输出功率 (mW)', 0, 0); g.restore();
      }

      /* ---- λ/4 波片扫描图（折叠区 exp4） ---- */
      function drawC3() {
        if (!$('exp4').open) return;
        var o = P.prep(c.id('c3')), g = o.g, W = o.W, H = o.H, M = { l: 62, r: 18, t: 16, b: 36 };
        var s = S.state;
        var base = V.ram(s.beam.eta * s.beam.P_laser, Math.sin(V.thk)) / 1e6;
        var data = parseXY('d-qwp'), top = base * (1 + 0.05);
        data.forEach(function (p) { top = Math.max(top, p[1]); });
        top = top > 0 ? top * 1.15 : 1;
        var fx = P.scaleLin(0, 180, M.l, W - M.r), fy = P.scaleLin(0, top, H - M.b, M.t);
        P.axes(g, M, W, H, fx, fy, P.ticksLin(0, 180, 6), P.ticksLin(0, top, 5),
               'λ/4 波片角度 θ (°)', 'Ω_R/2π (MHz)');
        var acc = P.color('--accent'), bad = P.color('--bad');
        P.clip(g, M, W, H, function () {
          var hi = [], lo = [], i, v, t0 = 0;
          /* 不确定度控件（r-sw/r-sp/r-sd/r-si）待 3b 或后续引入，本轮用固定 ±5% 误差带 */
          for (i = 0; i <= 180; i++) { v = base * Math.abs(Math.sin(2 * (i - t0) * Math.PI / 180));
            hi.push([fx(i), fy(v * 1.05)]); lo.push([fx(i), fy(v * 0.95)]); }
          g.fillStyle = acc; g.globalAlpha = 0.16; g.beginPath();
          hi.forEach(function (p, k) { k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); });
          for (i = lo.length - 1; i >= 0; i--) g.lineTo(lo[i][0], lo[i][1]);
          g.closePath(); g.fill(); g.globalAlpha = 1;
          g.strokeStyle = acc; g.lineWidth = 2; g.beginPath();
          for (i = 0; i <= 180; i++) { v = base * Math.abs(Math.sin(2 * (i - t0) * Math.PI / 180));
            i ? g.lineTo(fx(i), fy(v)) : g.moveTo(fx(i), fy(v)); }
          g.stroke();
          data.forEach(function (p) { g.fillStyle = bad; g.beginPath(); g.arc(fx(p[0]), fy(p[1]), 3.5, 0, 6.2832); g.fill(); });
        });
      }

      /* ---- 实测数据拟合（折叠区 exp4） ---- */
      function doFits() {
        if (!$('exp4').open) return;
        var s = S.state, out = [], dp = parseXY('d-pow');
        if (dp.length >= 2) {
          var sxy = 0, sxx = 0; dp.forEach(function (p) { sxy += p[0] * p[1]; sxx += p[0] * p[0]; });
          var slope = sxx > 0 ? sxy / sxx : 0;
          /* 理论 MHz/mW：1 mW 激光（有效 η·1e-3 W）对应的 Ω_R/2π。
             注意独立页的 K1 是 /1e9（其 d 因 v-d 缺失而为 0，理论本就无意义）；
             本模块读真实 V.d，须 /1e6 得 MHz/mW 才能与实测斜率同量纲。 */
          var K1 = V.ram(s.beam.eta * 1e-3, Math.abs(V.geom)) / 1e6;
          var ratio = K1 > 0 ? slope / K1 : 0, weff = ratio > 0 ? Math.sqrt(s.beam.wx * s.beam.wy / ratio) : 0;
          var r2 = 0; dp.forEach(function (p) { var e = slope * p[0] - p[1]; r2 += e * e; });
          var rms = Math.sqrt(r2 / dp.length), mean = dp.reduce(function (a, p) { return a + p[1]; }, 0) / dp.length;
          out.push('<b>功率扫描</b>（' + dp.length + ' 点）　实测斜率 ' + slope.toFixed(4) + ' MHz/mW，理论 ' + K1.toFixed(4)
            + '，<b>幅度比 ' + ratio.toFixed(3) + '</b>　RMS 残差 ' + rms.toFixed(4) + ' MHz（' + (mean > 0 ? (rms / mean * 100).toFixed(1) : '—')
            + '%）<br>反推等效束腰 <b>' + (weff * 1e6).toFixed(1) + ' µm</b>，当前设定 '
            + Math.sqrt(s.beam.wx * s.beam.wy * 1e12).toFixed(1) + ' µm（几何平均）');
        }
        var dq = parseXY('d-qwp');
        if (dq.length >= 3) {
          var best = null;
          for (var t0 = -45; t0 <= 45; t0 += 0.25) {
            var sn = 0, sd = 0;
            dq.forEach(function (p) { var m = Math.abs(Math.sin(2 * (p[0] - t0) * Math.PI / 180)); sn += m * p[1]; sd += m * m; });
            var A = sd > 0 ? sn / sd : 0, r = 0;
            dq.forEach(function (p) { var e = A * Math.abs(Math.sin(2 * (p[0] - t0) * Math.PI / 180)) - p[1]; r += e * e; });
            if (!best || r < best.r) best = { t0: t0, A: A, r: r };
          }
          var rms2 = Math.sqrt(best.r / dq.length);
          var Ath = V.ram(s.beam.eta * s.beam.P_laser, Math.sin(V.thk)) / 1e6;
          var rel = best.A > 0 ? rms2 / best.A * 100 : 0;
          out.push('<b>波片扫描</b>（' + dq.length + ' 点）　拟合零点 <b>θ₀ = ' + best.t0.toFixed(1) + '°</b>，峰值 '
            + best.A.toFixed(3) + ' MHz，理论峰值 ' + Ath.toFixed(3) + ' MHz，<b>幅度比 '
            + (Ath > 0 ? (best.A / Ath).toFixed(3) : '—') + '</b>　RMS 残差 ' + rms2.toFixed(4) + ' MHz（' + rel.toFixed(1) + '%）<br>'
            + '<span style="color:var(--fg2)">残差 &gt;5% → 形状不符，查偏振或几何；残差小但幅度比偏离 1 → 查光斑与功率标定。</span>');
        }
        $('fitout').innerHTML = out.length
          ? '<div class="note g" style="margin:0">' + out.join('<br><br>') + '</div>'
          : '<p class="cap" style="margin:0">贴入数据后这里给出拟合、残差与反推标定。</p>';
      }

      var sched = new P.Scheduler(
        function () { compute(); paint(); drawLevel(); drawC1(true); drawC2(true); },
        function () { P.measure([c.id('c1'), c.id('c2'), c.id('c3')]); compute(); paint(); drawLevel(); drawC1(false); drawC2(false); drawC3(); doFits(); }, 170);

      /* ---- 事件 ---- */
      function push() {
        var s = S.state, patch = {};
        var Dv = U.toSI('freq', parseFloat($('v-D').value) || 0, U.resolve('freq', $('u-D').value));
        var s3 = Math.max(0, Math.min(1, parseFloat($('v-s3').value) || 0));
        var a = parseFloat($('v-a').value) || 0;
        var k = parseFloat($('r-k').value), b = parseFloat($('r-b').value);
        if (Dv !== s.raman.detuning_Hz) patch['raman.detuning_Hz'] = Dv;
        if (s3 !== s.beam.S3) patch['beam.S3'] = s3;
        if (a !== s.beam.alpha_deg) patch['beam.alpha_deg'] = a;
        if (k !== s.beam.theta_kB_deg) patch['beam.theta_kB_deg'] = k;
        if (b !== s.beam.B_G) patch['beam.B_G'] = b;
        /* 光束几何：功率 / 束腰（含椭圆解绑）/ 透过率 / 上限 */
        var Pv = U.toSI('power', parseFloat($('v-p').value) || 0, uP());
        if (Pv !== s.beam.P_laser) patch['beam.P_laser'] = Pv;
        if (ellOn) {
          var wx = U.toSI('length', parseFloat($('v-wx').value) || 0, uWx());
          var wy = U.toSI('length', parseFloat($('v-wy').value) || 0, uWy());
          if (wx > 0 && wx !== s.beam.wx) patch['beam.wx'] = wx;
          if (wy > 0 && wy !== s.beam.wy) patch['beam.wy'] = wy;
        } else {
          var wv = U.toSI('length', parseFloat($('v-w').value) || 0, uW());
          if (wv > 0 && Math.abs(wv - S.derived.wg()) > 1e-15) {
            patch['beam.wx'] = wv; patch['beam.wy'] = wv;
          }
        }
        var ev = parseFloat($('r-eta').value);
        if (ev !== s.beam.eta) patch['beam.eta'] = ev;
        $('o-eta').textContent = ev.toFixed(2);
        var pmax = (parseFloat($('v-pmax').value) || 1) * 1e-3;
        if (pmax !== s.limits.Pmax) patch['limits.Pmax'] = pmax;
        $('o-k').textContent = k + '°'; $('o-b').textContent = b.toFixed(2) + ' G';
        if (Object.keys(patch).length) c.set(patch);
        sched.tick();
      }
      ['v-D', 'v-s3', 'v-a', 'v-p', 'v-w', 'v-wx', 'v-wy'].forEach(function (k) { $(k).addEventListener('input', push); });
      ['r-k', 'r-b', 'r-eta'].forEach(function (k) { $(k).addEventListener('input', push); });
      $('u-D').addEventListener('change', function () { fill(); sched.flush(); });
      ['u-p', 'u-w', 'u-wx', 'u-wy'].forEach(function (k) {
        $(k).addEventListener('change', function () { syncUnits(); fill(); sched.flush(); }); });
      $('c-ell').addEventListener('change', function () {
        ellOn = $('c-ell').checked;
        if (!ellOn) {
          var s0 = S.state, wg = S.derived.wg();
          if (Math.abs(s0.beam.wx - wg) > 1e-12 || Math.abs(s0.beam.wy - wg) > 1e-12)
            c.set({ 'beam.wx': wg, 'beam.wy': wg });
        }
        fill(); sched.flush();
      });
      $('v-pmax').addEventListener('input', push);
      $('c-comp').addEventListener('change', function () { sched.flush(); });
      c.container.querySelectorAll('[data-d]').forEach(function (b) {
        b.onclick = function () {
          c.set({ 'raman.detuning_Hz': parseFloat(b.dataset.d) }); fill(); sched.flush(); };
      });
      ['exp1', 'exp2', 'exp3', 'exp4'].forEach(function (k) {
        $(k).addEventListener('toggle', function () { P.measure([c.id('c1'), c.id('c2'), c.id('c3')]); sched.flush(); }); });
      ['d-qwp', 'd-pow'].forEach(function (k) {
        $(k).addEventListener('input', function () { sched.flush(); }); });

      syncUnits(); fill(); P.measure([c.id('c1'), c.id('c2'), c.id('c3')]); sched.flush();

      return {
        update: function () { fill(); sched.flush(); },
        setCompact: function (on) {
          if (on === compact) return;
          compact = on;
          if (on) { $('exp1').open = false; $('exp2').open = false;
            $('exp3').open = false; $('exp4').open = false; }
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
