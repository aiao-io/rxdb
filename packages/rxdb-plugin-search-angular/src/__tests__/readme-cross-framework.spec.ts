/**
 * README「三框架同功能对称」一句里的入口名与各包入口对账（RV-01a1bbc1f1d1）。
 *
 * @remarks
 * 使用者顺着这句去另一端接入：写错的名字（曾写成不存在的 `injectSearch`）在导入处直接失败。
 * 这里从 README 取出「X 用 `name`（[`@aiao/包名`](…)）」的每一对，核对 `name` 确实是那个包
 * `src/index.ts` 的具名导出。React / Vue 侧同款用例。
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const PACKAGES_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const PACKAGE_DIR = 'rxdb-plugin-search-angular';

const readmeOf = (packageDir: string): string => readFileSync(resolve(PACKAGES_ROOT, packageDir, 'README.md'), 'utf8');

/** 包入口 `src/index.ts` 的具名导出。 */
const exportedNames = (packageDir: string): Set<string> => {
  const path = resolve(PACKAGES_ROOT, packageDir, 'src/index.ts');
  const file = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, false);
  const names = file.statements
    .filter(ts.isExportDeclaration)
    .flatMap(statement =>
      statement.exportClause && ts.isNamedExports(statement.exportClause) ? [...statement.exportClause.elements] : []
    )
    .map(element => element.name.text);
  return new Set(names);
};

/** README 里「用 `name`（[`@aiao/包名`]」的每一对。 */
const crossFrameworkEntries = (readme: string): { name: string; packageName: string }[] =>
  [...readme.matchAll(/用 `(\w+)`（\[`(@aiao\/[\w-]+)`\]/g)].map(([, name, packageName]) => ({ name, packageName }));

describe('README 三框架对称说明', () => {
  it('点名的每个入口都是对应包的具名导出', () => {
    const entries = crossFrameworkEntries(readmeOf(PACKAGE_DIR));
    const missing = entries.filter(
      ({ name, packageName }) => !exportedNames(packageName.replace('@aiao/', '')).has(name)
    );

    expect(entries.length).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });
});
