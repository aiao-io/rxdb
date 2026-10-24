import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { auditRequirements } from './check-requirements.mjs';

const statusSymbol = {
  Done: '✅',
  'In Progress': '🚧',
  'In Review': '👀',
  Backlog: '⬜',
  Blocked: '🚫'
};
const story = (id, status, dependsOn = [], ac = status === 'Done' ? '✅' : '⬜') => `---
id: ${id}
title: 测试故事
status: ${status}
priority: High
epic: epic-001-test
created: 2026-09-26
updated: 2026-10-01
dependsOn: [${dependsOn.join(', ')}]
tags: [test]
---
# 用户故事：测试
## 作为/我想要/以便
作为用户，我想要可靠行为。
## 范围边界
### In Scope
- 本机功能。
### Out of Scope
- 公网能力。
## 验收标准
| # | 前置条件 | 操作 | 预期结果 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 独立测试目录 | 读写 | 可重复核对 | ${ac} |
## 技术笔记
真实验收仍需对应证据，本检查不建立证据。
## 实现文件
- [source](../../../source.mjs)
## References
- [约定](../../CONVENTIONS.md)
`;
const epic = records => {
  const status =
    records.every(([, state]) => state === 'Done') ? 'Done'
    : records.every(([, state]) => state === 'Backlog') ? 'Backlog'
    : 'In Progress';
  return `---
id: epic-001-test
status: ${status}
---
# 测试 Epic
## 目标
${records.map(([id, state]) => `- [${state === 'Done' ? 'x' : ' '}] [${id}](../stories/test/${id}-test.md)`).join('\n')}
## 故事
${records.map(([id]) => `- [${id} 标题](../stories/test/${id}-test.md)`).join('\n')}
`;
};
const overview = records => `# 状态概览
| 状态 | 数量 | 说明 |
| --- | ---: | --- |
${Object.entries(statusSymbol)
  .map(
    ([state, symbol]) =>
      `| ${symbol} ${state} | ${records.filter(([, status]) => status === state).length} | 自动派生 |`
  )
  .join('\n')}
| **合计** | **${records.length}** | 不含模板 |
${records.map(([id, state]) => `- ${statusSymbol[state]} [${id} 标题](stories/test/${id}-test.md)`).join('\n')}
`;
async function fixture(
  t,
  records = [
    ['US-001', 'Done'],
    ['US-002', 'In Progress']
  ]
) {
  const parent = await mkdtemp(join(tmpdir(), 'aiao-requirements-audit-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const root = join(parent, 'repo');
  const put = async (path, text) => {
    const destination = join(root, path);
    await mkdir(join(destination, '..'), { recursive: true });
    await writeFile(destination, text);
  };
  await put('source.mjs', 'export const tested = true;\n');
  await put('README.md', '[需求](requirements/status-overview.md)\n');
  await put('requirements/CONVENTIONS.md', '# 写作约定\n');
  await put('requirements/epics/epic-001-test.md', epic(records));
  await put('requirements/status-overview.md', overview(records));
  for (const [id, status, dependencies = []] of records)
    await put(`requirements/stories/test/${id}-test.md`, story(id, status, dependencies));
  const change = async (path, from, to) => put(path, (await readFile(join(root, path), 'utf8')).replace(from, to));
  return { parent, root, put, change, run: () => auditRequirements(root) };
}
const has = (report, message) =>
  assert.ok(
    report.errors.some(error => error.includes(message)),
    JSON.stringify(report)
  );

test('audits a valid tree without changing any source or status', async t => {
  const f = await fixture(t);
  const path = 'requirements/stories/test/US-001-test.md';
  const before = await readFile(join(f.root, path));
  const report = await f.run();
  assert.deepEqual(report.errors, []);
  assert.equal(report.total, 2);
  assert.deepEqual(report.storyCounts, {
    Done: 1,
    'In Progress': 1,
    'In Review': 0,
    Backlog: 0,
    Blocked: 0
  });
  assert.equal(report.linksChecked, 11);
  assert.deepEqual(await readFile(join(f.root, path)), before);
});

test('rejects malformed YAML, duplicate keys and YAML aliases', async t => {
  const f = await fixture(t);
  const path = 'requirements/stories/test/US-001-test.md';
  for (const yaml of ['id: [broken', 'id: US-001\nid: US-002', 'id: &id US-001\ntitle: *id']) {
    await f.put(path, `---\n${yaml}\n---\n# 无效\n`);
    has(await f.run(), 'Invalid YAML frontmatter');
  }
});

test('rejects duplicate ids, unknown status and invalid dates', async t => {
  const f = await fixture(t);
  const path = 'requirements/stories/test/US-002-test.md';
  await f.change(path, 'id: US-002', 'id: US-001');
  has(await f.run(), 'Duplicate id US-001');
  await f.put(path, story('US-002', 'Finished'));
  has(await f.run(), 'Unknown status');
  await f.put(path, story('US-002', 'In Progress').replace('2026-10-01', '2026-02-30'));
  has(await f.run(), 'Invalid or reversed');
  await f.put(path, story('US-002', 'In Progress').replace('2026-10-01', '2026-01-01'));
  has(await f.run(), 'Invalid or reversed');
});

test('detects missing, duplicate and cyclic hard dependencies', async t => {
  const f = await fixture(t);
  await f.put('requirements/stories/test/US-002-test.md', story('US-002', 'In Progress', ['US-999']));
  has(await f.run(), 'Missing hard dependency US-999');
  await f.put('requirements/stories/test/US-002-test.md', story('US-002', 'In Progress', ['US-001', 'US-001']));
  has(await f.run(), 'unique array');
  await f.put('requirements/stories/test/US-002-test.md', story('US-002', 'In Progress', ['US-001']));
  await f.put('requirements/stories/test/US-001-test.md', story('US-001', 'In Progress', ['US-002']));
  has(await f.run(), 'Dependency cycle');
});

test('never closes a Done story with pending AC or an unfinished dependency', async t => {
  const f = await fixture(t);
  const path = 'requirements/stories/test/US-001-test.md';
  await f.put(path, story('US-001', 'Done', ['US-002'], '⚠️'));
  const report = await f.run();
  has(report, 'unpassed acceptance criterion');
  has(report, 'Done story depends on unfinished US-002');
});

test('requires complete scope/sections, sequential AC and no passed Backlog AC', async t => {
  const f = await fixture(t);
  const path = 'requirements/stories/test/US-002-test.md';
  await f.put(
    path,
    story('US-002', 'Backlog', [], '✅')
      .replace('## 技术笔记', '## 随笔')
      .replace('### Out of Scope', '### 后续范围')
      .replace('| 1 |', '| 2 |')
  );
  const report = await f.run();
  has(report, 'Missing section 技术笔记');
  has(report, 'Missing In Scope / Out of Scope');
  has(report, 'Invalid acceptance criterion');
  has(report, 'Backlog story has a passed');
});

test('derives Epic status, story index and goal checkboxes instead of accepting stale views', async t => {
  const f = await fixture(t);
  const path = 'requirements/epics/epic-001-test.md';
  await f.change(path, 'status: In Progress', 'status: Done');
  await f.change(path, '- [ ]', '- [x]');
  await f.change(path, '- [US-002 标题](../stories/test/US-002-test.md)', '');
  const report = await f.run();
  has(report, 'Derived epic status must be In Progress');
  has(report, 'checkbox disagrees');
  has(report, 'Missing story index entry US-002');
});

test('derives Backlog/Done epics and rejects missing epic membership', async t => {
  for (const status of ['Backlog', 'Done']) {
    const f = await fixture(t, [
      ['US-001', status],
      ['US-002', status]
    ]);
    assert.deepEqual((await f.run()).errors, []);
    await f.change('requirements/stories/test/US-002-test.md', 'epic: epic-001-test', 'epic: epic-999-missing');
    has(await f.run(), 'Missing epic epic-999-missing');
  }
});

test('validates overview counts, symbols, paths, missing and duplicate entries', async t => {
  const f = await fixture(t);
  const path = 'requirements/status-overview.md';
  await f.change(path, '| ✅ Done | 1 |', '| ✅ Done | 2 |');
  await f.change(path, '**2**', '**3**');
  await f.change(path, '- 🚧 [US-002', '- ✅ [US-002');
  const report = await f.run();
  has(report, 'Count for Done');
  has(report, 'Total disagrees');
  has(report, 'Story index entry US-002 disagrees');
  await f.put(path, `${overview([['US-001', 'Done']])}\n- ✅ [US-001 标题](stories/test/US-001-test.md)\n`);
  const incomplete = await f.run();
  has(incomplete, 'Duplicate story index entry US-001');
  has(incomplete, 'Missing story index entry US-002');
});

test('checks inline/reference links and Unicode/duplicate anchors, excluding literal fenced examples', async t => {
  const f = await fixture(t);
  await f.put('requirements/anchors.md', '# 中文 标题\n## 同名\n## 同名\n');
  await f.put(
    'requirements/links.md',
    '[中文](anchors.md#%E4%B8%AD%E6%96%87-%E6%A0%87%E9%A2%98)\n[第二次](anchors.md#同名-1)\n[引用][source]\n[source]: ../source.mjs\n```markdown\n[示例](not-real.md)\n```\n~~~\n[示例](also-not-real.md)\n~~~\n[外部](https://example.invalid/no-network)\n'
  );
  const valid = await f.run();
  assert.deepEqual(valid.errors, []);
  assert.equal(valid.anchorsChecked, 2);
  await f.put('requirements/links.md', '[丢失](missing.md)\n[坏锚点](anchors.md#missing)\n[错误编码](%FF.md)\n');
  const broken = await f.run();
  has(broken, 'Broken local link missing.md');
  has(broken, 'Missing Markdown anchor');
  has(broken, 'Malformed local link');
});

test('skips only template placeholder links, not real template links or concrete stories', async t => {
  const f = await fixture(t);
  await f.put(
    'requirements/stories/story.template.md',
    '---\nid: US-XXX\nstatus: Backlog\n---\n[例](../../../对应文件)\n[实际](../CONVENTIONS.md)\n'
  );
  await f.put('requirements/epics/epic.template.md', '[示例](../stories/domain/US-XXX-name.md)\n');
  const valid = await f.run();
  assert.deepEqual(valid.errors, []);
  assert.equal(valid.total, 2);
  await f.change('requirements/stories/story.template.md', '../CONVENTIONS.md', '../missing.md');
  has(await f.run(), 'Broken local link ../missing.md');
  await f.put(
    'requirements/stories/test/US-002-test.md',
    `${story('US-002', 'In Progress')}\n[不是占位](US-XXX-missing.md)\n`
  );
  has(await f.run(), 'Broken local link US-XXX-missing.md');
});

test('checks a present read-only sibling, reports an absent one and rejects arbitrary path escape', async t => {
  const f = await fixture(t);
  await f.put('requirements/upstream.md', '[上游](../../rxdb_ai/requirements/README.md)\n');
  const absent = await f.run();
  assert.deepEqual(absent.errors, []);
  assert.equal(absent.skippedUpstreamLinks, 1);
  await mkdir(join(f.parent, 'rxdb_ai/requirements'), { recursive: true });
  const upstreamPath = join(f.parent, 'rxdb_ai/requirements/README.md');
  await writeFile(upstreamPath, '# 上游只读\n');
  const before = await readFile(upstreamPath);
  const present = await f.run();
  assert.deepEqual(present.errors, []);
  assert.equal(present.skippedUpstreamLinks, 0);
  assert.deepEqual(await readFile(upstreamPath), before);
  await f.put('requirements/upstream.md', '[损坏](../../rxdb_ai/requirements/missing.md)\n[越界](../../outside.md)\n');
  const invalid = await f.run();
  has(invalid, 'Broken local link ../../rxdb_ai');
  has(invalid, 'leaves the workspace');
});

test('checks summary prose against YAML rather than accepting stale copies', async t => {
  const f = await fixture(t);
  await f.put('requirements/README.md', '当前 2 条故事：1 条 Done，1 条 In Progress。\n');
  await f.put('requirements/verification-report.md', '> 当前 **1 Done / 1 In Progress / 0 Backlog，共 2 条**。\n');
  assert.deepEqual((await f.run()).errors, []);
  await f.change('requirements/README.md', '当前 2 条故事', '当前 3 条故事');
  await f.change('requirements/verification-report.md', '1 Done', '2 Done');
  const report = await f.run();
  has(report, 'Summary total disagrees');
  has(report, 'Summary count for Done disagrees');
});

async function namespacedFixture(t) {
  const f = await fixture(t);
  const { readdir, rename } = await import('node:fs/promises');
  async function migrate(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await migrate(path);
        continue;
      }
      if (!entry.name.endsWith('.md')) continue;
      const text = (await readFile(path, 'utf8'))
        .replaceAll('epic-001-test', 'MEDIA-EPIC-001')
        .replaceAll('US-', 'MEDIA-US-');
      await writeFile(path, text);
      const name = entry.name.replace('epic-001-test', 'MEDIA-EPIC-001').replace(/^US-/, 'MEDIA-US-');
      if (name !== entry.name) await rename(path, join(directory, name));
    }
  }
  await migrate(join(f.root, 'requirements'));
  const repositoryRoot = f.parent;
  const platform = join(repositoryRoot, 'requirements/stories/adapter');
  await mkdir(platform, { recursive: true });
  await writeFile(join(platform, 'US-203-supabase.md'), '---\nid: US-203\nstatus: Done\n---\n# Platform capability\n');
  return {
    ...f,
    run: () => auditRequirements(f.root, { namespace: 'MEDIA', repositoryRoot })
  };
}

test('isolates namespaced application progress while resolving repository capability links', async t => {
  const f = await namespacedFixture(t);
  await f.change(
    'requirements/stories/test/MEDIA-US-002-test.md',
    'tags: [test]',
    'tags: [test]\ncapabilities:\n  - ref: rxdb:US-203\n    integration: pending'
  );
  await f.put('requirements/platform-link.md', '[Platform](../../requirements/stories/adapter/US-203-supabase.md)\n');
  const report = await f.run();
  assert.deepEqual(report.errors, []);
  assert.equal(report.total, 2);
  assert.equal(report.storyCounts.Done, 1);
});

test('rejects missing cross-layer capabilities without accepting platform completion as application evidence', async t => {
  const f = await namespacedFixture(t);
  await f.change(
    'requirements/stories/test/MEDIA-US-002-test.md',
    'tags: [test]',
    'tags: [test]\ncapabilities:\n  - ref: rxdb:US-999\n    integration: pending'
  );
  has(await f.run(), 'Missing capability rxdb:US-999');
});

test('rejects legacy story identifiers in a namespaced application', async t => {
  const f = await fixture(t);
  const report = await auditRequirements(f.root, { namespace: 'MEDIA' });
  has(report, 'Invalid story/epic id');
});

test('标题锚点只保留文本片段，嵌套标签和残留尖括号不会重新组成标签', async t => {
  const f = await fixture(t);
  await f.put(
    'requirements/CONVENTIONS.md',
    '# 写作约定\n## <b>有效标题</b>\n## <scr<script>ipt>标题\n## left<right\n'
  );
  await f.put(
    'README.md',
    '[正常标签](requirements/CONVENTIONS.md#有效标题)\n[嵌套标签](requirements/CONVENTIONS.md#ipt标题)\n[残留符号](requirements/CONVENTIONS.md#leftright)\n'
  );
  assert.deepEqual((await f.run()).errors, []);
});
