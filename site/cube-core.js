/*
 * cube-core.js — 三阶魔方状态引擎 + 七阶段层先法教学求解器
 *
 * 设计要点：
 *  1) 转动置换由 3D 几何推导生成，不手写相邻面行列映射（手写极易错）。
 *  2) 求解器按「教学子目标」逐段 BFS：每一段只要求「再多归位一个块」，
 *     动作集合是保持前序成果的教程公式，因此解是人类可读的层先法，
 *     而不是 Kociemba 的 20 步机器解。
 *  3) 每个教学单元带中文讲解 + 前后状态快照 + 逐帧快照，供交互播放器消费。
 *
 * 配色（相当于把标准魔方整体翻过来，白色在下、绿色朝前）：
 *   U=黄  R=红  F=绿  D=白  L=橙  B=蓝
 * 握法说明：白色朝下、绿色朝前，全程不换握法。
 *
 * 零依赖；浏览器挂 window.CubeCore，Node 用 module.exports。
 */
(function (root) {
  'use strict';

  var FACES = ['U', 'R', 'F', 'D', 'L', 'B'];
  var C = { W: 0, Y: 1, G: 2, B: 3, R: 4, O: 5 };
  var COLOR_CHAR = ['W', 'Y', 'G', 'B', 'R', 'O'];
  var FACE_COLOR = [C.Y, C.R, C.G, C.W, C.O, C.B]; // U R F D L B
  var FACE_NORMAL = {
    U: [0, 1, 0], D: [0, -1, 0], F: [0, 0, 1],
    B: [0, 0, -1], R: [1, 0, 0], L: [-1, 0, 0]
  };

  function idx(f, r, c) { return FACES.indexOf(f) * 9 + r * 3 + c; }
  function at(s, f, r, c) { return s[idx(f, r, c)]; }
  function vkey(p, n) { return p.join(',') + '|' + n.join(','); }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  // 绕单位轴 a 旋转 sign*90°（Rodrigues 在 cos=0 时的整数形式）
  function rot90(v, a, sign) {
    var cr = cross(a, v), d = dot(a, v);
    return [sign * cr[0] + d * a[0], sign * cr[1] + d * a[1], sign * cr[2] + d * a[2]];
  }
  // 每个面「正对该面看」时的 (row,col) -> (cubie 坐标, 法向)
  function geom(f, r, c) {
    switch (f) {
      case 'U': return { p: [c - 1, 1, r - 1], n: [0, 1, 0] };
      case 'D': return { p: [c - 1, -1, 1 - r], n: [0, -1, 0] };
      case 'F': return { p: [c - 1, 1 - r, 1], n: [0, 0, 1] };
      case 'B': return { p: [1 - c, 1 - r, -1], n: [0, 0, -1] };
      case 'R': return { p: [1, 1 - r, 1 - c], n: [1, 0, 0] };
      case 'L': return { p: [-1, 1 - r, c - 1], n: [-1, 0, 0] };
    }
  }

  var GEOM = [], GEO2IDX = {};
  FACES.forEach(function (f) {
    for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) {
      var i = idx(f, r, c), g = geom(f, r, c);
      GEOM[i] = g;
      GEO2IDX[vkey(g.p, g.n)] = i;
    }
  });

  // 顺时针（从该面外部正视）= 绕外法向 -90°
  var PERM = {};
  FACES.forEach(function (f) {
    var a = FACE_NORMAL[f], perm = new Array(54), missing = 0;
    for (var i = 0; i < 54; i++) {
      var g = GEOM[i];
      if (dot(g.p, a) !== 1) { perm[i] = i; continue; }
      var p2 = rot90(g.p, a, -1), n2 = rot90(g.n, a, -1);
      var j = GEO2IDX[vkey(p2, n2)];
      if (j === undefined) missing++;
      perm[i] = j;
    }
    if (missing) throw new Error('置换表生成失败: ' + f + ' 缺 ' + missing);
    PERM[f] = perm;
  });

  // 整体绕 U 轴旋转（y）：作用在所有 54 张贴纸上，用于把教程公式共轭到另外两个朝向
  var aY = [0, 1, 0], permY = new Array(54);
  for (var yi = 0; yi < 54; yi++) {
    var yg = GEOM[yi];
    permY[yi] = GEO2IDX[vkey(rot90(yg.p, aY, -1), rot90(yg.n, aY, -1))];
  }
  PERM.y = permY;

  function solvedState() {
    var s = new Array(54);
    FACES.forEach(function (f, k) { for (var i = 0; i < 9; i++) s[k * 9 + i] = FACE_COLOR[k]; });
    return s;
  }
  function applyPerm(s, perm) {
    var out = new Array(54);
    for (var i = 0; i < 54; i++) out[perm[i]] = s[i];
    return out;
  }
  function applyMove(s, token) {
    var f = token.charAt(0), suf = token.slice(1);
    var perm = PERM[f];
    if (!perm) throw new Error('非法转动记号: ' + token);
    var times = suf === '2' ? 2 : suf === "'" ? 3 : 1;
    var cur = s;
    for (var k = 0; k < times; k++) cur = applyPerm(cur, perm);
    return cur;
  }
  function applySeq(s, seq) {
    var cur = s;
    for (var i = 0; i < seq.length; i++) cur = applyMove(cur, seq[i]);
    return cur;
  }
  function parseAlg(text) {
    if (Array.isArray(text)) return text.slice();
    var out = [], re = /([URFDLBy])([2']?)/gi, m, src = String(text);
    while ((m = re.exec(src)) !== null) {
      var f = m[1];
      out.push((f === 'y' || f === 'Y' ? 'y' : f.toUpperCase()) + m[2]);
    }
    return out;
  }
  function algText(seq) { return seq.join(' '); }
  function isSolved(s) {
    for (var k = 0; k < 6; k++) {
      for (var i = 0; i < 9; i++) if (s[k * 9 + i] !== FACE_COLOR[k]) return false;
    }
    return true;
  }

  /* ---------------- 七阶段进度判定 ---------------- */
  // -1 表示前序成果被破坏；否则返回该阶段已完成的「块」数
  function crossArms(s) {
    var n = 0;
    if (at(s, 'D', 0, 1) === C.W && at(s, 'F', 2, 1) === C.G) n++;
    if (at(s, 'D', 1, 2) === C.W && at(s, 'R', 2, 1) === C.R) n++;
    if (at(s, 'D', 2, 1) === C.W && at(s, 'B', 2, 1) === C.B) n++;
    if (at(s, 'D', 1, 0) === C.W && at(s, 'L', 2, 1) === C.O) n++;
    return n;
  }
  function bottomCorners(s) {
    if (crossArms(s) !== 4) return -1;
    var n = 0;
    if (at(s, 'D', 0, 2) === C.W && at(s, 'F', 2, 2) === C.G && at(s, 'R', 2, 0) === C.R) n++;
    if (at(s, 'D', 0, 0) === C.W && at(s, 'F', 2, 0) === C.G && at(s, 'L', 2, 2) === C.O) n++;
    if (at(s, 'D', 2, 2) === C.W && at(s, 'B', 2, 0) === C.B && at(s, 'R', 2, 2) === C.R) n++;
    if (at(s, 'D', 2, 0) === C.W && at(s, 'B', 2, 2) === C.B && at(s, 'L', 2, 0) === C.O) n++;
    return n;
  }
  function middleEdges(s) {
    if (bottomCorners(s) !== 4) return -1;
    var n = 0;
    if (at(s, 'F', 1, 2) === C.G && at(s, 'R', 1, 0) === C.R) n++;
    if (at(s, 'F', 1, 0) === C.G && at(s, 'L', 1, 2) === C.O) n++;
    if (at(s, 'B', 1, 0) === C.B && at(s, 'R', 1, 2) === C.R) n++;
    if (at(s, 'B', 1, 2) === C.B && at(s, 'L', 1, 0) === C.O) n++;
    return n;
  }
  function topCrossArms(s) {
    if (middleEdges(s) !== 4) return -1;
    var n = 0;
    if (at(s, 'U', 0, 1) === C.Y) n++;
    if (at(s, 'U', 1, 2) === C.Y) n++;
    if (at(s, 'U', 2, 1) === C.Y) n++;
    if (at(s, 'U', 1, 0) === C.Y) n++;
    return n;
  }
  function topYellowStickers(s) {
    if (topCrossArms(s) !== 4) return -1;
    var n = 0;
    for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) if (at(s, 'U', r, c) === C.Y) n++;
    return n;
  }
  function topCornersPlaced(s) {
    if (topYellowStickers(s) !== 9) return -1;
    // 一个角算「归位」，当且仅当它两侧贴纸都与所在面同色
    var pairs = [
      ['F', 0, 2, C.G, 'R', 0, 0, C.R],
      ['F', 0, 0, C.G, 'L', 0, 2, C.O],
      ['B', 0, 0, C.B, 'R', 0, 2, C.R],
      ['B', 0, 2, C.B, 'L', 0, 0, C.O]
    ];
    var n = 0;
    pairs.forEach(function (p) {
      if (at(s, p[0], p[1], p[2]) === p[3] && at(s, p[4], p[5], p[6]) === p[7]) n++;
    });
    return n;
  }
  function sideRowsAligned(s) {
    if (topCornersPlaced(s) !== 4) return 0;
    return isSolved(s) ? 1 : 0;
  }

  /* ---------------- 教学动作集合（宏） ---------------- */
  function M(label, text, seq) { return { label: label, text: text, seq: parseAlg(seq) }; }
  // 把公式共轭到另外的朝向：y^k 公式 y^-k，净效果仍在原来的握法下
  function conj(k, mv, label, text) {
    var pre = k === 0 ? [] : k === 1 ? ['y'] : k === 2 ? ['y2'] : ["y'"];
    var post = k === 0 ? [] : k === 1 ? ["y'"] : k === 2 ? ['y2'] : ['y'];
    return { label: label, text: text, seq: pre.concat(mv.seq, post) };
  }
  var INSERTS = (function () {
    var right = M('右插', '', "U R U' R' U' F' U F");
    var left = M('左插', '', "U' F' U F U R U' R'");
    var names = ['正面', '整体右转 90°', '整体转 180°', '整体左转 90°'];
    var list = [];
    for (var k = 0; k < 4; k++) {
      list.push(conj(k, right, '右插公式 ' + names[k],
        (k ? '先整体转魔方（不是转层），' : '') + '用右插公式把顶层棱块向右送进这一侧的中层，' + (k ? '最后转回原握法；' : '') + '第一层不会散。'));
      list.push(conj(k, left, '左插公式 ' + names[k],
        (k ? '先整体转魔方（不是转层），' : '') + '用左插公式把顶层棱块向左送进这一侧的中层，' + (k ? '最后转回原握法；' : '') + '第一层不会散。'));
    }
    return list;
  })();
  var CORNER_CYCLES = (function () {
    var names = ['右前角', '右后角', '左后角', '左前角'];
    var fwd = M('', '', "R U R' U'"), rev = M('', '', "R U' R' U");
    var list = [];
    for (var k = 0; k < 4; k++) {
      list.push(conj(k, fwd, '右手循环 ' + names[k],
        (k ? '把魔方整体转到目标角朝右前，' : '') + '反复做「R U R\u2032 U\u2032」把角块压进底层并翻正白色，' + (k ? '完成后转回原握法。' : '一次不成就多做几次。')));
      list.push(conj(k, rev, '反向右手循环 ' + names[k],
        (k ? '把魔方整体转到目标角朝右前，' : '') + '用反方向的「R U\u2032 R\u2032 U」处理另一种角块朝向，' + (k ? '完成后转回原握法。' : '一次不成就多做几次。')));
    }
    return list;
  })();
  var U_MOVES = [
    M('顶层转 90°', '转动顶层，把要处理的块移到工作位置。', 'U'),
    M('顶层反向转 90°', '反向转动顶层，对齐块与中心块。', "U'"),
    M('顶层转 180°', '顶层转半圈，把块送到对面。', 'U2')
  ];
  var BASIC_MOVES = [];
  FACES.forEach(function (f) {
    [['', '顺时针 90°'], ['2', '转 180°'], ["'", '逆时针 90°']].forEach(function (x) {
      BASIC_MOVES.push(M(f + x[0] + ' ' + x[1], '转动 ' + f + ' 面，调整块的位置与朝向。', f + x[0]));
    });
  });
  var STAGES = [
    {
      id: 1, name: '白色十字', short: '白十字',
      goal: '把 4 个带白色的棱块送回底层：白色朝下，侧面颜色对准同色中心，形成一个白十字。',
      hint: '先在顶层把白棱对准侧面中心，再用该面 180° 翻下去。注意别只顾底面白色——侧面颜色也要对齐。',
      unit: '条十字臂', progress: crossArms, target: 4, moves: BASIC_MOVES, maxDepth: 6
    },
    {
      id: 2, name: '白色第一层', short: '第一层',
      goal: '把 4 个带白色的角块归位，完成整个白色底面和侧面最下面一行。',
      hint: '把目标角放到右前上方，反复做「右上左下」循环，直到白色朝下；每完成一个角，转顶层换下一个。',
      unit: '个底角', progress: bottomCorners, target: 4, maxDepth: 12, maxNodes: 600000,
      moves: U_MOVES.concat(CORNER_CYCLES)
    },
    {
      id: 3, name: '中间层棱块', short: '中层棱',
      goal: '把 4 个不含黄白色的中层棱块归位，完成下面两层。',
      hint: '先在顶层把棱块的侧面颜色对准中心，再用「右插」或「左插」公式把它送进中层。',
      unit: '个中层棱', progress: middleEdges, target: 4, maxDepth: 12,
      moves: U_MOVES.concat(INSERTS)
    },
    {
      id: 4, name: '顶层黄十字', short: '黄十字',
      goal: '让顶面 4 个棱块翻成黄色，形成黄十字（此时不要求侧面顶行对齐）。',
      hint: '没有黄棱时做一次「F R U R\u2032 U\u2032 F\u2032」得到一条线；L 形或直线都要摆正方向再做，必要时重复。',
      unit: '条黄棱', progress: topCrossArms, target: 4, maxDepth: 6,
      moves: U_MOVES.concat([
        M('顶十字公式 F R U R\u2032 U\u2032 F\u2032', '把顶面棱块翻黄：点→L 形→直线→十字，逐步推进。', "F R U R' U' F'")
      ])
    },
    {
      id: 5, name: '顶面全黄', short: '顶面',
      goal: '把顶层 4 个角块翻正，让整个顶面变成黄色。',
      hint: '保持黄十字不散，用「小鱼」公式反复处理角块朝向；每次只改变角朝向，下面两层不动。',
      unit: '个黄块', progress: topYellowStickers, target: 9, startAt: 6, maxDepth: 10,
      moves: U_MOVES.concat([
        M('小鱼公式（Sune）', '把顶层角块翻正的经典公式，顶面已有黄十字时使用。', "R U R' U R U2 R'"),
        M('反小鱼公式（Anti-Sune）', '小鱼的镜像，处理另一种角块朝向分布。', "R U2 R' U' R U' R'")
      ])
    },
    {
      id: 6, name: '顶层角块归位', short: '角归位',
      goal: '把 4 个顶层角块换到各自正确的位置（朝向已经全对）。',
      hint: '此时顶面全黄，只剩角块位置不对。用换角公式做三循环，配合顶层转动把角块一个个送回家。',
      unit: '个顶角', progress: topCornersPlaced, target: 4, maxDepth: 10,
      moves: U_MOVES.concat([
        M('Aa 换角公式', '纯角块三循环，不动棱块、不破坏顶面黄色。', "R' F R' B2 R F' R' B2 R2"),
        M('Ab 换角公式', 'Aa 的逆方向，配合顶层转动覆盖所有角块排列。', "R2 B2 R F R' B2 R F' R")
      ])
    },
    {
      id: 7, name: '顶层棱块归位', short: '棱归位',
      goal: '把最后 4 个顶层棱块归位，六个面全部复原。',
      hint: '用 U 排列公式做棱块三循环，最后转一下顶层对齐侧面，魔方复原。',
      unit: '步', progress: sideRowsAligned, target: 1, maxDepth: 10,
      moves: U_MOVES.concat([
        M('Ua 棱循环', '顺时针轮换三个顶层棱块，其余全部不动。', "R U' R U R U R U' R' U' R2"),
        M('Ub 棱循环', 'Ua 的逆方向，处理相反方向的棱块排列。', "R2 U R U R' U' R' U' R' U R'")
      ])
    }
  ];

  /* ---------------- 逐子目标 BFS ---------------- */
  function keyOf(s) { return s.join(''); }

  function bfs(start, moves, goalFn, maxDepth, maxNodes) {
    if (goalFn(start)) return { path: [], nodes: 0 };
    var visited = Object.create(null);
    visited[keyOf(start)] = 1;
    var frontier = [{ s: start, path: [] }], nodes = 0;
    for (var d = 1; d <= maxDepth; d++) {
      var next = [];
      for (var i = 0; i < frontier.length; i++) {
        var node = frontier[i];
        for (var j = 0; j < moves.length; j++) {
          var mv = moves[j], s2 = applySeq(node.s, mv.seq), k = keyOf(s2);
          if (visited[k]) continue;
          visited[k] = 1;
          var path = node.path.concat([mv]);
          nodes++;
          if (goalFn(s2)) return { path: path, nodes: nodes };
          next.push({ s: s2, path: path });
          if (nodes > maxNodes) return { path: null, nodes: nodes, reason: '超出节点上限' };
        }
      }
      frontier = next;
      if (!frontier.length) break;
    }
    return { path: null, nodes: nodes, reason: '深度 ' + maxDepth + ' 内未找到解' };
  }

  var COLOR_NAME = ['白', '黄', '绿', '蓝', '红', '橙'];
  var EDGE_POS = [
    { name: 'UF', a: ['U', 2, 1], b: ['F', 0, 1] },
    { name: 'UR', a: ['U', 1, 2], b: ['R', 0, 1] },
    { name: 'UB', a: ['U', 0, 1], b: ['B', 0, 1] },
    { name: 'UL', a: ['U', 1, 0], b: ['L', 0, 1] },
    { name: 'DF', a: ['D', 0, 1], b: ['F', 2, 1] },
    { name: 'DR', a: ['D', 1, 2], b: ['R', 2, 1] },
    { name: 'DB', a: ['D', 2, 1], b: ['B', 2, 1] },
    { name: 'DL', a: ['D', 1, 0], b: ['L', 2, 1] },
    { name: 'FR', a: ['F', 1, 2], b: ['R', 1, 0] },
    { name: 'FL', a: ['F', 1, 0], b: ['L', 1, 2] },
    { name: 'BR', a: ['B', 1, 0], b: ['R', 1, 2] },
    { name: 'BL', a: ['B', 1, 2], b: ['L', 1, 0] }
  ];
  // 用「另一半颜色」当身份证，追踪 4 个白棱分别在哪、白色朝哪一侧
  function whiteEdgeMap(s) {
    var map = {};
    EDGE_POS.forEach(function (e) {
      var c1 = at(s, e.a[0], e.a[1], e.a[2]), c2 = at(s, e.b[0], e.b[1], e.b[2]);
      var other = c1 === C.W ? c2 : c2 === C.W ? c1 : -1;
      if (other >= 0 && other !== C.W) {
        map[other] = { pos: e.name, whiteAt: c1 === C.W ? 'a' : 'b' };
      }
    });
    return map;
  }

  function describe(stage, mv, before, after, pBefore, pAfter) {
    // 白十字阶段：不用套话，直接说清「哪个白棱从哪移到哪、为什么」
    if (stage.id === 1) {
      var mb = whiteEdgeMap(before), ma = whiteEdgeMap(after), changed = [];
      Object.keys(mb).forEach(function (k) {
        var b = mb[k], a = ma[k];
        if (a && (b.pos !== a.pos || b.whiteAt !== a.whiteAt)) changed.push({ k: k, b: b, a: a });
      });
      if (changed.length) {
        var x = changed[0], nm = COLOR_NAME[x.k], from = x.b.pos, dest = x.a.pos, head;
        if (pAfter > pBefore) {
          head = '把白' + nm + '棱从 ' + from + ' 送到底层 ' + dest + '：白色朝下、侧色对准同色中心，第 ' + pAfter + ' 条十字臂完成。';
        } else if (dest.charAt(0) === 'U') {
          head = '把白' + nm + '棱从 ' + from + ' 顶到顶层 ' + dest + '，接着转顶层让它对准同色中心，再翻下去。';
        } else if (from.charAt(0) === 'U') {
          head = '把白' + nm + '棱从顶层 ' + from + ' 翻到 ' + dest + '，注意侧色有没有对准中心——错了要重新顶上来。';
        } else {
          head = '把白' + nm + '棱从 ' + from + ' 移到 ' + dest + '，调整位置和朝向，为落底做准备。';
        }
        return algText(mv.seq) + '：' + head + (changed.length > 1 ? '（这一步同时带动了另一个白棱）' : '');
      }
    }
    var bits = [];
    bits.push(mv.text);
    if (pAfter > pBefore) {
      bits.push('完成后 ' + stage.short + '进度 ' + pBefore + ' → ' + pAfter + '，' + stage.unit + '到位。');
    } else if (pAfter === pBefore) {
      bits.push('这一步是在调整位置/朝向，为下一块归位做准备——进度暂时不变是正常的。');
    } else {
      bits.push('这一步会暂时打乱局部，公式走完后会自行恢复；继续跟着做即可。');
    }
    return bits.join('');
  }

  function solve(initial, opts) {
    opts = opts || {};
    var s = (initial || solvedState()).slice();
    var stages = [], steps = [], stats = { searches: 0, nodes: 0, ms: 0, moves: 0 };
    var t0 = Date.now();
    for (var si = 0; si < STAGES.length; si++) {
      var stage = STAGES[si];
      var units = [];
      var from = stage.startAt || 1;
      for (var t = from; t <= stage.target; t++) {
        var pNow = stage.progress(s);
        if (pNow >= t) continue;
        (function (target) {
          var goal = function (st) { return stage.progress(st) >= target; };
          var budget = stage.maxNodes || opts.maxNodes || 300000;
          var res = bfs(s, stage.moves, goal, stage.maxDepth, budget);
          stats.searches++; stats.nodes += res.nodes;
          if (!res.path) {
            // 兜底：放开到全部 18 种基础转动，并加深两层
            res = bfs(s, BASIC_MOVES, goal, stage.maxDepth + 2, budget * 2);
            stats.searches++; stats.nodes += res.nodes;
          }
          if (!res.path) {
            throw new Error('阶段 ' + stage.id + '「' + stage.name + '」子目标 ' + target +
              ' 求解失败（' + (res.reason || '未知') + '，探索 ' + res.nodes + ' 节点）。');
          }
          for (var u = 0; u < res.path.length; u++) {
            var mv = res.path[u];
            var before = s.slice(), pBefore = stage.progress(before), frames = [];
            for (var q = 0; q < mv.seq.length; q++) { s = applyMove(s, mv.seq[q]); frames.push(s.slice()); }
            var pAfter = stage.progress(s);
            var unit = {
              stage: stage.id, stageName: stage.name, notation: algText(mv.seq),
              label: mv.label, text: describe(stage, mv, before, s, pBefore, pAfter),
              progressBefore: pBefore, progressAfter: pAfter,
              stateBefore: before, stateAfter: s.slice(), frames: frames
            };
            units.push(unit); steps.push(unit); stats.moves += mv.seq.length;
          }
        })(t);
      }
      stages.push({
        id: stage.id, name: stage.name, short: stage.short, goal: stage.goal, hint: stage.hint,
        units: units, moveCount: units.reduce(function (a, u) { return a + u.frames.length; }, 0)
      });
    }
    stats.ms = Date.now() - t0;
    return {
      ok: true, initialState: (initial || solvedState()).slice(), finalState: s,
      solved: isSolved(s), stages: stages, steps: steps, stats: stats,
      STAGE_META: STAGES.map(function (x) {
        return { id: x.id, name: x.name, short: x.short, goal: x.goal, hint: x.hint };
      })
    };
  }

  // 可复现的伪随机打乱（避免 Math.random 导致验证不可复现）
  function makeRng(seed) {
    var x = (seed >>> 0) || 1;
    return function () { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };
  }
  function randomScramble(n, seed) {
    var rng = makeRng(seed || 20261111), out = [], last = '';
    for (var i = 0; i < (n || 20); i++) {
      var f;
      do { f = FACES[Math.floor(rng() * 6)]; } while (f === last);
      var suf = ['', '2', "'"][Math.floor(rng() * 3)];
      out.push(f + suf); last = f;
    }
    return out;
  }

  var API = {
    FACES: FACES, C: C, COLOR_CHAR: COLOR_CHAR, FACE_COLOR: FACE_COLOR,
    solvedState: solvedState, applyMove: applyMove, applySeq: applySeq,
    parseAlg: parseAlg, algText: algText, isSolved: isSolved, at: at, idx: idx,
    progress: { crossArms: crossArms, bottomCorners: bottomCorners, middleEdges: middleEdges,
      topCrossArms: topCrossArms, topYellowStickers: topYellowStickers,
      topCornersPlaced: topCornersPlaced },
    STAGES: STAGES, BASIC_MOVES: BASIC_MOVES,
    solve: solve, randomScramble: randomScramble, PERM: PERM,
    // 54 个贴纸槽位的 3D 几何（p=cubie 坐标, n=外法向），供 3D 渲染器复用
    GEOM: GEOM, FACE_NORMAL: FACE_NORMAL, rot90: rot90
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.CubeCore = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
