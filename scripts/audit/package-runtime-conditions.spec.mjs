import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';

import { BUILD_TIME_CONDITIONS, auditPackages, findNonExecutableConditions } from './package-runtime-conditions.mjs';

const pkg = exports => ({ name: '@aiao/demo', exports });

test('运行时 condition 指向 .ts 时报错（装到用户项目里就是死链）', () => {
  const offenders = findNonExecutableConditions(pkg({ '.': { import: './src/index.ts' } }));

  assert.deepEqual(offenders, ['@aiao/demo:. > import -> ./src/index.ts']);
});

test('.tsx / .mts / .cts 同样不是可执行产物', () => {
  const offenders = findNonExecutableConditions(
    pkg({
      './a': { import: './src/a.tsx' },
      './b': { import: './src/b.mts' },
      './c': { require: './src/c.cts' }
    })
  );

  assert.equal(offenders.length, 3);
});

test('没有 condition 的裸字符串 export 也会被检查', () => {
  const offenders = findNonExecutableConditions(pkg({ './client': './src/client.ts' }));

  assert.deepEqual(offenders, ['@aiao/demo:./client -> ./src/client.ts']);
});

test('types 指向 .d.ts 是正常的类型入口，不报错', () => {
  assert.deepEqual(findNonExecutableConditions(pkg({ '.': { types: './dist/index.d.ts' } })), []);
});

// 这条是本次把审计接进 CI 门禁的关键豁免，理由写在这里而不是只写在实现里：
// @aiao/source 只被 tsconfig.base.json 的 customConditions、scripts/audit/api-surface.mjs
// 以及各包 vite config 的 resolve.conditions 显式启用，用来把 import 指回 src 源码。
// Node 运行时的 exports 解析器不认识这个条件名，永远不会走进这条分支——
// 它指向 .ts 是设计如此。若哪天它变成运行时条件，把它从白名单摘掉，这条测试会立刻变红。
test('@aiao/source 是构建期条件，指向 .ts 源码不报错', () => {
  const offenders = findNonExecutableConditions(
    pkg({ '.': { '@aiao/source': './src/index.ts', types: './dist/index.d.ts', default: './dist/index.js' } })
  );

  assert.deepEqual(offenders, []);
});

test('@aiao/source 在子路径入口下同样豁免', () => {
  const exports = {
    '.': { '@aiao/source': './src/index.ts', default: './dist/index.js' },
    './testing': { '@aiao/source': './src/testing.ts', default: './dist/testing.js' }
  };

  assert.deepEqual(findNonExecutableConditions(pkg(exports)), []);
});

test('豁免不外溢到兄弟条件，同一个入口里的运行时条件照样被抓', () => {
  const exports = {
    '.': { '@aiao/source': './src/index.ts', default: './dist/index.js' },
    './broken': { '@aiao/source': './src/broken.ts', default: './src/broken.ts' }
  };

  assert.deepEqual(findNonExecutableConditions(pkg(exports)), ['@aiao/demo:./broken > default -> ./src/broken.ts']);
});

// 下面三条是这次修的漏报/误报：白名单原先只比对**最内层**那个 key，
// condition 一旦嵌套（`@aiao/source` 里再按平台分叉、`types` 里再分 import/require），
// 最内层就变成了 `node` / `import` 这些运行时条件名，白名单彻底失效。
test('嵌套在 @aiao/source 里的平台条件同样豁免', () => {
  const exports = {
    '.': {
      '@aiao/source': { node: './src/index.node.ts', default: './src/index.ts' },
      default: './dist/index.js'
    }
  };

  assert.deepEqual(findNonExecutableConditions(pkg(exports)), []);
});

test('types 下再分 import / require 也不报错（.d.ts 本来就以 .ts 结尾）', () => {
  const exports = { '.': { types: { import: './dist/index.d.ts', require: './dist/index.d.cts' } } };

  assert.deepEqual(findNonExecutableConditions(pkg(exports)), []);
});

test('嵌套在运行时条件里的 .ts 一样要被抓，且报告完整路径', () => {
  const exports = { '.': { node: { import: './src/index.ts' } } };

  assert.deepEqual(findNonExecutableConditions(pkg(exports)), ['@aiao/demo:. > node > import -> ./src/index.ts']);
});

test('白名单只含构建期条件（新增项必须先确认 Node 不会解析到它）', () => {
  assert.deepEqual([...BUILD_TIME_CONDITIONS].sort(), ['@aiao/source', 'types']);
});

test('指向构建产物 .js / .cjs 不报错', () => {
  const exports = { '.': { import: './dist/index.js', require: './dist/index.cjs' } };

  assert.deepEqual(findNonExecutableConditions(pkg(exports)), []);
});

test('没有 exports 字段的包不报错', () => {
  assert.deepEqual(findNonExecutableConditions({ name: '@aiao/demo' }), []);
});

test('仓库现状：packages/ 全量通过（回归护栏）', async () => {
  const packagesRoot = path.resolve(import.meta.dirname, '../../packages');

  assert.deepEqual(await auditPackages(packagesRoot), []);
});
