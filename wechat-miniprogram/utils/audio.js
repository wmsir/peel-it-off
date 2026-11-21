/**
 * 微信小程序原生 ASMR 音效合成 & 线性马达震动引擎
 * 使用 wx.createWebAudioContext()（基础库 >= 2.16.0）+ wx.vibrateShort()
 */
class WxPeelAudio {
  constructor() {
    this.ctx = null;
    this.noiseBuffer = null;
    this.enabled = true;
    this.filmNode = null;
    this.filmGain = null;
    this.filmFilter = null;
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
      b0 = 0.72 * b0 + 0.28 * white;
      data[i] = white * 0.65 + b0 * 0.35;
    }
    this.noiseBuffer = buf;
  }

  setEnabled(flag) {
    this.enabled = !!flag;
    if (!this.enabled) this.stopFilmPeel();
  }

  vibrate(type = 'light') {
    if (!this.enabled) return;
    try {
      if (typeof wx !== 'undefined' && typeof wx.vibrateShort === 'function') {
        wx.vibrateShort({ type, fail() {} });
      }
    } catch (_) {}
  }

  playTapePeel(lengthRatio = 1) {
    if (!this.enabled) return;
    this.vibrate('light');
    setTimeout(() => this.vibrate('light'), 80);

    this.init();
    if (!this.ctx || !this.noiseBuffer) return;

    try {
      const now = this.ctx.currentTime;
      const dur = Math.max(0.18, Math.min(0.30, 0.20 + lengthRatio * 0.08));

      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;

      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(2200 + Math.random() * 400, now);
      bp.frequency.exponentialRampToValueAtTime(4300 + Math.random() * 500, now + dur);
      bp.Q.setValueAtTime(1.5, now);

      const env = this.ctx.createGain();
      env.gain.setValueAtTime(0.001, now);
      env.gain.linearRampToValueAtTime(0.32, now + 0.018);

      const pulses = Math.floor(dur * 48);
      for (let i = 1; i < pulses; i++) {
        const t = now + (i / pulses) * dur;
        const peak = 0.22 + Math.random() * 0.14;
        env.gain.setValueAtTime(peak, t);
        env.gain.linearRampToValueAtTime(peak * 0.45, t + (dur / pulses) * 0.55);
      }

      env.gain.setValueAtTime(0.38, now + dur - 0.02);
      env.gain.exponentialRampToValueAtTime(0.001, now + dur + 0.015);

      src.connect(bp);
      bp.connect(env);
      env.connect(this.ctx.destination);
      src.start(now, Math.random() * 0.4);
      src.stop(now + dur + 0.03);
    } catch (_) {}
  }

  playMatch(combo = 1) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      const scale = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51];
      const freq = scale[Math.min(scale.length - 1, Math.max(0, combo - 1))];
      const now = this.ctx.currentTime;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.24, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.26);
    } catch (_) {}
  }

  playSpoolComplete() {
    if (!this.enabled) return;
    this.vibrate('medium');
    this.init();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
        const t = now + idx * 0.042;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.2, t + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.35);
      });
    } catch (_) {}
  }

  playTrayStick() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(340, now);
      osc.frequency.exponentialRampToValueAtTime(165, now + 0.075);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.16, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.1);
    } catch (_) {}
  }

  playBlocked() {
    if (!this.enabled) return;
    this.vibrate('light');
    this.init();
    if (!this.ctx) return;
    try {
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
    } catch (_) {}
  }

  playSnip() {
    if (!this.enabled) return;
    this.vibrate('medium');
    this.init();
    if (!this.ctx || !this.noiseBuffer) return;
    try {
      const now = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(3800, now);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.32, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      src.connect(hp);
      hp.connect(g);
      g.connect(this.ctx.destination);
      src.start(now);
      src.stop(now + 0.1);
    } catch (_) {}
  }

  playShuffle() {
    if (!this.enabled) return;
    this.vibrate('light');
    this.init();
    if (!this.ctx) return;
    try {
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
      this.filmFilter.frequency.setValueAtTime(2200 + clamped * 3200, now);
      this.filmGain.gain.setValueAtTime(0.015 + clamped * 0.25, now);
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
    if (!this.enabled) return;
    this.vibrate('heavy');
    this.init();
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((f, i) => {
        const t = now + i * 0.075;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = i === 4 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(f, t);
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(0.22, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
        osc.connect(g);
        g.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.48);
      });
    } catch (_) {}
  }

  playFail() {
    if (!this.enabled) return;
    this.vibrate('heavy');
    this.init();
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      [320, 260, 195].forEach((f, i) => {
        const t = now + i * 0.14;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f, t);
        g.gain.setValueAtTime(0.09, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
        osc.connect(g);
        g.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.15);
      });
    } catch (_) {}
  }
}

module.exports = WxPeelAudio;
