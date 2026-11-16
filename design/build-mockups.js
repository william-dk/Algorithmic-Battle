'use strict';
// 把 ./canvas 里的设计画布源文件（.dc.html）转换成 ./mockups 里的普通网页，
// 任何浏览器都能直接打开，不依赖线上的设计画布。
// 用法：node build-mockups.js
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, 'canvas'), OUT = path.join(__dirname, 'mockups');

// 画板文件 -> 本地网页
const PAGES = {
  'Setup.dc.html': 'setup.html',
  'Main.dc.html': 'watch-2d.html',
  'Arena3D.dc.html': 'watch-3d.html',
  'Tournament.dc.html': 'tournament.html',
  'Battle.dc.html': 'battle.html',
  'Workshop.dc.html': 'workshop.html',
};
// 线上素材 ID 的前 8 位 -> ./mockups/assets 里的文件
const ASSETS = {
  'c3c31c5c': 'map2d_D.png', '12f8be58': 'map3d_V1.png', '28a685de': 'slice3d_V1.png', '8f890226': 'mapl2_555.png',
  '259a260e': 'duel_150.png', '259044f9': 'map_empty.png', 'd64a6a2b': 'th_bfs.png', 'bf2d89c3': 'th_dfs.png',
  'bfbbda82': 'th_eden.png', '761632da': 'th_prim.png', '8df327bd': 'th_rwalk.png', 'ade9320b': 'th_spiral.png',
  'a486b985': 'th_scan.png', '04c9b532': 'th_hilbert.png', 'b9d10490': 'th_astar.png', '952e3623': 'th_greedy.png',
  '59fdcdcc': 'th_voronoi.png',
};

// 画板里的逻辑类继承自 DCLogic；这里只需要它能算出初始值
class DCLogic { setState(s) { this.state = Object.assign({}, this.state, s); } }

// 3D 观战页的旋转交互（画布里由画板自己的逻辑类实现，这里用原生 JS 重写一遍）
const SPIN_JS = `(function () {
  var frames = Array.prototype.slice.call(document.querySelectorAll('img.frame'));
  var slider = document.getElementById('yaw'), label = document.querySelector('label[for="yaw"]');
  var autoBtn = document.querySelector('[data-onclick="toggleAuto"]'), stage = document.querySelector('[data-onpointerdown]');
  var frame = 0, auto = false, drag = null;
  function show(n) {
    frame = ((n % 24) + 24) % 24;
    frames.forEach(function (im, i) { im.style.display = i === frame ? 'block' : 'none'; });
    slider.value = frame; label.textContent = '视角 ' + frame * 15 + '°';
  }
  function on(sel, fn) { var el = document.querySelector(sel); if (el) el.addEventListener('click', fn); }
  on('[data-onclick="left"]', function () { show(frame - 1); });
  on('[data-onclick="right"]', function () { show(frame + 1); });
  on('[data-onclick="reset"]', function () { auto = false; autoBtn.textContent = '自动旋转'; show(0); });
  autoBtn.addEventListener('click', function () { auto = !auto; autoBtn.textContent = auto ? '停止自动旋转' : '自动旋转'; });
  slider.addEventListener('input', function () { show(Number(slider.value) || 0); });
  stage.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, frame: frame }; try { stage.setPointerCapture(e.pointerId); } catch (err) {} });
  stage.addEventListener('pointermove', function (e) { if (drag) show(drag.frame + Math.round((e.clientX - drag.x) / 14)); });
  ['pointerup', 'pointercancel'].forEach(function (ev) { stage.addEventListener(ev, function () { drag = null; }); });
  setInterval(function () { if (auto && !drag) show(frame + 1); }, 110);
})();`;

fs.mkdirSync(OUT, { recursive: true });
for (const [src, out] of Object.entries(PAGES)) {
  const raw = fs.readFileSync(path.join(SRC, src), 'utf8');
  const title = /<title>([\s\S]*?)<\/title>/.exec(raw)[1];
  const helmet = /<helmet>([\s\S]*?)<\/helmet>/.exec(raw)[1].trim();
  let body = /<\/helmet>([\s\S]*?)<\/x-dc>/.exec(raw)[1].trim();
  const logic = /<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/.exec(raw)[1];
  const Component = new Function('DCLogic', logic + '\nreturn Component;')(DCLogic);
  const vals = new Component().renderVals();

  // 循环：把 <sc-for> 展开成静态 HTML
  body = body.replace(/<sc-for list="\{\{\s*(\w+)\s*\}\}" as="(\w+)"[^>]*>([\s\S]*?)<\/sc-for>/g, (_, list, as, tpl) =>
    vals[list].map(item => tpl.replace(new RegExp('\\{\\{\\s*' + as + '\\.(\\w+)\\s*\\}\\}', 'g'), (m, k) => item[k])).join(''));
  // 旋转帧：第 n 张帧图 -> spin_nn.png
  let n = 0;
  body = body.replace(/(<img class="frame" src=")\/_blob\/[0-9a-f]{32}/g, (_, pre) => pre + 'assets/spin_' + String(n++).padStart(2, '0') + '.png');
  // 其余素材
  body = body.replace(/\/_blob\/([0-9a-f]{8})[0-9a-f]{24}/g, (_, id) => {
    if (!ASSETS[id]) throw new Error('未知素材 ' + id + '（' + src + '）');
    return 'assets/' + ASSETS[id];
  });
  // 界面之间的跳转
  body = body.replace(/href="(\w+\.dc\.html)"/g, (_, f) => 'href="' + PAGES[f] + '"');
  // 事件绑定改成 data- 属性，由上面的脚本接管
  body = body.replace(/\s(on[A-Z]\w*)="\{\{\s*(\w+)\s*\}\}"/g, (_, ev, name) => ' data-' + ev.toLowerCase() + '="' + name + '"');
  // 剩下的取值
  body = body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => {
    if (!(k in vals)) throw new Error('未知取值 ' + k + '（' + src + '）');
    return String(vals[k]);
  });

  const script = src === 'Arena3D.dc.html' ? '<script>\n' + SPIN_JS + '\n</script>\n' : '';
  fs.writeFileSync(path.join(OUT, out),
    '<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>' + title + '</title>\n' + helmet + '\n</head>\n<body>\n' + body + '\n' + script + '</body>\n</html>\n');
  console.log(src, '->', out);
}
