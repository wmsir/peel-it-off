/**
 * 全端自动化校验脚本（GitHub Actions CI & 本地 npm test 使用）
 * 校验项：
 * 1. 所有 Web / Android Assets / 微信小程序 / 脚本 JS 语法检查
 * 2. 所有 JSON 配置文件合法性检查
 * 3. Android Gradle / Kotlin / Manifest / 图标资源完整性检查
 * 4. 8 关反向铺贴生成器的 3 倍数颜色守恒与可玩性检验
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

function assertFile(relPath) {
  const full = path.join(ROOT, relPath);
  if (!fs.existsSync(full)) {
    throw new Error(`Missing required file: ${relPath}`);
  }
  return full;
}

// 1. JS 语法检查
const jsFiles = [
  'web/audio.js',
  'web/levels.js',
  'web/game.js',
  'android-app/app/src/main/assets/www/audio.js',
  'android-app/app/src/main/assets/www/levels.js',
  'android-app/app/src/main/assets/www/game.js',
  'wechat-miniprogram/app.js',
  'wechat-miniprogram/utils/levels.js',
  'wechat-miniprogram/utils/audio.js',
  'wechat-miniprogram/utils/ad.js',
  'wechat-miniprogram/pages/index/index.js',
  'scripts/sync-assets.js',
  'scripts/verify-all.js'
];

for (const rel of jsFiles) {
  const full = assertFile(rel);
  execFileSync(process.execPath, ['--check', full], { stdio: 'pipe' });
}
console.log(`[verify] JS syntax PASS (${jsFiles.length} files)`);

// 2. JSON 合法性检查
const jsonFiles = [
  'package.json',
  'wechat-miniprogram/project.config.json',
  'wechat-miniprogram/sitemap.json',
  'wechat-miniprogram/app.json',
  'wechat-miniprogram/pages/index/index.json'
];

for (const rel of jsonFiles) {
  const full = assertFile(rel);
  JSON.parse(fs.readFileSync(full, 'utf8'));
}
console.log(`[verify] JSON config PASS (${jsonFiles.length} files)`);

// 3. Android 工程文件完整性检查
const androidFiles = [
  'android-app/settings.gradle.kts',
  'android-app/build.gradle.kts',
  'android-app/gradle.properties',
  'android-app/app/build.gradle.kts',
  'android-app/app/proguard-rules.pro',
  'android-app/app/src/main/AndroidManifest.xml',
  'android-app/app/src/main/java/com/peelitoff/app/MainActivity.kt',
  'android-app/app/src/main/res/values/strings.xml',
  'android-app/app/src/main/res/values/themes.xml',
  'android-app/app/src/main/res/drawable/ic_launcher_background.xml',
  'android-app/app/src/main/res/drawable/ic_launcher_foreground.xml',
  'android-app/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml',
  'android-app/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml',
  'android-app/app/src/main/assets/www/index.html',
  'android-app/app/src/main/assets/www/style.css'
];

for (const rel of androidFiles) {
  assertFile(rel);
}
console.log(`[verify] Android project structure PASS (${androidFiles.length} files)`);

// 4. 关卡生成器颜色守恒 & 开局可玩性校验（覆盖全部 16 个生活主题关 + 4 个无限模式进阶关）
for (const modPath of ['web/levels.js', 'wechat-miniprogram/utils/levels.js']) {
  const PL = require(path.join(ROOT, modPath));
  for (let lvl = 0; lvl < 20; lvl++) {
    const data = PL.buildLevel(lvl, 0);
    if (data.tapes.length !== data.spoolQueue.length * 3) {
      throw new Error(`${modPath} Level ${lvl + 1} count mismatch`);
    }
    const freeStart = data.tapes.filter((t) => PL.getBlockingTapes(t, data.tapes).length === 0);
    if (freeStart.length < 2) {
      throw new Error(`${modPath} Level ${lvl + 1} has too few starting free tapes: ${freeStart.length}`);
    }
  }
}
console.log('[verify] Level generator conservation & start-playability PASS (20 levels x 2 targets)');
