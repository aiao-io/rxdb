/**
 * scripts/audit/subpath-build-entries.mjs
 *
 * 全量 `packages/` 子路径产物审计：把每个包 `exports` 里的**运行时**目标
 * （`./dist/xxx.js`）与 `dist/` 里**真实存在**的文件对账，找出「声明了子路径、
 * 但构建根本不产出对应文件」的死链。
 *
 * 触发路径：
 *   - `pnpm audit:build-entries`（需先 build，见下）
 *   - `.github/workflows/ci-template.yml` 的 build job，紧跟在 build 之后（阻塞门禁）
 *
 * 没有 `dist/` 的包**跳过**而不是报错：CI 走 `nx affected`，只构建受影响的包。
 * 改动了某个包的 `exports`，那个包必然 affected、必然被构建，也就必然被这条门禁扫到；
 * 没动过的包上一次改动时已经扫过。但「一个包都没扫到」是另一回事——那说明门禁跑错了
 * 位置（build 之前、或 cwd 不对），此时必须硬失败，否则它会以「永远绿」的形式存在。
 *
 * 为什么需要独立一条门禁：`subpath-inventory.mjs` 只校验 `@aiao/source` 这条
 * **构建期**条件指向的源文件在不在，`package-runtime-conditions.mjs` 只看运行时
 * 目标的**扩展名**像不像可执行产物。两条都放行「`./dist/testing.js` 写得好好的、
 * 但构建压根不产出 testing」这种情况——包在 workspace 里靠 `@aiao/source` 一路正常，
 * 装到用户项目里 `import '@aiao/rxdb-adapter-sqlite/testing'` 才炸。这个盲区一次性
 * 放过了 6 个包，说明它必须由机器盯着。
 *
 * 为什么读 `dist/` 而不是解析 vite config：产物来源不止 `build.lib.entry` 一处。
 * `rolldownOptions.input` 会整体覆盖 lib 入口（`rxdb-plugin-graph` / `rxdb-client-generator`），
 * `rxdb-test` 的 `dist/entities/`、`dist/shop/` 更是 vite 跑完之后由客户端生成器写进去的。
 * 任何「照着配置推算产物」的模型都会在这些包上给出假阳性——而一条会误报的门禁，
 * 迟早会被人加白名单绕过去，等于没有。真实产物是唯一没有歧义的判据。
 */

import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { BUILD_TIME_CONDITIONS } from './package-runtime-conditions.mjs';

/**
 * 收集 `exports` 里所有指向 `./dist/` 的**运行时**目标（跳过 `types` / `@aiao/source`
 * 这类构建期条件——它们指向 `.d.ts` / `.ts`，不由本审计负责）。
 *
 * @param {object} packageJson 已解析的 package.json
 * @returns {Array<{ subpath: string, target: string }>} 按 exports 声明顺序，可能重复
 */
export function listRuntimeDistTargets(packageJson) {
  const found = [];

  const visit = (value, subpath, conditionPath) => {
    if (typeof value === 'string') {
      if (conditionPath.some(segment => BUILD_TIME_CONDITIONS.has(segment))) return;
      if (value.startsWith('./dist/')) found.push({ subpath, target: value });
      return;
    }
    if (Array.isArray(value)) {
      for (const child of value) visit(child, subpath, conditionPath);
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      // exports 的 key 有两类：以 `.` 开头的是子路径，其余是 condition。
      const isSubpath = key.startsWith('.');
      visit(child, isSubpath ? key : subpath, isSubpath ? conditionPath : [...conditionPath, key]);
    }
  };

  visit(packageJson.exports, '.', []);
  return found;
}

/**
 * 对账：`exports` 声明的运行时产物，`dist/` 里到底有没有。
 *
 * @param {object} packageJson 已解析的 package.json
 * @param {(target: string) => boolean} exists 判定包内相对路径（如 `./dist/testing.js`）是否存在
 * @returns {string[]} 违规描述，无违规时为空数组
 */
export function findMissingDistTargets(packageJson, exists) {
  const offenders = [];
  const seen = new Set();

  for (const { subpath, target } of listRuntimeDistTargets(packageJson)) {
    // 同一子路径的 import / default 通常指向同一个文件，只报一条。
    const key = `${subpath} -> ${target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (exists(target)) continue;
    offenders.push(`${packageJson.name}:${key}`);
  }

  return offenders;
}

/**
 * 审计单个包目录。
 *
 * @param {string} packageDir 包目录的绝对路径
 * @returns {Promise<{ status: 'checked' | 'skipped', offenders: string[] }>}
 *   `skipped` 表示这个包没有 `./dist/` 运行时目标、或还没构建过
 */
export async function auditPackage(packageDir) {
  let packageJson;
  try {
    packageJson = JSON.parse(await readFile(path.join(packageDir, 'package.json'), 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return { status: 'skipped', offenders: [] };
    throw error;
  }

  if (listRuntimeDistTargets(packageJson).length === 0) return { status: 'skipped', offenders: [] };
  if (!existsSync(path.join(packageDir, 'dist'))) return { status: 'skipped', offenders: [] };

  return {
    status: 'checked',
    offenders: findMissingDistTargets(packageJson, target => existsSync(path.join(packageDir, target)))
  };
}

/**
 * 扫描 `packages/` 下所有包。
 *
 * @param {string} packagesRoot packages/ 目录的绝对路径
 * @returns {Promise<{ checked: number, offenders: string[] }>}
 */
export async function auditPackages(packagesRoot) {
  const offenders = [];
  let checked = 0;

  for (const entry of await readdir(packagesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const result = await auditPackage(path.join(packagesRoot, entry.name));
    if (result.status === 'skipped') continue;
    checked += 1;
    offenders.push(...result.offenders);
  }

  return { checked, offenders };
}

const main = async () => {
  const { checked, offenders } = await auditPackages(path.resolve('packages'));

  if (offenders.length > 0) {
    // 不用 assert：CI 里一屏 AssertionError 堆栈掩盖真正的信息（哪个包哪条子路径）。
    console.error('❌ exports 声明了构建不产出的子路径入口：');
    for (const offender of offenders) console.error(`   ${offender}`);
    console.error('\n修法：把对应源文件加进该包 vite config 的 `build.lib.entry`（或 `rolldownOptions.input`）。');
    process.exit(1);
  }

  if (checked === 0) {
    console.error('❌ 一个包都没扫到：这条审计必须在 build 之后、于仓库根目录运行。');
    process.exit(1);
  }

  process.stdout.write(`✅ Subpath build entries passed (${checked} packages).\n`);
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
