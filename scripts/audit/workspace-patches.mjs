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

/** 顶层扁平映射里的一行（行尾注释已剥掉）：两格缩进、可带引号的键、非空的值。 */
const MAP_ENTRY = /^ {2}(['"]?)(.+?)\1:\s*(\S.*)$/;

/** 行尾注释：YAML 里 `#` 前必须有空白。 */
const TRAILING_COMMENT = /\s+#.*$/;

/** 精确版本号：只有这种写法能证明消费方解析不到被打补丁的版本。 */
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/**
 * 读 `pnpm-workspace.yaml` 里一个顶层扁平映射（`patchedDependencies`、`overrides`）的条目。
 * 注释行（含顶格的）与行尾注释都跳过，遇到下一个顶层键即结束。
 *
 * @param {string} workspaceYaml 文件内容
 * @param {string} section 顶层键名
 * @returns {{ key: string, value: string }[]} 段不存在时为空
 * @throws 段内出现不是「两格缩进的 `键: 值`」的行
 */
function readTopLevelMap(workspaceYaml, section) {
  const lines = workspaceYaml.split('\n');
  const header = new RegExp(`^${section}:\\s*(?:#.*)?$`);
  const start = lines.findIndex(line => header.test(line));
  if (start < 0) return [];

  const entries = [];
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    if (!line.startsWith('  ')) break;
    const matched = MAP_ENTRY.exec(line.replace(TRAILING_COMMENT, ''));
    if (matched === null) throw new Error(`pnpm-workspace.yaml: 无法解析 ${section} 条目「${line}」`);
    entries.push({ key: matched[2], value: matched[3].trim().replace(/^(['"])(.*)\1$/, '$2') });
  }
  return entries;
}

/** 去掉版本选择器的包名：`@babel/core@7` → `@babel/core`，`axios@1` → `axios`，`left-pad` 不变。 */
const packageNameOf = spec => {
  const at = spec.lastIndexOf('@');
  return at > 0 ? spec.slice(0, at) : spec;
};

/**
 * 解析 `pnpm-workspace.yaml` 的 `patchedDependencies` 段。
 *
 * @param {string} workspaceYaml 文件内容
 * @returns {{ key: string, name: string, version: string | null, patch: string }[]} 只写包名的键（对所有版本生效）`version` 为 null
 */
export function parsePatchedDependencies(workspaceYaml) {
  return readTopLevelMap(workspaceYaml, 'patchedDependencies').map(({ key, value }) => {
    const name = packageNameOf(key);
    return { key, name, version: name === key ? null : key.slice(name.length + 1), patch: value };
  });
}

/**
 * `overrides` 改写的包名：选择器 `父包>子包` 取最后一段，再去掉版本选择器。
 *
 * @param {string} workspaceYaml 文件内容
 * @returns {Set<string>}
 */
export function parseOverriddenPackages(workspaceYaml) {
  return new Set(readTopLevelMap(workspaceYaml, 'overrides').map(({ key }) => packageNameOf(key.split('>').at(-1))));
}

/** 依赖声明指向的真实包：`npm:` 别名取别名后面的包名与版本。 */
const resolveDependency = (key, spec) => {
  if (!spec.startsWith('npm:')) return { name: key, range: spec };
  const target = spec.slice('npm:'.length);
  const name = packageNameOf(target);
  return { name, range: name === target ? '' : target.slice(name.length + 1) };
};

const runtimeDependenciesOf = record =>
  RUNTIME_DEPENDENCY_KINDS.flatMap(kind =>
    Object.entries(record.manifest[kind] ?? {}).map(([key, spec]) => ({
      kind,
      key,
      spec,
      ...resolveDependency(key, spec)
    }))
  );

/** 精确钉在补丁之外的版本、且没被 overrides 改写，才证明工作区与消费方拿到的都不是补丁版。 */
const escapesPatch = (patch, dependency, overridden) =>
  patch.version !== null &&
  EXACT_VERSION.test(dependency.range) &&
  dependency.range !== patch.version &&
  !overridden.has(dependency.name);

/**
 * 找出被工作区补丁覆盖的可发布包运行时依赖（含 `npm:` 别名）。
 *
 * 范围、tag、URL 会被消费方解析到哪个版本无从证明，被 overrides 改写的包工作区装的也不是清单里的版本，都按命中处理。
 * 只看直接依赖：传递依赖由消费方的包管理器另行解析。
 *
 * @param {{ key: string, name: string, version: string | null, patch: string }[]} patches 解析出的补丁
 * @param {{ name: string, manifest: Record<string, unknown> }[]} packages 可发布包记录
 * @param {Set<string>} [overridden] `overrides` 改写的包名
 * @returns {string[]} 形如 `@aiao/a dependencies foo@1.4.0 <- foo@1.4.0 (patches/foo@1.4.0.patch)`
 */
export function findPublishedPatchConflicts(patches, packages, overridden = new Set()) {
  return packages.flatMap(record =>
    runtimeDependenciesOf(record).flatMap(dependency =>
      patches
        .filter(patch => patch.name === dependency.name && !escapesPatch(patch, dependency, overridden))
        .map(
          patch =>
            `${record.name} ${dependency.kind} ${dependency.key}@${dependency.spec} <- ${patch.key} (${patch.patch})`
        )
    )
  );
}

const main = () => {
  const root = path.resolve(import.meta.dirname, '../..');
  const workspaceYaml = readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8');
  const patches = parsePatchedDependencies(workspaceYaml);
  const conflicts = findPublishedPatchConflicts(
    patches,
    scanPackages(path.join(root, 'packages')),
    parseOverriddenPackages(workspaceYaml)
  );

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
