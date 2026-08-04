/* shared/plot.js — 画布工具箱
 *
 * 关键设计（v7 性能修复的沉淀，勿回退）：
 *  - 主题色启动读一次缓存，绝不在绘图循环里调 getComputedStyle
 *  - 画布尺寸只在 resize 时测量，绝不在每帧读 clientWidth
 *  - 离屏画布与 ImageData 全局复用，配色预生成 256 级查表
 *  - 调度器：快速通道（粗网格）+ 停手后精细通道；DOM 写入批量化
 * 违反以上任一条都会导致布局抖动，页面在连续输入时卡死。
 *
 * 全局暴露为 window.YBP
 */
(function (root) {
  'use strict';

  /* ---------- 主题色缓存 ---------- */
  var TH = {};
  var KEYS = ['--bg','--card','--soft','--fg','--fg2','--line','--accent','--grid','--bad','--ok','--warn'];
  function readTheme() {
    if (typeof document === 'undefined') return TH;
    var st = getComputedStyle(document.body);
    KEYS.forEach(function (k) { TH[k] = st.getPropertyValue(k).trim(); });
    return TH;
  }
  function color(k) { return TH[k] || '#888'; }

  /* ---------- 配色查表 ---------- */
  var TURBO = new Uint8Array(768), PLASMA = new Uint8Array(768), VIRIDIS = new Uint8Array(768);
  (function () {
    var PL = [[13,8,135],[84,2,163],[139,10,165],[185,50,137],[219,92,104],[244,136,73],[254,188,43],[240,249,33]];
    var VI = [[68,1,84],[59,82,139],[33,145,140],[94,201,98],[253,231,37]];
    function lerp(tab, t, out, i) {
      var s = t * (tab.length - 1), k = Math.min(tab.length - 2, Math.floor(s)), f = s - k;
      out[i]   = tab[k][0] + (tab[k+1][0] - tab[k][0]) * f | 0;
      out[i+1] = tab[k][1] + (tab[k+1][1] - tab[k][1]) * f | 0;
      out[i+2] = tab[k][2] + (tab[k+1][2] - tab[k][2]) * f | 0;
    }
    for (var i = 0; i < 256; i++) {
      var t = i / 255;
      var r = 34.61+t*(1172.33+t*(-10793.56+t*(33300.12+t*(-38394.49+t*14825.05))));
      var g = 23.31+t*(557.33+t*(1225.33+t*(-3574.96+t*(1073.77+t*707.56))));
      var b = 27.2+t*(3211.1+t*(-15327.97+t*(27814+t*(-22569.18+t*6838.66))));
      TURBO[i*3]   = r<0?0:r>255?255:r|0;
      TURBO[i*3+1] = g<0?0:g>255?255:g|0;
      TURBO[i*3+2] = b<0?0:b>255?255:b|0;
      lerp(PL, t, PLASMA, i*3);
      lerp(VI, t, VIRIDIS, i*3);
    }
  })();
  var MAPS = { turbo: TURBO, plasma: PLASMA, viridis: VIRIDIS };
  function cmapStr(name, t) {
    var m = MAPS[name] || TURBO, i = ((t < 0 ? 0 : t > 1 ? 1 : t) * 255 | 0) * 3;
    return 'rgb(' + m[i] + ',' + m[i+1] + ',' + m[i+2] + ')';
  }

  /* ---------- 画布几何缓存 ---------- */
  var CV = {};
  function measure(ids) {
    if (typeof document === 'undefined') return;
    ids.forEach(function (id) {
      var el = document.getElementById(id); if (!el) return;
      var dpr = root.devicePixelRatio || 1;
      var w = el.clientWidth || 760, h = parseInt(el.getAttribute('height'), 10) || 320;
      var pw = Math.round(w*dpr), ph = Math.round(h*dpr);
      if (!CV[id]) CV[id] = { el: el, ctx: el.getContext('2d') };
      if (CV[id].pw !== pw || CV[id].ph !== ph) {
        el.width = pw; el.height = ph; el.style.height = h + 'px';
        CV[id].pw = pw; CV[id].ph = ph;
      }
      CV[id].W = w; CV[id].H = h; CV[id].dpr = dpr;
    });
  }
  function prep(id) {
    var c = CV[id];
    if (!c) throw new Error('plot: canvas "' + id + '" 未 measure()');
    var g = c.ctx;
    g.setTransform(c.dpr,0,0,c.dpr,0,0); g.clearRect(0,0,c.W,c.H);
    return { g: g, W: c.W, H: c.H };
  }

  /* ---------- 离屏缓冲复用 ---------- */
  var OFF = null, OFFC = null, OFFIM = null, OFFK = '';
  function buffer(nx, ny) {
    if (!OFF) { OFF = document.createElement('canvas'); OFFC = OFF.getContext('2d'); }
    var k = nx + 'x' + ny;
    if (OFFK !== k) { OFF.width = nx; OFF.height = ny; OFFIM = OFFC.createImageData(nx, ny); OFFK = k; }
    return { canvas: OFF, ctx: OFFC, image: OFFIM, data: OFFIM.data };
  }
  function blit(g, nx, ny, dx, dy, dw, dh) {
    OFFC.putImageData(OFFIM, 0, 0);
    g.imageSmoothingEnabled = true;
    g.drawImage(OFF, 0, 0, nx, ny, dx, dy, dw, dh);
  }

  /* ---------- 坐标 ---------- */
  function L10(v) { return Math.log(v > 1e-300 ? v : 1e-300) / Math.LN10; }
  function scaleLog(a,b,p,q) { var l0=L10(a), k=(q-p)/((L10(b)-l0)||1);
    return function (v) { return p + (L10(v)-l0)*k; }; }
  function scaleLin(a,b,p,q) { var k=(q-p)/((b-a)||1);
    return function (v) { return p + (v-a)*k; }; }
  function ticksLog(a,b) {
    var o=[], e=Math.floor(L10(a)), hi=Math.ceil(L10(b));
    if (!isFinite(e) || !isFinite(hi) || hi-e > 40) return o;
    for (; e<=hi; e++) for (var m=0; m<3; m++) {
      var mm=[1,2,5][m], v=mm*Math.pow(10,e);
      if (v>=a*0.999 && v<=b*1.001) o.push({ v:v, major: mm===1 });
    }
    return o;
  }
  function ticksLin(a,b,n) { var o=[]; for (var i=0;i<=n;i++) o.push({v:a+i*(b-a)/n,major:true}); return o; }
  function fmt(v) {
    if (v === 0) return '0';
    var a = Math.abs(v);
    if (!isFinite(a)) return '—';
    if (a>=1e5 || a<1e-3) return v.toExponential(1);
    if (a>=1000) return parseFloat((v/1000).toPrecision(3)) + 'k';
    return '' + parseFloat(v.toPrecision(3));
  }

  /** 画网格、刻度、边框、轴标题。读写分离，无 getComputedStyle 调用 */
  function axes(g, M, W, H, fx, fy, tx, ty, xlabel, ylabel) {
    var cg = color('--grid'), c2 = color('--fg2'), i, t, x, y;
    g.font = '10px ui-monospace,Menlo,monospace';
    g.strokeStyle = cg;
    for (i=0;i<tx.length;i++) { t=tx[i]; x=fx(t.v); if (x<M.l-1||x>W-M.r+1) continue;
      g.globalAlpha = t.major?0.7:0.28; g.beginPath(); g.moveTo(x,M.t); g.lineTo(x,H-M.b); g.stroke(); }
    for (i=0;i<ty.length;i++) { t=ty[i]; y=fy(t.v); if (y<M.t-1||y>H-M.b+1) continue;
      g.globalAlpha = t.major?0.7:0.28; g.beginPath(); g.moveTo(M.l,y); g.lineTo(W-M.r,y); g.stroke(); }
    g.globalAlpha = 1; g.fillStyle = c2;
    g.textAlign='center'; g.textBaseline='top';
    for (i=0;i<tx.length;i++) { t=tx[i]; if(!t.major) continue; x=fx(t.v);
      if (x<M.l-1||x>W-M.r+1) continue; g.fillText(fmt(t.v), x, H-M.b+5); }
    g.textAlign='right'; g.textBaseline='middle';
    for (i=0;i<ty.length;i++) { t=ty[i]; if(!t.major) continue; y=fy(t.v);
      if (y<M.t-1||y>H-M.b+1) continue; g.fillText(fmt(t.v), M.l-6, y); }
    g.strokeStyle = color('--line'); g.lineWidth = 1;
    g.strokeRect(M.l+0.5, M.t+0.5, W-M.l-M.r-1, H-M.t-M.b-1);
    g.fillStyle = c2; g.font = '11px ui-monospace,Menlo,monospace';
    g.textAlign='center'; g.textBaseline='top';
    if (xlabel) g.fillText(xlabel, (M.l+W-M.r)/2, H-14);
    if (ylabel) { g.save(); g.translate(11,(M.t+H-M.b)/2); g.rotate(-Math.PI/2);
      g.textBaseline='top'; g.fillText(ylabel,0,0); g.restore(); }
  }
  function clip(g, M, W, H, fn) {
    g.save(); g.beginPath(); g.rect(M.l,M.t,W-M.l-M.r,H-M.t-M.b); g.clip();
    fn(); g.restore();
  }
  function shade(g,x,y,w,h,alpha) {
    g.fillStyle = color('--fg2'); g.globalAlpha = alpha===undefined?0.30:alpha;
    g.fillRect(x,y,w,h); g.globalAlpha = 1;
  }
  /** 参数戳，右上角。图被截屏后仍能看出当时参数 */
  function stamp(g, text, x, y) {
    g.font='9px ui-monospace,Menlo,monospace'; g.fillStyle=color('--fg2');
    g.globalAlpha=0.7; g.textAlign='right'; g.textBaseline='top';
    g.fillText(text, x, y); g.globalAlpha=1;
  }
  /** 颜色条 */
  function colorbar(g, name, x, y, w, h, hiLabel, loLabel, title) {
    for (var i=0;i<h;i++) { g.fillStyle=cmapStr(name, 1-i/h); g.fillRect(x,y+i,w,1); }
    g.strokeStyle=color('--line'); g.strokeRect(x+0.5,y+0.5,w-1,h-1);
    g.fillStyle=color('--fg2'); g.font='9px ui-monospace,Menlo,monospace';
    g.textAlign='left'; g.textBaseline='middle';
    if (hiLabel) g.fillText(hiLabel, x+w+3, y+4);
    if (loLabel) g.fillText(loLabel, x+w+3, y+h-4);
    if (title) { g.save(); g.translate(x+w+34, y+h/2); g.rotate(Math.PI/2);
      g.textAlign='center'; g.textBaseline='top'; g.fillText(title,0,0); g.restore(); }
  }

  /* ---------- 调度器 ----------
   * coarse()：每帧最多一次，画粗网格
   * fine()  ：停止操作 delay 毫秒后，画精细网格并刷新 DOM
   */
  function Scheduler(coarseFn, fineFn, delay) {
    var rafOn = false, timer = 0, self = this;
    this.lastCoarseMs = 0; this.lastFineMs = 0;
    this.tick = function () {
      if (!rafOn) {
        rafOn = true;
        root.requestAnimationFrame(function () {
          rafOn = false;
          var t0 = (root.performance || Date).now();
          try { coarseFn(); } catch (e) { console.error(e); }
          self.lastCoarseMs = (root.performance || Date).now() - t0;
        });
      }
      clearTimeout(timer);
      timer = setTimeout(self.flush, delay || 170);
    };
    this.flush = function () {
      clearTimeout(timer);
      var t0 = (root.performance || Date).now();
      try { fineFn(); } catch (e) { console.error(e); }
      self.lastFineMs = (root.performance || Date).now() - t0;
    };
  }

  root.YBP = {
    readTheme: readTheme, color: color, TH: TH,
    cmap: cmapStr, MAPS: MAPS, TURBO: TURBO, PLASMA: PLASMA, VIRIDIS: VIRIDIS,
    measure: measure, prep: prep, buffer: buffer, blit: blit,
    L10: L10, scaleLog: scaleLog, scaleLin: scaleLin,
    ticksLog: ticksLog, ticksLin: ticksLin, fmt: fmt,
    axes: axes, clip: clip, shade: shade, stamp: stamp, colorbar: colorbar,
    Scheduler: Scheduler
  };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && module.exports)
  module.exports = (typeof window !== 'undefined' ? window : globalThis).YBP;
