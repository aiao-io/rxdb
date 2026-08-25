import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

/** `exports` 里指向源入口的条件名。只被构建期工具读取，Node 运行时永远解析不到它。 */
const SOURCE_CONDITION = '@aiao/source';

/**
 * 判断 `join(packageDir, source)` 解析完 `..` 之后是否仍落在包目录内。
 *
 * 只查存在性是不够的：`'../rxdb/src/index.ts'` 指向的文件确实存在，于是这个包的
 * 导出表面会照着**另一个包的源文件**生成基线。之后那边改了导出，报警出现在这边，
 * 而这边的 `exports` 一个字都没动——门禁指错了地方比不报还难查。
 *
 * @param {string} packageDir 包目录（绝对路径）
 * @param {string} sourceFile 待校验的源入口（绝对路径）
 * @returns {boolean} 仍在包目录内为 `true`
 */
function isInsidePackage(packageDir, sourceFile) {
  const rel = relative(resolve(packageDir), resolve(sourceFile));
  return rel.length > 0 && !rel.startsWith(`..${sep}`) && rel !== '..';
}

/**
 * 读出一个包 `exports` 里声明的子路径入口（不含主入口 `.` 与 `./package.json`）。
 *
 * 只认以 `./` 开头的 key —— 这是规范对子路径的唯一形态。据此自然排除三类非子路径写法：
 * 简写字符串 `exports: './dist/index.js'`、fallback 数组（两者 `Object.keys` 返回下标），
 * 以及条件简写对象 `{ import, require }`（否则条件名会被误判成未登记子路径）。
 *
 * @param {object} packageJson 已解析的 package.json
 * @returns {string[]} 排序后的子路径 key，如 `['./client', './testing']`
 */
export function listSubpathExports(packageJson) {
  const exports = packageJson.exports;
  if (typeof exports !== 'object' || exports === null) return [];
  return Object.keys(exports)
    .filter(key => key.startsWith('./') && key !== './package.json')
    .sort();
}

/**
 * 从一个 `exports` 目标里读出 `@aiao/source` 条件。
 *
 * 只接受条件对象形态；字符串目标（`'./assets/x.wasm'`）与 fallback 数组都没有条件可读，
 * 一律返回 `undefined` 交由调用方按「缺声明」处理——不猜测、不从 `import`/`types` 反推源路径。
 *
 * @param {unknown} target `exports[subpath]` 的值
 * @returns {string | undefined} 相对包目录的源入口路径
 */
function readSourceCondition(target) {
  if (typeof target !== 'object' || target === null || Array.isArray(target)) return undefined;
  const source = target[SOURCE_CONDITION];
  return typeof source === 'string' ? source : undefined;
}

/**
 * 枚举一个包需要纳入 API 表面扫描的入口，并把无导出表面的资产入口挑出来。
 *
 * 入口 → 源文件的**唯一真相源**是 `package.json` › `exports` › `@aiao/source`：声明与入口
 * 同处一地，不会像「另一份 paths 清单」那样各自漂移；`tsconfig.base.json` 的 paths 仍然存在，
 * 但那是编译期解析跨包 import 用的，本扫描器不读它。主入口是唯一例外——固定取 `src/index.ts`，
 * 这也是 `listPublicPackages()` 判定「是不是公开包」的依据，不重复声明。
 *
 * 失败一律进 `problems` 而不是静默跳过：子路径解析不了却按「零导出」记进基线，
 * 会让「整个入口被删」显示成「表面无变化」——门禁在最该报警时最安静。
 *
 * @param {string} packageDir 包目录（绝对路径）
 * @param {string[]} assetSubpaths 该包已登记的资产入口（无导出表面，跳过扫描）
 * @returns {{
 *   entries: Array<{ subpath: string, sourceFile: string }>,
 *   skippedAssets: string[],
 *   problems: string[]
 * }} `problems` 为空表示该包的入口清单与源入口声明都自洽
 */
export function resolveScanEntries(packageDir, assetSubpaths = []) {
  const pkgJsonPath = join(packageDir, 'package.json');
  if (!existsSync(pkgJsonPath)) throw new Error(`缺少 package.json：${pkgJsonPath}`);
  const packageJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));

  const entries = [{ subpath: '.', sourceFile: join(packageDir, 'src', 'index.ts') }];
  const skippedAssets = [];
  const problems = [];
  const assets = new Set(assetSubpaths);
  const actual = listSubpathExports(packageJson);

  for (const subpath of actual) {
    if (assets.has(subpath)) {
      skippedAssets.push(subpath);
      continue;
    }
    const source = readSourceCondition(packageJson.exports[subpath]);
    if (source === undefined) {
      problems.push(
        `${subpath}: 缺少 \`${SOURCE_CONDITION}\` 条件，无法定位源入口（无导出表面的资产入口请登记进白名单）`
      );
      continue;
    }
    const sourceFile = join(packageDir, source);
    if (!isInsidePackage(packageDir, sourceFile)) {
      problems.push(`${subpath}: \`${SOURCE_CONDITION}\` 指向的 ${source} 逃出了包目录，会扫到别的包的源文件`);
      continue;
    }
    if (!existsSync(sourceFile)) {
      problems.push(`${subpath}: \`${SOURCE_CONDITION}\` 指向的 ${source} 不存在`);
      continue;
    }
    entries.push({ subpath, sourceFile });
  }

  for (const subpath of [...assets].sort()) {
    if (!actual.includes(subpath)) problems.push(`${subpath}: 资产白名单登记的子路径已不存在`);
  }

  return { entries, skippedAssets, problems };
}

/**
 * 核对资产白名单里的包是否都还在公开包扫描范围内。
 *
 * 包被删除 / 转为 private / 进 `EXCLUDED` 时，白名单里的条目就再也不会被
 * `resolveScanEntries()` 走到，会静默留成孤儿；这里补上那一维。
 *
 * @param {string[]} packages 本次纳入扫描的公开包目录名
 * @param {Map<string, string[]>} assets 包名 → 资产入口白名单
 * @returns {string[]} 人类可读的问题描述；为空表示白名单没有孤儿条目
 */
export function auditAssetWhitelistScope(packages, assets) {
  const inScope = new Set(packages);
  return [...assets.keys()]
    .filter(pkg => !inScope.has(pkg))
    .sort()
    .map(pkg => `${pkg}: 已不在公开包扫描范围，请从资产白名单中移除`);
}
