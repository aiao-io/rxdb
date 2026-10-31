/**
 * 真实构建产物的 headless 外部消费者门禁。
 *
 * 该脚本在工作区外临时项目中复制模型包的构建产物，故不会经 tsconfig paths 或源码条件掩盖
 * exports / .d.ts 死链。第三方依赖复用工作区安装，VTable 解析由 loader 明确拒绝。
 */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const workspaceRoot = process.cwd();

const packages = [
  { name: '@aiao/rxdb-model', source: 'packages/rxdb-model' },
  { name: '@aiao/rxdb-model-angular', source: 'dist/packages/rxdb-model-angular' },
  { name: '@aiao/rxdb-model-react', source: 'packages/rxdb-model-react' },
  { name: '@aiao/rxdb-model-vue', source: 'packages/rxdb-model-vue' }
];

const workspaceDependencies = [
  ['@aiao/rxdb', 'packages/rxdb'],
  ['@aiao/rxdb-i18n', 'packages/rxdb-i18n'],
  ['@aiao/utils', 'packages/utils']
];

const readJson = async file => JSON.parse(await readFile(file, 'utf8'));

const exportTargets = (manifest, name) => {
  const entry = manifest.exports?.['./headless'];
  assert.ok(entry && typeof entry === 'object', `${name}: 缺少 ./headless exports`);
  const targets = [entry.types, entry.import, entry.default, entry.require].filter(Boolean);
  assert.ok(targets.length > 0, `${name}: ./headless 没有可消费目标`);
  return targets;
};

const writeProbe = async root => {
  await writeFile(
    path.join(root, 'probe.mjs'),
    `import assert from 'node:assert/strict';
assert.equal(typeof document, 'undefined');
for (const pkg of ${JSON.stringify(packages.map(item => item.name))}) {
  const namespace = await import(pkg + '/headless');
  assert.ok(Object.keys(namespace).length > 0, pkg + ' headless 入口没有导出');
}
console.log('✅ headless 构建产物外部消费者导入通过');
`
  );
};

const writeVtableBlocker = async root => {
  await writeFile(
    path.join(root, 'block-vtable-loader.mjs'),
    `import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const workspaceRequire = createRequire(${JSON.stringify(path.join(workspaceRoot, 'package.json'))});
export async function resolve(specifier, context, nextResolve) {
  if (specifier === '@visactor/vtable' || specifier.startsWith('@visactor/vtable-')) {
    throw new Error('headless 入口意外加载 VTable: ' + specifier);
  }
  if (!specifier.startsWith('@aiao/') && !specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.includes(':')) {
    return { url: pathToFileURL(workspaceRequire.resolve(specifier)).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
`
  );
};

const root = await mkdtemp(path.join(tmpdir(), 'rxdb-headless-consumer-'));
try {
  const scope = path.join(root, 'node_modules', '@aiao');
  await mkdir(scope, { recursive: true });
  for (const item of packages) {
    const source = path.join(workspaceRoot, item.source);
    const manifest = await readJson(path.join(source, 'package.json'));
    for (const target of exportTargets(manifest, item.name)) {
      assert.ok(existsSync(path.join(source, target)), `${item.name}: 构建产物缺少 ${target}`);
    }
    const destination = path.join(scope, item.name.slice('@aiao/'.length));
    await mkdir(destination, { recursive: true });
    await writeFile(path.join(destination, 'package.json'), JSON.stringify(manifest));
    if (item.name.endsWith('-angular')) await cp(source, destination, { recursive: true });
    else await cp(path.join(source, 'dist'), path.join(destination, 'dist'), { recursive: true });
  }
  for (const [name, relativeSource] of workspaceDependencies) {
    const target = path.join(root, 'node_modules', name);
    await mkdir(path.dirname(target), { recursive: true });
    await symlink(path.join(workspaceRoot, relativeSource), target, 'dir');
  }
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'headless-consumer', type: 'module' }));
  await writeProbe(root);
  await writeVtableBlocker(root);
  const result = await execFileAsync(process.execPath, ['--loader', './block-vtable-loader.mjs', 'probe.mjs'], {
    cwd: root,
    maxBuffer: 4 * 1024 * 1024
  });
  process.stdout.write(result.stdout);
} finally {
  await rm(root, { force: true, recursive: true });
}
