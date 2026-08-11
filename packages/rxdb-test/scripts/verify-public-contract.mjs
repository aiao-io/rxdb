import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/**
 * 发布表面门禁。
 *
 * RXT-028：早先这里只抽查 11 个符号（root 3 / encrypted 4 / entities 2 / shop 2），
 * 而五个入口运行时共导出 52 个 —— `clearEntityRecords`、`makeSearchParityComments`、
 * `runQueryValidationSuite`、`FileLarge`、`SKUAttributes` 等被删除或改名时 build 照样通过。
 * 仓库级 `scripts/audit/api-surface.mjs` 又显式排除了本包（其 v1 只扫主入口 `src/index.ts`，
 * 覆盖不了本包的四个子路径入口），所以完整基线只能落在这里。
 *
 * 基线记录每个入口的「导出名 → 运行时种类」，任何增 / 删 / 改种类都会失败：
 * - 删除 / 改名 / 改种类 = 破坏性变更，需迁移说明
 * - 新增 = 基线漂移，确认是有意导出后更新 `public-contract/baseline.json`
 *
 * 类型层面的契约由 `public-contract/consumer.ts` + `tsconfig.publish.json`
 * （strict NodeNext，按真实 `exports` 解析）承担。
 */

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const baseline = JSON.parse(await readFile(new URL('../public-contract/baseline.json', import.meta.url), 'utf8'));

const SPECIFIERS = {
  '.': '@aiao/rxdb-test',
  './encrypted': '@aiao/rxdb-test/encrypted',
  './entities': '@aiao/rxdb-test/entities',
  './shop': '@aiao/rxdb-test/shop',
  './transaction': '@aiao/rxdb-test/transaction',
  './tree-unique': '@aiao/rxdb-test/tree-unique'
};

const kindOf = value => (Array.isArray(value) ? 'array' : typeof value);

// 基线的入口集合必须与 package.json exports 一一对应，
// 否则新增子路径会连「有没有被门禁看到」都无人发现。
const declaredSubpaths = Object.keys(packageJson.exports)
  .filter(subpath => subpath !== './package.json')
  .sort();
assert.deepEqual(
  Object.keys(baseline).sort(),
  declaredSubpaths,
  'public-contract/baseline.json 的入口集合与 package.json exports 不一致'
);

const failures = [];

for (const [subpath, expected] of Object.entries(baseline)) {
  const specifier = SPECIFIERS[subpath];
  assert.ok(specifier, `baseline 中的入口 ${subpath} 没有对应的 import specifier`);

  const actualModule = await import(specifier);
  const actual = Object.fromEntries(Object.keys(actualModule).map(name => [name, kindOf(actualModule[name])]));

  for (const [name, kind] of Object.entries(expected)) {
    if (!(name in actual)) {
      failures.push(`${specifier}: 导出 \`${name}\` 已消失（删除或改名）`);
      continue;
    }
    if (actual[name] !== kind) {
      failures.push(`${specifier}: 导出 \`${name}\` 的种类由 ${kind} 变为 ${actual[name]}`);
    }
  }

  for (const name of Object.keys(actual)) {
    if (!(name in expected)) {
      failures.push(`${specifier}: 新增未登记的导出 \`${name}\`（确认有意后更新 baseline.json）`);
    }
  }
}

assert.equal(failures.length, 0, `发布表面与基线不符：\n${failures.join('\n')}`);

const root = await import('@aiao/rxdb-test');
assert.equal(root.version, packageJson.version);
assert.equal(root.SEARCH_PARITY_ARTICLES.length, 30);
assert.equal(root.SEARCH_PARITY_COMMENTS.length, 40);

const entities = await import('@aiao/rxdb-test/entities');
assert.equal(entities.ENTITIES.length, Object.keys(baseline['./entities']).length - 1);
const shop = await import('@aiao/rxdb-test/shop');
assert.equal(shop.ENTITIES.length, Object.keys(baseline['./shop']).length - 1);

const total = Object.values(baseline).reduce((sum, entry) => sum + Object.keys(entry).length, 0);
process.stdout.write(
  `Public contract OK: ${String(total)} exports across ${String(declaredSubpaths.length)} entries\n`
);
