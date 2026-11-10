import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { NEED_CHECK_BRANCHES, shouldCheckCurrentBranch } from './commit-lint.mjs';
import { NEED_CHECK_COMMIT_BRANCH_NAMES } from './workspace.mjs';

// 本地 commit-msg / pre-push 钩子靠 shouldCheckCurrentBranch 决定校不校验，它只做分支名精确匹配。
// 配置曾写成 ['*'] 并在注释和 README 里声称「全部分支」：没有哪个分支叫 `*`，两个钩子在所有分支上
// 都是空操作，坏文案（`123` 之类）照样提交、推送。配置必须如实反映行为（RV-01a1bb68e74e）。

const readme = readFileSync(new URL('./README.md', import.meta.url), 'utf8');

test('分支白名单按名字精确匹配：列出的分支校验，其余分支与 detached HEAD 放行', () => {
  assert.equal(shouldCheckCurrentBranch('release', ['release']), true);
  assert.equal(shouldCheckCurrentBranch('feature/x', ['release']), false);
  assert.equal(shouldCheckCurrentBranch('', ['release']), false);
  assert.equal(shouldCheckCurrentBranch('main', []), false);
});

test('通配符不是语法：`*` 不匹配任何分支', () => {
  assert.equal(shouldCheckCurrentBranch('main', ['*']), false);
  assert.equal(shouldCheckCurrentBranch('codex/x', ['*']), false);
});

test('配置里的每一项都是可匹配的真实分支名，不含通配写法', () => {
  for (const name of NEED_CHECK_COMMIT_BRANCH_NAMES) {
    assert.doesNotMatch(
      name,
      /[*?[\]{}]/,
      `「${name}」是通配写法，shouldCheckCurrentBranch 不支持，本地钩子会静默失效`
    );
  }
  assert.equal(NEED_CHECK_BRANCHES, NEED_CHECK_COMMIT_BRANCH_NAMES);
});

test("README 不再声称本地钩子在全部分支上执行或把配置写成 ['*']", () => {
  const commitLintRow = readme.split('\n').find(line => line.startsWith('| [commit-lint.mjs]'));
  assert.ok(commitLintRow, '脚本总表缺少 commit-lint.mjs 行');

  assert.doesNotMatch(commitLintRow, /全部分支/);
  assert.doesNotMatch(readme, /NEED_CHECK_COMMIT_BRANCH_NAMES\s*=\s*\['\*'\]/);
  assert.doesNotMatch(readme, /在\*\*全部分支\*\*上执行/);
});
