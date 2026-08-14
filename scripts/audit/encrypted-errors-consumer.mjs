/**
 * `@aiao/rxdb-adapter-encrypted` 消费者测试：验证错误身份契约在**打包产物**上依然成立。
 *
 * 为什么不能只靠 `src/__tests__/errors.spec.ts`：那套单测跑在源码上，
 * 而源码永远不会被 mangle，所以它对本文件要防的这类退化天生免疫 ——
 * 一旦某个 class 的 `name` 改回从构造函数身份推导（`new.target.name` /
 * `this.constructor.name`），源码测试照绿，装到用户项目里的 `dist` 却会
 * 把 `EncryptedLockedError` 报成 `"r"`。
 *
 * `name` 是被 `@aiao/rxdb-test/encrypted` 的 `error-contract.ts` 当作跨包
 * class 身份契约用的公开 API，所以它必须在 tarball 这一层被钉住。
 */

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const workspaceRoot = process.cwd();
const packageDirectories = ['utils', 'rxdb', 'rxdb-adapter-encrypted'];

/** 每个具体错误类一条：构造参数 → 期望的 `name` 与 `code`。 */
const errorContract = [
  {
    className: 'EncryptedConfigurationError',
    init: { code: 'no_encrypted_columns', message: 'x' },
    name: 'EncryptedConfigurationError'
  },
  { className: 'EncryptedLockedError', init: { message: 'x' }, name: 'EncryptedLockedError' },
  {
    className: 'EncryptedUnlockError',
    init: { code: 'verifier_mismatch', message: 'x' },
    name: 'EncryptedUnlockError'
  },
  { className: 'EncryptedDecryptError', init: { code: 'auth_failure', message: 'x' }, name: 'EncryptedDecryptError' },
  { className: 'EncryptedQueryError', init: { code: 'where_on_encrypted', message: 'x' }, name: 'EncryptedQueryError' }
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
import * as encrypted from '@aiao/rxdb-adapter-encrypted';

const contract = ${JSON.stringify(errorContract, null, 2)};

for (const { className, init, name } of contract) {
  const Ctor = encrypted[className];
  assert.equal(typeof Ctor, 'function', className + ' is not exported from the tarball');

  const error = new Ctor(init);
  assert.ok(error instanceof Error, className + ' is not an Error');
  // 这条是本脚本存在的理由：mangle 过的产物里它会是 "r" / "o" 这样的单字母。
  assert.equal(error.name, name, className + '.name degraded to ' + JSON.stringify(error.name));
  assert.equal(error.code, init.code ?? 'locked', className + '.code mismatch');
  assert.ok(error.message.length > 0, className + '.message is empty');
}
`;
  await writeFile(path.join(root, 'runtime.mjs'), source);
};

const consumerRoot = await mkdtemp(path.join(tmpdir(), 'encrypted-errors-consumer-'));
const tarballRoot = await mkdtemp(path.join(tmpdir(), 'encrypted-errors-pack-'));

try {
  const packed = new Map();
  for (const directory of packageDirectories) {
    packed.set(directory, await pack(path.join(workspaceRoot, 'packages', directory), tarballRoot));
  }

  const localOverrides = Object.fromEntries(
    packageDirectories.map(directory => [`@aiao/${directory}`, `file:${packed.get(directory)}`])
  );
  const encryptedPackageJson = JSON.parse(
    await readFile(path.join(workspaceRoot, 'packages/rxdb-adapter-encrypted/package.json'), 'utf8')
  );
  const packageJson = {
    name: 'encrypted-errors-consumer',
    private: true,
    type: 'module',
    // 每个 `@aiao/*` 都必须**同时**出现在 dependencies 和 pnpm.overrides 里，缺一不可：
    //
    // - 只给 overrides 不够：`@aiao/rxdb` 是 rxdb-adapter-encrypted 的 peerDependency，
    //   pnpm 的 auto-install-peers 会把它当作**根项目的直接依赖**注入，绕过 overrides，
    //   于是去 registry 找 `@aiao/rxdb@<本地版本>`。
    // - 只给 dependencies 不够：tarball 内部的依赖按 semver 从 registry 解析，不会
    //   与根上的 `file:` 去重。
    //
    // 两者都缺时的表现极具迷惑性：只要 registry 上**恰好**有同号版本，安装就成功，
    // 但被测的其实是 npm 上那份旧代码，不是本地产物 —— 门禁看着绿，实际什么也没验。
    // 这个坑是 2026-08-14 把版本抬到未发布的 0.0.25 时才炸出来的。
    dependencies: {
      ...localOverrides,
      rxjs: encryptedPackageJson.peerDependencies?.rxjs ?? encryptedPackageJson.dependencies?.rxjs ?? '*'
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
    `Published encrypted consumer passed: ${errorContract.length} error classes keep their name/code.\n`
  );
} finally {
  await rm(consumerRoot, { force: true, recursive: true });
  await rm(tarballRoot, { force: true, recursive: true });
}
