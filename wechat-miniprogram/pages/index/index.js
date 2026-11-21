const PeelLevels = require('../../utils/levels');
const WxPeelAudio = require('../../utils/audio');
const { WxAdManager } = require('../../utils/ad');

const {
  LOGICAL_W,
  LOGICAL_H,
  LEVEL_THEMES,
  pointInTape,
  getBlockingTapes,
  buildLevel,
  getColorMeta
} = PeelLevels;

const STORAGE_KEY = 'peel_it_off_wx_save_v1';

Page({
  data: {
    levelNum: 1,
    levelTitle: '快递开箱',
    remainCount: 12,
    soundOn: true,
    spoolsView: [],
    queueText: '待进场卷芯：2 卷',
    trayView: [],
    trayDanger: false,
    trayTipText: '颜色未匹配将暂存于此，满格即卡死',
    cutterMode: false,
    showFilmHint: false,
    toastMsg: '',
    propsView: { cutter: 1, shuffle: 1, magnet: 1 },
    levelDrawerVisible: false,
    levelChoices: LEVEL_THEMES.map((t, idx) => ({
      idx,
      title: t.title,
      count: t.spools * 3
    })),
    adModal: {
      visible: false,
      title: '',
      progressPct: 0,
      countdownText: ''
    },
    failModal: {
      visible: false,
      desc: ''
    },
    winModal: {
      visible: false,
      prizeIcon: '',
      prizeName: '',
      prizeQuote: '',
      totalTapes: 12,
      maxCombo: 1,
      rankPct: 95
    }
  },

  onLoad() {
    this.audio = new WxPeelAudio();
    this.adManager = new WxAdManager();

    const saved = this._loadSave();
    this.levelIndex = saved.levelIndex;
    this.props = saved.props;
    this.retryCount = 0;

    this.phase = 'playing';
    this.theme = null;
    this.tapes = [];
    this.spoolQueue = [];
    this.activeSpools = [null, null, null];
    this.unlockedSpools = 2;
    this.tray = [null, null, null, null, null, null];
    this.unlockedTray = 5;
    this.cutterMode = false;

    this.combo = 0;
    this.maxCombo = 0;
    this.totalTapesInLevel = 0;
    this.bumpingSpoolIdx = -1;

    this.filmProgress = 0;
    this.filmDragging = false;
    this.filmMoved = false;
    this.filmLastY = 0;
    this.filmSnapping = false;

    this.ribbons = [];
    this.particles = [];
    this.popTexts = [];
    this.lightningArcs = [];

    this.spoolUid = 1;
    this.chipUid = 1;
    this._rafId = null;
    this._adTimer = null;
    this._toastTimer = null;
    this._lastTime = Date.now();

    this.canvas = null;
    this.ctx = null;
    this.dpr = 2;
    this.canvasW = 360;
    this.canvasH = 440;
    this.canvasLeft = 0;
    this.canvasTop = 0;
    this.boardScale = 1;
    this.boardOffX = 0;
    this.boardOffY = 0;
    this._onWinResize = null;

    this.loadLevel(this.levelIndex, 0);
  },

  onReady() {
    this._initCanvas(0);
    if (typeof wx !== 'undefined' && typeof wx.onWindowResize === 'function') {
      this._onWinResize = () => this._refreshCanvasMetrics();
      wx.onWindowResize(this._onWinResize);
    }
  },

  onUnload() {
    if (this._onWinResize && typeof wx !== 'undefined' && typeof wx.offWindowResize === 'function') {
      wx.offWindowResize(this._onWinResize);
    }
    if (this.canvas && this._rafId) {
      try { this.canvas.cancelAnimationFrame(this._rafId); } catch (_) {}
    }
    clearInterval(this._adTimer);
    clearTimeout(this._toastTimer);
    if (this.audio) this.audio.stopFilmPeel();
  },

  onShareAppMessage() {
    const title = this.theme
      ? `我在《撕个痛快！》刚撕完第 ${this.levelIndex + 1} 关「${this.theme.title}」，超解压根本停不下来！`
      : '超解压撕胶带小游戏《撕个痛快！》，强迫症玩到停不下来！';
    return {
      title,
      path: '/pages/index/index'
    };
  },

  onShareTimeline() {
    return {
      title: '《撕个痛快！》强迫症撕胶带解压神器，根本停不下来！'
    };
  },

  noop() {},

  _refreshCanvasMetrics() {
    if (!this.canvas) return;
    const query = wx.createSelectorQuery().in(this);
    query.select('#board-canvas').fields({ size: true, rect: true }).exec((res) => {
      const info = res && res[0];
      if (!info || !info.width || !info.height) return;
      this.canvasW = info.width;
      this.canvasH = info.height;
      this.canvasLeft = info.left || 0;
      this.canvasTop = info.top || 0;
      this.canvas.width = Math.round(this.canvasW * this.dpr);
      this.canvas.height = Math.round(this.canvasH * this.dpr);
      const scaleX = this.canvasW / LOGICAL_W;
      const scaleY = this.canvasH / LOGICAL_H;
      this.boardScale = Math.min(scaleX, scaleY);
      this.boardOffX = (this.canvasW - LOGICAL_W * this.boardScale) * 0.5;
      this.boardOffY = (this.canvasH - LOGICAL_H * this.boardScale) * 0.5;
    });
  },

  _initCanvas(attempt) {
    const query = wx.createSelectorQuery().in(this);
    query.select('#board-canvas').fields({ node: true, size: true, rect: true }).exec((res) => {
      const info = res && res[0];
      if (!info || !info.node || !info.width || !info.height) {
        if (attempt < 5) {
          setTimeout(() => this._initCanvas(attempt + 1), 80);
        }
        return;
      }

      const winInfo = typeof wx.getWindowInfo === 'function'
        ? wx.getWindowInfo()
        : wx.getSystemInfoSync();
      this.dpr = Math.min(winInfo.pixelRatio || 2, 2);

      this.canvas = info.node;
      this.ctx = this.canvas.getContext('2d');
      this.canvasW = info.width;
      this.canvasH = info.height;
      this.canvasLeft = info.left || 0;
      this.canvasTop = info.top || 0;

      this.canvas.width = Math.round(this.canvasW * this.dpr);
      this.canvas.height = Math.round(this.canvasH * this.dpr);

      const scaleX = this.canvasW / LOGICAL_W;
      const scaleY = this.canvasH / LOGICAL_H;
      this.boardScale = Math.min(scaleX, scaleY);
      this.boardOffX = (this.canvasW - LOGICAL_W * this.boardScale) * 0.5;
      this.boardOffY = (this.canvasH - LOGICAL_H * this.boardScale) * 0.5;

      this._lastTime = Date.now();
      this._startLoop();
    });
  },

  _loadSave() {
    const defaults = {
      levelIndex: 0,
      props: { cutter: 1, shuffle: 1, magnet: 1 }
    };
    try {
      const raw = wx.getStorageSync(STORAGE_KEY);
      if (!raw) return defaults;
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return {
        levelIndex: Math.max(0, parseInt(parsed.levelIndex, 10) || 0),
        props: {
          cutter: Math.max(0, parsed.props && typeof parsed.props.cutter === 'number' ? parsed.props.cutter : 1),
          shuffle: Math.max(0, parsed.props && typeof parsed.props.shuffle === 'number' ? parsed.props.shuffle : 1),
          magnet: Math.max(0, parsed.props && typeof parsed.props.magnet === 'number' ? parsed.props.magnet : 1)
        }
      };
    } catch (_) {
      return defaults;
    }
  },

  _saveProgress() {
    try {
      wx.setStorageSync(STORAGE_KEY, {
        levelIndex: this.levelIndex,
        props: this.props
      });
    } catch (_) {}
  },

  showToast(msg) {
    clearTimeout(this._toastTimer);
    this.setData({ toastMsg: msg });
    this._toastTimer = setTimeout(() => {
      this.setData({ toastMsg: '' });
    }, 2000);
  },

  loadLevel(idx, retryOffset = 0) {
    const data = buildLevel(idx, retryOffset);
    this.levelIndex = idx;
    this.theme = data.theme;
    this.tapes = data.tapes;
    this.spoolQueue = data.spoolQueue.slice();
    this.totalTapesInLevel = data.tapes.length;

    this.phase = 'playing';
    this.unlockedSpools = 2;
    this.unlockedTray = 5;
    this.tray = [null, null, null, null, null, null];
    this.activeSpools = [null, null, null];
    this.cutterMode = false;
    this.combo = 0;
    this.maxCombo = 0;

    this.filmProgress = 0;
    this.filmDragging = false;
    this.filmSnapping = false;

    this.ribbons = [];
    this.particles = [];
    this.popTexts = [];
    this.lightningArcs = [];

    for (let i = 0; i < this.unlockedSpools; i++) {
      this._spawnSpoolAt(i);
    }

    this._syncUI({
      showFilmHint: false,
      'failModal.visible': false,
      'winModal.visible': false,
      levelDrawerVisible: false
    });
  },

  _spawnSpoolAt(slotIdx) {
    if (this.spoolQueue.length === 0) {
      this.activeSpools[slotIdx] = null;
      return null;
    }
    const color = this.spoolQueue.shift();
    const spool = {
      id: 'sp_' + (this.spoolUid++),
      color,
      filled: 0,
      reserved: 0,
      popping: false
    };
    this.activeSpools[slotIdx] = spool;
    return spool;
  },

  _syncUI(extra = {}) {
    const remainCount = this.tapes.filter((t) => t.state === 'idle').length;

    const spoolsView = [];
    for (let i = 0; i < 3; i++) {
      if (i >= this.unlockedSpools) {
        spoolsView.push({ slotIdx: i, locked: true, empty: false });
      } else {
        const sp = this.activeSpools[i];
        if (!sp) {
          spoolsView.push({ slotIdx: i, locked: false, empty: true });
        } else {
          const meta = getColorMeta(sp.color);
          spoolsView.push({
            slotIdx: i,
            locked: false,
            empty: false,
            colorHex: meta.hex,
            colorName: meta.name,
            fillPct: Math.round((sp.filled / 3) * 100),
            popping: !!sp.popping,
            bumping: this.bumpingSpoolIdx === i,
            pips: [
              { k: 0, filled: sp.filled >= 1 },
              { k: 1, filled: sp.filled >= 2 },
              { k: 2, filled: sp.filled >= 3 }
            ]
          });
        }
      }
    }

    let occupied = 0;
    for (let i = 0; i < this.unlockedTray; i++) {
      if (this.tray[i]) occupied++;
    }
    const trayDanger = occupied >= this.unlockedTray - 1 && this.phase === 'playing';

    const trayView = [];
    for (let i = 0; i < 6; i++) {
      if (i >= this.unlockedTray) {
        trayView.push({ slotIdx: i, locked: true, colorHex: '', mark: '', dangerPulse: false });
      } else {
        const item = this.tray[i];
        if (item && item.state === 'seated') {
          const meta = getColorMeta(item.color);
          trayView.push({
            slotIdx: i,
            locked: false,
            colorHex: meta.hex,
            mark: meta.mark,
            dangerPulse: false
          });
        } else {
          trayView.push({
            slotIdx: i,
            locked: false,
            colorHex: '',
            mark: '',
            dangerPulse: !item && trayDanger
          });
        }
      }
    }

    const queueText = this.spoolQueue.length > 0
      ? `待进场卷芯：${this.spoolQueue.length} 卷`
      : '最后几卷了，冲刺撕光它！';

    this.setData(Object.assign({
      levelNum: this.levelIndex + 1,
      levelTitle: this.theme.title,
      remainCount,
      spoolsView,
      queueText,
      trayView,
      trayDanger,
      trayTipText: trayDanger ? '⚠️ 仅剩 1 格！小心缠成死结！' : '颜色未匹配将暂存于此，满格即卡死',
      cutterMode: this.cutterMode,
      propsView: {
        cutter: this.props.cutter,
        shuffle: this.props.shuffle,
        magnet: this.props.magnet
      }
    }, extra));
  },

  // ================= 顶栏与按钮事件 =================

  onToggleLevelDrawer() {
    this.setData({ levelDrawerVisible: !this.data.levelDrawerVisible });
  },

  onJumpLevel(e) {
    const lvl = parseInt(e.currentTarget.dataset.lvl, 10) || 0;
    this.retryCount = 0;
    this.loadLevel(lvl, 0);
    this._saveProgress();
  },

  onToggleSound() {
    const next = !this.audio.enabled;
    this.audio.setEnabled(next);
    this.setData({ soundOn: next });
    this.showToast(next ? 'ASMR 音效已开启 🎧' : '已静音');
  },

  onRestart() {
    this.audio.init();
    this.retryCount++;
    this.loadLevel(this.levelIndex, this.retryCount);
    this.showToast('已重新铺好新胶带！');
  },

  onCancelCutter() {
    this.cutterMode = false;
    this._syncUI();
  },

  onSpoolTap(e) {
    const idx = parseInt(e.currentTarget.dataset.idx, 10);
    if (idx < this.unlockedSpools || this.phase !== 'playing') return;
    this._watchAd('解锁第 3 个彩色回收卷芯', () => {
      this.unlockedSpools = 3;
      this._spawnSpoolAt(2);
      this.audio.playMatch(4);
      this._syncUI();
      this.showToast('🎉 已解锁第 3 个回收卷芯！');
      this._sweepTrayToSpools();
    });
  },

  onTrayTap(e) {
    const idx = parseInt(e.currentTarget.dataset.idx, 10);
    if (idx < this.unlockedTray || this.phase !== 'playing') return;
    this._watchAd('解锁第 6 个临时暂存槽', () => {
      this.unlockedTray = 6;
      this.audio.playMatch(3);
      this._syncUI();
      this.showToast('🎉 第 6 个暂存槽位已解锁！');
    });
  },

  onPropTap(e) {
    if (this.phase !== 'playing') return;
    this.audio.init();
    const type = e.currentTarget.dataset.prop;

    if (type === 'cutter' && this.cutterMode) {
      this.cutterMode = false;
      this._syncUI();
      return;
    }

    if (this.props[type] <= 0) {
      const titles = {
        cutter: '看广告免费领：✂️ 破障美工刀 +1',
        shuffle: '看广告免费领：🌀 换色洗牌 +1',
        magnet: '看广告免费领：🧲 一键收卷磁铁 +1'
      };
      this._watchAd(titles[type], () => {
        this.props[type] += 1;
        this._saveProgress();
        this._syncUI();
        this._activateProp(type);
      });
      return;
    }

    this._activateProp(type);
  },

  _activateProp(type) {
    if (type === 'cutter') {
      this.cutterMode = true;
      this._syncUI();
      this.showToast('✂️ 点任意被压住胶带，直接切出来！');
    } else if (type === 'shuffle') {
      const idleTapes = this.tapes.filter((t) => t.state === 'idle');
      if (idleTapes.length <= 1) {
        this.showToast('场上胶带太少，无需洗牌！');
        return;
      }
      this.props.shuffle--;
      this._saveProgress();
      this._executeShuffle(idleTapes);
      this._syncUI();
    } else if (type === 'magnet') {
      const ok = this._executeMagnet(-1);
      if (ok) {
        this.props.magnet--;
        this._saveProgress();
        this._syncUI();
      }
    }
  },

  onReviveTap() {
    this._watchAd('满槽复活：清空暂存区并收卷', () => this._executeRevive());
  },

  onFailRestartTap() {
    this.retryCount++;
    this.loadLevel(this.levelIndex, this.retryCount);
  },

  onNextLevelTap() {
    this.retryCount = 0;
    this.loadLevel(this.levelIndex + 1, 0);
    this._saveProgress();
  },

  /** 激励视频统一入口（真实流量主优先，未配 adUnitId 自动走 2.4 秒演示窗） */
  _watchAd(rewardTitle, onComplete) {
    this.audio.init();
    this.adManager.showRewarded(
      () => onComplete(),
      () => this.showToast('未完整观看广告，暂未发放奖励'),
      () => {
        clearInterval(this._adTimer);
        const totalMs = 2400;
        const start = Date.now();
        this.setData({
          adModal: {
            visible: true,
            title: rewardTitle,
            progressPct: 0,
            countdownText: '广告剩余 2.4 秒...'
          }
        });
        this._adTimer = setInterval(() => {
          const elapsed = Date.now() - start;
          const pct = Math.min(1, elapsed / totalMs);
          const left = Math.max(0, (totalMs - elapsed) / 1000).toFixed(1);
          if (pct >= 1) {
            clearInterval(this._adTimer);
            this.setData({ 'adModal.visible': false });
            onComplete();
          } else {
            this.setData({
              'adModal.progressPct': Math.round(pct * 100),
              'adModal.countdownText': `广告剩余 ${left} 秒...`
            });
          }
        }, 80);
      }
    );
  },

  // ================= 核心道具与复活逻辑 =================

  _spoolTargetLogical(slotIdx) {
    return { x: LOGICAL_W * ((slotIdx + 0.5) / 3), y: -12 };
  },

  _trayTargetLogical(trayIdx) {
    return { x: LOGICAL_W * ((trayIdx + 0.5) / 6), y: -6 };
  },

  _executeShuffle(idleTapes) {
    this.audio.playShuffle();
    const pool = idleTapes.map((t) => t.color);
    const freeTapes = idleTapes.filter((t) => getBlockingTapes(t, this.tapes).length === 0);
    const buriedTapes = idleTapes.filter((t) => getBlockingTapes(t, this.tapes).length > 0);

    const wanted = [];
    for (let i = 0; i < this.unlockedSpools; i++) {
      const sp = this.activeSpools[i];
      if (sp && !sp.popping) {
        const need = 3 - sp.reserved;
        for (let k = 0; k < need; k++) wanted.push(sp.color);
      }
    }

    const assignedFree = [];
    for (let i = 0; i < freeTapes.length; i++) {
      let pickIdx = -1;
      for (let w = 0; w < wanted.length; w++) {
        const found = pool.indexOf(wanted[w]);
        if (found !== -1) {
          pickIdx = found;
          wanted.splice(w, 1);
          break;
        }
      }
      if (pickIdx === -1) pickIdx = Math.floor(Math.random() * pool.length);
      assignedFree.push(pool.splice(pickIdx, 1)[0]);
    }

    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }

    freeTapes.forEach((t, idx) => { t.color = assignedFree[idx]; t.flipAnim = 1; });
    buriedTapes.forEach((t, idx) => { t.color = pool[idx]; t.flipAnim = 1; });
    this.showToast('🌀 洗牌完成！顶层已刷新出急需颜色！');
  },

  _executeMagnet(forcedSlotIdx = -1) {
    let targetIdx = forcedSlotIdx;
    if (targetIdx === -1) {
      let bestScore = -1;
      for (let i = 0; i < this.unlockedSpools; i++) {
        const sp = this.activeSpools[i];
        if (sp && !sp.popping && sp.reserved < 3) {
          const score = sp.reserved * 10 + (3 - i);
          if (score > bestScore) {
            bestScore = score;
            targetIdx = i;
          }
        }
      }
    }
    if (targetIdx === -1) return false;
    const sp = this.activeSpools[targetIdx];
    if (!sp || sp.popping) return false;

    let needed = 3 - sp.reserved;
    if (needed <= 0) return false;

    const targetPos = this._spoolTargetLogical(targetIdx);
    let pulled = 0;

    for (let i = 0; i < this.unlockedTray && needed > 0; i++) {
      const item = this.tray[i];
      if (item && item.state === 'seated' && item.color === sp.color) {
        const fromPos = this._trayTargetLogical(i);
        this.tray[i] = null;
        sp.reserved++;
        needed--;
        this._spawnLightning(fromPos, targetPos, getColorMeta(sp.color).hex);
        this._launchRibbon(fromPos, targetPos, sp.color, { type: 'spool', spoolId: sp.id, slotIdx: targetIdx }, pulled * 0.06);
        pulled++;
      }
    }

    const candidates = this.tapes
      .filter((t) => t.state === 'idle' && t.color === sp.color)
      .sort((a, b) => a.z - b.z);

    for (let i = 0; i < candidates.length && needed > 0; i++) {
      const tape = candidates[i];
      tape.state = 'done';
      sp.reserved++;
      needed--;
      const fromPos = { x: tape.cx, y: tape.cy };
      this._spawnLightning(fromPos, targetPos, getColorMeta(sp.color).hex);
      this._launchRibbon(fromPos, targetPos, sp.color, { type: 'spool', spoolId: sp.id, slotIdx: targetIdx }, pulled * 0.07);
      pulled++;
    }

    if (pulled > 0) {
      this.audio.playTapePeel(1.1);
      this._syncUI();
      this.showToast('🧲 超级磁铁吸满 1 卷！');
      return true;
    }
    return false;
  },

  _executeRevive() {
    this.phase = 'playing';
    this.setData({ 'failModal.visible': false });

    const freq = {};
    let bestColor = null;
    let bestCount = 0;
    for (let i = 0; i < this.unlockedTray; i++) {
      const it = this.tray[i];
      if (it && it.state === 'seated') {
        freq[it.color] = (freq[it.color] || 0) + 1;
        if (freq[it.color] > bestCount) {
          bestCount = freq[it.color];
          bestColor = it.color;
        }
      }
    }

    let matchIdx = -1;
    for (let i = 0; i < this.unlockedSpools; i++) {
      const sp = this.activeSpools[i];
      if (sp && !sp.popping && sp.color === bestColor) {
        matchIdx = i;
        break;
      }
    }

    if (matchIdx !== -1) {
      this._executeMagnet(matchIdx);
    } else if (bestColor) {
      const qIdx = this.spoolQueue.indexOf(bestColor);
      if (this.unlockedSpools < 3 && qIdx !== -1) {
        this.unlockedSpools = 3;
        this.spoolQueue.splice(qIdx, 1);
        this.activeSpools[2] = {
          id: 'sp_' + (this.spoolUid++),
          color: bestColor,
          filled: 0,
          reserved: 0,
          popping: false
        };
        this._syncUI();
        this._executeMagnet(2);
      } else {
        let emptySpoolIdx = -1;
        for (let i = 0; i < this.unlockedSpools; i++) {
          const sp = this.activeSpools[i];
          if (sp && !sp.popping && sp.reserved === 0) {
            emptySpoolIdx = i;
            break;
          }
        }
        if (emptySpoolIdx !== -1 && qIdx !== -1) {
          const oldColor = this.activeSpools[emptySpoolIdx].color;
          this.spoolQueue.splice(qIdx, 1);
          this.spoolQueue.push(oldColor);
          this.activeSpools[emptySpoolIdx] = {
            id: 'sp_' + (this.spoolUid++),
            color: bestColor,
            filled: 0,
            reserved: 0,
            popping: false
          };
          this._syncUI();
          this._executeMagnet(emptySpoolIdx);
        } else {
          if (qIdx !== -1) {
            this.spoolQueue.splice(qIdx, 1);
            this.spoolQueue.unshift(bestColor);
          }
          this._executeMagnet(-1);
        }
      }
    }

    this.showToast('🔥 复活成功！继续撕光它！');
  },

  // ================= 触摸交互（Canvas 2D） =================

  _touchToLogical(touch) {
    const rx = typeof touch.x === 'number' ? touch.x : (touch.clientX - this.canvasLeft);
    const ry = typeof touch.y === 'number' ? touch.y : (touch.clientY - this.canvasTop);
    return {
      x: (rx - this.boardOffX) / this.boardScale,
      y: (ry - this.boardOffY) / this.boardScale
    };
  },

  onCanvasTouchStart(e) {
    this.audio.init();
    const touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    if (!touch) return;
    const pos = this._touchToLogical(touch);

    if (this.phase === 'film') {
      if (this.filmSnapping) return;
      this.filmDragging = true;
      this.filmMoved = false;
      this.filmLastY = pos.y;
      return;
    }

    if (this.phase !== 'playing') return;

    // Pass 1：拇指优先吸附可撕的最顶层胶带（避免蹭到旁边被压住的胶带）
    let hit = null;
    for (let i = this.tapes.length - 1; i >= 0; i--) {
      const t = this.tapes[i];
      if (t.state !== 'idle') continue;
      if (!pointInTape(pos.x, pos.y, t, 10)) continue;
      if (this.cutterMode || getBlockingTapes(t, this.tapes).length === 0) {
        hit = t;
        break;
      }
    }

    // Pass 2：若没点到可撕胶带，再检测是否点到了被压住的胶带并给出清晰指引
    if (!hit) {
      for (let i = this.tapes.length - 1; i >= 0; i--) {
        const t = this.tapes[i];
        if (t.state !== 'idle') continue;
        if (pointInTape(pos.x, pos.y, t, 6)) {
          hit = t;
          break;
        }
      }
    }
    if (!hit) return;

    const blockers = getBlockingTapes(hit, this.tapes);
    const isBlocked = blockers.length > 0;

    if (isBlocked && !this.cutterMode) {
      hit.shakeTime = 0.28;
      blockers.forEach((b) => { b.highlightTime = 0.55; });
      this.audio.playBlocked();
      this.showToast('👆 被压住了！先撕上面发亮翘角的胶带');
      return;
    }

    let spoolSlotIdx = -1;
    for (let i = 0; i < this.unlockedSpools; i++) {
      const sp = this.activeSpools[i];
      if (sp && !sp.popping && sp.color === hit.color && sp.reserved < 3) {
        spoolSlotIdx = i;
        break;
      }
    }

    let traySlotIdx = -1;
    if (spoolSlotIdx === -1) {
      for (let i = 0; i < this.unlockedTray; i++) {
        if (!this.tray[i]) {
          traySlotIdx = i;
          break;
        }
      }
      if (traySlotIdx === -1) {
        this.audio.playBlocked();
        this.showToast('暂存区已满！请撕匹配顶部颜色的胶带');
        this._checkWinOrFail();
        return;
      }
    }

    if (this.cutterMode) {
      this.props.cutter--;
      this.cutterMode = false;
      this._saveProgress();
      this.audio.playSnip();
      this._spawnSparks(hit.cx, hit.cy, '#fde047', 14);
    } else {
      this.audio.playTapePeel(hit.length / 170);
    }

    let destInfo;
    if (spoolSlotIdx !== -1) {
      const sp = this.activeSpools[spoolSlotIdx];
      sp.reserved++;
      destInfo = { type: 'spool', spoolId: sp.id, slotIdx: spoolSlotIdx };
    } else {
      const chip = { id: 'ch_' + (this.chipUid++), color: hit.color, state: 'incoming' };
      this.tray[traySlotIdx] = chip;
      destInfo = { type: 'tray', trayIdx: traySlotIdx, chipId: chip.id };
    }

    hit.state = 'peeling';
    hit.peelProgress = 0;
    hit.destInfo = destInfo;
    this._syncUI();
  },

  onCanvasTouchMove(e) {
    if (this.phase !== 'film' || !this.filmDragging || this.filmSnapping) return;
    const touch = e.touches && e.touches[0];
    if (!touch) return;
    const pos = this._touchToLogical(touch);
    const dy = pos.y - this.filmLastY;
    this.filmLastY = pos.y;

    if (dy > 1.5) {
      this.filmMoved = true;
    }

    if (dy > 0.2) {
      this.filmProgress = Math.min(1, this.filmProgress + dy / (LOGICAL_H * 0.72));
      this.audio.updateFilmPeel(Math.min(1, dy / 14));
      if (Math.random() < 0.32) this.audio.vibrate('light');
      if (this.filmProgress >= 0.38) {
        this.filmDragging = false;
        this.filmSnapping = true;
        this.audio.playTapePeel(1.3);
      }
    } else {
      this.audio.updateFilmPeel(0);
    }
  },

  onCanvasTouchEnd() {
    if (this.phase === 'film' && this.filmDragging) {
      this.filmDragging = false;
      this.audio.stopFilmPeel();
      if (!this.filmMoved || this.filmProgress >= 0.35) {
        this.filmSnapping = true;
        this.audio.playTapePeel(1.3);
      } else {
        this.filmProgress = Math.min(1, this.filmProgress + 0.35);
        this.filmSnapping = true;
        this.audio.playTapePeel(1.1);
      }
    }
  },

  // ================= 丝带飞行 & 级联吸卷 =================

  _launchRibbon(fromPos, toPos, color, destInfo, delay = 0) {
    const midX = (fromPos.x + toPos.x) * 0.5 + (Math.random() - 0.5) * 60;
    const midY = Math.min(fromPos.y, toPos.y) - 35;
    this.ribbons.push({
      from: fromPos,
      ctrl: { x: midX, y: midY },
      to: toPos,
      color,
      destInfo,
      delay,
      t: 0,
      dur: 0.24
    });
  },

  _onRibbonArrive(ribbon) {
    const dest = ribbon.destInfo;
    if (dest.type === 'spool') {
      const sp = this.activeSpools[dest.slotIdx];
      if (!sp || sp.id !== dest.spoolId) return;
      sp.filled = Math.min(3, sp.filled + 1);
      this.combo++;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;
      this.audio.playMatch(this.combo);

      this.bumpingSpoolIdx = dest.slotIdx;
      this._syncUI();
      setTimeout(() => {
        if (this.bumpingSpoolIdx === dest.slotIdx) {
          this.bumpingSpoolIdx = -1;
          this._syncUI();
        }
      }, 140);

      const topX = LOGICAL_W * ((dest.slotIdx + 0.5) / 3);
      this._spawnSparks(topX, 16, getColorMeta(ribbon.color).hex, 10);
      if (this.combo >= 2) {
        this.popTexts.push({
          x: topX,
          y: 44,
          text: `COMBO x${this.combo}!`,
          color: getColorMeta(ribbon.color).dark,
          life: 0.85,
          maxLife: 0.85
        });
      }

      if (sp.filled >= 3 && !sp.popping) {
        sp.popping = true;
        this.audio.playSpoolComplete();
        this._syncUI();
        this._spawnConfetti(topX, 22, 18, getColorMeta(sp.color).hex);
        this.popTexts.push({
          x: topX,
          y: 26,
          text: '打包成功! ✨',
          color: '#059669',
          life: 0.95,
          maxLife: 0.95
        });

        const finishedId = sp.id;
        const sIdx = dest.slotIdx;
        setTimeout(() => {
          if (this.activeSpools[sIdx] && this.activeSpools[sIdx].id === finishedId) {
            this._spawnSpoolAt(sIdx);
            this._syncUI();
            this._sweepTrayToSpools();
            this._checkWinOrFail();
          }
        }, 230);
      } else {
        this._checkWinOrFail();
      }
    } else if (dest.type === 'tray') {
      const slotItem = this.tray[dest.trayIdx];
      if (slotItem && slotItem.id === dest.chipId) {
        slotItem.state = 'seated';
        this.combo = 0;
        this.audio.playTrayStick();
        this._syncUI();
        this._sweepTrayToSpools();
        this._checkWinOrFail();
      }
    }
  },

  _sweepTrayToSpools() {
    let moved = 0;
    for (let tIdx = 0; tIdx < this.unlockedTray; tIdx++) {
      const item = this.tray[tIdx];
      if (!item || item.state !== 'seated') continue;

      for (let sIdx = 0; sIdx < this.unlockedSpools; sIdx++) {
        const sp = this.activeSpools[sIdx];
        if (sp && !sp.popping && sp.color === item.color && sp.reserved < 3) {
          const fromPos = this._trayTargetLogical(tIdx);
          const toPos = this._spoolTargetLogical(sIdx);
          this.tray[tIdx] = null;
          sp.reserved++;
          this._launchRibbon(fromPos, toPos, sp.color, { type: 'spool', spoolId: sp.id, slotIdx: sIdx }, moved * 0.065);
          moved++;
          break;
        }
      }
    }
    if (moved > 0) this._syncUI();
    return moved;
  },

  _checkWinOrFail() {
    if (this.phase !== 'playing') return;

    const hasBoardTapes = this.tapes.some((t) => t.state !== 'done');
    const hasPeeling = this.tapes.some((t) => t.state === 'peeling');
    const hasSpools = this.activeSpools.some((s) => s !== null) || this.spoolQueue.length > 0;
    const hasTrayItems = this.tray.some((it) => it !== null);
    const hasInFlight = this.ribbons.length > 0;
    const anyPopping = this.activeSpools.some((s) => s && s.popping);

    if (!hasBoardTapes && !hasSpools && !hasTrayItems && !hasInFlight) {
      this._enterFilmPhase();
      return;
    }

    if (!hasInFlight && !anyPopping && !hasPeeling) {
      let seatedCount = 0;
      for (let i = 0; i < this.unlockedTray; i++) {
        if (this.tray[i] && this.tray[i].state === 'seated') seatedCount++;
      }
      if (seatedCount >= this.unlockedTray && this._sweepTrayToSpools() === 0) {
        this.phase = 'failed';
        this.audio.playFail();
        const remain = this.tapes.filter((t) => t.state === 'idle').length;
        this.setData({
          failModal: {
            visible: true,
            desc: `场上只剩 ${remain} 条胶带了，马上就能揭开保护膜彩蛋！`
          }
        });
      }
    }
  },

  _enterFilmPhase() {
    this.phase = 'film';
    this.filmProgress = 0.06;
    this.filmDragging = false;
    this.filmSnapping = false;
    this.cutterMode = false;
    this.audio.playMatch(6);
    this._syncUI({ showFilmHint: true });
    this.showToast('✨ 胶带全清！下滑撕开最后一层保护膜！');
  },

  _triggerWin() {
    this.phase = 'won';
    this.audio.playWin();
    this._spawnConfetti(LOGICAL_W * 0.5, LOGICAL_H * 0.45, 58);

    const beat = Math.min(99, 86 + this.levelIndex * 3 + Math.min(8, this.maxCombo));
    this.setData({ showFilmHint: false });
    setTimeout(() => {
      this.setData({
        winModal: {
          visible: true,
          prizeIcon: this.theme.prizeIcon,
          prizeName: this.theme.prizeName,
          prizeQuote: this.theme.prizeQuote,
          totalTapes: this.totalTapesInLevel,
          maxCombo: Math.max(1, this.maxCombo),
          rankPct: beat
        }
      });
    }, 340);
  },

  // ================= 粒子与 Canvas 2D 主渲染循环 =================

  _spawnSparks(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 60 + Math.random() * 130;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd - 30,
        size: 3 + Math.random() * 4,
        color,
        life: 0.42 + Math.random() * 0.25,
        maxLife: 0.67,
        rot: Math.random() * 6,
        vrot: (Math.random() - 0.5) * 14,
        shape: 'rect'
      });
    }
  },

  _spawnConfetti(x, y, count, themeColor = null) {
    const colors = themeColor
      ? [themeColor, '#f4b400', '#ffffff', '#06d6a0']
      : ['#ef476f', '#118ab2', '#f4b400', '#06d6a0', '#8338ec', '#fb5607'];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 85 + Math.random() * 220;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd - 95,
        size: 5 + Math.random() * 6,
        color: colors[i % colors.length],
        life: 0.85 + Math.random() * 0.65,
        maxLife: 1.5,
        rot: Math.random() * 6,
        vrot: (Math.random() - 0.5) * 16,
        shape: 'confetti'
      });
    }
  },

  _spawnLightning(from, to, color) {
    this.lightningArcs.push({ from, to, color, life: 0.28, maxLife: 0.28 });
  },

  _startLoop() {
    if (!this.canvas) return;
    const tick = () => {
      const now = Date.now();
      const dt = Math.min(0.05, (now - this._lastTime) / 1000);
      this._lastTime = now;

      this._update(dt);
      this._render(now * 0.001);

      if (this.canvas) {
        this._rafId = this.canvas.requestAnimationFrame(tick);
      }
    };
    this._rafId = this.canvas.requestAnimationFrame(tick);
  },

  _update(dt) {
    for (let i = 0; i < this.tapes.length; i++) {
      const t = this.tapes[i];
      if (t.shakeTime > 0) t.shakeTime = Math.max(0, t.shakeTime - dt);
      if (t.highlightTime > 0) t.highlightTime = Math.max(0, t.highlightTime - dt);
      if (t.flipAnim > 0) t.flipAnim = Math.max(0, t.flipAnim - dt * 3.2);

      if (t.state === 'peeling') {
        t.peelProgress += dt * 4.4;
        if (Math.random() < 0.5) {
          const p = Math.min(1, t.peelProgress);
          const localX = (t.length * 0.5 - p * t.length) * t.peelDir;
          this._spawnSparks(
            t.cx + Math.cos(t.angle) * localX,
            t.cy + Math.sin(t.angle) * localX,
            getColorMeta(t.color).light,
            1
          );
        }
        if (t.peelProgress >= 1) {
          t.state = 'done';
          const tailLocalX = -t.length * 0.4 * t.peelDir;
          const fromPos = {
            x: t.cx + Math.cos(t.angle) * tailLocalX,
            y: t.cy + Math.sin(t.angle) * tailLocalX
          };
          const toPos = t.destInfo.type === 'spool'
            ? this._spoolTargetLogical(t.destInfo.slotIdx)
            : this._trayTargetLogical(t.destInfo.trayIdx);
          this._launchRibbon(fromPos, toPos, t.color, t.destInfo, 0);
        }
      }
    }

    if (this.phase === 'film' && this.filmSnapping) {
      this.filmProgress += dt * 2.8;
      if (this.filmProgress >= 1.05) {
        this.filmProgress = 1.05;
        this.filmSnapping = false;
        this._triggerWin();
      }
    }

    for (let i = this.ribbons.length - 1; i >= 0; i--) {
      const r = this.ribbons[i];
      if (r.delay > 0) {
        r.delay -= dt;
        continue;
      }
      r.t += dt / r.dur;
      if (r.t >= 1) {
        this.ribbons.splice(i, 1);
        this._onRibbonArrive(r);
      }
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += (p.shape === 'confetti' ? 320 : 240) * dt;
      p.vx *= 0.985;
      p.rot += p.vrot * dt;
    }

    for (let i = this.popTexts.length - 1; i >= 0; i--) {
      const pt = this.popTexts[i];
      pt.life -= dt;
      pt.y -= 28 * dt;
      if (pt.life <= 0) this.popTexts.splice(i, 1);
    }

    for (let i = this.lightningArcs.length - 1; i >= 0; i--) {
      this.lightningArcs[i].life -= dt;
      if (this.lightningArcs[i].life <= 0) this.lightningArcs.splice(i, 1);
    }
  },

  _render(timeSec) {
    const ctx = this.ctx;
    if (!ctx) return;

    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.canvasW, this.canvasH);
    ctx.translate(this.boardOffX, this.boardOffY);
    ctx.scale(this.boardScale, this.boardScale);

    this._drawBaseCard(ctx);

    for (let i = 0; i < this.tapes.length; i++) {
      const tape = this.tapes[i];
      if (tape.state === 'done') continue;
      const blocked = tape.state === 'idle' && getBlockingTapes(tape, this.tapes).length > 0;
      this._drawTape(ctx, tape, blocked, timeSec);
    }

    if (this.phase === 'film') {
      this._drawProtectiveFilm(ctx, timeSec);
    }

    this._drawOverlayFx(ctx);
    ctx.restore();
  },

  _drawBaseCard(ctx) {
    const padX = 10;
    const padY = 10;
    const w = LOGICAL_W - padX * 2;
    const h = LOGICAL_H - padY * 2;

    ctx.save();
    ctx.shadowColor = 'rgba(42, 36, 31, 0.14)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 6;
    this._roundRectPath(ctx, padX, padY, w, h, 20);
    ctx.fillStyle = this.theme.cardBg;
    ctx.fill();
    ctx.restore();

    ctx.save();
    this._roundRectPath(ctx, padX, padY, w, h, 20);
    ctx.clip();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 10;
    for (let x = -h; x < w + h; x += 28) {
      ctx.beginPath();
      ctx.moveTo(padX + x, padY);
      ctx.lineTo(padX + x + h, padY + h);
      ctx.stroke();
    }

    ctx.strokeStyle = this.theme.cardAccent;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 5]);
    this._roundRectPath(ctx, padX + 12, padY + 12, w - 24, h - 24, 14);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    const isDark = !!(this.theme.isDark || this.theme.cardBg === '#1e293b');
    ctx.fillStyle = isDark ? '#f8fafc' : '#3a2f26';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(this.theme.cardLabel, LOGICAL_W * 0.5, padY + 46);

    ctx.font = '64px sans-serif';
    ctx.fillText(this.theme.prizeIcon, LOGICAL_W * 0.5, LOGICAL_H * 0.5 + 16);

    ctx.font = 'bold 13px sans-serif';
    ctx.fillStyle = isDark ? '#bae6fd' : '#574637';
    ctx.fillText(this.theme.prizeName, LOGICAL_W * 0.5, padY + h - 42);

    ctx.save();
    ctx.translate(padX + w - 58, padY + 62);
    ctx.rotate(0.24);
    ctx.strokeStyle = this.theme.cardAccent;
    ctx.lineWidth = 2.5;
    this._roundRectPath(ctx, -34, -14, 68, 28, 6);
    ctx.stroke();
    ctx.fillStyle = this.theme.cardAccent;
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(this.theme.cardStamp, 0, 4);
    ctx.restore();

    ctx.restore();
  },

  _drawTape(ctx, tape, blocked, timeSec) {
    const meta = getColorMeta(tape.color);
    const L = tape.length;
    const W = tape.width;
    const p = tape.state === 'peeling' ? Math.min(1, tape.peelProgress) : 0;

    ctx.save();
    ctx.translate(tape.cx, tape.cy);
    if (tape.shakeTime > 0) {
      ctx.translate(Math.sin(tape.shakeTime * 55) * 4.5 * (tape.shakeTime / 0.28), 0);
    }
    ctx.rotate(tape.angle);
    if (tape.flipAnim > 0) {
      ctx.scale(1, Math.max(0.15, Math.abs(Math.cos(tape.flipAnim * Math.PI))));
    }
    if (tape.peelDir < 0) ctx.scale(-1, 1);

    const creaseX = L * 0.5 - p * L;
    const remainLen = creaseX - (-L * 0.5);

    if (remainLen > 2) {
      ctx.save();
      ctx.shadowColor = blocked ? 'rgba(25, 18, 12, 0.20)' : 'rgba(25, 18, 12, 0.34)';
      ctx.shadowBlur = blocked ? 4 : 9;
      ctx.shadowOffsetX = blocked ? 1 : 2;
      ctx.shadowOffsetY = blocked ? 2 : 5;
      this._traceTapeSegmentPath(ctx, -L * 0.5, -W * 0.5, remainLen, W, true, p === 0);
      ctx.fillStyle = meta.hex;
      ctx.globalAlpha = blocked ? 0.88 : 0.94;
      ctx.fill();
      ctx.restore();

      ctx.save();
      this._traceTapeSegmentPath(ctx, -L * 0.5, -W * 0.5, remainLen, W, true, p === 0);
      ctx.clip();

      const grad = ctx.createLinearGradient(0, -W * 0.5, 0, W * 0.5);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.36)');
      grad.addColorStop(0.28, 'rgba(255, 255, 255, 0.08)');
      grad.addColorStop(0.82, 'rgba(0, 0, 0, 0.06)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0.16)');
      ctx.fillStyle = grad;
      ctx.fillRect(-L * 0.5, -W * 0.5, remainLen, W);

      if (remainLen > 34) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.68)';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(meta.mark, -L * 0.5 + remainLen * 0.5, 0.5);
      }

      if (blocked && !this.cutterMode) {
        ctx.fillStyle = 'rgba(20, 14, 10, 0.22)';
        ctx.fillRect(-L * 0.5, -W * 0.5, remainLen, W);
      }
      ctx.restore();

      ctx.save();
      this._traceTapeSegmentPath(ctx, -L * 0.5, -W * 0.5, remainLen, W, true, p === 0);
      ctx.strokeStyle = tape.highlightTime > 0
        ? '#fef08a'
        : (this.cutterMode ? 'rgba(255, 255, 255, 0.85)' : 'rgba(255, 255, 255, 0.45)');
      ctx.lineWidth = tape.highlightTime > 0 ? 4.5 : 1.25;
      ctx.stroke();
      ctx.restore();
    }

    if (p === 0 && (!blocked || this.cutterMode)) {
      const curlSize = 15 + Math.sin(timeSec * 4.2 + tape.z * 0.8) * 1.8;
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = -2;
      ctx.shadowOffsetY = 2;
      ctx.beginPath();
      ctx.moveTo(L * 0.5 - curlSize, -W * 0.5);
      ctx.lineTo(L * 0.5, -W * 0.5 + curlSize);
      ctx.lineTo(L * 0.5 - curlSize * 0.92, -W * 0.5 + curlSize * 0.92);
      ctx.closePath();
      ctx.fillStyle = meta.light;
      ctx.fill();
      ctx.restore();
    }

    if (p > 0.01) {
      const flapLen = Math.min(p * L * 0.72, L * 0.58);
      ctx.save();
      ctx.fillStyle = 'rgba(20, 14, 10, 0.24)';
      ctx.fillRect(creaseX - flapLen - 4, -W * 0.5 + 5, flapLen + 4, W);

      const backGrad = ctx.createLinearGradient(creaseX, 0, creaseX - flapLen, 0);
      backGrad.addColorStop(0, '#ffffff');
      backGrad.addColorStop(0.18, meta.light);
      backGrad.addColorStop(0.85, meta.hex);
      backGrad.addColorStop(1, meta.dark);

      ctx.beginPath();
      ctx.moveTo(creaseX, -W * 0.5);
      ctx.lineTo(creaseX - flapLen, -W * 0.5 - p * 4);
      ctx.lineTo(creaseX - flapLen, W * 0.5 + p * 4);
      ctx.lineTo(creaseX, W * 0.5);
      ctx.closePath();
      ctx.fillStyle = backGrad;
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(creaseX, -W * 0.5);
      ctx.lineTo(creaseX, W * 0.5);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  },

  _traceTapeSegmentPath(ctx, x, y, w, h, leftSerrated, rightSerrated) {
    const teeth = 5;
    const toothDepth = 3.2;
    const step = h / teeth;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    if (rightSerrated) {
      for (let i = 0; i < teeth; i++) {
        ctx.lineTo(x + w - toothDepth, y + (i + 0.5) * step);
        ctx.lineTo(x + w, y + (i + 1) * step);
      }
    } else {
      ctx.lineTo(x + w, y + h);
    }
    ctx.lineTo(x, y + h);
    if (leftSerrated) {
      for (let i = teeth - 1; i >= 0; i--) {
        ctx.lineTo(x + toothDepth, y + (i + 0.5) * step);
        ctx.lineTo(x, y + i * step);
      }
    } else {
      ctx.lineTo(x, y);
    }
    ctx.closePath();
  },

  _drawProtectiveFilm(ctx, timeSec) {
    const padX = 10;
    const padY = 10;
    const w = LOGICAL_W - padX * 2;
    const h = LOGICAL_H - padY * 2;
    const p = Math.max(0, Math.min(1, this.filmProgress));
    const peelY = padY + p * h;

    if (peelY < padY + h) {
      ctx.save();
      this._roundRectPath(ctx, padX, peelY, w, padY + h - peelY, 16);
      const filmGrad = ctx.createLinearGradient(padX, peelY, padX + w, padY + h);
      filmGrad.addColorStop(0, 'rgba(224, 242, 254, 0.72)');
      filmGrad.addColorStop(0.45, 'rgba(186, 230, 253, 0.48)');
      filmGrad.addColorStop(0.75, 'rgba(255, 255, 255, 0.64)');
      filmGrad.addColorStop(1, 'rgba(147, 197, 253, 0.55)');
      ctx.fillStyle = filmGrad;
      ctx.fill();

      ctx.clip();
      const shineX = ((timeSec * 140) % (w + 180)) - 90;
      const sg = ctx.createLinearGradient(padX + shineX, padY, padX + shineX + 70, padY + h);
      sg.addColorStop(0, 'rgba(255, 255, 255, 0)');
      sg.addColorStop(0.5, 'rgba(255, 255, 255, 0.65)');
      sg.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = sg;
      ctx.fillRect(padX, peelY, w, h);
      ctx.restore();
    }

    const flapH = Math.min(72, Math.max(24, p * h * 0.55));
    ctx.save();
    ctx.shadowColor = 'rgba(15, 23, 42, 0.28)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 8;
    const curlGrad = ctx.createLinearGradient(0, peelY, 0, peelY + flapH);
    curlGrad.addColorStop(0, 'rgba(255, 255, 255, 0.96)');
    curlGrad.addColorStop(1, 'rgba(186, 230, 253, 0.70)');
    this._roundRectPath(ctx, padX - 4, peelY, w + 8, flapH, 12);
    ctx.fillStyle = curlGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.lineWidth = 2;
    ctx.stroke();

    this._roundRectPath(ctx, LOGICAL_W * 0.5 - 78, peelY + flapH - 12, 156, 30, 15);
    ctx.fillStyle = '#f59e0b';
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('👇 点一下或下滑撕膜', LOGICAL_W * 0.5, peelY + flapH + 7);
    ctx.restore();
  },

  _drawOverlayFx(ctx) {
    for (let i = 0; i < this.lightningArcs.length; i++) {
      const arc = this.lightningArcs[i];
      ctx.save();
      ctx.globalAlpha = arc.life / arc.maxLife;
      ctx.strokeStyle = arc.color;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(arc.from.x, arc.from.y);
      ctx.quadraticCurveTo(
        (arc.from.x + arc.to.x) * 0.5 + (Math.random() - 0.5) * 26,
        (arc.from.y + arc.to.y) * 0.5 + (Math.random() - 0.5) * 26,
        arc.to.x,
        arc.to.y
      );
      ctx.stroke();
      ctx.restore();
    }

    for (let i = 0; i < this.ribbons.length; i++) {
      const r = this.ribbons[i];
      if (r.delay > 0) continue;
      const u = Math.min(1, Math.max(0, r.t));
      const e = 1 - Math.pow(1 - u, 3);
      const inv = 1 - e;
      const x = inv * inv * r.from.x + 2 * inv * e * r.ctrl.x + e * e * r.to.x;
      const y = inv * inv * r.from.y + 2 * inv * e * r.ctrl.y + e * e * r.to.y;
      const meta = getColorMeta(r.color);
      const scale = 1 - e * 0.3;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(e * Math.PI * 1.3);
      ctx.scale(scale, scale);
      this._roundRectPath(ctx, -24, -11, 48, 22, 6);
      ctx.fillStyle = meta.hex;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.78)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      ctx.save();
      ctx.globalAlpha = Math.min(1, p.life / (p.maxLife * 0.45));
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.shape === 'confetti') {
        ctx.fillRect(-p.size * 0.6, -p.size * 0.35, p.size * 1.2, p.size * 0.7);
      } else {
        ctx.fillRect(-p.size * 0.5, -p.size * 0.5, p.size, p.size);
      }
      ctx.restore();
    }

    for (let i = 0; i < this.popTexts.length; i++) {
      const pt = this.popTexts[i];
      ctx.save();
      ctx.globalAlpha = Math.min(1, pt.life / (pt.maxLife * 0.4));
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffffff';
      ctx.strokeText(pt.text, pt.x, pt.y);
      ctx.fillStyle = pt.color;
      ctx.fillText(pt.text, pt.x, pt.y);
      ctx.restore();
    }
  },

  _roundRectPath(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }
});
