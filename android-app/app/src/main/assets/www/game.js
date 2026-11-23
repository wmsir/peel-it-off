/**
 * PopGameApp — 《捏个痛快！》(Pop It Off!) Web + Android 统一主控制器
 * 依赖 PopCore (levels.js) 与 PopAudio (audio.js)
 */
(function (global) {
  'use strict';

  const Pop = global.PopCore;
  const AudioCls = global.PopAudio;
  const {
    COLS,
    ROWS,
    TOTAL_CELLS,
    BUBBLE_COLORS,
    BUBBLE_SKINS,
    CHAPTER_ROOMS,
    CAMPAIGN_CONFIGS,
    getColorMeta
  } = Pop;

  const SAVE_KEY = 'pop_it_off_save_v2';
  const SIBLING_SAVE_KEY = 'peel_it_off_save_v1';
  const MAX_PARTICLES = 300;

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

  function todayStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  class PopGameApp {
    constructor() {
      this.isAndroidApp = !!global.AndroidBridge;
      if (this.isAndroidApp) {
        document.body.classList.add('android-app');
      }

      this.audio = new AudioCls();
      this.save = this._loadSave();
      this._syncSettingsToAudio();

      this._bindDOM();
      this._initResizeObserver();

      this.mode = 'campaign';
      this.currentLevel = Math.min(35, this.save.unlockedLevel || 1);
      this.seasonStageIdx = 0;

      this.phase = 'idle'; // 'playing' | 'finale' | 'film' | 'ended'
      this.gameState = null;
      this.tracePath = [];
      this.previewData = null;
      this.dragging = false;
      this.activeTimers = [];

      // 视觉动效状态（渲染层与逻辑层完全分离）
      this.visualMap = {};
      this.particles = [];
      this.crinkles = [];
      this.rings = [];
      this.popTexts = [];
      this.shakeTime = 0;
      this.shakeMag = 0;
      this.slowMoTime = 0;
      this.filmProgress = 0;
      this.filmSnapping = false;
      this.filmDragging = false;
      this.filmLastY = 0;
      this.revivedThisRun = false;
      this.ambientPack = 'off';
      this.activeRoomCh = 1;
      this.adBusy = false;

      this._startStage('campaign', this.currentLevel);
      this._renderDevPanel();
      this._lastTime = performance.now();
      this._loop = this._loop.bind(this);
      requestAnimationFrame(this._loop);
    }

    _defaultSave() {
      return {
        unlockedLevel: 1,
        maxClearedLevel: 0,
        starsByLevel: {},
        itemsCollected: {}, // levelNum -> { icon, name, fine, ch, x, y }
        siblingExtraItems: [],
        unlockedSkins: ['classic'],
        equippedSkin: 'classic',
        vipNoAd: false,
        settings: { sound: true, haptics: true, colorblind: false },
        calendar: { lastDate: todayStr(), todayPopped: 0, streak: 0, litDays: 0, claimedCat: false },
        endlessTodayDate: todayStr(),
        endlessTodayCount: 0,
        dailyBestByDate: {},
        seasonCleared: {},
        lossStreak: {}
      };
    }

    _loadSave() {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          const def = this._defaultSave();
          return Object.assign(def, parsed, {
            settings: Object.assign(def.settings, parsed.settings || {}),
            calendar: Object.assign(def.calendar, parsed.calendar || {})
          });
        }
      } catch (_) {}
      return this._defaultSave();
    }

    _persistSave() {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(this.save));
      } catch (_) {}
    }

    _syncSettingsToAudio() {
      this.audio.setEnabled(this.save.settings.sound);
      this.audio.setHapticsEnabled(this.save.settings.haptics);
      this.audio.setSkin(this.save.equippedSkin);
    }

    _bindDOM() {
      this.stageWrap = document.getElementById('stage-wrap');
      this.canvas = document.getElementById('board-canvas');
      this.ctx = this.canvas.getContext('2d');

      this.hudChapterEl = document.getElementById('hud-chapter');
      this.hudLevelEl = document.getElementById('hud-level');
      this.endlessCounterEl = document.getElementById('endless-counter');
      this.endlessTodayNumEl = document.getElementById('endless-today-num');

      this.goalBarEl = document.getElementById('goal-bar');
      this.goalTitleEl = document.getElementById('goal-title');
      this.goalPillsEl = document.getElementById('goal-pills');
      this.movesBoxEl = document.getElementById('moves-box');
      this.movesLabelEl = document.getElementById('moves-label');
      this.hudMovesEl = document.getElementById('hud-moves');

      this.boostStripEl = document.getElementById('boost-strip');
      this.boostPumpBtn = document.getElementById('boost-pump');
      this.boostSwellBtn = document.getElementById('boost-swell');
      this.endlessBarEl = document.getElementById('endless-bar');
      this.bottomBarEl = document.getElementById('bottom-bar');

      this.previewPillEl = document.getElementById('preview-pill');
      this.megaBannerEl = document.getElementById('mega-banner');
      this.filmHintEl = document.getElementById('film-hint');
      this.toastEl = document.getElementById('game-toast');

      this.tabBtns = Array.from(document.querySelectorAll('.mode-tab'));
      this.lockEndlessEl = document.getElementById('lock-endless');
      this.lockDailyEl = document.getElementById('lock-daily');

      // Mode switchers
      this.tabBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          const target = btn.getAttribute('data-mode');
          this._switchMode(target);
        });
      });

      // Ambient sound buttons (Endless mode)
      document.querySelectorAll('.amb-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const amb = btn.getAttribute('data-amb');
          this.ambientPack = amb;
          this.audio.setAmbientPack(amb);
          document.querySelectorAll('.amb-btn').forEach((b) => b.classList.toggle('active', b === btn));
        });
      });

      // Pre-game boosts
      this.boostPumpBtn.addEventListener('click', () => this._applyPreBoost('pump'));
      this.boostSwellBtn.addEventListener('click', () => this._applyPreBoost('swell'));

      // Bottom buttons
      document.getElementById('btn-restart').addEventListener('click', () => this._restartCurrent());
      document.getElementById('btn-hint-ai').addEventListener('click', () => this._showAIHint());
      document.getElementById('btn-open-season').addEventListener('click', () => this._openSeasonModal());

      // Top modal triggers
      document.getElementById('btn-open-room').addEventListener('click', () => this._openRoomModal());
      document.getElementById('btn-open-calendar').addEventListener('click', () => this._openCalendarModal());
      document.getElementById('btn-open-skins').addEventListener('click', () => this._openSkinModal());
      document.getElementById('btn-open-settings').addEventListener('click', () => this._openSettingsModal());

      // Modal close & actions
      document.getElementById('btn-close-room').addEventListener('click', () => this._hideModal('room-modal'));
      document.getElementById('btn-close-calendar').addEventListener('click', () => this._hideModal('calendar-modal'));
      document.getElementById('btn-claim-cal').addEventListener('click', () => {
        this._hideModal('calendar-modal');
        this._openSkinModal();
      });
      document.getElementById('btn-close-skins').addEventListener('click', () => this._hideModal('skin-modal'));
      document.getElementById('btn-close-season').addEventListener('click', () => this._hideModal('season-modal'));
      document.getElementById('btn-close-settings').addEventListener('click', () => this._hideModal('settings-modal'));
      document.getElementById('btn-done-settings').addEventListener('click', () => this._hideModal('settings-modal'));

      document.getElementById('btn-toggle-vip').addEventListener('click', () => {
        this.save.vipNoAd = !this.save.vipNoAd;
        this._persistSave();
        this._openSkinModal();
        this.showToast(this.save.vipNoAd ? '👑 已开启免广告特权卡演示' : '已切换为激励视频标准模式');
      });

      document.getElementById('set-sound').addEventListener('click', () => {
        this.save.settings.sound = !this.save.settings.sound;
        this._syncSettingsToAudio();
        this._persistSave();
        this._refreshSettingsUI();
      });
      document.getElementById('set-haptics').addEventListener('click', () => {
        this.save.settings.haptics = !this.save.settings.haptics;
        this._syncSettingsToAudio();
        this._persistSave();
        this._refreshSettingsUI();
      });
      document.getElementById('set-colorblind').addEventListener('click', () => {
        this.save.settings.colorblind = !this.save.settings.colorblind;
        this._persistSave();
        this._refreshSettingsUI();
      });

      // Fail / Win / Daily buttons
      document.getElementById('btn-revive-moves').addEventListener('click', () => {
        if (this.revivedThisRun) {
          this.showToast('本局已续步过 1 次啦');
          return;
        }
        this._watchAd('看视频免费续 +5 步', () => {
          this.revivedThisRun = true;
          this.gameState.movesLeft += 5;
          this.gameState.finished = false;
          this.phase = 'playing';
          this._hideModal('fail-modal');
          this._updateHUD();
          this.showToast('✨ 续步 +5 成功！继续捏！');
        });
      });
      document.getElementById('btn-fail-restart').addEventListener('click', () => {
        this._hideModal('fail-modal');
        this._restartCurrent();
      });

      document.getElementById('btn-upgrade-prize').addEventListener('click', () => {
        this._watchAd('升级 3★ 精致闪耀藏品', () => {
          const item = this.gameState.itemMeta;
          const lvl = this.gameState.levelNum;
          if (this.save.itemsCollected[lvl]) {
            this.save.itemsCollected[lvl].fine = true;
            this.save.itemsCollected[lvl].name = item.fineName;
            this._persistSave();
          }
          document.getElementById('prize-name').textContent = `✨ ${item.fineName} (精致版)`;
          document.getElementById('btn-upgrade-prize').classList.add('hidden');
          this.showToast('🎁 已升级为精致闪耀版并存入房间！');
        });
      });

      document.getElementById('btn-next-level').addEventListener('click', () => {
        this._hideModal('win-modal');
        if (this.mode === 'season') {
          this.seasonStageIdx = (this.seasonStageIdx + 1) % 10;
          this._startStage('season', this.seasonStageIdx);
        } else {
          this._startStage('campaign', this.currentLevel + 1);
        }
      });
      document.getElementById('btn-win-room').addEventListener('click', () => {
        this._hideModal('win-modal');
        this._openRoomModal();
      });

      document.getElementById('btn-daily-close').addEventListener('click', () => {
        this._hideModal('daily-modal');
        this._startStage('daily', 0);
      });
      document.getElementById('btn-share-daily').addEventListener('click', () => {
        const text = `【捏个痛快！每日一捏 ${todayStr()}】我在 15 步内轰出 ${this.gameState.maxChainThisGame} 连爆，快来同一张泡泡纸PK！`;
        if (this.isAndroidApp && typeof global.AndroidBridge.shareText === 'function') {
          global.AndroidBridge.shareText(text);
        } else if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).catch(() => {});
          this.showToast('📤 已复制今日战绩到剪贴板！');
        } else {
          this.showToast(text);
        }
      });

      // Canvas pointer bindings (unified mouse/touch/stylus)
      this.canvas.addEventListener('pointerdown', (e) => this._onPointerDown(e));
      window.addEventListener('pointermove', (e) => this._onPointerMove(e));
      window.addEventListener('pointerup', (e) => this._onPointerUp(e));
      window.addEventListener('pointercancel', (e) => this._onPointerUp(e));

      // Dev panel buttons
      const unlockBtn = document.getElementById('dev-unlock-all');
      if (unlockBtn) {
        unlockBtn.addEventListener('click', () => {
          this.save.maxClearedLevel = Math.max(this.save.maxClearedLevel, 10);
          this.save.unlockedLevel = Math.max(this.save.unlockedLevel, 30);
          this._persistSave();
          this._updateModeLocks();
          this._renderDevPanel();
          this.showToast('🛠️ 已解锁无尽/每日与前 30 关跳转');
        });
      }
      const calAddBtn = document.getElementById('dev-cal-add');
      if (calAddBtn) {
        calAddBtn.addEventListener('click', () => {
          this._recordDailyPopProgress(100);
          this.showToast('📅 已模拟今日捏满 100 个，请点日历查看！');
        });
      }

      // 原生广告回调挂钩
      global.__onNativeRewardedAdResult = (granted) => {
        if (this._pendingAdCb) {
          const cb = this._pendingAdCb;
          this._pendingAdCb = null;
          if (granted) cb();
        }
      };
    }

    _initResizeObserver() {
      const sync = () => this._ensureCanvasSynced();
      if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(sync);
        ro.observe(this.stageWrap);
      }
      window.addEventListener('resize', sync);
      sync();
    }

    _ensureCanvasSynced() {
      const rect = this.stageWrap.getBoundingClientRect();
      const w = Math.max(260, Math.floor(rect.width));
      const h = Math.max(280, Math.floor(rect.height));
      const dpr = Math.min(2.5, window.devicePixelRatio || 1);
      if (this.viewW !== w || this.viewH !== h || this.dpr !== dpr) {
        this.viewW = w;
        this.viewH = h;
        this.dpr = dpr;
        this.canvas.width = Math.floor(w * dpr);
        this.canvas.height = Math.floor(h * dpr);
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this._recomputeGridMetrics();
      }
    }

    _recomputeGridMetrics() {
      const pad = 16;
      const cellSize = Math.floor(Math.min((this.viewW - pad) / COLS, (this.viewH - pad) / ROWS));
      this.cellSize = Math.max(32, cellSize);
      this.gridW = this.cellSize * COLS;
      this.gridH = this.cellSize * ROWS;
      this.gridOffX = Math.floor((this.viewW - this.gridW) * 0.5);
      this.gridOffY = Math.floor((this.viewH - this.gridH) * 0.5);
    }

    _clearTimers() {
      for (let i = 0; i < this.activeTimers.length; i++) {
        clearTimeout(this.activeTimers[i]);
      }
      this.activeTimers = [];
    }

    _switchMode(target) {
      if (target === 'endless' && this.save.maxClearedLevel < 3 && this.save.unlockedLevel <= 3) {
        this.showToast('🔒 通关第 3 关即可解锁「无尽捏捏」（或右侧调试台体验）');
        return;
      }
      if (target === 'daily' && this.save.maxClearedLevel < 8 && this.save.unlockedLevel <= 8) {
        this.showToast('🔒 通关第 8 关即可解锁「每日一捏」（或右侧调试台体验）');
        return;
      }
      this._startStage(target, target === 'campaign' ? this.currentLevel : 0);
    }

    _updateModeLocks() {
      const endlessUnlocked = this.save.maxClearedLevel >= 3 || this.save.unlockedLevel > 3;
      const dailyUnlocked = this.save.maxClearedLevel >= 8 || this.save.unlockedLevel > 8;
      this.lockEndlessEl.classList.toggle('hidden', endlessUnlocked);
      this.lockDailyEl.classList.toggle('hidden', dailyUnlocked);
    }

    _startStage(mode, levelOrIdx) {
      this._clearTimers();
      this.mode = mode;
      this.tracePath = [];
      this.previewData = null;
      this.particles = [];
      this.crinkles = [];
      this.rings = [];
      this.popTexts = [];
      this.visualMap = {};
      this.filmProgress = 0;
      this.filmSnapping = false;
      this.filmDragging = false;
      this.revivedThisRun = false;
      this.slowMoTime = 0;
      this.megaBannerEl.classList.add('hidden');
      this.filmHintEl.classList.add('hidden');
      this.previewPillEl.classList.add('hidden');

      if (mode !== 'endless') {
        this.audio.setAmbientPack('off');
      } else {
        this.audio.setAmbientPack(this.ambientPack);
      }

      if (mode === 'campaign') {
        this.currentLevel = Math.max(1, levelOrIdx || 1);
        const streak = (this.save.lossStreak && this.save.lossStreak[this.currentLevel]) || 0;
        const mercyBonus = streak >= 3 ? 3 : 0;
        this.gameState = Pop.buildCampaignLevel(this.currentLevel, 0, mercyBonus);
        if (mercyBonus > 0) {
          setTimeout(() => this.showToast('💝 贴心保护：连败 3 次已免费赠送 +3 步！'), 300);
        }
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
      this._updateModeLocks();
      this._updateHUD();
      this._renderDevPanel();
    }

    _restartCurrent() {
      if (this.mode === 'campaign') this._startStage('campaign', this.currentLevel);
      else if (this.mode === 'season') this._startStage('season', this.seasonStageIdx);
      else this._startStage(this.mode, 0);
    }

    _syncVisualTargets(snapImmediate = false) {
      if (!this.gameState) return;
      const grid = this.gameState.grid;
      const nextMap = {};
      for (let i = 0; i < TOTAL_CELLS; i++) {
        const cell = grid[i];
        if (!cell) continue;
        const r = Math.floor(i / COLS);
        const c = i % COLS;
        const tx = c;
        const ty = r;
        const existing = this.visualMap[cell.id];
        if (existing && !snapImmediate) {
          existing.targetX = tx;
          existing.targetY = ty;
          existing.cell = cell;
          nextMap[cell.id] = existing;
        } else {
          nextMap[cell.id] = {
            curX: tx,
            curY: snapImmediate ? ty : Math.max(-1.5, ty - 2.2),
            targetX: tx,
            targetY: ty,
            scale: 1,
            pressScale: 1,
            pulseOffset: (i * 0.67) % (Math.PI * 2),
            cell
          };
        }
      }
      this.visualMap = nextMap;
    }

    _updateHUD() {
      const st = this.gameState;
      const isEndless = this.mode === 'endless';

      this.tabBtns.forEach((b) => {
        const m = b.getAttribute('data-mode');
        b.classList.toggle('active', m === this.mode || (this.mode === 'season' && m === 'campaign'));
      });

      this.goalBarEl.classList.toggle('hidden', isEndless);
      this.endlessCounterEl.classList.toggle('hidden', !isEndless);
      this.endlessBarEl.classList.toggle('hidden', !isEndless);
      this.bottomBarEl.classList.toggle('hidden', isEndless);
      this.hudChapterEl.parentElement.classList.toggle('hidden', isEndless);

      if (isEndless) {
        if (this.save.endlessTodayDate !== todayStr()) {
          this.save.endlessTodayDate = todayStr();
          this.save.endlessTodayCount = 0;
        }
        this.endlessTodayNumEl.textContent = Number(this.save.endlessTodayCount || 0).toLocaleString();
        this.boostStripEl.classList.add('hidden');
        return;
      }

      if (this.mode === 'campaign') {
        this.hudChapterEl.textContent = `第${st.chapter}章 · ${st.roomMeta.theme}`;
        this.hudLevelEl.textContent = `第 ${st.levelNum} 关`;
      } else if (this.mode === 'daily') {
        this.hudChapterEl.textContent = `全服同图 · 每日一捏`;
        this.hudLevelEl.textContent = todayStr();
      } else if (this.mode === 'season') {
        this.hudChapterEl.textContent = `🛍️ 双十一限定赛季`;
        this.hudLevelEl.textContent = `第 ${this.seasonStageIdx + 1} / 10 关`;
      }

      this.goalTitleEl.textContent = st.title;
      this.hudMovesEl.textContent = String(st.movesLeft);
      this.movesLabelEl.textContent = this.mode === 'daily' ? '剩余步' : '步数';
      this.movesBoxEl.classList.toggle('low', st.movesLeft <= 3);

      // 开局第1步前展示可选开局道具条（无尽与每日禁止或仅闯关可自愿使用）
      const showBoost = (this.mode === 'campaign' || this.mode === 'season') && st.turnCount === 0 && this.phase === 'playing';
      this.boostStripEl.classList.toggle('hidden', !showBoost);
      this.boostPumpBtn.disabled = false;
      this.boostSwellBtn.disabled = false;

      // 渲染目标胶囊
      const g = st.goal || {};
      const p = st.progress;
      const pills = [];
      if (g.type === 'colors' && g.targets) {
        Object.keys(g.targets).forEach((cid) => {
          const meta = getColorMeta(cid);
          const cur = Math.min(g.targets[cid], p.colors[cid] || 0);
          const done = cur >= g.targets[cid];
          pills.push(`<span class="goal-pill ${done ? 'done' : ''}"><span class="goal-dot" style="background:${meta.hex}">${meta.mark}</span>${cur}/${g.targets[cid]}</span>`);
        });
      } else if (g.type === 'chain') {
        const done = p.bestChain >= g.count;
        pills.push(`<span class="goal-pill ${done ? 'done' : ''}">⚡ 单步连锁 ${p.bestChain}/${g.count}</span>`);
      } else if (g.type === 'tapes') {
        pills.push(`<span class="goal-pill ${p.tapesRemoved >= g.count ? 'done' : ''}">📦 撕胶带 ${Math.min(g.count, p.tapesRemoved)}/${g.count}</span>`);
      } else if (g.type === 'ices') {
        pills.push(`<span class="goal-pill ${p.icesMelted >= g.count ? 'done' : ''}">❄️ 破冰 ${Math.min(g.count, p.icesMelted)}/${g.count}</span>`);
      } else if (g.type === 'doubles') {
        pills.push(`<span class="goal-pill ${p.doublesBroken >= g.count ? 'done' : ''}">🛡️ 破双层 ${Math.min(g.count, p.doublesBroken)}/${g.count}</span>`);
      } else if (g.type === 'toys') {
        pills.push(`<span class="goal-pill ${p.toysRescued >= g.count ? 'done' : ''}">🧸 救玩具 ${Math.min(g.count, p.toysRescued)}/${g.count}</span>`);
      } else if (g.type === 'combo') {
        if (g.tapes) pills.push(`<span class="goal-pill ${p.tapesRemoved >= g.tapes ? 'done' : ''}">📦 ${Math.min(g.tapes, p.tapesRemoved)}/${g.tapes}</span>`);
        if (g.ices) pills.push(`<span class="goal-pill ${p.icesMelted >= g.ices ? 'done' : ''}">❄️ ${Math.min(g.ices, p.icesMelted)}/${g.ices}</span>`);
        if (g.doubles) pills.push(`<span class="goal-pill ${p.doublesBroken >= g.doubles ? 'done' : ''}">🛡️ ${Math.min(g.doubles, p.doublesBroken)}/${g.doubles}</span>`);
        if (g.colors) {
          Object.keys(g.colors).forEach((cid) => {
            const meta = getColorMeta(cid);
            const cur = Math.min(g.colors[cid], p.colors[cid] || 0);
            pills.push(`<span class="goal-pill ${cur >= g.colors[cid] ? 'done' : ''}"><span class="goal-dot" style="background:${meta.hex}">${meta.mark}</span>${cur}/${g.colors[cid]}</span>`);
          });
        }
      } else if (g.type === 'daily') {
        pills.push(`<span class="goal-pill">⚡ 今日最佳 ${st.maxChainThisGame} 连爆</span>`);
      }
      this.goalPillsEl.innerHTML = pills.join('');
    }

    _applyPreBoost(kind) {
      if (this.phase !== 'playing' || !this.gameState || this.gameState.turnCount > 0) return;
      this._watchAd(kind === 'pump' ? '开局预置十字气泵' : '开局全盘 +1 鼓胀度', () => {
        const grid = this.gameState.grid;
        if (kind === 'pump') {
          const mid = Pop.idxOf(3, 3);
          const cell = grid[mid];
          if (cell && cell.kind === 'bubble') {
            cell.kind = 'pump';
            cell.tape = 0;
            cell.ice = 0;
          }
          this.boostPumpBtn.disabled = true;
          this.showToast('💨 中央已放入 1 个强力十字气泵！');
        } else {
          for (let i = 0; i < TOTAL_CELLS; i++) {
            const c = grid[i];
            if (c && c.kind === 'bubble' && c.tape === 0 && c.ice === 0 && c.swell < 3) {
              c.swell += 1;
            }
          }
          this.boostSwellBtn.disabled = true;
          this.showToast('✨ 全盘气泡鼓胀 +1，连锁一触即发！');
        }
        this._syncVisualTargets(true);
      });
    }

    _showAIHint() {
      if (this.phase !== 'playing' || !this.gameState) return;
      const move = Pop.pickGreedyMove(this.gameState);
      if (move && move.length >= 2) {
        this.hintPath = move;
        this.hintTimer = 1.6;
        const pv = Pop.previewMove(this.gameState, move);
        this.showToast(`💡 建议连线 ${move.length} 格${pv.predictedChainTotal ? `（可引发 ${pv.predictedChainTotal} 连爆）` : ''}`);
      }
    }

    _clientToGridIdx(clientX, clientY) {
      const rect = this.canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const c = Math.floor((x - this.gridOffX) / this.cellSize);
      const r = Math.floor((y - this.gridOffY) / this.cellSize);
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return -1;
      const cx = this.gridOffX + (c + 0.5) * this.cellSize;
      const cy = this.gridOffY + (r + 0.5) * this.cellSize;
      const dist = Math.hypot(x - cx, y - cy);
      if (dist > this.cellSize * 0.56) return -1;
      return r * COLS + c;
    }

    _onPointerDown(e) {
      this.audio.init();
      this._ensureCanvasSynced();

      if (this.phase === 'film') {
        const rect = this.canvas.getBoundingClientRect();
        this.filmDragging = true;
        this.filmLastY = e.clientY - rect.top;
        return;
      }
      if (this.phase !== 'playing') return;

      // 三条硬规矩之一：连锁动画过程中也允许立刻开始划下一笔，瞬间收尾并发起新线
      if (this.activeTimers.length > 0) {
        this._clearTimers();
        this._syncVisualTargets(true);
      }

      const idx = this._clientToGridIdx(e.clientX, e.clientY);
      if (idx === -1) return;
      if (!Pop.canConnectCells(this.gameState, [], idx)) return;

      this.dragging = true;
      this.tracePath = [idx];
      this.previewData = null;
      const cell = this.gameState.grid[idx];
      if (cell && this.visualMap[cell.id]) this.visualMap[cell.id].pressScale = 0.85;
      this.audio.playPressFirst();
    }

    _onPointerMove(e) {
      if (this.phase === 'film' && this.filmDragging && !this.filmSnapping) {
        const rect = this.canvas.getBoundingClientRect();
        const y = e.clientY - rect.top;
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
      const idx = this._clientToGridIdx(e.clientX, e.clientY);
      if (idx === -1) return;

      const len = this.tracePath.length;
      if (len >= 2 && idx === this.tracePath[len - 2]) {
        // 沿原路退回取消上一格
        const removed = this.tracePath.pop();
        const rc = this.gameState.grid[removed];
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
    }

    _onPointerUp() {
      if (this.phase === 'film' && this.filmDragging) {
        this.filmDragging = false;
        this.filmSnapping = true;
        this.audio.updateFilmPeel(0.7);
        return;
      }
      if (!this.dragging) return;
      this.dragging = false;

      // 还原按键下陷缩放
      for (let i = 0; i < this.tracePath.length; i++) {
        const cell = this.gameState.grid[this.tracePath[i]];
        if (cell && this.visualMap[cell.id]) this.visualMap[cell.id].pressScale = 1;
      }

      this.previewPillEl.classList.add('hidden');
      this.previewData = null;

      if (this.tracePath.length < 2) {
        // 划不成线安静恢复，无惩罚音！
        this.tracePath = [];
        return;
      }

      const path = this.tracePath.slice();
      this.tracePath = [];
      this._executeMove(path);
    }

    _updatePreview() {
      if (this.tracePath.length < 2) {
        this.previewData = null;
        this.previewPillEl.classList.add('hidden');
        return;
      }
      this.previewData = Pop.previewMove(this.gameState, this.tracePath);
      const pv = this.previewData;
      if (!pv.valid) {
        this.previewPillEl.classList.add('hidden');
        return;
      }
      if (pv.willAutoPopIds.length > 0) {
        const prefix = pv.willSpawnBonus === 'rainbow' ? '🌈 九连彩虹 + ' : (pv.willSpawnBonus === 'pump' ? '💨 六连气泵 + ' : '⚡ ');
        this.previewPillEl.textContent = `${prefix}预计引发 ${pv.predictedChainTotal} 连爆！`;
        this.previewPillEl.classList.remove('hidden');
      } else if (pv.willSpawnBonus) {
        this.previewPillEl.textContent = pv.willSpawnBonus === 'rainbow' ? '🌈 终点生成彩虹泡！' : '💨 终点生成十字气泵！';
        this.previewPillEl.classList.remove('hidden');
      } else if (pv.willInflateIds.length > 0) {
        this.previewPillEl.textContent = `💨 给 ${pv.willInflateIds.length} 个邻居充气蓄力`;
        this.previewPillEl.classList.remove('hidden');
      } else {
        this.previewPillEl.classList.add('hidden');
      }
    }

    _cellCenter(idx) {
      const r = Math.floor(idx / COLS);
      const c = idx % COLS;
      return {
        x: this.gridOffX + (c + 0.5) * this.cellSize,
        y: this.gridOffY + (r + 0.5) * this.cellSize
      };
    }

    _spawnPopFx(idx, colorHex, isMega) {
      const pos = this._cellCenter(idx);
      // 透明皱褶塑料残片 (0.4s淡出)
      this.crinkles.push({
        x: pos.x,
        y: pos.y,
        r: this.cellSize * 0.42,
        rot: Math.random() * Math.PI * 2,
        life: 0.42,
        maxLife: 0.42
      });

      const count = isMega ? 10 : 6;
      for (let i = 0; i < count; i++) {
        if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
        const ang = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
        const spd = (isMega ? 140 : 95) + Math.random() * 80;
        this.particles.push({
          x: pos.x,
          y: pos.y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd - 35,
          size: 3 + Math.random() * 3,
          color: colorHex || '#ffffff',
          life: 0.42,
          maxLife: 0.42
        });
      }
    }

    _executeMove(path) {
      const prevState = this.gameState;
      const res = Pop.resolveMove(prevState, path, { fastMode: false });
      if (!res.valid) return;

      this.gameState = res.state;
      const tl = res.timeline;

      // 累计日历与无尽捏泡总数
      this._recordDailyPopProgress(res.totalPoppedThisMove);

      // 连锁总时长封顶 2000ms
      const lastWaveDelay = tl.waves.length ? tl.waves[tl.waves.length - 1].delayMs : 0;
      const timeScale = lastWaveDelay > 1900 ? 1900 / lastWaveDelay : 1;

      // 播放划线松手逐个爆破 (60ms)
      tl.popSteps.forEach((step) => {
        const id = setTimeout(() => {
          const meta = getColorMeta(step.color);
          if (step.popped) {
            this.audio.playPopSingle(step.seq);
            this._spawnPopFx(step.idx, meta.hex, false);
          } else if (step.armorCracked) {
            this.audio.playTap ? this.audio.playTap() : this.audio.playPopSingle(step.seq);
            const p = this._cellCenter(step.idx);
            this.popTexts.push({ x: p.x, y: p.y - 8, text: '外膜裂开!', color: '#0369a1', life: 0.6, maxLife: 0.6 });
          }
        }, Math.round(step.delayMs * timeScale));
        this.activeTimers.push(id);
      });

      // 播放波次连锁扩散 (80ms一圈)
      tl.waves.forEach((w) => {
        const id = setTimeout(() => {
          if (w.inflates.length > 0 && w.pops.length === 0) {
            this.audio.playInflate();
          }
          if (w.tapes.length > 0) {
            this.audio.playTapeTear();
          }
          if (w.pops.length > 0) {
            this.audio.playChainWave(w.waveIdx, w.pops.length);
            this.shakeTime = 0.14;
            this.shakeMag = Math.min(7, 2.5 + w.waveIdx * 1.1);
            for (let k = 0; k < w.pops.length; k++) {
              const pop = w.pops[k];
              const meta = getColorMeta(pop.color);
              this._spawnPopFx(pop.idx, meta.hex, w.waveIdx >= 1);
              const pos = this._cellCenter(pop.idx);
              this.rings.push({ x: pos.x, y: pos.y, r: 8, maxR: this.cellSize * 1.5, color: meta.light, life: 0.34, maxLife: 0.34 });
            }
          }
        }, Math.round(w.delayMs * timeScale));
        this.activeTimers.push(id);
      });

      // 若本次形成 >= 10 大连锁 -> 慢动作 0.3s + 屏幕大字「捏个痛快！」+ 长震和弦
      if (res.totalPoppedThisMove >= 10 && res.autoPoppedCount > 0) {
        const megaTimer = setTimeout(() => {
          this.slowMoTime = 0.30;
          this.audio.playMegaChain();
          this.megaBannerEl.textContent = `捏个痛快！×${res.totalPoppedThisMove}`;
          this.megaBannerEl.classList.remove('hidden');
          const hideT = setTimeout(() => this.megaBannerEl.classList.add('hidden'), 1150);
          this.activeTimers.push(hideT);
        }, Math.min(850, Math.round(tl.popSteps.length * 45 * timeScale)));
        this.activeTimers.push(megaTimer);
      }

      if (tl.rescuedToys.length > 0) {
        this.showToast(`🧸 成功救出 ${tl.rescuedToys.length} 个快递玩具！`);
      }

      // 若步数剩 <= 3 且仍在闯关，轻柔提示
      if ((this.mode === 'campaign' || this.mode === 'season') && !this.gameState.finished && this.gameState.movesLeft > 0 && this.gameState.movesLeft <= 3) {
        this.audio.playLowMoves();
      }

      // 下落平滑动画与 HUD 刷新
      const finishDelay = Math.min(2000, Math.round((lastWaveDelay + 140) * timeScale));
      this._syncVisualTargets(false);
      this._updateHUD();

      const endTimer = setTimeout(() => {
        if (this.gameState.finished) {
          this._handleGameFinished();
        }
      }, finishDelay);
      this.activeTimers.push(endTimer);
    }

    _recordDailyPopProgress(popCount) {
      const d = todayStr();
      if (this.save.calendar.lastDate !== d) {
        if (this.save.calendar.todayPopped < 100) {
          this.save.calendar.streak = 0; // 断签重新计数，不惩罚
        }
        this.save.calendar.lastDate = d;
        this.save.calendar.todayPopped = 0;
      }
      const prevPop = this.save.calendar.todayPopped;
      this.save.calendar.todayPopped += popCount;
      if (prevPop < 100 && this.save.calendar.todayPopped >= 100) {
        this.save.calendar.streak += 1;
        this.save.calendar.litDays = Math.min(7, this.save.calendar.litDays + 1);
        if (this.save.calendar.streak >= 7 && this.save.unlockedSkins.indexOf('catpaw') === -1) {
          this.save.unlockedSkins.push('catpaw');
          this.showToast('🐱 连续 7 天日历达标！已免费解锁「猫爪肉垫泡」皮肤！');
        }
      }
      if (this.mode === 'endless') {
        if (this.save.endlessTodayDate !== d) {
          this.save.endlessTodayDate = d;
          this.save.endlessTodayCount = 0;
        }
        this.save.endlessTodayCount += popCount;
        this.endlessTodayNumEl.textContent = Number(this.save.endlessTodayCount).toLocaleString();
      }
      this._persistSave();
    }

    _handleGameFinished() {
      if (this.mode === 'daily') {
        const d = todayStr();
        const prev = this.save.dailyBestByDate[d] || 0;
        const best = Math.max(prev, this.gameState.maxChainThisGame);
        this.save.dailyBestByDate[d] = best;
        this._persistSave();
        this._openDailyModal();
        return;
      }

      if (!this.gameState.won) {
        const lvl = this.gameState.levelNum;
        this.save.lossStreak[lvl] = (this.save.lossStreak[lvl] || 0) + 1;
        this._persistSave();
        this.phase = 'ended';
        const failDesc = document.getElementById('fail-desc');
        failDesc.textContent = this.save.lossStreak[lvl] >= 3
          ? '已连续挑战 3 次，下局重开将自动免费获赠 +3 步！'
          : '只差一点点！可看激励视频免费续 5 步，或立即免体力重来。';
        this._showModal('fail-modal');
        return;
      }

      // 闯关通关 -> 清零连输计数 -> 进入「收尾捏平整张泡泡纸 + 撕开快递」仪式感环节！
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
      this._updateModeLocks();

      this._startFinalePoke();
    }

    _startFinalePoke() {
      this.phase = 'finale';
      const unpopped = [];
      for (let i = 0; i < TOTAL_CELLS; i++) {
        if (!this.gameState.sheetRevealed[i]) unpopped.push(i);
      }
      if (unpopped.length === 0) {
        this._enterFilmPeel();
        return;
      }
      // 剩余步数化成快乐手指随机猛戳，在 ~1.2s 内把整张泡泡纸捏平
      const stepDelay = Math.max(24, Math.floor(1100 / Math.max(6, Math.ceil(unpopped.length / 3))));
      let cursor = 0;
      const timer = setInterval(() => {
        if (this.phase !== 'finale') {
          clearInterval(timer);
          return;
        }
        const batch = Math.min(3, unpopped.length - cursor);
        for (let b = 0; b < batch; b++) {
          const idx = unpopped[cursor++];
          this.gameState.sheetRevealed[idx] = true;
          const cell = this.gameState.grid[idx];
          if (cell) {
            const meta = getColorMeta(cell.color);
            this._spawnPopFx(idx, meta.hex, false);
            this.gameState.grid[idx] = null;
          }
          this.audio.playPopSingle(b);
        }
        this._syncVisualTargets(true);
        if (cursor >= unpopped.length) {
          clearInterval(timer);
          setTimeout(() => this._enterFilmPeel(), 220);
        }
      }, stepDelay);
    }

    _enterFilmPeel() {
      this.phase = 'film';
      this.filmProgress = 0;
      this.filmSnapping = false;
      this.filmHintEl.classList.remove('hidden');
    }

    _openWinModal() {
      this.phase = 'ended';
      this.audio.playWin();
      this.filmHintEl.classList.add('hidden');

      const st = this.gameState;
      const stars = (st.movesLeft >= 4 || st.maxChainThisGame >= 9) ? 3 : (st.movesLeft >= 2 ? 2 : 1);
      const item = st.itemMeta;
      const lvl = st.levelNum;

      if (this.mode === 'campaign') {
        const oldStars = this.save.starsByLevel[lvl] || 0;
        this.save.starsByLevel[lvl] = Math.max(oldStars, stars);
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

      document.getElementById('win-stars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
      document.getElementById('win-stamp').textContent = stars === 3 ? '完美 3★ 拆出精致版！' : '气泡全捏平 ✓ 快递已拆开！';
      document.getElementById('prize-icon').textContent = item.icon;
      document.getElementById('prize-name').textContent = stars === 3 ? `✨ ${item.fineName}` : item.name;
      document.getElementById('prize-quote').textContent = item.quote;
      document.getElementById('win-chain').textContent = `${st.maxChainThisGame} 连`;
      document.getElementById('win-moves').textContent = `${st.movesLeft} 步`;
      document.getElementById('win-pops').textContent = `${st.progress.totalPopped} 个`;

      const upBtn = document.getElementById('btn-upgrade-prize');
      upBtn.classList.toggle('hidden', stars === 3 || this.mode !== 'campaign');

      this._showModal('win-modal');
    }

    _openDailyModal() {
      this.phase = 'ended';
      this.audio.playWin();
      const best = this.gameState.maxChainThisGame;
      const pct = Math.min(99, 45 + best * 4);
      document.getElementById('daily-date-badge').textContent = `每日一捏 · ${todayStr()}`;
      document.getElementById('daily-best-chain').textContent = `${best} 连爆`;
      document.getElementById('daily-pct').textContent = `超越全服 ${pct}% 玩家`;
      document.getElementById('daily-rank').textContent = best >= 9 ? '今日好友榜第 1 名 👑' : '今日好友榜第 2 名';

      // 绘制缩略图
      const tc = document.getElementById('daily-thumb').getContext('2d');
      tc.fillStyle = '#d7b287';
      tc.fillRect(0, 0, 140, 160);
      for (let i = 0; i < TOTAL_CELLS; i++) {
        const cell = this.gameState.grid[i];
        const r = Math.floor(i / COLS), c = i % COLS;
        const cx = 10 + c * 18, cy = 10 + r * 18;
        tc.beginPath();
        tc.arc(cx + 8, cy + 8, cell ? 7 : 3, 0, Math.PI * 2);
        tc.fillStyle = cell ? getColorMeta(cell.color).hex : 'rgba(255,255,255,0.4)';
        tc.fill();
      }
      this._showModal('daily-modal');
    }

    _openRoomModal() {
      const tabsEl = document.getElementById('room-tabs');
      tabsEl.innerHTML = '';
      CHAPTER_ROOMS.forEach((rm) => {
        const btn = document.createElement('button');
        btn.className = 'room-tab' + (this.activeRoomCh === rm.ch ? ' active' : '');
        btn.textContent = rm.name;
        btn.onclick = () => {
          this.activeRoomCh = rm.ch;
          this._openRoomModal();
        };
        tabsEl.appendChild(btn);
      });

      const curRoom = CHAPTER_ROOMS.find((r) => r.ch === this.activeRoomCh) || CHAPTER_ROOMS[0];
      const stageEl = document.getElementById('room-stage');
      stageEl.style.background = `linear-gradient(180deg, ${curRoom.wall} 0%, ${curRoom.wall} 64%, ${curRoom.floor} 64%, ${curRoom.floor} 100%)`;

      const layerEl = document.getElementById('room-items-layer');
      layerEl.innerHTML = '';

      const roomItems = [];
      Object.keys(this.save.itemsCollected).forEach((lvlKey) => {
        const entry = this.save.itemsCollected[lvlKey];
        if (entry && entry.ch === curRoom.ch) {
          roomItems.push({ lvlKey, entry });
        }
      });

      document.getElementById('room-title-badge').textContent =
        `${curRoom.name} (${roomItems.length}/5)${roomItems.length >= 5 ? ' 🎉 已摆满!' : ''}`;

      roomItems.forEach(({ lvlKey, entry }) => {
        const chip = document.createElement('div');
        chip.className = 'room-item-chip' + (entry.fine ? ' fine' : '');
        chip.style.left = `${entry.x}%`;
        chip.style.top = `${entry.y}%`;
        chip.title = entry.name;
        chip.textContent = entry.icon;

        // 支持在房间画布中自由拖拽摆放位置
        chip.onpointerdown = (ev) => {
          ev.stopPropagation();
          const stRect = layerEl.getBoundingClientRect();
          const moveFn = (mv) => {
            const nx = Math.max(10, Math.min(90, ((mv.clientX - stRect.left) / stRect.width) * 100));
            const ny = Math.max(20, Math.min(88, ((mv.clientY - stRect.top) / stRect.height) * 100));
            chip.style.left = `${nx}%`;
            chip.style.top = `${ny}%`;
            entry.x = nx;
            entry.y = ny;
          };
          const upFn = () => {
            window.removeEventListener('pointermove', moveFn);
            window.removeEventListener('pointerup', upFn);
            this._persistSave();
          };
          window.addEventListener('pointermove', moveFn);
          window.addEventListener('pointerup', upFn);
        };
        layerEl.appendChild(chip);
      });

      // 渲染《撕个痛快！》共享收藏柜联动数据
      const sibEl = document.getElementById('sibling-cabinet-items');
      let sibHtml = '';
      let peelCount = 0;
      try {
        const sRaw = localStorage.getItem(SIBLING_SAVE_KEY);
        if (sRaw) {
          const sObj = JSON.parse(sRaw);
          peelCount = Math.max(0, (sObj.level || 0));
        }
      } catch (_) {}

      const popCount = Object.keys(this.save.itemsCollected).length;
      document.getElementById('sibling-summary').textContent =
        `《捏个痛快！》已收藏 ${popCount} 件 · 《撕个痛快！》互通战绩 ${peelCount} 关`;
      if (popCount === 0 && peelCount === 0) {
        sibHtml = '<span class="cab-tag">🥚 通过第 1 关即可点亮第一件双作共享藏品！</span>';
      } else {
        Object.keys(this.save.itemsCollected).slice(0, 8).forEach((k) => {
          const it = this.save.itemsCollected[k];
          sibHtml += `<span class="cab-tag">${it.icon} ${it.name}</span>`;
        });
        if (peelCount > 0) {
          sibHtml += `<span class="cab-tag">📼 《撕个痛快！》已拆 ${peelCount} 箱封条</span>`;
        }
      }
      sibEl.innerHTML = sibHtml;

      this._showModal('room-modal');
    }

    _openCalendarModal() {
      const cal = this.save.calendar;
      document.getElementById('cal-today-num').textContent = String(cal.todayPopped || 0);
      const grid = document.getElementById('cal-grid');
      grid.innerHTML = '';
      for (let d = 1; d <= 7; d++) {
        const cell = document.createElement('div');
        const lit = d <= (cal.streak || 0);
        cell.className = 'cal-day' + (lit ? ' lit' : '');
        cell.innerHTML = d === 7
          ? `<div>第7天</div><div>${lit ? '🐱已领' : '🐱皮肤'}</div>`
          : `<div>第${d}天</div><div>${lit ? '✓亮' : '○'}</div>`;
        grid.appendChild(cell);
      }
      this._showModal('calendar-modal');
    }

    _openSkinModal() {
      const list = document.getElementById('skin-list');
      list.innerHTML = '';
      BUBBLE_SKINS.forEach((sk) => {
        const owned = this.save.unlockedSkins.indexOf(sk.id) !== -1;
        const equipped = this.save.equippedSkin === sk.id;
        const row = document.createElement('div');
        row.className = 'skin-row' + (equipped ? ' equipped' : '');
        row.innerHTML = `
          <div class="skin-meta">
            <strong>${sk.name} ${equipped ? '· 使用中' : ''}</strong>
            <span>${sk.desc} (${owned ? '已解锁' : sk.unlockText})</span>
          </div>
          <button class="btn-mini">${equipped ? '已装备' : (owned ? '使用' : '试穿体验')}</button>
        `;
        row.querySelector('button').onclick = () => {
          if (!owned) {
            if (this.save.unlockedSkins.indexOf(sk.id) === -1) this.save.unlockedSkins.push(sk.id);
            this.showToast(`✨ 已试穿解锁「${sk.name}」音效与气泡！`);
          }
          this.save.equippedSkin = sk.id;
          this._syncSettingsToAudio();
          this._persistSave();
          this._openSkinModal();
        };
        list.appendChild(row);
      });

      const vipBtn = document.getElementById('btn-toggle-vip');
      vipBtn.textContent = this.save.vipNoAd ? '已开通（点此切换）' : '体验免广告特权';
      this._showModal('skin-modal');
    }

    _openSeasonModal() {
      const grid = document.getElementById('season-grid');
      grid.innerHTML = '';
      for (let i = 0; i < 10; i++) {
        const btn = document.createElement('button');
        const cleared = !!this.save.seasonCleared[i];
        btn.className = 'season-btn-cell' + (cleared ? ' cleared' : '');
        btn.textContent = cleared ? `✓ ${i + 1}` : `双11-${i + 1}`;
        btn.onclick = () => {
          this._hideModal('season-modal');
          this._startStage('season', i);
        };
        grid.appendChild(btn);
      }
      this._showModal('season-modal');
    }

    _openSettingsModal() {
      this._refreshSettingsUI();
      this._showModal('settings-modal');
    }

    _refreshSettingsUI() {
      const s = this.save.settings;
      const setBtn = (id, on, textOn, textOff) => {
        const el = document.getElementById(id);
        el.classList.toggle('on', !!on);
        el.textContent = on ? textOn : textOff;
      };
      setBtn('set-sound', s.sound, '开启', '关闭');
      setBtn('set-haptics', s.haptics, '开启', '关闭');
      setBtn('set-colorblind', s.colorblind, '已加粗', '关闭');
    }

    _watchAd(title, onSuccess) {
      // 无尽模式下绝对禁止弹广告
      if (this.mode === 'endless') return;
      if (this.save.vipNoAd) {
        this.showToast('👑 免广告特权生效，直接领取奖励！');
        onSuccess();
        return;
      }
      if (this.isAndroidApp && typeof global.AndroidBridge.hasNativeRewardedAd === 'function' && global.AndroidBridge.hasNativeRewardedAd()) {
        this._pendingAdCb = onSuccess;
        global.AndroidBridge.showRewardedAd(title);
        return;
      }

      if (this.adBusy) return;
      this.adBusy = true;
      document.getElementById('ad-title').textContent = title;
      const fill = document.getElementById('ad-progress-fill');
      const cntEl = document.getElementById('ad-countdown');
      fill.style.width = '0%';
      this._showModal('ad-modal');

      let pct = 0;
      const step = setInterval(() => {
        pct += 10;
        fill.style.width = `${pct}%`;
        const remSec = Math.max(0, Math.ceil((100 - pct) / 40));
        cntEl.textContent = pct >= 100 ? '✓ 奖励已解锁' : `还剩 ${remSec} 秒即可领取…`;
        if (pct >= 100) {
          clearInterval(step);
          this.adBusy = false;
          this._hideModal('ad-modal');
          onSuccess();
        }
      }, 220);
    }

    _renderDevPanel() {
      const grid = document.getElementById('level-jump-grid');
      if (!grid) return;
      grid.innerHTML = '';
      for (let lvl = 1; lvl <= 35; lvl++) {
        const btn = document.createElement('button');
        btn.className = 'jump-btn' + (this.mode === 'campaign' && this.currentLevel === lvl ? ' active' : '');
        btn.textContent = `L${lvl}`;
        btn.onclick = () => this._startStage('campaign', lvl);
        grid.appendChild(btn);
      }
    }

    _showModal(id) {
      const el = document.getElementById(id);
      if (el) el.classList.remove('hidden');
    }

    _hideModal(id) {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    }

    showToast(msg) {
      this.toastEl.textContent = msg;
      this.toastEl.classList.remove('hidden');
      clearTimeout(this._toastT);
      this._toastT = setTimeout(() => this.toastEl.classList.add('hidden'), 2200);
    }

    // ================= Canvas 渲染与主循环 =================

    _loop(now) {
      let dt = Math.min(0.05, (now - this._lastTime) / 1000);
      this._lastTime = now;
      if (this.slowMoTime > 0) {
        this.slowMoTime = Math.max(0, this.slowMoTime - dt);
        dt *= 0.38;
      }

      this._updateAnimations(dt);
      this._renderBoard(now / 1000);
      requestAnimationFrame(this._loop);
    }

    _updateAnimations(dt) {
      const spring = 1 - Math.exp(-16 * dt);
      Object.keys(this.visualMap).forEach((k) => {
        const v = this.visualMap[k];
        v.curX += (v.targetX - v.curX) * spring;
        v.curY += (v.targetY - v.curY) * spring;
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
        const p = 1 - rg.life / rg.maxLife;
        rg.r = 8 + (rg.maxR - 8) * p;
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
      for (let i = this.popTexts.length - 1; i >= 0; i--) {
        const tx = this.popTexts[i];
        tx.y -= 28 * dt;
        tx.life -= dt;
        if (tx.life <= 0) this.popTexts.splice(i, 1);
      }

      if (this.phase === 'film' && this.filmSnapping) {
        this.filmProgress = Math.min(1, this.filmProgress + dt * 2.8);
        if (this.filmProgress >= 1) {
          this.filmSnapping = false;
          this.audio.stopFilmPeel();
          this._openWinModal();
        }
      }
    }

    _renderBoard(timeSec) {
      if (!this.gameState || !this.cellSize) return;
      const ctx = this.ctx;
      const W = this.viewW, H = this.viewH;
      const st = this.gameState;
      const cs = this.cellSize;

      ctx.save();
      ctx.clearRect(0, 0, W, H);

      // 镜头震动
      if (this.shakeTime > 0) {
        const sx = (Math.random() - 0.5) * this.shakeMag * 2;
        const sy = (Math.random() - 0.5) * this.shakeMag * 2;
        ctx.translate(sx, sy);
      }

      // 1) 牛皮纸箱内壁纹理 + 暗藏的快递大图标轮廓
      ctx.fillStyle = '#cf9e69';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(130, 82, 34, 0.14)';
      ctx.lineWidth = 2;
      for (let y = 12; y < H; y += 20) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }

      // 暗藏快递物品底图（随整张破泡位置愈加清晰）
      const revealedCount = st.sheetRevealed.filter(Boolean).length;
      ctx.save();
      ctx.globalAlpha = 0.22 + (revealedCount / TOTAL_CELLS) * 0.72;
      ctx.font = `${Math.floor(Math.min(this.gridW, this.gridH) * 0.44)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(st.itemMeta.icon, this.gridOffX + this.gridW * 0.5, this.gridOffY + this.gridH * 0.5);
      ctx.font = 'bold 14px sans-serif';
      ctx.fillStyle = '#5c3a16';
      ctx.fillText(st.itemMeta.name, this.gridOffX + this.gridW * 0.5, this.gridOffY + this.gridH * 0.76);
      ctx.restore();

      // 半透明塑料底衬（未破过的格子蒙一层磨砂塑料感）
      for (let i = 0; i < TOTAL_CELLS; i++) {
        const r = Math.floor(i / COLS), c = i % COLS;
        const x = this.gridOffX + c * cs, y = this.gridOffY + r * cs;
        ctx.fillStyle = st.sheetRevealed[i] ? 'rgba(255,255,255,0.03)' : 'rgba(255,250,242,0.28)';
        ctx.fillRect(x + 1.5, y + 1.5, cs - 3, cs - 3);
      }

      // 2) 若有底藏玩具，绘在棋盘格子后景上
      for (let t = 0; t < st.toys.length; t++) {
        const toy = st.toys[t];
        if (toy.rescued) continue;
        const tx = this.gridOffX + (toy.c + 0.5) * cs;
        const ty = this.gridOffY + (toy.r + 0.5) * cs;
        ctx.save();
        ctx.font = `${Math.floor(cs * 0.58)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = 0.85;
        ctx.fillText(toy.icon, tx, ty);
        ctx.restore();
      }

      // 3) 皱巴巴透明塑料残片 (破泡后保留0.4s)
      for (let i = 0; i < this.crinkles.length; i++) {
        const cr = this.crinkles[i];
        const a = Math.max(0, cr.life / cr.maxLife);
        ctx.save();
        ctx.translate(cr.x, cr.y);
        ctx.rotate(cr.rot);
        ctx.globalAlpha = a * 0.65;
        ctx.strokeStyle = '#ffffff';
        ctx.fillStyle = 'rgba(255,255,255,0.32)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const ang = (Math.PI * 2 * k) / 6;
          const rad = cr.r * (k % 2 === 0 ? 0.92 : 0.62);
          if (k === 0) ctx.moveTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
          else ctx.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // 4) 软绳连线（在气泡下面一点或透明叠加，让触感丝滑）
      if (this.tracePath.length >= 1) {
        const activeCol = Pop.canConnectCells ? (st.grid[this.tracePath[0]] ? getColorMeta(st.grid[this.tracePath[0]].color).hex : '#ffffff') : '#ffffff';
        ctx.save();
        ctx.strokeStyle = activeCol;
        ctx.lineWidth = Math.max(6, cs * 0.16);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
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

      // AI 提示描边
      if (this.hintTimer > 0 && this.hintPath && this.hintPath.length >= 2) {
        ctx.save();
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 4;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        this.hintPath.forEach((idx, k) => {
          const p = this._cellCenter(idx);
          if (k === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
        ctx.restore();
      }

      // 5) 绘制 56 格气泡 / 障碍 + 实时气压预览光环
      const pv = this.previewData;
      const pvInflateSet = {};
      const pvPopSet = {};
      if (pv && pv.valid) {
        pv.willInflateIds.forEach((id) => { pvInflateSet[id] = true; });
        pv.willAutoPopIds.forEach((id) => { pvPopSet[id] = true; });
      }
      const traceSet = {};
      this.tracePath.forEach((id) => { traceSet[id] = true; });
      const activeFirst = this.tracePath.length ? st.grid[this.tracePath[0]] : null;

      for (let i = 0; i < TOTAL_CELLS; i++) {
        const cell = st.grid[i];
        if (!cell) continue;
        const vis = this.visualMap[cell.id] || { curX: i % COLS, curY: Math.floor(i / COLS), pressScale: 1, pulseOffset: 0 };
        const cx = this.gridOffX + (vis.curX + 0.5) * cs;
        const cy = this.gridOffY + (vis.curY + 0.5) * cs;

        this._drawCell(ctx, cell, i, cx, cy, cs, timeSec, vis, traceSet[i], pvInflateSet[i], pvPopSet[i], activeFirst);
      }

      // 6) 未救出玩具卡点提示框（显示周围还需击破哪几边）
      for (let t = 0; t < st.toys.length; t++) {
        const toy = st.toys[t];
        if (toy.rescued) continue;
        const tx = this.gridOffX + (toy.c + 0.5) * cs;
        const ty = this.gridOffY + (toy.r + 0.5) * cs;
        const reqs = Pop.getToyRequiredCells(st, toy);
        ctx.save();
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        drawRoundRect(ctx, tx - cs * 0.45, ty - cs * 0.45, cs * 0.9, cs * 0.9, 8);
        ctx.stroke();
        ctx.setLineDash([]);
        for (let q = 0; q < reqs.length; q++) {
          const ri = reqs[q];
          if (st.poppedEver[ri]) continue;
          const rx = this.gridOffX + ((ri % COLS) + 0.5) * cs;
          const ry = this.gridOffY + (Math.floor(ri / COLS) + 0.5) * cs;
          ctx.fillStyle = '#f59e0b';
          ctx.beginPath();
          ctx.arc(rx, ry, 4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // 7) 小猫爪预警 / 按压覆盖层
      if (st.catPaw && st.catPaw.enabled) {
        if (st.catPaw.warnIdx !== -1) {
          const p = this._cellCenter(st.catPaw.warnIdx);
          ctx.save();
          ctx.globalAlpha = 0.55 + Math.sin(timeSec * 8) * 0.25;
          ctx.font = `${Math.floor(cs * 0.55)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('🐾', p.x, p.y - cs * 0.14);
          ctx.restore();
        }
        if (st.catPaw.heldIdx !== -1) {
          const p = this._cellCenter(st.catPaw.heldIdx);
          ctx.save();
          ctx.fillStyle = 'rgba(251, 207, 232, 0.85)';
          ctx.beginPath();
          ctx.arc(p.x, p.y, cs * 0.44, 0, Math.PI * 2);
          ctx.fill();
          ctx.font = `${Math.floor(cs * 0.62)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('🐱', p.x, p.y);
          ctx.restore();
        }
      }

      // 7) 冲击波环、粒子与浮字
      for (let i = 0; i < this.rings.length; i++) {
        const rg = this.rings[i];
        ctx.save();
        ctx.globalAlpha = Math.max(0, rg.life / rg.maxLife);
        ctx.strokeStyle = rg.color || '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(rg.x, rg.y, rg.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      for (let i = 0; i < this.particles.length; i++) {
        const pt = this.particles[i];
        ctx.save();
        ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      for (let i = 0; i < this.popTexts.length; i++) {
        const tx = this.popTexts[i];
        ctx.save();
        ctx.globalAlpha = Math.max(0, tx.life / tx.maxLife);
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = tx.color;
        ctx.fillText(tx.text, tx.x, tx.y);
        ctx.restore();
      }

      // 8) 结尾整张泡泡保护膜卷起撕开特效
      if (this.phase === 'film') {
        const liftY = this.filmProgress * this.gridH;
        const remainH = Math.max(0, H - liftY);
        ctx.save();
        const grad = ctx.createLinearGradient(0, 0, 0, remainH);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.42)');
        grad.addColorStop(0.85, 'rgba(255, 255, 255, 0.25)');
        grad.addColorStop(1, 'rgba(255, 255, 255, 0.78)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, remainH);
        // 卷起的膜边缘高光卷轴
        ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
        ctx.fillRect(0, Math.max(0, remainH - 12), W, 12);
        ctx.restore();
      }

      ctx.restore();
    }

    _drawCell(ctx, cell, idx, cx, cy, cs, timeSec, vis, isTraced, willInflate, willAutoPop, activeFirst) {
      if (cell.kind === 'cardboard') {
        const bw = cs * 0.86;
        ctx.save();
        ctx.fillStyle = '#926234';
        ctx.strokeStyle = '#6b421b';
        ctx.lineWidth = 2;
        drawRoundRect(ctx, cx - bw * 0.5, cy - bw * 0.5, bw, bw, 8);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        return;
      }

      if (cell.kind === 'plastic') {
        const bw = cs * 0.78;
        ctx.save();
        ctx.fillStyle = '#cbd5e1';
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 2;
        drawRoundRect(ctx, cx - bw * 0.5, cy - bw * 0.5, bw, bw, 10);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#475569';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✕', cx, cy);
        ctx.restore();
        return;
      }

      if (cell.kind === 'nail') {
        ctx.save();
        ctx.fillStyle = '#475569';
        ctx.beginPath();
        ctx.arc(cx, cy, cs * 0.36, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e2e8f0';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('📌', cx, cy);
        ctx.restore();
        return;
      }

      const meta = getColorMeta(cell.color);
      // 鼓胀度 -> 直径 70% / 85% / 100% + 鼓③呼吸脉动
      const basePct = cell.swell === 1 ? 0.68 : (cell.swell === 2 ? 0.82 : 0.94);
      const breathe = cell.swell === 3 ? (1 + Math.sin(timeSec * 5.2 + vis.pulseOffset) * 0.045) : 1;
      const traceZoom = isTraced ? 0.85 : vis.pressScale;
      const radius = cs * 0.44 * basePct * breathe * traceZoom;

      ctx.save();

      // 按住首泡后周围可连同色泡微微发亮；以及气压连锁预览圈
      if (willAutoPop) {
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(cx, cy, radius + 4 + Math.sin(timeSec * 12) * 1.5, 0, Math.PI * 2);
        ctx.stroke();
      } else if (willInflate) {
        ctx.strokeStyle = 'rgba(255,255,255,0.92)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(cx, cy, radius + 3.5, 0, Math.PI * 2);
        ctx.stroke();
      } else if (activeFirst && Pop.canConnectCells(this.gameState, this.tracePath, idx)) {
        ctx.strokeStyle = 'rgba(255,255,255,0.65)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, radius + 3, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 果冻半透明圆顶渐变
      const grad = ctx.createRadialGradient(cx - radius * 0.28, cy - radius * 0.3, radius * 0.1, cx, cy, radius);
      if (cell.kind === 'rainbow') {
        grad.addColorStop(0, '#fef08a');
        grad.addColorStop(0.5, '#ec4899');
        grad.addColorStop(1, '#4f46e5');
      } else {
        grad.addColorStop(0, meta.light);
        grad.addColorStop(0.65, meta.hex);
        grad.addColorStop(1, meta.dark);
      }

      ctx.globalAlpha = this.save.equippedSkin === 'jelly' ? 0.88 : 0.94;
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();

      // 双层泡外环
      if (cell.armor === 2) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        ctx.arc(cx, cy, radius - 1, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 顶部高光月牙（随鼓胀度变亮）
      ctx.globalAlpha = cell.swell === 3 ? 0.78 : (cell.swell === 2 ? 0.55 : 0.36);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(cx - radius * 0.28, cy - radius * 0.32, radius * 0.34, radius * 0.17, -0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // 特殊角标（气泵 / 大气球 / 漏气 / 形状记号）
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (cell.kind === 'pump') {
        ctx.fillStyle = '#ffffff';
        ctx.font = `900 ${Math.floor(radius * 0.92)}px sans-serif`;
        ctx.fillText('✚', cx, cy + 1);
      } else if (cell.kind === 'balloon') {
        ctx.fillStyle = '#fef08a';
        ctx.font = `900 ${Math.floor(radius * 0.95)}px sans-serif`;
        ctx.fillText('🎈', cx, cy + 1);
      } else if (cell.kind === 'rainbow') {
        ctx.fillStyle = '#ffffff';
        ctx.font = `900 ${Math.floor(radius * 0.95)}px sans-serif`;
        ctx.fillText('✦', cx, cy + 1);
      } else {
        const cb = this.save.settings.colorblind;
        ctx.fillStyle = cb ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.68)';
        ctx.font = `${cb ? '900' : '700'} ${Math.floor(radius * (cb ? 0.92 : 0.65))}px sans-serif`;
        ctx.fillText(meta.mark, cx, cy + 1);
      }

      // 皮肤装饰：猫爪肉垫泡
      if (this.save.equippedSkin === 'catpaw' && cell.kind === 'bubble') {
        ctx.globalAlpha = 0.25;
        ctx.font = `${Math.floor(radius * 0.8)}px sans-serif`;
        ctx.fillText('🐾', cx, cy + radius * 0.15);
        ctx.globalAlpha = 1;
      }

      // 漏气泡提示小孔
      if (cell.leak) {
        ctx.fillStyle = '#fef08a';
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText('💨', cx + radius * 0.55, cy - radius * 0.55);
      }

      // 冰冻泡罩
      if (cell.ice > 0) {
        ctx.strokeStyle = '#bae6fd';
        ctx.fillStyle = 'rgba(186, 230, 253, 0.45)';
        ctx.lineWidth = 2.5;
        const ib = cs * 0.82;
        drawRoundRect(ctx, cx - ib * 0.5, cy - ib * 0.5, ib, ib, 9);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#0369a1';
        ctx.font = '12px sans-serif';
        ctx.fillText('❄️', cx + ib * 0.24, cy - ib * 0.24);
      }

      // 胶带封口贴条（联动《撕个痛快！》，tape=2 平贴，tape=1 翘角）
      if (cell.tape > 0) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-0.32);
        const tw = cs * 0.92, th = cs * 0.30;
        ctx.fillStyle = cell.tape === 2 ? '#fbbf24' : '#fde68a';
        ctx.strokeStyle = '#b45309';
        ctx.lineWidth = 1.5;
        ctx.fillRect(-tw * 0.5, -th * 0.5, tw, th);
        ctx.strokeRect(-tw * 0.5, -th * 0.5, tw, th);
        if (cell.tape === 1) {
          // 翘起一角折叠效果
          ctx.fillStyle = '#fef3c7';
          ctx.beginPath();
          ctx.moveTo(tw * 0.2, -th * 0.5);
          ctx.lineTo(tw * 0.52, -th * 0.95);
          ctx.lineTo(tw * 0.5, th * 0.5);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      }

      ctx.restore();
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    new PopGameApp();
  });
})(typeof window !== 'undefined' ? window : globalThis);
