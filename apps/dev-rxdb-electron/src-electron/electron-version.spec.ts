import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { satisfies, validRange } from 'semver';
import { describe, expect, it } from 'vitest';

interface Manifest {
  devDependencies?: Record<string, string>;
  version?: string;
}

const appDir = resolve(import.meta.dirname, '..');
const repoRoot = resolve(appDir, '../..');

function readManifest(path: string): Manifest {
  return JSON.parse(readFileSync(path, 'utf8')) as Manifest;
}

const appPin = readManifest(resolve(appDir, 'package.json')).devDependencies?.['electron'];
const rootRange = readManifest(resolve(repoRoot, 'package.json')).devDependencies?.['electron'];
const installed = readManifest(resolve(repoRoot, 'node_modules/electron/package.json')).version;

/**
 * ELEC-16 的门禁。
 *
 * 这个包有**两份 manifest**：开发时装的是根 manifest 的 electron，
 * 而 `project.json` 的 `electron-build` 会把 app manifest 复制进 dist
 * （`cp package.json ../../dist/apps/dev-rxdb-electron/`），
 * electron-builder 正是从那份解析要打包的 runtime 版本。
 *
 * 两者漂移时开发跑一个版本、打包出另一个版本，而**没有任何信号**——
 * ELEC-16 第一次修复只是手工对齐了数字，没有门禁，于是根 manifest 升到
 * `^43.3.0` 后它立刻又漂回去了。这组用例就是补上那道门禁。
 */
describe('ELEC-16 两份 manifest 的 electron 版本', () => {
  it('两处都声明了 electron', () => {
    expect(appPin).toBeTypeOf('string');
    expect(rootRange).toBeTypeOf('string');
    expect(installed).toBeTypeOf('string');
  });

  it('app manifest 必须是精确版本 —— electron-builder 按它下载 runtime', () => {
    expect(validRange(appPin)).toBe(appPin);
  });

  it('app 的精确版本落在根 manifest 的范围内', () => {
    expect(satisfies(appPin as string, rootRange as string)).toBe(true);
  });

  it('打包版本与实际安装的开发版本一致', () => {
    expect(appPin).toBe(installed);
  });
});
