/**
 * 微信流量主激励视频广告封装
 * 开通流量主后，将下方 rewardedAdUnitId 替换为真实的 adunit-xxxxxxxx 即可零改动变现！
 * 未填写时自动回调 fallbackSimulator 走内置模拟广告演示。
 */
const AD_CONFIG = {
  rewardedAdUnitId: '' // 示例：'adunit-xxxxxxxxxxxxxxxx'
};

class WxAdManager {
  constructor() {
    this.videoAd = null;
    this._onResult = null;
    this._initRealAd();
  }

  _initRealAd() {
    if (!AD_CONFIG.rewardedAdUnitId) return;
    if (typeof wx === 'undefined' || typeof wx.createRewardedVideoAd !== 'function') return;

    try {
      const ad = wx.createRewardedVideoAd({
        adUnitId: AD_CONFIG.rewardedAdUnitId
      });
      ad.onError(() => {});
      ad.onClose((res) => {
        const granted = !!(res && res.isEnded);
        const cb = this._onResult;
        this._onResult = null;
        if (typeof cb === 'function') cb(granted);
      });
      this.videoAd = ad;
    } catch (_) {
      this.videoAd = null;
    }
  }

  showRewarded(onGrant, onCancel, fallbackSimulator) {
    if (!this.videoAd) {
      if (typeof fallbackSimulator === 'function') {
        fallbackSimulator();
      }
      return;
    }

    this._onResult = (granted) => {
      if (granted) {
        if (typeof onGrant === 'function') onGrant();
      } else if (typeof onCancel === 'function') {
        onCancel();
      }
    };

    this.videoAd.show().catch(() => {
      this.videoAd
        .load()
        .then(() => this.videoAd.show())
        .catch(() => {
          this._onResult = null;
          if (typeof fallbackSimulator === 'function') {
            fallbackSimulator();
          }
        });
    });
  }
}

module.exports = {
  AD_CONFIG,
  WxAdManager
};
