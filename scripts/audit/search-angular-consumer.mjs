/**
 * rxdb-plugin-search-angular 消费者测试：在临时 Angular 项目中安装构建产物并验证导入。
 */

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const workspaceRoot = process.cwd();
const sourceRoot = path.join(workspaceRoot, 'packages', 'rxdb-plugin-search-angular');
const buildRoot = path.join(workspaceRoot, 'dist', 'packages', 'rxdb-plugin-search-angular');
const workspacePackageJson = JSON.parse(await readFile(path.join(workspaceRoot, 'package.json'), 'utf8'));
const dependencyVersion = name => {
  const version = workspacePackageJson.dependencies?.[name] ?? workspacePackageJson.devDependencies?.[name];
  assert.ok(version, `Workspace manifest is missing ${name}`);
  return version;
};

const run = async (command, args, cwd, forwardOutput = true) => {
  const { stdout, stderr } = await execFileAsync(command, args, {
    cwd,
    maxBuffer: 32 * 1024 * 1024
  });
  if (forwardOutput) {
    process.stdout.write(stdout);
    process.stderr.write(stderr);
  }
  return stdout;
};

const pack = async (directory, destination) => {
  const previous = new Set(await readdir(destination));
  await run('pnpm', ['pack', '--pack-destination', destination, '--silent'], directory, false);
  const tarballs = (await readdir(destination)).filter(entry => entry.endsWith('.tgz') && !previous.has(entry));
  assert.equal(tarballs.length, 1, `pnpm pack produced ${tarballs.length} new tarballs for ${directory}`);
  return path.join(destination, tarballs[0]);
};

const extractUsageExample = async () => {
  const readme = await readFile(path.join(sourceRoot, 'README.md'), 'utf8');
  const usageStart = readme.indexOf('## 用法');
  assert.notEqual(usageStart, -1, 'README is missing the usage section');
  const nextSection = readme.indexOf('\n## ', usageStart + 1);
  const usageSection = readme.slice(usageStart, nextSection === -1 ? undefined : nextSection);
  const source = usageSection.match(/```typescript\s*\n([\s\S]*?)^```/m)?.[1];
  assert.ok(source, 'README usage section is missing a TypeScript example');
  return source;
};

const consumerRoot = await mkdtemp(path.join(tmpdir(), 'search-angular-consumer-'));
const tarballRoot = await mkdtemp(path.join(tmpdir(), 'search-angular-pack-'));
const stagedRoot = await mkdtemp(path.join(tmpdir(), 'search-angular-apf-'));

try {
  await cp(buildRoot, stagedRoot, { recursive: true });
  const stagedManifestPath = path.join(stagedRoot, 'package.json');
  const stagedManifest = JSON.parse(await readFile(stagedManifestPath, 'utf8'));
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const [name, range] of Object.entries(stagedManifest[field] ?? {})) {
      if (typeof range === 'string' && range.startsWith('workspace:')) {
        stagedManifest[field][name] = stagedManifest.version;
      }
    }
  }
  await writeFile(stagedManifestPath, JSON.stringify(stagedManifest, null, 2));

  const angularTarball = await pack(stagedRoot, tarballRoot);
  const tarListing = await run('tar', ['-tzf', angularTarball], workspaceRoot, false);
  assert.match(tarListing, /package\/fesm2022\/.*\.mjs/);
  assert.match(tarListing, /package\/types\/.*\.d\.ts/);
  assert.doesNotMatch(tarListing, /package\/src\//);
  assert.doesNotMatch(tarListing, /\.(?:spec|test)\.[cm]?[jt]sx?$/m);

  const packed = new Map();
  for (const directory of [
    'utils',
    'rxdb',
    'rxdb-adapter-encrypted',
    'rxdb-adapter-sqlite-core',
    'rxdb-adapter-sqlite-wasm',
    'rxdb-plugin-search'
  ]) {
    packed.set(directory, await pack(path.join(workspaceRoot, 'packages', directory), tarballRoot));
  }

  const packageJson = {
    name: 'search-angular-consumer',
    private: true,
    type: 'module',
    dependencies: {
      '@aiao/utils': `file:${packed.get('utils')}`,
      '@aiao/rxdb': `file:${packed.get('rxdb')}`,
      '@aiao/rxdb-adapter-encrypted': `file:${packed.get('rxdb-adapter-encrypted')}`,
      '@aiao/rxdb-adapter-sqlite-core': `file:${packed.get('rxdb-adapter-sqlite-core')}`,
      '@aiao/rxdb-adapter-sqlite-wasm': `file:${packed.get('rxdb-adapter-sqlite-wasm')}`,
      '@aiao/rxdb-plugin-search': `file:${packed.get('rxdb-plugin-search')}`,
      '@aiao/rxdb-plugin-search-angular': `file:${angularTarball}`,
      '@angular/core': dependencyVersion('@angular/core'),
      rxjs: dependencyVersion('rxjs'),
      tslib: dependencyVersion('tslib')
    },
    devDependencies: {
      '@types/node': dependencyVersion('@types/node')
    }
  };
  const compilerOptions = {
    module: 'NodeNext',
    moduleResolution: 'NodeNext',
    target: 'ES2022',
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    experimentalDecorators: true,
    types: ['node']
  };

  await writeFile(path.join(consumerRoot, 'package.json'), JSON.stringify(packageJson, null, 2));
  await writeFile(path.join(consumerRoot, '.npmrc'), 'node-linker=hoisted\n');
  await writeFile(path.join(consumerRoot, 'consumer.ts'), await extractUsageExample());
  await writeFile(
    path.join(consumerRoot, 'tsconfig.json'),
    JSON.stringify({ compilerOptions, files: ['./consumer.ts'] }, null, 2)
  );
  await writeFile(
    path.join(consumerRoot, 'tsconfig.bundler.json'),
    JSON.stringify(
      {
        compilerOptions: { ...compilerOptions, module: 'ESNext', moduleResolution: 'Bundler' },
        files: ['./consumer.ts']
      },
      null,
      2
    )
  );
  await run('pnpm', ['install', '--prefer-offline', '--ignore-scripts', '--no-frozen-lockfile'], consumerRoot);

  const tscPath = path.join(workspaceRoot, 'node_modules', 'typescript', 'bin', 'tsc');
  await run(process.execPath, [tscPath, '--project', 'tsconfig.json', '--pretty', 'false'], consumerRoot);
  await run(process.execPath, [tscPath, '--project', 'tsconfig.bundler.json', '--pretty', 'false'], consumerRoot);
  await writeFile(
    path.join(consumerRoot, 'runtime.mjs'),
    "import { useSearch } from '@aiao/rxdb-plugin-search-angular';\nif (typeof useSearch !== 'function') throw new Error('Angular search runtime export is missing');\n"
  );
  await run(process.execPath, ['runtime.mjs'], consumerRoot);
  process.stdout.write('Angular search APF consumer passed: tarball, NodeNext, Bundler, and runtime.\n');
} finally {
  await rm(consumerRoot, { force: true, recursive: true });
  await rm(tarballRoot, { force: true, recursive: true });
  await rm(stagedRoot, { force: true, recursive: true });
}
