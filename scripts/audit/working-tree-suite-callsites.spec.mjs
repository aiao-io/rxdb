import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

import {
  CONFORMANCE_SUITE_NAMES,
  SUITE_ENTRY,
  V1_ADAPTER_PACKAGES,
  auditCallsites,
  blankStringLiterals,
  describeRejection,
  findMissingSuiteExports,
  findPackageCallsites,
  inspectSource,
  stripComments
} from './working-tree-suite-callsites.mjs';

const COMMIT_SUITE = 'workingTreeCommitConformanceSuite';
const CAPTURE_SUITE = 'workingTreeCaptureConformanceSuite';

/** 一个合格调用点的最小形状：从入口具名导入 + 顶层调用。 */
const callsite = suite =>
  `import { ${suite} } from '${SUITE_ENTRY}';\n\n${suite}({\n  name: 'x',\n  createDatabase: async () => ({})\n});\n`;

const withTempRoot = async run => {
  const root = await mkdtemp(join(tmpdir(), 'wt-suite-callsites-'));
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
  return file;
};

/** 造一棵「6 个包 × 2 套套件全都有调用点」的树。 */
const writeCompleteMatrix = async root => {
  for (const pkg of V1_ADAPTER_PACKAGES) {
    for (const suite of CONFORMANCE_SUITE_NAMES) {
      await writeSourceFile(root, join(pkg, 'src', '__tests__', `${suite}.spec.ts`), callsite(suite));
    }
  }
};

// ---------------------------------------------------------------------------
// 词法预处理：注释与字符串必须先被抹掉，否则「注释掉的调用」会把门禁骗绿
// ---------------------------------------------------------------------------

test('行注释与块注释被抹成等长空白，行号不漂', () => {
  const source = `const a = 1; // ${COMMIT_SUITE}(...)\n/* ${COMMIT_SUITE}(...) */\nconst b = 2;\n`;
  const stripped = stripComments(source);

  assert.equal(stripped.length, source.length);
  assert.equal(stripped.split('\n').length, source.split('\n').length);
  assert.ok(!stripped.includes(COMMIT_SUITE));
  assert.ok(stripped.includes('const a = 1;'));
  assert.ok(stripped.includes('const b = 2;'));
});

test('字符串里的 // 不是注释开头', () => {
  const source = `const url = 'https://example.com';\nconst b = 2;\n`;

  assert.ok(stripComments(source).includes('const b = 2;'));
});

test('注释里的撇号不会被当成字符串开头吃掉后面的代码', () => {
  // 只抹字符串、不抹注释时，扫描器仍必须认得注释——否则 `it's` 的撇号会一路吃到下一个引号。
  const source = `// it's fine\nconst name = 'x';\nconst b = 2;\n`;
  const blanked = blankStringLiterals(source);

  assert.ok(blanked.includes('const b = 2;'));
  assert.ok(!blanked.includes('x'));
});

test('转义引号不提前结束字符串', () => {
  const source = `const a = 'it\\'s ${COMMIT_SUITE}(';\nconst b = 2;\n`;
  const blanked = blankStringLiterals(stripComments(source));

  assert.ok(!blanked.includes(COMMIT_SUITE));
  assert.ok(blanked.includes('const b = 2;'));
});

test('模板字面量整体清空', () => {
  const source = 'const a = `${COMMIT}`;\nconst b = 2;\n'.replace('COMMIT', COMMIT_SUITE);
  const blanked = blankStringLiterals(stripComments(source));

  assert.ok(!blanked.includes(COMMIT_SUITE));
  assert.ok(blanked.includes('const b = 2;'));
});

test('正则字面量里的引号不会吃掉后面的代码', () => {
  const source = `const re = /['"]/;\n${COMMIT_SUITE}({});\n`;
  const blanked = blankStringLiterals(stripComments(source));

  assert.ok(blanked.includes(`${COMMIT_SUITE}({})`));
});

test('除法不会被当成正则开头', () => {
  const source = `const ratio = (a + b) / 2;\nconst c = x / y;\n${COMMIT_SUITE}({});\n`;
  const blanked = blankStringLiterals(stripComments(source));

  assert.ok(blanked.includes(`${COMMIT_SUITE}({})`));
});

// ---------------------------------------------------------------------------
// 单文件判定
// ---------------------------------------------------------------------------

test('具名导入 + 顶层调用 = 合格调用点', () => {
  const inspection = inspectSource(callsite(COMMIT_SUITE), COMMIT_SUITE);

  assert.equal(inspection.local, COMMIT_SUITE);
  assert.equal(inspection.importedFrom, SUITE_ENTRY);
  assert.equal(inspection.typeOnly, false);
  assert.equal(inspection.called, true);
  assert.equal(inspection.disabledBy, null);
  assert.equal(describeRejection(inspection), null);
});

test('导入了但从没调用 = 不合格：「导出了但没人跑」等于没覆盖', () => {
  const source = `import { ${COMMIT_SUITE} } from '${SUITE_ENTRY}';\n`;
  const inspection = inspectSource(source, COMMIT_SUITE);

  assert.equal(inspection.called, false);
  assert.match(describeRejection(inspection), /未调用/);
});

test('调用被注释掉 = 不合格', () => {
  const source = `import { ${COMMIT_SUITE} } from '${SUITE_ENTRY}';\n\n// ${COMMIT_SUITE}({ name: 'x' });\n`;
  const inspection = inspectSource(source, COMMIT_SUITE);

  assert.equal(inspection.called, false);
});

test('type-only 导入不算调用点', () => {
  const source = `import type { ${COMMIT_SUITE} } from '${SUITE_ENTRY}';\n\n${COMMIT_SUITE}({});\n`;
  const inspection = inspectSource(source, COMMIT_SUITE);

  assert.equal(inspection.typeOnly, true);
  assert.match(describeRejection(inspection), /type-only/);
});

test('内联 type 修饰符同样不算', () => {
  const source = `import { type ${COMMIT_SUITE} } from '${SUITE_ENTRY}';\n\n${COMMIT_SUITE}({});\n`;

  assert.equal(inspectSource(source, COMMIT_SUITE).typeOnly, true);
});

test('别名导入按别名找调用', () => {
  const source = `import { ${COMMIT_SUITE} as suite } from '${SUITE_ENTRY}';\n\nsuite({ name: 'x' });\n`;
  const inspection = inspectSource(source, COMMIT_SUITE);

  assert.equal(inspection.local, 'suite');
  assert.equal(inspection.called, true);
  assert.equal(describeRejection(inspection), null);
});

test('绕过 @aiao/rxdb/testing 入口的深路径导入不算调用点', () => {
  const source = `import { ${COMMIT_SUITE} } from '../../../rxdb/src/working-tree/testing/commit.suite.js';\n\n${COMMIT_SUITE}({});\n`;
  const inspection = inspectSource(source, COMMIT_SUITE);

  assert.equal(inspection.importedFrom, '../../../rxdb/src/working-tree/testing/commit.suite.js');
  assert.match(describeRejection(inspection), new RegExp(SUITE_ENTRY.replace('/', '\\/')));
});

test('命名空间导入不算：调用点必须能被 grep 到', () => {
  const source = `import * as testing from '${SUITE_ENTRY}';\n\ntesting.${COMMIT_SUITE}({});\n`;
  const inspection = inspectSource(source, COMMIT_SUITE);

  assert.equal(inspection.local, null);
  assert.match(describeRejection(inspection), /具名导入/);
});

test('describe.skip 包住调用 = 假绿，判不合格', () => {
  const source = `import { describe } from 'vitest';\nimport { ${COMMIT_SUITE} } from '${SUITE_ENTRY}';\n\ndescribe.skip('later', () => {\n  ${COMMIT_SUITE}({});\n});\n`;
  const inspection = inspectSource(source, COMMIT_SUITE);

  assert.equal(inspection.called, true);
  assert.equal(inspection.disabledBy, 'describe.skip');
  assert.match(describeRejection(inspection), /describe\.skip/);
});

test('skipIf / runIf 同样不合格：条件运行会让 6×2 的矩阵在某些机器上悄悄缩水', () => {
  for (const modifier of ['skipIf', 'runIf', 'todo']) {
    const source = `import { ${COMMIT_SUITE} } from '${SUITE_ENTRY}';\n\ndescribe.${modifier}(x)('m', () => {\n  ${COMMIT_SUITE}({});\n});\n`;

    assert.equal(inspectSource(source, COMMIT_SUITE).disabledBy, `describe.${modifier}`);
  }
});

// ---------------------------------------------------------------------------
// 单包扫描
// ---------------------------------------------------------------------------

test('扫到合格 spec 时记下相对路径', async () => {
  await withTempRoot(async root => {
    await writeSourceFile(root, join('src', '__tests__', 'a.spec.ts'), callsite(COMMIT_SUITE));

    const result = await findPackageCallsites(root, COMMIT_SUITE);

    assert.deepEqual(result.satisfied, [join('src', '__tests__', 'a.spec.ts')]);
    assert.deepEqual(result.rejected, []);
  });
});

test('只在 *.suite.ts 里调用不算：套件文件被命名门禁排除，vitest 根本不收它', async () => {
  await withTempRoot(async root => {
    await writeSourceFile(root, join('src', 'x.suite.ts'), callsite(COMMIT_SUITE));

    const result = await findPackageCallsites(root, COMMIT_SUITE);

    assert.deepEqual(result.satisfied, []);
    assert.deepEqual(result.rejected, []);
  });
});

test('压根没提到套件名的 spec 不进候选，不产生噪音', async () => {
  await withTempRoot(async root => {
    await writeSourceFile(root, join('src', 'other.spec.ts'), `import { it } from 'vitest';\nit('x', () => {});\n`);

    const result = await findPackageCallsites(root, COMMIT_SUITE);

    assert.deepEqual(result.satisfied, []);
    assert.deepEqual(result.rejected, []);
  });
});

test('提到了套件名但形状不对的 spec 进 rejected，带上理由', async () => {
  await withTempRoot(async root => {
    await writeSourceFile(root, join('src', 'near.spec.ts'), `import { ${COMMIT_SUITE} } from '${SUITE_ENTRY}';\n`);

    const result = await findPackageCallsites(root, COMMIT_SUITE);

    assert.deepEqual(result.satisfied, []);
    assert.equal(result.rejected.length, 1);
    assert.equal(result.rejected[0].file, join('src', 'near.spec.ts'));
    assert.match(result.rejected[0].reason, /未调用/);
  });
});

test('包目录没有 src/ 时按「没有调用点」处理，不抛异常', async () => {
  await withTempRoot(async root => {
    const result = await findPackageCallsites(root, COMMIT_SUITE);

    assert.deepEqual(result.satisfied, []);
  });
});

// ---------------------------------------------------------------------------
// 套件导出名核对
// ---------------------------------------------------------------------------

test('两套套件都从 testing 入口导出时无缺失', () => {
  const source = `export { ${CAPTURE_SUITE} } from './capture.suite.js';\nexport { ${COMMIT_SUITE} } from './commit.suite.js';\n`;

  assert.deepEqual(findMissingSuiteExports(source), []);
});

test('套件改名时报的是「导出名变了」，不是 12 条「缺调用点」', () => {
  const source = `export { ${CAPTURE_SUITE} } from './capture.suite.js';\n`;

  assert.deepEqual(findMissingSuiteExports(source), [COMMIT_SUITE]);
});

// ---------------------------------------------------------------------------
// 全量：6 个包 × 2 套套件
// ---------------------------------------------------------------------------

test('v1 运行矩阵冻结成 6 个后端 × 2 套套件', () => {
  assert.equal(V1_ADAPTER_PACKAGES.length, 6);
  assert.equal(CONFORMANCE_SUITE_NAMES.length, 2);
  assert.deepEqual([...CONFORMANCE_SUITE_NAMES].sort(), [CAPTURE_SUITE, COMMIT_SUITE]);
});

test('6 个包各有两套调用点时全绿', async () => {
  await withTempRoot(async root => {
    await writeCompleteMatrix(root);

    const { packages, offenders } = await auditCallsites({ packagesRoot: root });

    assert.equal(packages, V1_ADAPTER_PACKAGES.length);
    assert.deepEqual(offenders, []);
  });
});

test('缺一即失败：点名是哪个包缺哪套套件', async () => {
  await withTempRoot(async root => {
    await writeCompleteMatrix(root);
    await rm(join(root, V1_ADAPTER_PACKAGES[2], 'src', '__tests__', `${CAPTURE_SUITE}.spec.ts`));

    const { offenders } = await auditCallsites({ packagesRoot: root });

    assert.equal(offenders.length, 1);
    assert.match(offenders[0], new RegExp(V1_ADAPTER_PACKAGES[2]));
    assert.match(offenders[0], new RegExp(CAPTURE_SUITE));
  });
});

test('包目录整个不见了也是违规，而不是「少扫一个、照样绿」', async () => {
  await withTempRoot(async root => {
    await writeCompleteMatrix(root);
    await rm(join(root, V1_ADAPTER_PACKAGES[0]), { recursive: true });

    const { packages, offenders } = await auditCallsites({ packagesRoot: root });

    assert.equal(packages, V1_ADAPTER_PACKAGES.length - 1);
    assert.equal(offenders.length, 1);
    assert.match(offenders[0], /目录不存在/);
  });
});

test('近似调用点的理由会带进违规信息，省一次「为什么没认出来」的排查', async () => {
  await withTempRoot(async root => {
    await writeCompleteMatrix(root);
    const broken = join(V1_ADAPTER_PACKAGES[1], 'src', '__tests__', `${COMMIT_SUITE}.spec.ts`);
    await writeSourceFile(root, broken, `import { ${COMMIT_SUITE} } from '${SUITE_ENTRY}';\n`);

    const { offenders } = await auditCallsites({ packagesRoot: root });

    assert.equal(offenders.length, 1);
    assert.match(offenders[0], /未调用/);
  });
});
