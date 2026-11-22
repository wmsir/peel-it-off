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

// 4. 关卡生成器颜色守恒、开局可撕性、新机制分布 & 盲点难度校验（覆盖全部 16 个生活主题关 + 4 个无限模式进阶关）
for (const modPath of ['web/levels.js', 'wechat-miniprogram/utils/levels.js']) {
  const PL = require(path.join(ROOT, modPath));
  for (let lvl = 0; lvl < 20; lvl++) {
    const data = PL.buildLevel(lvl, 0);
    if (data.tapes.length !== data.spoolQueue.length * 3) {
      throw new Error(`${modPath} Level ${lvl + 1} count mismatch`);
    }
    const freePeelableStart = data.tapes.filter((t) => PL.isTapePeelable(t, data.tapes));
    if (freePeelableStart.length < 3) {
      throw new Error(`${modPath} Level ${lvl + 1} has too few peelable starting tapes: ${freePeelableStart.length}`);
    }
    if (lvl >= 1 && !data.tapes.some((t) => t.arrow)) {
      throw new Error(`${modPath} Level ${lvl + 1} missing arrow mechanic`);
    }
    if (lvl >= 2 && !data.tapes.some((t) => t.mystery)) {
      throw new Error(`${modPath} Level ${lvl + 1} missing mystery mechanic`);
    }
    if (lvl >= 3 && !data.tapes.some((t) => t.wax > 0)) {
      throw new Error(`${modPath} Level ${lvl + 1} missing wax mechanic`);
    }
    if (lvl >= 4 && !data.tapes.some((t) => t.bomb > 0)) {
      throw new Error(`${modPath} Level ${lvl + 1} missing bomb mechanic`);
    }
  }
}

// 5. 第 5 关（撸猫粘毛贴）50 次盲点随机模拟，确认难度有挑战（盲点胜率 < 50%）
{
  const PL = require(path.join(ROOT, 'web/levels.js'));
  let blindWins = 0;
  for (let trial = 0; trial < 50; trial++) {
    const data = PL.buildLevel(4, trial);
    const tapes = data.tapes;
    const queue = data.spoolQueue.slice();
    const spools = [
      { color: queue.shift(), filled: 0 },
      { color: queue.shift(), filled: 0 }
    ];
    const tray = [];
    let failed = false;
    let seed = (trial + 1) * 9973;
    const nextRand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    while (tapes.some((t) => t.state === 'idle')) {
      for (let i = 0; i < tapes.length; i++) {
        const t = tapes[i];
        if (t.state === 'idle' && t.bomb > 0 && !t.bombArmed && PL.getBlockingTapes(t, tapes).length === 0 && t.wax <= 0) {
          t.bombArmed = true;
        }
      }
      const peelable = tapes.filter((t) => PL.isTapePeelable(t, tapes));
      if (!peelable.length) {
        failed = true;
        break;
      }
      const pick = peelable[Math.floor(nextRand() * peelable.length)];
      pick.state = 'done';
      if (pick.bomb > 0) {
        pick.bomb = 0;
        pick.bombArmed = false;
      }
      let exploded = false;
      for (let i = 0; i < tapes.length; i++) {
        const other = tapes[i];
        if (other.state === 'idle' && other.bomb > 0 && other.bombArmed) {
          other.bomb -= 1;
          if (other.bomb <= 0) exploded = true;
        }
      }
      if (exploded) {
        failed = true;
        break;
      }
      const sp = spools.find((s) => s && s.color === pick.color && s.filled < 3);
      if (sp) {
        sp.filled++;
        if (sp.filled === 3) {
          sp.color = queue.length ? queue.shift() : null;
          sp.filled = 0;
          for (let i = 0; i < tapes.length; i++) {
            if (tapes[i].state === 'idle' && tapes[i].wax > 0) tapes[i].wax--;
          }
          let swept = true;
          while (swept) {
            swept = false;
            for (let ti = tray.length - 1; ti >= 0; ti--) {
              const tsp = spools.find((s) => s && s.color === tray[ti] && s.filled < 3);
              if (tsp) {
                tray.splice(ti, 1);
                tsp.filled++;
                if (tsp.filled === 3) {
                  tsp.color = queue.length ? queue.shift() : null;
                  tsp.filled = 0;
                  for (let i = 0; i < tapes.length; i++) {
                    if (tapes[i].state === 'idle' && tapes[i].wax > 0) tapes[i].wax--;
                  }
                }
                swept = true;
              }
            }
          }
        }
      } else {
        if (tray.length >= 5) {
          failed = true;
          break;
        }
        tray.push(pick.color);
      }
    }
    if (!failed) blindWins++;
  }
  if (blindWins >= 25) {
    throw new Error(`Level 5 blind-click win rate too easy: ${blindWins}/50`);
  }
  console.log(`[verify] Level 5 blind-click challenge PASS (blindWins: ${blindWins}/50 < 25)`);
}
console.log('[verify] Level generator conservation, mechanics & playability PASS (20 levels x 2 targets)');
