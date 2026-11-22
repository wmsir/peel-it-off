/**
 * PeelLevels — 几何 OBB 精准遮挡判定 + 关卡主题库 + 100% 可解“反向铺贴”生成器
 * UMD 风格：同时兼容浏览器 global、Node 测试与 CommonJS
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.PeelLevels = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const LOGICAL_W = 360;
  const LOGICAL_H = 440;

  const TAPE_COLORS = [
    { id: 'red',    name: '樱桃红', hex: '#EF476F', dark: '#C82D53', light: '#FF85A1', pattern: 'stripe', mark: '▲' },
    { id: 'blue',   name: '晴空蓝', hex: '#118AB2', dark: '#0B6380', light: '#62C8EB', pattern: 'grid',   mark: '●' },
    { id: 'yellow', name: '柠檬黄', hex: '#F4B400', dark: '#C48D00', light: '#FFE066', pattern: 'dots',   mark: '★' },
    { id: 'green',  name: '薄荷绿', hex: '#06B889', dark: '#048764', light: '#6EF2CD', pattern: 'vert',   mark: '◆' },
    { id: 'purple', name: '香芋紫', hex: '#8338EC', dark: '#5E1EC0', light: '#C29BFF', pattern: 'cross',  mark: '✦' },
    { id: 'orange', name: '蜜橘橙', hex: '#FB5607', dark: '#C73F00', light: '#FFA372', pattern: 'wave',   mark: '✚' }
  ];

  const LEVEL_THEMES = [
    {
      title: '拆快递盲箱',
      spools: 5,
      colors: 3,
      difficulty: 0.18,
      layout: 'parcel',
      cardBg: '#d8b482',
      cardAccent: '#b08652',
      cardLabel: '📦 双十一加急包裹',
      cardStamp: '易碎轻放',
      prizeIcon: '🎁',
      prizeName: '隐藏款小夜灯 + 满减免单券！',
      prizeQuote: '“拆快递的第一声嘶啦，是成年人最便宜的快乐！”'
    },
    {
      title: '撕新手机膜',
      spools: 8,
      colors: 4,
      difficulty: 0.44,
      layout: 'weave',
      isDark: true,
      cardBg: '#1e293b',
      cardAccent: '#38bdf8',
      cardLabel: '📱 全新旗舰机出厂膜',
      cardStamp: '原封未拆',
      prizeIcon: '✨',
      prizeName: '零气泡镜面新屏 · 亮到反光！',
      prizeQuote: '“亲手撕下新手机原厂膜，强迫症当场升天！”'
    },
    {
      title: '清理冰箱',
      spools: 10,
      colors: 5,
      difficulty: 0.54,
      layout: 'weave',
      cardBg: '#e0f2fe',
      cardAccent: '#0284c7',
      cardLabel: '🧊 囤货满满的双门冰箱',
      cardStamp: '生鲜保鲜',
      prizeIcon: '🍓',
      prizeName: '治愈整洁冰箱：冰西瓜 + 满格气泡水！',
      prizeQuote: '“过期酱料全清光，冰镇快乐装满格！”'
    },
    {
      title: '抽潮玩盲盒',
      spools: 12,
      colors: 5,
      difficulty: 0.62,
      layout: 'starburst',
      cardBg: '#fce7f3',
      cardAccent: '#db2777',
      cardLabel: '🎀 限定潮玩盲盒封条',
      cardStamp: '1/144隐藏',
      prizeIcon: '🧸',
      prizeName: '欧皇附体！一发抽出隐藏款公仔！',
      prizeQuote: '“手气爆棚，今天买奶茶都能多加一勺珍珠！”'
    },
    {
      title: '撸猫粘毛贴',
      spools: 14,
      colors: 6,
      difficulty: 0.68,
      layout: 'weave',
      cardBg: '#fef3c7',
      cardAccent: '#d97706',
      cardLabel: '🐾 粘满猫毛的深色外套',
      cardStamp: '猫主子出品',
      prizeIcon: '🐱',
      prizeName: '滚筒粘得超干净 + 翻肚皮胖橘呼噜噜！',
      prizeQuote: '“虽然沾了一身毛，但猫猫翻肚皮我就原谅它！”'
    },
    {
      title: '撕减肥便签',
      spools: 15,
      colors: 6,
      difficulty: 0.70,
      layout: 'starburst',
      cardBg: '#dcfce7',
      cardAccent: '#16a34a',
      cardLabel: '🥗 明天一定减肥计划表',
      cardStamp: '第108次',
      prizeIcon: '🧋',
      prizeName: '“先喝完这杯三分糖奶茶，明天再减！”',
      prizeQuote: '“吃饱了才有力气减肥，开心最重要！”'
    },
    {
      title: '撕摸鱼便签',
      spools: 16,
      colors: 6,
      difficulty: 0.72,
      layout: 'denseCross',
      cardBg: '#e2e8f0',
      cardAccent: '#475569',
      cardLabel: '💼 工位贴满的摸鱼便利贴',
      cardStamp: '周五17:55',
      prizeIcon: '🏃‍♀️',
      prizeName: '待办全清零！准点打卡冲向周末！',
      prizeQuote: '“只要撕得够快，临时加班就追不上我！”'
    },
    {
      title: '撕掉账单焦虑',
      spools: 17,
      colors: 6,
      difficulty: 0.74,
      layout: 'weave',
      cardBg: '#fee2e2',
      cardAccent: '#ef4444',
      cardLabel: '🏠 本月水电房租提醒单',
      cardStamp: '已全缴清',
      prizeIcon: '🛋️',
      prizeName: '宅家躺平大礼包 + 温暖阳光小窝！',
      prizeQuote: '“把生活账单焦虑撕碎，好好享受自己的小家！”'
    },
    {
      title: '清行李箱贴纸',
      spools: 18,
      colors: 6,
      difficulty: 0.76,
      layout: 'denseCross',
      cardBg: '#dbeafe',
      cardAccent: '#2563eb',
      cardLabel: '🧳 贴满旧托运标的拉杆箱',
      cardStamp: '准备出发',
      prizeIcon: '✈️',
      prizeName: '特价机票到手 · 说走就走去看海！',
      prizeQuote: '“世界那么大，先把旧贴纸撕得干干净净！”'
    },
    {
      title: '拆美妆礼盒',
      spools: 19,
      colors: 6,
      difficulty: 0.78,
      layout: 'starburst',
      cardBg: '#fae8ff',
      cardAccent: '#a21caf',
      cardLabel: '💄 丝带封口限定护肤礼盒',
      cardStamp: '宠爱自己',
      prizeIcon: '🌸',
      prizeName: '限定正装套盒 · 素颜也能发光！',
      prizeQuote: '“辛苦了一周，理直气壮奖励自己一份仪式感！”'
    },
    {
      title: '整理梳妆台',
      spools: 20,
      colors: 6,
      difficulty: 0.80,
      layout: 'weave',
      cardBg: '#ffe4e6',
      cardAccent: '#e11d48',
      cardLabel: '🪞 贴满色号签的收纳盒',
      cardStamp: '强迫症必清',
      prizeIcon: '💎',
      prizeName: '一尘不染梳妆台 · 心情瞬间变清爽！',
      prizeQuote: '“把桌面理顺的那一刻，连心情也一起理顺了！”'
    },
    {
      title: '撕奶茶封口膜',
      spools: 21,
      colors: 6,
      difficulty: 0.81,
      layout: 'vault',
      cardBg: '#ffedd5',
      cardAccent: '#ea580c',
      cardLabel: '🧋 手打柠檬茶双层封膜',
      cardStamp: '去冰少糖',
      prizeIcon: '🍋',
      prizeName: '啵的一声扎开 · 冰爽维C直冲天灵盖！',
      prizeQuote: '“下午三点的续命神器，谁喝谁快乐！”'
    },
    {
      title: '清理旧书桌',
      spools: 21,
      colors: 6,
      difficulty: 0.82,
      layout: 'denseCross',
      cardBg: '#ecfccb',
      cardAccent: '#65a30d',
      cardLabel: '📚 叠满便利贴的断舍离桌面',
      cardStamp: '断舍离',
      prizeIcon: '🌿',
      prizeName: '治愈绿植书桌 + 一杯热手冲咖啡！',
      prizeQuote: '“给生活做减法，腾出地方装新好运！”'
    },
    {
      title: '撕手表新屏幕膜',
      spools: 22,
      colors: 6,
      difficulty: 0.83,
      layout: 'starburst',
      isDark: true,
      cardBg: '#0f172a',
      cardAccent: '#22d3ee',
      cardLabel: '⌚ 全新运动手表出厂贴膜',
      cardStamp: '满电待发',
      prizeIcon: '🏅',
      prizeName: '今日一万步达成 · 元气值拉满！',
      prizeQuote: '“撕开保护膜，开启活力满满的新一天！”'
    },
    {
      title: '拆追剧零食箱',
      spools: 22,
      colors: 6,
      difficulty: 0.84,
      layout: 'vault',
      cardBg: '#fef9c3',
      cardAccent: '#ca8a04',
      cardLabel: '🍿 囤满零食的周末狂欢箱',
      cardStamp: '周末特供',
      prizeIcon: '🍟',
      prizeName: '薯片烤肠小饼干 · 追剧幸福感爆棚！',
      prizeQuote: '“关灯盖被子追剧，这一刻给个神仙都不换！”'
    },
    {
      title: '解封好运存钱罐',
      spools: 23,
      colors: 6,
      difficulty: 0.85,
      layout: 'vault',
      cardBg: '#fef3c7',
      cardAccent: '#d97706',
      cardLabel: '🐷 贴满封条的愿望存钱罐',
      cardStamp: '只进不出',
      prizeIcon: '💰',
      prizeName: '心愿基金攒满 · 暴富好运正敲门！',
      prizeQuote: '“所有认真生活的人，都会迎来闪闪发光的一天！”'
    }
  ];

  function makeRng(seed) {
    let s = (seed >>> 0) || 1;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function getOBBCorners(tape, inset = 0) {
    const hw = Math.max(4, tape.length * 0.5 - inset);
    const hh = Math.max(4, tape.width * 0.5 - inset);
    const cos = Math.cos(tape.angle);
    const sin = Math.sin(tape.angle);
    const cx = tape.cx;
    const cy = tape.cy;
    return [
      { x: cx + (-hw * cos - -hh * sin), y: cy + (-hw * sin + -hh * cos) },
      { x: cx + ( hw * cos - -hh * sin), y: cy + ( hw * sin + -hh * cos) },
      { x: cx + ( hw * cos -  hh * sin), y: cy + ( hw * sin +  hh * cos) },
      { x: cx + (-hw * cos -  hh * sin), y: cy + (-hw * sin +  hh * cos) }
    ];
  }

  function obbIntersects(a, b, inset = 3.5) {
    const dx = a.cx - b.cx;
    const dy = a.cy - b.cy;
    const maxR = (a.length + a.width + b.length + b.width) * 0.5;
    if (dx * dx + dy * dy > maxR * maxR) return false;

    const cornersA = getOBBCorners(a, inset);
    const cornersB = getOBBCorners(b, inset);
    const axes = [
      { x: Math.cos(a.angle), y: Math.sin(a.angle) },
      { x: -Math.sin(a.angle), y: Math.cos(a.angle) },
      { x: Math.cos(b.angle), y: Math.sin(b.angle) },
      { x: -Math.sin(b.angle), y: Math.cos(b.angle) }
    ];

    for (let i = 0; i < axes.length; i++) {
      const ax = axes[i];
      let minA = Infinity, maxA = -Infinity;
      let minB = Infinity, maxB = -Infinity;

      for (let j = 0; j < 4; j++) {
        const pA = cornersA[j].x * ax.x + cornersA[j].y * ax.y;
        if (pA < minA) minA = pA;
        if (pA > maxA) maxA = pA;

        const pB = cornersB[j].x * ax.x + cornersB[j].y * ax.y;
        if (pB < minB) minB = pB;
        if (pB > maxB) maxB = pB;
      }
      if (maxA <= minB || maxB <= minA) return false;
    }
    return true;
  }

  function pointInTape(px, py, tape, pad = 6) {
    const dx = px - tape.cx;
    const dy = py - tape.cy;
    const cos = Math.cos(-tape.angle);
    const sin = Math.sin(-tape.angle);
    const lx = dx * cos - dy * sin;
    const ly = dx * sin + dy * cos;
    return Math.abs(lx) <= tape.length * 0.5 + pad && Math.abs(ly) <= tape.width * 0.5 + pad;
  }

  function getBlockingTapes(target, allTapes) {
    const blockers = [];
    for (let i = 0; i < allTapes.length; i++) {
      const other = allTapes[i];
      if (other.id === target.id) continue;
      if (other.state === 'done' || (other.state === 'peeling' && other.peelProgress > 0.42)) continue;
      if (other.z > target.z && obbIntersects(target, other, 3.5)) {
        blockers.push(other);
      }
    }
    return blockers;
  }

  /**
   * 🏹 单向箭头抽拉检测：沿 peelDir 前方 52px 通道是否有更上层胶带挡住（严格 other.z > target.z，保证有向无环）
   */
  function getArrowBlockers(target, allTapes) {
    if (!target.arrow) return [];
    const dirX = Math.cos(target.angle) * target.peelDir;
    const dirY = Math.sin(target.angle) * target.peelDir;
    const probe = {
      cx: target.cx + dirX * (target.length * 0.5 + 26),
      cy: target.cy + dirY * (target.length * 0.5 + 26),
      length: 52,
      width: target.width * 0.72,
      angle: target.angle
    };
    const blockers = [];
    for (let i = 0; i < allTapes.length; i++) {
      const other = allTapes[i];
      if (other.id === target.id) continue;
      if (other.state === 'done' || (other.state === 'peeling' && other.peelProgress > 0.42)) continue;
      if (other.z > target.z && obbIntersects(probe, other, 2.5)) {
        blockers.push(other);
      }
    }
    return blockers;
  }

  function isTapePeelable(target, allTapes) {
    return (
      target.state === 'idle' &&
      (target.wax || 0) <= 0 &&
      getBlockingTapes(target, allTapes).length === 0 &&
      getArrowBlockers(target, allTapes).length === 0
    );
  }

  function generateTapeGeometries(count, layoutType, rng) {
    const slots = [];
    const cx0 = LOGICAL_W * 0.5;
    const cy0 = LOGICAL_H * 0.5;

    for (let i = 0; i < count; i++) {
      const layerFrac = i / Math.max(1, count - 1);
      let cx, cy, angle, length, width;

      if (layoutType === 'parcel') {
        const presets = [
          { x:   0, y:    0, deg: -10, len: 244 },
          { x:   0, y:    0, deg:  82, len: 236 },
          { x:   0, y:  -34, deg:  24, len: 226 },
          { x:   2, y:   34, deg: -24, len: 226 },
          { x: -16, y:   -6, deg:  14, len: 210 },
          { x:  18, y:   12, deg: -72, len: 204 },
          { x:   0, y:  -68, deg:   6, len: 212 },
          { x: -46, y:  -58, deg: -40, len: 206 },
          { x:  48, y:   56, deg: -38, len: 206 },
          { x:  48, y:  -54, deg:  42, len: 206 },
          { x: -46, y:   58, deg:  40, len: 206 },
          { x: -94, y:   16, deg:  87, len: 176 },
          { x:  94, y:  -16, deg: -87, len: 176 },
          { x: -24, y: -126, deg:  -6, len: 172 },
          { x:  24, y:  126, deg:   6, len: 172 }
        ];
        const p = presets[i % presets.length];
        cx = cx0 + p.x + (rng() - 0.5) * 6;
        cy = cy0 + p.y + (rng() - 0.5) * 6;
        angle = (p.deg + (rng() - 0.5) * 5) * (Math.PI / 180);
        length = p.len;
        width = 46;
      } else if (i >= count - 4) {
        const q = i - (count - 4);
        const qCoords = [
          { x: -84, y: -122, deg: -18 },
          { x:  84, y: -118, deg:  20 },
          { x: -82, y:  122, deg:  20 },
          { x:  84, y:  118, deg: -18 }
        ];
        const qc = qCoords[q];
        cx = cx0 + qc.x + (rng() - 0.5) * 8;
        cy = cy0 + qc.y + (rng() - 0.5) * 8;
        angle = (qc.deg + (rng() - 0.5) * 10) * (Math.PI / 180);
        length = 126 + rng() * 14;
        width = 42;
      } else if (layoutType === 'weave') {
        const zone = i % 6;
        const zx = [-74, 74, -72, 72, 0, 0][zone];
        const zy = [-116, -116, 116, 116, -36, 40][zone];
        cx = cx0 + zx + (rng() - 0.5) * 42;
        cy = cy0 + zy + (rng() - 0.5) * 44;
        const baseDeg = [0, 88, -32, 32, 12, -82][i % 6];
        angle = (baseDeg + (rng() - 0.5) * 20) * (Math.PI / 180);
        length = 122 + rng() * 30;
        width = 37;
      } else if (layoutType === 'starburst') {
        const spoke = (i % 8) * (Math.PI / 4) + Math.floor(i / 8) * 0.28 + (rng() - 0.5) * 0.16;
        const radius = (i % 4 === 0 ? 34 : (i % 2 === 0 ? 94 : 120)) + (rng() - 0.5) * 22;
        cx = cx0 + Math.cos(spoke) * Math.min(106, radius * 0.88);
        cy = cy0 + Math.sin(spoke) * Math.min(140, radius * 1.12);
        angle = spoke + (i % 2 === 0 ? Math.PI * 0.5 : 0) + (rng() - 0.5) * 0.24;
        length = 120 + rng() * 30;
        width = 37;
      } else {
        const zone = i % 6;
        const zx = [-76, 76, 0, -74, 74, 0][zone];
        const zy = [-110, -110, -18, 110, 110, 46][zone];
        cx = cx0 + zx + (rng() - 0.5) * 46;
        cy = cy0 + zy + (rng() - 0.5) * 48;
        const baseAngles = [0, 90, 38, -38, 18, -72];
        angle = (baseAngles[i % 6] + (rng() - 0.5) * 22) * (Math.PI / 180);
        length = 122 + rng() * 32;
        width = 37;
      }

      const halfSpanX = Math.abs(Math.cos(angle)) * (length * 0.5) + Math.abs(Math.sin(angle)) * (width * 0.5);
      const halfSpanY = Math.abs(Math.sin(angle)) * (length * 0.5) + Math.abs(Math.cos(angle)) * (width * 0.5);
      const margin = 14;
      cx = Math.max(margin + halfSpanX, Math.min(LOGICAL_W - margin - halfSpanX, cx));
      cy = Math.max(margin + halfSpanY, Math.min(LOGICAL_H - margin - halfSpanY, cy));

      slots.push({
        id: 't_' + i,
        z: i,
        cx,
        cy,
        angle,
        length,
        width,
        peelDir: rng() > 0.5 ? 1 : -1,
        state: 'idle',
        peelProgress: 0,
        shakeTime: 0,
        highlightTime: 0,
        flipAnim: 0,
        bonkTime: 0,
        arrow: false,
        mystery: false,
        revealed: true,
        wax: 0,
        bomb: 0,
        bombArmed: false
      });
    }

    return slots;
  }

  function buildLevel(levelIndex, retryOffset = 0) {
    const cycleBase = LEVEL_THEMES[levelIndex % LEVEL_THEMES.length];
    const baseTheme = LEVEL_THEMES[levelIndex] || Object.assign({}, cycleBase, {
      title: cycleBase.title + '·进阶',
      spools: 23,
      colors: 6,
      difficulty: 0.86,
      layout: levelIndex % 2 === 0 ? 'starburst' : 'denseCross'
    });

    const rng = makeRng((levelIndex + 1) * 7919 + retryOffset * 104729 + 313);
    const palette = TAPE_COLORS.slice(0, baseTheme.colors);
    const totalSpools = baseTheme.spools;
    const totalTapes = totalSpools * 3;

    const spoolQueue = [];
    for (let i = 0; i < totalSpools; i++) {
      spoolQueue.push(palette[i % palette.length].id);
    }
    for (let i = spoolQueue.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = spoolQueue[i];
      spoolQueue[i] = spoolQueue[j];
      spoolQueue[j] = tmp;
    }
    if (spoolQueue.length >= 2 && spoolQueue[0] === spoolQueue[1]) {
      for (let k = 2; k < spoolQueue.length; k++) {
        if (spoolQueue[k] !== spoolQueue[0]) {
          const tmp = spoolQueue[1];
          spoolQueue[1] = spoolQueue[k];
          spoolQueue[k] = tmp;
          break;
        }
      }
    }

    // 防止连续 3 卷同色，保持策略调度空间
    if (palette.length >= 2) {
      for (let i = 2; i < spoolQueue.length; i++) {
        if (spoolQueue[i] === spoolQueue[i - 1] && spoolQueue[i] === spoolQueue[i - 2]) {
          for (let k = i + 1; k < spoolQueue.length; k++) {
            if (spoolQueue[k] !== spoolQueue[i]) {
              const tmp = spoolQueue[i];
              spoolQueue[i] = spoolQueue[k];
              spoolQueue[k] = tmp;
              break;
            }
          }
        }
      }
    }

    const diff = baseTheme.difficulty;
    const tapes = generateTapeGeometries(totalTapes, baseTheme.layout, rng);

    // 1. 🏹 单向箭头（第 2 关起）：严格沿中心向外，且与上方层严格保持 z-order 有向无环
    if (levelIndex >= 1) {
      for (let i = 0; i < tapes.length; i++) {
        if (rng() < 0.30) {
          const t = tapes[i];
          t.arrow = true;
          const dx = t.cx - LOGICAL_W * 0.5;
          const dy = t.cy - LOGICAL_H * 0.5;
          t.peelDir = (Math.cos(t.angle) * dx + Math.sin(t.angle) * dy) < 0 ? -1 : 1;
        }
      }
      let openCount = tapes.filter((t) => isTapePeelable(t, tapes)).length;
      if (openCount < 4) {
        for (let i = tapes.length - 1; i >= 0 && openCount < 4; i--) {
          const t = tapes[i];
          if (t.arrow && getBlockingTapes(t, tapes).length === 0) {
            t.arrow = false;
            if (isTapePeelable(t, tapes)) openCount++;
          }
        }
      }
      if (!tapes.some((t) => t.arrow)) {
        const lowest = tapes[0];
        lowest.arrow = true;
        const dx = lowest.cx - LOGICAL_W * 0.5;
        const dy = lowest.cy - LOGICAL_H * 0.5;
        lowest.peelDir = (Math.cos(lowest.angle) * dx + Math.sin(lowest.angle) * dy) < 0 ? -1 : 1;
      }
    }

    // 2. 🎯 构造式策略有解路径生成器（正演模拟真实双卷芯 + 5格暂存区 + 下一卷预告，数学保证 0 死结与 100% 颜色守恒）
    const slotBudget = {};
    for (let i = 0; i < palette.length; i++) slotBudget[palette[i].id] = 0;
    for (let i = 0; i < spoolQueue.length; i++) {
      slotBudget[spoolQueue[i]] = (slotBudget[spoolQueue[i]] || 0) + 3;
    }

    const simTray = {};
    let simTrayTotal = 0;
    let poppedCount = 0;
    let nextQ = 0;
    const simActive = [null, null];

    function simSweepSlot(idx) {
      while (simActive[idx] && simActive[idx].need <= 0) {
        poppedCount++;
        if (nextQ < spoolQueue.length) {
          const nc = spoolQueue[nextQ++];
          const inTray = simTray[nc] || 0;
          const take = Math.min(3, inTray);
          if (take > 0) {
            simTray[nc] = inTray - take;
            simTrayTotal -= take;
          }
          simActive[idx] = { color: nc, need: 3 - take };
        } else {
          simActive[idx] = null;
        }
      }
    }

    for (let i = 0; i < 2; i++) {
      if (nextQ < spoolQueue.length) {
        simActive[i] = { color: spoolQueue[nextQ++], need: 3 };
      }
    }

    for (let i = 0; i < tapes.length; i++) {
      tapes[i].color = null;
      tapes[i].state = 'idle';
      tapes[i].poppedAtPeel = 0;
      tapes[i].unlockStep = getBlockingTapes(tapes[i], tapes).length === 0 ? 0 : -1;
      tapes[i].peelStep = 0;
    }

    const nT = tapes.length;
    const gBlk = new Array(nT);
    const gArr = new Array(nT);
    const gBelow = new Array(nT);
    for (let i = 0; i < nT; i++) gBelow[i] = [];
    for (let i = 0; i < nT; i++) {
      tapes[i]._idx = i;
      const obs = getBlockingTapes(tapes[i], tapes).map((b) => tapes.indexOf(b));
      const abs = tapes[i].arrow ? getArrowBlockers(tapes[i], tapes).map((b) => tapes.indexOf(b)) : [];
      gBlk[i] = obs;
      gArr[i] = abs;
      tapes[i].unlockStep = obs.length === 0 ? 0 : -1;
      for (let k = 0; k < obs.length; k++) gBelow[obs[k]].push(i);
      for (let k = 0; k < abs.length; k++) {
        if (gBelow[abs[k]].indexOf(i) === -1) gBelow[abs[k]].push(i);
      }
    }
    function simHasBlk(idx) {
      const a = gBlk[idx];
      for (let k = 0; k < a.length; k++) if (tapes[a[k]].state === 'idle') return true;
      return false;
    }
    function simCntAll(idx) {
      let c = 0;
      const a = gBlk[idx], b = gArr[idx];
      for (let k = 0; k < a.length; k++) if (tapes[a[k]].state === 'idle') c++;
      for (let k = 0; k < b.length; k++) if (tapes[b[k]].state === 'idle') c++;
      return c;
    }
    function simPeelable(t) {
      return t.state === 'idle' && simCntAll(t._idx) === 0;
    }
    function countUnlockPotential(tape) {
      let directUnlock = 0, partialBlock = 0;
      const bl = gBelow[tape._idx];
      for (let k = 0; k < bl.length; k++) {
        const u = tapes[bl[k]];
        if (u.state !== 'idle') continue;
        const tot = simCntAll(u._idx);
        if (tot === 1) directUnlock++;
        else if (tot > 1) partialBlock++;
      }
      return { directUnlock, partialBlock };
    }

    const maxSimTray = levelIndex === 0 ? 1 : 2;
    const desiredTraps = levelIndex === 0 ? 0 : 2;
    let pendingUnlockedIds = [];
    const deferredIds = [];

    for (let step = 0; step < totalTapes; step++) {
      const allPeelables = tapes.filter(simPeelable);
      if (!allPeelables.length) throw new Error('Constructive level solver encountered blocked state at step ' + step);

      if (desiredTraps > 0 && step < totalTapes * 0.72) {
        for (let di = deferredIds.length - 1; di >= 0; di--) {
          const dt = tapes[deferredIds[di]];
          if (!dt || dt.state !== 'idle') deferredIds.splice(di, 1);
        }
        if (deferredIds.length < desiredTraps && allPeelables.length - deferredIds.length > 2) {
          const cands = allPeelables
            .filter((t) => deferredIds.indexOf(t._idx) === -1 && pendingUnlockedIds.indexOf(t._idx) === -1)
            .sort((a, b) => {
              const pa = countUnlockPotential(a), pb = countUnlockPotential(b);
              return (pa.directUnlock * 3 + pa.partialBlock) - (pb.directUnlock * 3 + pb.partialBlock);
            });
          while (cands.length > 0 && deferredIds.length < desiredTraps && allPeelables.length - deferredIds.length > 2) {
            deferredIds.push(cands.shift()._idx);
          }
        }
      }
      const nonDef = step < totalTapes * 0.72 ? allPeelables.filter((t) => deferredIds.indexOf(t._idx) === -1) : allPeelables;
      const peelables = nonDef.length > 0 ? nonDef : allPeelables;

      const activeOpts = [];
      for (let i = 0; i < simActive.length; i++) {
        const sp = simActive[i];
        if (sp && sp.need >= 1 && slotBudget[sp.color] > 0) activeOpts.push({ idx: i, sp });
      }
      const decoyColors = [];
      for (let i = 0; i < palette.length; i++) {
        const cid = palette[i].id;
        if (slotBudget[cid] <= 0) continue;
        if (!activeOpts.some((o) => o.sp.color === cid)) decoyColors.push(cid);
      }
      const blockersInP = [];
      for (let i = 0; i < peelables.length; i++) {
        const pot = countUnlockPotential(peelables[i]);
        if (pot.directUnlock > 0 || pot.partialBlock > 0) {
          blockersInP.push({ tape: peelables[i], directUnlock: pot.directUnlock, partialBlock: pot.partialBlock });
        }
      }
      const unlockedCandidates = peelables.filter((t) => pendingUnlockedIds.indexOf(t._idx) !== -1);

      let chosenColor = null, chosenSpIdx = -1, chosenTape = null;
      const targetTrayPressure = levelIndex === 0 ? 0 : 2;
      const canDetour = levelIndex >= 1 && simTrayTotal < maxSimTray && decoyColors.length > 0 && blockersInP.length > 0;
      let detourChance = 0;
      if (canDetour) {
        if (simTrayTotal < targetTrayPressure) detourChance = 0.62 + diff * 0.16;
        else if (activeOpts.some((o) => o.sp.need === 1)) detourChance = 0.45 + diff * 0.18;
      }
      if (unlockedCandidates.length >= 1 && simTrayTotal >= 1 && rng() < 0.72) detourChance = 0;

      if (canDetour && rng() < detourChance) {
        const next1 = nextQ < spoolQueue.length ? spoolQueue[nextQ] : null;
        const next2 = nextQ + 1 < spoolQueue.length ? spoolQueue[nextQ + 1] : null;
        if (next1 && decoyColors.indexOf(next1) !== -1 && rng() < 0.82) chosenColor = next1;
        else if (next2 && decoyColors.indexOf(next2) !== -1 && rng() < 0.78) chosenColor = next2;
        else chosenColor = decoyColors[Math.floor(rng() * decoyColors.length)];

        blockersInP.sort((a, b) => (b.directUnlock * 3 + b.partialBlock) - (a.directUnlock * 3 + a.partialBlock));
        const topK = Math.min(blockersInP.length, blockersInP[0].directUnlock > 0 ? 2 : 3);
        chosenTape = blockersInP[Math.floor(rng() * topK)].tape;
      } else {
        activeOpts.sort((a, b) => a.sp.need - b.sp.need);
        const pickOpt = (activeOpts.length >= 2 && rng() < 0.22) ? activeOpts[1] : activeOpts[0];
        chosenColor = pickOpt.sp.color;
        chosenSpIdx = pickOpt.idx;
        if (unlockedCandidates.length > 0 && (levelIndex >= 2 ? rng() < 0.88 : rng() < 0.55)) {
          chosenTape = unlockedCandidates[Math.floor(rng() * unlockedCandidates.length)];
        } else if (blockersInP.length > 0) {
          chosenTape = blockersInP[Math.floor(rng() * blockersInP.length)].tape;
        } else {
          peelables.sort((a, b) => b.z - a.z);
          chosenTape = peelables[0];
        }
      }

      chosenTape.color = chosenColor;
      chosenTape.state = 'done';
      chosenTape.poppedAtPeel = poppedCount;
      chosenTape.peelStep = step;
      slotBudget[chosenColor] -= 1;

      if (chosenSpIdx !== -1) {
        simActive[chosenSpIdx].need -= 1;
        simSweepSlot(chosenSpIdx);
      } else {
        simTray[chosenColor] = (simTray[chosenColor] || 0) + 1;
        simTrayTotal += 1;
      }

      const nextPending = pendingUnlockedIds.filter((id) => id !== chosenTape._idx);
      const bl = gBelow[chosenTape._idx];
      for (let k = 0; k < bl.length; k++) {
        const u = tapes[bl[k]];
        if (u.state !== 'idle') continue;
        if (u.unlockStep === -1 && !simHasBlk(u._idx)) u.unlockStep = step + 1;
        if (chosenSpIdx === -1 && nextPending.indexOf(u._idx) === -1 && simPeelable(u) && u.unlockStep === step + 1) {
          nextPending.push(u._idx);
        }
      }
      pendingUnlockedIds = nextPending;
    }
    for (let i = 0; i < nT; i++) delete tapes[i]._idx;

    for (let i = 0; i < tapes.length; i++) {
      tapes[i].state = 'idle';
    }

    // 3. ❓ 刮刮盲盒贴（第 3 关起）：仅压在下层的胶带可成为银色刮刮贴，严格封顶以免纯盲猜
    if (levelIndex >= 2) {
      const maxMystery = Math.min(4, 2 + Math.floor((levelIndex - 2) * 0.2));
      const mysPool = [];
      for (let i = 0; i < tapes.length; i++) {
        if (getBlockingTapes(tapes[i], tapes).length > 0) {
          mysPool.push(tapes[i]);
        }
      }
      for (let i = mysPool.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = mysPool[i];
        mysPool[i] = mysPool[j];
        mysPool[j] = tmp;
      }
      for (let i = 0; i < Math.min(maxMystery, mysPool.length); i++) {
        mysPool[i].mystery = true;
        mysPool[i].revealed = false;
      }
    }

    // 4. ❄️ 冰封火漆锁（第 4 关起）：只放在构造路径已收满 >= 2 卷且初始被压住的胶带上，确保必定可融解且不堵开局
    if (levelIndex >= 3) {
      const maxWax = Math.min(5, 2 + Math.floor((levelIndex - 2) * 0.4));
      let waxPool = [];
      for (let i = 0; i < tapes.length; i++) {
        const t = tapes[i];
        if (t.poppedAtPeel >= 2 && !t.mystery && getBlockingTapes(t, tapes).length > 0) {
          waxPool.push(t);
        }
      }
      if (waxPool.length === 0) {
        waxPool = tapes.filter((t) => !t.mystery && getBlockingTapes(t, tapes).length > 0);
      }
      for (let i = waxPool.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = waxPool[i];
        waxPool[i] = waxPool[j];
        waxPool[j] = tmp;
      }
      for (let i = 0; i < Math.min(maxWax, waxPool.length); i++) {
        const wt = waxPool[i];
        wt.wax = (wt.poppedAtPeel >= 4 && levelIndex >= 4 && rng() < 0.45) ? 2 : 1;
      }
    }

    // 5. 💣 倒计时引信贴（第 5 关起）：放在被压住的非冰封/非盲盒胶带上，优先选取露头后 4 步内即顺手拆弹的位置
    if (levelIndex >= 4) {
      const maxBomb = Math.min(2, 1 + Math.floor((levelIndex - 3) * 0.45));
      const allBuried = [];
      for (let i = 0; i < tapes.length; i++) {
        const t = tapes[i];
        if (getBlockingTapes(t, tapes).length > 0 && t.wax === 0 && !t.mystery) {
          allBuried.push(t);
        }
      }
      let bombPool = allBuried.filter((t) => !t.arrow && (t.peelStep - t.unlockStep) <= 4);
      if (bombPool.length < maxBomb) {
        bombPool = allBuried.filter((t) => (t.peelStep - t.unlockStep) <= 6);
      }
      if (bombPool.length < maxBomb) {
        bombPool = allBuried;
      }
      for (let i = bombPool.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = bombPool[i];
        bombPool[i] = bombPool[j];
        bombPool[j] = tmp;
      }
      for (let i = 0; i < Math.min(maxBomb, bombPool.length); i++) {
        bombPool[i].bomb = 7;
        bombPool[i].bombArmed = false;
      }
    }

    for (let i = 0; i < tapes.length; i++) {
      delete tapes[i].poppedAtPeel;
      delete tapes[i].unlockStep;
      delete tapes[i].peelStep;
    }

    const counts = {};
    tapes.forEach((t) => { counts[t.color] = (counts[t.color] || 0) + 1; });
    const spoolCounts = {};
    spoolQueue.forEach((c) => { spoolCounts[c] = (spoolCounts[c] || 0) + 3; });
    Object.keys(spoolCounts).forEach((c) => {
      if (counts[c] !== spoolCounts[c]) {
        throw new Error('Color conservation violated for ' + c);
      }
    });

    return {
      levelIndex,
      theme: baseTheme,
      palette,
      tapes,
      spoolQueue
    };
  }

  function getColorMeta(colorId) {
    return TAPE_COLORS.find((c) => c.id === colorId) || TAPE_COLORS[0];
  }

  return {
    LOGICAL_W,
    LOGICAL_H,
    TAPE_COLORS,
    LEVEL_THEMES,
    getOBBCorners,
    obbIntersects,
    pointInTape,
    getBlockingTapes,
    getArrowBlockers,
    isTapePeelable,
    buildLevel,
    getColorMeta
  };
});
