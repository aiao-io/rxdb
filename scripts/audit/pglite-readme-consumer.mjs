/**
 * PGlite 适配器消费者测试：验证 README 中的代码示例能否在真实消费者项目中运行。
 */

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const workspaceRoot = process.cwd();
const packageDirectory = path.join(workspaceRoot, 'packages', 'rxdb-adapter-pglite');

const run = async (command, args, cwd, forwardOutput = true) => {
  const { stdout, stderr } = await execFileAsync(command, args, {
    cwd,
    maxBuffer: 64 * 1024 * 1024
  });
  if (forwardOutput) {
    process.stdout.write(stdout);
    process.stderr.write(stderr);
  }
};

const pack = async (directory, destination) => {
  const previous = new Set(await readdir(destination));
  await run('pnpm', ['pack', '--pack-destination', destination, '--silent'], directory, false);
  const tarballs = (await readdir(destination)).filter(entry => entry.endsWith('.tgz') && !previous.has(entry));
  assert.equal(tarballs.length, 1, `pnpm pack produced ${tarballs.length} new tarballs for ${directory}`);
  return path.join(destination, tarballs[0]);
};

const extractUsageExample = async () => {
  const readme = await readFile(path.join(packageDirectory, 'README.md'), 'utf8');
  const usageStart = readme.indexOf('## 使用');
  assert.notEqual(usageStart, -1, 'README is missing the usage section');
  const nextSection = readme.indexOf('\n## ', usageStart + 1);
  const usageSection = readme.slice(usageStart, nextSection === -1 ? undefined : nextSection);
  const source = usageSection.match(/```typescript\s*\n([\s\S]*?)^```/m)?.[1];
  assert.ok(source, 'README usage section is missing a TypeScript example');
  return source;
};

const workspacePackageJson = JSON.parse(await readFile(path.join(workspaceRoot, 'package.json'), 'utf8'));
const consumerRoot = await mkdtemp(path.join(tmpdir(), 'pglite-readme-consumer-'));
const tarballRoot = await mkdtemp(path.join(tmpdir(), 'pglite-readme-pack-'));

try {
  const packed = new Map();
  for (const directory of ['utils', 'rxdb', 'rxdb-adapter-encrypted', 'rxdb-adapter-pglite']) {
    packed.set(directory, await pack(path.join(workspaceRoot, 'packages', directory), tarballRoot));
  }

  // 每个 `@aiao/*` 都必须**同时**出现在 dependencies 和 pnpm.overrides 里：dependencies
  // 只管根上这一层，tarball **内部**的 `@aiao/*` 仍按 semver 从 registry 解析，不会与根上
  // 的 `file:` 去重；而 peerDependency 又会被 auto-install-peers 注入成根的直接依赖、绕过
  // overrides。只要 registry 上恰好有同号版本，缺失时安装照样成功，验的却是 npm 上那份旧
  // 代码 —— 门禁看着绿，实际什么也没验。2026-08-14 把版本抬到未发布的 0.0.25 才炸出来。
  const localOverrides = {
    '@aiao/utils': `file:${packed.get('utils')}`,
    '@aiao/rxdb': `file:${packed.get('rxdb')}`,
    '@aiao/rxdb-adapter-encrypted': `file:${packed.get('rxdb-adapter-encrypted')}`,
    '@aiao/rxdb-adapter-pglite': `file:${packed.get('rxdb-adapter-pglite')}`
  };
  const packageJson = {
    name: 'pglite-readme-consumer',
    private: true,
    type: 'module',
    dependencies: localOverrides,
    pnpm: {
      overrides: localOverrides
    },
    devDependencies: {
      '@types/ms': workspacePackageJson.devDependencies['@types/ms'],
      '@types/node': workspacePackageJson.devDependencies['@types/node']
    }
  };
  const tsconfig = {
    compilerOptions: {
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      target: 'ES2022',
      strict: true,
      outDir: './dist',
      skipLibCheck: true,
      types: ['node']
    },
    files: ['./consumer.ts']
  };

  await writeFile(path.join(consumerRoot, 'package.json'), JSON.stringify(packageJson, null, 2));
  await writeFile(path.join(consumerRoot, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));
  await writeFile(path.join(consumerRoot, '.npmrc'), 'node-linker=hoisted\n');
  await writeFile(path.join(consumerRoot, 'consumer.ts'), await extractUsageExample());
  await run('pnpm', ['install', '--prefer-offline', '--ignore-scripts', '--no-frozen-lockfile'], consumerRoot);

  const tscPath = path.join(workspaceRoot, 'node_modules', 'typescript', 'bin', 'tsc');
  await run(process.execPath, [tscPath, '--project', 'tsconfig.json', '--pretty', 'false'], consumerRoot);
  await run(process.execPath, ['dist/consumer.js'], consumerRoot);
  process.stdout.write('PGlite README consumer passed: packed exports, strict types, and runtime.\n');
} finally {
  await rm(consumerRoot, { force: true, recursive: true });
  await rm(tarballRoot, { force: true, recursive: true });
}
