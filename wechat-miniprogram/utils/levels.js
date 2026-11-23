/**
 * PopCore — 《捏个痛快！》(Pop It Off!) 核心纯逻辑引擎（三端唯一事实源）
 * 纯逻辑与渲染解耦，支持在 Browser Canvas、Android WebView、微信小程序及 Node AI 模拟器中零差异运行。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.PopCore = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const COLS = 7;
  const ROWS = 8;
  const TOTAL_CELLS = COLS * ROWS;

  // 6 种高明度差果冻泡配色 + 色弱友好几何记号（▲●◆★■♥）
  const BUBBLE_COLORS = [
    { id: 'berry', name: '莓果红', hex: '#e11d48', light: '#fda4af', dark: '#9f1239', mark: '▲' },
    { id: 'amber', name: '柠檬黄', hex: '#eab308', light: '#fef08a', dark: '#a16207', mark: '●' },
    { id: 'mint',  name: '薄荷绿', hex: '#10b981', light: '#6ee7b7', dark: '#047857', mark: '◆' },
    { id: 'sky',   name: '汽水蓝', hex: '#0284c7', light: '#7dd3fc', dark: '#0369a1', mark: '★' },
    { id: 'taro',  name: '芋泥紫', hex: '#7c3aed', light: '#c4b5fd', dark: '#5b21b6', mark: '■' },
    { id: 'peach', name: '蜜桃橙', hex: '#f97316', light: '#fdba74', dark: '#c2410c', mark: '♥' }
  ];

  const COLOR_MAP = {};
  for (let i = 0; i < BUBBLE_COLORS.length; i++) {
    COLOR_MAP[BUBBLE_COLORS[i].id] = BUBBLE_COLORS[i];
  }
  const RAINBOW_META = {
    id: 'rainbow',
    name: '彩虹泡',
    hex: '#ec4899',
    light: '#fbcfe8',
    dark: '#831843',
    mark: '✦'
  };

  function getColorMeta(id) {
    if (id === 'rainbow') return RAINBOW_META;
    return COLOR_MAP[id] || BUBBLE_COLORS[0];
  }

  // 5 套泡泡纸皮肤（含解锁来源 & 专属声音风格）
  const BUBBLE_SKINS = [
    { id: 'classic', name: '经典透明膜', desc: '清脆透亮原厂气泡膜质感', soundMode: 'classic', unlockText: '默认拥有', price: 0, glow: '#ffffff' },
    { id: 'candy',   name: '缤纷糖果泡', desc: '高饱和糖果膜 + 清甜叮咚音', soundMode: 'candy',   unlockText: '商店解锁 (¥6)', price: 6, glow: '#fef08a' },
    { id: 'jelly',   name: 'Q弹果冻泡',  desc: '晶莹水润果冻光感 + 软弹音', soundMode: 'jelly',   unlockText: '商店解锁 (¥6)', price: 6, glow: '#a7f3d0' },
    { id: 'catpaw',  name: '猫爪肉垫泡', desc: '粉色肉垫印花 + 萌系咕噜音', soundMode: 'catpaw',  unlockText: '连续7天日历免费领', price: 0, glow: '#fbcfe8' },
    { id: 'ticket',  name: '复古车票泡', desc: '牛皮纸打孔票根 + 机械清脆音', soundMode: 'ticket', unlockText: '双十一赛季通关解锁', price: 0, glow: '#fde68a' }
  ];

  // 6 章快递房间（每章对应 1 间房，满 5 件解锁满屋装饰彩蛋）
  const CHAPTER_ROOMS = [
    { ch: 1, name: '出租屋卧室', theme: '淘宝小包裹', bg: '#fef3c7', wall: '#fde68a', floor: '#d6a87c', desc: '独居打工人刚安顿好的温馨小窝' },
    { ch: 2, name: '治愈小厨房', theme: '家电大箱子', bg: '#e0f2fe', wall: '#bae6fd', floor: '#e2c49f', desc: '添置空气炸锅与咖啡机的快乐天地' },
    { ch: 3, name: '阳光小阳台', theme: '生鲜冷链包裹', bg: '#dcfce7', wall: '#bbf7d0', floor: '#d8b48a', desc: '绿植、冰饮和慵懒晒太阳的角落' },
    { ch: 4, name: '温暖小客厅', theme: '北方来的年货', bg: '#fee2e2', wall: '#fecaca', floor: '#cfa174', desc: '挂满灯笼与年货礼盒的喜庆客厅' },
    { ch: 5, name: '明亮新家',   theme: '搬家货箱',   bg: '#ede9fe', wall: '#ddd6fe', floor: '#dcb88e', desc: '宽敞整洁、一切从头开始的理想之家' },
    { ch: 6, name: '豪华猫窝',   theme: '猫粮猫砂礼包', bg: '#ffedd5', wall: '#fed7aa', floor: '#e5c195', desc: '贴满主子照片与猫爬架的梦幻领地' }
  ];

  // 30 关配置表（前 30 关 6 章，锯齿难度 + 三段式新机制教学 + 章末纯策略连锁关）
  const CAMPAIGN_CONFIGS = [
    // Ch1 入门 (L1-3)
    { level: 1,  ch: 1, title: '第一份淘宝包裹', colors: 4, moves: 28, goal: { type: 'colors', targets: { berry: 12, amber: 12 } }, item: { icon: '🧦', name: '云朵草莓袜', fineName: '限量刺绣毛绒袜礼盒', quote: '“第一单快递开箱，捏两下就爆！”' }, initSwellBias: [0.35, 0.45, 0.20] },
    { level: 2,  ch: 1, title: '气压连锁入门',   colors: 4, moves: 26, goal: { type: 'colors', targets: { berry: 16, sky: 16 } },   item: { icon: '🎧', name: '奶油桌面音响', fineName: '复古黑胶蓝牙音箱', quote: '“鼓③泡一挤就爆，根本停不下来！”' }, initSwellBias: [0.28, 0.44, 0.28] },
    { level: 3,  ch: 1, title: '小小连爆考验',   colors: 4, moves: 25, goal: { type: 'chain', count: 5 },                          item: { icon: '🕯️', name: '白桃乌龙香薰', fineName: '永生花琉璃香薰灯', quote: '“找准鼓③集中的位置划一短线，轰然连爆！”' }, initSwellBias: [0.22, 0.40, 0.38], presetCluster: 1 },

    // Ch2 气压 (L4-8) - 胶带封口 & 气泵
    { level: 4,  ch: 2, title: '胶带封箱初体验', colors: 4, moves: 25, goal: { type: 'tapes', count: 4 },                          item: { icon: '🍞', name: '迷你吐司机', fineName: '萌爪双槽早餐机', quote: '“在胶带旁边爆破，封条会自动翘边脱落！”' }, tapes: 4, teachPreset: 'tape', initSwellBias: [0.25, 0.45, 0.30] },
    { level: 5,  ch: 2, title: '双门冰箱拆封',   colors: 4, moves: 23, goal: { type: 'combo', tapes: 6, colors: { mint: 18 } },    item: { icon: '🧃', name: '复古气泡水机', fineName: '限量樱花气泡水机', quote: '“先炸胶带再清绿泡，事半功倍！”' }, tapes: 6, initSwellBias: [0.28, 0.44, 0.28] },
    { level: 6,  ch: 2, title: '一笔六连造气泵', colors: 4, moves: 22, goal: { type: 'colors', targets: { berry: 24, sky: 24 } },   item: { icon: '☕', name: '手冲磨豆机', fineName: '胡桃木金爵手冲壶组', quote: '“划满 6 个自动生成十字气泵，横竖全充气！”' }, tapes: 4, initSwellBias: [0.28, 0.44, 0.28] },
    { level: 7,  ch: 2, title: '解救锅具盲盒',   colors: 4, moves: 22, goal: { type: 'toys', count: 2 },                           item: { icon: '🥘', name: '奶油珐琅炖锅', fineName: '鎏金手柄海盐蓝炖锅', quote: '“把玩具上下左右的泡泡捏破就能救出来！”' }, toys: 2, tapes: 4, initSwellBias: [0.28, 0.44, 0.28] },
    { level: 8,  ch: 2, title: '空气炸锅大爆炸', colors: 4, moves: 22, goal: { type: 'chain', count: 7 },                          item: { icon: '🍟', name: '透明视窗炸锅', fineName: '智慧双篮旗舰炸锅', quote: '“撕开周围胶带放气，触发 7 连爆轻松通关！”' }, tapes: 4, presetCluster: 2, initSwellBias: [0.22, 0.42, 0.36] },

    // Ch3 漏气 (L9-13) - 漏气泡 & 双层泡
    { level: 9,  ch: 3, title: '趁热捏爆漏气泡', colors: 5, moves: 22, goal: { type: 'colors', targets: { berry: 20, mint: 20 } },  item: { icon: '🌱', name: '多肉植物小盆', fineName: '手绘釉瓷多肉花园', quote: '“漏气泡每步减 1 气，瘪到底就会变硬壳挡路哦！”' }, leaks: 4, teachPreset: 'leak', initSwellBias: [0.28, 0.44, 0.28] },
    { level: 10, ch: 3, title: '海鲜冷链封条',   colors: 5, moves: 21, goal: { type: 'combo', tapes: 6, colors: { sky: 20 } },     item: { icon: '🍉', name: '冰镇西瓜果盘', fineName: '双层保鲜水晶果盘', quote: '“封箱胶带遇到漏气泡，先护住关键通道！”' }, leaks: 4, tapes: 6, initSwellBias: [0.28, 0.44, 0.28] },
    { level: 11, ch: 3, title: '厚实双层保护泡', colors: 5, moves: 23, goal: { type: 'doubles', count: 5 },                        item: { icon: '🎐', name: '晴天琉璃风铃', fineName: '和风彩绘招福风铃', quote: '“双层泡厚实得很，要划两次或连爆两次才彻底破！”' }, doubles: 8, teachPreset: 'double', initSwellBias: [0.24, 0.44, 0.32] },
    { level: 12, ch: 3, title: '冷鲜箱里的玩偶', colors: 5, moves: 20, goal: { type: 'toys', count: 2 },                           item: { icon: '🪴', name: '垂吊常春藤', fineName: '藤编懒人自动吸水盆栽', quote: '“集中火力击破压在玩具旁的厚泡！”' }, doubles: 4, leaks: 4, toys: 2, initSwellBias: [0.28, 0.44, 0.28] },
    { level: 13, ch: 3, title: '阳台七连爆清凉', colors: 5, moves: 20, goal: { type: 'chain', count: 8 },                          item: { icon: '🪑', name: '条纹休闲躺椅', fineName: '波西米亚编织摇篮椅', quote: '“避开硬化塑料片，沿着鼓③桥梁引爆 8 连！”' }, doubles: 4, leaks: 4, presetCluster: 2, initSwellBias: [0.22, 0.42, 0.36] },

    // Ch4 冰冻 (L14-18) - 冰冻泡 & 大气球
    { level: 14, ch: 4, title: '北方年货破冰',   colors: 5, moves: 22, goal: { type: 'ices', count: 6 },                           item: { icon: '🧧', name: '福字剪纸挂饰', fineName: '非遗绒绣新年挂画', quote: '“冰冻泡不吃连锁空气，得直接划过去才能融化！”' }, ices: 6, teachPreset: 'ice', initSwellBias: [0.26, 0.45, 0.29] },
    { level: 15, ch: 4, title: '速冻饺子大箱',   colors: 5, moves: 21, goal: { type: 'combo', ices: 6, tapes: 5 },                 item: { icon: '🥟', name: '招财陶瓷碗筷', fineName: '景德镇青花全家福餐具', quote: '“打通冰块气路，再让连锁替你撕胶带！”' }, ices: 6, tapes: 5, initSwellBias: [0.26, 0.44, 0.30] },
    { level: 16, ch: 4, title: '冰封手办大营救', colors: 5, moves: 20, goal: { type: 'toys', count: 2 },                           item: { icon: '🏮', name: '暖光宫灯摆件', fineName: '全铜雕花旋转花灯', quote: '“冰封区底下藏着年货礼物，气球 3×3 炸裂超给力！”' }, ices: 6, doubles: 4, toys: 2, initSwellBias: [0.26, 0.44, 0.30] },
    { level: 17, ch: 4, title: '年货坚果礼盒',   colors: 5, moves: 19, goal: { type: 'combo', ices: 7, colors: { berry: 20 } },    item: { icon: '🛋️', name: '焦糖丝绒抱枕', fineName: '手工盘扣团圆刺绣靠垫', quote: '“单次自爆 ≥ 8 个就会出现超级大气球！”' }, ices: 8, leaks: 3, initSwellBias: [0.25, 0.44, 0.31] },
    { level: 18, ch: 4, title: '守岁八连大狂欢', colors: 5, moves: 20, goal: { type: 'chain', count: 9 },                          item: { icon: '📺', name: '暖壁炉投影灯', fineName: '全景极光星空壁炉灯', quote: '“先融关键冰泡连成一片，一发触发 9 连震天响！”' }, ices: 6, presetCluster: 2, initSwellBias: [0.20, 0.44, 0.36] },

    // Ch5 异形 (L19-24) - 硬纸板格 / 钢钉 / 彩虹泡
    { level: 19, ch: 5, title: '搬家 U 形大货箱', colors: 5, moves: 20, goal: { type: 'colors', targets: { berry: 20, taro: 20 } }, item: { icon: '🖼️', name: '落日挂画套装', fineName: '微喷油画鎏金框三联画', quote: '“硬纸板隔断了箱子形状，气泡会顺着空槽滑落！”' }, shape: 'uBox', teachPreset: 'cardboard', initSwellBias: [0.26, 0.44, 0.30] },
    { level: 20, ch: 5, title: '窄腰沙漏纸盒',   colors: 5, moves: 19, goal: { type: 'toys', count: 2 },                           item: { icon: '🪞', name: '波浪云朵穿衣镜', fineName: '智能氛围光拱形大镜', quote: '“沙漏中间狭窄位置极易触发气泵横扫！”' }, shape: 'hourglass', tapes: 4, toys: 2, initSwellBias: [0.26, 0.44, 0.30] },
    { level: 21, ch: 5, title: '小心纸箱钢钉！', colors: 6, moves: 21, goal: { type: 'colors', targets: { mint: 16, peach: 16 } }, item: { icon: '📖', name: '原木阶梯书架', fineName: '胡桃木旋转角架博物馆', quote: '“钢钉每 3 步会把旁边一个泡戳回瘪①，别把主力蓄在它脚边！”' }, shape: 'corners', nails: 2, teachPreset: 'nail', initSwellBias: [0.25, 0.45, 0.30] },
    { level: 22, ch: 5, title: '双隔间冷冻箱',   colors: 6, moves: 22, goal: { type: 'combo', ices: 5, doubles: 3 },               item: { icon: '🎹', name: '折叠便携电钢琴', fineName: '88 键奶油复古老爷琴', quote: '“9 连大长线生成的彩虹泡能在左右隔间自由换色！”' }, shape: 'divider', ices: 6, doubles: 6, initSwellBias: [0.24, 0.44, 0.32] },
    { level: 23, ch: 5, title: '九连彩虹奇遇',   colors: 6, moves: 20, goal: { type: 'colors', targets: { sky: 18, taro: 18, amber: 18 } }, item: { icon: '🛋️', name: '豆腐块布艺沙发', fineName: '云感猫抓布模块化沙发', quote: '“善用彩虹泡中途变色，三色大单也能轻松扫空！”' }, shape: 'diamond', nails: 1, tapes: 4, initSwellBias: [0.22, 0.45, 0.33] },
    { level: 24, ch: 5, title: '新家乔迁八连喜', colors: 6, moves: 19, goal: { type: 'chain', count: 9 },                          item: { icon: '🍾', name: '水晶玻璃餐桌', fineName: '意大利岩板设计师长桌', quote: '“穿过纸板通道连接两岸鼓③，轰出乔迁 9 连！”' }, shape: 'corners', nails: 2, presetCluster: 2, initSwellBias: [0.18, 0.44, 0.38] },

    // Ch6 猫主子 (L25-30) - 小猫爪
    { level: 25, ch: 6, title: '猫爪来捣乱啦！', colors: 6, moves: 20, goal: { type: 'colors', targets: { peach: 18, berry: 18 } }, item: { icon: '🥣', name: '防打翻陶瓷猫碗', fineName: '双耳加高皇冠餐台', quote: '“出现🐾爪印预警就趁早把那颗捏掉，免得被猫主子一巴掌拍瘪！”' }, catPaw: true, teachPreset: 'cat', initSwellBias: [0.24, 0.44, 0.32] },
    { level: 26, ch: 6, title: '巨无霸猫砂箱',   colors: 6, moves: 21, goal: { type: 'combo', tapes: 5, doubles: 3 },               item: { icon: '🧻', name: '全自动智能猫厕所', fineName: '太空舱静音自洁猫厕', quote: '“猫爪捣乱外加胶带双层，稳扎稳打先揭胶带！”' }, catPaw: true, tapes: 6, doubles: 6, initSwellBias: [0.24, 0.44, 0.32] },
    { level: 27, ch: 6, title: '拯救毛线逗猫棒', colors: 6, moves: 20, goal: { type: 'toys', count: 2 },                           item: { icon: '🧶', name: '响铃羽毛逗猫棒', fineName: '羊绒激光自动逗猫塔', quote: '“融化冰封、抢在猫爪拍下前救出猫主子的宝贝！”' }, catPaw: true, ices: 5, toys: 2, initSwellBias: [0.24, 0.44, 0.32] },
    { level: 28, ch: 6, title: '猫抓板障碍赛',   colors: 6, moves: 19, goal: { type: 'combo', ices: 6, colors: { sky: 18, mint: 16 } }, item: { icon: '🏰', name: '双层剑麻猫抓屋', fineName: '城堡全景阳台猫别墅', quote: '“钢钉+猫爪双重压力，划 6 连气泵逆转全盘！”' }, shape: 'uBox', catPaw: true, nails: 1, ices: 6, initSwellBias: [0.22, 0.44, 0.34] },
    { level: 29, ch: 6, title: '三宝齐聚猫砂桶', colors: 6, moves: 19, goal: { type: 'toys', count: 3 },                           item: { icon: '🛏️', name: '半封闭南瓜猫窝', fineName: '恒温羊毛绒球太空睡窝', quote: '“全机制集结！用大气球与气泵一次横扫三个玩具区！”' }, catPaw: true, tapes: 4, doubles: 4, leaks: 2, toys: 3, initSwellBias: [0.22, 0.44, 0.34] },
    { level: 30, ch: 6, title: '猫主子终极巅峰爆', colors: 6, moves: 20, goal: { type: 'chain', count: 10 },                      item: { icon: '👑', name: '通天柱豪华猫爬架', fineName: '梦幻全实木猫主子乐园', quote: '“30 关巅峰之战！蓄满整张泡泡纸一触即发 10 连破！”' }, catPaw: true, nails: 1, doubles: 3, presetCluster: 3, initSwellBias: [0.16, 0.42, 0.42] }
  ];

  function makeRng(seed) {
    let s = (seed >>> 0) || 1234567;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function idxOf(r, c) {
    return r * COLS + c;
  }

  function inBounds(r, c) {
    return r >= 0 && r < ROWS && c >= 0 && c < COLS;
  }

  function cloneGrid(grid) {
    const out = new Array(grid.length);
    for (let i = 0; i < grid.length; i++) {
      const cell = grid[i];
      out[i] = cell ? Object.assign({}, cell) : null;
    }
    return out;
  }

  function cloneState(state) {
    const goalTargetsCopy = state.goal && state.goal.targets ? Object.assign({}, state.goal.targets) : null;
    const goalCopy = state.goal ? Object.assign({}, state.goal) : null;
    if (goalCopy && goalTargetsCopy) goalCopy.targets = goalTargetsCopy;
    if (goalCopy && state.goal.colors) goalCopy.colors = Object.assign({}, state.goal.colors);

    return {
      mode: state.mode,
      levelNum: state.levelNum,
      chapter: state.chapter,
      title: state.title,
      paletteIds: state.paletteIds.slice(),
      movesLeft: state.movesLeft,
      maxMoves: state.maxMoves,
      goal: goalCopy,
      progress: {
        colors: Object.assign({}, state.progress.colors),
        tapesRemoved: state.progress.tapesRemoved,
        icesMelted: state.progress.icesMelted,
        doublesBroken: state.progress.doublesBroken,
        toysRescued: state.progress.toysRescued,
        bestChain: state.progress.bestChain,
        totalPopped: state.progress.totalPopped
      },
      grid: cloneGrid(state.grid),
      sheetRevealed: state.sheetRevealed.slice(),
      poppedEver: state.poppedEver.slice(),
      toys: state.toys.map((t) => Object.assign({}, t)),
      nails: state.nails.map((n) => Object.assign({}, n)),
      catPaw: state.catPaw ? Object.assign({}, state.catPaw) : { enabled: false, warnIdx: -1, heldIdx: -1, heldTimer: 0, cooldown: 0 },
      nextCellId: state.nextCellId,
      turnCount: state.turnCount,
      maxChainThisGame: state.maxChainThisGame,
      seedCounter: state.seedCounter,
      finished: state.finished,
      won: state.won
    };
  }

  function pickSwell(bias, rng) {
    const r = rng();
    if (r < bias[0]) return 1;
    if (r < bias[0] + bias[1]) return 2;
    return 3;
  }

  function getShapeMask(shapeName) {
    const mask = new Array(TOTAL_CELLS).fill(false);
    if (!shapeName) return mask;
    if (shapeName === 'uBox') {
      [[0, 3], [1, 3], [2, 3]].forEach(([r, c]) => { mask[idxOf(r, c)] = true; });
    } else if (shapeName === 'hourglass') {
      [[3, 0], [3, 6], [4, 0], [4, 6]].forEach(([r, c]) => { mask[idxOf(r, c)] = true; });
    } else if (shapeName === 'corners') {
      [[0, 0], [0, 6], [7, 0], [7, 6]].forEach(([r, c]) => { mask[idxOf(r, c)] = true; });
    } else if (shapeName === 'divider') {
      [[1, 3], [2, 3], [5, 3], [6, 3]].forEach(([r, c]) => { mask[idxOf(r, c)] = true; });
    } else if (shapeName === 'diamond') {
      [[3, 3], [4, 3]].forEach(([r, c]) => { mask[idxOf(r, c)] = true; });
    }
    return mask;
  }

  function makeBubble(id, color, swell) {
    return {
      id,
      kind: 'bubble',
      color,
      swell,
      armor: 1,
      ice: 0,
      tape: 0,
      leak: false
    };
  }

  function isCellTraceable(cell, catPaw) {
    if (!cell) return false;
    if (cell.kind === 'cardboard' || cell.kind === 'plastic' || cell.kind === 'nail') return false;
    if (cell.tape > 0) return false;
    if (catPaw && catPaw.enabled && catPaw.heldIdx !== -1 && cell._tempIdx === catPaw.heldIdx) return false;
    return true;
  }

  function getLineActiveColor(grid, path) {
    for (let i = path.length - 1; i >= 0; i--) {
      const cell = grid[path[i]];
      if (cell && cell.kind !== 'rainbow' && cell.color && cell.color !== 'rainbow') {
        return cell.color;
      }
    }
    return null;
  }

  function canConnectCells(state, path, nextIdx) {
    if (nextIdx < 0 || nextIdx >= TOTAL_CELLS) return false;
    if (path.indexOf(nextIdx) !== -1) return false;
    const cell = state.grid[nextIdx];
    if (!cell) return false;
    if (cell.kind === 'cardboard' || cell.kind === 'plastic' || cell.kind === 'nail') return false;
    if (cell.tape > 0) return false;
    if (state.catPaw && state.catPaw.enabled && state.catPaw.heldIdx === nextIdx) return false;

    if (path.length === 0) return true;
    const prevIdx = path[path.length - 1];
    const pr = Math.floor(prevIdx / COLS);
    const pc = prevIdx % COLS;
    const nr = Math.floor(nextIdx / COLS);
    const nc = nextIdx % COLS;
    if (Math.abs(pr - nr) > 1 || Math.abs(pc - nc) > 1) return false;

    // 彩虹泡可无缝接任意颜色，且如果上一个是彩虹泡则本步可以换任意新颜色
    if (cell.kind === 'rainbow') return true;
    const prevCell = state.grid[prevIdx];
    if (prevCell && prevCell.kind === 'rainbow') return true;

    const reqColor = getLineActiveColor(state.grid, path);
    if (!reqColor) return true;
    return cell.color === reqColor;
  }

  function validatePath(state, path) {
    if (!Array.isArray(path) || path.length < 2) return false;
    const partial = [];
    for (let i = 0; i < path.length; i++) {
      if (!canConnectCells(state, partial, path[i])) return false;
      partial.push(path[i]);
    }
    return true;
  }

  function isGoalComplete(state) {
    const g = state.goal;
    if (!g || g.type === 'endless' || g.type === 'daily') return false;
    const p = state.progress;
    if (g.type === 'colors') {
      const keys = Object.keys(g.targets);
      for (let i = 0; i < keys.length; i++) {
        if ((p.colors[keys[i]] || 0) < g.targets[keys[i]]) return false;
      }
      return true;
    }
    if (g.type === 'chain') return p.bestChain >= g.count;
    if (g.type === 'tapes') return p.tapesRemoved >= g.count;
    if (g.type === 'ices') return p.icesMelted >= g.count;
    if (g.type === 'doubles') return p.doublesBroken >= g.count;
    if (g.type === 'toys') return p.toysRescued >= g.count;
    if (g.type === 'combo') {
      if (g.tapes && p.tapesRemoved < g.tapes) return false;
      if (g.ices && p.icesMelted < g.ices) return false;
      if (g.doubles && p.doublesBroken < g.doubles) return false;
      if (g.toys && p.toysRescued < g.toys) return false;
      if (g.colors) {
        const keys = Object.keys(g.colors);
        for (let i = 0; i < keys.length; i++) {
          if ((p.colors[keys[i]] || 0) < g.colors[keys[i]]) return false;
        }
      }
      return true;
    }
    return false;
  }

  function getToyRequiredCells(state, toy) {
    const res = [idxOf(toy.r, toy.c)];
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (let i = 0; i < 4; i++) {
      const nr = toy.r + dirs[i][0];
      const nc = toy.c + dirs[i][1];
      if (!inBounds(nr, nc)) continue;
      const ni = idxOf(nr, nc);
      const cell = state.grid[ni];
      if (cell && (cell.kind === 'cardboard' || cell.kind === 'nail')) continue;
      res.push(ni);
    }
    return res;
  }

  function nextStateRand(state) {
    state.seedCounter = (Math.imul(state.seedCounter, 1664525) + 1013904223) >>> 0;
    return state.seedCounter / 4294967296;
  }

  function pickBoardColor(state) {
    return state.paletteIds[Math.floor(nextStateRand(state) * state.paletteIds.length)];
  }

  function hasAnyValidMove(state) {
    const grid = state.grid;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = idxOf(r, c);
        const a = grid[i];
        if (!a || a.kind === 'cardboard' || a.kind === 'plastic' || a.kind === 'nail' || a.tape > 0) continue;
        if (state.catPaw && state.catPaw.enabled && state.catPaw.heldIdx === i) continue;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr, nc = c + dc;
            if (!inBounds(nr, nc)) continue;
            const j = idxOf(nr, nc);
            const b = grid[j];
            if (!b || b.kind === 'cardboard' || b.kind === 'plastic' || b.kind === 'nail' || b.tape > 0) continue;
            if (state.catPaw && state.catPaw.enabled && state.catPaw.heldIdx === j) continue;
            if (a.kind === 'rainbow' || b.kind === 'rainbow' || a.color === b.color) return true;
          }
        }
      }
    }
    return false;
  }

  function ensurePlayableBoard(state) {
    if (hasAnyValidMove(state)) return false;
    const grid = state.grid;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = idxOf(r, c);
        const a = grid[i];
        if (!a || a.kind !== 'bubble' || a.tape > 0 || a.ice > 0) continue;
        if (state.catPaw && state.catPaw.enabled && state.catPaw.heldIdx === i) continue;
        const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
        for (let d = 0; d < dirs.length; d++) {
          const nr = r + dirs[d][0], nc = c + dirs[d][1];
          if (!inBounds(nr, nc)) continue;
          const j = idxOf(nr, nc);
          const b = grid[j];
          if (!b || b.kind !== 'bubble' || b.tape > 0 || b.ice > 0) continue;
          if (state.catPaw && state.catPaw.enabled && state.catPaw.heldIdx === j) continue;
          b.color = a.color;
          return true;
        }
      }
    }
    return false;
  }

  /**
   * 核心结算引擎：严格 5 步结算
   * opts = { fastMode: boolean, skipEndMechanisms: boolean, skipRefill: boolean }
   */
  function resolveMove(inputState, path, opts) {
    const fastMode = !!(opts && opts.fastMode);
    const skipEndMechanisms = !!(opts && opts.skipEndMechanisms);
    const skipRefill = !!(opts && opts.skipRefill);

    if (!validatePath(inputState, path)) {
      return { valid: false, state: inputState };
    }

    const state = fastMode ? inputState : cloneState(inputState);
    const grid = state.grid;
    const timeline = fastMode ? null : {
      popSteps: [],       // { idx, color, delayMs, seq, kind, tapeRemoved, armorCracked, iceMelted }
      waves: [],          // { waveIdx, delayMs, pops: [...], inflates: [...], shatters: [...] }
      spawns: [],         // { idx, bonusKind }
      drops: [],          // { fromIdx, toIdx, cellId }
      newTopCells: [],    // { toIdx, cellId }
      rescuedToys: [],
      leaksHardened: [],
      nailPoke: null,
      catEvent: null,
      inflatedAll: {},    // idx -> total air received (for preview)
      autoPoppedAll: {}   // idx -> true (for preview)
    };

    const inflatedAll = {};
    const autoPoppedAll = {};
    const newlySpawnedProtected = {}; // 当步奖励生成点在本步免爆

    state.turnCount += 1;
    if (state.mode !== 'endless' && state.movesLeft > 0) {
      state.movesLeft -= 1;
    }

    // ---- 步骤 1 & 2：按划线顺序逐个捏爆 (每格 60ms) ----
    const initialWavePops = [];
    let endSpawnedBonus = null;
    const lastPathIdx = path[path.length - 1];

    if (path.length >= 9) endSpawnedBonus = 'rainbow';
    else if (path.length >= 6) endSpawnedBonus = 'pump';

    for (let k = 0; k < path.length; k++) {
      const idx = path[k];
      const cell = grid[idx];
      if (!cell) continue;

      if (cell.ice > 0) {
        cell.ice = 0;
        state.progress.icesMelted += 1;
      }

      if (cell.armor === 2) {
        // 双层泡被直划 1 次震碎外层，变为单层鼓③（暂不进入空位）
        cell.armor = 1;
        cell.swell = 3;
        if (timeline) {
          timeline.popSteps.push({
            idx, color: cell.color, delayMs: k * 60, seq: k, armorCracked: true, popped: false
          });
        }
        continue;
      }

      // 正常捏爆移除
      if (cell.color && cell.color !== 'rainbow') {
        state.progress.colors[cell.color] = (state.progress.colors[cell.color] || 0) + 1;
      }
      if (cell.isDouble) {
        state.progress.doublesBroken += 1;
      }
      state.progress.totalPopped += 1;
      state.sheetRevealed[idx] = true;
      state.poppedEver[idx] = true;

      const poppedKind = cell.kind;
      const poppedColor = cell.color;
      grid[idx] = null;

      if (state.catPaw && state.catPaw.enabled && state.catPaw.warnIdx === idx) {
        state.catPaw.warnIdx = -1;
      }

      initialWavePops.push({ idx, kind: poppedKind, color: poppedColor });
      if (timeline) {
        timeline.popSteps.push({
          idx, color: poppedColor, kind: poppedKind, delayMs: k * 60, seq: k, popped: true
        });
      }
    }

    // 划满 >= 6 或 >= 9 个在终点生成一个新奖励泡（本步内不受后续冲击立即引爆）
    if (endSpawnedBonus && !grid[lastPathIdx]) {
      const spawnColor = endSpawnedBonus === 'rainbow'
        ? 'rainbow'
        : (getLineActiveColor(inputState.grid, path) || state.paletteIds[0]);
      grid[lastPathIdx] = {
        id: state.nextCellId++,
        kind: endSpawnedBonus,
        color: spawnColor,
        swell: 2,
        armor: 1,
        ice: 0,
        tape: 0,
        leak: false
      };
      newlySpawnedProtected[lastPathIdx] = true;
      if (timeline) timeline.spawns.push({ idx: lastPathIdx, bonusKind: endSpawnedBonus });
    }

    // ---- 步骤 3 & 4：BFS 波次气压扩散 + 奖励泡触发 + 胶带联动 ----
    let currentWave = initialWavePops;
    let chainAutoPopCount = 0;
    let lastAutoPopIdx = -1;
    let waveIdx = 0;
    const baseWaveDelay = Math.max(80, path.length * 60);

    function queueOrthogonalAir(srcIdx, airAmt, waveAirMap, waveTapeHits, wavePlasticBreaks) {
      const r = Math.floor(srcIdx / COLS);
      const c = srcIdx % COLS;
      const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (let d = 0; d < 4; d++) {
        const nr = r + dirs[d][0], nc = c + dirs[d][1];
        if (!inBounds(nr, nc)) continue;
        const ni = idxOf(nr, nc);
        const nb = grid[ni];
        if (!nb) continue;
        if (nb.tape > 0) {
          waveTapeHits[ni] = (waveTapeHits[ni] || 0) + 1;
          continue;
        }
        if (nb.kind === 'cardboard' || nb.kind === 'plastic' || nb.kind === 'nail' || nb.ice > 0) continue;
        if (newlySpawnedProtected[ni]) continue;
        waveAirMap[ni] = (waveAirMap[ni] || 0) + airAmt;
      }
    }

    while (currentWave.length > 0 && waveIdx < 32) {
      const waveAirMap = {};
      const waveTapeHits = {};
      const wavePlasticBreaks = {};

      for (let i = 0; i < currentWave.length; i++) {
        const pop = currentWave[i];
        const pr = Math.floor(pop.idx / COLS);
        const pc = pop.idx % COLS;

        // 1) 正交邻居各 +1 气压（兼顾触发胶带翘角/撕掉）
        queueOrthogonalAir(pop.idx, 1, waveAirMap, waveTapeHits, wavePlasticBreaks);

        // 2) 若是「气泵」：给整行 + 整列完好可充气气泡 +1 气压（并掀动沿线胶带）
        if (pop.kind === 'pump') {
          for (let cc = 0; cc < COLS; cc++) {
            const ni = idxOf(pr, cc);
            if (ni === pop.idx) continue;
            const nb = grid[ni];
            if (!nb || newlySpawnedProtected[ni]) continue;
            if (nb.tape > 0) waveTapeHits[ni] = (waveTapeHits[ni] || 0) + 1;
            else if (nb.kind !== 'cardboard' && nb.kind !== 'plastic' && nb.kind !== 'nail' && nb.ice <= 0) {
              waveAirMap[ni] = (waveAirMap[ni] || 0) + 1;
            }
          }
          for (let rr = 0; rr < ROWS; rr++) {
            const ni = idxOf(rr, pc);
            if (ni === pop.idx) continue;
            const nb = grid[ni];
            if (!nb || newlySpawnedProtected[ni]) continue;
            if (nb.tape > 0) waveTapeHits[ni] = (waveTapeHits[ni] || 0) + 1;
            else if (nb.kind !== 'cardboard' && nb.kind !== 'plastic' && nb.kind !== 'nail' && nb.ice <= 0) {
              waveAirMap[ni] = (waveAirMap[ni] || 0) + 1;
            }
          }
        }

        // 3) 若是「大气球」：周围 3×3 所有可充气气泡 +2 气压，撕胶带，震碎硬塑料片
        if (pop.kind === 'balloon') {
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              if (dr === 0 && dc === 0) continue;
              const nr = pr + dr, nc = pc + dc;
              if (!inBounds(nr, nc)) continue;
              const ni = idxOf(nr, nc);
              const nb = grid[ni];
              if (!nb || newlySpawnedProtected[ni]) continue;
              if (nb.tape > 0) waveTapeHits[ni] = (waveTapeHits[ni] || 0) + 1;
              else if (nb.kind === 'plastic') wavePlasticBreaks[ni] = true;
              else if (nb.kind !== 'cardboard' && nb.kind !== 'nail' && nb.ice <= 0) {
                waveAirMap[ni] = (waveAirMap[ni] || 0) + 2;
              }
            }
          }
        }
      }

      const waveLog = timeline ? {
        waveIdx,
        delayMs: baseWaveDelay + waveIdx * 80,
        sources: currentWave.map((p) => p.idx),
        inflates: [],
        pops: [],
        tapes: [],
        shatters: []
      } : null;

      // 结算胶带受波揭开
      const tapeKeys = Object.keys(waveTapeHits);
      for (let i = 0; i < tapeKeys.length; i++) {
        const ti = Number(tapeKeys[i]);
        const tcell = grid[ti];
        if (!tcell || tcell.tape <= 0) continue;
        const oldTape = tcell.tape;
        tcell.tape = Math.max(0, tcell.tape - waveTapeHits[ti]);
        if (oldTape > 0 && tcell.tape === 0) {
          state.progress.tapesRemoved += 1;
        }
        if (waveLog) waveLog.tapes.push({ idx: ti, from: oldTape, to: tcell.tape });
      }

      // 结算气球震碎硬塑料片
      const plasticKeys = Object.keys(wavePlasticBreaks);
      for (let i = 0; i < plasticKeys.length; i++) {
        const pi = Number(plasticKeys[i]);
        if (grid[pi] && grid[pi].kind === 'plastic') {
          grid[pi] = null;
          state.sheetRevealed[pi] = true;
          state.poppedEver[pi] = true;
          if (waveLog) waveLog.shatters.push(pi);
        }
      }

      // 结算送气与超出鼓③ 自爆
      const nextWave = [];
      const airKeys = Object.keys(waveAirMap);
      for (let i = 0; i < airKeys.length; i++) {
        const ai = Number(airKeys[i]);
        const cell = grid[ai];
        if (!cell) continue;
        const air = waveAirMap[ai];
        inflatedAll[ai] = (inflatedAll[ai] || 0) + air;

        if (cell.armor === 2) {
          const totalPressure = cell.swell + air;
          if (totalPressure >= 5) {
            // 双层遭到 2+ 重击直接打穿双层自爆
            cell.armor = 0;
          } else if (totalPressure >= 4) {
            // 震破外层，保留单层鼓③，暂不进下一波
            cell.armor = 1;
            cell.swell = 3;
            if (waveLog) waveLog.inflates.push({ idx: ai, swell: 3, armorCracked: true });
            continue;
          } else {
            cell.swell = totalPressure;
            if (waveLog) waveLog.inflates.push({ idx: ai, swell: cell.swell });
            continue;
          }
        } else {
          cell.swell += air;
        }

        if (cell.swell > 3 || cell.armor === 0) {
          // 鼓满自爆！
          if (cell.color && cell.color !== 'rainbow') {
            state.progress.colors[cell.color] = (state.progress.colors[cell.color] || 0) + 1;
          }
          if (cell.isDouble) {
            state.progress.doublesBroken += 1;
          }
          state.progress.totalPopped += 1;
          state.sheetRevealed[ai] = true;
          state.poppedEver[ai] = true;
          chainAutoPopCount += 1;
          lastAutoPopIdx = ai;
          autoPoppedAll[ai] = true;

          if (state.catPaw && state.catPaw.enabled && state.catPaw.warnIdx === ai) {
            state.catPaw.warnIdx = -1;
          }

          const poppedKind = cell.kind;
          const poppedColor = cell.color;
          grid[ai] = null;
          nextWave.push({ idx: ai, kind: poppedKind, color: poppedColor });
          if (waveLog) waveLog.pops.push({ idx: ai, color: poppedColor, kind: poppedKind });
        } else {
          if (waveLog) waveLog.inflates.push({ idx: ai, swell: cell.swell });
        }
      }

      if (waveLog && (waveLog.pops.length || waveLog.inflates.length || waveLog.tapes.length || waveLog.shatters.length)) {
        timeline.waves.push(waveLog);
      }

      currentWave = nextWave;
      if (nextWave.length > 0) waveIdx += 1;
    }

    // 单步自爆连锁计数记录（注：连锁 = 气压引发的自爆数，加上手动长爆或严格按自爆数算？设计案“一次连锁自爆 ≥ 8 个” & “一次连锁 ≥ N”）
    // 统计 totalChain = path.length + chainAutoPopCount（大连锁门槛对应）；同时记录 autoPopCount 用于大气球生成
    const totalStepPopped = initialWavePops.length + chainAutoPopCount;
    const strategicChainScore = chainAutoPopCount > 0 ? totalStepPopped : 0;
    if (strategicChainScore > state.progress.bestChain) {
      state.progress.bestChain = strategicChainScore;
    }
    if (totalStepPopped > state.maxChainThisGame) {
      state.maxChainThisGame = totalStepPopped;
    }

    // 奖励「大气球」：单次气压连锁自爆 >= 8 个（排除纯长线无自爆），在最后一爆处生成大气球
    if (chainAutoPopCount >= 8 && lastAutoPopIdx !== -1 && !grid[lastAutoPopIdx]) {
      const balloonColor = pickBoardColor(state);
      grid[lastAutoPopIdx] = {
        id: state.nextCellId++,
        kind: 'balloon',
        color: balloonColor,
        swell: 2,
        armor: 1,
        ice: 0,
        tape: 0,
        leak: false
      };
      if (timeline) timeline.spawns.push({ idx: lastAutoPopIdx, bonusKind: 'balloon' });
    }

    // 检查玩具是否全部围爆获救
    for (let t = 0; t < state.toys.length; t++) {
      const toy = state.toys[t];
      if (toy.rescued) continue;
      const reqs = getToyRequiredCells(state, toy);
      let ok = true;
      for (let q = 0; q < reqs.length; q++) {
        if (!state.poppedEver[reqs[q]]) {
          ok = false;
          break;
        }
      }
      if (ok) {
        toy.rescued = true;
        state.progress.toysRescued += 1;
        if (timeline) timeline.rescuedToys.push(toy.id);
      }
    }

    // 机关结算（未过关前生效：漏气泡减气、钢钉定时戳、猫爪拍扁）
    if (!skipEndMechanisms && !isGoalComplete(state)) {
      // 1) 漏气泡 -1 鼓胀度，瘪成 0 变硬塑料片（阻断连锁）
      for (let i = 0; i < TOTAL_CELLS; i++) {
        const cell = grid[i];
        if (!cell || !cell.leak) continue;
        cell.swell -= 1;
        if (cell.swell <= 0) {
          grid[i] = {
            id: cell.id,
            kind: 'plastic',
            color: null,
            swell: 0,
            armor: 1,
            ice: 0,
            tape: 0,
            leak: false
          };
          if (timeline) timeline.leaksHardened.push(i);
        }
      }

      // 2) 钢钉每 3 步把相邻随机一个 >1 气气泡戳回瘪①
      for (let ni = 0; ni < state.nails.length; ni++) {
        const nail = state.nails[ni];
        nail.timer -= 1;
        if (nail.timer <= 0) {
          nail.timer = 3;
          const adj = [];
          const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
          for (let d = 0; d < 4; d++) {
            const nr = nail.r + dirs[d][0], nc = nail.c + dirs[d][1];
            if (!inBounds(nr, nc)) continue;
            const ci = idxOf(nr, nc);
            const nb = grid[ci];
            if (nb && (nb.kind === 'bubble' || nb.kind === 'pump' || nb.kind === 'balloon') && nb.swell > 1) {
              adj.push(ci);
            }
          }
          if (adj.length > 0) {
            const targetIdx = adj[Math.floor(nextStateRand(state) * adj.length)];
            grid[targetIdx].swell = 1;
            if (timeline) timeline.nailPoke = { from: idxOf(nail.r, nail.c), to: targetIdx };
          }
        }
      }

      // 3) 小猫爪定时预警与拍压
      if (state.catPaw && state.catPaw.enabled) {
        const cp = state.catPaw;
        if (cp.heldIdx !== -1) {
          cp.heldTimer -= 1;
          if (cp.heldTimer <= 0) {
            cp.heldIdx = -1;
            cp.cooldown = 1;
          }
        } else if (cp.warnIdx !== -1 && grid[cp.warnIdx] && grid[cp.warnIdx].kind === 'bubble') {
          grid[cp.warnIdx].swell = 1;
          cp.heldIdx = cp.warnIdx;
          cp.heldTimer = 1;
          cp.warnIdx = -1;
          if (timeline) timeline.catEvent = { type: 'slam', idx: cp.heldIdx };
        } else {
          if (cp.cooldown > 0) {
            cp.cooldown -= 1;
          } else {
            const cands = [];
            for (let i = 0; i < TOTAL_CELLS; i++) {
              const b = grid[i];
              if (b && b.kind === 'bubble' && b.tape === 0 && b.ice === 0) cands.push(i);
            }
            if (cands.length > 0) {
              cp.warnIdx = cands[Math.floor(nextStateRand(state) * cands.length)];
              if (timeline) timeline.catEvent = { type: 'warn', idx: cp.warnIdx };
            }
          }
        }
      }
    }

    // ---- 步骤 5：重力下落与顶部补充新的瘪①（swell = 1，不触发任何连锁） ----
    if (!skipRefill) {
      for (let c = 0; c < COLS; c++) {
        // 每一列按硬障碍分段下落（cardboard / plastic / nail 固定不落）
        let writeRow = ROWS - 1;
        while (writeRow >= 0) {
          const wIdx = idxOf(writeRow, c);
          const wc = grid[wIdx];
          if (wc && (wc.kind === 'cardboard' || wc.kind === 'plastic' || wc.kind === 'nail')) {
            writeRow -= 1;
            continue;
          }
          if (wc !== null) {
            writeRow -= 1;
            continue;
          }
          // 找到上方最近可落入的普通气泡（允许跨过同一段空位，遇固定障碍则尝试斜上方滑落）
          let readRow = writeRow - 1;
          let pickedIdx = -1;
          while (readRow >= 0) {
            const ri = idxOf(readRow, c);
            const rc = grid[ri];
            if (rc && (rc.kind === 'cardboard' || rc.kind === 'plastic' || rc.kind === 'nail')) {
              // 遇到固定障碍挡住正上方，尝试左右斜上方滑入
              const sideCols = nextStateRand(state) < 0.5 ? [c - 1, c + 1] : [c + 1, c - 1];
              for (let s = 0; s < sideCols.length; s++) {
                const sc = sideCols[s];
                if (sc >= 0 && sc < COLS && writeRow - 1 >= 0) {
                  const si = idxOf(writeRow - 1, sc);
                  const sb = grid[si];
                  if (sb && sb.kind !== 'cardboard' && sb.kind !== 'plastic' && sb.kind !== 'nail') {
                    pickedIdx = si;
                    break;
                  }
                }
              }
              break;
            }
            if (rc !== null) {
              pickedIdx = ri;
              break;
            }
            readRow -= 1;
          }

          if (pickedIdx !== -1) {
            const movedCell = grid[pickedIdx];
            grid[wIdx] = movedCell;
            grid[pickedIdx] = null;
            if (timeline) timeline.drops.push({ fromIdx: pickedIdx, toIdx: wIdx, cellId: movedCell.id });
            // 若猫爪正在按/预警被移位格，跟着同步下标
            if (state.catPaw && state.catPaw.enabled) {
              if (state.catPaw.heldIdx === pickedIdx) state.catPaw.heldIdx = wIdx;
              if (state.catPaw.warnIdx === pickedIdx) state.catPaw.warnIdx = wIdx;
            }
            writeRow -= 1;
          } else {
            // 如果本列顶段完全空了，等下一步由顶部补新泡
            writeRow -= 1;
          }
        }
      }

      // 填充所有仍为 null 且未处在中段封闭下的空格（从上往下补 瘪① 气泡）
      for (let c = 0; c < COLS; c++) {
        for (let r = 0; r < ROWS; r++) {
          const idx = idxOf(r, c);
          if (grid[idx] === null) {
            const newCell = makeBubble(state.nextCellId++, pickBoardColor(state), 1);
            grid[idx] = newCell;
            if (timeline) timeline.newTopCells.push({ toIdx: idx, cellId: newCell.id });
          }
        }
      }

      ensurePlayableBoard(state);
    }

    if (timeline) {
      timeline.inflatedAll = inflatedAll;
      timeline.autoPoppedAll = autoPoppedAll;
    }

    const goalComplete = isGoalComplete(state);
    if (state.mode === 'campaign' || state.mode === 'season') {
      if (goalComplete) {
        state.finished = true;
        state.won = true;
      } else if (state.movesLeft <= 0) {
        state.finished = true;
        state.won = false;
      }
    } else if (state.mode === 'daily' && state.movesLeft <= 0) {
      state.finished = true;
      state.won = true;
    }

    return {
      valid: true,
      state,
      timeline,
      poppedCount: initialWavePops.length,
      autoPoppedCount: chainAutoPopCount,
      totalPoppedThisMove: totalStepPopped,
      strategicChainScore,
      inflatedAll,
      autoPoppedAll,
      endSpawnedBonus
    };
  }

  /**
   * 实时划动预览：零副作用推演当前松手将会送气的邻居和连锁引爆的点位
   */
  function previewMove(state, path) {
    if (!path || path.length < 2 || !validatePath(state, path)) {
      return {
        valid: false,
        willInflateIds: [],
        willAutoPopIds: [],
        predictedChainTotal: 0,
        willSpawnBonus: null
      };
    }
    const simState = cloneState(state);
    const res = resolveMove(simState, path, { fastMode: true, skipEndMechanisms: true, skipRefill: true });
    if (!res.valid) {
      return { valid: false, willInflateIds: [], willAutoPopIds: [], predictedChainTotal: 0, willSpawnBonus: null };
    }
    const willInflateIds = [];
    const willAutoPopIds = [];
    const popKeys = Object.keys(res.autoPoppedAll);
    for (let i = 0; i < popKeys.length; i++) willAutoPopIds.push(Number(popKeys[i]));
    const infKeys = Object.keys(res.inflatedAll);
    for (let i = 0; i < infKeys.length; i++) {
      const k = Number(infKeys[i]);
      if (!res.autoPoppedAll[k]) willInflateIds.push(k);
    }
    return {
      valid: true,
      willInflateIds,
      willAutoPopIds,
      predictedChainTotal: res.autoPoppedCount > 0 ? res.totalPoppedThisMove : res.autoPoppedCount,
      autoPopCount: res.autoPoppedCount,
      totalPopped: res.totalPoppedThisMove,
      willSpawnBonus: res.endSpawnedBonus
    };
  }

  /**
   * 构建第 31+ 关及赛季关配置
   */
  function getGeneratedConfig(levelNum) {
    const rng = makeRng(levelNum * 7919 + 4099);
    const ch = 6 + Math.floor((levelNum - 31) / 5);
    const paletteCount = rng() < 0.4 ? 5 : 6;
    const shapes = [null, 'corners', 'uBox', 'hourglass', 'diamond'];
    const shape = rng() < 0.45 ? shapes[Math.floor(rng() * shapes.length)] : null;
    const isChainStage = (levelNum % 5 === 0);

    let goal;
    let tapes = 0, doubles = 0, ices = 0, leaks = 0, toys = 0, nails = 0, catPaw = false;
    if (isChainStage) {
      const targetChain = Math.min(10, 7 + Math.floor((levelNum - 31) / 10));
      goal = { type: 'chain', count: targetChain };
      if (rng() < 0.5) doubles = 3;
      if (rng() < 0.5) ices = 4;
    } else {
      const roll = rng();
      if (roll < 0.35) {
        const c1 = BUBBLE_COLORS[0].id;
        const c2 = BUBBLE_COLORS[3].id;
        tapes = 4;
        goal = { type: 'combo', tapes: 4, colors: { [c1]: 16, [c2]: 16 } };
      } else if (roll < 0.65) {
        ices = 6;
        doubles = 4;
        goal = { type: 'combo', ices: 6, doubles: 4 };
      } else {
        toys = 2;
        ices = 4;
        tapes = 4;
        goal = { type: 'toys', count: 2 };
      }
      if (rng() < 0.45) leaks = 3;
      if (rng() < 0.45) nails = 1;
      if (rng() < 0.5) catPaw = true;
    }

    return {
      level: levelNum,
      ch,
      title: `大师拆箱挑战 #${levelNum}`,
      colors: paletteCount,
      moves: isChainStage ? 21 : 22,
      goal,
      tapes,
      doubles,
      ices,
      leaks,
      toys,
      nails,
      catPaw,
      shape,
      presetCluster: isChainStage ? 3 : 1,
      initSwellBias: isChainStage ? [0.16, 0.40, 0.44] : [0.24, 0.44, 0.32],
      item: {
        icon: ['🎁', '🪴', '🎮', '🧁', '🧸', '🛋️'][levelNum % 6],
        name: `第 ${levelNum} 站纪念快递盒`,
        fineName: `典藏鎏金纪念品 #${levelNum}`,
        quote: '“每一单拆开的惊喜，都是治愈自己的小确幸！”'
      }
    };
  }

  function buildSeasonStage(seasonIdx) {
    const rng = makeRng((seasonIdx + 1) * 1111 + 8888);
    const titles = [
      '双十一零点抢单', '满减凑单拆拆拆', '尾款人狂喜巨箱', '预售超重快递山', '超级百亿补贴盒',
      '囤货纸巾十连拆', '限定手办加急件', '保暖好物大礼包', '拆不完的零食囤箱', '终极狂欢免单盲盒'
    ];
    const isChain = (seasonIdx === 4 || seasonIdx === 9);
    const cfg = {
      level: 100 + seasonIdx + 1,
      ch: 7,
      title: titles[seasonIdx % titles.length],
      colors: seasonIdx < 4 ? 5 : 6,
      moves: 22,
      goal: isChain
        ? { type: 'chain', count: seasonIdx === 9 ? 9 : 7 }
        : (seasonIdx % 2 === 0 ? { type: 'combo', tapes: 6, colors: { berry: 16, amber: 16 } } : { type: 'toys', count: 2 }),
      tapes: isChain ? 2 : 6,
      doubles: seasonIdx >= 5 ? 4 : 2,
      ices: seasonIdx >= 6 ? 4 : 0,
      toys: (!isChain && seasonIdx % 2 === 1) ? 2 : 0,
      nails: seasonIdx >= 7 ? 1 : 0,
      catPaw: seasonIdx >= 8,
      shape: seasonIdx % 3 === 1 ? 'corners' : null,
      presetCluster: isChain ? 3 : 1,
      initSwellBias: [0.20, 0.44, 0.36],
      item: {
        icon: '🛍️',
        name: `双十一限定战利品 #${seasonIdx + 1}`,
        fineName: `双十一皇冠金标珍藏 #${seasonIdx + 1}`,
        quote: '“买得痛快，拆得更痛快！”'
      }
    };
    const st = createStageFromConfig(cfg, 'season', (seasonIdx + 1) * 9001 + 11);
    return st;
  }

  function createStageFromConfig(cfg, mode, seedOverride) {
    const seed = seedOverride || (cfg.level * 131071 + 20261123);
    const rng = makeRng(seed);
    const paletteIds = BUBBLE_COLORS.slice(0, cfg.colors || 4).map((c) => c.id);
    const mask = getShapeMask(cfg.shape);
    const grid = new Array(TOTAL_CELLS).fill(null);
    let nextId = 1;

    const bias = cfg.initSwellBias || [0.30, 0.45, 0.25];
    for (let i = 0; i < TOTAL_CELLS; i++) {
      if (mask[i]) {
        grid[i] = { id: nextId++, kind: 'cardboard', color: null, swell: 0, armor: 1, ice: 0, tape: 0, leak: false };
      } else {
        const col = paletteIds[Math.floor(rng() * paletteIds.length)];
        grid[i] = makeBubble(nextId++, col, pickSwell(bias, rng));
      }
    }

    // 若设有钢钉，放在中间非边缘安全位置
    const nails = [];
    if (cfg.nails && cfg.nails > 0) {
      const nailPositions = cfg.nails >= 2 ? [[2, 2], [5, 4]] : [[3, 3]];
      for (let n = 0; n < nailPositions.length; n++) {
        const [nr, nc] = nailPositions[n];
        const ni = idxOf(nr, nc);
        grid[ni] = { id: nextId++, kind: 'nail', color: null, swell: 0, armor: 1, ice: 0, tape: 0, leak: false };
        nails.push({ r: nr, c: nc, timer: 3 });
      }
    }

    // 预置中心高鼓胀簇 / 新手连线教学阵型（三段式首关“一笔就能解决”）
    if (cfg.level === 1) {
      // L1 保证中部两道明显的同色连线和鼓③邻居，前两步即可体验爽爆
      const cA = paletteIds[0], cB = paletteIds[1];
      [[3, 1], [3, 2], [3, 3], [2, 3]].forEach(([r, c]) => { grid[idxOf(r, c)] = makeBubble(nextId++, cA, 3); });
      [[4, 2], [4, 3], [4, 4]].forEach(([r, c]) => { grid[idxOf(r, c)] = makeBubble(nextId++, cB, 3); });
    }

    if (cfg.presetCluster && cfg.presetCluster > 0) {
      const centers = [[3, 3], [2, 4], [5, 2], [4, 5]];
      for (let k = 0; k < Math.min(cfg.presetCluster, centers.length); k++) {
        const [cr, cc] = centers[k];
        const triggerCol = paletteIds[k % paletteIds.length];
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const rr = cr + dr, rcc = cc + dc;
            if (!inBounds(rr, rcc)) continue;
            const gi = idxOf(rr, rcc);
            if (!grid[gi] || grid[gi].kind !== 'bubble') continue;
            grid[gi].swell = 3;
            if (dr === 0 && (dc === 0 || dc === -1 || dc === 1)) {
              grid[gi].color = triggerCol;
            }
          }
        }
      }
    }

    // 收集可放障碍的中区正常冒泡索引
    function samplePlayableIndices(avoidSet) {
      const list = [];
      for (let r = 1; r < ROWS - 1; r++) {
        for (let c = 1; c < COLS - 1; c++) {
          const i = idxOf(r, c);
          const cell = grid[i];
          if (cell && cell.kind === 'bubble' && !avoidSet[i] && cell.tape === 0 && cell.ice === 0 && !cell.leak && cell.armor === 1) {
            list.push(i);
          }
        }
      }
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const t = list[i]; list[i] = list[j]; list[j] = t;
      }
      return list;
    }

    const used = {};
    // 教学辅助区保留中心一行三格做“一笔即破”教学
    if (cfg.teachPreset === 'tape') {
      const tCol = paletteIds[0];
      grid[idxOf(3, 2)] = makeBubble(nextId++, tCol, 3);
      grid[idxOf(3, 3)] = makeBubble(nextId++, tCol, 3);
      grid[idxOf(3, 4)] = makeBubble(nextId++, tCol, 3);
      [[2, 3], [4, 3], [3, 1], [3, 5]].forEach(([r, c]) => {
        const ti = idxOf(r, c);
        grid[ti].tape = 2;
        used[ti] = true;
      });
      used[idxOf(3, 2)] = used[idxOf(3, 3)] = used[idxOf(3, 4)] = true;
    } else if (cfg.tapes && cfg.tapes > 0) {
      const pool = samplePlayableIndices(used);
      for (let k = 0; k < Math.min(cfg.tapes, pool.length); k++) {
        grid[pool[k]].tape = 2;
        used[pool[k]] = true;
      }
    }

    if (cfg.teachPreset === 'ice') {
      const iCol = paletteIds[0];
      [[3, 1], [3, 2], [3, 3], [3, 4], [4, 4], [4, 5]].forEach(([r, c]) => {
        const ii = idxOf(r, c);
        grid[ii] = makeBubble(nextId++, iCol, 2);
        grid[ii].ice = 1;
        used[ii] = true;
      });
    } else if (cfg.ices && cfg.ices > 0) {
      const pool = samplePlayableIndices(used);
      for (let k = 0; k < Math.min(cfg.ices, pool.length); k++) {
        grid[pool[k]].ice = 1;
        used[pool[k]] = true;
      }
    }

    if (cfg.teachPreset === 'double') {
      const dCol = paletteIds[0];
      [[3, 1], [3, 2], [3, 3]].forEach(([r, c]) => {
        const ti = idxOf(r, c);
        grid[ti] = makeBubble(nextId++, dCol, 3);
        used[ti] = true;
      });
      [[2, 2], [4, 2], [2, 3], [4, 3], [2, 4], [4, 4]].forEach(([r, c]) => {
        const di = idxOf(r, c);
        grid[di].armor = 2;
        grid[di].isDouble = true;
        grid[di].swell = 3;
        used[di] = true;
      });
      const extraPool = samplePlayableIndices(used);
      for (let k = 0; k < Math.min(2, extraPool.length); k++) {
        grid[extraPool[k]].armor = 2;
        grid[extraPool[k]].isDouble = true;
        grid[extraPool[k]].swell = 3;
        used[extraPool[k]] = true;
      }
    } else if (cfg.doubles && cfg.doubles > 0) {
      const pool = samplePlayableIndices(used);
      for (let k = 0; k < Math.min(cfg.doubles, pool.length); k++) {
        grid[pool[k]].armor = 2;
        grid[pool[k]].isDouble = true;
        grid[pool[k]].swell = 3;
        used[pool[k]] = true;
      }
    }

    if (cfg.leaks && cfg.leaks > 0) {
      const pool = samplePlayableIndices(used);
      for (let k = 0; k < Math.min(cfg.leaks, pool.length); k++) {
        grid[pool[k]].leak = true;
        grid[pool[k]].swell = 3;
        used[pool[k]] = true;
      }
    }

    const toys = [];
    if (cfg.toys && cfg.toys > 0) {
      const toyCoords = cfg.toys >= 3 ? [[2, 2], [4, 4], [5, 2]] : (cfg.toys === 2 ? [[2, 2], [5, 4]] : [[3, 3]]);
      const toyIcons = ['🧸', '🐥', '🛸'];
      for (let t = 0; t < Math.min(cfg.toys, toyCoords.length); t++) {
        const [tr, tc] = toyCoords[t];
        toys.push({ id: t + 1, icon: toyIcons[t % toyIcons.length], r: tr, c: tc, rescued: false });
      }
    }

    const catPaw = {
      enabled: !!cfg.catPaw,
      warnIdx: cfg.catPaw ? idxOf(4, 3) : -1,
      heldIdx: -1,
      heldTimer: 0,
      cooldown: 0
    };

    const state = {
      mode,
      levelNum: cfg.level,
      chapter: cfg.ch,
      title: cfg.title,
      paletteIds,
      movesLeft: cfg.moves,
      maxMoves: cfg.moves,
      goal: JSON.parse(JSON.stringify(cfg.goal)),
      progress: {
        colors: {},
        tapesRemoved: 0,
        icesMelted: 0,
        doublesBroken: 0,
        toysRescued: 0,
        bestChain: 0,
        totalPopped: 0
      },
      grid,
      sheetRevealed: new Array(TOTAL_CELLS).fill(false),
      poppedEver: new Array(TOTAL_CELLS).fill(false),
      toys,
      nails,
      catPaw,
      nextCellId: nextId,
      turnCount: 0,
      maxChainThisGame: 0,
      seedCounter: (seed * 31 + 17) >>> 0,
      finished: false,
      won: false,
      itemMeta: cfg.item,
      roomMeta: CHAPTER_ROOMS[(cfg.ch - 1) % CHAPTER_ROOMS.length] || CHAPTER_ROOMS[0]
    };

    ensurePlayableBoard(state);
    return state;
  }

  function buildCampaignLevel(levelNum, seedOffset = 0, bonusMoves = 0) {
    let cfg;
    if (levelNum >= 1 && levelNum <= CAMPAIGN_CONFIGS.length) {
      cfg = Object.assign({}, CAMPAIGN_CONFIGS[levelNum - 1]);
    } else {
      cfg = getGeneratedConfig(levelNum);
    }
    const seed = levelNum * 131071 + (seedOffset || 0) * 104729 + 20261123;
    const state = createStageFromConfig(cfg, 'campaign', seed);
    if (bonusMoves > 0) {
      state.movesLeft += bonusMoves;
      state.maxMoves += bonusMoves;
    }
    return state;
  }

  function buildEndlessBoard(seed = 20261123) {
    const cfg = {
      level: 0,
      ch: 1,
      title: '无尽解压捏捏',
      colors: 4,
      moves: 9999,
      goal: { type: 'endless' },
      initSwellBias: [0.22, 0.44, 0.34],
      item: { icon: '🫧', name: '无限云端泡泡卷', fineName: '无限云端泡泡卷', quote: '“没有步数、没有倒计时，想怎么捏就怎么捏！”' }
    };
    return createStageFromConfig(cfg, 'endless', seed);
  }

  function hashDateSeed(dateStr) {
    let h = 2166136261;
    for (let i = 0; i < dateStr.length; i++) {
      h ^= dateStr.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) || 1;
  }

  function buildDailyBoard(dateStr) {
    const seed = hashDateSeed(String(dateStr || '2026-11-23'));
    const cfg = {
      level: 99,
      ch: 6,
      title: `每日一捏 · ${dateStr}`,
      colors: 5,
      moves: 15,
      goal: { type: 'daily' },
      tapes: 2,
      doubles: 2,
      presetCluster: 2,
      initSwellBias: [0.18, 0.42, 0.40],
      item: { icon: '🏆', name: '每日全服泡泡榜', fineName: '每日全服泡泡榜', quote: '“15 步内拼单次最大气压连锁！”' }
    };
    return createStageFromConfig(cfg, 'daily', seed);
  }

  /**
   * 贪心策略 AI 玩家：枚举 8 方向连线并使用 previewMove 挑选收益最大的一手，供 AI 校准器及 verify-all 使用
   */
  function pickGreedyMove(state) {
    const grid = state.grid;
    const goal = state.goal || {};
    const candidates = [];
    const dirs = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

    // 从每个可划起点的贪心延伸（每起点保留最短、最优中长、最长、彩虹转色共数条路径）
    for (let start = 0; start < TOTAL_CELLS; start++) {
      const sc = grid[start];
      if (!sc || sc.kind === 'cardboard' || sc.kind === 'plastic' || sc.kind === 'nail' || sc.tape > 0) continue;
      if (state.catPaw && state.catPaw.enabled && state.catPaw.heldIdx === start) continue;

      // DFS 限制单起点最多展开 14 条代表性路径，保证极速毫秒级
      let exploredFromStart = 0;
      function dfs(path, reqColor) {
        if (exploredFromStart >= 12) return;
        if (path.length >= 2) {
          exploredFromStart += 1;
          candidates.push(path.slice());
          if (path.length >= 9) return;
        }
        const cur = path[path.length - 1];
        const cr = Math.floor(cur / COLS), cc = cur % COLS;
        const neigh = [];
        for (let d = 0; d < 8; d++) {
          const nr = cr + dirs[d][0], nc = cc + dirs[d][1];
          if (!inBounds(nr, nc)) continue;
          const ni = idxOf(nr, nc);
          if (path.indexOf(ni) !== -1) continue;
          const nb = grid[ni];
          if (!nb || nb.kind === 'cardboard' || nb.kind === 'plastic' || nb.kind === 'nail' || nb.tape > 0) continue;
          if (state.catPaw && state.catPaw.enabled && state.catPaw.heldIdx === ni) continue;
          if (nb.kind !== 'rainbow' && grid[cur].kind !== 'rainbow' && reqColor && nb.color !== reqColor) continue;
          let pri = nb.swell * 10 + (nb.ice > 0 ? 25 : 0) + (nb.kind === 'pump' || nb.kind === 'balloon' ? 35 : 0);
          if (state.catPaw && state.catPaw.warnIdx === ni) pri += 30;
          neigh.push({ ni, pri, nextCol: nb.kind === 'rainbow' ? reqColor : nb.color });
        }
        neigh.sort((a, b) => b.pri - a.pri);
        for (let k = 0; k < Math.min(2, neigh.length); k++) {
          path.push(neigh[k].ni);
          dfs(path, neigh[k].nextCol);
          path.pop();
        }
      }
      dfs([start], sc.kind === 'rainbow' ? null : sc.color);
    }

    if (!candidates.length) return null;

    // 预筛 Top-36 候选，再做精确无副作用状态打分
    const quickScored = [];
    for (let i = 0; i < candidates.length; i++) {
      const p = candidates[i];
      let h = p.length * 14;
      let hasSwell3Neighbor = false;
      for (let k = 0; k < p.length; k++) {
        const ci = p[k];
        const cell = grid[ci];
        if (!cell) continue;
        if (cell.kind === 'pump' || cell.kind === 'balloon') h += 45;
        if (cell.ice > 0 && (goal.type === 'ices' || (goal.type === 'combo' && goal.ices))) h += 55;
        if (cell.armor === 1 && cell.isDouble && (goal.type === 'doubles' || (goal.type === 'combo' && goal.doubles))) h += 90;
        else if (cell.armor === 2 && (goal.type === 'doubles' || (goal.type === 'combo' && goal.doubles))) h += 65;
        if (goal.type === 'colors' && goal.targets && goal.targets[cell.color]) {
          const rem = goal.targets[cell.color] - (state.progress.colors[cell.color] || 0);
          if (rem > 0) h += 35;
        }
        if (goal.type === 'combo' && goal.colors && goal.colors[cell.color]) {
          const rem = goal.colors[cell.color] - (state.progress.colors[cell.color] || 0);
          if (rem > 0) h += 35;
        }
        const cr = Math.floor(ci / COLS), cc = ci % COLS;
        const ortho = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        for (let d = 0; d < 4; d++) {
          const nr = cr + ortho[d][0], nc = cc + ortho[d][1];
          if (!inBounds(nr, nc)) continue;
          const nb = grid[idxOf(nr, nc)];
          if (!nb) continue;
          if (nb.swell === 3) hasSwell3Neighbor = true;
          if (nb.tape > 0 && (goal.type === 'tapes' || (goal.type === 'combo' && goal.tapes) || goal.type === 'toys')) h += 45;
          if (nb.isDouble && (goal.type === 'doubles' || (goal.type === 'combo' && goal.doubles))) h += 35;
        }
      }
      if (hasSwell3Neighbor) h += 38;
      if (p.length >= 6) h += 60;
      if (p.length >= 9) h += 80;
      quickScored.push({ p, h });
    }
    quickScored.sort((a, b) => b.h - a.h);

    const evalCap = Math.min(12, quickScored.length);
    let bestPath = quickScored[0].p;
    let bestScore = -Infinity;

    for (let i = 0; i < evalCap; i++) {
      const p = quickScored[i].p;
      const testState = cloneState(state);
      const res = resolveMove(testState, p, { fastMode: true, skipRefill: true });
      if (!res.valid) continue;
      const ns = res.state;
      if (ns.won) return p;

      let score = 0;
      if (goal.type === 'chain') {
        // 连锁关策略：鼓③数量 & 邻接度越密越好；避免太早空放零散爆破，鼓励造气泵/大气球与铺鼓③群
        let s3Count = 0;
        let bonusCount = 0;
        for (let idx = 0; idx < TOTAL_CELLS; idx++) {
          const cell = ns.grid[idx];
          if (!cell) continue;
          if (cell.swell === 3 && cell.kind === 'bubble') s3Count += 1;
          if (cell.kind === 'pump' || cell.kind === 'balloon') bonusCount += 1;
        }
        score =
          res.strategicChainScore * 22 +
          s3Count * 16 +
          bonusCount * 55 +
          (p.length >= 6 ? 70 : 0) -
          (p.length * 4); // 短手蓄力优于盲目拆光同色鼓③
      } else {
        // 计算目标推进delta
        const colDelta = Object.keys(ns.progress.colors).reduce((acc, c) => {
          const req = (goal.targets && goal.targets[c]) || (goal.colors && goal.colors[c]) || 0;
          if (!req) return acc;
          const prevDone = Math.min(req, state.progress.colors[c] || 0);
          const nowDone = Math.min(req, ns.progress.colors[c] || 0);
          return acc + (nowDone - prevDone);
        }, 0);
        const tapeDelta = ns.progress.tapesRemoved - state.progress.tapesRemoved;
        const iceDelta = ns.progress.icesMelted - state.progress.icesMelted;
        const dblDelta = ns.progress.doublesBroken - state.progress.doublesBroken;
        const toyDelta = ns.progress.toysRescued - state.progress.toysRescued;

        let toyNearHit = 0;
        if (goal.type === 'toys') {
          for (let t = 0; t < ns.toys.length; t++) {
            if (ns.toys[t].rescued) continue;
            const reqs = getToyRequiredCells(ns, ns.toys[t]);
            for (let q = 0; q < reqs.length; q++) {
              if (ns.poppedEver[reqs[q]] && !state.poppedEver[reqs[q]]) toyNearHit += 1;
            }
          }
        }

        score =
          colDelta * 130 +
          tapeDelta * 180 +
          iceDelta * 190 +
          dblDelta * 170 +
          toyDelta * 900 +
          toyNearHit * 240 +
          res.autoPoppedCount * 45 +
          res.totalPoppedThisMove * 18 +
          (p.length >= 6 ? 95 : 0);
      }

      if (score > bestScore) {
        bestScore = score;
        bestPath = p;
      }
    }

    return bestPath;
  }

  function simulateLevelWinRate(levelNum, runs = 200) {
    let wins = 0;
    let deadlocks = 0;
    for (let r = 0; r < runs; r++) {
      let st = buildCampaignLevel(levelNum, r);
      while (!st.finished) {
        const move = pickGreedyMove(st);
        if (!move) {
          deadlocks += 1;
          break;
        }
        const res = resolveMove(st, move, { fastMode: true });
        if (!res.valid) {
          deadlocks += 1;
          break;
        }
        st = res.state;
      }
      if (st.won) wins += 1;
    }
    return { levelNum, runs, wins, winRate: wins / runs, deadlocks };
  }

  return {
    COLS,
    ROWS,
    TOTAL_CELLS,
    BUBBLE_COLORS,
    BUBBLE_SKINS,
    CHAPTER_ROOMS,
    CAMPAIGN_CONFIGS,
    getColorMeta,
    idxOf,
    inBounds,
    cloneState,
    canConnectCells,
    validatePath,
    isGoalComplete,
    getToyRequiredCells,
    hasAnyValidMove,
    ensurePlayableBoard,
    resolveMove,
    previewMove,
    buildCampaignLevel,
    buildSeasonStage,
    buildEndlessBoard,
    buildDailyBoard,
    pickGreedyMove,
    simulateLevelWinRate
  };
});
