/**
 * rxdb-test 消费者测试：验证 sqlite-core 测试套件在临时消费者项目中的可复用性。
 */

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const workspaceRoot = process.cwd();
const packageDirectories = ['utils', 'rxdb', 'rxdb-adapter-encrypted', 'rxdb-test', 'rxdb-adapter-sqlite-core'];

// 这份清单是**故意**手写而不是从 `src/testing.ts` 反推的：它要钉住的正是
// "tarball 的 `/testing` 导出面没有悄悄增删"。新增一套共享套件属于导出面变更，
// 应当在这里显式登记一行。
//
// 2026-08-14：`rowsAffectedConformanceSuite` 随 desktop 分支进来时漏登记，
// 直到这次手动跑 consumer 才暴露 —— 因为 `consumer` target 根本不在 CI 里
// （见 requirements/README.md 的 C-0 开项）。
const suiteNames = [
  'adapterConstructionSuite',
  'bigintBinaryClientSuite',
  'bigintBinaryEntitySuite',
  'cascadeMutationSuite',
  'createSqliteClientSuite',
  'crudIntegrationSuite',
  'customPrimaryKeySuite',
  'joinSqlSuite',
  'menuIntegrationSuite',
  'querySqlSuite',
  'relationIntegrationSuite',
  'rowsAffectedConformanceSuite',
  'rxdbAdapterSuite',
  'sqliteClientBatchTimeoutSuite',
  'sqliteClientSuite',
  'sqliteRepositorySuite',
  'systemSchemaMigrationSuite',
  'tableIndexSuite',
  'transactionSqliteResultSuite',
  'treeIntegrationSuite',
  'undoRedoSuite',
  'versionBranchSuite'
];

const run = async (command, args, cwd, forwardOutput = true) => {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd,
      maxBuffer: 16 * 1024 * 1024
    });
    if (forwardOutput) {
      process.stdout.write(stdout);
      process.stderr.write(stderr);
    }
  } catch (error) {
    if (forwardOutput && error && typeof error === 'object') {
      if ('stdout' in error && typeof error.stdout === 'string') process.stdout.write(error.stdout);
      if ('stderr' in error && typeof error.stderr === 'string') process.stderr.write(error.stderr);
    }
    throw error;
  }
};

const pack = async (packageDirectory, destination) => {
  const previous = new Set(await readdir(destination));
  await run('pnpm', ['pack', '--pack-destination', destination, '--silent'], packageDirectory, false);
  const tarballs = (await readdir(destination)).filter(entry => entry.endsWith('.tgz') && !previous.has(entry));
  assert.equal(tarballs.length, 1, `pnpm pack produced ${tarballs.length} new tarballs for ${packageDirectory}`);
  return path.join(destination, tarballs[0]);
};

const writeRuntime = async root => {
  const source = `
import assert from 'node:assert/strict';
import * as testing from '@aiao/rxdb-adapter-sqlite-core/testing';

const expectedSuiteNames = ${JSON.stringify(suiteNames, null, 2)};
const actualSuiteNames = Object.keys(testing).filter(name => name.endsWith('Suite')).sort();

assert.deepEqual(actualSuiteNames, expectedSuiteNames.toSorted());
for (const name of expectedSuiteNames) assert.equal(typeof testing[name], 'function', name);
assert.equal(typeof testing.cloneEntityClasses, 'function');

class Entity {}
const [Clone] = testing.cloneEntityClasses([Entity]);
assert.notEqual(Clone, Entity);
assert.equal(Object.getPrototypeOf(Clone), Entity);
`;
  await writeFile(path.join(root, 'runtime.mjs'), source);
};

const consumerRoot = await mkdtemp(path.join(tmpdir(), 'sqlite-core-testing-consumer-'));
const tarballRoot = await mkdtemp(path.join(tmpdir(), 'sqlite-core-testing-pack-'));

try {
  const packed = new Map();
  for (const directory of packageDirectories) {
    packed.set(directory, await pack(path.join(workspaceRoot, 'packages', directory), tarballRoot));
  }

  const corePackageJson = JSON.parse(
    await readFile(path.join(workspaceRoot, 'packages/rxdb-adapter-sqlite-core/package.json'), 'utf8')
  );
  const localOverrides = Object.fromEntries(
    packageDirectories.map(directory => [`@aiao/${directory}`, `file:${packed.get(directory)}`])
  );
  const packageJson = {
    name: 'sqlite-core-testing-consumer',
    private: true,
    type: 'module',
    dependencies: {
      '@aiao/rxdb-adapter-sqlite-core': `file:${packed.get('rxdb-adapter-sqlite-core')}`,
      vitest: corePackageJson.devDependencies.vitest
    },
    pnpm: {
      overrides: localOverrides
    }
  };

  await writeFile(path.join(consumerRoot, 'package.json'), JSON.stringify(packageJson, null, 2));
  await writeFile(path.join(consumerRoot, '.npmrc'), 'node-linker=hoisted\n');
  await writeRuntime(consumerRoot);
  await run('pnpm', ['install', '--prefer-offline', '--ignore-scripts', '--no-frozen-lockfile'], consumerRoot);
  await run(process.execPath, ['runtime.mjs'], consumerRoot);
  process.stdout.write(
    `Published testing consumer passed: ${suiteNames.length} shared suites and cloneEntityClasses.\n`
  );
} finally {
  await rm(consumerRoot, { force: true, recursive: true });
  await rm(tarballRoot, { force: true, recursive: true });
}
