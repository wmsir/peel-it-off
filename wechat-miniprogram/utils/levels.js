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
      spools: 4,
      colors: 3,
      difficulty: 0.08,
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
      spools: 6,
      colors: 4,
      difficulty: 0.24,
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
      spools: 8,
      colors: 4,
      difficulty: 0.32,
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
      spools: 9,
      colors: 5,
      difficulty: 0.38,
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
      spools: 10,
      colors: 5,
      difficulty: 0.42,
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
      spools: 11,
      colors: 5,
      difficulty: 0.46,
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
      spools: 12,
      colors: 5,
      difficulty: 0.49,
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
      spools: 13,
      colors: 6,
      difficulty: 0.52,
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
      spools: 14,
      colors: 6,
      difficulty: 0.54,
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
      spools: 15,
      colors: 6,
      difficulty: 0.56,
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
      spools: 16,
      colors: 6,
      difficulty: 0.58,
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
      spools: 17,
      colors: 6,
      difficulty: 0.60,
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
      spools: 18,
      colors: 6,
      difficulty: 0.62,
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
      spools: 19,
      colors: 6,
      difficulty: 0.64,
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
      spools: 20,
      colors: 6,
      difficulty: 0.65,
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
      spools: 21,
      colors: 6,
      difficulty: 0.66,
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
        const band = i % 4;
        const jitterX = (rng() - 0.5) * 30;
        const jitterY = (rng() - 0.5) * 30;
        if (band === 0) {
          cx = cx0 + jitterX;
          cy = cy0 + (-114 + ((i / 4) % 4) * 76) + (rng() - 0.5) * 14;
          angle = ((rng() - 0.5) * 16) * (Math.PI / 180);
          length = 200 + rng() * 38;
        } else if (band === 1) {
          cx = cx0 + (-88 + ((i / 4) % 4) * 58) + (rng() - 0.5) * 14;
          cy = cy0 + jitterY;
          angle = (90 + (rng() - 0.5) * 16) * (Math.PI / 180);
          length = 198 + rng() * 36;
        } else if (band === 2) {
          cx = cx0 + (rng() * 2 - 1) * 105;
          cy = cy0 + (rng() * 2 - 1) * 126;
          angle = (36 + (rng() - 0.5) * 18) * (Math.PI / 180);
          length = 195 + rng() * 38;
        } else {
          cx = cx0 + (rng() * 2 - 1) * 105;
          cy = cy0 + (rng() * 2 - 1) * 126;
          angle = (-36 + (rng() - 0.5) * 18) * (Math.PI / 180);
          length = 195 + rng() * 38;
        }
        width = 42;
      } else if (layoutType === 'starburst') {
        const ring = Math.floor(i / 6);
        const spoke = (i % 6) * (Math.PI / 6) + ring * 0.23 + (rng() - 0.5) * 0.14;
        const radius = (i % 3 === 0 ? 26 : 70) + (rng() - 0.5) * 28;
        cx = cx0 + Math.cos(spoke) * radius;
        cy = cy0 + Math.sin(spoke) * radius * 1.24;
        angle = spoke + Math.PI * 0.5 + (rng() - 0.5) * 0.25;
        length = 186 + rng() * 40;
        width = 40;
      } else {
        const phase = i % 5;
        const spreadX = 94 - layerFrac * 16;
        const spreadY = 128 - layerFrac * 20;
        cx = cx0 + (rng() * 2 - 1) * spreadX;
        cy = cy0 + (rng() * 2 - 1) * spreadY;
        const baseAngles = [0, 90, 42, -42, 20];
        angle = (baseAngles[phase] + (rng() - 0.5) * 22) * (Math.PI / 180);
        length = 176 + rng() * 48;
        width = 39;
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
        flipAnim: 0
      });
    }

    return slots;
  }

  function buildLevel(levelIndex, retryOffset = 0) {
    const cycleBase = LEVEL_THEMES[levelIndex % LEVEL_THEMES.length];
    const baseTheme = LEVEL_THEMES[levelIndex] || Object.assign({}, cycleBase, {
      title: cycleBase.title + '·进阶',
      spools: 22,
      colors: 6,
      difficulty: 0.68,
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

    const colorSeq = [];
    for (let i = 0; i < spoolQueue.length; i++) {
      colorSeq.push(spoolQueue[i], spoolQueue[i], spoolQueue[i]);
    }

    const diff = baseTheme.difficulty;
    const swapPasses = Math.round(totalTapes * (0.2 + diff * 1.1));
    for (let s = 0; s < swapPasses; s++) {
      const idx = Math.floor(rng() * totalTapes);
      const progress = idx / totalTapes;
      const maxSpan = progress < 0.45
        ? Math.max(2, Math.round(2 + diff * 3.5))
        : Math.max(3, Math.round(3 + diff * 9.5));
      const delta = Math.floor((rng() * 2 - 1) * maxSpan);
      const j = Math.max(0, Math.min(totalTapes - 1, idx + delta));
      const tmp = colorSeq[idx];
      colorSeq[idx] = colorSeq[j];
      colorSeq[j] = tmp;
    }

    const tapes = generateTapeGeometries(totalTapes, baseTheme.layout, rng);
    for (let k = 0; k < totalTapes; k++) {
      const tape = tapes[totalTapes - 1 - k];
      tape.color = colorSeq[k];
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
    buildLevel,
    getColorMeta
  };
});
