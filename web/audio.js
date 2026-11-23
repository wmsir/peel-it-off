/**
 * PopAudio — 《捏个痛快！》程序化 ASMR 音效 & 三套无尽氛围环境音引擎（零外部音频文件）
 * 严格遵循设计规范：
 * - 五声音阶划音（无刺耳半音碰撞），每个“噗”音高/音色微随机（听 1 小时也不腻）
 * - 独立控制声音与振动开关；划不成线静默回弹，无错误惩罚音
 * - 支持 AndroidBridge.vibrate 与浏览器 navigator.vibrate
 */
(function (global) {
  'use strict';

  const PENTATONIC = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98, 1760.0];

  class PopAudio {
    constructor() {
      this.ctx = null;
      this.noiseBuffer = null;
      this.enabled = true;
      this.hapticsEnabled = true;
      this.skinId = 'classic';
      this.soundPack = 'classic'; // 'classic' | 'piano' | 'rain' | 'white'
      this.ambientMode = 'off';
      this.ambientNodes = null;
      this.ambientTimer = null;
      this.filmNode = null;
      this.filmGain = null;
      this.filmFilter = null;
    }

    init() {
      if (!this.ctx) {
        const AudioCtx = global.AudioContext || global.webkitAudioContext;
        if (!AudioCtx) return;
        this.ctx = new AudioCtx();
        this._buildNoiseBuffer();
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    }

    _buildNoiseBuffer() {
      const sr = this.ctx.sampleRate || 44100;
      const len = Math.floor(sr * 1.5);
      const buf = this.ctx.createBuffer(1, len, sr);
      const data = buf.getChannelData(0);
      let b0 = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.78 * b0 + 0.22 * white;
        data[i] = white * 0.55 + b0 * 0.45;
      }
      this.noiseBuffer = buf;
    }

    setEnabled(flag) {
      this.enabled = !!flag;
      if (!this.enabled) {
        this.stopFilmPeel();
        this.setAmbientPack('off');
      }
    }

    setHapticsEnabled(flag) {
      this.hapticsEnabled = !!flag;
    }

    setSkin(skinId) {
      this.skinId = skinId || 'classic';
    }

    vibrate(pattern) {
      if (!this.hapticsEnabled) return;
      try {
        if (global.AndroidBridge && typeof global.AndroidBridge.vibrate === 'function') {
          const arr = Array.isArray(pattern) ? pattern : [pattern];
          global.AndroidBridge.vibrate(arr.join(','));
          return;
        }
        if (navigator && typeof navigator.vibrate === 'function') {
          navigator.vibrate(pattern);
        }
      } catch (_) {}
    }

    playPressFirst() {
      this.vibrate(8);
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sine';
        const jitter = 0.96 + Math.random() * 0.08;
        osc.frequency.setValueAtTime(220 * jitter, now);
        osc.frequency.exponentialRampToValueAtTime(340 * jitter, now + 0.055);
        g.gain.setValueAtTime(0.001, now);
        g.gain.linearRampToValueAtTime(0.085, now + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        osc.connect(g);
        g.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.07);
      } catch (_) {}
    }

    playSlideNote(stepIdx, isBack = false) {
      this.vibrate(6);
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const freqBase = PENTATONIC[Math.min(PENTATONIC.length - 1, Math.max(0, stepIdx))];
        const jitter = 0.992 + Math.random() * 0.016;
        const freq = (isBack ? freqBase * 0.86 : freqBase) * jitter;

        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        if (this.skinId === 'candy' || this.ambientMode === 'piano') {
          osc.type = 'sine';
        } else if (this.skinId === 'ticket') {
          osc.type = 'square';
        } else {
          osc.type = 'triangle';
        }
        osc.frequency.setValueAtTime(freq, now);
        g.gain.setValueAtTime(0.001, now);
        g.gain.linearRampToValueAtTime(this.skinId === 'ticket' ? 0.06 : 0.13, now + 0.008);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(g);
        g.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.13);
      } catch (_) {}
    }

    /** 捏爆“噗”声 = 短促噪声瞬态爆发 + 低频弹性膜音（微随机音色） */
    playPopSingle(seqIdx = 0) {
      this.vibrate(12);
      if (!this.enabled) return;
      this.init();
      if (!this.ctx || !this.noiseBuffer) return;
      try {
        const now = this.ctx.currentTime;
        const micro = 0.94 + Math.random() * 0.12;
        const stepRise = 1 + Math.min(seqIdx, 12) * 0.045;

        // 1) 短促薄膜破裂声
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        const baseFreq = this.skinId === 'ticket' ? 2900 : (this.skinId === 'jelly' ? 1450 : 2100);
        bp.frequency.setValueAtTime(baseFreq * stepRise * micro, now);
        bp.Q.setValueAtTime(this.skinId === 'jelly' ? 2.4 : 1.7, now);
        const ng = this.ctx.createGain();
        ng.gain.setValueAtTime(0.28, now);
        ng.gain.exponentialRampToValueAtTime(0.001, now + 0.042);
        src.connect(bp);
        bp.connect(ng);
        ng.connect(this.ctx.destination);
        src.start(now, Math.random() * 0.8);
        src.stop(now + 0.05);

        // 2) 气泡弹“噗”基音
        const osc = this.ctx.createOscillator();
        const og = this.ctx.createGain();
        osc.type = this.skinId === 'candy' ? 'triangle' : 'sine';
        const pitch = (this.skinId === 'candy' ? 520 : 390) * stepRise * micro;
        osc.frequency.setValueAtTime(pitch, now);
        osc.frequency.exponentialRampToValueAtTime(115 * micro, now + 0.062);
        og.gain.setValueAtTime(0.001, now);
        og.gain.linearRampToValueAtTime(0.26, now + 0.006);
        og.gain.exponentialRampToValueAtTime(0.001, now + 0.072);
        osc.connect(og);
        og.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.08);
      } catch (_) {}
    }

    playInflate() {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sine';
        const m = 0.95 + Math.random() * 0.1;
        osc.frequency.setValueAtTime(260 * m, now);
        osc.frequency.exponentialRampToValueAtTime(480 * m, now + 0.075);
        g.gain.setValueAtTime(0.001, now);
        g.gain.linearRampToValueAtTime(0.09, now + 0.014);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
        osc.connect(g);
        g.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.095);
      } catch (_) {}
    }

    playChainWave(waveIdx = 0, count = 1) {
      const vibMs = Math.min(34, 14 + waveIdx * 4 + Math.min(6, count));
      this.vibrate(vibMs);
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        // 每波升一个半音，更重更爽的“啶”
        const base = 440 * Math.pow(2, Math.min(14, waveIdx) / 12);
        const osc = this.ctx.createOscillator();
        const oscSub = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(base, now);
        osc.frequency.exponentialRampToValueAtTime(base * 1.18, now + 0.09);

        oscSub.type = 'sine';
        oscSub.frequency.setValueAtTime(160 + Math.min(6, waveIdx) * 16, now);
        oscSub.frequency.exponentialRampToValueAtTime(75, now + 0.11);

        const subG = this.ctx.createGain();
        subG.gain.setValueAtTime(0.24, now);
        subG.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

        g.gain.setValueAtTime(0.001, now);
        g.gain.linearRampToValueAtTime(0.22, now + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.17);

        osc.connect(g);
        oscSub.connect(subG);
        subG.connect(this.ctx.destination);
        g.connect(this.ctx.destination);
        osc.start(now);
        oscSub.start(now);
        osc.stop(now + 0.18);
        oscSub.stop(now + 0.13);
      } catch (_) {}
    }

    playMegaChain() {
      this.vibrate(40);
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const chord = [523.25, 659.25, 783.99, 987.77, 1318.51];
        chord.forEach((f, i) => {
          const t = now + i * 0.045;
          const osc = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          osc.type = i % 2 === 0 ? 'triangle' : 'sine';
          osc.frequency.setValueAtTime(f, t);
          g.gain.setValueAtTime(0.001, t);
          g.gain.linearRampToValueAtTime(0.18, t + 0.018);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
          osc.connect(g);
          g.connect(this.ctx.destination);
          osc.start(t);
          osc.stop(t + 0.48);
        });
      } catch (_) {}
    }

    playIceMelt() {
      this.vibrate(10);
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        [1568, 2093].forEach((f, idx) => {
          const osc = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(f, now + idx * 0.03);
          g.gain.setValueAtTime(0.12, now + idx * 0.03);
          g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.03 + 0.15);
          osc.connect(g);
          g.connect(this.ctx.destination);
          osc.start(now + idx * 0.03);
          osc.stop(now + idx * 0.03 + 0.16);
        });
      } catch (_) {}
    }

    playTapeTear() {
      this.vibrate([10, 14, 12]);
      if (!this.enabled) return;
      this.init();
      if (!this.ctx || !this.noiseBuffer) return;
      try {
        const now = this.ctx.currentTime;
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(2400, now);
        bp.frequency.exponentialRampToValueAtTime(4800, now + 0.14);
        bp.Q.setValueAtTime(1.4, now);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.24, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        src.connect(bp);
        bp.connect(g);
        g.connect(this.ctx.destination);
        src.start(now, Math.random() * 0.3);
        src.stop(now + 0.16);
      } catch (_) {}
    }

    playLowMoves() {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(392, now + 0.09);
        g.gain.setValueAtTime(0.08, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.connect(g);
        g.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.24);
      } catch (_) {}
    }

    updateFilmPeel(speedNorm) {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx || !this.noiseBuffer) return;
      const now = this.ctx.currentTime;
      if (!this.filmNode) {
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        src.loop = true;
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(3100, now);
        bp.Q.setValueAtTime(1.2, now);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.001, now);
        src.connect(bp);
        bp.connect(g);
        g.connect(this.ctx.destination);
        src.start(now);
        this.filmNode = src;
        this.filmFilter = bp;
        this.filmGain = g;
      }
      const clamped = Math.max(0, Math.min(1, speedNorm));
      this.filmFilter.frequency.setTargetAtTime(2100 + clamped * 3300, now, 0.03);
      this.filmGain.gain.setTargetAtTime(0.02 + clamped * 0.24, now, 0.03);
    }

    stopFilmPeel() {
      if (this.filmNode && this.ctx) {
        const now = this.ctx.currentTime;
        try {
          this.filmGain.gain.setTargetAtTime(0.0001, now, 0.03);
          this.filmNode.stop(now + 0.08);
        } catch (_) {}
      }
      this.filmNode = null;
      this.filmFilter = null;
      this.filmGain = null;
    }

    playWin() {
      this.stopFilmPeel();
      this.vibrate([24, 30, 48]);
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const melody = [523.25, 659.25, 783.99, 1046.5, 1318.51];
        melody.forEach((f, i) => {
          const t = now + i * 0.07;
          const osc = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          osc.type = i === melody.length - 1 ? 'triangle' : 'sine';
          osc.frequency.setValueAtTime(f, t);
          g.gain.setValueAtTime(0.001, t);
          g.gain.linearRampToValueAtTime(0.2, t + 0.018);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.48);
          osc.connect(g);
          g.connect(this.ctx.destination);
          osc.start(t);
          osc.stop(t + 0.5);
        });
      } catch (_) {}
    }

    /** 无尽模式三套环境解压声景（钢琴音 / 雨声 / 白噪音），只改氛围不打扰手速 */
    setAmbientPack(mode) {
      if (this.ambientTimer) {
        clearInterval(this.ambientTimer);
        this.ambientTimer = null;
      }
      if (this.ambientNodes && this.ctx) {
        try {
          const now = this.ctx.currentTime;
          this.ambientNodes.gain.gain.setTargetAtTime(0.0001, now, 0.08);
          this.ambientNodes.src.stop(now + 0.25);
        } catch (_) {}
        this.ambientNodes = null;
      }

      this.ambientMode = mode || 'off';
      if (!this.enabled || this.ambientMode === 'off') return;
      this.init();
      if (!this.ctx || !this.noiseBuffer) return;

      try {
        const now = this.ctx.currentTime;
        if (this.ambientMode === 'rain' || this.ambientMode === 'white') {
          const src = this.ctx.createBufferSource();
          src.buffer = this.noiseBuffer;
          src.loop = true;
          const lp = this.ctx.createBiquadFilter();
          lp.type = this.ambientMode === 'rain' ? 'bandpass' : 'lowpass';
          lp.frequency.setValueAtTime(this.ambientMode === 'rain' ? 1650 : 780, now);
          if (this.ambientMode === 'rain') lp.Q.setValueAtTime(0.65, now);
          const g = this.ctx.createGain();
          g.gain.setValueAtTime(0.001, now);
          g.gain.linearRampToValueAtTime(this.ambientMode === 'rain' ? 0.055 : 0.045, now + 0.4);
          src.connect(lp);
          lp.connect(g);
          g.connect(this.ctx.destination);
          src.start(now);
          this.ambientNodes = { src, gain: g };
        }

        if (this.ambientMode === 'piano' || this.ambientMode === 'rain') {
          this.ambientTimer = setInterval(() => {
            if (!this.enabled || !this.ctx || this.ambientMode === 'off') return;
            const t = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            osc.type = 'sine';
            const f = PENTATONIC[Math.floor(Math.random() * 6)] * (this.ambientMode === 'rain' ? 1.5 : 0.5);
            osc.frequency.setValueAtTime(f, t);
            g.gain.setValueAtTime(0.001, t);
            g.gain.linearRampToValueAtTime(this.ambientMode === 'rain' ? 0.025 : 0.042, t + 0.03);
            g.gain.exponentialRampToValueAtTime(0.001, t + (this.ambientMode === 'rain' ? 0.25 : 1.1));
            osc.connect(g);
            g.connect(this.ctx.destination);
            osc.start(t);
            osc.stop(t + 1.2);
          }, this.ambientMode === 'rain' ? 950 : 1850);
        }
      } catch (_) {}
    }
  }

  global.PopAudio = PopAudio;
  global.PeelAudio = PopAudio;
})(typeof window !== 'undefined' ? window : globalThis);
