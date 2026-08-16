import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    ALLOWED_PREFIXES,
    NEED_CHECK_BRANCHES,
    buildSubjectRegex,
    parseMessage,
    parseRange,
    shouldCheckCurrentBranch,
    validateCommitMessage
} from './commit-lint.mjs';

const config = {
  types: [{ value: 'feat' }, { value: 'fix' }, { value: 'docs' }, { value: 'chore' }],
  scopes: [{ value: 'rxdb' }, { value: 'rxdb-adapter-sqlite-core' }, { value: 'aiao' }]
};

const accepts = message => validateCommitMessage(message, config).ok;

test('标准 type(scope): subject 通过', () => {
  assert.equal(accepts('feat(rxdb): 支持事务回滚'), true);
});

test('带 ! 的破坏性变更通过', () => {
  assert.equal(accepts('fix(aiao)!: 移除已废弃的入口'), true);
});

test('冒号后缺空格仍通过（中文输入法常漏）', () => {
  assert.equal(accepts('docs(rxdb):补充迁移说明'), true);
});

test('含连字符的 scope 不会被更短的同前缀 scope 截断', () => {
  assert.equal(accepts('fix(rxdb-adapter-sqlite-core): 修正事务边界'), true);
});

test('只看首行，body 不参与判定', () => {
  assert.equal(accepts('feat(rxdb): 新增查询缓存\n\n随便写点什么 nonsense'), true);
});

test('未登记的 scope 被拒', () => {
  assert.equal(accepts('feat(rxdb-adapter-desktop): 新增 tauri 支持'), false);
});

test('未登记的 type 被拒', () => {
  assert.equal(accepts('feature(rxdb): 新增查询缓存'), false);
});

test('缺 scope 被拒', () => {
  assert.equal(accepts('feat: 新增查询缓存'), false);
});

test('空 subject 被拒', () => {
  assert.equal(accepts('feat(rxdb): '), false);
});

test('无意义的裸文本被拒', () => {
  assert.equal(accepts('23213'), false);
});

// 下面四条是这次把 check-commit 接进 CI 的核心动机：旧实现用
// `/wip/gi.test(整条消息)` 这类无锚点匹配，任何含 "wip"/"release"/"revert"
// 子串的消息都能过，门禁形同虚设。
test('前缀例外必须在首行开头：release 出现在句中不放行', () => {
  assert.equal(accepts('修一下 release notes 的错别字'), false);
});

test('前缀例外必须在首行开头：wip 作为词内子串不放行', () => {
  assert.equal(accepts('add swipe gesture'), false);
});

test('前缀例外必须在首行开头：合法前缀放行', () => {
  for (const prefix of ALLOWED_PREFIXES) {
    assert.equal(accepts(`${prefix} something`), true, `${prefix} 应放行`);
  }
});

test('type(scope) 前面带杂物不放行（正则必须锚定）', () => {
  assert.equal(accepts('[skip ci] feat(rxdb): 新增查询缓存'), false);
});

test('subject 后面另起一行不影响锚定', () => {
  const regex = buildSubjectRegex(config.types, config.scopes);

  assert.equal(regex.test('feat(rxdb): ok'), true);
  assert.equal(regex.test('feat(rxdb): ok\nfeat(rxdb): ok'), false);
});

test('scope 里的正则元字符被转义（不会被当成分组）', () => {
  const regex = buildSubjectRegex([{ value: 'feat' }], [{ value: 'a.b' }]);

  assert.equal(regex.test('feat(a.b): x'), true);
  assert.equal(regex.test('feat(axb): x'), false);
});

test('parseRange 支持 --range=A..B 与 --range A..B 两种写法', () => {
  assert.equal(parseRange(['node', 'commit-lint.mjs', '--range=main..HEAD']), 'main..HEAD');
  assert.equal(parseRange(['node', 'commit-lint.mjs', '--range', 'main..HEAD']), 'main..HEAD');
});

test('parseRange 未传时返回 null（走本地模式）', () => {
  assert.equal(parseRange(['node', 'commit-lint.mjs']), null);
});

test('NEED_CHECK_BRANCHES 与 workspace 共享同一份名单', async () => {
  const { NEED_CHECK_COMMIT_BRANCH_NAMES } = await import('./workspace.mjs');
  assert.equal(NEED_CHECK_BRANCHES, NEED_CHECK_COMMIT_BRANCH_NAMES);
});

test('本地校验只在 NEED_CHECK_BRANCHES 上触发，特性分支和 detached HEAD 放行', () => {
  assert.equal(shouldCheckCurrentBranch('main'), true);
  assert.equal(shouldCheckCurrentBranch('feat/foo'), false);
  assert.equal(shouldCheckCurrentBranch(''), false);
});

test('parseRange 缺值时报错，不静默走成全量校验', () => {
  assert.throws(() => parseRange(['node', 'commit-lint.mjs', '--range']), /--range 需要一个参数/);
});

test('parseMessage 支持两种写法，且不与 --range 串台', () => {
  assert.equal(parseMessage(['node', 'x', '--message=feat(rxdb): a']), 'feat(rxdb): a');
  assert.equal(parseMessage(['node', 'x', '--message', 'feat(rxdb): a']), 'feat(rxdb): a');
  assert.equal(parseMessage(['node', 'x', '--range=main..HEAD']), null);
  assert.equal(parseRange(['node', 'x', '--message=feat(rxdb): a']), null);
});

// PR 标题里带 `(#12)` 是 GitHub squash 时自己追加的，作者写的标题不该有；
// 但真有人手写了也不该拦 —— subject 是 `.+`，括号本来就在里面。
test('PR 标题带 squash 后缀仍然合规', () => {
  assert.equal(accepts('feat(rxdb): 支持事务回滚 (#12)'), true);
});

test('仓库现状：commitizen 的 scope 覆盖 packages/ 下每个包（回归护栏）', async () => {
  const { readdir } = await import('node:fs/promises');
  const { default: commitizen } = await import('./commitizen.mjs');

  const declared = new Set(commitizen.scopes.map(scope => scope.value));
  const entries = await readdir(new URL('../packages/', import.meta.url), { withFileTypes: true });
  const missing = entries.filter(entry => entry.isDirectory() && !declared.has(entry.name)).map(entry => entry.name);

  // 缺一个包 = 那个包的合规提交会被门禁误杀。反向（scope 多于目录）是允许的：
  // `aiao` 是跨包改动的兜底 scope，不对应任何目录。
  assert.deepEqual(missing, [], `commitizen.mjs 的 scopes 缺少：${missing.join(', ')}`);
});
