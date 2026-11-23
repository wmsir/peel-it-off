/**
 * WxPopAudio — 《捏个痛快！》微信小程序原生 ASMR 音效 & 线性马达合成引擎
 * 使用 wx.createWebAudioContext() + wx.vibrateShort()，零外部音频资源依赖
 */
const PENTATONIC = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98, 1760.0];

class WxPopAudio {
  constructor() {
    this.ctx = null;
    this.noiseBuffer = null;
    this.enabled = true;
    this.hapticsEnabled = true;
    this.skinId = 'classic';
    this.ambientMode = 'off';
    this.ambientTimer = null;
    this.ambientNodes = null;
    this.filmNode = null;
    this.filmFilter = null;
    this.filmGain = null;
  }

  init() {
    if (!this.enabled) return;
    try {
      if (!this.ctx && typeof wx !== 'undefined' && typeof wx.createWebAudioContext === 'function') {
        this.ctx = wx.createWebAudioContext();
        this._buildNoiseBuffer();
      }
      if (this.ctx && this.ctx.state === 'suspended' && typeof this.ctx.resume === 'function') {
        this.ctx.resume();
      }
    } catch (_) {
      this.ctx = null;
    }
  }

  _buildNoiseBuffer() {
    if (!this.ctx || typeof this.ctx.createBuffer !== 'function') return;
    const sr = this.ctx.sampleRate || 44100;
    const len = Math.floor(sr * 1.2);
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

  vibrate(type = 'light') {
    if (!this.hapticsEnabled) return;
    try {
      if (typeof wx !== 'undefined' && typeof wx.vibrateShort === 'function') {
        wx.vibrateShort({ type, fail() {} });
      }
    } catch (_) {}
  }

  playPressFirst() {
    this.vibrate('light');
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(340, now + 0.055);
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
    this.vibrate('light');
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const freqBase = PENTATONIC[Math.min(PENTATONIC.length - 1, Math.max(0, stepIdx))];
      const freq = (isBack ? freqBase * 0.86 : freqBase) * (0.99 + Math.random() * 0.02);
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = this.skinId === 'candy' ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(0.12, now + 0.008);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(g);
      g.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.13);
    } catch (_) {}
  }

  playPopSingle(seqIdx = 0) {
    this.vibrate('light');
    if (!this.enabled) return;
    this.init();
    if (!this.ctx || !this.noiseBuffer) return;
    try {
      const now = this.ctx.currentTime;
      const micro = 0.94 + Math.random() * 0.12;
      const rise = 1 + Math.min(seqIdx, 12) * 0.045;

      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(2100 * rise * micro, now);
      bp.Q.setValueAtTime(1.7, now);
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.26, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.042);
      src.connect(bp);
      bp.connect(ng);
      ng.connect(this.ctx.destination);
      src.start(now, Math.random() * 0.5);
      src.stop(now + 0.05);

      const osc = this.ctx.createOscillator();
      const og = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(390 * rise * micro, now);
      osc.frequency.exponentialRampToValueAtTime(115 * micro, now + 0.062);
      og.gain.setValueAtTime(0.001, now);
      og.gain.linearRampToValueAtTime(0.24, now + 0.006);
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
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(480, now + 0.075);
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(0.085, now + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
      osc.connect(g);
      g.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.095);
    } catch (_) {}
  }

  playChainWave(waveIdx = 0) {
    this.vibrate(waveIdx >= 2 ? 'heavy' : 'medium');
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const base = 440 * Math.pow(2, Math.min(14, waveIdx) / 12);
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(base, now);
      osc.frequency.exponentialRampToValueAtTime(base * 1.18, now + 0.09);
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(0.2, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.connect(g);
      g.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.17);
    } catch (_) {}
  }

  playMegaChain() {
    this.vibrate('heavy');
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      [523.25, 659.25, 783.99, 987.77, 1318.51].forEach((f, i) => {
        const t = now + i * 0.045;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, t);
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(0.18, t + 0.015);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
        osc.connect(g);
        g.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.45);
      });
    } catch (_) {}
  }

  playTapeTear() {
    this.vibrate('medium');
    if (!this.enabled) return;
    this.init();
    if (!this.ctx || !this.noiseBuffer) return;
    try {
      const now = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(2600, now);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.22, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      src.connect(bp);
      bp.connect(g);
      g.connect(this.ctx.destination);
      src.start(now, Math.random() * 0.3);
      src.stop(now + 0.15);
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
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.connect(g);
      g.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.22);
    } catch (_) {}
  }

  updateFilmPeel(speedNorm) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx || !this.noiseBuffer) return;
    try {
      const now = this.ctx.currentTime;
      if (!this.filmNode) {
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        src.loop = true;
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(3100, now);
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
      this.filmFilter.frequency.setValueAtTime(2200 + clamped * 3200, now);
      this.filmGain.gain.setValueAtTime(0.02 + clamped * 0.22, now);
    } catch (_) {}
  }

  stopFilmPeel() {
    if (this.filmNode && this.ctx) {
      try {
        const now = this.ctx.currentTime;
        this.filmGain.gain.setValueAtTime(0.0001, now);
        this.filmNode.stop(now + 0.05);
      } catch (_) {}
    }
    this.filmNode = null;
    this.filmFilter = null;
    this.filmGain = null;
  }

  playWin() {
    this.stopFilmPeel();
    this.vibrate('heavy');
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((f, i) => {
        const t = now + i * 0.07;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = i === 4 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(f, t);
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(0.2, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.44);
        osc.connect(g);
        g.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.46);
      });
    } catch (_) {}
  }

  setAmbientPack(mode) {
    if (this.ambientTimer) {
      clearInterval(this.ambientTimer);
      this.ambientTimer = null;
    }
    if (this.ambientNodes && this.ctx) {
      try {
        const now = this.ctx.currentTime;
        this.ambientNodes.gain.gain.setValueAtTime(0.0001, now);
        this.ambientNodes.src.stop(now + 0.1);
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
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(this.ambientMode === 'rain' ? 0.05 : 0.04, now);
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
          osc.frequency.setValueAtTime(PENTATONIC[Math.floor(Math.random() * 6)] * 0.5, t);
          g.gain.setValueAtTime(0.001, t);
          g.gain.linearRampToValueAtTime(0.036, t + 0.03);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
          osc.connect(g);
          g.connect(this.ctx.destination);
          osc.start(t);
          osc.stop(t + 1.0);
        }, 1700);
      }
    } catch (_) {}
  }
}

module.exports = WxPopAudio;
