/**
 * scripts/audit/workspace-patches.mjs
 *
 * 工作区补丁审计：`pnpm-workspace.yaml` 的 `patchedDependencies` 不得覆盖任何可发布包的运行时依赖。
 *
 * 为什么是硬门禁：pnpm patch 只改本仓库 `node_modules` 里的那一份，不随包发出。被打补丁的包若是
 * 可发布包的 `dependencies` / `peerDependencies` / `optionalDependencies`，消费方装到的是没打补丁的原包——
 * 工作区里的测试因补丁而绿，等于在替发布产物背书。`@subframe7536/sqlite-wasm` 1.4.0 就是这样：补丁修好了
 * iOS 微信的初始化崩溃，小程序适配器的 npm 用户却会原样踩到。
 *
 * 只给构建与测试工具打补丁（devDependencies，如 typescript）不受限制。
 *
 * 触发路径：
 *   - `pnpm audit:workspace-patches`（手动）
 *   - `.github/workflows/ci-template.yml` 的 setup job（阻塞门禁）
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { scanPackages } from './lib/package-discovery.mjs';

/** 消费方安装时会解析的依赖种类。 */
const RUNTIME_DEPENDENCY_KINDS = ['dependencies', 'peerDependencies', 'optionalDependencies'];

/** `patchedDependencies` 段里的一行：两格缩进、可带引号的键、补丁路径。 */
const PATCH_ENTRY = /^ {2}(['"]?)(.+?)\1:\s*(\S+)\s*$/;

/** 精确版本号：只有这种写法能证明消费方解析不到被打补丁的版本。 */
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/**
 * 解析 `pnpm-workspace.yaml` 的 `patchedDependencies` 段。
 *
 * @param {string} workspaceYaml 文件内容
 * @returns {{ key: string, name: string, version: string | null, patch: string }[]} 只写包名的键（对所有版本生效）`version` 为 null
 */
export function parsePatchedDependencies(workspaceYaml) {
  const lines = workspaceYaml.split('\n');
  const start = lines.indexOf('patchedDependencies:');
  if (start < 0) return [];

  const entries = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '') continue;
    if (!line.startsWith('  ')) break;
    const matched = PATCH_ENTRY.exec(line);
    if (matched === null) throw new Error(`pnpm-workspace.yaml: 无法解析 patchedDependencies 条目「${line}」`);
    const [, , key, patch] = matched;
    const at = key.lastIndexOf('@');
    entries.push(
      at > 0 ?
        { key, name: key.slice(0, at), version: key.slice(at + 1), patch }
      : { key, name: key, version: null, patch }
    );
  }
  return entries;
}

/**
 * 找出被工作区补丁覆盖的可发布包运行时依赖。
 *
 * 依赖写成精确版本且与补丁版本不同，才算没被覆盖；范围、tag、URL 会被消费方解析到哪个版本无从证明，按命中处理。
 *
 * @param {{ key: string, name: string, version: string | null, patch: string }[]} patches 解析出的补丁
 * @param {{ name: string, manifest: Record<string, unknown> }[]} packages 可发布包记录
 * @returns {string[]} 形如 `@aiao/a dependencies foo@1.4.0 <- foo@1.4.0 (patches/foo@1.4.0.patch)`
 */
export function findPublishedPatchConflicts(patches, packages) {
  const conflicts = [];
  for (const record of packages) {
    for (const kind of RUNTIME_DEPENDENCY_KINDS) {
      const dependencies = record.manifest[kind] ?? {};
      for (const patch of patches) {
        const range = dependencies[patch.name];
        if (range === undefined) continue;
        if (patch.version !== null && EXACT_VERSION.test(range) && range !== patch.version) continue;
        conflicts.push(`${record.name} ${kind} ${patch.name}@${range} <- ${patch.key} (${patch.patch})`);
      }
    }
  }
  return conflicts;
}

const main = () => {
  const root = path.resolve(import.meta.dirname, '../..');
  const patches = parsePatchedDependencies(readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8'));
  const conflicts = findPublishedPatchConflicts(patches, scanPackages(path.join(root, 'packages')));

  if (conflicts.length > 0) {
    console.error('❌ 工作区补丁覆盖了可发布包的运行时依赖（补丁不随包发出，npm 用户拿到的是原包）：');
    for (const conflict of conflicts) console.error(`   ${conflict}`);
    console.error('\n改为锁一个不需要补丁的版本，或把修复落进可发布包自己的源码 / 产物。');
    process.exit(1);
  }

  process.stdout.write(`✅ Workspace patches passed（${patches.length} 个补丁均不覆盖可发布包的运行时依赖）.\n`);
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
