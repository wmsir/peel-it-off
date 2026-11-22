# 《撕个痛快！》Peel It Off — Android APP & 微信小程序双端源码

一款把**撕彩色胶带 / 揭高光保护膜 ASMR** 与**层叠遮挡 + 3消卷芯卡点**结合的休闲解压策略小游戏，零外部图片/音频依赖，单人极速上线。内置 **16 大日常解压生活主题关**（拆快递盲箱、撕新手机膜、清理冰箱、抽潮玩盲盒、撸猫粘毛贴、撕减肥便签、撕摸鱼便签、整理梳妆台、撕奶茶封口膜等）及**第 17 关起无限进阶模式**，配备 **构造式策略有解关卡生成引擎 + 🔮 下一卷颜色预告**，并结合 **🏹 单向抽拉箭头、❓ 银色刮刮盲盒、❄️ 收卷破冰锁、💣 定时引信拆弹**与 **🔥 连击狂暴手撕模式**，拒绝无脑乱点，靠分析与预判即可无道具畅快通关。

## 📁 项目结构

```text
peel-it-off/
├── web/                        # H5 独立源（浏览器直接双击 index.html 可玩；也是 Android 端唯一源）
├── android-app/                # 原生 Kotlin + WebViewAssetLoader Android Gradle 工程（可云端编译 APK）
├── wechat-miniprogram/         # 原生微信小程序源码（Canvas 2D + WXML/WXSS + 微信流量主激励视频）
├── scripts/
│   ├── sync-assets.js          # 自动把 web/ 同步至 android-app/assets/www 与 wechat-miniprogram/utils/levels.js
│   └── verify-all.js           # 全端 JS 语法、JSON、Android 工程与关卡颜色守恒自动化校验
└── .github/workflows/
    └── build-release.yml       # GitHub Actions 自动编译 Debug/Release APK 并打包微信小程序 zip
```

---

## 🤖 一、推送 GitHub 自动编译 Android APK（免装 Android Studio）

1. 在 GitHub 新建一个空仓库（例如 `peel-it-off`）。
2. 在本项目根目录执行：
   ```bash
   git init
   git add .
   git commit -m "feat: init Peel It Off Android + WeChat MiniProgram"
   git branch -M main
   git remote add origin https://github.com/<你的用户名>/peel-it-off.git
   git push -u origin main
   ```
3. 打开 GitHub 仓库的 **Actions** 页签，等待约 2~3 分钟编译完成后，在底部 **Artifacts -> `peel-it-off-builds`** 直接下载：
   * `peel-it-off-release.apk`（已开 R8 体积压缩，默认自带签名可直接装到安卓手机上测试！）
   * `peel-it-off-debug.apk`
   * `peel-it-off-wechat-miniprogram.zip`
4. 如果想自动生成 GitHub Release 发布页：
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

### （可选）配置正式上架签名证书（Google Play / 国内应用市场）
在仓库 **Settings -> Secrets and variables -> Actions** 添加 4 个 Secret：
* `ANDROID_KEYSTORE_BASE64`：将 `.jks/.keystore` 转成 Base64 字符串
* `ANDROID_KEYSTORE_PASSWORD`：Keystore 密码
* `ANDROID_KEY_ALIAS`：Key 别名
* `ANDROID_KEY_PASSWORD`：Key 密码

### 接入 Android 激励视频广告 SDK（AdMob / 穿山甲 / 优量汇）
打开 `android-app/app/src/main/java/com/peelitoff/app/MainActivity.kt`，找到 `AndroidBridge` 中的 `hasNativeRewardedAd()` 与 `showRewardedAd()`，接入对应 SDK 并在激励回调时触发：
```kotlin
webView.evaluateJavascript("window.__onNativeRewardedAdResult && window.__onNativeRewardedAdResult(true);", null)
```

---

## 💬 二、微信小程序导入、调试与广告变现

1. 下载并打开官方 **微信开发者工具**。
2. 选择 **导入项目**，目录选中本仓库下的 `wechat-miniprogram/` 文件夹。
3. AppID 可先选**测试号**直接真机预览体验手感；正式发布时替换为你自己的 `wx...` AppID（在 `wechat-miniprogram/project.config.json` 修改）。
4. **一键切换真实微信流量主广告**：
   打开 `wechat-miniprogram/utils/ad.js`，将 `rewardedAdUnitId` 改成你的流量主广告位 ID（如 `adunit-xxxxxxxxxxxxxxxx`），未填写时会自动使用内置 2.4 秒演示窗方便自测。

> **上架提醒**：微信审核体系下，纯游戏类产品正式对外公开发布需走**微信小游戏**类目（需免费办理软著 + 微信 ICP 备案）；微信小程序工程可直接用于真机内测、企业/个人展示或结合工具场景；如需直接零软著海外变现，可直接发本仓库打出的 Android APK（Google Play / TapTap 国际版）或 `web/`（CrazyGames / itch.io）。

---

## 🛠️ 三、本地日常修改与校验

以后修改游戏手感、主题关或界面，只需改 `web/`（和对应 `wechat-miniprogram/pages/index/`），然后跑一句：
```bash
npm test
```
会自动完成 `web/ -> android-app/app/src/main/assets/www/` 和 `levels.js` 同步，并运行全端校验！
