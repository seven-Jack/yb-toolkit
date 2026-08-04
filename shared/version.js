/* shared/version.js — 版本戳
 * 构建时由 scripts/stamp.sh 注入 commit / date；未注入时显示 dev。
 * 目的：排错时能一句话确认对方看到的是哪个版本，而不是猜浏览器缓存。
 */
(function (root) {
  'use strict';
  var BUILD = {
    version: '0.1.0',
    commit: '__COMMIT__',
    date: '__DATE__',
    channel: '__CHANNEL__'
  };
  function clean(s, fallback) {
    return (s && s.indexOf('__') !== 0) ? s : fallback;
  }
  var info = {
    version: BUILD.version,
    commit: clean(BUILD.commit, 'dev'),
    date: clean(BUILD.date, new Date().toISOString().slice(0, 10)),
    channel: clean(BUILD.channel, 'local')
  };
  info.short = 'v' + info.version + ' · ' + info.date + ' · ' + info.commit;

  /** 渲染到页脚。同时写入 CSV 注释与复制的参数行。 */
  function render(elId) {
    if (typeof document === 'undefined') return;
    var el = document.getElementById(elId || 'buildstamp');
    if (!el) return;
    var badge = info.channel === 'dev'
      ? '<span style="background:var(--warn-bg);color:var(--warn);padding:1px 7px;border-radius:99px;margin-left:6px">开发版</span>'
      : '';
    el.innerHTML = info.short + badge;
  }
  root.YBV = { info: info, render: render };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && module.exports)
  module.exports = (typeof window !== 'undefined' ? window : globalThis).YBV;
