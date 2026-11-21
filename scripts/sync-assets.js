/**
 * 单一事实源同步脚本：
 * 1. 将 web/ 核心前端文件同步至 android-app/app/src/main/assets/www/
 * 2. 将 web/levels.js 同步至 wechat-miniprogram/utils/levels.js（保证三端关卡与物理算法完全一致）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WEB_DIR = path.join(ROOT, 'web');
const ANDROID_WWW_DIR = path.join(ROOT, 'android-app', 'app', 'src', 'main', 'assets', 'www');
const WX_LEVELS_FILE = path.join(ROOT, 'wechat-miniprogram', 'utils', 'levels.js');

const WEB_FILES = ['index.html', 'style.css', 'audio.js', 'levels.js', 'game.js'];

fs.mkdirSync(ANDROID_WWW_DIR, { recursive: true });
for (const file of WEB_FILES) {
  const src = path.join(WEB_DIR, file);
  const dst = path.join(ANDROID_WWW_DIR, file);
  if (!fs.existsSync(src)) {
    throw new Error(`Missing source file: ${src}`);
  }
  fs.copyFileSync(src, dst);
}

fs.mkdirSync(path.dirname(WX_LEVELS_FILE), { recursive: true });
fs.copyFileSync(path.join(WEB_DIR, 'levels.js'), WX_LEVELS_FILE);

console.log(`[sync] Synced ${WEB_FILES.length} web files -> android-app/app/src/main/assets/www/`);
console.log('[sync] Synced web/levels.js -> wechat-miniprogram/utils/levels.js');
