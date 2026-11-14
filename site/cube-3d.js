/*
 * cube-3d.js — 零依赖的 Canvas 2D 三阶魔方立体渲染器
 *
 * 思路：
 *  - 26 个小方块 × 6 个朝向 = 156 个面片，每个面片带 3D 中心/法向/面内基向量。
 *  - 每帧做视角旋转（yaw/pitch）→ 透视投影 → 背面剔除 → 按深度排序 → 画家算法绘制。
 *  - 转动动画：只有「属于该层」的面片绕轴做连续角度旋转（Rodrigues 一般角公式），
 *    颜色取自转动前的状态，因此看到的是魔方在真拧，而不是颜色瞬间跳到下一个状态。
 *  - 贴纸槽位几何直接复用 cube-core.js 由 3D 几何推导出的 GEOM，方向定义完全一致。
 *
 * 依赖：window.CubeCore（cube-core.js），无其他依赖，file:// 可用。
 */
(function (root) {
  'use strict';
  var Cube = root.CubeCore;
  if (!Cube || !Cube.GEOM) throw new Error('cube-3d.js 需要先加载 cube-core.js');

  var NORMAL = {
    U: [0, 1, 0], D: [0, -1, 0], F: [0, 0, 1],
    B: [0, 0, -1], R: [1, 0, 0], L: [-1, 0, 0]
  };
  var DIRS = [NORMAL.U, NORMAL.D, NORMAL.F, NORMAL.B, NORMAL.R, NORMAL.L];

  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function vkey(p, n) { return p.join(',') + '|' + n.join(','); }
  // 绕单位轴 a 旋转任意角（Rodrigues）
  function rot(v, a, ang) {
    var c = Math.cos(ang), s = Math.sin(ang);
    var cr = [a[1] * v[2] - a[2] * v[1], a[2] * v[0] - a[0] * v[2], a[0] * v[1] - a[1] * v[0]];
    var d = dot(a, v), k = 1 - c;
    return [v[0] * c + cr[0] * s + a[0] * d * k,
            v[1] * c + cr[1] * s + a[1] * d * k,
            v[2] * c + cr[2] * s + a[2] * d * k];
  }
  function basis(n) {
    if (n[1]) return [[1, 0, 0], [0, 0, 1]];
    if (n[0]) return [[0, 1, 0], [0, 0, 1]];
    return [[1, 0, 0], [0, 1, 0]];
  }

  // 把一个转动记号翻译成连续旋转参数。
  // cube-core 约定：从该面外正视的「顺时针」= 绕外法向 -90°。
  function moveSpec(token) {
    var f = token.charAt(0), suf = token.slice(1);
    var angle = suf === '2' ? -Math.PI : suf === "'" ? Math.PI / 2 : -Math.PI / 2;
    if (f === 'y') return { axis: [0, 1, 0], all: true, angle: angle, token: token };
    var axis = NORMAL[f];
    if (!axis) throw new Error('cube-3d: 无法解析转动记号 ' + token);
    return { axis: axis, all: false, angle: angle, token: token };
  }

  // 156 个面片：有贴纸的记下贴纸槽位索引，没有的（朝内的黑塑料面）记 -1
  var SLOT = Object.create(null);
  Cube.GEOM.forEach(function (g, i) { SLOT[vkey(g.p, g.n)] = i; });
  var PANELS = [];
  for (var x = -1; x <= 1; x++) for (var y = -1; y <= 1; y++) for (var z = -1; z <= 1; z++) {
    if (x === 0 && y === 0 && z === 0) continue;
    var p = [x, y, z];
    for (var d = 0; d < DIRS.length; d++) {
      var n = DIRS[d], b = basis(n);
      var si = SLOT[vkey(p, n)];
      PANELS.push({ p: p, n: n, u: b[0], v: b[1], si: si === undefined ? -1 : si });
    }
  }

  var HEX_CACHE = {};
  function hexRgb(h) {
    if (HEX_CACHE[h]) return HEX_CACHE[h];
    var v = parseInt(h.slice(1), 16);
    return (HEX_CACHE[h] = [(v >> 16) & 255, (v >> 8) & 255, v & 255]);
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // ---- 绘制圆角四边形（透视下用二次贝塞尔近似圆角） ----
  var CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  function quadPath(ctx, pts, radius) {
    ctx.beginPath();
    for (var i = 0; i < 4; i++) {
      var prev = pts[(i + 3) % 4], cur = pts[i], next = pts[(i + 1) % 4];
      var dp = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]) || 1;
      var dn = Math.hypot(cur[0] - next[0], cur[1] - next[1]) || 1;
      var rp = Math.min(radius, dp * 0.42), rn = Math.min(radius, dn * 0.42);
      var a = [cur[0] + (prev[0] - cur[0]) * rp / dp, cur[1] + (prev[1] - cur[1]) * rp / dp];
      var b = [cur[0] + (next[0] - cur[0]) * rn / dn, cur[1] + (next[1] - cur[1]) * rn / dn];
      if (i === 0) ctx.moveTo(a[0], a[1]); else ctx.lineTo(a[0], a[1]);
      ctx.quadraticCurveTo(cur[0], cur[1], b[0], b[1]);
    }
    ctx.closePath();
  }

  function createRenderer(canvas, colors, opts) {
    var ctx = canvas.getContext('2d');
    var transparent = !!(opts && opts.transparent);
    var view = { yaw: -32, pitch: 24, zoom: 1 };
    var W = 0, H = 0, dpr = 1;
    var last = { drawn: 0, layer: 0, animating: false, kept: 0, grayed: 0, accented: 0, hatched: 0 };
    var focus = null;   // 若设置，则只保留该色贴纸，其余一律画成灰色（聚焦/去干扰用）
    var focusMode = 'color'; // 'color'：保留目标色全部贴纸；'cross'：只保留目标色在非角块上的贴纸（白十字＝白心＋四白棱，白角不算目标）
    var slotKeep = null, slotAccent = null;  // 按贴纸槽位「突出块显示」：keep 保色，accent 额外描蓝框
    var LIGHT = (function () {
      var l = [-0.32, 0.78, 0.95], m = Math.sqrt(dot(l, l));
      return [l[0] / m, l[1] / m, l[2] / m];
    })();

    function resize() {
      dpr = Math.min(root.devicePixelRatio || 1, 2);
      W = canvas.clientWidth || 460; H = canvas.clientHeight || 420;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function viewRot(v) {
      var y = view.yaw * Math.PI / 180, p = view.pitch * Math.PI / 180;
      var cy = Math.cos(y), sy = Math.sin(y), cp = Math.cos(p), sp = Math.sin(p);
      var x1 = v[0] * cy + v[2] * sy, z1 = -v[0] * sy + v[2] * cy, y1 = v[1];
      return [x1, y1 * cp - z1 * sp, y1 * sp + z1 * cp];
    }
    function setView(yaw, pitch, zoom) {
      if (yaw !== undefined && yaw !== null) view.yaw = yaw;
      if (pitch !== undefined && pitch !== null) view.pitch = clamp(pitch, -85, 85);
      if (zoom !== undefined && zoom !== null) view.zoom = clamp(zoom, 0.62, 1.9);
    }
    function getView() { return { yaw: view.yaw, pitch: view.pitch, zoom: view.zoom }; }
    function setFocus(ci, mode) {
      focus = (ci === undefined || ci === null) ? null : ci;
      focusMode = mode || 'color';
      slotKeep = null; slotAccent = null;
    }
    // 只设蓝框（第 1 课：在 cross 颜色模式之上再框出散落的白棱），不改保色规则
    function setAccent(arr) { setSlotsAccent(arr); }
    function setSlotsAccent(arr) {
      if (!arr) { slotAccent = null; return; }
      var m = Object.create(null);
      for (var i = 0; i < arr.length; i++) m[arr[i]] = true;
      slotAccent = m;
    }
    // 按槽位决定「已完成 + 当前目标」保色、其余灰掉；accent 里的槽位再描一圈蓝框突出
    function setSlots(keepArr, accentArr) {
      focus = null;
      function toMap(arr) {
        if (!arr) return null;
        var m = Object.create(null);
        for (var i = 0; i < arr.length; i++) m[arr[i]] = true;
        return m;
      }
      slotKeep = toMap(keepArr);
      slotAccent = toMap(accentArr);
    }

    /*
     * state: 静止状态（54 颜色）
     * anim : { from: 转动前状态, spec: moveSpec(), t: 缓动后的 0..1 } 或 null
     */
      function render(state, anim) {
      if (!W || !H) resize();
      var src = anim ? anim.from : state;
      var spec = anim ? anim.spec : null;
      var ang = anim ? spec.angle * clamp(anim.t, 0, 1) : 0;
      var unit = Math.min(W, H) * 0.172 * view.zoom;
      var D = 9, cx = W / 2, cy = H / 2 - 4;
      // 每个面片的原始坐标（转动动画中会旋转临时变量，必须存一份原始值用于 focus 判定）
      var nzOf = function (p) {
        return (p[0] !== 0 ? 1 : 0) + (p[1] !== 0 ? 1 : 0) + (p[2] !== 0 ? 1 : 0);
      };

      // 背景：白底主题用浅色渐变；封面等场景传 transparent 则不填背景，立方体悬浮在页面上
      if (transparent) {
        ctx.clearRect(0, 0, W, H);
      } else {
        var bg = ctx.createRadialGradient(cx, cy - 20, 10, cx, cy, Math.max(W, H) * 0.78);
        bg.addColorStop(0, '#FFFFFF'); bg.addColorStop(1, '#E9EFF8');
        ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      }
      // 地面投影，给立方体一个「立住」的参照
      ctx.save();
      ctx.translate(cx, cy + unit * 2.35); ctx.scale(1, 0.28);
      var sh = ctx.createRadialGradient(0, 0, 2, 0, 0, unit * 2.1);
      sh.addColorStop(0, 'rgba(37,99,235,.10)'); sh.addColorStop(1, 'rgba(37,99,235,0)');
      ctx.fillStyle = sh; ctx.beginPath(); ctx.arc(0, 0, unit * 2.1, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      function project(pt) {
        var sc = unit * D / Math.max(0.5, D - pt[2]);
        return [cx + pt[0] * sc, cy - pt[1] * sc];
      }
      function quad(c, u, v, h) {
        return CORNERS.map(function (s) {
          return project([c[0] + u[0] * h * s[0] + v[0] * h * s[1],
                          c[1] + u[1] * h * s[0] + v[1] * h * s[1],
                          c[2] + u[2] * h * s[0] + v[2] * h * s[1]]);
        });
      }

      var list = [], layerCount = 0;
      var keptCount = 0, grayedCount = 0, accentedCount = 0, hatchedCount = 0;
      for (var i = 0; i < PANELS.length; i++) {
        var f = PANELS[i], p = f.p, n = f.n, u = f.u, v = f.v;
        var inLayer = false;
        if (spec) {
          inLayer = spec.all || dot(p, spec.axis) === 1;
          if (inLayer) {
            layerCount++;
            p = rot(p, spec.axis, ang); n = rot(n, spec.axis, ang);
            u = rot(u, spec.axis, ang); v = rot(v, spec.axis, ang);
          }
        }
        var pv = viewRot(p), nv = viewRot(n), uv = viewRot(u), vv = viewRot(v);
        if (nv[2] <= 0.004) continue;                 // 背面剔除
        var c = [pv[0] + nv[0] * 0.5, pv[1] + nv[1] * 0.5, pv[2] + nv[2] * 0.5];
        var shade = 0.62 + 0.38 * Math.max(0, dot(nv, LIGHT));
        list.push({ c: c, u: uv, v: vv, shade: shade, depth: c[2],
                    si: f.si, nz: nzOf(f.p), inLayer: inLayer });
      }
      list.sort(function (a, b) { return a.depth - b.depth; }); // 远 → 近

      for (var j = 0; j < list.length; j++) {
        var q = list[j];
        // 黑色塑料底（每格 1×1，拼出立方体的实体感）
        var k = 0.55 + 0.45 * q.shade;
        ctx.fillStyle = q.inLayer
          ? 'rgb(' + Math.round(26 * k + 12) + ',' + Math.round(38 * k + 16) + ',' + Math.round(64 * k + 22) + ')'
          : 'rgb(' + Math.round(18 * k + 6) + ',' + Math.round(18 * k + 6) + ',' + Math.round(26 * k + 8) + ')';
        quadPath(ctx, quad(q.c, q.u, q.v, 0.5), 6);
        ctx.fill();
        if (q.si < 0 || !src) continue;
        // 彩色贴纸（设置 focus 时，非目标色一律灰化，避免干扰注意力）
        var srcColor = src[q.si];
        var keep;
        if (slotKeep !== null) keep = !!slotKeep[q.si];    // 按槽位：不在集合内一律灰掉
        else if (focus === null) keep = true;
        else if (srcColor !== focus) keep = false;        // 非目标色 → 灰化
        else if (focusMode === 'cross') {
          // 白十字目标＝白心 + 四白棱；白角不算目标，灰化掉
          keep = q.nz !== 3;                                // 角块三个坐标都非 0，灰化
        } else keep = true;
        // 无效块＝浅蓝灰底 + 45° 斜线阴影。用「纹理」而不是「深浅」区分白色贴纸：
        // 白色贴纸在背光面会被 shade 压暗，纯灰块靠明度永远会和它撞色，斜线不会。
        var rgb = keep ? hexRgb(colors[srcColor] || '#888888') : hexRgb('#C3CCDC');
        ctx.fillStyle = 'rgb(' + Math.round(clamp(rgb[0] * q.shade, 0, 255)) + ',' +
                                Math.round(clamp(rgb[1] * q.shade, 0, 255)) + ',' +
                                Math.round(clamp(rgb[2] * q.shade, 0, 255)) + ')';
        var pts = quad(q.c, q.u, q.v, 0.425);
        quadPath(ctx, pts, 7); ctx.fill();
        if (!keep) {
          ctx.save();
          quadPath(ctx, pts, 7); ctx.clip();
          var mx = (pts[0][0] + pts[1][0] + pts[2][0] + pts[3][0]) / 4;
          var my = (pts[0][1] + pts[1][1] + pts[2][1] + pts[3][1]) / 4;
          var rad = 0;
          for (var s = 0; s < 4; s++)
            rad = Math.max(rad, Math.hypot(pts[s][0] - mx, pts[s][1] - my));
          var span = rad * 1.9, step = Math.max(6, Math.min(12, rad * 0.34));
          var ux = 0.7071, uy = -0.7071, nx = 0.7071, ny = 0.7071;  // 线方向 / 法向
          ctx.beginPath();
          for (var d = -span; d <= span; d += step) {
            ctx.moveTo(mx + nx * d - ux * span, my + ny * d - uy * span);
            ctx.lineTo(mx + nx * d + ux * span, my + ny * d + uy * span);
          }
          ctx.lineWidth = Math.max(1, Math.min(1.7, rad * 0.05));
          ctx.strokeStyle = 'rgba(72,88,116,.5)';
          ctx.stroke();
          ctx.restore();
          hatchedCount++;
        }
        ctx.lineWidth = q.inLayer ? 2 : 1;
        ctx.strokeStyle = q.inLayer ? 'rgba(37,99,235,.95)' : 'rgba(0,0,0,.28)';
        quadPath(ctx, pts, 7);
        ctx.stroke();
        // 突出块：本课当前要处理的槽位额外描一圈蓝框，和「已完成但只是参照」的块区分开
        if (keep) keptCount++; else grayedCount++;
        if (keep && slotAccent && slotAccent[q.si]) {
          accentedCount++;
          ctx.save();
          ctx.lineWidth = 2.8;
          ctx.strokeStyle = 'rgba(37,99,235,.98)';
          ctx.stroke();
          ctx.restore();
        }
      }
      last.drawn = list.length; last.layer = layerCount; last.animating = !!anim;
      last.kept = keptCount; last.grayed = grayedCount; last.accented = accentedCount;
      last.hatched = hatchedCount;
      return last;
    }

    resize();
    return {
      resize: resize, render: render, setView: setView, getView: getView,
      setFocus: setFocus, setSlots: setSlots, setAccent: setAccent,
      stats: function () { return { drawn: last.drawn, layer: last.layer, animating: last.animating,
        kept: last.kept, grayed: last.grayed, accented: last.accented, hatched: last.hatched,
        panels: PANELS.length }; },
      panelCount: PANELS.length
    };
  }

  var API = {
    createRenderer: createRenderer, moveSpec: moveSpec, rot: rot, dot: dot,
    NORMAL: NORMAL, PANEL_COUNT: PANELS.length, vkey: vkey
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Cube3D = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
