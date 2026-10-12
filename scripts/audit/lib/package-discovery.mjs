/**
 * 包扫描与发布发现：门禁范围与投递范围两个出口，返回同构的包记录 `{ name, directory, source, manifest }`。
 *
 * @remarks
 * 门禁范围读工作区 `packages/*`；投递范围读事实源 `release` 登记的发布标签树（`git ls-tree` / `git show`，离线、确定）。
 * 发布标签是登记的，不是 `git describe` 探测的：打 tag 发生在任何提交之外，门禁结论若随它改变，
 * 发布后第一轮 CI 必红；登记切换则是一次可评审的提交。
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const byName = (a, b) => a.name.localeCompare(b.name, 'en');

function packageName({ source, manifest }) {
  if (typeof manifest.name !== 'string' || !manifest.name) throw new Error(`${source}: manifest 缺少 name`);
  return manifest.name;
}

/**
 * 扫描门禁范围：`packages/*` 下带 `package.json` 且非 private 的包。
 *
 * @param packagesRoot - `packages/` 目录（路径或 file URL）
 * @param includeDirectory - 解析 manifest 之前的目录过滤，API 基线范围用它裁剪
 * @returns 按包名排序的包记录
 * @throws 非 private 的 manifest 缺少 `name` 时，错误指向该 manifest
 */
export function scanPackages(packagesRoot, includeDirectory = () => true) {
  const root = packagesRoot instanceof URL ? fileURLToPath(packagesRoot) : packagesRoot;
  return readdirSync(root)
    .map(name => join(root, name))
    .filter(
      directory =>
        statSync(directory).isDirectory() && includeDirectory(directory) && existsSync(join(directory, 'package.json'))
    )
    .map(directory => {
      const source = join(directory, 'package.json');
      return { directory, source, manifest: JSON.parse(readFileSync(source, 'utf8')) };
    })
    .filter(record => record.manifest.private !== true)
    .map(record => ({ name: packageName(record), ...record }))
    .sort(byName);
}

/**
 * 读取登记的发布标签树，得出投递范围。
 *
 * @param root - 仓库根目录
 * @param tag - 事实源 `release` 登记的发布标签，如 `v0.0.26`
 * @returns 标签、版本与标签树里的非 private 包
 * @throws 标签不在本地（浅克隆、未 fetch tags）时明确失败，不回退到工作树
 */
export function discoverRelease(root, tag) {
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    git('rev-parse', '--verify', '--quiet', `refs/tags/${tag}`);
  } catch (error) {
    throw new Error(`发布标签 ${tag} 不在本地：先 git fetch --tags（浅克隆还要补齐历史）`, { cause: error });
  }
  const packages = git('ls-tree', '-r', '--name-only', tag, '--', 'packages')
    .split('\n')
    .filter(path => /^packages\/[^/]+\/package\.json$/.test(path))
    .map(path => ({
      directory: join(root, dirname(path)),
      source: `${tag}:${path}`,
      manifest: JSON.parse(git('show', `${tag}:${path}`))
    }))
    .filter(record => record.manifest.private !== true)
    .map(record => ({ name: packageName(record), ...record }))
    .sort(byName);
  return { tag, version: tag.slice(1), packages };
}

/**
 * manifest 里指向 `@aiao/*` 兄弟包的实现依赖边（dependencies / peer / optional）。
 *
 * @param record - 包记录
 * @returns 按包名、依赖种类排序的边；`optional` 合并 optionalDependencies 与 `peerDependenciesMeta.optional`
 */
export function dependencyEdges(record) {
  return ['dependencies', 'peerDependencies', 'optionalDependencies']
    .flatMap(kind =>
      Object.entries(record.manifest[kind] ?? {})
        .filter(([name]) => name.startsWith('@aiao/'))
        .map(([name, range]) => ({
          name,
          kind,
          range,
          optional: kind === 'optionalDependencies' || record.manifest.peerDependenciesMeta?.[name]?.optional === true
        }))
    )
    .sort((a, b) => a.name.localeCompare(b.name, 'en') || a.kind.localeCompare(b.kind, 'en'));
}
