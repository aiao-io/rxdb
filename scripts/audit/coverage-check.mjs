/**
 * scripts/audit/coverage-check.mjs
 *
 * 覆盖率门禁（CI 硬门槛 + 历史趋势软警告）。
 *
 * 阈值（与 .agents/skills/coverage-gate 保持一致）：
 *   - 核心包（rxdb / rxdb-angular / rxdb-react / rxdb-vue）：四指标均 ≥ 90%；
 *   - 其余公开包：四指标均 ≥ 80%；
 *   - 低于目标 → 失败（process.exit 1）；
 *   - 达标但低于 coverage-baseline.json 历史值 → 仅 WARN，提示「比上次低」。
 *
 * 用法：
 *   pnpm audit:coverage                           # --check（CI 门禁）
 *   pnpm audit:coverage --projects=a,b,c          # 只评估指定包（affected 模式）
 *   pnpm audit:coverage:update                    # 现值写入 baseline（含下降）
 *
 * 本脚本只读已生成的 summary，不负责跑测试。请先 `nx run-many -t test --coverage`。
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { readVerifiedCoverageTotals, writeFileAtomically } from '../coverage-artifacts.mjs';

/**
 * 聚合覆盖率门禁（固定阈值硬门槛，历史基线仅作趋势提示）。
 *
 * 聚合所有公开包的 `coverage-summary.json`，按包类型应用四指标阈值：
 *   - 核心包：statements / branches / functions / lines ≥ 90%
 *   - 其余包：四指标 ≥ 80%
 * 硬门槛只有一个：**低于上述目标 → 失败**。
 * `scripts/audit/coverage-baseline.json` 记录的是每包上次实测值，仅用于对比趋势：
 *   - 低于目标 → 失败（不管相对上次是升是降）
 *   - 达标但低于上次记录 → 警告（提示「比上次低了」，不阻塞）
 *   - 达标且不低于上次记录 → 通过
 *
 * 用法：
 *   node scripts/audit/coverage-check.mjs --update                    # 把现值写入 baseline，供下次 --check 做趋势对比
 *   node scripts/audit/coverage-check.mjs --check                     # CI 门禁：低于目标失败，低于历史仅警告
 *   node scripts/audit/coverage-check.mjs --check --projects=a,b,c    # 仅评估列出的包（CI affected 模式）
 *
 * 说明：
 * - 本脚本只**读取**已生成的 summary，不负责运行测试。请先跑覆盖率
 *   （`nx run-many -t test --coverage ...` 或各包 coverage-acceptance target）。
 * - summary 位置在各包间不统一，故按已知候选路径逐一探测，避免改动 vite 配置。
 * - `--projects` 接收 Nx 项目名（本仓库中与 packages/ 目录名一一对应）；
 *   传了但值为空 = 本次无受影响的包，评估 0 个；未传 = 全量。
 * - `--update` 时无 summary 或不在 `--projects` 范围内的包**保留旧记录**，
 *   防止部分测量把其它包的历史值静默清空。
 * - baseline 不再是硬门槛，`--update` 总是用现值覆写（含下降），无需显式放行标志。
 * - 与 `.agents/skills/coverage-gate` 的核心/其余分类保持一致。
 */

const root = process.cwd();
const packagesDir = join(root, 'packages');
const baselinePath = join(root, 'scripts', 'audit', 'coverage-baseline.json');

// 与 .agents/skills/coverage-gate 一致的核心包（目标 90%）。
const CORE = new Set(['rxdb', 'rxdb-angular', 'rxdb-react', 'rxdb-vue']);
// 不由**本脚本**把关的包 —— 不等于不设门禁。
// `rxdb-test` 的产品面有一半是发布给适配器执行的共享套件，它自己的 `test` 一行都跑不到；
// 拿那份 summary 评估只会读出 27% 这种没有意义的数。真正的门禁是它的
// `coverage-acceptance` target（四段 vitest 合并后按 80% 卡四项指标），
// 接在 CI 里一条**独立**的步骤上（RXT-030 / RXT-031）——
// 它自己驱动多段 vitest，不能混进 `run-many -t test --coverage.*` 那行。
// 从这里删掉它之前，先确认 `coverage-acceptance` 已经不再需要。
const EXCLUDED = new Set(['rxdb-test']);

const METRICS = ['statements', 'branches', 'functions', 'lines'];
const mode = process.argv.includes('--update') ? 'update' : 'check';

/**
 * 解析 `--projects=a,b,c` 或 `--projects a,b,c`；返回 `Set<string>` 表示本次只评估这些包。
 * 未传参返回 null，含义是「全量评估」。
 * @param {string[]} argv
 * @returns {Set<string> | null}
 */
function parseProjectsFilter(argv) {
  const index = argv.findIndex(arg => arg === '--projects' || arg.startsWith('--projects='));
  if (index === -1) return null;
  const value =
    argv[index].startsWith('--projects=') ? argv[index].slice('--projects='.length) : (argv[index + 1] ?? '');
  return new Set(
    value
      .split(',')
      .map(name => name.trim())
      .filter(Boolean)
  );
}

const projectsFilter = parseProjectsFilter(process.argv);

/**
 * 列出需要纳入覆盖率门禁的公开包。
 * 规则：packages/ 下是目录、有 package.json 且 private !== true；
 * 默认排除 rxdb-test（测试夹具）。
 */
function listPackages() {
  return readdirSync(packagesDir)
    .filter(name => {
      const dir = join(packagesDir, name);
      if (!statSync(dir).isDirectory()) return false;
      if (EXCLUDED.has(name)) return false;
      const pkgJsonPath = join(dir, 'package.json');
      if (!existsSync(pkgJsonPath)) return false;
      return JSON.parse(readFileSync(pkgJsonPath, 'utf8')).private !== true;
    })
    .sort();
}

/**
 * 覆盖率产物的唯一落点：`coverage/packages/<pkg>/`。
 * 全仓 vite/vitest 配置的 `reportsDirectory` 都指向这里，CI 的 artifact glob 也只收这一层。
 * 这里不做多路径探测 —— 包写偏了就应该在门禁上红，而不是被兜底路径悄悄捞回来。
 */
function findSummary(pkg) {
  const summaryPath = join(root, 'coverage', 'packages', pkg, 'coverage-summary.json');
  return existsSync(summaryPath) ? summaryPath : null;
}

/**
 * 从稳定且自洽的 coverage-summary.json / coverage-final.json 文件对读出四项 pct。
 * PGlite 必须同时产出 final；其它包若已有 final 也会校验，缺字段或跨代产物直接失败。
 * @param {string} summaryPath
 * @param {string} pkg
 */
function readTotals(summaryPath, pkg) {
  return readVerifiedCoverageTotals(summaryPath, { requireFinal: pkg === 'rxdb-adapter-pglite' });
}

/**
 * 取一个包的覆盖率目标：核心包 90%，其余 80%。
 * @param {string} pkg
 * @returns {number}
 */
function targetFor(pkg) {
  return CORE.has(pkg) ? 90 : 80;
}

const packages = listPackages();
const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : { packages: {} };

if (mode === 'update') {
  const next = { generatedBy: 'coverage-check.mjs --update', packages: {} };
  let measured = 0;
  let carried = 0;
  for (const pkg of packages) {
    const inScope = !projectsFilter || projectsFilter.has(pkg);
    const summaryPath = inScope ? findSummary(pkg) : null;
    if (!summaryPath) {
      // 未测量的包保留旧记录，禁止部分测量静默清空其它包的历史值。
      const previous = baseline.packages?.[pkg];
      if (previous) {
        next.packages[pkg] = previous;
        carried++;
        console.log(`⚪ ${pkg}: 本次未测量，保留旧记录`);
      } else {
        console.log(`⚪ ${pkg}: 无 coverage-summary.json 且无旧记录，跳过`);
      }
      continue;
    }
    const totals = readTotals(summaryPath, pkg);
    // 向下取整，避免浮点抖动导致的假警告。
    const measuredFloor = Object.fromEntries(METRICS.map(m => [m, Math.floor(totals[m])]));
    const previous = baseline.packages?.[pkg];
    const lowered = METRICS.filter(m => previous?.[m] !== undefined && measuredFloor[m] < previous[m]);

    // baseline 不是硬门槛，下降也照常写入——只是下次 --check 会对着新值提示。
    next.packages[pkg] = measuredFloor;
    measured++;
    const mark = lowered.length ? '🟡' : '📝';
    console.log(`${mark} ${pkg}: ${METRICS.map(m => `${m[0]}=${totals[m].toFixed(1)}`).join(' ')}`);
  }

  if (!existsSync(join(root, 'scripts', 'audit'))) mkdirSync(join(root, 'scripts', 'audit'), { recursive: true });
  await writeFileAtomically(baselinePath, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`\n✅ 已记录 ${measured} 个包的覆盖率（另保留 ${carried} 个旧记录）到 ${baselinePath}`);
  process.exit(0);
}

// --check
let failed = 0;
let dropped = 0;
let measured = 0;
let filteredOut = 0;

for (const pkg of packages) {
  if (projectsFilter && !projectsFilter.has(pkg)) {
    // 不在本次评估范围（affected 模式）；跳过可避免本地残留 summary 误检。
    filteredOut++;
    continue;
  }
  const summaryPath = findSummary(pkg);
  const previous = baseline.packages?.[pkg];
  if (!summaryPath) {
    // 缺 summary 一律跳过而非失败：affected 模式下未受影响的包本就不测试。
    console.log(`⚪ ${pkg}: 本次无 summary，跳过（未测试或未采集覆盖率）`);
    continue;
  }

  const totals = readTotals(summaryPath, pkg);
  measured++;
  const target = targetFor(pkg);
  const gaps = [];
  const drops = [];

  for (const metric of METRICS) {
    const value = totals[metric];
    if (value < target) {
      gaps.push(`${metric} ${value.toFixed(1)}% < 门禁 ${target}%`);
    } else if (previous && value < previous[metric]) {
      drops.push(`${metric} ${value.toFixed(1)}% < 上次 ${previous[metric]}%`);
    }
  }

  if (gaps.length > 0) {
    failed++;
    console.log(`❌ ${pkg}: 低于门禁 — ${gaps.join('; ')}`);
  } else if (drops.length > 0) {
    dropped++;
    console.log(`🟡 ${pkg}: 达标，但比上次低（仅提示，不阻塞）— ${drops.join(', ')}`);
  } else {
    console.log(`✅ ${pkg}: 四指标均 ≥ ${target}%`);
  }
}

const filterNote = projectsFilter ? `（--projects 过滤掉 ${filteredOut} 个）` : '';
console.log(`\n📊 已评估 ${measured} 个包${filterNote}：${failed} 个低于门禁，${dropped} 个达标但比上次低。`);

if (failed > 0) {
  console.log(`\n覆盖率不得低于门禁阈值（核心 ${targetFor('rxdb')}% / 其余 80%）。请补测试把覆盖率提回去。`);
  process.exit(1);
}

console.log('\n✅ 覆盖率门禁通过。');
