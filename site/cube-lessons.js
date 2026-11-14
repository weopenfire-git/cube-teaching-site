/*
 * cube-lessons.js — 分级课程数据 + 演示序列生成器 + 情况示意图数据
 *
 * 教学设计：
 *  - 初级 7 课 = 层先法七阶段，一课只解决一个单点问题。
 *  - 每课先给「总体公式 / 口诀 / 为什么」，紧接着就是带图的情况选择，下面才是逐转分步演示。
 *  - 第 1 课从真实打乱态起步：白色底面只有中心是白色，用「白色小花法」做出完整白十字。
 *    终点是白十字完成（不是六面复原），这才符合真实学习顺序。
 *  - 第 2–7 课改用「阶段真实状态」：每一课的基准态都由同一个随机打乱经七阶段求解器
 *    逐阶段推进得到（见 gen-stage-states.cjs）。基准态里前序阶段和本课目标都已拼好、
 *    后面还没学的块仍是真的乱的；起点 = 基准态倒做本课公式，演示完回到基准态。
 *    所以「只看有效块」时已完成块确实保色，而没做的块不会伪装成六面复原——
 *    一眼能看出这一课到底拼好了哪一块。第 7 课是唯一终点为六面复原的一课。
 *  - 每种情况的示意图数据（关键面九宫格 + 四周侧条）全部由真实起始状态生成，不是画死的装饰图。
 *
 * 依赖：window.CubeCore（cube-core.js），零其他依赖。
 */
(function (root) {
  'use strict';
  var Cube = root.CubeCore;
  var W = Cube.C.W, Y = Cube.C.Y;

  function invertToken(t) {
    if (t.charAt(1) === '2') return t;
    if (t.charAt(1) === "'") return t.charAt(0);
    return t.charAt(0) + "'";
  }
  function inverseAlg(seq) { return seq.slice().reverse().map(invertToken); }

  /* ---------------- 七课「阶段真实状态」 ----------------
   * 由 gen-stage-states.cjs 用 seed=14 的打乱跑七阶段求解器逐阶段截取，54 位数字＝54 个贴纸槽位颜色
   * （0 白 / 1 黄 / 2 绿 / 3 蓝 / 4 红 / 5 橙，顺序 U R F D L B）。
   * 每一课的终点状态：本课目标已达成、前序成果完好、后面还没学的块是真的乱的。
   * 第 7 课终点才是六面复原——它是最后一步，本来就该复原。 */
  var STAGE_STATE_STR = {
    2: '511114125312444444311322222000000000154555555432332333',
    3: '341215431214444444215222222000000000111555555315333333',
    4: '412111314141444444123222222000000000235555555551333333',
    5: '111111111423444444242222222000000000355555555534333333',
    6: '111111111434444444222222222000000000545555555353333333',
    7: '111111111444444444222222222000000000555555555333333333'
  };
  var STAGE_STATES = {};
  Object.keys(STAGE_STATE_STR).forEach(function (k) {
    STAGE_STATES[k] = STAGE_STATE_STR[k].split('').map(Number);
  });
  function stageState(id) { return STAGE_STATES[id] ? STAGE_STATES[id].slice() : null; }
  function wrongStickers(s) {
    var n = 0;
    for (var i = 0; i < 54; i++) if (s[i] !== Cube.FACE_COLOR[Math.floor(i / 9)]) n++;
    return n;
  }
  // 每课的达标口径：不再一律用「六面复原」，而是该阶段真实完成度
  var STAGE_GOAL = {
    1: { fn: Cube.progress.crossArms,        target: 4, label: '白十字 4/4' },
    2: { fn: Cube.progress.bottomCorners,    target: 4, label: '第一层四个白角 4/4' },
    3: { fn: Cube.progress.middleEdges,      target: 4, label: '中层四条棱 4/4' },
    4: { fn: Cube.progress.topCrossArms,     target: 4, label: '黄十字 4/4' },
    5: { fn: Cube.progress.topYellowStickers,target: 9, label: '顶面 9 格全黄' },
    6: { fn: Cube.progress.topCornersPlaced, target: 4, label: '四个顶角归位 4/4' },
    7: { fn: function (s) { return Cube.isSolved(s) ? 1 : 0; }, target: 1, label: '六面复原' }
  };

  var LEVELS = [
    { id: 'basic', name: '初级 七课复原', desc: '一课只练一个单点问题，跟完就能独立复原魔方', planned: false },
    { id: 'mid', name: '中级 CFOP 入门', desc: '规划中：把层先法升级成速拧手法', planned: true,
      outline: ['F2L 四种基本型：同色 / 异色 / 已连 / 需拆', '2-look OLL：7 条公式分两次顶面全黄',
                '2-look PLL：6 条公式分两次完成顶层排列', '手法与指法：U 层用手指拨、少转整体'] },
    { id: 'adv', name: '高级 全公式与竞速', desc: '规划中：完整公式表与观察训练', planned: true,
      outline: ['OLL 全 57 条 / PLL 全 21 条', 'F2L 进阶：空槽利用与多角度插入',
                '十字预判与 15 秒观察法', '盲解基础：M2 / Old Pochmann'] }
  ];

  function seg(alg, note) { return { alg: alg, note: note }; }
  function C(title, intro, spot, parts) { return { title: title, intro: intro, spot: spot, parts: parts }; }
  // 第 1 课专用：真实起始打乱 + 小花法分段
  function P(title, intro, spot, startAlg, segments) {
    return { title: title, intro: intro, spot: spot, startAlg: startAlg, segments: segments };
  }

  var LESSONS = [
    {
      id: 1, name: '底层白十字', badge: '第 1 课',
      goalLabel: '白十字完成', goal: 'cross',
      goalText: '从「白色底面只有中心一个白点」出发，把 4 条白棱送到底层，白色朝下、侧面颜色对准同色中心。',
      startNote: '本课起点：把魔方白色朝下放，你会看到底面只有中心是白色，四条白棱散落在别处。这就是最开始的样子。',
      principle: '先把 4 条白棱凑成顶面「白色小花」，再逐条对准中心、翻 180° 下去。',
      why: '分两步就不容易错：做小花时只管白色朝上，不用记侧面颜色；小花做好后，每条白棱只要转顶层对准同色中心，再把那面转半圈——白色自然朝下。',
      formula: '小花 → U 对准 → F2 / R2 / B2 / L2',
      formulaName: '第 1 课 核心套路（不是一条固定公式）',
      formulaHint: '先凑小花：白棱卡在中间层，就把它所在那一面转 90° 顶到顶面；沉在最下面一层，就转 180°；白色朝侧面（没朝上）的要先翻正。只要求白色朝上，侧面颜色先不用记。小花做好后，每条白棱转 U 对准同色中心，再把那面转半圈翻到底层。',
      diagram: { face: 'U', focus: W, frameSlots: [1, 3, 5, 7], gray: true, view: { yaw: -34, pitch: -30 },
        hint: '从上面看：蓝框里的白色＝已经翻到顶面、白色朝上的白棱，这些不用再动，只等对准中心翻下去。其余白棱都还散在侧面或下面，看左边立体图找它们在哪儿；斜线块一律不用管。',
        focusHint: '认情况看白色贴纸散在哪儿：上中下三层都有 → 情况 1；两条卡在中间层侧面 → 情况 2；顶层有白棱但白色朝侧面 → 情况 3；四条全在中层带、顶面一个白棱都没有 → 情况 4' },
      cases: [
        P('情况 1 白棱散在上中下三层（最常见）',
          '真实打乱后最常见的一局：1 条白棱已经翻到顶面（白色朝上），2 条卡在中间层（白色朝侧面），还有 1 条沉在最下面一层。位置不同、顶法不同：中间层的转那一面 90°，最下面一层的转 180°。先把它们全顶到顶面凑成小花，再逐条对准中心翻下去。',
          '底面只有中心白；顶面 1 条朝上，中层 2 条、底层 1 条白色朝侧面 → 分别顶上来',
          "U B' R' F2 R' F' B2 L F'",
          [ { kind: 'daisy', alg: "L B U2 B2" },
            { kind: 'arm', alg: 'U2 F2' }, { kind: 'arm', alg: 'R2' },
            { kind: 'arm', alg: 'B2' }, { kind: 'arm', alg: 'L2' } ]),
        P('情况 2 白棱卡在中间层（白色朝侧面）',
          '顶面已有 2 条白棱朝上，另外 2 条卡在中间那一层、白色朝侧面——从四个侧面能看见白条，俯视却看不到。已经朝上的不用动，只把中间层这两条各转一次侧面 90° 顶到顶面，凑齐小花；再逐条对准同色中心翻 180° 下去。',
          '底面只有中心白；顶面 2 条朝上 + 中间层 2 条白色朝侧面 → 只补这两条',
          "U2 L2 B' R2 L F2 L U2 R2",
          [ { kind: 'daisy', alg: "F R'" },
            { kind: 'arm', alg: 'U2 F2' }, { kind: 'arm', alg: 'R2' },
            { kind: 'arm', alg: 'B2' }, { kind: 'arm', alg: 'L2' } ]),
        P('情况 3 白棱在顶层，但白色朝侧面',
          '最容易看错的一局：白棱人已经在最上层了，可白色贴纸朝前、朝侧面，从上面根本看不见白，所以它还不算进小花。先用 U 把它挪到合适位置，再转侧面把它翻成白色朝上。千万别因为「它已经在顶层」就跳过。',
          '底面只有中心白；顶层有白棱但白色朝侧面（俯视看不到白）→ 先翻正再凑小花',
          "U2 R' F2 R' B F' B2 L' B2",
          [ { kind: 'daisy', alg: "L' F B'" },
            { kind: 'arm', alg: 'R2' }, { kind: 'arm', alg: 'L2' },
            { kind: 'arm', alg: 'U2 F2' }, { kind: 'arm', alg: 'B2' } ]),
        P('情况 4 四条白棱全卡在中间层（顶面 0 条）',
          '四条白棱一条都没到顶面，全卡在中间那一层、白色朝侧面。俯视顶面一个白棱都看不到，只能从四个侧面看见白条。四条都要逐次用侧面转动顶上来，凑成小花后再对准中心翻下去。这是动手最多、也最能练熟「顶上来」手法的一局。',
          '底面只有中心白；顶面 0 条白棱，四条全在中层带 → 四条全部顶上来',
          "U D2 L' D2 B F U F2 L",
          [ { kind: 'daisy', alg: "F U' F2 L B" },
            { kind: 'arm', alg: 'F2' }, { kind: 'arm', alg: 'R2' },
            { kind: 'arm', alg: 'B2' }, { kind: 'arm', alg: 'L2' } ])
      ]
    },
    {
      id: 2, name: '底面四个角', badge: '第 2 课',
      goalLabel: '白色第一层完成（其余仍乱）', goal: 'stage2',
      goalText: '白十字已经做好，本课把还差的那一个白角压回底层；中间层和顶层还没学，做完也不会自己变好。',
      startNote: '本课起点：白十字已经做好并保留颜色，四个白角里还差一个没归位；中间层和顶层仍是真的打乱的。跟着做完只多拼好这一个白角，不是六面复原。',
      principle: '角块放到右前上方，重复「右上左下」直到白色朝下。',
      why: '一个公式管所有角：不用背四种情况，朝向不对就多做几次，它自己会翻正。',
      formula: "R U R' U'",
      formulaName: '核心公式：右手循环（右上左下）',
      formulaHint: '做完一次低头看右前下角：白色没朝下就再做一次，最多三次一定翻正。',
      diagram: { face: 'U', focus: W, view: { yaw: -34, pitch: -34 },
        hint: '看顶面：带白色的角块就是要处理的块。', focusHint: '白色角块落在哪一角' },
      cases: [
        C('情况 1 标准一遍', '目标角在右前上方，做一遍右手循环就归位。',
          '右前上方有一个白角，白色朝右 → 做一遍右手循环',
          [seg('R U', 'R 把右前上角抬起来，U 把要处理的角块转到工作位'),
           seg("R' U'", 'R′ 把角块带回底层，U′ 让顶层归位，检查白色是否朝下')]),
        C('情况 2 朝向不对，重复做', '同一个角做一遍没翻正，就原样再来一遍，别换别的公式。',
          '白角朝前/朝上，一遍翻不正 → 原样多来几遍',
          [seg("R U R' U'", '第一遍：改变角块朝向，白色还没朝下'),
           seg("R U R' U'", '第二遍：继续压这个角，直到白色朝下、侧色对齐')]),
        C('情况 3 另一种朝向', '角块白色朝向不同，用反方向的循环处理。',
          '白角朝向与情况 1 相反 → 用反向循环',
          [seg("R U' R' U", 'R 抬起来，U′ 反向错开，R′ 放回，U 收尾')])
      ]
    },
    {
      id: 3, name: '中间层棱块', badge: '第 3 课',
      goalLabel: '下面两层完成（顶层仍乱）', goal: 'stage3',
      goalText: '白色第一层已经做好，本课把还差的那一条中层棱插回槽位；顶层还没学，保持打乱。',
      startNote: '本课起点：白色第一层已经做好并保留颜色，四条中层棱里还差一条没插进去；顶层仍是真的打乱的。跟着做完只多拼好这一条中层棱，不是六面复原。',
      principle: '顶层棱块对准中心后，往左插或往右插。',
      why: '插入公式会暂时拆开第一层，但公式走完它自己合回去——这是新手最容易被吓到的地方。',
      formula: "U R U' R' U' F' U F",
      formulaName: '核心公式：右插（把棱块送进右前中层）',
      formulaHint: '棱块要往右走用右插，往左走用左插；换个朝向就整体转魔方，公式不用改。',
      diagram: { face: 'U', focus: Y, view: { yaw: -32, pitch: 26 },
        hint: '看顶面：没有黄色的棱块，就是要送进中层的那一块。', focusHint: '顶层不含黄色的棱块在哪' },
      cases: [
        C('情况 1 右插', '棱块的侧面颜色已经对准中心，需要把它送进右前中层。',
          '顶层棱块侧色已对准中心，要往右走 → 右插',
          [seg('U', '把棱块挪到工作位，让开右前角'),
           seg("R U' R'", 'R 抬起右前角，U′ 躲开，R′ 把角放回去'),
           seg("U' F' U F", '从前侧把棱块推进中层，第一层自动合回原样')]),
        C('情况 2 左插', '棱块要往左边走，用镜像的左插公式。',
          '同一个棱块要往左走 → 左插（镜像公式）',
          [seg("U' F' U F", '先从前侧让位，把左前角打开'),
           seg("U R U' R'", '从右侧把棱块推进左前中层，第一层复原')]),
        C('情况 3 换个朝向（整体转魔方）', '目标槽位不在正面时，先整体转魔方把那一面转到前面，做完再转回来。',
          '目标槽位在侧面/背面 → 先整体转魔方 y',
          [seg('y', '整体转魔方 90°（注意：不是转某一层），把目标槽位转到右前'),
           seg("U R U' R' U' F' U F", '照原样做右插公式'),
           seg("y'", '整体转回原握法，白色仍在下、绿色仍朝前')])
      ]
    },
    {
      id: 4, name: '顶层黄十字', badge: '第 4 课',
      goalLabel: '黄十字完成（不是顶面全黄）', goal: 'stage4',
      goalText: '下面两层已经做好，本课只让顶面 4 条棱翻成黄色；四个角和侧面顶行还没做，保持打乱。',
      startNote: '本课起点：下面两层已经做好并保留颜色，顶面四个角还没翻正（本课不管，所以打上斜线）。只看四条棱位上有几条黄：0 条是点，2 条相邻是 L 形，2 条相对是直线。做完得到黄十字，不是顶面全黄、更不是六面复原。',
      principle: '数棱位上的黄棱：0 条是点，2 条相邻是 L，2 条相对是直线。',
      why: '这一步只管「棱块的黄色朝上」，角块黄不黄完全不用看。所以图里把角块全打上斜线，只留十字轮廓。',
      formula: "F R U R' U' F' / F U R U' R' F'",
      formulaName: '两条公式：直线用前者，L 形用后者，点要连做两遍',
      formulaHint: '点做两遍；L 形摆成「左上 + 上」用第二条；直线横着摆用第一条。摆错方向会白做一遍。',
      diagram: { face: 'U', focus: Y, view: { yaw: -20, pitch: 60 },
        hint: '只看四条棱位（上下左右中间那格）：四个角已经打上斜线，因为它们不是本课目标。四周小条里出现的黄色，是还没翻正、贴在侧面的黄棱，正是要翻上来的那些。', focusHint: '蓝色框里的黄棱数：0 个 = 点，2 个相邻 = L 形，2 个相对 = 直线' },
      cases: [
        C('情况 1 只有中心一个黄点（0 条黄棱）',
          '俯视顶面：只有正中间是黄色，四条棱上一条黄都没有，角上也不是黄十字的一部分。这是最难、动手最多的一局，要做两遍公式：第一遍先翻出一条线或一个小角，第二遍才把四条黄棱凑齐。',
          '顶面只有中心黄，四个棱位 0 条黄 → 两遍公式推到黄十字',
          [seg("F R U R' U' F'", '第一遍：把两条黄棱翻上来，从一个点变成一条直线'),
           seg('U2', '转顶层 180°，把刚做出的直线横着摆正，第二遍公式才有效'),
           seg("F U R U' R' F'", '第二遍：剩下两条黄棱也翻上来，黄十字完成')]),
        C('情况 2 小角 L 形（2 条相邻黄棱）',
          '顶面有两条黄棱，但它们挨在一起，像一个小角的 L，不是一条直线。把 L 摆成「左上 + 上」这个朝向，用 L 形专用公式一遍就能推成黄十字。别和直线混用公式。',
          '顶面两条黄棱相邻成 L 形 → 摆正后用 L 形公式',
          [seg('F U', '起手：先抬前面、转顶层，把 L 形保持在工作朝向'),
           seg("R U' R' F'", '收尾：四条黄棱翻正，黄十字完成')]),
        C('情况 3 一条直线（2 条相对黄棱）',
          '顶面两条黄棱正好相对，连成一条直线。把这条线横着摆（左右两端是黄），再用直线专用公式一遍推成十字。摆成竖的会白做一遍。',
          '顶面两条黄棱相对成一条直线 → 横着摆后用直线公式',
          [seg('F R U', '起手：抬前面、转右层、转顶层，开始翻棱'),
           seg("R' U' F'", '收尾：四条黄棱全部朝上，黄十字完成')])
      ]
    },
    {
      id: 5, name: '顶面全黄', badge: '第 5 课',
      goalLabel: '顶面九格全黄（角的位置仍乱）', goal: 'stage5',
      goalText: '黄十字和下面两层已经做好，本课只把四个顶角的黄色翻到上面；角的位置和四条顶棱还没归位，保持打乱。',
      startNote: '本课起点：黄十字和下面两层已经做好并保留颜色，四个顶角的黄色还没全朝上，角的位置也还没排好（那是第 6 课，本课不管）。跟着做完只多拼好角的朝向，不是六面复原。',
      principle: '黄色小鱼头朝左上，做 Sune；反过来做 Anti-Sune。',
      why: '只改角的朝向，不动角的位置，也不碰下面两层——所以黄十字不会散。',
      formula: "R U R' U R U2 R'",
      formulaName: '核心公式：小鱼（Sune）',
      formulaHint: '做完顶面没全黄别慌，转一下顶层再做一次，最多三次一定全黄。',
      diagram: { face: 'U', focus: Y, view: { yaw: -20, pitch: 60 },
        hint: '看顶面：哪几个角已经黄色朝上，像不像一条小鱼。', focusHint: '黄色角块的分布，也就是小鱼朝哪边' },
      cases: [
        C('情况 1 标准小鱼', '只有一个角黄色朝上，把它摆在左前，做 Sune。',
          '只有一个角朝上黄，像小鱼 → Sune',
          [seg("R U R' U", '把角块抬起、错开、放回，开始改变朝向'),
           seg("R U2 R'", '顶层转半圈再收回，四个角的黄色一起翻到顶面')]),
        C('情况 2 反小鱼', '黄色角分布方向相反，用镜像公式。',
          '黄色角分布方向相反 → Anti-Sune',
          [seg("R U2 R' U'", '先转半圈再抬起，走镜像路径'),
           seg("R U' R'", '收尾，顶面全黄，下面两层完好')]),
        C('情况 3 先摆方向', '鱼头方向不对，先转顶层再套公式。',
          '鱼头方向不对 → 先转 U 摆正再做 Sune',
          [seg('U', '把唯一朝上的黄色角摆到左前'),
           seg("R U R' U R U2 R'", '做 Sune，顶面翻成全黄')])
      ]
    },
    {
      id: 6, name: '顶层角块归位', badge: '第 6 课',
      goalLabel: '四个顶角归位（顶棱仍乱）', goal: 'stage6',
      goalText: '顶面已经全黄、下面两层已经做好，本课只把四个顶角换回各自的位置；四条顶棱仍在乱序中，保持打乱。',
      startNote: '本课起点：顶面已经全黄、下面两层已经做好，都保留颜色；四个顶角的侧面颜色还没对齐，四条顶棱的位置也还没排（第 7 课才做，本课先打上斜线）。跟着做完只多拼好这四个角的位置，不是六面复原。',
      principle: '顶面全黄后，用换角公式做三循环，配合 U 逐个送回家。',
      why: '看起来最难的一步其实只用一个公式：找一个已经对的角，把它放在右前，剩下的自动轮换。',
      formula: "R' F R' B2 R F' R' B2 R2",
      formulaName: '核心公式：Aa 换角',
      formulaHint: '公式只循环三个角、不动棱块，所以顶面全黄和下面两层都不会被破坏。',
      diagram: { face: 'U', focus: Y, view: { yaw: -30, pitch: 38 },
        hint: '顶面已全黄，看四周小条：哪一面的两个角颜色已经和本面对上，那个角就归位了；四条顶棱打上斜线，它们真的还在乱序里，本课不管。', focusHint: '四周侧条里哪一面两个角同色' },
      cases: [
        C('情况 1 Aa 换角', '把已经归位的角放在右前，做一遍 Aa。',
          '有一个角侧色全对 → 放右前，做 Aa',
          [seg("R' F R'", '拉开右前角，让三个角进入循环通道'),
           seg("B2 R F' R' B2 R2", '后半段完成三角轮换并把魔方合回原状')]),
        C('情况 2 先转顶层找位置', '没有角在正确位置时，先随便做一遍，再转 U 找对齐的角。',
          '没有角对齐 → 先转 U 再做一遍',
          [seg('U', '转顶层找一个侧面颜色已经对上的角'),
           seg("R' F R' B2 R F' R' B2 R2", '做 Aa 换角，四个角逐步归位')]),
        C('情况 3 反方向轮换', '需要往相反方向换角时用 Ab。',
          '三个角要往反方向换 → 用 Ab',
          [seg("R2 B2 R F R' B2 R F' R", 'Ab 公式：Aa 的逆方向，同样不动棱块')])
      ]
    },
    {
      id: 7, name: '顶层棱块归位', badge: '第 7 课',
      goalLabel: '六面复原（七课里唯一）', goal: 'stage7',
      goalText: '把最后 4 个顶层棱块归位，六个面全部复原——前面六课的东西都已经做好了。',
      startNote: '本课起点：前面六课的成果都做好了，下面两层、顶面全黄、四个顶角都已归位并保留颜色，只剩四条顶棱的位置不对。这一课做完才是六面复原。',
      principle: '用 U 排列公式轮换三个棱，最后转一下顶层对齐。',
      why: '最后一步最容易出「全对了但顶层歪一圈」——那不是错了，转一下 U 就好。',
      formula: "R U' R U R U R U' R' U' R2",
      formulaName: '核心公式：Ua 棱循环',
      formulaHint: '找一个侧面完全对齐的面朝后，做 Ua；不行就再做一遍，最后 U 对齐。',
      diagram: { face: 'U', focus: Y, view: { yaw: -30, pitch: 38 },
        hint: '顶面已全黄，看四周小条：三条侧行里哪一面已经三格同色。', focusHint: '四周侧条里哪一面三格同色' },
      cases: [
        C('情况 1 Ua 棱循环', '三个棱需要顺时针轮换，做一遍 Ua。',
          '三个顶棱要顺时针轮换 → Ua',
          [seg("R U' R U R U", '前段：反复抬放右层，把三个顶棱带进循环'),
           seg("R U' R' U' R2", '后段：合回底层并完成三棱轮换')]),
        C('情况 2 Ub 反向循环', '需要反方向轮换时用 Ub。',
          '三个顶棱要反方向轮换 → Ub',
          [seg("R2 U R U R' U' R'", '前段：从 R2 起手，走 Ua 的镜像路径'),
           seg("U' R' U R'", '后段：收尾，其余块全部不动')]),
        C('情况 3 最后对齐顶层', '六个面都对了，只有顶层整体歪了一格。',
          '六面都对，只有顶层整体歪一格 → 最后 U′ 对齐',
          [seg("U R U' R U R U R U' R' U' R2", '先摆正再完成最后一轮棱循环'),
           seg("U'", '顶层转回，六个面同时复原')])
      ]
    }
  ];

  // 九宫格「要盯的格子」：只有这些位置保色并描蓝框，其余一律打上斜线。
  // 0..8 对应九宫格从上到下、从左到右；棱位=1,3,5,7，角位=0,2,6,8，中心=4。
  // 关键：不再让第 4/5/6/7 课的 U 面整片全黄——按本课目标只点亮该看的那几格。
  var FRAME_SLOTS = {
    1: [1, 3, 5, 7],   // 白十字：顶面四条白棱（小花）
    2: [0, 2, 6, 8],   // 底面四角：顶面四个角上的白角
    3: [1, 3, 5, 7],   // 中间层：顶层棱块里不含黄色的那一块
    4: [1, 3, 4, 5, 7],// 黄十字：四条棱位 + 中心；四个角打上斜线
    5: [0, 2, 6, 8],   // 顶面全黄：只看四个角的朝向
    6: [0, 2, 6, 8],   // 角归位：只看四个角（棱位打上斜线）
    7: [1, 3, 5, 7]    // 棱归位：只看四条棱（角位打上斜线）
  };
  // 四周侧条该亮哪几格（0=该面顶行左角, 1=中间, 2=右角）
  var STRIP_SLOTS = {
    1: [0, 1, 2], 2: [0, 2], 3: [1], 4: [1], 5: [0, 2], 6: [0, 2], 7: [1]
  };
  // 每课的「只看有效块」说明：明确告诉读者斜线阴影的是什么、彩色的是什么
  var FOCUS_NOTE = {
    1: '只看白十字目标：白心和四条白棱保留颜色，白色角块也一起打上斜线——第一步不处理角块，其余块本来就是乱的。',
    2: '只看底面四个角：已经拼好的白十字和三个白角保留颜色，本课要归位的那一个白角描蓝框；中层和顶层还没学，打上斜线，而且它们在魔方上是真的没拼好。',
    3: '只看中间层：已经拼好的白色第一层和三条中层棱保留颜色，要插入的那条棱描蓝框；顶层还没学，打上斜线且真的乱着。',
    4: '只看顶层黄十字：已经拼好的下面两层保留颜色，顶面四条棱位高亮；四个角和侧面顶行打上斜线，它们是真的还没做，所以做完只是黄十字，不会变成顶面全黄。',
    5: '只看顶面四个角：黄十字和下面两层保留颜色，四个角高亮；顶棱位置还没归位，打上斜线且真的乱着。',
    6: '只看顶层四个角：顶面全黄和下面两层保留颜色，四个角的侧面颜色高亮；四条顶棱打上斜线，它们是真的还在乱序里。',
    7: '只看顶层四条棱：前面六课的成果全部保留颜色，四条棱的侧面颜色高亮；本课做完才轮到六面复原。'
  };

  /* ---------------- 3D「突出块显示」槽位 ----------------
   * 规则：已完成的部分保留颜色作为参照；本课要处理的块保留颜色并额外描蓝框；
   *       其余「还没完成、也不是本步要做的」一律打上斜线。
   * 槽位 = FACES.indexOf(面)*9 + 行*3 + 列，与 cube-core 的 at() 一致。
   * 第 1 课特殊：白色棱块散落全 cube，按颜色 + 非角块判定更准，走渲染器 cross 模式。 */
  function S(f, r, c) { return Cube.FACES.indexOf(f) * 9 + r * 3 + c; }
  function uCells(list) { return list.map(function (i) { return S('U', Math.floor(i / 3), i % 3); }); }
  function sideCells(row, cols) {
    var a = [];
    ['F', 'R', 'B', 'L'].forEach(function (f) {
      cols.forEach(function (c) { a.push(S(f, row, c)); });
    });
    return a;
  }
  function allD() { var a = []; for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) a.push(S('D', r, c)); return a; }
  var U_ALL = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  // 已完成的下两层：白色底面 + 四个侧面的中行与底行
  var LOWER = allD().concat(sideCells(1, [0, 1, 2]), sideCells(2, [0, 1, 2]));
  var FOCUS3D = {
    1: null,
    2: { keep: allD().concat(sideCells(2, [0, 1, 2]), uCells([0, 2, 6, 8]), sideCells(0, [0, 2])),
         accent: uCells([0, 2, 6, 8]).concat(sideCells(0, [0, 2])) },
    3: { keep: LOWER.concat(uCells([1, 3, 5, 7]), sideCells(0, [1])),
         accent: sideCells(1, [0, 2]).concat(uCells([1, 3, 5, 7]), sideCells(0, [1])) },
    4: { keep: LOWER.concat(uCells([1, 3, 4, 5, 7]), sideCells(0, [1])),
         accent: uCells([1, 3, 5, 7]).concat(sideCells(0, [1])) },
    5: { keep: LOWER.concat(uCells(U_ALL)),
         accent: uCells([0, 2, 6, 8]) },
    6: { keep: LOWER.concat(uCells(U_ALL), sideCells(0, [0, 2])),
         accent: sideCells(0, [0, 2]).concat(uCells([0, 2, 6, 8])) },
    7: { keep: LOWER.concat(uCells(U_ALL), sideCells(0, [1])),
         accent: sideCells(0, [1]).concat(uCells([1, 3, 5, 7])) }
  };
  function focus3d(lessonId) { return FOCUS3D[lessonId] || null; }

  LESSONS.forEach(function (les) {
    les.diagram.frameSlots = FRAME_SLOTS[les.id];
    les.diagram.stripSlots = STRIP_SLOTS[les.id];
    les.diagram.gray = true;              // 全课统一：不在焦点槽位的一律打上斜线
    les.diagram.stripMode = les.id === 1 ? 'color' : 'slot';
    les.focusNote = FOCUS_NOTE[les.id];
  });

  /* ---------------- 示意图数据（真实状态生成） ---------------- */
  // 主九宫格取关键面；四周小条取相邻面靠近该面的那一行（与教材俯视图同构）
  var SIDE_ORDER = {
    U: { top: ['B', 0], right: ['R', 0], bottom: ['F', 0], left: ['L', 0] },
    D: { top: ['F', 2], right: ['R', 2], bottom: ['B', 2], left: ['L', 2] }
  };
  function diagramData(state, lesson) {
    var cfg = lesson.diagram, face = cfg.face, cells = [];
    for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) cells.push(Cube.at(state, face, r, c));
    var s = SIDE_ORDER[face], strips = {};
    Object.keys(s).forEach(function (k) {
      var f = s[k][0], row = s[k][1], arr = [];
      for (var c2 = 0; c2 < 3; c2++) arr.push(Cube.at(state, f, row, c2));
      strips[k] = arr;
    });
    return { face: face, focus: cfg.focus, frameSlots: cfg.frameSlots || [],
      stripSlots: cfg.stripSlots || [0, 1, 2], stripMode: cfg.stripMode || 'slot', gray: !!cfg.gray,
      cells: cells, strips: strips,
      hint: cfg.hint, focusHint: cfg.focusHint, focusNote: lesson.focusNote || '',
      view: cfg.view };
  }

  /* ---------------- 逐转讲解 ---------------- */
  var FACE_CN = { U: '顶层', D: '底层', F: '前面', B: '后面', R: '右面', L: '左面' };
  var ARM_COLOR = { F: '绿', R: '红', B: '蓝', L: '橙' };
  function describeToken(t) {
    var f = t.charAt(0), suf = t.slice(1);
    var d = suf === '2' ? '转 180°' : suf === "'" ? '逆时针 90°' : '顺时针 90°';
    if (f === 'y') return '整体转魔方 ' + d + '（不是转层）';
    return FACE_CN[f] + d;
  }
  // 第 1 课：小花法分段生成，每一转都有具体目的，不刷套话
  function expandDaisy(c) {
    var tokens = [], notes = [], armNo = 0;
    c.segments.forEach(function (g) {
      var ts = Cube.parseAlg(g.alg);
      if (!ts.length) return;                       // 小花已现成，没有动作
      if (g.kind === 'daisy') {
        ts.forEach(function (t, i) {
          tokens.push(t);
          notes.push(i === 0
            ? '先把没到顶层的白棱顶上来，凑成一朵「白色小花」：只要求白色朝上，侧面颜色先不用管。'
            : '接着 ' + t + '：' + describeToken(t) + '，继续把白棱往顶面送。');
        });
      } else {
        armNo++;
        var last = ts[ts.length - 1], face = last.charAt(0), color = ARM_COLOR[face] || '';
        var hasU = ts.length > 1;
        var head = '第 ' + armNo + ' 条十字臂：找白' + color + '棱，' +
          (hasU ? '先转顶层让它的' + color + '色对准' + color + '色中心。'
                : '它已经对准' + color + '色中心，' + last + ' 直接把它翻到底层，第 ' + armNo + ' 条十字臂完成。');
        ts.forEach(function (t, i) {
          tokens.push(t);
          if (i === 0) notes.push(head);
          else notes.push('接着 ' + t + '：' + describeToken(t) + '，把白' + color +
            '棱翻到底层，白色朝下、' + color + '色朝外，第 ' + armNo + ' 条十字臂完成。');
        });
      }
    });
    return { tokens: tokens, notes: notes };
  }
  // 第 2–7 课：段内第一转讲目的，后续转讲具体动作，避免重复刷屏
  function expandParts(c) {
    var tokens = [], notes = [];
    c.parts.forEach(function (p) {
      var ts = Cube.parseAlg(p.alg);
      ts.forEach(function (t, i) {
        tokens.push(t);
        notes.push(i === 0 ? p.note : '接着 ' + t + '：' + describeToken(t) + '，把这一段做完');
      });
    });
    return { tokens: tokens, notes: notes };
  }
  function expand(c) { return c.segments ? expandDaisy(c) : expandParts(c); }

  function buildDemo(lessonIndex, caseIndex) {
    var lesson = LESSONS[lessonIndex], c = lesson.cases[caseIndex];
    var ex = expand(c), tokens = ex.tokens;
    // 第 1 课用真实打乱起步；第 2–7 课从「阶段真实状态」倒做本课公式，
    // 所以演示终点＝该阶段真实状态：已完成块真的拼好、没学的块真的还乱着。
    var base = c.startAlg ? Cube.solvedState() : stageState(lesson.id);
    var start = c.startAlg
      ? Cube.applySeq(base, Cube.parseAlg(c.startAlg))
      : Cube.applySeq(base, inverseAlg(tokens));
    var states = [start];
    for (var i = 0; i < tokens.length; i++) states.push(Cube.applyMove(states[i], tokens[i]));
    var final = states[states.length - 1];
    var g = STAGE_GOAL[lesson.id], pg = STAGE_GOAL[lesson.id - 1];
    var goalStart = g.fn(start), goalEnd = g.fn(final);
    var solvedEnd = Cube.isSolved(final);
    // 第 1–6 课终点必须「本课目标达成 + 六面没有复原」；第 7 课才允许六面复原
    var goalMet = goalEnd === g.target && (lesson.id === 7 ? solvedEnd : !solvedEnd);
    return {
      lessonIndex: lessonIndex, caseIndex: caseIndex,
      title: lesson.badge + ' ' + lesson.name + ' / ' + c.title,
      intro: c.intro, spot: c.spot, tokens: tokens, notes: ex.notes, states: states,
      startState: start, finalState: final,
      goalMet: goalMet, goalLabel: lesson.goalLabel, goal: lesson.goal,
      goalStart: goalStart, goalEnd: goalEnd, goalTarget: g.target, goalName: g.label,
      priorKept: pg ? pg.fn(start) === pg.target : true,
      solvedEnd: solvedEnd, wrongFinal: wrongStickers(final),
      startNote: lesson.startNote,
      // 兼容旧字段：restored 现在表示「达成该课目标」
      restored: goalMet,
      diagram: diagramData(start, lesson)
    };
  }

  // 起始态的白色底面统计（第 1 课自检用）
  function whiteOnD(s) {
    var n = 0;
    for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) if (Cube.at(s, 'D', r, c) === W) n++;
    return n;
  }

  var API = {
    LEVELS: LEVELS, LESSONS: LESSONS, buildDemo: buildDemo,
    inverseAlg: inverseAlg, expand: expand, diagramData: diagramData, whiteOnD: whiteOnD,
    focus3d: focus3d, stageState: stageState, stageGoal: function (id) { return STAGE_GOAL[id]; },
    wrongStickers: wrongStickers
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.CubeLessons = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
