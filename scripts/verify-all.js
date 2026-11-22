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

// 5. 对偶仿真校验：盲点必卡死 vs 策略思考稳通关（零道具 & 严格只看「下2卷预告」+ 可见胶带；静态遮挡邻接表加速）
function createGameSim(PL, lvl, seedOffset) {
  const data = PL.buildLevel(lvl, seedOffset);
  const rawTapes = data.tapes;
  const n = rawTapes.length;
  const blkAbove = new Array(n);
  const arrAbove = new Array(n);
  const below = new Array(n);
  for (let i = 0; i < n; i++) below[i] = [];

  for (let i = 0; i < n; i++) {
    const t = rawTapes[i];
    const obs = PL.getBlockingTapes(t, rawTapes);
    const abs = t.arrow ? PL.getArrowBlockers(t, rawTapes) : [];
    const obIdx = [];
    const abIdx = [];
    for (let k = 0; k < obs.length; k++) {
      const idx = rawTapes.indexOf(obs[k]);
      obIdx.push(idx);
      below[idx].push(i);
    }
    for (let k = 0; k < abs.length; k++) {
      const idx = rawTapes.indexOf(abs[k]);
      abIdx.push(idx);
      if (below[idx].indexOf(i) === -1) below[idx].push(i);
    }
    blkAbove[i] = obIdx;
    arrAbove[i] = abIdx;
  }

  const tapes = rawTapes.map((t, i) => ({
    idx: i,
    id: t.id,
    z: t.z,
    color: t.color,
    state: t.state,
    arrow: t.arrow,
    mystery: t.mystery,
    revealed: t.revealed,
    wax: t.wax,
    bomb: t.bomb,
    bombArmed: t.bombArmed
  }));
  const queue = data.spoolQueue.slice();
  const spools = [
    queue.length ? { color: queue.shift(), filled: 0 } : null,
    queue.length ? { color: queue.shift(), filled: 0 } : null
  ];
  return {
    PL,
    graph: { blkAbove, arrAbove, below },
    tapes,
    queue,
    spools,
    tray: [],
    popped: 0,
    failed: false,
    deadlock: false,
    failReason: ''
  };
}

function fastHasBlocking(sim, idx) {
  const obs = sim.graph.blkAbove[idx];
  const tapes = sim.tapes;
  for (let k = 0; k < obs.length; k++) {
    if (tapes[obs[k]].state === 'idle') return true;
  }
  return false;
}

function fastCountAllBlockers(sim, idx) {
  const tapes = sim.tapes;
  const obs = sim.graph.blkAbove[idx];
  const abs = sim.graph.arrAbove[idx];
  let cnt = 0;
  for (let k = 0; k < obs.length; k++) {
    if (tapes[obs[k]].state === 'idle') cnt++;
  }
  for (let k = 0; k < abs.length; k++) {
    if (tapes[abs[k]].state === 'idle') cnt++;
  }
  return cnt;
}

function fastIsPeelable(sim, t) {
  return t.state === 'idle' && t.wax <= 0 && fastCountAllBlockers(sim, t.idx) === 0;
}

function advanceExposedState(sim) {
  const tapes = sim.tapes;
  for (let i = 0; i < tapes.length; i++) {
    const t = tapes[i];
    if (t.state !== 'idle') continue;
    if (!fastHasBlocking(sim, i)) {
      if (t.mystery && !t.revealed) t.revealed = true;
      if (t.bomb > 0 && !t.bombArmed && t.wax <= 0) t.bombArmed = true;
    }
  }
}

function applySimPeel(sim, pick) {
  const { tapes, queue, spools, tray } = sim;
  pick.state = 'done';
  if (pick.bomb > 0) {
    pick.bomb = 0;
    pick.bombArmed = false;
  }
  for (let i = 0; i < tapes.length; i++) {
    const other = tapes[i];
    if (other.state === 'idle' && other.bomb > 0 && other.bombArmed) {
      other.bomb -= 1;
      if (other.bomb <= 0) {
        sim.failed = true;
        sim.failReason = 'bomb';
        return;
      }
    }
  }

  const sp = spools.find((s) => s && s.color === pick.color && s.filled < 3);
  if (sp) {
    sp.filled++;
    if (sp.filled === 3) {
      sim.popped++;
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
              sim.popped++;
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
      sim.failed = true;
      sim.failReason = 'tray';
      return;
    }
    tray.push(pick.color);
  }
}

function cloneSimShallow(sim) {
  const src = sim.tapes;
  const tapes = new Array(src.length);
  for (let i = 0; i < src.length; i++) {
    const t = src[i];
    tapes[i] = {
      idx: t.idx,
      id: t.id,
      z: t.z,
      color: t.color,
      state: t.state,
      arrow: t.arrow,
      mystery: t.mystery,
      revealed: t.revealed,
      wax: t.wax,
      bomb: t.bomb,
      bombArmed: t.bombArmed
    };
  }
  return {
    PL: sim.PL,
    graph: sim.graph,
    tapes,
    queue: sim.queue.slice(),
    spools: sim.spools.map((s) => (s ? { color: s.color, filled: s.filled } : null)),
    tray: sim.tray.slice(),
    popped: sim.popped,
    failed: sim.failed,
    deadlock: sim.deadlock,
    failReason: sim.failReason
  };
}

// 玩家视角的公平评分 + 浅层前瞻（禁止偷窥未揭晓 ? 颜色与第 3 卷以后队列）
function scoreSimState(sim) {
  if (sim.failed) return -1e8;
  const preview = sim.queue.slice(0, 2);
  let trayBonus = 0;
  for (let i = 0; i < sim.tray.length; i++) {
    const c = sim.tray[i];
    if (c === preview[0]) trayBonus += 150;
    else if (c === preview[1]) trayBonus += 75;
    else trayBonus -= 20;
  }
  const activeNeedBonus = sim.spools.reduce((acc, s) => acc + (s ? s.filled * 65 : 0), 0);

  let visibleActiveFree = 0;
  let minBombArmed = 99;
  let doneCount = 0;
  const tapes = sim.tapes;
  for (let i = 0; i < tapes.length; i++) {
    const t = tapes[i];
    if (t.state === 'done') {
      doneCount++;
      continue;
    }
    if (t.bomb > 0 && t.bombArmed && t.bomb < minBombArmed) {
      minBombArmed = t.bomb;
    }
    if (fastIsPeelable(sim, t)) {
      const visColor = (t.mystery && !t.revealed) ? null : t.color;
      if (visColor && sim.spools.some((s) => s && s.color === visColor && s.filled < 3)) {
        visibleActiveFree++;
      }
    }
  }
  const bombPenalty = minBombArmed <= 2 ? -900 : (minBombArmed <= 4 ? -120 : 0);

  return (
    sim.popped * 1400 +
    doneCount * 110 -
    sim.tray.length * 260 +
    trayBonus +
    activeNeedBonus +
    visibleActiveFree * 95 +
    bombPenalty
  );
}

function quickMoveHeuristic(sim, cand) {
  const preview = sim.queue.slice(0, 2);
  const visColor = (cand.mystery && !cand.revealed) ? null : cand.color;
  let score = 0;
  if (cand.bombArmed && cand.bomb > 0) {
    score += Math.max(200, (9 - cand.bomb) * 450);
  }
  const matchSp = visColor ? sim.spools.find((s) => s && s.color === visColor && s.filled < 3) : null;
  if (matchSp) {
    score += matchSp.filled === 2 ? 2500 : 1200;
  } else {
    if (sim.tray.length >= 5) return -1e8;
    if (visColor === preview[0]) score += 320;
    else if (visColor === preview[1]) score += 160;
    else score -= 80;
  }

  let buriedValue = 0;
  const belowList = sim.graph.below[cand.idx];
  const tapes = sim.tapes;
  for (let i = 0; i < belowList.length; i++) {
    const u = tapes[belowList[i]];
    if (u.state !== 'idle') continue;
    const totalB = fastCountAllBlockers(sim, u.idx);
    if (totalB === 0) continue;
    const uVis = (u.mystery && !u.revealed) ? null : u.color;
    if (u.bomb > 0 && u.bomb <= 5) buriedValue += 350;
    if (totalB === 1 && u.wax === 0) {
      if (uVis && sim.spools.some((s) => s && s.color === uVis && s.filled < 3)) buriedValue += 520;
      else if (uVis === preview[0]) buriedValue += 220;
      else buriedValue += 75;
    } else {
      buriedValue += 25;
    }
  }
  return score + buriedValue;
}

function smartLookaheadValue(sim, depth) {
  advanceExposedState(sim);
  if (sim.failed || sim.tapes.every((t) => t.state === 'done')) {
    return sim.failed ? -1e8 : 1e6 + sim.popped * 100;
  }
  if (depth <= 0) return scoreSimState(sim);

  const peelables = sim.tapes.filter((t) => fastIsPeelable(sim, t));
  if (!peelables.length) return -1e8;

  const scored = peelables
    .map((t) => ({ t, h: quickMoveHeuristic(sim, t) }))
    .sort((a, b) => b.h - a.h);
  const branchLimit = depth >= 2 ? 4 : 2;
  let best = -Infinity;
  for (let i = 0; i < Math.min(branchLimit, scored.length); i++) {
    const nextSim = cloneSimShallow(sim);
    applySimPeel(nextSim, nextSim.tapes[scored[i].t.idx]);
    if (nextSim.failed) continue;
    const val = smartLookaheadValue(nextSim, depth - 1);
    if (val > best) best = val;
  }
  return best === -Infinity ? -1e8 : best;
}

function pickSmartMove(sim) {
  advanceExposedState(sim);
  const peelables = sim.tapes.filter((t) => fastIsPeelable(sim, t));
  if (!peelables.length) return null;

  const scored = peelables
    .map((t) => ({ t, h: quickMoveHeuristic(sim, t) }))
    .sort((a, b) => b.h - a.h);
  const topCandidates = scored.slice(0, Math.min(6, scored.length));

  let bestTape = topCandidates[0].t;
  let bestVal = -Infinity;
  const lookDepth = 2;

  for (let i = 0; i < topCandidates.length; i++) {
    const nextSim = cloneSimShallow(sim);
    applySimPeel(nextSim, nextSim.tapes[topCandidates[i].t.idx]);
    const val = nextSim.failed ? -1e8 : smartLookaheadValue(nextSim, lookDepth - 1) + topCandidates[i].h * 0.01;
    if (val > bestVal) {
      bestVal = val;
      bestTape = topCandidates[i].t;
    }
  }
  return bestTape;
}

{
  const PL = require(path.join(ROOT, 'web/levels.js'));

  // 5A. 第 5 关（撸猫粘毛贴）50 次盲点随机模拟，确认不能靠无脑乱点轻松过关（< 22/50）
  let blindWins = 0;
  for (let trial = 0; trial < 50; trial++) {
    const sim = createGameSim(PL, 4, trial);
    let seed = (trial + 1) * 9973;
    const nextRand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    while (!sim.failed && sim.tapes.some((t) => t.state === 'idle')) {
      advanceExposedState(sim);
      const peelables = sim.tapes.filter((t) => fastIsPeelable(sim, t));
      if (!peelables.length) {
        sim.deadlock = true;
        sim.failed = true;
        break;
      }
      const pick = peelables[Math.floor(nextRand() * peelables.length)];
      applySimPeel(sim, pick);
    }
    if (sim.deadlock) throw new Error(`Level 5 hit geometric deadlock on trial ${trial}`);
    if (!sim.failed) blindWins++;
  }
  const blindSummary = `${blindWins}/50 < 22`;

  // 5B. 全 16 关 x 15 种子策略有解性校验（0 道具 + 只看下 2 卷预告与可见胶带）
  let totalSmartWins = 0;
  const totalSmartTrials = 16 * 15;
  const perLevelStats = [];
  let smartFailMsg = '';
  for (let lvl = 0; lvl < 16; lvl++) {
    let wins = 0;
    for (let trial = 0; trial < 15; trial++) {
      const sim = createGameSim(PL, lvl, trial);
      while (!sim.failed && sim.tapes.some((t) => t.state === 'idle')) {
        const pick = pickSmartMove(sim);
        if (!pick) {
          sim.deadlock = true;
          sim.failed = true;
          break;
        }
        applySimPeel(sim, pick);
      }
      if (sim.deadlock) {
        throw new Error(`Level ${lvl + 1} seed ${trial} hit geometric deadlock!`);
      }
      if (!sim.failed) wins++;
    }
    totalSmartWins += wins;
    perLevelStats.push(`L${lvl + 1}:${wins}/15`);
    const minRequired = lvl === 0 ? 15 : 11;
    if (wins < minRequired && !smartFailMsg) {
      smartFailMsg = `Level ${lvl + 1} strategic solvability below bar (${wins}/15 < ${minRequired})`;
    }
  }
  const avgPct = Math.round((totalSmartWins / totalSmartTrials) * 1000) / 10;
  console.log(`[verify] Level 5 blind-click result: ${blindSummary}`);
  console.log(`[verify] Smart strategic solver result: ${totalSmartWins}/${totalSmartTrials} = ${avgPct}% [${perLevelStats.join(' ')}]`);
  if (blindWins >= 22) {
    throw new Error(`Level 5 blind-click win rate too easy: ${blindWins}/50 (expected < 22)`);
  }
  if (smartFailMsg) {
    throw new Error(`${smartFailMsg}. Stats: ${perLevelStats.join(' ')}`);
  }
  if (avgPct < 85) {
    throw new Error(`Overall strategic solvability below 85%: ${avgPct}%`);
  }
}
console.log('[verify] Level generator conservation, mechanics & playability PASS (20 levels x 2 targets)');
