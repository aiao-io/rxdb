import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const websiteRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(websiteRoot, '..');

const readJson = path => JSON.parse(readFileSync(path, 'utf8'));

const sourceFiles = dir =>
  readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter(entry => entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name))
    .map(entry => join(entry.parentPath, entry.name));

// Nx 插件按约定推断出的目标名（nx.json 里各插件选项的 *Name / *TargetName）
const inferredTargets = () =>
  new Set(
    readJson(join(repoRoot, 'nx.json')).plugins.flatMap(plugin =>
      Object.entries(plugin.options ?? {}).flatMap(([key, value]) => {
        if (typeof value === 'string') return /Name$/.test(key) ? [value] : [];
        return Object.values(value ?? {}).filter(name => typeof name === 'string');
      })
    )
  );

/** 项目名 → 显式目标（project.json targets 与 package.json scripts）。 */
const projectTargets = () => {
  const projects = new Map();
  const roots = [repoRoot, websiteRoot, join(repoRoot, 'benchmarks')];
  for (const group of ['apps', 'packages', 'modules']) {
    for (const entry of readdirSync(join(repoRoot, group), { withFileTypes: true })) {
      if (entry.isDirectory()) roots.push(join(repoRoot, group, entry.name));
    }
  }
  for (const root of roots) {
    const projectJson = join(root, 'project.json');
    if (!existsSync(projectJson)) continue;
    const project = readJson(projectJson);
    const manifest = existsSync(join(root, 'package.json')) ? readJson(join(root, 'package.json')) : {};
    projects.set(
      project.name,
      new Set([...Object.keys(project.targets ?? {}), ...Object.keys(manifest.scripts ?? {})])
    );
  }
  return projects;
};

/** 工作区包声明的可执行名：`bin` 的键，外加带 `bin` 的包名本身（`npx <包名>` 运行它的 bin）。 */
const workspaceBins = () =>
  new Set(
    readdirSync(join(repoRoot, 'packages'), { withFileTypes: true })
      .filter(entry => entry.isDirectory() && existsSync(join(repoRoot, 'packages', entry.name, 'package.json')))
      .flatMap(entry => {
        const { bin, name } = readJson(join(repoRoot, 'packages', entry.name, 'package.json'));
        if (bin === undefined) return [];
        return typeof bin === 'string' ? [name] : [name, ...Object.keys(bin)];
      })
  );

// 页面里的命令写在 TSX 字符串里，Markdown 的文档检查扫不到；这里只认能确定归属的两种写法
test('页面与组件里可复制的命令指向工作区真实存在的目标或可执行文件', () => {
  const projects = projectTargets();
  const inferred = inferredTargets();
  const bins = workspaceBins();
  const problems = [];

  for (const file of sourceFiles(join(websiteRoot, 'src'))) {
    const content = readFileSync(file, 'utf8');
    const where = relative(websiteRoot, file);
    for (const [, project, target] of content.matchAll(/\bnx\s+run\s+([@\w./-]+):([\w-]+)/g)) {
      const targets = projects.get(project);
      if (!targets) problems.push(`${where}: 项目 ${project} 不存在`);
      else if (!targets.has(target) && !inferred.has(target)) problems.push(`${where}: ${project} 没有目标 ${target}`);
    }
    for (const [, bin] of content.matchAll(/\b(?:npx|pnpm exec)\s+((?:@aiao\/)?rxdb-[\w-]+)/g)) {
      if (!bins.has(bin)) problems.push(`${where}: 工作区没有可执行文件 ${bin}`);
    }
  }

  assert.deepEqual(problems, []);
});
