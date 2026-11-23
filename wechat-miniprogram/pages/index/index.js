const Pop = require('../../utils/levels');
const WxPopAudio = require('../../utils/audio');
const { WxAdManager } = require('../../utils/ad');

const {
  COLS,
  ROWS,
  TOTAL_CELLS,
  BUBBLE_SKINS,
  CHAPTER_ROOMS,
  getColorMeta
} = Pop;

const SAVE_KEY = 'pop_it_off_wx_save_v2';
const SIBLING_WX_KEY = 'peel_it_off_wx_save_v1';
const MAX_PARTICLES = 300;

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function drawRoundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

Page({
  data: {
    mode: 'campaign',
    chapterText: '第1章 · 淘宝包裹',
    levelText: '第 1 关',
    stageTitle: '第一份淘宝包裹',
    movesLeft: 28,
    endlessTodayText: '0',
    endlessUnlocked: false,
    dailyUnlocked: false,
    showPreBoost: true,
    ambientPack: 'off',
    goalPills: [],
    previewText: '',
    megaBannerText: '',
    showFilmHint: false,
    toastMsg: '',
    revivedThisRun: false,
    settings: { sound: true, haptics: true, colorblind: false },
    failModal: { visible: false, desc: '' },
    winModal: { visible: false, starsStr: '★★★', stamp: '', icon: '', name: '', quote: '', chain: 0, moves: 0, pops: 0, canUpgrade: false },
    dailyModal: { visible: false, chain: 0, pct: '' },
    roomModal: { visible: false, activeCh: 1, rooms: [], stageBg: '', badge: '', items: [], selectedLvl: null, siblingSummary: '' },
    calendarModal: { visible: false, todayPopped: 0, days: [] },
    skinModal: { visible: false, list: [] },
    seasonModal: { visible: false, stages: [] },
    settingsModal: { visible: false },
    adModal: { visible: false, title: '', pct: 0, desc: '' }
  },

  onLoad() {
    this.audio = new WxPopAudio();
    this.ad = new WxAdManager();
    this.save = this._loadSave();
    this.audio.setEnabled(this.save.settings.sound);
    this.audio.setHapticsEnabled(this.save.settings.haptics);
    this.audio.setSkin(this.save.equippedSkin);

    this.mode = 'campaign';
    this.currentLevel = this.save.unlockedLevel || 1;
    this.seasonStageIdx = 0;
    this.phase = 'playing';
    this.tracePath = [];
    this.previewData = null;
    this.activeTimers = [];
    this.visualMap = {};
    this.particles = [];
    this.crinkles = [];
    this.rings = [];
    this.shakeTime = 0;
    this.shakeMag = 0;
    this.slowMoTime = 0;
    this.filmProgress = 0;
    this.filmSnapping = false;
    this.filmDragging = false;
    this.filmLastY = 0;

    this._startStage('campaign', this.currentLevel);
  },

  onReady() {
    this._initCanvas();
  },

  onUnload() {
    this._clearTimers();
    this.audio.setAmbientPack('off');
    if (this._rafId && this._canvas && this._canvas.cancelAnimationFrame) {
      this._canvas.cancelAnimationFrame(this._rafId);
    }
  },

  onShareAppMessage() {
    if (this.mode === 'daily') {
      return {
        title: `【每日一捏】我在15步内轰出 ${this.gameState.maxChainThisGame} 连爆，快来同图PK！`,
        path: '/pages/index/index'
      };
    }
    return {
      title: `《捏个痛快！》我正在挑战第 ${this.currentLevel} 关气压连锁捏泡泡，太解压了！`,
      path: '/pages/index/index'
    };
  },

  _defaultSave() {
    return {
      unlockedLevel: 1,
      maxClearedLevel: 0,
      starsByLevel: {},
      itemsCollected: {},
      unlockedSkins: ['classic'],
      equippedSkin: 'classic',
      settings: { sound: true, haptics: true, colorblind: false },
      calendar: { lastDate: todayStr(), todayPopped: 0, streak: 0 },
      endlessTodayDate: todayStr(),
      endlessTodayCount: 0,
      dailyBestByDate: {},
      seasonCleared: {},
      lossStreak: {}
    };
  },

  _loadSave() {
    try {
      const raw = wx.getStorageSync(SAVE_KEY);
      if (raw) {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const def = this._defaultSave();
        return Object.assign(def, parsed, {
          settings: Object.assign(def.settings, parsed.settings || {}),
          calendar: Object.assign(def.calendar, parsed.calendar || {})
        });
      }
    } catch (_) {}
    return this._defaultSave();
  },

  _persistSave() {
    try {
      wx.setStorageSync(SAVE_KEY, JSON.stringify(this.save));
    } catch (_) {}
  },

  _initCanvas() {
    const q = wx.createSelectorQuery().in(this);
    q.select('#boardCanvas').fields({ node: true, size: true, rect: true }).exec((res) => {
      if (!res || !res[0] || !res[0].node) return;
      const info = res[0];
      const canvas = info.node;
      const dpr = Math.min(2.5, wx.getSystemInfoSync().pixelRatio || 2);
      this._canvas = canvas;
      this._ctx = canvas.getContext('2d');
      this._canvasRect = info;
      this.viewW = Math.max(260, info.width);
      this.viewH = Math.max(280, info.height);
      canvas.width = Math.floor(this.viewW * dpr);
      canvas.height = Math.floor(this.viewH * dpr);
      this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const pad = 12;
      this.cellSize = Math.max(30, Math.floor(Math.min((this.viewW - pad) / COLS, (this.viewH - pad) / ROWS)));
      this.gridW = this.cellSize * COLS;
      this.gridH = this.cellSize * ROWS;
      this.gridOffX = Math.floor((this.viewW - this.gridW) * 0.5);
      this.gridOffY = Math.floor((this.viewH - this.gridH) * 0.5);

      this._lastTime = Date.now();
      const tick = () => {
        const now = Date.now();
        let dt = Math.min(0.05, (now - this._lastTime) / 1000);
        this._lastTime = now;
        if (this.slowMoTime > 0) {
          this.slowMoTime = Math.max(0, this.slowMoTime - dt);
          dt *= 0.38;
        }
        this._updateAnim(dt);
        this._renderCanvas(now / 1000);
        if (this._canvas && this._canvas.requestAnimationFrame) {
          this._rafId = this._canvas.requestAnimationFrame(tick);
        }
      };
      this._rafId = canvas.requestAnimationFrame(tick);
    });
  },

  _clearTimers() {
    for (let i = 0; i < this.activeTimers.length; i++) {
      clearTimeout(this.activeTimers[i]);
    }
    this.activeTimers = [];
  },

  _startStage(mode, levelOrIdx) {
    this._clearTimers();
    this.mode = mode;
    this.tracePath = [];
    this.previewData = null;
    this.particles = [];
    this.crinkles = [];
    this.rings = [];
    this.visualMap = {};
    this.filmProgress = 0;
    this.filmSnapping = false;
    this.filmDragging = false;
    this.revivedThisRun = false;
    this.slowMoTime = 0;

    if (mode !== 'endless') {
      this.audio.setAmbientPack('off');
    } else {
      this.audio.setAmbientPack(this.data.ambientPack);
    }

    if (mode === 'campaign') {
      this.currentLevel = Math.max(1, levelOrIdx || 1);
      const streak = (this.save.lossStreak && this.save.lossStreak[this.currentLevel]) || 0;
      const bonus = streak >= 3 ? 3 : 0;
      this.gameState = Pop.buildCampaignLevel(this.currentLevel, 0, bonus);
      if (bonus > 0) this._toast('💝 连败保护已免费赠送 +3 步！');
    } else if (mode === 'endless') {
      this.gameState = Pop.buildEndlessBoard(Date.now() & 0xfffffff);
    } else if (mode === 'daily') {
      this.gameState = Pop.buildDailyBoard(todayStr());
    } else if (mode === 'season') {
      this.seasonStageIdx = levelOrIdx || 0;
      this.gameState = Pop.buildSeasonStage(this.seasonStageIdx);
    }

    this.phase = 'playing';
    this._syncVisualTargets(true);
    this._syncHUD({ previewText: '', megaBannerText: '', showFilmHint: false });
  },

  _syncVisualTargets(snap) {
    if (!this.gameState) return;
    const grid = this.gameState.grid;
    const next = {};
    for (let i = 0; i < TOTAL_CELLS; i++) {
      const cell = grid[i];
      if (!cell) continue;
      const r = Math.floor(i / COLS), c = i % COLS;
      const ex = this.visualMap[cell.id];
      if (ex && !snap) {
        ex.targetX = c;
        ex.targetY = r;
        ex.cell = cell;
        next[cell.id] = ex;
      } else {
        next[cell.id] = { curX: c, curY: snap ? r : Math.max(-1.5, r - 2), targetX: c, targetY: r, pressScale: 1, pulseOffset: (i * 0.67) % 6.28, cell };
      }
    }
    this.visualMap = next;
  },

  _syncHUD(extra) {
    const st = this.gameState;
    const g = st.goal || {};
    const p = st.progress;
    const pills = [];
    if (g.type === 'colors' && g.targets) {
      Object.keys(g.targets).forEach((cid, k) => {
        const m = getColorMeta(cid);
        const cur = Math.min(g.targets[cid], p.colors[cid] || 0);
        pills.push({ k, hex: m.hex, mark: m.mark, text: `${cur}/${g.targets[cid]}`, done: cur >= g.targets[cid] });
      });
    } else if (g.type === 'chain') {
      pills.push({ k: 0, text: `⚡ 连爆 ${p.bestChain}/${g.count}`, done: p.bestChain >= g.count });
    } else if (g.type === 'tapes') {
      pills.push({ k: 0, text: `📦 胶带 ${Math.min(g.count, p.tapesRemoved)}/${g.count}`, done: p.tapesRemoved >= g.count });
    } else if (g.type === 'ices') {
      pills.push({ k: 0, text: `❄️ 破冰 ${Math.min(g.count, p.icesMelted)}/${g.count}`, done: p.icesMelted >= g.count });
    } else if (g.type === 'doubles') {
      pills.push({ k: 0, text: `🛡️ 双层 ${Math.min(g.count, p.doublesBroken)}/${g.count}`, done: p.doublesBroken >= g.count });
    } else if (g.type === 'toys') {
      pills.push({ k: 0, text: `🧸 玩具 ${Math.min(g.count, p.toysRescued)}/${g.count}`, done: p.toysRescued >= g.count });
    } else if (g.type === 'combo') {
      let k = 0;
      if (g.tapes) pills.push({ k: k++, text: `📦 ${Math.min(g.tapes, p.tapesRemoved)}/${g.tapes}`, done: p.tapesRemoved >= g.tapes });
      if (g.ices) pills.push({ k: k++, text: `❄️ ${Math.min(g.ices, p.icesMelted)}/${g.ices}`, done: p.icesMelted >= g.ices });
      if (g.doubles) pills.push({ k: k++, text: `🛡️ ${Math.min(g.doubles, p.doublesBroken)}/${g.doubles}`, done: p.doublesBroken >= g.doubles });
      if (g.colors) {
        Object.keys(g.colors).forEach((cid) => {
          const m = getColorMeta(cid);
          const cur = Math.min(g.colors[cid], p.colors[cid] || 0);
          pills.push({ k: k++, hex: m.hex, mark: m.mark, text: `${cur}/${g.colors[cid]}`, done: cur >= g.colors[cid] });
        });
      }
    } else if (g.type === 'daily') {
      pills.push({ k: 0, text: `⚡ 今日最佳 ${st.maxChainThisGame} 连爆`, done: false });
    }

    if (this.save.endlessTodayDate !== todayStr()) {
      this.save.endlessTodayDate = todayStr();
      this.save.endlessTodayCount = 0;
    }

    this.setData(Object.assign({
      mode: this.mode,
      chapterText: this.mode === 'season' ? '🛍️ 双十一限定赛季' : (this.mode === 'daily' ? '全服同图' : `第${st.chapter}章 · ${st.roomMeta.theme}`),
      levelText: this.mode === 'season' ? `第 ${this.seasonStageIdx + 1}/10 关` : (this.mode === 'daily' ? todayStr() : `第 ${st.levelNum} 关`),
      stageTitle: st.title,
      movesLeft: st.movesLeft,
      endlessTodayText: String(this.save.endlessTodayCount || 0),
      endlessUnlocked: this.save.maxClearedLevel >= 3,
      dailyUnlocked: this.save.maxClearedLevel >= 8,
      showPreBoost: (this.mode === 'campaign' || this.mode === 'season') && st.turnCount === 0 && this.phase === 'playing',
      goalPills: pills,
      settings: this.save.settings,
      revivedThisRun: this.revivedThisRun
    }, extra || {}));
  },

  _touchToGridIdx(touch) {
    if (!this.cellSize) return -1;
    const x = typeof touch.x === 'number' ? touch.x : (touch.clientX - (this._canvasRect ? this._canvasRect.left : 0));
    const y = typeof touch.y === 'number' ? touch.y : (touch.clientY - (this._canvasRect ? this._canvasRect.top : 0));
    const c = Math.floor((x - this.gridOffX) / this.cellSize);
    const r = Math.floor((y - this.gridOffY) / this.cellSize);
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return -1;
    const cx = this.gridOffX + (c + 0.5) * this.cellSize;
    const cy = this.gridOffY + (r + 0.5) * this.cellSize;
    if (Math.hypot(x - cx, y - cy) > this.cellSize * 0.56) return -1;
    return r * COLS + c;
  },

  onBoardTouchStart(e) {
    this.audio.init();
    const touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    if (!touch) return;
    if (this.phase === 'film') {
      this.filmDragging = true;
      this.filmLastY = typeof touch.y === 'number' ? touch.y : touch.clientY;
      return;
    }
    if (this.phase !== 'playing') return;

    if (this.activeTimers.length > 0) {
      this._clearTimers();
      this._syncVisualTargets(true);
    }
    const idx = this._touchToGridIdx(touch);
    if (idx === -1 || !Pop.canConnectCells(this.gameState, [], idx)) return;
    this.dragging = true;
    this.tracePath = [idx];
    const cell = this.gameState.grid[idx];
    if (cell && this.visualMap[cell.id]) this.visualMap[cell.id].pressScale = 0.85;
    this.audio.playPressFirst();
  },

  onBoardTouchMove(e) {
    const touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    if (!touch) return;
    if (this.phase === 'film' && this.filmDragging && !this.filmSnapping) {
      const y = typeof touch.y === 'number' ? touch.y : touch.clientY;
      const dy = y - this.filmLastY;
      this.filmLastY = y;
      if (dy > 0.5) {
        this.filmProgress = Math.min(1, this.filmProgress + dy / (this.gridH * 0.6));
        this.audio.updateFilmPeel(Math.min(1, dy / 14));
        if (this.filmProgress >= 0.35) {
          this.filmDragging = false;
          this.filmSnapping = true;
        }
      }
      return;
    }
    if (!this.dragging || this.phase !== 'playing') return;
    const idx = this._touchToGridIdx(touch);
    if (idx === -1) return;

    const len = this.tracePath.length;
    if (len >= 2 && idx === this.tracePath[len - 2]) {
      const rem = this.tracePath.pop();
      const rc = this.gameState.grid[rem];
      if (rc && this.visualMap[rc.id]) this.visualMap[rc.id].pressScale = 1;
      this.audio.playSlideNote(this.tracePath.length - 1, true);
      this._updatePreview();
      return;
    }
    if (Pop.canConnectCells(this.gameState, this.tracePath, idx)) {
      this.tracePath.push(idx);
      const cell = this.gameState.grid[idx];
      if (cell && this.visualMap[cell.id]) this.visualMap[cell.id].pressScale = 0.85;
      this.audio.playSlideNote(this.tracePath.length - 1, false);
      this._updatePreview();
    }
  },

  onBoardTouchEnd() {
    if (this.phase === 'film' && this.filmDragging) {
      this.filmDragging = false;
      this.filmSnapping = true;
      return;
    }
    if (!this.dragging) return;
    this.dragging = false;

    for (let i = 0; i < this.tracePath.length; i++) {
      const cell = this.gameState.grid[this.tracePath[i]];
      if (cell && this.visualMap[cell.id]) this.visualMap[cell.id].pressScale = 1;
    }
    this.previewData = null;

    if (this.tracePath.length < 2) {
      this.tracePath = [];
      this.setData({ previewText: '' });
      return;
    }
    const path = this.tracePath.slice();
    this.tracePath = [];
    this.setData({ previewText: '' });
    this._executeMove(path);
  },

  _updatePreview() {
    if (this.tracePath.length < 2) {
      this.previewData = null;
      this.setData({ previewText: '' });
      return;
    }
    this.previewData = Pop.previewMove(this.gameState, this.tracePath);
    const pv = this.previewData;
    let previewText = '';
    if (pv.valid) {
      if (pv.willAutoPopIds.length > 0) previewText = `⚡ 预计引发 ${pv.predictedChainTotal} 连爆！`;
      else if (pv.willSpawnBonus === 'rainbow') previewText = '🌈 终点生成彩虹泡！';
      else if (pv.willSpawnBonus === 'pump') previewText = '💨 终点生成十字气泵！';
      else if (pv.willInflateIds.length > 0) previewText = `💨 给 ${pv.willInflateIds.length} 个邻居充气`;
    }
    this.setData({ previewText });
  },

  _cellCenter(idx) {
    const r = Math.floor(idx / COLS), c = idx % COLS;
    return {
      x: this.gridOffX + (c + 0.5) * this.cellSize,
      y: this.gridOffY + (r + 0.5) * this.cellSize
    };
  },

  _spawnPopFx(idx, hex, isMega) {
    const pos = this._cellCenter(idx);
    this.crinkles.push({ x: pos.x, y: pos.y, r: this.cellSize * 0.4, rot: Math.random() * 6.28, life: 0.4, maxLife: 0.4 });
    const n = isMega ? 9 : 5;
    for (let i = 0; i < n; i++) {
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
      const ang = (Math.PI * 2 * i) / n + (Math.random() - 0.5) * 0.4;
      const spd = 90 + Math.random() * 75;
      this.particles.push({ x: pos.x, y: pos.y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 30, size: 3 + Math.random() * 2.5, color: hex || '#ffffff', life: 0.4, maxLife: 0.4 });
    }
  },

  _executeMove(path) {
    const res = Pop.resolveMove(this.gameState, path, { fastMode: false });
    if (!res.valid) return;
    this.gameState = res.state;
    this._recordPopProgress(res.totalPoppedThisMove);

    const tl = res.timeline;
    const lastW = tl.waves.length ? tl.waves[tl.waves.length - 1].delayMs : 0;
    const scale = lastW > 1900 ? 1900 / lastW : 1;

    tl.popSteps.forEach((step) => {
      const id = setTimeout(() => {
        if (step.popped) {
          this.audio.playPopSingle(step.seq);
          this._spawnPopFx(step.idx, getColorMeta(step.color).hex, false);
        }
      }, Math.round(step.delayMs * scale));
      this.activeTimers.push(id);
    });

    tl.waves.forEach((w) => {
      const id = setTimeout(() => {
        if (w.inflates.length && !w.pops.length) this.audio.playInflate();
        if (w.tapes.length) this.audio.playTapeTear();
        if (w.pops.length) {
          this.audio.playChainWave(w.waveIdx);
          this.shakeTime = 0.14;
          this.shakeMag = Math.min(6, 2.5 + w.waveIdx);
          for (let k = 0; k < w.pops.length; k++) {
            const m = getColorMeta(w.pops[k].color);
            this._spawnPopFx(w.pops[k].idx, m.hex, w.waveIdx >= 1);
            const pos = this._cellCenter(w.pops[k].idx);
            this.rings.push({ x: pos.x, y: pos.y, r: 8, maxR: this.cellSize * 1.45, color: m.light, life: 0.34, maxLife: 0.34 });
          }
        }
      }, Math.round(w.delayMs * scale));
      this.activeTimers.push(id);
    });

    if (res.totalPoppedThisMove >= 10 && res.autoPoppedCount > 0) {
      const mid = setTimeout(() => {
        this.slowMoTime = 0.30;
        this.audio.playMegaChain();
        this.setData({ megaBannerText: `捏个痛快！×${res.totalPoppedThisMove}` });
        const ht = setTimeout(() => this.setData({ megaBannerText: '' }), 1100);
        this.activeTimers.push(ht);
      }, 280);
      this.activeTimers.push(mid);
    }

    if ((this.mode === 'campaign' || this.mode === 'season') && !this.gameState.finished && this.gameState.movesLeft > 0 && this.gameState.movesLeft <= 3) {
      this.audio.playLowMoves();
    }

    this._syncVisualTargets(false);
    this._syncHUD();

    const finishDelay = Math.min(2000, Math.round((lastW + 140) * scale));
    const endT = setTimeout(() => {
      if (this.gameState.finished) this._handleGameFinished();
    }, finishDelay);
    this.activeTimers.push(endT);
  },

  _recordPopProgress(count) {
    const d = todayStr();
    if (this.save.calendar.lastDate !== d) {
      if (this.save.calendar.todayPopped < 100) this.save.calendar.streak = 0;
      this.save.calendar.lastDate = d;
      this.save.calendar.todayPopped = 0;
    }
    const prev = this.save.calendar.todayPopped;
    this.save.calendar.todayPopped += count;
    if (prev < 100 && this.save.calendar.todayPopped >= 100) {
      this.save.calendar.streak += 1;
      if (this.save.calendar.streak >= 7 && this.save.unlockedSkins.indexOf('catpaw') === -1) {
        this.save.unlockedSkins.push('catpaw');
        this._toast('🐱 连签7天！已免费解锁「猫爪肉垫泡」皮肤！');
      }
    }
    if (this.mode === 'endless') {
      if (this.save.endlessTodayDate !== d) {
        this.save.endlessTodayDate = d;
        this.save.endlessTodayCount = 0;
      }
      this.save.endlessTodayCount += count;
    }
    this._persistSave();
  },

  _handleGameFinished() {
    if (this.mode === 'daily') {
      const best = this.gameState.maxChainThisGame;
      this.save.dailyBestByDate[todayStr()] = Math.max(this.save.dailyBestByDate[todayStr()] || 0, best);
      this._persistSave();
      this.phase = 'ended';
      this.audio.playWin();
      this.setData({ dailyModal: { visible: true, chain: best, pct: `超越全服 ${Math.min(99, 45 + best * 4)}% 玩家` } });
      return;
    }

    if (!this.gameState.won) {
      const lvl = this.gameState.levelNum;
      this.save.lossStreak[lvl] = (this.save.lossStreak[lvl] || 0) + 1;
      this._persistSave();
      this.phase = 'ended';
      const desc = this.save.lossStreak[lvl] >= 3
        ? '已连续挑战 3 次，下局重开将免费赠送 +3 步！'
        : '只差一点点！看激励视频续 5 步，或立即免体力重来。';
      this.setData({ failModal: { visible: true, desc } });
      return;
    }

    const lvl = this.gameState.levelNum;
    this.save.lossStreak[lvl] = 0;
    if (this.mode === 'campaign') {
      this.save.maxClearedLevel = Math.max(this.save.maxClearedLevel, lvl);
      this.save.unlockedLevel = Math.max(this.save.unlockedLevel, Math.min(50, lvl + 1));
    } else if (this.mode === 'season') {
      this.save.seasonCleared[this.seasonStageIdx] = true;
      if (Object.keys(this.save.seasonCleared).length >= 10 && this.save.unlockedSkins.indexOf('ticket') === -1) {
        this.save.unlockedSkins.push('ticket');
      }
    }
    this._persistSave();
    this._startFinalePoke();
  },

  _startFinalePoke() {
    this.phase = 'finale';
    const unpopped = [];
    for (let i = 0; i < TOTAL_CELLS; i++) {
      if (!this.gameState.sheetRevealed[i]) unpopped.push(i);
    }
    if (!unpopped.length) {
      this._enterFilmPeel();
      return;
    }
    let cursor = 0;
    const t = setInterval(() => {
      if (this.phase !== 'finale') { clearInterval(t); return; }
      const batch = Math.min(3, unpopped.length - cursor);
      for (let b = 0; b < batch; b++) {
        const idx = unpopped[cursor++];
        this.gameState.sheetRevealed[idx] = true;
        const c = this.gameState.grid[idx];
        if (c) {
          this._spawnPopFx(idx, getColorMeta(c.color).hex, false);
          this.gameState.grid[idx] = null;
        }
        this.audio.playPopSingle(b);
      }
      this._syncVisualTargets(true);
      if (cursor >= unpopped.length) {
        clearInterval(t);
        setTimeout(() => this._enterFilmPeel(), 200);
      }
    }, Math.max(25, Math.floor(1000 / Math.max(6, Math.ceil(unpopped.length / 3)))));
  },

  _enterFilmPeel() {
    this.phase = 'film';
    this.filmProgress = 0;
    this.filmSnapping = false;
    this.setData({ showFilmHint: true });
  },

  _openWinModal() {
    this.phase = 'ended';
    this.audio.playWin();
    const st = this.gameState;
    const stars = (st.movesLeft >= 4 || st.maxChainThisGame >= 9) ? 3 : (st.movesLeft >= 2 ? 2 : 1);
    const item = st.itemMeta;
    const lvl = st.levelNum;

    if (this.mode === 'campaign') {
      this.save.starsByLevel[lvl] = Math.max(this.save.starsByLevel[lvl] || 0, stars);
      if (!this.save.itemsCollected[lvl]) {
        this.save.itemsCollected[lvl] = {
          icon: item.icon,
          name: stars === 3 ? item.fineName : item.name,
          fine: stars === 3,
          ch: st.chapter,
          x: 20 + ((lvl * 23) % 60),
          y: 35 + ((lvl * 19) % 45)
        };
      } else if (stars === 3) {
        this.save.itemsCollected[lvl].fine = true;
        this.save.itemsCollected[lvl].name = item.fineName;
      }
      this._persistSave();
    }

    this.setData({
      showFilmHint: false,
      winModal: {
        visible: true,
        starsStr: '★'.repeat(stars) + '☆'.repeat(3 - stars),
        stamp: stars === 3 ? '完美 3★ 拆出精致版！' : '气泡全捏平 ✓ 快递已拆开！',
        icon: item.icon,
        name: stars === 3 ? `✨ ${item.fineName}` : item.name,
        quote: item.quote,
        chain: st.maxChainThisGame,
        moves: st.movesLeft,
        pops: st.progress.totalPopped,
        canUpgrade: stars < 3 && this.mode === 'campaign'
      }
    });
  },

  // ================= UI 交互事件 =================

  onSwitchMode(e) {
    const m = e.currentTarget.dataset.mode;
    if (m === 'endless' && this.save.maxClearedLevel < 3) {
      this._toast('🔒 通关第 3 关即可解锁「无尽捏捏」');
      return;
    }
    if (m === 'daily' && this.save.maxClearedLevel < 8) {
      this._toast('🔒 通关第 8 关即可解锁「每日一捏」');
      return;
    }
    this._startStage(m, m === 'campaign' ? this.currentLevel : 0);
  },

  onSetAmbient(e) {
    const amb = e.currentTarget.dataset.amb;
    this.audio.setAmbientPack(amb);
    this.setData({ ambientPack: amb });
  },

  onBoostPump() {
    this._runAd('开局预置十字气泵', () => {
      const c = this.gameState.grid[Pop.idxOf(3, 3)];
      if (c && c.kind === 'bubble') { c.kind = 'pump'; c.tape = 0; c.ice = 0; }
      this._syncVisualTargets(true);
      this._toast('💨 中央已预置十字气泵！');
    });
  },

  onBoostSwell() {
    this._runAd('开局全盘 +1 鼓胀度', () => {
      for (let i = 0; i < TOTAL_CELLS; i++) {
        const c = this.gameState.grid[i];
        if (c && c.kind === 'bubble' && c.tape === 0 && c.ice === 0 && c.swell < 3) c.swell += 1;
      }
      this._syncVisualTargets(true);
      this._toast('✨ 全盘气泡鼓胀 +1！');
    });
  },

  onRestart() {
    this._startStage(this.mode, this.mode === 'season' ? this.seasonStageIdx : this.currentLevel);
  },

  onHintAI() {
    if (this.phase !== 'playing') return;
    const mv = Pop.pickGreedyMove(this.gameState);
    if (mv && mv.length >= 2) {
      this.hintPath = mv;
      this.hintTimer = 1.6;
      const pv = Pop.previewMove(this.gameState, mv);
      this._toast(`💡 推荐连线 ${mv.length} 格${pv.predictedChainTotal ? `（${pv.predictedChainTotal}连爆）` : ''}`);
    }
  },

  onReviveMoves() {
    if (this.revivedThisRun) return;
    this._runAd('看视频免费续 +5 步', () => {
      this.revivedThisRun = true;
      this.gameState.movesLeft += 5;
      this.gameState.finished = false;
      this.phase = 'playing';
      this.setData({ failModal: { visible: false, desc: '' }, revivedThisRun: true });
      this._syncHUD();
      this._toast('✨ 续步 +5 成功！');
    });
  },

  onFailRestart() {
    this.setData({ failModal: { visible: false, desc: '' } });
    this.onRestart();
  },

  onUpgradePrize() {
    this._runAd('升级 3★ 精致闪耀版藏品', () => {
      const lvl = this.gameState.levelNum;
      const it = this.gameState.itemMeta;
      if (this.save.itemsCollected[lvl]) {
        this.save.itemsCollected[lvl].fine = true;
        this.save.itemsCollected[lvl].name = it.fineName;
        this._persistSave();
      }
      this.setData({ 'winModal.name': `✨ ${it.fineName} (精致版)`, 'winModal.canUpgrade': false });
      this._toast('🎁 已升级精致闪耀版并存入房间！');
    });
  },

  onNextLevel() {
    this.setData({ 'winModal.visible': false });
    if (this.mode === 'season') {
      this._startStage('season', (this.seasonStageIdx + 1) % 10);
    } else {
      this._startStage('campaign', this.currentLevel + 1);
    }
  },

  onOpenRoomFromWin() {
    this.setData({ 'winModal.visible': false });
    this.onOpenRoom();
  },

  onCloseDaily() {
    this.setData({ 'dailyModal.visible': false });
    this._startStage('daily', 0);
  },

  onOpenRoom() {
    const ch = this.data.roomModal.activeCh || 1;
    const roomMeta = CHAPTER_ROOMS.find((r) => r.ch === ch) || CHAPTER_ROOMS[0];
    const items = [];
    Object.keys(this.save.itemsCollected).forEach((lvl) => {
      const e = this.save.itemsCollected[lvl];
      if (e && e.ch === ch) items.push(Object.assign({ lvl: Number(lvl) }, e));
    });

    let peelCount = 0;
    try {
      const sRaw = wx.getStorageSync(SIBLING_WX_KEY);
      if (sRaw) {
        const sObj = typeof sRaw === 'string' ? JSON.parse(sRaw) : sRaw;
        peelCount = Math.max(0, sObj.level || 0);
      }
    } catch (_) {}

    this.setData({
      roomModal: {
        visible: true,
        activeCh: ch,
        rooms: CHAPTER_ROOMS,
        stageBg: `linear-gradient(180deg, ${roomMeta.wall} 0%, ${roomMeta.wall} 64%, ${roomMeta.floor} 64%, ${roomMeta.floor} 100%)`,
        badge: `${roomMeta.name} (${items.length}/5)`,
        items,
        selectedLvl: items.length ? items[0].lvl : null,
        siblingSummary: `本篇藏品 ${Object.keys(this.save.itemsCollected).length} 件 · 姊妹作《撕个痛快！》进度 ${peelCount} 关`
      }
    });
  },

  onSelectRoom(e) {
    const ch = Number(e.currentTarget.dataset.ch);
    this.setData({ 'roomModal.activeCh': ch }, () => this.onOpenRoom());
  },

  onPickRoomItem(e) {
    this.setData({ 'roomModal.selectedLvl': Number(e.currentTarget.dataset.lvl) });
  },

  onMoveSelectedRoomItem(e) {
    const sel = this.data.roomModal.selectedLvl;
    if (!sel || !this.save.itemsCollected[sel]) return;
    const q = wx.createSelectorQuery().in(this);
    q.select('.room-stage').boundingClientRect((rect) => {
      if (!rect || !e.detail) return;
      const nx = Math.max(10, Math.min(90, ((e.detail.x - rect.left) / rect.width) * 100));
      const ny = Math.max(20, Math.min(86, ((e.detail.y - rect.top) / rect.height) * 100));
      this.save.itemsCollected[sel].x = nx;
      this.save.itemsCollected[sel].y = ny;
      this._persistSave();
      this.onOpenRoom();
    }).exec();
  },

  onOpenCalendar() {
    const days = [];
    for (let d = 1; d <= 7; d++) {
      const lit = d <= (this.save.calendar.streak || 0);
      days.push({ d, lit, label: d === 7 ? (lit ? '🐱已领' : '🐱皮肤') : `第${d}天` });
    }
    this.setData({ calendarModal: { visible: true, todayPopped: this.save.calendar.todayPopped || 0, days } });
  },

  onOpenSkins() {
    const list = BUBBLE_SKINS.map((s) => Object.assign({}, s, { equipped: this.save.equippedSkin === s.id }));
    this.setData({ skinModal: { visible: true, list } });
  },

  onEquipSkin(e) {
    const id = e.currentTarget.dataset.id;
    if (this.save.unlockedSkins.indexOf(id) === -1) this.save.unlockedSkins.push(id);
    this.save.equippedSkin = id;
    this.audio.setSkin(id);
    this._persistSave();
    this.onOpenSkins();
    this._toast('✨ 已切换泡泡纸皮肤与专属音效！');
  },

  onOpenSeason() {
    const stages = [];
    for (let i = 0; i < 10; i++) stages.push({ idx: i, cleared: !!this.save.seasonCleared[i] });
    this.setData({ seasonModal: { visible: true, stages } });
  },

  onStartSeason(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    this.setData({ 'seasonModal.visible': false });
    this._startStage('season', idx);
  },

  onOpenSettings() {
    this.setData({ settingsModal: { visible: true }, settings: this.save.settings });
  },

  onToggleSetting(e) {
    const k = e.currentTarget.dataset.k;
    this.save.settings[k] = !this.save.settings[k];
    this.audio.setEnabled(this.save.settings.sound);
    this.audio.setHapticsEnabled(this.save.settings.haptics);
    this._persistSave();
    this.setData({ settings: this.save.settings });
  },

  onCloseModal(e) {
    const key = e.currentTarget.dataset.key;
    if (key) this.setData({ [`${key}.visible`]: false });
  },

  _runAd(title, onSuccess) {
    if (this.mode === 'endless') return;
    this.ad.showRewarded(onSuccess, () => this._toast('未看完视频暂未发放奖励'), () => {
      let pct = 0;
      this.setData({ adModal: { visible: true, title, pct: 0, desc: '模拟播放中…' } });
      const timer = setInterval(() => {
        pct += 12;
        this.setData({ adModal: { visible: true, title, pct: Math.min(100, pct), desc: pct >= 100 ? '✓ 奖励已发放' : '模拟广告播放中…' } });
        if (pct >= 100) {
          clearInterval(timer);
          this.setData({ 'adModal.visible': false });
          onSuccess();
        }
      }, 220);
    });
  },

  _toast(msg) {
    this.setData({ toastMsg: msg });
    clearTimeout(this._tt);
    this._tt = setTimeout(() => this.setData({ toastMsg: '' }), 2100);
  },

  // ================= Canvas 2D 主循环渲染 =================

  _updateAnim(dt) {
    const sp = 1 - Math.exp(-16 * dt);
    Object.keys(this.visualMap).forEach((k) => {
      const v = this.visualMap[k];
      v.curX += (v.targetX - v.curX) * sp;
      v.curY += (v.targetY - v.curY) * sp;
    });
    if (this.shakeTime > 0) this.shakeTime = Math.max(0, this.shakeTime - dt);
    if (this.hintTimer > 0) this.hintTimer = Math.max(0, this.hintTimer - dt);

    for (let i = this.crinkles.length - 1; i >= 0; i--) {
      this.crinkles[i].life -= dt;
      if (this.crinkles[i].life <= 0) this.crinkles.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const rg = this.rings[i];
      rg.life -= dt;
      rg.r = 8 + (rg.maxR - 8) * (1 - rg.life / rg.maxLife);
      if (rg.life <= 0) this.rings.splice(i, 1);
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vy += 320 * dt;
      pt.life -= dt;
      if (pt.life <= 0) this.particles.splice(i, 1);
    }

    if (this.phase === 'film' && this.filmSnapping) {
      this.filmProgress = Math.min(1, this.filmProgress + dt * 2.8);
      if (this.filmProgress >= 1) {
        this.filmSnapping = false;
        this.audio.stopFilmPeel();
        this._openWinModal();
      }
    }
  },

  _renderCanvas(tSec) {
    if (!this._ctx || !this.gameState || !this.cellSize) return;
    const ctx = this._ctx;
    const W = this.viewW, H = this.viewH, cs = this.cellSize;
    const st = this.gameState;

    ctx.save();
    ctx.clearRect(0, 0, W, H);
    if (this.shakeTime > 0) {
      ctx.translate((Math.random() - 0.5) * this.shakeMag * 2, (Math.random() - 0.5) * this.shakeMag * 2);
    }

    ctx.fillStyle = '#cf9e69';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(130, 82, 34, 0.14)';
    ctx.lineWidth = 2;
    for (let y = 12; y < H; y += 20) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    const revealed = st.sheetRevealed.filter(Boolean).length;
    ctx.save();
    ctx.globalAlpha = 0.22 + (revealed / TOTAL_CELLS) * 0.72;
    ctx.font = `${Math.floor(Math.min(this.gridW, this.gridH) * 0.44)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(st.itemMeta.icon, this.gridOffX + this.gridW * 0.5, this.gridOffY + this.gridH * 0.5);
    ctx.restore();

    for (let i = 0; i < TOTAL_CELLS; i++) {
      const r = Math.floor(i / COLS), c = i % COLS;
      ctx.fillStyle = st.sheetRevealed[i] ? 'rgba(255,255,255,0.03)' : 'rgba(255,250,242,0.28)';
      ctx.fillRect(this.gridOffX + c * cs + 1.5, this.gridOffY + r * cs + 1.5, cs - 3, cs - 3);
    }

    for (let t = 0; t < st.toys.length; t++) {
      const toy = st.toys[t];
      if (toy.rescued) continue;
      ctx.save();
      ctx.font = `${Math.floor(cs * 0.58)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(toy.icon, this.gridOffX + (toy.c + 0.5) * cs, this.gridOffY + (toy.r + 0.5) * cs);
      ctx.restore();
    }

    for (let i = 0; i < this.crinkles.length; i++) {
      const cr = this.crinkles[i];
      ctx.save();
      ctx.globalAlpha = Math.max(0, cr.life / cr.maxLife) * 0.65;
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cr.x, cr.y, cr.r * 0.8, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    if (this.tracePath.length >= 1) {
      const firstCell = st.grid[this.tracePath[0]];
      ctx.save();
      ctx.strokeStyle = firstCell ? getColorMeta(firstCell.color).hex : '#ffffff';
      ctx.lineWidth = Math.max(5, cs * 0.16);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.62;
      ctx.beginPath();
      for (let i = 0; i < this.tracePath.length; i++) {
        const p = this._cellCenter(this.tracePath[i]);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.restore();
    }

    if (this.hintTimer > 0 && this.hintPath && this.hintPath.length >= 2) {
      ctx.save();
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 4;
      ctx.beginPath();
      this.hintPath.forEach((idx, k) => {
        const p = this._cellCenter(idx);
        if (k === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
      ctx.restore();
    }

    const pvInf = {}, pvPop = {}, trSet = {};
    if (this.previewData && this.previewData.valid) {
      this.previewData.willInflateIds.forEach((id) => { pvInf[id] = true; });
      this.previewData.willAutoPopIds.forEach((id) => { pvPop[id] = true; });
    }
    this.tracePath.forEach((id) => { trSet[id] = true; });
    const firstTrace = this.tracePath.length ? st.grid[this.tracePath[0]] : null;

    for (let i = 0; i < TOTAL_CELLS; i++) {
      const cell = st.grid[i];
      if (!cell) continue;
      const vis = this.visualMap[cell.id] || { curX: i % COLS, curY: Math.floor(i / COLS), pressScale: 1, pulseOffset: 0 };
      const cx = this.gridOffX + (vis.curX + 0.5) * cs;
      const cy = this.gridOffY + (vis.curY + 0.5) * cs;

      if (cell.kind === 'cardboard' || cell.kind === 'plastic') {
        const bw = cs * 0.84;
        ctx.fillStyle = cell.kind === 'cardboard' ? '#926234' : '#cbd5e1';
        drawRoundRect(ctx, cx - bw * 0.5, cy - bw * 0.5, bw, bw, 8);
        ctx.fill();
        continue;
      }
      if (cell.kind === 'nail') {
        ctx.fillStyle = '#475569';
        ctx.beginPath(); ctx.arc(cx, cy, cs * 0.35, 0, Math.PI * 2); ctx.fill();
        ctx.font = '14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('📌', cx, cy);
        continue;
      }

      const meta = getColorMeta(cell.color);
      const basePct = cell.swell === 1 ? 0.68 : (cell.swell === 2 ? 0.82 : 0.94);
      const breathe = cell.swell === 3 ? (1 + Math.sin(tSec * 5.2 + vis.pulseOffset) * 0.045) : 1;
      const rad = cs * 0.44 * basePct * breathe * (trSet[i] ? 0.85 : vis.pressScale);

      if (pvPop[i]) {
        ctx.strokeStyle = '#facc15'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, cy, rad + 4, 0, Math.PI * 2); ctx.stroke();
      } else if (pvInf[i] || (firstTrace && Pop.canConnectCells(st, this.tracePath, i))) {
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, rad + 3, 0, Math.PI * 2); ctx.stroke();
      }

      const grad = ctx.createRadialGradient(cx - rad * 0.25, cy - rad * 0.3, rad * 0.1, cx, cy, rad);
      if (cell.kind === 'rainbow') {
        grad.addColorStop(0, '#fef08a'); grad.addColorStop(0.5, '#ec4899'); grad.addColorStop(1, '#4f46e5');
      } else {
        grad.addColorStop(0, meta.light); grad.addColorStop(0.65, meta.hex); grad.addColorStop(1, meta.dark);
      }
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();

      if (cell.armor === 2) {
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, cy, rad - 1, 0, Math.PI * 2); ctx.stroke();
      }

      ctx.fillStyle = `rgba(255,255,255,${cell.swell === 3 ? 0.72 : 0.42})`;
      ctx.beginPath();
      ctx.ellipse(cx - rad * 0.28, cy - rad * 0.3, rad * 0.32, rad * 0.16, -0.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      if (cell.kind === 'pump') { ctx.font = `900 ${Math.floor(rad * 0.9)}px sans-serif`; ctx.fillText('✚', cx, cy); }
      else if (cell.kind === 'balloon') { ctx.font = `900 ${Math.floor(rad * 0.9)}px sans-serif`; ctx.fillText('🎈', cx, cy); }
      else if (cell.kind === 'rainbow') { ctx.font = `900 ${Math.floor(rad * 0.9)}px sans-serif`; ctx.fillText('✦', cx, cy); }
      else {
        const cb = this.save.settings.colorblind;
        ctx.fillStyle = cb ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.68)';
        ctx.font = `bold ${Math.floor(rad * (cb ? 0.9 : 0.65))}px sans-serif`;
        ctx.fillText(meta.mark, cx, cy);
      }

      if (cell.leak) {
        ctx.font = '10px sans-serif'; ctx.fillText('💨', cx + rad * 0.55, cy - rad * 0.55);
      }
      if (cell.ice > 0) {
        const ib = cs * 0.82;
        ctx.fillStyle = 'rgba(186,230,253,0.45)'; ctx.strokeStyle = '#bae6fd'; ctx.lineWidth = 2;
        drawRoundRect(ctx, cx - ib * 0.5, cy - ib * 0.5, ib, ib, 8);
        ctx.fill(); ctx.stroke();
      }
      if (cell.tape > 0) {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.3);
        ctx.fillStyle = cell.tape === 2 ? '#fbbf24' : '#fde68a';
        ctx.fillRect(-cs * 0.44, -cs * 0.14, cs * 0.88, cs * 0.28);
        ctx.restore();
      }
    }

    if (st.catPaw && st.catPaw.enabled) {
      if (st.catPaw.warnIdx !== -1) {
        const p = this._cellCenter(st.catPaw.warnIdx);
        ctx.font = `${Math.floor(cs * 0.54)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🐾', p.x, p.y - cs * 0.1);
      }
      if (st.catPaw.heldIdx !== -1) {
        const p = this._cellCenter(st.catPaw.heldIdx);
        ctx.font = `${Math.floor(cs * 0.6)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🐱', p.x, p.y);
      }
    }

    for (let i = 0; i < this.rings.length; i++) {
      const rg = this.rings[i];
      ctx.globalAlpha = Math.max(0, rg.life / rg.maxLife);
      ctx.strokeStyle = rg.color || '#ffffff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(rg.x, rg.y, rg.r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < this.particles.length; i++) {
      const pt = this.particles[i];
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (this.phase === 'film') {
      const remH = Math.max(0, H - this.filmProgress * this.gridH);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillRect(0, 0, W, remH);
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fillRect(0, Math.max(0, remH - 10), W, 10);
    }

    ctx.restore();
  }
});
