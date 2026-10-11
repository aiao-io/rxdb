import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function scanPackages(packagesRoot, includeDirectory = () => true) {
  const root = packagesRoot instanceof URL ? fileURLToPath(packagesRoot) : packagesRoot;
  return readdirSync(root)
    .filter(
      name =>
        statSync(join(root, name)).isDirectory() &&
        includeDirectory(join(root, name)) &&
        existsSync(join(root, name, 'package.json'))
    )
    .map(name => {
      const directory = join(root, name);
      const source = join(directory, 'package.json');
      const manifest = JSON.parse(readFileSync(source, 'utf8'));
      return { name: manifest.name, directory, source, manifest };
    })
    .filter(record => record.manifest.private !== true)
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

export function discoverRelease(root) {
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  let tag;
  try {
    tag = git('describe', '--tags', '--match', 'v[0-9]*', '--abbrev=0');
  } catch (error) {
    throw new Error(`release tag 发现失败：需要可达的 v* 发布标签（${error.message}）`, { cause: error });
  }
  const directories = git('ls-tree', '-d', '--name-only', `${tag}:packages`).split('\n').filter(Boolean);
  const packages = directories
    .flatMap(directory => {
      const manifestPath = `packages/${directory}/package.json`;
      const files = git('ls-tree', '--name-only', `${tag}:${`packages/${directory}`}`);
      if (!files.split('\n').includes('package.json')) return [];
      const manifest = JSON.parse(git('show', `${tag}:${manifestPath}`));
      return manifest.private === true ?
          []
        : [
            {
              name: manifest.name,
              directory: join(root, 'packages', directory),
              source: `${tag}:${manifestPath}`,
              manifest
            }
          ];
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
  return { tag, version: tag.slice(1), packages };
}

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
