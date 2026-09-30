import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

import {
  CORE_SOURCE_ROOT,
  PENDING_BOUNDARY_CROSSINGS,
  PLUGIN_DIRS,
  SCAN_EXCLUDED_DIRS,
  auditBoundary,
  auditSource,
  collectCoreFiles,
  findSpecifiers,
  resolveCrossing
} from './core-plugin-boundary.mjs';

const CORE_ROOT = new URL(`../../${CORE_SOURCE_ROOT}/`, import.meta.url).pathname;

const withTempRoot = async run => {
  const root = await mkdtemp(join(tmpdir(), 'core-plugin-boundary-'));
  try {
    return await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

const writeSourceFile = async (root, relPath, source) => {
  const file = join(root, relPath);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, source, 'utf8');
};

// ---------------------------------------------------------------------------
// 说明符提取
// ---------------------------------------------------------------------------

test('findSpecifiers 认得 import / export / 动态 import 三种形态', () => {
  const source = [
    "import { A } from './a.js';",
    "import type { B } from '../commit/b.js';",
    "export * from './c.js';",
    "export { D } from './d.js';",
    "const e = await import('./e.js');"
  ].join('\n');
  assert.deepEqual(findSpecifiers(source), ['./a.js', '../commit/b.js', './c.js', './d.js', './e.js']);
});

test('findSpecifiers 不把注释里的指路文字当依赖', () => {
  // 本仓库的 TSDoc 大量出现「见 `../working-tree/xxx.ts`」这类指路；算进来的话，
  // 登记表会被纯文档改动推着变，于是没人再信它。
  const source = [
    '/** 判定实现见 `./working-tree/raw-write-judgment.ts`，本文件只做分派。 */',
    "// import { Gone } from './commit/gone.js';",
    "import { Kept } from './kept.js';"
  ].join('\n');
  assert.deepEqual(findSpecifiers(source), ['./kept.js']);
});

test('findSpecifiers 不把字符串字面量里的 import 语句当依赖', () => {
  // 门禁脚本、迁移指南、codemod 的测试夹具里都会出现「一段代码作为数据」的写法。
  // 把它算进来，登记表就会因为一段示例文本而多出一条本不存在的跨界依赖。
  const source = [
    'const SNIPPET = `',
    "import { Gone } from './working-tree/y.js';",
    '`;',
    'const DYNAMIC = "await import(\'./commit/gone.js\')";',
    "import { Kept } from './kept.js';",
    "const real = await import('./real.js');"
  ].join('\n');
  assert.deepEqual(findSpecifiers(source), ['./kept.js', './real.js']);
});

// ---------------------------------------------------------------------------
// 跨界判定
// ---------------------------------------------------------------------------

test('resolveCrossing 把相对说明符归一到核心根', () => {
  assert.equal(resolveCrossing('RxDB.ts', './commit/x.js'), 'commit/x.js');
  assert.equal(resolveCrossing('version/create-branch.ts', '../commit/x.js'), 'commit/x.js');
  assert.equal(resolveCrossing('system/migrations/0004.ts', '../../working-tree/y.js'), 'working-tree/y.js');
});

test('resolveCrossing 放过包名与核心内部路径', () => {
  assert.equal(resolveCrossing('RxDB.ts', 'rxjs'), undefined);
  assert.equal(resolveCrossing('RxDB.ts', '@aiao/utils'), undefined);
  assert.equal(resolveCrossing('RxDB.ts', './system/x.js'), undefined);
  assert.equal(resolveCrossing('version/a.ts', './b.js'), undefined);
});

test('resolveCrossing 不把爬出核心根的路径算作跨界', () => {
  // `../../other-package/commit/x.js` 已经不在本包里，那是 nx 依赖图的判据，不是本门禁的。
  assert.equal(resolveCrossing('RxDB.ts', '../commit/x.js'), undefined);
});

test('resolveCrossing 只看首段，不做子串匹配', () => {
  assert.equal(resolveCrossing('RxDB.ts', './commit-log/x.js'), undefined, '`commit-log` 不是 `commit`');
  assert.equal(resolveCrossing('RxDB.ts', './system/commit/x.js'), undefined, '嵌在核心目录下的同名子目录不算');
});

test('auditSource 对同一文件的重复依赖只报一次，且按字典序', () => {
  const source = [
    "import { A } from './working-tree/z.js';",
    "import type { B } from './working-tree/z.js';",
    "import { C } from './commit/a.js';"
  ].join('\n');
  assert.deepEqual(auditSource('RxDB.ts', source), ['RxDB.ts·commit/a.js', 'RxDB.ts·working-tree/z.js']);
});

// ---------------------------------------------------------------------------
// 扫描范围
// ---------------------------------------------------------------------------

test('collectCoreFiles 跳过 __tests__ 与两个插件目录，只收 .ts', async () => {
  await withTempRoot(async root => {
    await writeSourceFile(root, 'RxDB.ts', '');
    await writeSourceFile(root, 'system/x.ts', '');
    await writeSourceFile(root, 'commit/skip.ts', '');
    await writeSourceFile(root, 'working-tree/skip.ts', '');
    await writeSourceFile(root, '__tests__/skip.ts', '');
    await writeSourceFile(root, 'readme.md', '');
    assert.deepEqual(await collectCoreFiles(root), ['RxDB.ts', 'system/x.ts']);
  });
});

test('任意深度的 __tests__ 都不扫', async () => {
  await withTempRoot(async root => {
    // 测试文件里贴一段「核心不该这么写」的反例是常事，扫进来就是凭空一条未登记跨界。
    await writeSourceFile(root, 'plugin/__tests__/skip.ts', '');
    await writeSourceFile(root, 'plugin/kept.ts', '');
    assert.deepEqual(await collectCoreFiles(root), ['plugin/kept.ts']);
  });
});

test('插件目录只按顶层排除，同名子目录照扫', async () => {
  await withTempRoot(async root => {
    // `version/commit/` 不是插件目录：`resolveCrossing` 只看首段，它归在 `version` 下。
    // 跟着 `__tests__` 一起改成按目录名排除的话，扫描范围会凭空塌掉一块，
    // 那块里真长出跨界依赖也再报不出来——门禁静默变窄比它报错更难发现。
    await writeSourceFile(root, 'version/commit/kept.ts', '');
    await writeSourceFile(root, 'version/working-tree/kept.ts', '');
    const files = await collectCoreFiles(root);
    assert.deepEqual(files, ['version/commit/kept.ts', 'version/working-tree/kept.ts']);
  });
});

// ---------------------------------------------------------------------------
// 双向判定
// ---------------------------------------------------------------------------

test('未登记的跨界依赖会被报出来', async () => {
  await withTempRoot(async root => {
    await writeSourceFile(root, 'RxDB.ts', "import { A } from './commit/a.js';");
    const result = await auditBoundary({ coreRoot: root, registry: {} });
    assert.deepEqual(result.unregistered, ['RxDB.ts·commit/a.js']);
    assert.deepEqual(result.stale, []);
  });
});

test('登记过的跨界依赖放行', async () => {
  await withTempRoot(async root => {
    await writeSourceFile(root, 'RxDB.ts', "import { A } from './commit/a.js';");
    const registry = { 'RxDB.ts·commit/a.js': '测试用' };
    assert.deepEqual(await auditBoundary({ coreRoot: root, registry }), { unregistered: [], stale: [] });
  });
});

test('登记了却已不存在的条目同样被报出来', async () => {
  // 只报单向的话，这张表会变成只增不减的历史垃圾堆，而它的全部价值在于「还剩几条」可信。
  await withTempRoot(async root => {
    await writeSourceFile(root, 'RxDB.ts', "import { A } from './system/a.js';");
    const registry = { 'RxDB.ts·commit/已经拆掉了.js': '陈旧条目' };
    const result = await auditBoundary({ coreRoot: root, registry });
    assert.deepEqual(result.unregistered, []);
    assert.deepEqual(result.stale, ['RxDB.ts·commit/已经拆掉了.js']);
  });
});

// ---------------------------------------------------------------------------
// 登记表自身
// ---------------------------------------------------------------------------

test('登记表的每条理由都是一句能读的话，不是占位符', () => {
  for (const [key, reason] of Object.entries(PENDING_BOUNDARY_CROSSINGS)) {
    assert.ok(key.includes('·'), `${key} 不是 \`来源·去向\` 形态`);
    assert.ok(reason.length >= 4, `${key} 的理由太短，登记一条的成本必须高于顺手拆掉它`);
  }
});

test('登记表只登记真正跨界的键', () => {
  for (const key of Object.keys(PENDING_BOUNDARY_CROSSINGS)) {
    const [from, to] = key.split('·');
    assert.ok(PLUGIN_DIRS.includes(to.split('/')[0]), `${key} 的去向不在插件目录里`);
    assert.ok(!SCAN_EXCLUDED_DIRS.includes(from.split('/')[0]), `${key} 的来源在扫描范围之外，登记它没有意义`);
  }
});

// ---------------------------------------------------------------------------
// 真实仓库
// ---------------------------------------------------------------------------

test('真实核心包的跨界依赖全部登记在案，且没有陈旧条目', async () => {
  const { unregistered, stale } = await auditBoundary({ coreRoot: CORE_ROOT });
  assert.deepEqual(unregistered, [], `未登记：\n${unregistered.join('\n')}`);
  assert.deepEqual(stale, [], `陈旧：\n${stale.join('\n')}`);
});

test('扫描范围没有塌', async () => {
  const files = await collectCoreFiles(CORE_ROOT);
  assert.ok(files.length > 100, `只扫到 ${files.length} 个文件，扫描范围疑似塌了`);
});
