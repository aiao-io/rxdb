/**
 * 单个包的运行时条件检查：npm pack → 临时目录安装 tarball → import → 验证所有导出可用。
 *
 * 用法: node scripts/audit/package-runtime-condition.mjs <package-directory>
 */

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const workspaceRoot = process.cwd();
const packagePath = process.argv[2];

assert.ok(packagePath, 'Usage: node package-runtime-condition.mjs <package-directory>');

const packageRoot = path.resolve(workspaceRoot, packagePath);
const packageJson = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
const consumerRoot = await mkdtemp(path.join(tmpdir(), 'package-runtime-condition-'));
const tarballRoot = await mkdtemp(path.join(tmpdir(), 'package-runtime-pack-'));

const run = (command, args, cwd) =>
  execFileAsync(command, args, {
    cwd,
    maxBuffer: 16 * 1024 * 1024
  });

const linkDependency = async dependency => {
  const packageJsonPath = require.resolve(`${dependency}/package.json`);
  const destination = path.join(consumerRoot, 'node_modules', ...dependency.split('/'));
  await mkdir(path.dirname(destination), { recursive: true });
  await symlink(path.dirname(packageJsonPath), destination, 'dir');
};

try {
  await run('pnpm', ['pack', '--pack-destination', tarballRoot, '--silent'], packageRoot);
  const tarballs = (await readdir(tarballRoot)).filter(entry => entry.endsWith('.tgz'));
  assert.equal(tarballs.length, 1, `pnpm pack produced ${tarballs.length} tarballs`);

  const extractedRoot = path.join(consumerRoot, 'extracted');
  await mkdir(extractedRoot);
  await run('tar', ['-xzf', path.join(tarballRoot, tarballs[0]), '-C', extractedRoot], workspaceRoot);

  const packageDestination = path.join(consumerRoot, 'node_modules', ...packageJson.name.split('/'));
  await mkdir(path.dirname(packageDestination), { recursive: true });
  await rename(path.join(extractedRoot, 'package'), packageDestination);

  const dependencies = new Set([
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.peerDependencies ?? {})
  ]);
  for (const dependency of dependencies) {
    await linkDependency(dependency);
  }

  await writeFile(path.join(consumerRoot, 'consumer.mjs'), `await import('${packageJson.name}');\n`);
  await run(process.execPath, ['--conditions=@aiao/source', 'consumer.mjs'], consumerRoot);
  process.stdout.write(`Runtime condition passed from tarball: ${packageJson.name}.\n`);
} finally {
  await rm(consumerRoot, { force: true, recursive: true });
  await rm(tarballRoot, { force: true, recursive: true });
}
