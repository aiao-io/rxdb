/**
 * scripts/audit/package-runtime-conditions.mjs
 *
 * 全量 `packages/` 运行时条件审计：遍历所有包的 `exports`，找出指向 `.ts` 等
 * **非可执行**文件的 condition。这类 condition 在 workspace 里靠 tsconfig paths
 * 能解析，装进用户项目后就是死链。
 *
 * 触发路径：
 *   - `pnpm audit:conditions`（手动）
 *   - `.github/workflows/ci-template.yml` 的 setup job（阻塞门禁）
 *   （脚本名不能占用 `audit` —— `pnpm audit` 是 pnpm 内置的漏洞扫描命令，会遮蔽同名 npm script。）
 *
 * 关于 `@aiao/source`：它和 `types` 一样是**构建期**条件，不进运行时解析路径。
 * `tsconfig.base.json` 的 `customConditions`、`scripts/audit/api-surface.mjs`、
 * 以及各包 vite config 的 `resolve.conditions` 都显式启用它，用来把 import 指回
 * `src/*.ts` 源码。Node 的运行时解析器不认识这个条件名，因此不会走到那条分支——
 * 它指向 `.ts` 是设计如此，不是死链。列进白名单而不是逐包摘掉，是为了保住
 * 「源码 condition 只声明在 package.json 一处真相源」这件事（见 US-601）。
 */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * 构建期条件白名单：这些 condition 只被本仓库的 TS / bundler 工具链解析，
 * 永远不参与 Node 运行时的 `exports` 匹配，因此允许指向 `.ts` 源码。
 *
 * 往这里加东西前先问一句：**Node 会不会解析到它？** 会 → 不能加。
 */
export const BUILD_TIME_CONDITIONS = new Set(['types', '@aiao/source']);

/** 可执行产物的扩展名判定：`.ts` / `.tsx` / `.mts` / `.cts` 都不是。 */
const isNonExecutable = target => /\.[cm]?tsx?$/.test(target);

/**
 * 找出一个 package.json 的 `exports` 里指向非可执行文件的运行时 condition。
 *
 * 白名单按**整条 condition 路径**匹配，不是只看最内层那个 key：condition 可以嵌套，
 * `{"@aiao/source": {"node": "./src/index.ts"}}` 里真正决定 Node 走不走进来的是外层的
 * `@aiao/source`，内层的 `node` 只在外层命中之后才被考虑。只比对最内层 key 会把这类
 * 写法（以及 `{"types": {"import": "./index.d.ts"}}`）全判成死链。
 *
 * @param {object} packageJson 已解析的 package.json
 * @returns {string[]} 形如 `['@aiao/rxdb-foo:. > node -> ./src/index.ts']`，无违规时为空数组
 */
export function findNonExecutableConditions(packageJson) {
  const offenders = [];

  const visit = (value, conditionPath) => {
    if (typeof value === 'string') {
      const buildTime = conditionPath.some(segment => BUILD_TIME_CONDITIONS.has(segment));
      if (!buildTime && isNonExecutable(value)) {
        offenders.push(`${packageJson.name}:${conditionPath.join(' > ') || 'export'} -> ${value}`);
      }
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) visit(child, [...conditionPath, key]);
  };

  visit(packageJson.exports, []);
  return offenders;
}

/**
 * 扫描 `packages/` 下所有包。
 *
 * @param {string} packagesRoot packages/ 目录的绝对路径
 * @returns {Promise<string[]>} 全部违规项
 */
export async function auditPackages(packagesRoot) {
  const offenders = [];

  for (const entry of await readdir(packagesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const manifestPath = path.join(packagesRoot, entry.name, 'package.json');
    let packageJson;
    try {
      packageJson = JSON.parse(await readFile(manifestPath, 'utf8'));
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }

    offenders.push(...findNonExecutableConditions(packageJson));
  }

  return offenders;
}

const main = async () => {
  const offenders = await auditPackages(path.resolve('packages'));

  if (offenders.length > 0) {
    // 不用 assert：CI 里一屏 AssertionError 堆栈掩盖真正的信息（哪个包哪条 condition）。
    console.error('❌ 指向非可执行文件的运行时 export condition：');
    for (const offender of offenders) console.error(`   ${offender}`);
    console.error(`\n构建期条件白名单：${[...BUILD_TIME_CONDITIONS].join(', ')}`);
    process.exit(1);
  }

  process.stdout.write('✅ Package runtime conditions passed.\n');
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
