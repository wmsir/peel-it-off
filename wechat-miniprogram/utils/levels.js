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
  const LOGICAL_H = 390;

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
      title: '快递开箱',
      spools: 4,
      colors: 3,
      difficulty: 0.08,
      layout: 'parcel',
      cardBg: '#d8b482',
      cardAccent: '#b08652',
      cardLabel: '📦 加急特快包裹',
      cardStamp: '易碎轻放',
      prizeIcon: '🍜',
      prizeName: '9.9包邮：5包红烧牛肉面 + 防脱洗发水',
      prizeQuote: '“先把肚子填饱，今晚继续写代码翻身！”'
    },
    {
      title: '老板的PPT',
      spools: 8,
      colors: 4,
      difficulty: 0.34,
      layout: 'weave',
      cardBg: '#e2e8f0',
      cardAccent: '#64748b',
      cardLabel: '📊 周末紧急加班表.pptx',
      cardStamp: '急急急',
      prizeIcon: '🏃‍♂️',
      prizeName: '加班通知单 · 已撕个粉碎！',
      prizeQuote: '“今天准点下班，谁爱卷谁卷去吧！”'
    },
    {
      title: '房东涨租单',
      spools: 11,
      colors: 5,
      difficulty: 0.46,
      layout: 'starburst',
      cardBg: '#fee2e2',
      cardAccent: '#ef4444',
      cardLabel: '🏠 房租调整通知书',
      cardStamp: '限3日内',
      prizeIcon: '🐱',
      prizeName: '房租减免券 + 翻肚皮胖橘猫一只',
      prizeQuote: '“坏消息全撕掉，好运马上就敲门！”'
    },
    {
      title: '凌晨Bug墙',
      spools: 14,
      colors: 6,
      difficulty: 0.55,
      layout: 'denseCross',
      cardBg: '#1e293b',
      cardAccent: '#38bdf8',
      cardLabel: '🐛 Production Error 500',
      cardStamp: 'P0 故障',
      prizeIcon: '✅',
      prizeName: '0 Error · 0 Warning 一次编译通过！',
      prizeQuote: '“世界上最美的情话，是 Build Succeeded！”'
    },
    {
      title: '破产存款箱',
      spools: 17,
      colors: 6,
      difficulty: 0.62,
      layout: 'vault',
      cardBg: '#fef3c7',
      cardAccent: '#d97706',
      cardLabel: '🏦 程序员翻身保险箱',
      cardStamp: '余额 ¥2000',
      prizeIcon: '💰',
      prizeName: '微信流量主结算到账：¥200,000！',
      prizeQuote: '“从两千块干到翻身，你就是最能撕的崽！”'
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
          { x:   0, y:   0, deg: -10, len: 192 },
          { x:   0, y:   0, deg:  82, len: 184 },
          { x:   0, y: -24, deg:  26, len: 176 },
          { x:   2, y:  24, deg: -24, len: 176 },
          { x: -34, y: -44, deg: -42, len: 152 },
          { x:  36, y:  42, deg: -40, len: 152 },
          { x:  38, y: -40, deg:  44, len: 152 },
          { x: -36, y:  44, deg:  42, len: 152 },
          { x: -72, y:  -6, deg:  86, len: 154 },
          { x:  72, y:   6, deg: -85, len: 154 },
          { x: -10, y: -88, deg:  -4, len: 156 },
          { x:  12, y:  88, deg:   4, len: 156 }
        ];
        const p = presets[i % presets.length];
        cx = cx0 + p.x + (rng() - 0.5) * 8;
        cy = cy0 + p.y + (rng() - 0.5) * 8;
        angle = (p.deg + (rng() - 0.5) * 6) * (Math.PI / 180);
        length = p.len;
        width = 36;
      } else if (i >= count - 4) {
        const q = i - (count - 4);
        const qCoords = [
          { x: -66, y: -84, deg: -18 },
          { x:  66, y: -80, deg:  22 },
          { x: -64, y:  84, deg:  20 },
          { x:  66, y:  82, deg: -18 }
        ];
        const qc = qCoords[q];
        cx = cx0 + qc.x + (rng() - 0.5) * 14;
        cy = cy0 + qc.y + (rng() - 0.5) * 14;
        angle = (qc.deg + (rng() - 0.5) * 12) * (Math.PI / 180);
        length = 128 + rng() * 18;
        width = 33;
      } else if (layoutType === 'weave') {
        const band = i % 4;
        const jitterX = (rng() - 0.5) * 24;
        const jitterY = (rng() - 0.5) * 24;
        if (band === 0) {
          cx = cx0 + jitterX;
          cy = cy0 + (-88 + ((i / 4) % 4) * 58) + (rng() - 0.5) * 12;
          angle = ((rng() - 0.5) * 16) * (Math.PI / 180);
          length = 165 + rng() * 32;
        } else if (band === 1) {
          cx = cx0 + (-78 + ((i / 4) % 4) * 52) + (rng() - 0.5) * 12;
          cy = cy0 + jitterY;
          angle = (90 + (rng() - 0.5) * 16) * (Math.PI / 180);
          length = 160 + rng() * 30;
        } else if (band === 2) {
          cx = cx0 + (rng() - 0.5) * 95;
          cy = cy0 + (rng() - 0.5) * 105;
          angle = (36 + (rng() - 0.5) * 18) * (Math.PI / 180);
          length = 152 + rng() * 34;
        } else {
          cx = cx0 + (rng() - 0.5) * 95;
          cy = cy0 + (rng() - 0.5) * 105;
          angle = (-36 + (rng() - 0.5) * 18) * (Math.PI / 180);
          length = 152 + rng() * 34;
        }
        width = 34;
      } else if (layoutType === 'starburst') {
        const ring = Math.floor(i / 6);
        const spoke = (i % 6) * (Math.PI / 6) + ring * 0.23 + (rng() - 0.5) * 0.14;
        const radius = (i % 3 === 0 ? 18 : 54) + (rng() - 0.5) * 24;
        cx = cx0 + Math.cos(spoke) * radius;
        cy = cy0 + Math.sin(spoke) * radius * 1.08;
        angle = spoke + Math.PI * 0.5 + (rng() - 0.5) * 0.25;
        length = 148 + rng() * 38;
        width = 33;
      } else {
        const phase = i % 5;
        const spreadX = 86 - layerFrac * 18;
        const spreadY = 104 - layerFrac * 20;
        cx = cx0 + (rng() * 2 - 1) * spreadX;
        cy = cy0 + (rng() * 2 - 1) * spreadY;
        const baseAngles = [0, 90, 42, -42, 20];
        angle = (baseAngles[phase] + (rng() - 0.5) * 22) * (Math.PI / 180);
        length = 138 + rng() * 44;
        width = 32;
      }

      const halfSpanX = Math.abs(Math.cos(angle)) * (length * 0.5) + Math.abs(Math.sin(angle)) * (width * 0.5);
      const halfSpanY = Math.abs(Math.sin(angle)) * (length * 0.5) + Math.abs(Math.cos(angle)) * (width * 0.5);
      const margin = 20;
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
    const baseTheme = LEVEL_THEMES[levelIndex] || {
      title: '无限解压箱 #' + (levelIndex + 1),
      spools: Math.min(22, 14 + (levelIndex - 3) * 2),
      colors: 6,
      difficulty: Math.min(0.68, 0.55 + (levelIndex - 3) * 0.03),
      layout: levelIndex % 2 === 0 ? 'starburst' : 'denseCross',
      cardBg: '#ede9fe',
      cardAccent: '#7c3aed',
      cardLabel: '🎁 神秘盲盒 #' + (levelIndex + 1),
      cardStamp: '绝密',
      prizeIcon: '🏆',
      prizeName: '今日手速王者勋章',
      prizeQuote: '“没有什么压力是一卷胶带解决不了的！”'
    };

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
