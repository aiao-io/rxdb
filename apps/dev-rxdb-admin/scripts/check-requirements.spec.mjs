import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { checkRequirements } from './check-requirements.mjs';

const FIRST = 'stories/platform/ADMIN-US-001-first.md';
const SECOND = 'stories/platform/ADMIN-US-002-second.md';
const EPIC = 'epics/ADMIN-EPIC-001.md';

function story(id, status, dependencies = []) {
  return `---
id: ${id}
title: 示例故事
status: ${status}
priority: High
epic: ADMIN-EPIC-001
created: 2026-11-06
updated: 2026-11-06
tags: [template, admin]
dependsOn: [${dependencies.join(', ')}]
capabilities: [rxdb:US-526]
---

# 示例故事

## 验收标准

| # | 前置条件 | 操作 | 预期结果 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 空库 | 打开 | 可用 | ${status === 'Done' ? '✅' : '⬜'} |
`;
}

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'admin-requirements-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const appRoot = path.join(root, 'apps/dev-rxdb-admin');
  const requirements = path.join(appRoot, 'requirements');
  const put = async (relative, text) => {
    const file = path.join(requirements, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, text);
  };
  const edit = async (relative, change) =>
    put(relative, change(await readFile(path.join(requirements, relative), 'utf8')));
  await put(FIRST, story('ADMIN-US-001', 'Done'));
  await put(SECOND, story('ADMIN-US-002', 'Backlog', ['ADMIN-US-001']));
  await put(
    EPIC,
    `---
id: ADMIN-EPIC-001
status: In Progress
startDate: 2026-11-06
targetDate: TBD
owner: jimmy
---

# 应用模板

## 故事

- [ADMIN-US-001](../${FIRST})
- [ADMIN-US-002](../${SECOND})
`
  );
  await put('README.md', '# 应用需求\n\n[1/2 已交付]\n');
  await put(
    'status-overview.md',
    `# 状态概览

| 状态 | 数量 |
| --- | --- |
| ✅ Done | 1 |
| 🚧 In Progress | 0 |
| 👀 In Review | 0 |
| 📝 Backlog | 1 |
| 🚫 Blocked | 0 |
| **合计** | 2 |

## 进行中（0 条）

## 待评审（0 条）

## 按 Epic 索引

- ✅ [ADMIN-US-001 示例故事](${FIRST})
- ⬜ [ADMIN-US-002 示例故事](${SECOND})
`
  );
  await put('roadmap.md', `# 排期\n\n- [ADMIN-US-002](${SECOND})\n`);
  const platform = path.join(root, 'requirements/stories/domain');
  await mkdir(platform, { recursive: true });
  await writeFile(path.join(platform, 'US-526-admin-workbench.md'), '---\nid: US-526\nstatus: Backlog\n---\n');
  return { appRoot, workspaceRoot: root, requirements, put, edit };
}

test('平台能力未完成不改变应用状态，完整需求树通过', async t => {
  const options = await fixture(t);
  const result = await checkRequirements(options);
  assert.deepEqual(result.errors, []);
  assert.equal(result.counts.Done, 1);
  assert.equal(result.counts.total, 2);
});

const mutations = [
  ['必填字段', f => f.edit(SECOND, text => text.replace('title: 示例故事\n', '')), /title/],
  ['五态', f => f.edit(SECOND, text => text.replace('status: Backlog', 'status: Pending')), /status/],
  ['优先级', f => f.edit(SECOND, text => text.replace('priority: High', 'priority: Urgent')), /priority/],
  ['无效日期', f => f.edit(SECOND, text => text.replace('updated: 2026-11-06', 'updated: 2026-02-30')), /updated/],
  ['日期顺序', f => f.edit(SECOND, text => text.replace('updated: 2026-11-06', 'updated: 2026-11-05')), /updated/],
  ['YAML 重复键', f => f.edit(SECOND, text => text.replace('tags:', 'title: 重复\ntags:')), /重复.*title/],
  ['数组格式', f => f.edit(SECOND, text => text.replace('tags: [template, admin]', 'tags: template')), /tags/],
  [
    '字符串伪装数组',
    f => f.edit(SECOND, text => text.replace('tags: [template, admin]', 'tags: "[template, admin]"')),
    /tags/
  ],
  ['YAML 引号未闭合', f => f.edit(SECOND, text => text.replace('title: 示例故事', 'title: "示例故事')), /YAML/],
  ['主故事缺少 YAML', f => f.edit(SECOND, text => text.replace(/^---[\s\S]*?---\n/, '')), /YAML/],
  ['唯一 ID', f => f.edit(SECOND, text => text.replace('id: ADMIN-US-002', 'id: ADMIN-US-001')), /重复.*ADMIN-US-001/],
  [
    '文件名',
    f =>
      rename(path.join(f.requirements, SECOND), path.join(f.requirements, 'stories/platform/ADMIN-US-099-second.md')),
    /文件名/
  ],
  ['连续 AC', f => f.edit(SECOND, text => text.replace('| 1 | 空库', '| 2 | 空库')), /连续/],
  ['重复 AC', f => f.edit(SECOND, text => `${text}| 1 | 空库 | 打开 | 可用 | ⬜ |\n`), /连续/],
  ['无 AC', f => f.edit(SECOND, text => text.replace('| 1 | 空库 | 打开 | 可用 | ⬜ |', '')), /AC/],
  ['Done AC 未验', f => f.edit(FIRST, text => text.replace('✅', '⚠️')), /Done.*AC/],
  [
    '缩进的 Done AC 未验',
    f => f.edit(FIRST, text => text.replace('| 1 | 空库 | 打开 | 可用 | ✅ |', '  | 1 | 空库 | 打开 | 可用 | ⚠️ |')),
    /Done.*AC/
  ],
  ['Done AC 写在其他章节', f => f.edit(FIRST, text => text.replace('## 验收标准', '## 技术笔记')), /AC/],
  [
    '缺失硬依赖',
    f => f.edit(SECOND, text => text.replace('dependsOn: [ADMIN-US-001]', 'dependsOn: [ADMIN-US-099]')),
    /dependsOn.*ADMIN-US-099/
  ],
  ['循环硬依赖', f => f.edit(FIRST, text => text.replace('dependsOn: []', 'dependsOn: [ADMIN-US-002]')), /依赖环/],
  [
    'Done 依赖未关',
    f => f.edit(FIRST, text => text.replace('dependsOn: []', 'dependsOn: [ADMIN-US-002]')),
    /Done.*依赖.*ADMIN-US-002/
  ],
  ['缺失平台能力', f => f.edit(SECOND, text => text.replace('rxdb:US-526', 'rxdb:US-999')), /capabilities.*US-999/],
  ['平台引用必须带作用域', f => f.edit(SECOND, text => text.replace('rxdb:US-526', 'US-526')), /capabilities/],
  [
    '缺失 Epic',
    f => f.edit(SECOND, text => text.replace('epic: ADMIN-EPIC-001', 'epic: ADMIN-EPIC-099')),
    /epic.*ADMIN-EPIC-099/
  ],
  ['Epic ID 文件名', f => f.edit(EPIC, text => text.replace('id: ADMIN-EPIC-001', 'id: ADMIN-EPIC-099')), /文件名/],
  [
    'Epic 清单漏故事',
    f => f.edit(EPIC, text => text.replace(`- [ADMIN-US-002](../${SECOND})`, '')),
    /故事清单.*ADMIN-US-002/
  ],
  ['Epic 状态', f => f.edit(EPIC, text => text.replace('status: In Progress', 'status: Done')), /epic.*Done/],
  ['Epic 必填字段', f => f.edit(EPIC, text => text.replace('owner: jimmy\n', '')), /owner/],
  ['Epic 日期', f => f.edit(EPIC, text => text.replace('startDate: 2026-11-06', 'startDate: 2026-02-30')), /startDate/],
  ['README 汇总', f => f.edit('README.md', text => text.replace('[1/2 已交付]', '[2/2 已交付]')), /README.*已交付/],
  [
    '状态数字漂移',
    f => f.edit('status-overview.md', text => text.replace('| 📝 Backlog | 1 |', '| 📝 Backlog | 9 |')),
    /Backlog.*9.*1/
  ],
  [
    '进行中标题漂移',
    f => f.edit('status-overview.md', text => text.replace('## 进行中（0 条）', '## 进行中（9 条）')),
    /进行中.*条数/
  ],
  [
    '待评审标题漂移',
    f => f.edit('status-overview.md', text => text.replace('## 待评审（0 条）', '## 待评审（9 条）')),
    /待评审.*条数/
  ],
  [
    '状态符号漂移',
    f => f.edit('status-overview.md', text => text.replace('- ⬜ [ADMIN-US-002', '- ✅ [ADMIN-US-002')),
    /ADMIN-US-002.*⬜/
  ],
  ['排期遗漏', f => f.put('roadmap.md', '# 排期\n'), /roadmap.*ADMIN-US-002/],
  ['本地死链', f => f.edit('README.md', text => `${text}\n[失效](missing.md)\n`), /链接目标不存在/],
  ['失效标题锚点', f => f.edit('README.md', text => `${text}\n[锚点](roadmap.md#不存在)\n`), /标题锚点/],
  [
    '代码块里的伪标题',
    f => f.edit('README.md', text => [text, '[锚点](#伪标题)', '```md', '# 伪标题', '```'].join('\n')),
    /标题锚点/
  ]
];

for (const [name, mutate, expected] of mutations) {
  test(`阻断${name}`, async t => {
    const options = await fixture(t);
    await mutate(options);
    const { errors } = await checkRequirements(options);
    assert.match(errors.join('\n'), expected);
  });
}

test('忽略模板占位链接和代码里的字面链接，验证中文标题与重复标题锚点', async t => {
  const options = await fixture(t);
  await options.put('stories/story.template.md', '---\nid: ADMIN-US-XXX\n---\n[模板](missing.md)\n');
  await options.edit('README.md', text =>
    [
      text,
      '[中文标题](#中文-标题)',
      '[重复标题](#中文-标题-1)',
      '[有效链接](roadmap.md#排期)',
      '## 中文 标题',
      '## 中文 标题',
      '`[代码](missing.md)`',
      '```md',
      '[代码块](missing.md)',
      '```'
    ].join('\n\n')
  );
  assert.deepEqual((await checkRequirements(options)).errors, []);
});

test('同编号辅助文档没有 frontmatter 且不参与故事统计', async t => {
  const options = await fixture(t);
  await options.put('stories/platform/ADMIN-US-001-evidence.md', '# 验收记录\n');
  await options.edit(FIRST, text => `${text}\n[验收记录](ADMIN-US-001-evidence.md)\n`);
  const result = await checkRequirements(options);
  assert.deepEqual(result.errors, []);
  assert.equal(result.counts.total, 2);
});
