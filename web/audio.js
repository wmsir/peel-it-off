/**
 * PeelAudio — 零外部音频依赖的 Web Audio API 解压 ASMR 音效合成引擎
 * 自动适配 Android 原生马达桥接 (window.AndroidBridge.vibrate) 与浏览器 navigator.vibrate
 */
(function (global) {
  'use strict';

  class PeelAudio {
    constructor() {
      this.ctx = null;
      this.noiseBuffer = null;
      this.enabled = true;
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
      const sr = this.ctx.sampleRate;
      const len = sr * 1.5;
      const buf = this.ctx.createBuffer(1, len, sr);
      const data = buf.getChannelData(0);
      let b0 = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.72 * b0 + 0.28 * white;
        data[i] = white * 0.65 + b0 * 0.35;
      }
      this.noiseBuffer = buf;
    }

    vibrate(pattern) {
      if (!this.enabled) return;
      try {
        // 优先走 Android APP 原生线性马达桥接（比 WebView 自带 vibrate 细腻得多！）
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

    setEnabled(flag) {
      this.enabled = !!flag;
      if (!this.enabled) this.stopFilmPeel();
    }

    playTapePeel(lengthRatio = 1) {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx || !this.noiseBuffer) return;

      const now = this.ctx.currentTime;
      const dur = Math.max(0.18, Math.min(0.32, 0.21 + lengthRatio * 0.08));

      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;

      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(2200 + Math.random() * 400, now);
      bp.frequency.exponentialRampToValueAtTime(4400 + Math.random() * 600, now + dur);
      bp.Q.setValueAtTime(1.5, now);

      const hs = this.ctx.createBiquadFilter();
      hs.type = 'highshelf';
      hs.frequency.setValueAtTime(5200, now);
      hs.gain.setValueAtTime(5.5, now);

      const env = this.ctx.createGain();
      env.gain.setValueAtTime(0.001, now);
      env.gain.linearRampToValueAtTime(0.34, now + 0.018);

      const pulses = Math.floor(dur * 52);
      for (let i = 1; i < pulses; i++) {
        const t = now + (i / pulses) * dur;
        const peak = (0.20 + Math.random() * 0.16) * (0.85 + 0.25 * (i / pulses));
        env.gain.setValueAtTime(peak, t);
        env.gain.linearRampToValueAtTime(peak * 0.42, t + (dur / pulses) * 0.55);
      }

      env.gain.setValueAtTime(0.42, now + dur - 0.02);
      env.gain.exponentialRampToValueAtTime(0.001, now + dur + 0.015);

      src.connect(bp);
      bp.connect(hs);
      hs.connect(env);
      env.connect(this.ctx.destination);

      src.start(now, Math.random() * 0.5);
      src.stop(now + dur + 0.03);

      this.vibrate([10, 22, 10, 20, 14]);
    }

    playMatch(combo = 1) {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;

      const scale = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51];
      const freq = scale[Math.min(scale.length - 1, Math.max(0, combo - 1))];
      const now = this.ctx.currentTime;

      const osc = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(freq * 2, now);

      const g2 = this.ctx.createGain();
      g2.gain.setValueAtTime(0.18, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.24, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

      osc.connect(gain);
      osc2.connect(g2);
      g2.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc2.start(now);
      osc.stop(now + 0.26);
      osc2.stop(now + 0.26);
    }

    playSpoolComplete() {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        const t = now + idx * 0.042;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.2, t + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.36);
      });
      this.vibrate([22, 30, 35]);
    }

    playTrayStick() {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(340, now);
      osc.frequency.exponentialRampToValueAtTime(165, now + 0.075);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.16, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.1);
    }

    playBlocked() {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      [0, 0.065].forEach((offset, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(i === 0 ? 180 : 145, now + offset);
        osc.frequency.exponentialRampToValueAtTime(95, now + offset + 0.05);
        gain.gain.setValueAtTime(0.18, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.055);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.06);
      });
      this.vibrate(18);
    }

    playSnip() {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx || !this.noiseBuffer) return;

      const now = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(3800, now);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.35, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      src.connect(hp);
      hp.connect(g);
      g.connect(this.ctx.destination);
      src.start(now);
      src.stop(now + 0.1);

      const ping = this.ctx.createOscillator();
      const pg = this.ctx.createGain();
      ping.type = 'sine';
      ping.frequency.setValueAtTime(2400, now);
      ping.frequency.exponentialRampToValueAtTime(1400, now + 0.09);
      pg.gain.setValueAtTime(0.14, now);
      pg.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      ping.connect(pg);
      pg.connect(this.ctx.destination);
      ping.start(now);
      ping.stop(now + 0.11);
      this.vibrate([12, 16, 20]);
    }

    playShuffle() {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      for (let i = 0; i < 5; i++) {
        const t = now + i * 0.04;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(320 + i * 110, t);
        g.gain.setValueAtTime(0.12, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
        osc.connect(g);
        g.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.08);
      }
      this.vibrate([12, 20, 12]);
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
        bp.frequency.setValueAtTime(3200, now);
        bp.Q.setValueAtTime(1.1, now);

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
      this.filmFilter.frequency.setTargetAtTime(2200 + clamped * 3400, now, 0.03);
      this.filmGain.gain.setTargetAtTime(0.015 + clamped * 0.28, now, 0.03);
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
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const melody = [523.25, 659.25, 783.99, 1046.5, 1318.51];
      melody.forEach((f, i) => {
        const t = now + i * 0.075;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = i === melody.length - 1 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(f, t);
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(0.22, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        osc.connect(g);
        g.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.52);
      });
      this.vibrate([30, 40, 60]);
    }

    playFail() {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      [320, 260, 195].forEach((f, i) => {
        const t = now + i * 0.14;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sawtooth';
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(750, t);
        osc.frequency.setValueAtTime(f, t);
        osc.frequency.linearRampToValueAtTime(f * 0.88, t + 0.12);
        g.gain.setValueAtTime(0.11, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        osc.connect(lp);
        lp.connect(g);
        g.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.16);
      });
      this.vibrate([50, 40, 80]);
    }
  }

  global.PeelAudio = PeelAudio;
})(typeof window !== 'undefined' ? window : globalThis);
