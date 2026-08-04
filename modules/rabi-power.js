/* modules/rabi-power.js — 单光子 Rabi ↔ 功率
 *
 * 核心视图：结论条 + 单点换算 + P–Ω 曲线
 * 折叠区：  等高线图 / 对照表 / 实验上限
 *
 * 一律从 Store 读取跃迁与光束，派生量现算（见 shell/store.js 的硬规则）。
 * 绘图使用 shared/plot.js，勿在此文件直接调 getComputedStyle 或读 clientWidth。
 */
(function () {
  'use strict';

  var P = window.YBP, S = window.YBStore, U = window.YBU;

  window.YBM.register({
    id: 'rabi-power',
    title: 'Rabi–功率',
    subtitle: '单光子共振  f_R ∝ √P',
    reads: ['transition.*', 'beam.wx', 'beam.wy', 'beam.eta', 'beam.P_laser', 'limits.*'],
    writes: ['beam.P_laser', 'beam.wx', 'beam.wy', 'beam.eta'],

    template: function (c) {
      var i = c.id;
      return '' +
      '<div class="res">' +
        '<div><p class="k">Rabi 频率 f_R</p><p class="v" id="' + i('R-f') + '">—</p>' +
          '<p class="u" id="' + i('R-fu') + '">—</p></div>' +
        '<div><p class="k">所需功率 P</p><p class="v" id="' + i('R-p') + '">—</p>' +
          '<p class="u" id="' + i('R-pu') + '">—</p></div>' +
        '<div><p class="k">峰值光强 I₀</p><p class="v" id="' + i('R-i') + '">—</p><p class="u">W/m²</p></div>' +
        '<div><p class="k">有效矩阵元 d_cyc</p><p class="v" id="' + i('R-d') + '">—</p><p class="u">e·a₀</p></div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="segs">' +
          '<span style="font-size:13px;color:var(--fg2)">求解</span>' +
          '<button class="seg mini" data-on="1" id="' + i('s-f') + '">由功率求 Rabi</button>' +
          '<button class="seg mini" id="' + i('s-p') + '">由 Rabi 求功率</button>' +
          '<span style="flex:1"></span>' +
          '<span class="cap" id="' + i('src') + '"></span>' +
        '</div>' +
        '<div class="grid3">' +
          '<div><p class="lbl">P 激光输出功率</p><div class="iu">' +
            '<input type="number" id="' + i('v-p') + '" step="1">' +
            '<select id="' + i('u-p') + '">' + U.optionsHTML('power') + '</select></div></div>' +
          '<div><p class="lbl">f_R = Ω/2π</p><div class="iu">' +
            '<input type="number" id="' + i('v-f') + '" step="0.1" readonly>' +
            '<select id="' + i('u-f') + '">' + U.optionsHTML('freq') + '</select></div></div>' +
          '<div><p class="lbl">w 束腰 (1/e² 强度半径)</p><div class="iu">' +
            '<input type="number" id="' + i('v-w') + '" step="1">' +
            '<select id="' + i('u-w') + '">' + U.optionsHTML('length') + '</select></div></div>' +
        '</div>' +
        '<div class="rw" style="margin:12px 0 0"><span class="n">光路透过率 η</span>' +
          '<input type="range" id="' + i('r-eta') + '" min="0.02" max="1" step="0.01">' +
          '<span class="o" id="' + i('o-eta') + '">—</span></div>' +
      '</div>' +

      '<div class="card" style="padding:12px">' +
        '<div class="chead"><span class="t">Rabi 频率 vs 功率</span>' +
          '<span class="segs" style="margin:0">' +
            '<button class="seg mini" data-on="1" id="' + i('ax-lin') + '">线性</button>' +
            '<button class="seg mini" id="' + i('ax-log') + '">双对数</button>' +
          '</span></div>' +
        '<canvas id="' + i('c1') + '" height="300"></canvas>' +
        '<p class="cap">灰区超出模型有效上限。曲线族为当前束腰的 ×0.25…×4。</p>' +
      '</div>' +

      '<details class="adv" id="' + i('exp1') + '"><summary>功率–束腰等高线</summary>' +
        '<div style="margin-top:12px"><canvas id="' + i('c2') + '" height="330"></canvas></div>' +
        '<p class="cap">横轴止于可用最大功率，纵轴下限为衍射极限。白色虚线为等 Rabi 频率线。</p>' +
      '</details>' +

      '<details class="adv" id="' + i('exp2') + '"><summary>对照表与导出</summary>' +
        '<div id="' + i('tbl') + '" style="margin-top:8px"></div>' +
        '<div class="segs" style="margin:10px 0 0">' +
          '<button class="seg mini" id="' + i('btn-csv') + '">导出 CSV</button>' +
          '<button class="seg mini" id="' + i('btn-copy') + '">复制参数行</button></div>' +
      '</details>' +

      '<details class="adv" id="' + i('exp3') + '"><summary>实验可达范围</summary>' +
        '<div class="grid3" style="margin-top:12px">' +
          '<div><p class="lbl">可用最大功率 (mW)</p><input type="number" id="' + i('v-pmax') + '" step="10"></div>' +
          '<div><p class="lbl">模型有效 Rabi 上限 (MHz)</p><input type="number" id="' + i('v-fmax') + '" step="1"></div>' +
          '<div><p class="lbl">束腰衍射极限 (µm)</p><input type="number" id="' + i('v-wmin') + '" step="0.1"></div>' +
        '</div>' +
        '<p class="cap">Rabi 上限的物理含义：单支路两能级模型要求 Ω 远小于激发态塞曼劈裂' +
        '（³P₁ 约 1.40 MHz/G）。默认 20 MHz 对应约 15 G 偏置场，场更小请调低。</p>' +
      '</details>';
    },

    init: function (c) {
      var $ = c.$, tgt = 'f', axmode = 'lin', compact = false, sched;
      var st = S.state;

      /* ---- 单位句柄 ---- */
      /* 单位在每次重绘开始时解析一次并缓存 —— 绘图循环内每帧曾调用上千次。
       * 与 shared/plot.js 的主题色缓存同理：热路径里不做重复解析。 */
      var _uP = 'mW', _uF = 'MHz', _uW = 'µm';
      function syncUnits() {
        _uP = U.resolve('power', $('u-p').value);
        _uF = U.resolve('freq', $('u-f').value);
        _uW = U.resolve('length', $('u-w').value);
      }
      function uP() { return _uP; }
      function uF() { return _uF; }
      function uW() { return _uW; }

      function fill() {
        var s = S.state;
        $('v-p').value = +(U.fromSI('power', s.beam.P_laser, uP())).toPrecision(7);
        $('v-w').value = +(U.fromSI('length', S.derived.wg(), uW())).toPrecision(7);
        $('r-eta').value = s.beam.eta;
        $('v-pmax').value = +(s.limits.Pmax * 1e3).toPrecision(6);
        $('v-fmax').value = +(s.limits.fRmax / 1e6).toPrecision(6);
        $('v-wmin').value = +(s.limits.wmin * 1e6).toPrecision(6);
        var vd = S.derived.dCycValid();
        $('src').innerHTML = vd.ok
          ? S.state.transition.label + '　d_red = ' +
            S.derived.d_red_au().toFixed(6) + ' e·a₀ (由 Γ 反解)'
          : '<span style="color:var(--bad)">⚠ ' + vd.reason + '</span>';
      }

      /* ---- 计算 ---- */
      var V = {};
      function compute() {
        var s = S.state, D = S.derived;
        V.valid = D.dCycValid();
        V.d = D.d_cyc_SI();
        V.C = window.YB.Ccoef(V.d);
        V.wg = D.wg();
        V.Pat = D.P_atom();
        if (tgt === 'f') {
          V.f = window.YB.rabiHz(V.d, V.Pat, s.beam.wx, s.beam.wy);
          $('v-f').value = +(U.fromSI('freq', V.f, uF())).toPrecision(7);
        } else {
          V.f = U.toSI('freq', parseFloat($('v-f').value) || 0, uF());
          V.Pat = window.YB.powerW(V.d, V.f, s.beam.wx, s.beam.wy);
          var Plas = s.beam.eta > 0 ? V.Pat / s.beam.eta : 0;
          $('v-p').value = +(U.fromSI('power', Plas, uP())).toPrecision(7);
          if (Math.abs(Plas - s.beam.P_laser) / (s.beam.P_laser || 1) > 1e-9)
            c.set({ 'beam.P_laser': Plas });
        }
        V.I = D.I0(); V.E = D.E0();
      }

      function paint() {
        var s = S.state;
        if (!V.valid.ok) {
          ['R-f', 'R-p', 'R-i', 'R-d'].forEach(function (k) {
            $(k).textContent = '—'; $(k).className = 'v'; });
          $('R-fu').textContent = '不适用';
          $('R-pu').textContent = ''; $('R-d').textContent = '—';
          $('src').innerHTML = '<span style="color:var(--bad)">⚠ ' + V.valid.reason + '</span>';
          return;
        }
        $('R-f').textContent = +(U.fromSI('freq', V.f, uF())).toPrecision(6);
        $('R-fu').textContent = uF() + '　π 脉冲 ' +
          (V.f > 0 ? U.auto('time', 1 / (2 * V.f)) : '—');
        $('R-p').textContent = +(U.fromSI('power', s.beam.P_laser, uP())).toPrecision(6);
        $('R-pu').textContent = uP() + '　到达原子 ' + U.auto('power', V.Pat);
        $('R-i').textContent = V.I.toExponential(3);
        $('R-d').textContent = (V.d / window.YBC.SI.ea0).toFixed(6);
        $('R-f').className = 'v' + (V.f > s.limits.fRmax ? ' bad' : '');
        $('R-p').className = 'v' + (s.beam.P_laser > s.limits.Pmax ? ' bad' : '');
      }

      /* ---- 绘图 ---- */
      function drawC1(cs) {
        if (!V.valid || !V.valid.ok) { P.prep(c.id('c1')); return; }
        var o = P.prep(c.id('c1')), g = o.g, W = o.W, H = o.H, M = { l: 60, r: 16, t: 14, b: 34 };
        var s = S.state, lg = (axmode === 'log');
        var Pmx = U.fromSI('power', s.limits.Pmax, uP());
        var Pmn = lg ? Math.max(Pmx / 1e4, 1e-9) : 0;
        var Fcap = U.fromSI('freq', s.limits.fRmax, uF());
        var wlo = Math.max(s.limits.wmin, V.wg * 0.25), whi = V.wg * 4;
        var top = Math.min(U.fromSI('freq', window.YB.rabiHz(V.d, s.limits.Pmax * s.beam.eta, wlo, wlo), uF()),
                           Fcap * 1.25) || 1;
        var fy, ty, Fmn;
        if (lg) { top = Math.pow(10, Math.ceil(P.L10(top))); Fmn = top / 1e5;
          fy = P.scaleLog(Fmn, top, H - M.b, M.t); ty = P.ticksLog(Fmn, top); }
        else { top *= 1.05; fy = P.scaleLin(0, top, H - M.b, M.t); ty = P.ticksLin(0, top, 5); }
        var fx = lg ? P.scaleLog(Pmn, Pmx, M.l, W - M.r) : P.scaleLin(0, Pmx, M.l, W - M.r);
        var tx = lg ? P.ticksLog(Pmn, Pmx) : P.ticksLin(0, Pmx, 5);
        P.axes(g, M, W, H, fx, fy, tx, ty, '激光功率 (' + uP() + ')', 'f_R (' + uF() + ')');
        P.clip(g, M, W, H, function () {
          var ycap = fy(Fcap);
          if (ycap > M.t && ycap < H - M.b) P.shade(g, M.l, M.t, W - M.l - M.r, ycap - M.t);
          for (var k = 0; k < 5; k++) {
            var wv = wlo * Math.pow(whi / wlo, k / 4);
            var cur = Math.abs(wv - V.wg) / V.wg < 0.02;
            g.strokeStyle = P.cmap('turbo', k / 4); g.lineWidth = cur ? 2.6 : 1.6;
            g.beginPath(); var on = false;
            for (var q = 0; q <= 80; q++) {
              var Pv = (lg ? Math.pow(10, P.L10(Pmn) + q / 80 * (P.L10(Pmx) - P.L10(Pmn))) : q / 80 * Pmx);
              var fv = U.fromSI('freq', window.YB.rabiHz(V.d, U.toSI('power', Pv, uP()) * s.beam.eta, wv, wv), uF());
              if (fv > Fcap) break;
              var X = fx(Pv), Y = fy(fv);
              if (on) g.lineTo(X, Y); else { g.moveTo(X, Y); on = true; }
            }
            if (on) g.stroke();
            if (cs) continue;
            var Pl = lg ? Pmx * 0.5 : Pmx * 0.7;
            var fl = U.fromSI('freq', window.YB.rabiHz(V.d, U.toSI('power', Pl, uP()) * s.beam.eta, wv, wv), uF());
            var yl = fy(fl);
            if (fl <= Fcap && yl > M.t + 8 && yl < H - M.b - 4) {
              g.fillStyle = P.cmap('turbo', k / 4);
              g.font = (cur ? '600 ' : '') + '10px ui-monospace,Menlo,monospace';
              g.textAlign = 'right'; g.textBaseline = 'bottom';
              g.fillText(U.auto('length', wv, 3), fx(Pl), yl - 3);
            }
          }
          var xp = fx(U.fromSI('power', s.beam.P_laser, uP())), yp = fy(U.fromSI('freq', V.f, uF()));
          if (xp > M.l && xp < W - M.r && yp > M.t && yp < H - M.b) {
            g.fillStyle = P.color('--fg'); g.beginPath(); g.arc(xp, yp, 4.5, 0, 6.2832); g.fill();
            g.strokeStyle = P.color('--card'); g.lineWidth = 1.6; g.stroke();
          }
        });
        P.stamp(g, S.state.transition.label + '  d=' + (V.d / window.YBC.SI.ea0).toFixed(4) + ' ea₀',
                W - M.r - 6, M.t + 4);
      }

      function drawC2(cs) {
        if (!$('exp1').open) return;
        if (!V.valid || !V.valid.ok) { P.prep(c.id('c2')); return; }
        var o = P.prep(c.id('c2')), g = o.g, W = o.W, H = o.H, M = { l: 60, r: 64, t: 14, b: 34 };
        var s = S.state, Pmx = s.limits.Pmax, wlo = s.limits.wmin, whi = Math.max(V.wg * 3, wlo * 4);
        var fx = P.scaleLin(0, U.fromSI('power', Pmx, uP()), M.l, W - M.r);
        var fy = P.scaleLin(U.fromSI('length', wlo, uW()), U.fromSI('length', whi, uW()), H - M.b, M.t);
        var pw = Math.round(W - M.l - M.r), ph = Math.round(H - M.t - M.b);
        var nx = cs ? 72 : 190, ny = cs ? 48 : 126;
        var b = P.buffer(nx, ny), dt = b.data;
        var sq = new Float64Array(nx), iw = new Float64Array(ny), i, j;
        for (i = 0; i < nx; i++) sq[i] = V.C * Math.sqrt(i / (nx - 1) * Pmx * s.beam.eta);
        for (j = 0; j < ny; j++) iw[j] = 1 / (wlo + ((ny - 1 - j) / (ny - 1)) * (whi - wlo));
        var Rmax = Math.min(V.C * Math.sqrt(Pmx * s.beam.eta) / wlo, s.limits.fRmax) || 1;
        var sc = 255 / Rmax, k = 0, T = P.TURBO;
        for (j = 0; j < ny; j++) { var wj = iw[j];
          for (i = 0; i < nx; i++, k += 4) {
            var R = sq[i] * wj;
            if (R > s.limits.fRmax) { dt[k] = dt[k+1] = dt[k+2] = 128; dt[k+3] = 110; }
            else { var q = (R * sc | 0); if (q > 255) q = 255; q *= 3;
              dt[k] = T[q]; dt[k+1] = T[q+1]; dt[k+2] = T[q+2]; dt[k+3] = 255; }
          } }
        P.blit(g, nx, ny, M.l, M.t, pw, ph);
        P.clip(g, M, W, H, function () {
          var step = Math.pow(10, Math.floor(P.L10(Rmax / 5))), pick = step;
          [1, 2, 5, 10].forEach(function (m) { if (Rmax / (step * m) > 6) pick = step * m; });
          var n = 0;
          for (var Rv = pick; Rv < Rmax * 0.999 && n < 10; Rv += pick, n++) {
            var pts = [];
            for (var t = 0; t <= 90; t++) {
              var wv = wlo + t / 90 * (whi - wlo);
              var Pw = window.YB.powerW(V.d, Rv, wv, wv) / s.beam.eta;
              pts.push((Pw < 0 || Pw > Pmx) ? null :
                [fx(U.fromSI('power', Pw, uP())), fy(U.fromSI('length', wv, uW()))]);
            }
            g.strokeStyle = 'rgba(255,255,255,.92)'; g.lineWidth = 1.2; g.setLineDash([6, 4]);
            g.beginPath(); var on = false;
            pts.forEach(function (p) { if (!p) { on = false; return; }
              if (on) g.lineTo(p[0], p[1]); else { g.moveTo(p[0], p[1]); on = true; } });
            g.stroke(); g.setLineDash([]);
            if (cs) continue;
            var lb = pts.filter(function (p) { return p && p[0] > M.l + 34 && p[0] < W - M.r - 34 &&
              p[1] > M.t + 12 && p[1] < H - M.b - 10; });
            if (lb.length) { var p2 = lb[lb.length >> 1], txt = U.auto('freq', Rv, 3);
              g.font = '600 10px ui-monospace,Menlo,monospace';
              var tw = g.measureText(txt).width;
              g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(p2[0] - tw / 2 - 3, p2[1] - 7, tw + 6, 14);
              g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
              g.fillText(txt, p2[0], p2[1]); }
          }
          var xp = fx(U.fromSI('power', s.beam.P_laser, uP())), yp = fy(U.fromSI('length', V.wg, uW()));
          if (xp > M.l && xp < W - M.r && yp > M.t && yp < H - M.b) {
            g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(xp, yp, 6, 0, 6.2832); g.stroke();
            g.fillStyle = '#fff'; g.beginPath(); g.arc(xp, yp, 2.2, 0, 6.2832); g.fill(); }
        });
        var c2f = P.color('--fg2');
        g.font = '10px ui-monospace,Menlo,monospace'; g.fillStyle = c2f;
        g.textAlign = 'center'; g.textBaseline = 'top';
        P.ticksLin(0, U.fromSI('power', Pmx, uP()), 5).forEach(function (t) {
          g.fillText(P.fmt(t.v), fx(t.v), H - M.b + 5); });
        g.textAlign = 'right'; g.textBaseline = 'middle';
        P.ticksLin(U.fromSI('length', wlo, uW()), U.fromSI('length', whi, uW()), 5).forEach(function (t) {
          g.fillText(P.fmt(t.v), M.l - 6, fy(t.v)); });
        g.strokeStyle = P.color('--line'); g.lineWidth = 1; g.strokeRect(M.l + .5, M.t + .5, pw - 1, ph - 1);
        g.fillStyle = c2f; g.font = '11px ui-monospace,Menlo,monospace';
        g.textAlign = 'center'; g.textBaseline = 'top';
        g.fillText('功率 (' + uP() + ')', (M.l + W - M.r) / 2, H - 14);
        g.save(); g.translate(11, (M.t + H - M.b) / 2); g.rotate(-Math.PI / 2);
        g.textBaseline = 'top'; g.fillText('束腰 (' + uW() + ')', 0, 0); g.restore();
        P.colorbar(g, 'turbo', W - M.r + 12, M.t + 6, 13, ph - 12,
                   U.auto('freq', Rmax, 3), '0', 'f_R');
      }

      function buildTable() {
        if (!$('exp2').open) return;
        var s = S.state, rows = '<tr><th>P (' + uP() + ')</th><th style="text-align:right">f_R (' +
          uF() + ')</th><th style="text-align:right">I₀ (W/m²)</th></tr>';
        for (var t = 0; t <= 6; t++) {
          var Pw = s.limits.Pmax * Math.pow(10, (t - 6) * 0.5);
          var fv = window.YB.rabiHz(V.d, Pw * s.beam.eta, s.beam.wx, s.beam.wy);
          var ov = fv > s.limits.fRmax;
          rows += '<tr' + (ov ? ' style="opacity:.45"' : '') + '><td class="n">' +
            (+U.fromSI('power', Pw, uP()).toPrecision(4)) + '</td><td class="n">' +
            (+U.fromSI('freq', fv, uF()).toPrecision(5)) + (ov ? ' ⚠' : '') + '</td><td class="n">' +
            window.YB.intensity(Pw * s.beam.eta, s.beam.wx, s.beam.wy).toExponential(3) + '</td></tr>';
        }
        $('tbl').innerHTML = '<table>' + rows + '</table>';
      }

      /* ---- 调度 ---- */
      function coarse() { syncUnits(); compute(); paint(); drawC1(true); drawC2(true); }
      function fine()   { syncUnits(); compute(); paint(); drawC1(false); drawC2(false); buildTable(); }
      function measure() { P.measure([c.id('c1'), c.id('c2')]); }

      sched = new P.Scheduler(coarse, function () { measure(); fine(); }, 170);

      /* ---- 事件 ---- */
      function onInput() {
        var s = S.state, patch = {};
        var Pv = U.toSI('power', parseFloat($('v-p').value) || 0, uP());
        var wv = U.toSI('length', parseFloat($('v-w').value) || 0, uW());
        var ev = parseFloat($('r-eta').value);
        if (tgt === 'f' && Math.abs(Pv - s.beam.P_laser) > 1e-15) patch['beam.P_laser'] = Pv;
        if (wv > 0 && Math.abs(wv - S.derived.wg()) > 1e-15) { patch['beam.wx'] = wv; patch['beam.wy'] = wv; }
        if (ev !== s.beam.eta) patch['beam.eta'] = ev;
        $('o-eta').textContent = ev.toFixed(2);
        if (Object.keys(patch).length) c.set(patch);
        sched.tick();
      }
      ['v-p', 'v-f', 'v-w'].forEach(function (k) { $(k).addEventListener('input', onInput); });
      $('r-eta').addEventListener('input', onInput);
      ['u-p', 'u-f', 'u-w'].forEach(function (k) {
        $(k).addEventListener('change', function () { fill(); sched.flush(); }); });
      ['v-pmax', 'v-fmax', 'v-wmin'].forEach(function (k) {
        $(k).addEventListener('input', function () {
          c.set({ 'limits.Pmax': (parseFloat($('v-pmax').value) || 1) * 1e-3,
                  'limits.fRmax': (parseFloat($('v-fmax').value) || 1) * 1e6,
                  'limits.wmin': (parseFloat($('v-wmin').value) || 1) * 1e-6 });
          sched.tick(); }); });
      function setTgt(t) { tgt = t;
        $('s-f').dataset.on = t === 'f' ? '1' : '0';
        $('s-p').dataset.on = t === 'p' ? '1' : '0';
        $('v-f').readOnly = t === 'f'; $('v-p').readOnly = t === 'p';
        sched.flush(); }
      $('s-f').onclick = function () { setTgt('f'); };
      $('s-p').onclick = function () { setTgt('p'); };
      $('ax-lin').onclick = function () { axmode = 'lin';
        $('ax-lin').dataset.on = '1'; $('ax-log').dataset.on = '0'; sched.flush(); };
      $('ax-log').onclick = function () { axmode = 'log';
        $('ax-log').dataset.on = '1'; $('ax-lin').dataset.on = '0'; sched.flush(); };
      [ 'exp1', 'exp2' ].forEach(function (k) {
        $(k).addEventListener('toggle', function () { measure(); sched.flush(); }); });
      $('btn-csv').onclick = function () { exportCSV(); };
      $('btn-copy').onclick = function () {
        var t = S.state.transition.label + ' | d_cyc=' + (V.d / window.YBC.SI.ea0).toFixed(6) +
          ' ea₀ | w=' + U.auto('length', V.wg) + ' | P=' + U.auto('power', S.state.beam.P_laser) +
          ' | f_R=' + U.auto('freq', V.f) + ' | ' + window.YBV.info.short;
        if (navigator.clipboard) navigator.clipboard.writeText(t);
        $('btn-copy').textContent = '已复制';
        setTimeout(function () { $('btn-copy').textContent = '复制参数行'; }, 1400);
      };
      function exportCSV() {
        var s = S.state;
        var rows = ['# yb-toolkit rabi-power  ' + window.YBV.info.short,
          '# ' + window.YBURL.link(), '# ' + s.transition.label,
          '# d_cyc=' + (V.d / window.YBC.SI.ea0).toPrecision(8) + ' ea0, Gamma=' +
            (s.transition.Gamma_Hz / 1e3) + ' kHz, lambda=' + S.derived.lambda_nm().toFixed(6) + ' nm',
          '# w_x=' + (s.beam.wx * 1e6).toPrecision(6) + ' um, w_y=' + (s.beam.wy * 1e6).toPrecision(6) +
            ' um, eta=' + s.beam.eta,
          'P_laser_W,P_atom_W,f_R_Hz,I0_W_m2,within_limits'];
        for (var t = 0; t <= 200; t++) {
          var Pw = s.limits.Pmax * t / 200, Pa = Pw * s.beam.eta;
          var fv = window.YB.rabiHz(V.d, Pa, s.beam.wx, s.beam.wy);
          rows.push([Pw.toExponential(6), Pa.toExponential(6), fv.toExponential(6),
            window.YB.intensity(Pa, s.beam.wx, s.beam.wy).toExponential(6),
            fv <= s.limits.fRmax ? 1 : 0].join(','));
        }
        var b = new Blob([rows.join('\n')], { type: 'text/csv' }), a = document.createElement('a');
        a.href = URL.createObjectURL(b); a.download = 'rabi_power.csv'; a.click();
      }

      syncUnits(); fill(); measure(); sched.flush();

      return {
        update: function () { fill(); sched.flush(); },
        setCompact: function (on) {
          if (on === compact) return;
          compact = on;
          ['exp1', 'exp2', 'exp3'].forEach(function (k) { if (on) $(k).open = false; });
          $('c1').setAttribute('height', on ? '200' : '300');
          measure(); sched.flush();
        },
        /** 提示条里显示"本模块受影响后的结果" */
        impact: function () {
          compute();
          return 'f_R = ' + U.auto('freq', V.f) + '　d_cyc = ' +
                 (V.d / window.YBC.SI.ea0).toFixed(6) + ' e·a₀';
        },
        destroy: function () {}
      };
    }
  });
})();
