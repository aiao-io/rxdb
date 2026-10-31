import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { auditSpecCopies, compareCopies, E2E_PROJECTS } from './e2e-spec-copies.mjs';

const workspaceRoot = path.resolve(import.meta.dirname, '../..');

const BODY = "\ntest('看板', async ({ page }: { page: Page }) => {\n  await expect(page).toHaveTitle('看板');\n});\n";
/** Angular 从 fixtures 取 test / expect，类型另起一行、位置也不同。 */
const ANGULAR = `import type { Page } from '@playwright/test';\nimport { expect, test } from './fixtures.js';\n${BODY}`;
const PLAYWRIGHT = `import { expect, test, type Page } from '@playwright/test';\n${BODY}`;

const copies = (angular, react = PLAYWRIGHT, vue = PLAYWRIGHT) =>
  E2E_PROJECTS.map((project, index) => ({ project, text: [angular, react, vue][index] }));

test('仓库里登记的三端副本全部同步', () => {
  assert.deepEqual(auditSpecCopies(workspaceRoot), []);
});

test('只差导入来源与写法：Angular 从 ./fixtures.js 取 test / expect、导入合并与位置不同都放行', () => {
  assert.deepEqual(compareCopies('board.spec.ts', copies(ANGULAR)), []);
});

test('正文差一个字符即报出，并指到该副本的行号', () => {
  const problems = compareCopies(
    'board.spec.ts',
    copies(ANGULAR, PLAYWRIGHT, PLAYWRIGHT.replace("'看板');", "'看 板');"))
  );

  assert.deepEqual(problems, [
    'board.spec.ts：dev-rxdb-vue-e2e 正文与 dev-rxdb-angular-e2e 不同（dev-rxdb-vue-e2e 第 4 行起）'
  ]);
});

test('多导入一个模块即报出', () => {
  const react = `import { readFileSync } from 'node:fs';\n${PLAYWRIGHT}`;

  assert.deepEqual(compareCopies('board.spec.ts', copies(ANGULAR, react)), [
    'board.spec.ts：dev-rxdb-react-e2e 导入与 dev-rxdb-angular-e2e 不同（多 node:fs { readFileSync }）'
  ]);
});

test('React / Vue 从 ./fixtures.js 取也报出：只有 Angular 允许换源', () => {
  const vue = PLAYWRIGHT.replace(
    "import { expect, test, type Page } from '@playwright/test';",
    "import type { Page } from '@playwright/test';\nimport { expect, test } from './fixtures.js';"
  );

  assert.deepEqual(compareCopies('board.spec.ts', copies(ANGULAR, PLAYWRIGHT, vue)), [
    'board.spec.ts：dev-rxdb-vue-e2e 导入与 dev-rxdb-angular-e2e 不同（多 ./fixtures.js { expect, test }；少 @playwright/test { expect, test }）'
  ]);
});

test('登记的副本缺了一端即报出（含整组已删、登记表过期）', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'e2e-spec-copies-'));
  try {
    for (const project of E2E_PROJECTS.slice(0, 2)) {
      mkdirSync(path.join(root, 'apps', project, 'src'), { recursive: true });
    }
    writeFileSync(path.join(root, 'apps', E2E_PROJECTS[0], 'src', 'board.spec.ts'), ANGULAR);
    writeFileSync(path.join(root, 'apps', E2E_PROJECTS[1], 'src', 'board.spec.ts'), PLAYWRIGHT);

    assert.deepEqual(auditSpecCopies(root, ['board.spec.ts', 'gone.spec.ts']), [
      'board.spec.ts：缺 apps/dev-rxdb-vue-e2e/src/board.spec.ts',
      'gone.spec.ts：缺 apps/dev-rxdb-angular-e2e/src/gone.spec.ts、apps/dev-rxdb-react-e2e/src/gone.spec.ts、apps/dev-rxdb-vue-e2e/src/gone.spec.ts'
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
