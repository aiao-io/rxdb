/**
 * 给从 dist 发布的包补齐 `@aiao/*` 兄弟链接（US-602 A2 发布链配套）。
 *
 * `pnpm pack` / `pnpm publish` 改写 `workspace:^` 时，peer 的版本从**包目录下的**
 * `node_modules/<dep>` 读 manifest：工作区成员走 lockfile 的 importer 记录解析，
 * 而从 `dist/packages/<name>`（非工作区成员）发布时没有 importer 记录，缺链接就会
 * 抛 `ERR_PNPM_CANNOT_RESOLVE_WORKSPACE_PROTOCOL`。
 *
 * 本脚本按解析后的发布根（`nx-release-publish` 的 `packageRoot`，缺省项目根）把
 * manifest 里所有带 `workspace:` 协议的 `@aiao/*` 依赖边链接成
 * `<发布根>/node_modules/@aiao/<name>` → `packages/<name>` 的符号链接。
 * 幂等、只增不删；工作区成员发布（packageRoot 即项目根）时链接由 lockfile 解析承担，跳过。
 *
 * @example
 * ```bash
 * node scripts/audit/link-release-peers.mjs packages/rxdb-angular
 * ```
 */

import { existsSync, mkdirSync, readFileSync, symlinkSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** 按与 `nx release publish` 一致的口径解析发布根。 */
export function resolvePackageRoot(workspaceRoot, directory) {
  const projectConfigPath = join(workspaceRoot, directory, 'project.json');
  if (!existsSync(projectConfigPath)) return directory;
  const configured = JSON.parse(readFileSync(projectConfigPath, 'utf8')).targets?.['nx-release-publish']?.options
    ?.packageRoot;
  return configured ? configured.replaceAll('{projectRoot}', directory) : directory;
}

/** manifest 里带 workspace 协议的 `@aiao/*` 安装边（peer 与 dependencies）。 */
export function workspaceSiblingEdges(manifest) {
  return Object.entries({
    ...(manifest.peerDependencies ?? {}),
    ...(manifest.dependencies ?? {})
  })
    .filter(([name, range]) => name.startsWith('@aiao/') && range.startsWith('workspace:'))
    .map(([name]) => name);
}

/**
 * 在发布根下补齐兄弟链接。返回创建（或已存在）的链接目标列表。
 *
 * @param workspaceRoot - 仓库根
 * @param directory - 项目目录（如 `packages/rxdb-angular`）
 * @param options.dryRun - 只报告不创建
 */
export function linkReleasePeers(workspaceRoot, directory, options = {}) {
  const packageRoot = resolvePackageRoot(workspaceRoot, directory);
  if (packageRoot === directory) return [];
  const packageRootPath = resolve(workspaceRoot, packageRoot);
  const manifest = JSON.parse(readFileSync(join(packageRootPath, 'package.json'), 'utf8'));
  const links = [];
  for (const name of workspaceSiblingEdges(manifest)) {
    const source = resolve(workspaceRoot, 'packages', name.replace('@aiao/', ''));
    if (!existsSync(join(source, 'package.json'))) continue;
    const target = join(packageRootPath, 'node_modules', '@aiao', name.replace('@aiao/', ''));
    if (existsSync(target)) continue;
    if (options.dryRun) {
      links.push(`${target} -> ${source}`);
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    symlinkSync(relative(dirname(target), source), target);
    links.push(`${target} -> ${source}`);
  }
  return links;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const workspaceRoot = process.cwd();
  const directories = process.argv.slice(2);
  if (!directories.length) {
    console.error('用法：node scripts/audit/link-release-peers.mjs <projectRoot>…');
    process.exitCode = 1;
  } else {
    for (const directory of directories) {
      const links = linkReleasePeers(workspaceRoot, directory);
      console.log(
        `${directory}: ${links.length ? `链接 ${links.map(link => basename(link.split(' -> ')[0])).join(', ')}` : '无需链接（发布根即项目根或无 workspace 边）'}`
      );
    }
  }
}
