/**
 * PeelGame — 《撕个痛快！》Web + Android APP 统一核心循环
 * 支持 localStorage 进度持久化 + AndroidBridge 原生广告/分享/震动桥接
 */
(function (global) {
  'use strict';

  const {
    LOGICAL_W,
    LOGICAL_H,
    pointInTape,
    getBlockingTapes,
    getArrowBlockers,
    isTapePeelable,
    buildLevel,
    getColorMeta
  } = global.PeelLevels;

  const AD_REVENUE_PER_VIEW = 0.028;
  const STORAGE_KEY = 'peel_it_off_save_v1';

  class PeelGameApp {
    constructor() {
      this.isAndroidApp = !!(global.AndroidBridge);
      if (this.isAndroidApp) {
        document.body.classList.add('android-app');
      }

      this.audio = new global.PeelAudio();

      this.phoneShell = document.getElementById('phone-shell');
      this.stageWrap = document.getElementById('stage-wrap');
      this.boardCanvas = document.getElementById('board-canvas');
      this.boardCtx = this.boardCanvas.getContext('2d');
      this.fxCanvas = document.getElementById('fx-canvas');
      this.fxCtx = this.fxCanvas.getContext('2d');

      this.spoolRowEl = document.getElementById('spool-row');
      this.queuePillEl = document.getElementById('queue-pill');
      this.traySlotsEl = document.getElementById('tray-slots');
      this.trayTipEl = document.getElementById('tray-tip');
      this.hudLevelEl = document.getElementById('hud-level');
      this.hudTitleEl = document.getElementById('hud-title');
      this.hudRemainEl = document.getElementById('hud-remain');
      this.cutterBannerEl = document.getElementById('cutter-banner');
      this.filmHintEl = document.getElementById('film-hint');
      this.toastEl = document.getElementById('game-toast');
      this.feverFillEl = document.getElementById('fever-fill');
      this.feverLabelEl = document.getElementById('fever-label');

      this.adModalEl = document.getElementById('ad-modal');
      this.adRewardTitleEl = document.getElementById('ad-reward-title');
      this.adProgressEl = document.getElementById('ad-progress-fill');
      this.adCountdownEl = document.getElementById('ad-countdown');
      this.failModalEl = document.getElementById('fail-modal');
      this.failDescEl = document.getElementById('fail-desc');
      this.winModalEl = document.getElementById('win-modal');
      this.levelModalEl = document.getElementById('level-modal');
      this.mobileJumpListEl = document.getElementById('mobile-jump-list');

      this.propBtns = {
        cutter: document.getElementById('prop-cutter'),
        shuffle: document.getElementById('prop-shuffle'),
        magnet: document.getElementById('prop-magnet')
      };
      this.propBadges = {
        cutter: document.getElementById('badge-cutter'),
        shuffle: document.getElementById('badge-shuffle'),
        magnet: document.getElementById('badge-magnet')
      };

      // 读取本地进度
      const saved = this._loadSave();
      this.levelIndex = saved.levelIndex;
      this.props = saved.props;
      this.adViews = saved.adViews;

      this.retryCount = 0;
      this.phase = 'playing';
      this.theme = null;
      this.tapes = [];
      this.spoolQueue = [];
      this.activeSpools = [];
      this.unlockedSpools = 2;
      this.tray = [];
      this.unlockedTray = 5;
      this.cutterMode = false;

      this.combo = 0;
      this.maxCombo = 0;
      this.totalTapesInLevel = 0;
      this.adTimer = null;
      this._pendingNativeAdCb = null;

      this.filmProgress = 0;
      this.filmDragging = false;
      this.filmMoved = false;
      this.filmLastY = 0;
      this.filmSnapping = false;

      this.feverCharge = 0;
      this.feverTime = 0;
      this.explodedTape = null;
      this.pointerDown = false;
      this.pointerConsumedTap = false;
      this.swipeLastLx = 0;
      this.swipeLastLy = 0;

      this.ribbons = [];
      this.particles = [];
      this.popTexts = [];
      this.lightningArcs = [];
      this.toastTimer = null;

      this.boardScale = 1;
      this.boardOffX = 0;
      this.boardOffY = 0;
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);

      this.spoolUid = 1;
      this.chipUid = 1;
      this.lastTime = performance.now();

      // 供 Android 原生广告 SDK 回调使用
      global.__onNativeRewardedAdResult = (granted) => {
        const cb = this._pendingNativeAdCb;
        this._pendingNativeAdCb = null;
        if (granted && typeof cb === 'function') {
          this.adViews++;
          this._saveProgress();
          this._updateDevPanel();
          cb();
        } else if (!granted) {
          this.showToast('未完整观看广告，暂未发放奖励');
        }
      };

      this._bindEvents();
      this.loadLevel(this.levelIndex, 0);
      this._resizeCanvases();
      requestAnimationFrame(() => this._resizeCanvases());
      requestAnimationFrame((t) => this._loop(t));
    }

    _loadSave() {
      const defaults = {
        levelIndex: 0,
        props: { cutter: 1, shuffle: 1, magnet: 1 },
        adViews: 0
      };
      try {
        const raw = global.localStorage && global.localStorage.getItem(STORAGE_KEY);
        if (!raw) return defaults;
        const parsed = JSON.parse(raw);
        return {
          levelIndex: Math.max(0, parseInt(parsed.levelIndex, 10) || 0),
          props: {
            cutter: Math.max(0, parseInt(parsed.props && parsed.props.cutter, 10) ?? 1),
            shuffle: Math.max(0, parseInt(parsed.props && parsed.props.shuffle, 10) ?? 1),
            magnet: Math.max(0, parseInt(parsed.props && parsed.props.magnet, 10) ?? 1)
          },
          adViews: Math.max(0, parseInt(parsed.adViews, 10) || 0)
        };
      } catch (_) {
        return defaults;
      }
    }

    _saveProgress() {
      try {
        if (!global.localStorage) return;
        global.localStorage.setItem(STORAGE_KEY, JSON.stringify({
          levelIndex: this.levelIndex,
          props: this.props,
          adViews: this.adViews
        }));
      } catch (_) {}
    }

    _bindEvents() {
      window.addEventListener('resize', () => this._resizeCanvases());
      if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => this._resizeCanvases());
        ro.observe(this.stageWrap);
        ro.observe(this.phoneShell);
      }

      this.boardCanvas.addEventListener('pointerdown', (e) => this._onBoardPointerDown(e));
      window.addEventListener('pointermove', (e) => this._onBoardPointerMove(e));
      window.addEventListener('pointerup', () => this._onBoardPointerUp());
      window.addEventListener('pointercancel', () => this._onBoardPointerUp());

      document.getElementById('btn-level-pick').addEventListener('click', () => {
        this._openLevelModal();
      });

      document.getElementById('btn-close-level-modal').addEventListener('click', () => {
        this.levelModalEl.classList.add('hidden');
      });

      document.getElementById('btn-sound').addEventListener('click', (e) => {
        const next = !this.audio.enabled;
        this.audio.setEnabled(next);
        e.currentTarget.textContent = next ? '🔊' : '🔇';
        this.showToast(next ? 'ASMR 音效已开启 🎧' : '已静音');
      });

      document.getElementById('btn-restart').addEventListener('click', () => {
        this.audio.init();
        this.retryCount++;
        this.loadLevel(this.levelIndex, this.retryCount);
        this.showToast('已重新铺好新胶带！');
      });

      document.getElementById('btn-cancel-cutter').addEventListener('click', () => {
        this._setCutterMode(false);
      });

      this.propBtns.cutter.addEventListener('click', () => this._onPropClick('cutter'));
      this.propBtns.shuffle.addEventListener('click', () => this._onPropClick('shuffle'));
      this.propBtns.magnet.addEventListener('click', () => this._onPropClick('magnet'));

      document.getElementById('btn-revive').addEventListener('click', () => {
        this._watchAd('满槽复活：清空暂存区并收卷', () => this._executeRevive());
      });
      document.getElementById('btn-fail-restart').addEventListener('click', () => {
        this.failModalEl.classList.add('hidden');
        this.retryCount++;
        this.loadLevel(this.levelIndex, this.retryCount);
      });
      document.getElementById('btn-next-level').addEventListener('click', () => {
        this.winModalEl.classList.add('hidden');
        this.retryCount = 0;
        this.loadLevel(this.levelIndex + 1, 0);
        this._saveProgress();
      });
      document.getElementById('btn-share-mock').addEventListener('click', () => {
        this.audio.playMatch(5);
        const text = `我在《撕个痛快！》刚撕光了第 ${this.levelIndex + 1} 关「${this.theme.title}」，最高连击 x${Math.max(1, this.maxCombo)}，强迫症极度舒适！`;
        if (global.AndroidBridge && typeof global.AndroidBridge.shareText === 'function') {
          global.AndroidBridge.shareText(text);
        } else {
          this.showToast('📤 已生成战绩文案，快发给朋友试试！');
        }
      });

      this._renderDesktopLevelJump();
    }

    _renderDesktopLevelJump() {
      const grid = document.getElementById('level-jump-grid');
      if (!grid) return;
      grid.innerHTML = '';
      global.PeelLevels.LEVEL_THEMES.forEach((t, idx) => {
        const btn = document.createElement('button');
        btn.className = 'jump-btn' + (idx === this.levelIndex ? ' active' : '');
        btn.dataset.lvl = String(idx);
        btn.textContent = `L${idx + 1} ${t.title} (${t.spools * 3})`;
        btn.addEventListener('click', () => {
          this.retryCount = 0;
          this.loadLevel(idx, 0);
          this._saveProgress();
        });
        grid.appendChild(btn);
      });
    }

    _openLevelModal() {
      const themes = global.PeelLevels.LEVEL_THEMES;
      this.mobileJumpListEl.innerHTML = '';
      themes.forEach((t, idx) => {
        const btn = document.createElement('button');
        btn.className = 'mobile-jump-item' + (idx === this.levelIndex ? ' active' : '');
        btn.textContent = `第 ${idx + 1} 关 · ${t.title}（${t.spools * 3} 条）`;
        btn.addEventListener('click', () => {
          this.levelModalEl.classList.add('hidden');
          this.retryCount = 0;
          this.loadLevel(idx, 0);
          this._saveProgress();
        });
        this.mobileJumpListEl.appendChild(btn);
      });
      this.levelModalEl.classList.remove('hidden');
    }

    _resizeCanvases() {
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);

      const bRect = this.stageWrap.getBoundingClientRect();
      if (bRect.width > 0 && bRect.height > 0) {
        this.boardCanvas.width = Math.max(1, Math.round(bRect.width * this.dpr));
        this.boardCanvas.height = Math.max(1, Math.round(bRect.height * this.dpr));

        const scaleX = bRect.width / LOGICAL_W;
        const scaleY = bRect.height / LOGICAL_H;
        this.boardScale = Math.min(scaleX, scaleY);
        this.boardOffX = (bRect.width - LOGICAL_W * this.boardScale) * 0.5;
        this.boardOffY = (bRect.height - LOGICAL_H * this.boardScale) * 0.5;
      }

      const pRect = this.phoneShell.getBoundingClientRect();
      if (pRect.width > 0 && pRect.height > 0) {
        this.fxCanvas.width = Math.max(1, Math.round(pRect.width * this.dpr));
        this.fxCanvas.height = Math.max(1, Math.round(pRect.height * this.dpr));
      }
    }

    _ensureCanvasSynced() {
      const bRect = this.stageWrap.getBoundingClientRect();
      if (bRect.width <= 0 || bRect.height <= 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const targetW = Math.max(1, Math.round(bRect.width * dpr));
      const targetH = Math.max(1, Math.round(bRect.height * dpr));
      if (Math.abs(this.boardCanvas.width - targetW) > 1 || Math.abs(this.boardCanvas.height - targetH) > 1) {
        this._resizeCanvases();
      }
    }

    _logicalToFx(lx, ly) {
      const bRect = this.stageWrap.getBoundingClientRect();
      const pRect = this.phoneShell.getBoundingClientRect();
      return {
        x: (bRect.left - pRect.left) + this.boardOffX + lx * this.boardScale,
        y: (bRect.top - pRect.top) + this.boardOffY + ly * this.boardScale
      };
    }

    _elToFx(el) {
      const r = el.getBoundingClientRect();
      const p = this.phoneShell.getBoundingClientRect();
      return {
        x: r.left - p.left + r.width * 0.5,
        y: r.top - p.top + r.height * 0.5
      };
    }

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
      this.combo = 0;
      this.maxCombo = 0;
      this.ribbons = [];
      this.particles = [];
      this.popTexts = [];
      this.lightningArcs = [];
      this.filmProgress = 0;
      this.filmDragging = false;
      this.filmSnapping = false;
      this.feverCharge = 0;
      this.feverTime = 0;
      this.explodedTape = null;
      this.pointerDown = false;
      this.pointerConsumedTap = false;
      this._setCutterMode(false);
      this._updateFeverUI();

      this.filmHintEl.classList.add('hidden');
      this.failModalEl.classList.add('hidden');
      this.winModalEl.classList.add('hidden');

      for (let i = 0; i < this.unlockedSpools; i++) {
        this._spawnSpoolAt(i);
      }

      document.querySelectorAll('.jump-btn').forEach((btn) => {
        btn.classList.toggle('active', parseInt(btn.dataset.lvl, 10) === idx);
      });

      this._updateHUD();
      this._renderSpoolsDOM();
      this._renderTrayDOM();
      this._renderPropsDOM();
      this._updateDevPanel();
    }

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
    }

    _setCutterMode(flag) {
      this.cutterMode = !!flag;
      this.stageWrap.classList.toggle('cutter-active', this.cutterMode);
      this.cutterBannerEl.classList.toggle('hidden', !this.cutterMode);
      this.propBtns.cutter.classList.toggle('selected', this.cutterMode);
    }

    showToast(msg) {
      this.toastEl.textContent = msg;
      this.toastEl.classList.remove('hidden');
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => {
        this.toastEl.classList.add('hidden');
      }, 2100);
    }

    _updateHUD() {
      this.hudLevelEl.textContent = '第 ' + (this.levelIndex + 1) + ' 关';
      this.hudTitleEl.textContent = this.theme.title;
      const remain = this.tapes.filter((t) => t.state === 'idle').length;
      this.hudRemainEl.textContent = String(remain);
    }

    _renderSpoolsDOM() {
      this.spoolRowEl.innerHTML = '';
      for (let i = 0; i < 3; i++) {
        const div = document.createElement('div');
        div.className = 'spool-slot';
        div.dataset.spoolSlot = String(i);

        if (i >= this.unlockedSpools) {
          div.classList.add('locked');
          div.innerHTML =
            '<div class="spool-locked-icon">🎬</div>' +
            '<div class="spool-locked-text">+1 回收卷芯</div>';
          div.addEventListener('click', () => {
            if (this.phase !== 'playing') return;
            this._watchAd('解锁第 3 个彩色回收卷芯', () => {
              this.unlockedSpools = 3;
              this._spawnSpoolAt(2);
              this._renderSpoolsDOM();
              this.audio.playMatch(4);
              this.showToast('🎉 已解锁第 3 个回收卷芯！');
              this._sweepTrayToSpools();
            });
          });
        } else {
          const sp = this.activeSpools[i];
          if (!sp) {
            div.innerHTML = '<span class="spool-empty-text">已清空 ✓</span>';
          } else {
            const meta = getColorMeta(sp.color);
            div.classList.add('active');
            if (sp.popping) div.classList.add('popping');
            div.style.setProperty('--spool-color', meta.hex);
            const pct = (sp.filled / 3) * 100;
            const pipsHtml = [0, 1, 2]
              .map((idx) => `<span class="spool-pip ${idx < sp.filled ? 'filled' : ''}"></span>`)
              .join('');
            div.innerHTML =
              `<div class="spool-core-wrap">` +
              `  <div class="spool-ring" style="--fill-pct:${pct}"></div>` +
              `  <div class="spool-meta">` +
              `    <span class="spool-color-name">${meta.name}</span>` +
              `    <div class="spool-pips">${pipsHtml}</div>` +
              `  </div>` +
              `</div>`;
          }
        }
        this.spoolRowEl.appendChild(div);
      }

      this.queuePillEl.textContent =
        this.spoolQueue.length > 0
          ? `待进场卷芯：${this.spoolQueue.length} 卷`
          : '最后几卷了，冲刺撕光它！';
    }

    _renderTrayDOM() {
      this.traySlotsEl.innerHTML = '';
      let occupied = 0;
      for (let i = 0; i < this.unlockedTray; i++) {
        if (this.tray[i]) occupied++;
      }
      const isDanger = occupied >= this.unlockedTray - 1 && this.phase === 'playing';

      for (let i = 0; i < 6; i++) {
        const slot = document.createElement('div');
        slot.className = 'tray-slot';
        slot.dataset.traySlot = String(i);

        if (i >= this.unlockedTray) {
          slot.classList.add('locked');
          slot.innerHTML =
            '<span class="tray-lock-badge">🎬</span>' +
            '<span class="tray-lock-label">+1槽位</span>';
          slot.addEventListener('click', () => {
            if (this.phase !== 'playing') return;
            this._watchAd('解锁第 6 个临时暂存槽', () => {
              this.unlockedTray = 6;
              this._renderTrayDOM();
              this.audio.playMatch(3);
              this.showToast('🎉 第 6 个暂存槽位已解锁！');
            });
          });
        } else {
          const item = this.tray[i];
          if (item && item.state === 'seated') {
            const meta = getColorMeta(item.color);
            const chip = document.createElement('div');
            chip.className = 'tray-tape-chip';
            chip.style.setProperty('--chip-color', meta.hex);
            chip.dataset.mark = meta.mark;
            slot.appendChild(chip);
          } else if (!item && isDanger) {
            slot.classList.add('danger-pulse');
          }
        }
        this.traySlotsEl.appendChild(slot);
      }

      if (isDanger) {
        this.trayTipEl.textContent = '⚠️ 仅剩 1 格！小心缠成死结！';
        this.trayTipEl.classList.add('danger');
      } else {
        this.trayTipEl.textContent = '颜色未匹配将暂存于此，满格即卡死';
        this.trayTipEl.classList.remove('danger');
      }
    }

    _renderPropsDOM() {
      ['cutter', 'shuffle', 'magnet'].forEach((key) => {
        const count = this.props[key];
        const badge = this.propBadges[key];
        if (count > 0) {
          badge.textContent = String(count);
          badge.classList.remove('ad-badge');
        } else {
          badge.textContent = '🎬';
          badge.classList.add('ad-badge');
        }
      });
    }

    _updateDevPanel() {
      const elCount = document.getElementById('dev-ad-count');
      if (!elCount) return;
      const rev = this.adViews * AD_REVENUE_PER_VIEW;
      const dauDaily = rev * 5000;
      elCount.textContent = `${this.adViews} 次`;
      document.getElementById('dev-ad-money').textContent = `¥${rev.toFixed(3)}`;
      document.getElementById('dev-dau-money').textContent = `¥${Math.round(dauDaily)} / 天`;
      document.getElementById('dev-breakeven').textContent =
        dauDaily > 1 ? `约 ${Math.max(1, Math.ceil(2000 / dauDaily))} 天回本` : '待触发';
    }

    /** 激励视频广告调度：如果 Android 原生已接 AdMob/穿山甲，自动走原生 SDK；否则走内置模拟窗 */
    _watchAd(rewardTitle, onComplete) {
      this.audio.init();
      if (
        global.AndroidBridge &&
        typeof global.AndroidBridge.hasNativeRewardedAd === 'function' &&
        global.AndroidBridge.hasNativeRewardedAd()
      ) {
        this._pendingNativeAdCb = onComplete;
        global.AndroidBridge.showRewardedAd(rewardTitle);
        return;
      }

      clearInterval(this.adTimer);
      this.adRewardTitleEl.textContent = rewardTitle;
      this.adProgressEl.style.width = '0%';
      this.adCountdownEl.textContent = '广告剩余 2.4 秒...';
      this.adModalEl.classList.remove('hidden');

      const totalMs = 2400;
      const start = performance.now();
      this.adTimer = setInterval(() => {
        const elapsed = performance.now() - start;
        const pct = Math.min(1, elapsed / totalMs);
        this.adProgressEl.style.width = `${Math.round(pct * 100)}%`;
        const left = Math.max(0, (totalMs - elapsed) / 1000).toFixed(1);
        this.adCountdownEl.textContent = pct < 1 ? `广告剩余 ${left} 秒...` : '奖励已发放 ✓';

        if (pct >= 1) {
          clearInterval(this.adTimer);
          this.adModalEl.classList.add('hidden');
          this.adViews++;
          this._saveProgress();
          this._updateDevPanel();
          onComplete();
        }
      }, 60);
    }

    _onPropClick(type) {
      if (this.phase !== 'playing') return;
      this.audio.init();

      if (type === 'cutter' && this.cutterMode) {
        this._setCutterMode(false);
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
          this._renderPropsDOM();
          this._activateProp(type);
        });
        return;
      }

      this._activateProp(type);
    }

    _activateProp(type) {
      if (type === 'cutter') {
        this._setCutterMode(true);
        this.showToast('✂️ 点任意一条被压住的胶带，直接切出来！');
      } else if (type === 'shuffle') {
        const idleTapes = this.tapes.filter((t) => t.state === 'idle');
        if (idleTapes.length <= 1) {
          this.showToast('场上胶带太少，无需洗牌！');
          return;
        }
        this.props.shuffle--;
        this._saveProgress();
        this._renderPropsDOM();
        this._executeShuffle(idleTapes);
      } else if (type === 'magnet') {
        const ok = this._executeMagnet();
        if (ok) {
          this.props.magnet--;
          this._saveProgress();
          this._renderPropsDOM();
        }
      }
    }

    _updateFeverUI() {
      const active = this.feverTime > 0;
      const pct = active ? Math.min(100, (this.feverTime / 6) * 100) : Math.min(100, this.feverCharge);
      if (this.feverFillEl) this.feverFillEl.style.width = `${pct.toFixed(1)}%`;
      if (this.feverLabelEl) this.feverLabelEl.classList.toggle('hidden', !active);
      this.stageWrap.classList.toggle('fever-active', active);
    }

    _executeShuffle(idleTapes) {
      this.audio.playShuffle();
      const pool = idleTapes.map((t) => t.color);
      const freeTapes = idleTapes.filter((t) => isTapePeelable(t, this.tapes));
      const buriedTapes = idleTapes.filter((t) => !isTapePeelable(t, this.tapes));

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

      freeTapes.forEach((t, idx) => {
        t.color = assignedFree[idx];
        t.flipAnim = 1;
      });
      buriedTapes.forEach((t, idx) => {
        t.color = pool[idx];
        t.flipAnim = 1;
      });

      this.showToast('🌀 洗牌完成！顶层已刷新出急需颜色！');
    }

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

      const spoolEl = this.spoolRowEl.querySelector(`[data-spool-slot="${targetIdx}"]`);
      const targetPos = this._elToFx(spoolEl);
      let pulled = 0;

      for (let i = 0; i < this.unlockedTray && needed > 0; i++) {
        const item = this.tray[i];
        if (item && item.state === 'seated' && item.color === sp.color) {
          const slotEl = this.traySlotsEl.querySelector(`[data-tray-slot="${i}"]`);
          const fromPos = this._elToFx(slotEl);
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
        const fromPos = this._logicalToFx(tape.cx, tape.cy);
        this._spawnLightning(fromPos, targetPos, getColorMeta(sp.color).hex);
        this._launchRibbon(fromPos, targetPos, sp.color, { type: 'spool', spoolId: sp.id, slotIdx: targetIdx }, pulled * 0.07);
        pulled++;
      }

      if (pulled > 0) {
        this.audio.playTapePeel(1.1);
        this._renderTrayDOM();
        this._updateHUD();
        this.showToast('🧲 超级磁铁吸满 1 卷！');
        return true;
      }
      return false;
    }

    _executeRevive() {
      this.failModalEl.classList.add('hidden');
      this.phase = 'playing';

      // 拆弹复活：清除炸开那条引信，并把场面上濒临爆炸的其它已上膛引信回调至安全值
      if (this.explodedTape) {
        this.explodedTape.bomb = 0;
        this.explodedTape.bombArmed = false;
        this.explodedTape = null;
      }
      for (let i = 0; i < this.tapes.length; i++) {
        const t = this.tapes[i];
        if (t.state === 'idle' && t.bomb > 0 && t.bomb <= 2) {
          t.bomb = 3;
        }
      }

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
          this._renderSpoolsDOM();
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
            this._renderSpoolsDOM();
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
    }

    _onBoardPointerDown(e) {
      this.audio.init();
      this._ensureCanvasSynced();
      const bRect = this.stageWrap.getBoundingClientRect();
      const lx = (e.clientX - bRect.left - this.boardOffX) / this.boardScale;
      const ly = (e.clientY - bRect.top - this.boardOffY) / this.boardScale;

      if (this.phase === 'film') {
        if (this.filmSnapping) return;
        this.filmDragging = true;
        this.filmMoved = false;
        this.filmLastY = ly;
        return;
      }

      if (this.phase !== 'playing') return;

      this.pointerDown = true;
      this.pointerConsumedTap = false;
      this.swipeLastLx = lx;
      this.swipeLastLy = ly;

      // Pass 1：拇指优先吸附可撕的最顶层胶带（避免蹭到旁边被压住的胶带）
      let hit = null;
      for (let i = this.tapes.length - 1; i >= 0; i--) {
        const t = this.tapes[i];
        if (t.state !== 'idle') continue;
        if (!pointInTape(lx, ly, t, 10)) continue;
        const canPeel = (this.cutterMode || this.feverTime > 0)
          ? (this.cutterMode || getBlockingTapes(t, this.tapes).length === 0)
          : isTapePeelable(t, this.tapes);
        if (canPeel) {
          hit = t;
          break;
        }
      }

      // Pass 2：若没点到可撕胶带，再检测是否点到了被压住/锁定/阻挡的胶带并给出清晰指引
      if (!hit) {
        for (let i = this.tapes.length - 1; i >= 0; i--) {
          const t = this.tapes[i];
          if (t.state !== 'idle') continue;
          if (pointInTape(lx, ly, t, 6)) {
            hit = t;
            break;
          }
        }
      }

      if (!hit) return;
      this.pointerConsumedTap = true;
      this._tryPeelTape(hit, false);
    }

    _tryPeelTape(hit, isSwipe) {
      if (!hit || hit.state !== 'idle' || this.phase !== 'playing') return false;

      const blockers = getBlockingTapes(hit, this.tapes);
      if (blockers.length > 0 && !this.cutterMode) {
        hit.shakeTime = 0.28;
        blockers.forEach((b) => { b.highlightTime = 0.55; });
        this.audio.playBlocked();
        this.showToast('👆 被压住了！先撕上面发亮翘角的胶带');
        return false;
      }

      if (hit.wax > 0 && !this.cutterMode) {
        if (this.feverTime > 0) {
          hit.wax = 0;
          const fxPos = this._logicalToFx(hit.cx, hit.cy);
          this._spawnSparks(fxPos.x, fxPos.y, '#67e8f9', 12);
        } else {
          hit.shakeTime = 0.28;
          this.audio.playBlocked();
          this.showToast('❄️ 冰封锁死！收满任意 1 卷自动震碎冰封');
          return false;
        }
      }

      const arrowBlockers = getArrowBlockers(hit, this.tapes);
      if (arrowBlockers.length > 0 && !this.cutterMode && this.feverTime <= 0) {
        hit.shakeTime = 0.30;
        hit.bonkTime = 0.22;
        arrowBlockers.forEach((b) => { b.highlightTime = 0.55; });
        this.audio.playBlocked();
        this.showToast('🏹 抽拉方向被挡住了！先清掉前方发亮的胶带');
        return false;
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
          return false;
        }
      }

      const usedCutter = this.cutterMode;
      if (usedCutter) {
        this.props.cutter--;
        this._saveProgress();
        this._setCutterMode(false);
        this._renderPropsDOM();
        this.audio.playSnip();
        const fxPos = this._logicalToFx(hit.cx, hit.cy);
        this._spawnSparks(fxPos.x, fxPos.y, '#fde047', 14);
      } else {
        this.audio.playTapePeel(hit.length / 170);
      }

      // 💣 若本身是定时引信贴：拆弹成功！
      if (hit.bomb > 0) {
        hit.bomb = 0;
        hit.bombArmed = false;
        this.combo += 1;
        const fxPos = this._logicalToFx(hit.cx, hit.cy);
        this._spawnSparks(fxPos.x, fxPos.y, '#fde047', 14);
        this.popTexts.push({
          x: fxPos.x,
          y: fxPos.y - 10,
          text: '✂️ 拆弹成功!',
          color: '#d97706',
          life: 0.9,
          maxLife: 0.9
        });
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
      hit.peelIsSwipe = !!isSwipe;
      hit.destInfo = destInfo;
      this._updateHUD();

      // 💣 场面上其它已露头激活的引信贴全部倒数 1 步
      let exploded = null;
      for (let i = 0; i < this.tapes.length; i++) {
        const other = this.tapes[i];
        if (other.id === hit.id) continue;
        if (other.state === 'idle' && other.bomb > 0 && other.bombArmed) {
          other.bomb -= 1;
          const bPos = this._logicalToFx(other.cx, other.cy);
          this._spawnSparks(bPos.x, bPos.y, '#ef4444', 5);
          if (other.bomb <= 0 && !exploded) {
            exploded = other;
          }
        }
      }

      if (exploded) {
        this.phase = 'failed';
        this.explodedTape = exploded;
        this.audio.playFail();
        this.failDescEl.textContent = '💥 定时引信封条炸开缠死啦！看广告拆弹复活继续？';
        this.failModalEl.classList.remove('hidden');
      }
      return true;
    }

    _onBoardPointerMove(e) {
      const bRect = this.stageWrap.getBoundingClientRect();
      const lx = (e.clientX - bRect.left - this.boardOffX) / this.boardScale;
      const ly = (e.clientY - bRect.top - this.boardOffY) / this.boardScale;

      if (this.phase === 'playing' && this.pointerDown && !this.pointerConsumedTap) {
        const dx = lx - this.swipeLastLx;
        const dy = ly - this.swipeLastLy;
        for (let i = this.tapes.length - 1; i >= 0; i--) {
          const t = this.tapes[i];
          if (t.state !== 'idle') continue;
          if (!pointInTape(lx, ly, t, 12)) continue;
          const dirX = Math.cos(t.angle) * t.peelDir;
          const dirY = Math.sin(t.angle) * t.peelDir;
          const dot = dx * dirX + dy * dirY;
          if (dot >= 14) {
            const peeled = this._tryPeelTape(t, true);
            if (peeled) {
              this.pointerConsumedTap = true;
              break;
            }
          }
        }
        return;
      }

      if (this.phase !== 'film' || !this.filmDragging || this.filmSnapping) return;
      const dym = ly - this.filmLastY;
      this.filmLastY = ly;

      if (dym > 1.5) {
        this.filmMoved = true;
      }

      if (dym > 0.2) {
        const deltaProg = dym / (LOGICAL_H * 0.72);
        this.filmProgress = Math.min(1, this.filmProgress + deltaProg);
        this.audio.updateFilmPeel(Math.min(1, dym / 14));
        if (Math.random() < 0.35) this.audio.vibrate(8);

        if (this.filmProgress >= 0.38) {
          this.filmDragging = false;
          this.filmSnapping = true;
          this.audio.playTapePeel(1.3);
        }
      } else {
        this.audio.updateFilmPeel(0);
      }
    }

    _onBoardPointerUp() {
      this.pointerDown = false;
      this.pointerConsumedTap = false;
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
    }

    _launchRibbon(fromPos, toPos, color, destInfo, delay = 0, isSwipe = false) {
      const midX = (fromPos.x + toPos.x) * 0.5 + (Math.random() - 0.5) * 70;
      const midY = Math.min(fromPos.y, toPos.y) - 45 - Math.random() * 25;
      this.ribbons.push({
        from: fromPos,
        ctrl: { x: midX, y: midY },
        to: toPos,
        color,
        destInfo,
        delay,
        isSwipe,
        t: 0,
        dur: 0.28
      });
    }

    _onRibbonArrive(ribbon) {
      const dest = ribbon.destInfo;
      if (dest.type === 'spool') {
        const sp = this.activeSpools[dest.slotIdx];
        if (!sp || sp.id !== dest.spoolId) return;
        sp.filled = Math.min(3, sp.filled + 1);
        this.combo++;
        if (this.combo > this.maxCombo) this.maxCombo = this.combo;
        this.audio.playMatch(this.combo);

        if (this.feverTime <= 0) {
          this.feverCharge = Math.min(100, this.feverCharge + (ribbon.isSwipe ? 34 : 22));
          if (this.feverCharge >= 100) {
            this.feverTime = 6.0;
            this.feverCharge = 0;
            this.showToast('🔥 狂暴手撕开启！6秒内无视冰封与箭头阻挡！');
          }
          this._updateFeverUI();
        }

        this._renderSpoolsDOM();
        const spoolEl = this.spoolRowEl.querySelector(`[data-spool-slot="${dest.slotIdx}"]`);
        if (spoolEl) {
          spoolEl.classList.remove('bump');
          void spoolEl.offsetWidth;
          spoolEl.classList.add('bump');
        }

        const pos = ribbon.to;
        this._spawnSparks(pos.x, pos.y, getColorMeta(ribbon.color).hex, 8);
        if (this.combo >= 2) {
          this.popTexts.push({
            x: pos.x,
            y: pos.y + 18,
            text: `COMBO x${this.combo}!`,
            color: getColorMeta(ribbon.color).dark,
            life: 0.85,
            maxLife: 0.85
          });
        }

        if (sp.filled >= 3 && !sp.popping) {
          sp.popping = true;
          this.audio.playSpoolComplete();
          this._renderSpoolsDOM();
          this._spawnConfetti(pos.x, pos.y, 18, getColorMeta(sp.color).hex);
          this.popTexts.push({
            x: pos.x,
            y: pos.y - 10,
            text: '打包成功! ✨',
            color: '#059669',
            life: 0.95,
            maxLife: 0.95
          });

          // ❄️ 收满任意 1 卷：震碎场上所有冰封胶带 1 层锁！
          let shatteredAny = false;
          for (let k = 0; k < this.tapes.length; k++) {
            const wt = this.tapes[k];
            if (wt.state === 'idle' && wt.wax > 0) {
              wt.wax = Math.max(0, wt.wax - 1);
              wt.flipAnim = 0.6;
              shatteredAny = true;
              const wPos = this._logicalToFx(wt.cx, wt.cy);
              this._spawnSparks(wPos.x, wPos.y, '#67e8f9', 10);
            }
          }
          if (shatteredAny) {
            this.showToast('❄️ 打包震波击碎了冰封锁！');
          }

          const finishedId = sp.id;
          const sIdx = dest.slotIdx;
          setTimeout(() => {
            if (this.activeSpools[sIdx] && this.activeSpools[sIdx].id === finishedId) {
              this._spawnSpoolAt(sIdx);
              this._renderSpoolsDOM();
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
          if (this.feverTime <= 0) {
            this.feverCharge = Math.max(0, this.feverCharge - 25);
            this._updateFeverUI();
          }
          this.audio.playTrayStick();
          this._renderTrayDOM();
          this._sweepTrayToSpools();
          this._checkWinOrFail();
        }
      }
    }

    _sweepTrayToSpools() {
      let moved = 0;
      for (let tIdx = 0; tIdx < this.unlockedTray; tIdx++) {
        const item = this.tray[tIdx];
        if (!item || item.state !== 'seated') continue;

        for (let sIdx = 0; sIdx < this.unlockedSpools; sIdx++) {
          const sp = this.activeSpools[sIdx];
          if (sp && !sp.popping && sp.color === item.color && sp.reserved < 3) {
            const slotEl = this.traySlotsEl.querySelector(`[data-tray-slot="${tIdx}"]`);
            const spoolEl = this.spoolRowEl.querySelector(`[data-spool-slot="${sIdx}"]`);
            const fromPos = this._elToFx(slotEl);
            const toPos = this._elToFx(spoolEl);

            this.tray[tIdx] = null;
            sp.reserved++;
            this._launchRibbon(fromPos, toPos, sp.color, { type: 'spool', spoolId: sp.id, slotIdx: sIdx }, moved * 0.065);
            moved++;
            break;
          }
        }
      }
      if (moved > 0) {
        this._renderTrayDOM();
      }
      return moved;
    }

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
        if (seatedCount >= this.unlockedTray) {
          if (this._sweepTrayToSpools() === 0) {
            this.phase = 'failed';
            this.audio.playFail();
            const remain = this.tapes.filter((t) => t.state === 'idle').length;
            this.failDescEl.textContent = `场上只剩 ${remain} 条胶带了，马上就能揭开保护膜彩蛋！`;
            this.failModalEl.classList.remove('hidden');
          }
        }
      }
    }

    _enterFilmPhase() {
      this.phase = 'film';
      this.filmProgress = 0.06;
      this.filmDragging = false;
      this.filmSnapping = false;
      this._setCutterMode(false);
      this.filmHintEl.classList.remove('hidden');
      this.audio.playMatch(6);
      this.showToast('✨ 胶带全清！下滑撕开最后的高光保护膜！');
    }

    _triggerWin() {
      this.phase = 'won';
      this.filmHintEl.classList.add('hidden');
      this.audio.playWin();

      const pRect = this.phoneShell.getBoundingClientRect();
      this._spawnConfetti(pRect.width * 0.5, pRect.height * 0.42, 65);

      document.getElementById('prize-icon').textContent = this.theme.prizeIcon;
      document.getElementById('prize-name').textContent = this.theme.prizeName;
      document.getElementById('prize-quote').textContent = this.theme.prizeQuote;
      document.getElementById('win-tapes').textContent = `${this.totalTapesInLevel} 条`;
      document.getElementById('win-combo').textContent = `x${Math.max(1, this.maxCombo)}`;
      const beat = Math.min(99, 86 + this.levelIndex * 3 + Math.min(8, this.maxCombo));
      document.getElementById('win-rank').textContent = `${beat}%`;

      setTimeout(() => {
        this.winModalEl.classList.remove('hidden');
      }, 360);
    }

    _spawnSparks(x, y, color, count) {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const spd = 65 + Math.random() * 140;
        this.particles.push({
          x, y,
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd - 35,
          size: 3 + Math.random() * 4,
          color,
          life: 0.45 + Math.random() * 0.25,
          maxLife: 0.7,
          rot: Math.random() * 6,
          vrot: (Math.random() - 0.5) * 14,
          shape: 'rect'
        });
      }
    }

    _spawnConfetti(x, y, count, themeColor = null) {
      const colors = themeColor
        ? [themeColor, '#f4b400', '#ffffff', '#06d6a0']
        : ['#ef476f', '#118ab2', '#f4b400', '#06d6a0', '#8338ec', '#fb5607'];
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const spd = 90 + Math.random() * 240;
        this.particles.push({
          x, y,
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd - 110,
          size: 5 + Math.random() * 6,
          color: colors[i % colors.length],
          life: 0.9 + Math.random() * 0.7,
          maxLife: 1.6,
          rot: Math.random() * 6,
          vrot: (Math.random() - 0.5) * 16,
          shape: 'confetti'
        });
      }
    }

    _spawnLightning(from, to, color) {
      this.lightningArcs.push({ from, to, color, life: 0.28, maxLife: 0.28 });
    }

    _loop(now) {
      const dt = Math.min(0.05, (now - this.lastTime) / 1000);
      this.lastTime = now;

      this._update(dt);
      this._renderBoard(now * 0.001);
      this._renderFx();

      requestAnimationFrame((t) => this._loop(t));
    }

    _update(dt) {
      if (this.feverTime > 0 && this.phase === 'playing') {
        this.feverTime = Math.max(0, this.feverTime - dt);
        this._updateFeverUI();
      }

      for (let i = 0; i < this.tapes.length; i++) {
        const t = this.tapes[i];
        if (t.shakeTime > 0) t.shakeTime = Math.max(0, t.shakeTime - dt);
        if (t.bonkTime > 0) t.bonkTime = Math.max(0, t.bonkTime - dt);
        if (t.highlightTime > 0) t.highlightTime = Math.max(0, t.highlightTime - dt);
        if (t.flipAnim > 0) t.flipAnim = Math.max(0, t.flipAnim - dt * 3.2);

        if (t.state === 'idle') {
          const zBlocked = getBlockingTapes(t, this.tapes).length > 0;
          if (t.mystery && !t.revealed && !zBlocked) {
            t.revealed = true;
            t.flipAnim = 1;
            const fxPos = this._logicalToFx(t.cx, t.cy);
            this._spawnSparks(fxPos.x, fxPos.y, '#e2e8f0', 10);
          }
          if (t.bomb > 0 && !t.bombArmed && !zBlocked && (t.wax || 0) <= 0) {
            t.bombArmed = true;
          }
        }

        if (t.state === 'peeling') {
          t.peelProgress += dt * (t.peelIsSwipe ? 5.8 : 4.4);
          if (Math.random() < 0.55) {
            const p = Math.min(1, t.peelProgress);
            const localX = (t.length * 0.5 - p * t.length) * t.peelDir;
            const wx = t.cx + Math.cos(t.angle) * localX;
            const wy = t.cy + Math.sin(t.angle) * localX;
            const fxPos = this._logicalToFx(wx, wy);
            this._spawnSparks(fxPos.x, fxPos.y, getColorMeta(t.color).light, 1);
          }

          if (t.peelProgress >= 1) {
            t.state = 'done';
            const tailLocalX = -t.length * 0.4 * t.peelDir;
            const fromPos = this._logicalToFx(
              t.cx + Math.cos(t.angle) * tailLocalX,
              t.cy + Math.sin(t.angle) * tailLocalX
            );
            let targetEl = null;
            if (t.destInfo.type === 'spool') {
              targetEl = this.spoolRowEl.querySelector(`[data-spool-slot="${t.destInfo.slotIdx}"]`);
            } else {
              targetEl = this.traySlotsEl.querySelector(`[data-tray-slot="${t.destInfo.trayIdx}"]`);
            }
            const toPos = targetEl ? this._elToFx(targetEl) : { x: 180, y: 80 };
            this._launchRibbon(fromPos, toPos, t.color, t.destInfo, 0, !!t.peelIsSwipe);
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
        p.vy += (p.shape === 'confetti' ? 360 : 280) * dt;
        p.vx *= 0.985;
        p.rot += p.vrot * dt;
      }

      for (let i = this.popTexts.length - 1; i >= 0; i--) {
        const pt = this.popTexts[i];
        pt.life -= dt;
        pt.y -= 34 * dt;
        if (pt.life <= 0) this.popTexts.splice(i, 1);
      }

      for (let i = this.lightningArcs.length - 1; i >= 0; i--) {
        this.lightningArcs[i].life -= dt;
        if (this.lightningArcs[i].life <= 0) this.lightningArcs.splice(i, 1);
      }
    }

    _renderBoard(timeSec) {
      this._ensureCanvasSynced();
      const ctx = this.boardCtx;
      ctx.save();
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.boardCanvas.width / this.dpr, this.boardCanvas.height / this.dpr);

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

      ctx.restore();
    }

    _drawBaseCard(ctx) {
      const padX = 10;
      const padY = 10;
      const w = LOGICAL_W - padX * 2;
      const h = LOGICAL_H - padY * 2;
      const r = 20;

      ctx.save();
      ctx.shadowColor = 'rgba(42, 36, 31, 0.14)';
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 6;
      this._roundRectPath(ctx, padX, padY, w, h, r);
      ctx.fillStyle = this.theme.cardBg;
      ctx.fill();
      ctx.restore();

      ctx.save();
      this._roundRectPath(ctx, padX, padY, w, h, r);
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

      const isDarkCard = !!(this.theme.isDark || this.theme.cardBg === '#1e293b');

      ctx.fillStyle = isDarkCard ? '#f8fafc' : '#3a2f26';
      ctx.font = '800 16px -apple-system, "PingFang SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(this.theme.cardLabel, LOGICAL_W * 0.5, padY + 46);

      ctx.font = '68px sans-serif';
      ctx.fillText(this.theme.prizeIcon, LOGICAL_W * 0.5, LOGICAL_H * 0.5 + 16);

      ctx.font = '800 13.5px -apple-system, "PingFang SC", sans-serif';
      ctx.fillStyle = isDarkCard ? '#bae6fd' : '#574637';
      ctx.fillText(this.theme.prizeName, LOGICAL_W * 0.5, padY + h - 42);

      ctx.save();
      ctx.translate(padX + w - 58, padY + 62);
      ctx.rotate(0.24);
      ctx.strokeStyle = this.theme.cardAccent;
      ctx.lineWidth = 2.5;
      this._roundRectPath(ctx, -34, -14, 68, 28, 6);
      ctx.stroke();
      ctx.fillStyle = this.theme.cardAccent;
      ctx.font = '900 12px -apple-system, "PingFang SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(this.theme.cardStamp, 0, 4);
      ctx.restore();

      ctx.restore();
    }

    _drawTape(ctx, tape, blocked, timeSec) {
      const meta = getColorMeta(tape.color);
      const L = tape.length;
      const W = tape.width;
      const p = tape.state === 'peeling' ? Math.min(1, tape.peelProgress) : 0;

      ctx.save();
      ctx.translate(tape.cx, tape.cy);

      if (tape.shakeTime > 0) {
        const s = Math.sin(tape.shakeTime * 55) * 4.5 * (tape.shakeTime / 0.28);
        ctx.translate(s, 0);
      }

      ctx.rotate(tape.angle);

      if (tape.flipAnim > 0) {
        const sy = Math.max(0.15, Math.abs(Math.cos(tape.flipAnim * Math.PI)));
        ctx.scale(1, sy);
      }

      if (tape.peelDir < 0) ctx.scale(-1, 1);

      // 🏹 箭头被挡住时向前顶撞回弹动画
      if (tape.bonkTime > 0) {
        const bonkOffset = Math.sin((1 - tape.bonkTime / 0.22) * Math.PI) * 9;
        ctx.translate(bonkOffset, 0);
      }

      const isMysteryHidden = !!(tape.mystery && !tape.revealed);
      const creaseX = L * 0.5 - p * L;
      const remainLen = creaseX - (-L * 0.5);

      if (remainLen > 2) {
        ctx.save();
        ctx.shadowColor = blocked ? 'rgba(25, 18, 12, 0.20)' : 'rgba(25, 18, 12, 0.34)';
        ctx.shadowBlur = blocked ? 4 : 9;
        ctx.shadowOffsetX = blocked ? 1 : 2;
        ctx.shadowOffsetY = blocked ? 2 : 5;

        this._traceTapeSegmentPath(ctx, -L * 0.5, -W * 0.5, remainLen, W, true, p === 0);
        if (isMysteryHidden) {
          const foilGrad = ctx.createLinearGradient(-L * 0.5, -W * 0.5, L * 0.5, W * 0.5);
          foilGrad.addColorStop(0, '#64748b');
          foilGrad.addColorStop(0.5, '#cbd5e1');
          foilGrad.addColorStop(1, '#475569');
          ctx.fillStyle = foilGrad;
        } else {
          ctx.fillStyle = meta.hex;
        }
        ctx.globalAlpha = blocked ? 0.88 : 0.94;
        ctx.fill();
        ctx.restore();

        ctx.save();
        this._traceTapeSegmentPath(ctx, -L * 0.5, -W * 0.5, remainLen, W, true, p === 0);
        ctx.clip();

        const grad = ctx.createLinearGradient(0, -W * 0.5, 0, W * 0.5);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.36)');
        grad.addColorStop(0.26, 'rgba(255, 255, 255, 0.08)');
        grad.addColorStop(0.82, 'rgba(0, 0, 0, 0.06)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0.16)');
        ctx.fillStyle = grad;
        ctx.fillRect(-L * 0.5, -W * 0.5, remainLen, W);

        if (!isMysteryHidden) {
          this._drawTapeTexture(ctx, -L * 0.5, -W * 0.5, remainLen, W, meta);
        }

        // 🏹 单向箭头提示（3 个流动白色 »）
        if (tape.arrow && !isMysteryHidden && remainLen > 42) {
          const shift = (timeSec * 36) % 18;
          ctx.save();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
          ctx.lineWidth = 2.2;
          ctx.lineCap = 'round';
          for (let ax = -L * 0.5 + 22 + shift; ax < -L * 0.5 + remainLen - 20; ax += 26) {
            ctx.beginPath();
            ctx.moveTo(ax - 5, -6);
            ctx.lineTo(ax + 2, 0);
            ctx.lineTo(ax - 5, 6);
            ctx.stroke();
          }
          ctx.restore();
        }

        if (remainLen > 34) {
          if (isMysteryHidden) {
            ctx.fillStyle = '#0f172a';
            ctx.font = '900 15px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('❓', -L * 0.5 + remainLen * 0.5, 0.5);
          } else if (!tape.wax && !tape.bomb) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
            ctx.font = '900 12px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(meta.mark, -L * 0.5 + remainLen * 0.5, 0.5);
          }
        }

        // ❄️ 冰封火漆锁视觉条
        if (tape.wax > 0 && remainLen > 44) {
          const bx = -L * 0.5 + remainLen * 0.5;
          ctx.save();
          this._roundRectPath(ctx, bx - 24, -W * 0.5 + 4, 48, W - 8, 7);
          ctx.fillStyle = 'rgba(186, 230, 253, 0.92)';
          ctx.fill();
          ctx.strokeStyle = '#0284c7';
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.fillStyle = '#0369a1';
          ctx.font = '900 13px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`❄️${tape.wax}`, bx, 0.5);
          ctx.restore();
        }

        // 💣 倒计时引信胶囊
        if (tape.bomb > 0 && remainLen > 44) {
          const bx = -L * 0.5 + remainLen * 0.5;
          const pulse = tape.bombArmed ? (0.65 + 0.35 * Math.sin(timeSec * 12)) : 0.7;
          ctx.save();
          this._roundRectPath(ctx, bx - 25, -W * 0.5 + 4, 50, W - 8, 8);
          ctx.fillStyle = '#18181b';
          ctx.fill();
          ctx.strokeStyle = tape.bombArmed ? `rgba(239, 68, 68, ${pulse})` : '#a1a1aa';
          ctx.lineWidth = tape.bombArmed ? 2.6 : 1.5;
          ctx.stroke();
          ctx.fillStyle = tape.bomb <= 2 && tape.bombArmed ? '#fca5a5' : '#fef08a';
          ctx.font = '900 13px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`💣${tape.bomb}`, bx, 0.5);
          ctx.restore();
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

      if (p === 0 && !isMysteryHidden && (!blocked || this.cutterMode) && (tape.wax <= 0 || this.feverTime > 0)) {
        const breath = Math.sin(timeSec * 4.2 + tape.z * 0.8) * 1.8;
        const curlSize = 15 + breath;
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
    }

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
    }

    _drawTapeTexture(ctx, x, y, w, h, meta) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.lineWidth = 2;

      if (meta.pattern === 'stripe') {
        for (let sx = x - h; sx < x + w + h; sx += 14) {
          ctx.beginPath();
          ctx.moveTo(sx, y);
          ctx.lineTo(sx + h * 0.7, y + h);
          ctx.stroke();
        }
      } else if (meta.pattern === 'grid') {
        ctx.lineWidth = 1;
        for (let sx = x; sx < x + w; sx += 12) {
          ctx.beginPath();
          ctx.moveTo(sx, y);
          ctx.lineTo(sx, y + h);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.moveTo(x, y + h * 0.5);
        ctx.lineTo(x + w, y + h * 0.5);
        ctx.stroke();
      } else if (meta.pattern === 'dots') {
        for (let sx = x + 10; sx < x + w - 6; sx += 16) {
          ctx.beginPath();
          ctx.arc(sx, y + h * 0.28, 2, 0, Math.PI * 2);
          ctx.arc(sx + 8, y + h * 0.72, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (meta.pattern === 'vert') {
        for (let sx = x + 8; sx < x + w; sx += 14) {
          ctx.beginPath();
          ctx.moveTo(sx, y + 4);
          ctx.lineTo(sx, y + h - 4);
          ctx.stroke();
        }
      } else if (meta.pattern === 'cross') {
        ctx.lineWidth = 1.2;
        for (let sx = x - h; sx < x + w + h; sx += 18) {
          ctx.beginPath();
          ctx.moveTo(sx, y);
          ctx.lineTo(sx + h, y + h);
          ctx.moveTo(sx + h, y);
          ctx.lineTo(sx, y + h);
          ctx.stroke();
        }
      } else {
        ctx.beginPath();
        for (let sx = x; sx < x + w; sx += 14) {
          ctx.moveTo(sx, y + h * 0.5);
          ctx.lineTo(sx + 7, y + h * 0.25);
          ctx.lineTo(sx + 14, y + h * 0.5);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

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
      curlGrad.addColorStop(0.3, 'rgba(224, 242, 254, 0.88)');
      curlGrad.addColorStop(1, 'rgba(186, 230, 253, 0.70)');

      this._roundRectPath(ctx, padX - 4, peelY, w + 8, flapH, 12);
      ctx.fillStyle = curlGrad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.lineWidth = 2;
      ctx.stroke();

      const tabW = 156;
      const tabH = 30;
      this._roundRectPath(ctx, LOGICAL_W * 0.5 - tabW * 0.5, peelY + flapH - 12, tabW, tabH, 15);
      ctx.fillStyle = '#f59e0b';
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '800 12px -apple-system, "PingFang SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('👇 点一下或下滑撕膜', LOGICAL_W * 0.5, peelY + flapH + 7);
      ctx.restore();
    }

    _renderFx() {
      const ctx = this.fxCtx;
      ctx.save();
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.fxCanvas.width / this.dpr, this.fxCanvas.height / this.dpr);

      for (let i = 0; i < this.lightningArcs.length; i++) {
        const arc = this.lightningArcs[i];
        const alpha = arc.life / arc.maxLife;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = arc.color;
        ctx.lineWidth = 3.5;
        ctx.shadowColor = arc.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(arc.from.x, arc.from.y);
        const mx = (arc.from.x + arc.to.x) * 0.5 + (Math.random() - 0.5) * 28;
        const my = (arc.from.y + arc.to.y) * 0.5 + (Math.random() - 0.5) * 28;
        ctx.quadraticCurveTo(mx, my, arc.to.x, arc.to.y);
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
        const scale = 1 - e * 0.32;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(e * Math.PI * 1.4);
        ctx.scale(scale, scale);
        ctx.shadowColor = 'rgba(0, 0, 0, 0.24)';
        ctx.shadowBlur = 8;
        this._roundRectPath(ctx, -26, -12, 52, 24, 6);
        ctx.fillStyle = meta.hex;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }

      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        const alpha = Math.min(1, p.life / (p.maxLife * 0.45));
        ctx.save();
        ctx.globalAlpha = alpha;
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
        const alpha = Math.min(1, pt.life / (pt.maxLife * 0.4));
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = '900 15px -apple-system, "PingFang SC", sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#ffffff';
        ctx.strokeText(pt.text, pt.x, pt.y);
        ctx.fillStyle = pt.color;
        ctx.fillText(pt.text, pt.x, pt.y);
        ctx.restore();
      }

      ctx.restore();
    }

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
  }

  window.addEventListener('DOMContentLoaded', () => {
    global.peelGameApp = new PeelGameApp();
  });
})(window);
