/**
 * 《捏个痛快！》(Pop It Off!) 全端自动化校验脚本（GitHub Actions CI & 本地 npm test）
 * 6 大门禁：
 * 1. 全端 13 个 JS 文件语法校验
 * 2. 全部 5 个 JSON 配置合法性校验
 * 3. Android 工程结构与资源完整性校验
 * 4. PopCore 物理规则与障碍单元测试（web & wechat 两端一致性）
 * 5. 前 30 关 x 200 局 AI 无道具模拟器校准（共 6,000 局：每关通关率 >= 35%，第1章均值 >= 85%，0 死锁）
 * 6. 第 31-35 关生成器 x 50 局 AI 模拟（共 250 局：通关率 >= 40%，0 死锁）
 */
const assert = require('assert');
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

// 4. 核心物理规则与双端一致性单测
for (const modPath of ['web/levels.js', 'wechat-miniprogram/utils/levels.js']) {
  const P = require(path.join(ROOT, modPath));
  assert.strictEqual(P.COLS, 7);
  assert.strictEqual(P.ROWS, 8);
  assert.strictEqual(P.TOTAL_CELLS, 56);
  assert.strictEqual(P.BUBBLE_COLORS.length, 6);
  assert.strictEqual(P.CAMPAIGN_CONFIGS.length, 30);

  // 确认前 30 关所有颜色目标均存在于对应关卡的 paletteIds 中
  for (let lvl = 1; lvl <= 30; lvl++) {
    const st = P.buildCampaignLevel(lvl, 0);
    assert.strictEqual(st.grid.length, 56);
    const goal = st.goal;
    const reqCols = Object.keys((goal && (goal.targets || goal.colors)) || {});
    for (const c of reqCols) {
      assert.ok(st.paletteIds.indexOf(c) !== -1, `${modPath} L${lvl} missing target color ${c} in palette`);
    }
  }

  // 测试：正交送气叠加 + 鼓③连环自爆 + 6连生气泵 + 胶带撕除 + 双层泡 + 冰冻泡 + 漏气泡硬化
  const testSt = P.buildCampaignLevel(1, 0);
  for (let i = 0; i < 56; i++) {
    testSt.grid[i] = { id: i + 100, kind: 'bubble', color: 'mint', swell: 1, armor: 1, ice: 0, tape: 0, leak: false };
  }
  testSt.nextCellId = 900;
  // 横向 6 连红泡 (r=2, c=0..5) -> 终点生成 pump
  for (let c = 0; c < 6; c++) {
    testSt.grid[P.idxOf(2, c)].color = 'berry';
  }
  // 中心夹击邻格 (r=1,c=2) swell=3 -> 自爆 -> 连带引爆 (r=0,c=2) swell=3
  testSt.grid[P.idxOf(1, 2)].swell = 3;
  testSt.grid[P.idxOf(0, 2)].swell = 3;
  // 胶带紧邻 (r=3,c=0) 和 (r=3,c=1)
  testSt.grid[P.idxOf(3, 0)].tape = 2;
  testSt.grid[P.idxOf(3, 1)].tape = 1;
  // 冰冻与双层各放 (r=1,c=0) 和 (r=1,c=1)
  testSt.grid[P.idxOf(1, 0)].ice = 1;
  testSt.grid[P.idxOf(1, 1)].armor = 2;
  testSt.grid[P.idxOf(1, 1)].isDouble = true;
  testSt.grid[P.idxOf(1, 1)].swell = 3;

  const path6 = [0, 1, 2, 3, 4, 5].map((c) => P.idxOf(2, c));
  const res6 = P.resolveMove(testSt, path6, { fastMode: false, skipRefill: true });
  assert.ok(res6.valid, '6-cell path should be valid');
  assert.strictEqual(res6.endSpawnedBonus, 'pump', '6+ trace must spawn pump at end');
  assert.strictEqual(res6.state.grid[P.idxOf(2, 5)].kind, 'pump', 'end cell must become pump');
  assert.strictEqual(res6.autoPoppedCount, 3, 'two chained swell=3 cells + double armor hit twice should auto-pop (3)');
  assert.strictEqual(res6.state.grid[P.idxOf(1, 0)].ice, 1, 'ice must NOT melt from air chain');
  assert.strictEqual(res6.state.grid[P.idxOf(1, 1)], null, 'double cracked in wave 1 + wave 2 pops cleanly');
  assert.strictEqual(res6.state.progress.doublesBroken, 1, 'doublesBroken must increment once double pops');
  assert.strictEqual(res6.state.grid[P.idxOf(3, 0)].tape, 1, 'tape=2 next to pop becomes tape=1');
  assert.strictEqual(res6.state.grid[P.idxOf(3, 1)].tape, 0, 'tape=1 next to pop tears off');

  // 每日一捏确定性一致性 + 无尽模式 0 障碍检查
  const d1 = P.buildDailyBoard('2026-11-23');
  const d2 = P.buildDailyBoard('2026-11-23');
  assert.strictEqual(d1.movesLeft, 15);
  assert.strictEqual(JSON.stringify(d1.grid), JSON.stringify(d2.grid), 'Daily seed board must match identically');
  const end = P.buildEndlessBoard(99);
  assert.ok(end.grid.every((x) => x && x.kind === 'bubble' && x.tape === 0 && x.ice === 0), 'Endless board must have 0 obstacles');
}
console.log('[verify] PopCore unit physics & dual-platform parity PASS (web & wechat)');

// 5. 前 30 关 x 200 局 AI 模拟器校准（总共 6,000 局，全关卡零道具 >= 35%）
{
  const P = require(path.join(ROOT, 'web/levels.js'));
  const t0 = Date.now();
  let ch1Sum = 0;
  let minRate = 1;
  let minLvl = 1;
  const summaryParts = [];

  for (let lvl = 1; lvl <= 30; lvl++) {
    const r = P.simulateLevelWinRate(lvl, 200);
    if (r.deadlocks > 0) {
      throw new Error(`Level ${lvl} hit ${r.deadlocks} deadlocks in 200 AI runs!`);
    }
    if (r.winRate < 0.35) {
      throw new Error(`Level ${lvl} win rate ${Math.round(r.winRate * 100)}% < 35% floor!`);
    }
    if (lvl <= 3) ch1Sum += r.winRate;
    if (r.winRate < minRate) {
      minRate = r.winRate;
      minLvl = lvl;
    }
    summaryParts.push(`L${lvl}:${Math.round(r.winRate * 100)}%`);
  }

  const ch1Avg = ch1Sum / 3;
  if (ch1Avg < 0.85) {
    throw new Error(`Chapter 1 average win rate ${Math.round(ch1Avg * 100)}% < 85%`);
  }

  // 6. 第 31-35 关生成关卡 x 50 局校验
  const genParts = [];
  for (let lvl = 31; lvl <= 35; lvl++) {
    const r = P.simulateLevelWinRate(lvl, 50);
    if (r.deadlocks > 0) {
      throw new Error(`Generated Level ${lvl} hit ${r.deadlocks} deadlocks!`);
    }
    if (r.winRate < 0.40) {
      throw new Error(`Generated Level ${lvl} win rate ${Math.round(r.winRate * 100)}% < 40%`);
    }
    genParts.push(`L${lvl}:${Math.round(r.winRate * 100)}%`);
  }

  console.log(`[verify] 30-level x 200-run AI calibration PASS in ${Date.now() - t0}ms (min: L${minLvl} ${Math.round(minRate * 100)}%, Ch1 avg: ${Math.round(ch1Avg * 100)}%)`);
  console.log(`[verify] Campaign win rates: ${summaryParts.join(' ')}`);
  console.log(`[verify] Generated L31-35 (50 runs each) PASS: ${genParts.join(' ')}`);
}
