import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { checkRequirements } from './check-requirements.mjs';

const story = (id, status = 'Done', extra = '', ac = '✅') => `---
id: ${id}
title: 生产核对
status: ${status}
priority: High
epic: BOM-EPIC-001
created: 2026-11-06
updated: 2026-11-06
tags: [bom]
dependsOn: []
capabilities: [rxdb:US-525]
${extra}---
# 生产核对

## 验收标准

| # | 前置条件 | 操作 | 预期结果 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 已有数据 | 核对 | 显示结果 | ${ac} |
`;

const view = `# 当前需求

| 状态 | 数量 |
| --- | --- |
| ✅ Done | 1 |
| 🚧 In Progress | 0 |
| 👀 In Review | 0 |
| 📝 Backlog | 0 |
| 🚫 Blocked | 0 |
| **合计** | 1 |

- ✅ [BOM-US-001](stories/platform/BOM-US-001-workspace.md)
`;

async function fixture(t) {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'bom-requirements-'));
  t.after(() => rm(workspaceRoot, { recursive: true, force: true }));
  const appRoot = path.join(workspaceRoot, 'apps/aiao-bom');
  const files = {
    'requirements/stories/domain/US-525-x.md': '---\nid: US-525\nstatus: Done\n---\n',
    'apps/aiao-bom/README.md': '# BOM 应用\n',
    'apps/aiao-bom/requirements/stories/platform/BOM-US-001-workspace.md': story('BOM-US-001'),
    'apps/aiao-bom/requirements/epics/BOM-EPIC-001.md':
      '---\nid: BOM-EPIC-001\nstatus: Done\n---\n\n- [BOM-US-001](../stories/platform/BOM-US-001-workspace.md)\n'
  };
  for (const file of [
    'README.md',
    'CONVENTIONS.md',
    'decisions.md',
    'future-requirements.md',
    'plans/README.md',
    'reviews/README.md',
    'code-scanning/README.md',
    'stories/story.template.md',
    'epics/epic.template.md',
    'reviews/review.template.md',
    'code-scanning/code-scanning.template.md'
  ]) {
    files[`apps/aiao-bom/requirements/${file}`] = '# 应用需求\n';
  }
  for (const file of ['status-overview.md', 'roadmap.md', 'capability-matrix.md', 'verification-report.md']) {
    files[`apps/aiao-bom/requirements/${file}`] = view;
  }
  async function put(file, text) {
    const target = path.join(workspaceRoot, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, text);
  }
  for (const [file, text] of Object.entries(files)) await put(file, text);
  return { appRoot, workspaceRoot, put };
}

const appStory = 'apps/aiao-bom/requirements/stories/platform/BOM-US-001-workspace.md';

test('合法应用需求通过，应用统计独立于平台故事', async t => {
  const f = await fixture(t);
  const result = await checkRequirements(f);
  assert.deepEqual(result.errors, []);
  assert.equal(result.counts.total, 1);
});

test('缺少目录文件时报告具体路径', async t => {
  const f = await fixture(t);
  await rm(path.join(f.appRoot, 'requirements/decisions.md'));
  assert.match((await checkRequirements(f)).errors.join('\n'), /decisions\.md/);
});

test('YAML 语法错误、重复键和缺失字段均阻断', async t => {
  const f = await fixture(t);
  for (const text of [
    story('BOM-US-001').replace('tags: [bom]', 'tags: [bom'),
    story('BOM-US-001', 'Done', 'status: Backlog\n'),
    story('BOM-US-001').replace('priority: High\n', '')
  ]) {
    await f.put(appStory, text);
    assert.ok((await checkRequirements(f)).errors.length > 0);
  }
});

test('非法状态、日期与非列表依赖均阻断', async t => {
  const f = await fixture(t);
  for (const text of [
    story('BOM-US-001', 'Closed'),
    story('BOM-US-001').replace('updated: 2026-11-06', 'updated: yesterday'),
    story('BOM-US-001').replace('dependsOn: []', 'dependsOn: BOM-US-002')
  ]) {
    await f.put(appStory, text);
    assert.ok((await checkRequirements(f)).errors.length > 0);
  }
});

test('ID 重复、编号段和文件名不符均阻断', async t => {
  const f = await fixture(t);
  await f.put('apps/aiao-bom/requirements/stories/platform/BOM-US-002-copy.md', story('BOM-US-001'));
  assert.match((await checkRequirements(f)).errors.join('\n'), /重复|文件名/);
  await f.put(appStory, story('BOM-US-101'));
  assert.match((await checkRequirements(f)).errors.join('\n'), /编号段|文件名/);
});

test('AC 必须从 1 连续编号，Done 不得保留未验收项', async t => {
  const f = await fixture(t);
  for (const text of [
    story('BOM-US-001').replace('| 1 |', '| 2 |'),
    story('BOM-US-001', 'Done', '', '⚠️'),
    story('BOM-US-001', 'Done', '', '⬜'),
    story('BOM-US-001').replace(/\| 1 \|.*\n/, '')
  ]) {
    await f.put(appStory, text);
    assert.match((await checkRequirements(f)).errors.join('\n'), /AC/);
  }
});

test('候选 AC 必须存在且未标通过', async t => {
  const f = await fixture(t);
  await f.put(appStory, story('BOM-US-001', 'Done', 'candidate_acs: [1]\n', '⬜'));
  assert.deepEqual((await checkRequirements(f)).errors, []);
  for (const extra of [
    'candidate_acs: [2]\n',
    'candidate_acs: [1, 1]\n',
    'candidate_acs: [0]\n',
    'candidate_acs: [1]\n'
  ]) {
    await f.put(appStory, story('BOM-US-001', 'Done', extra));
    assert.match((await checkRequirements(f)).errors.join('\n'), /candidate_acs|候选/);
  }
});

test('硬依赖必须存在，Done 依赖必须关闭', async t => {
  const f = await fixture(t);
  await f.put(appStory, story('BOM-US-001').replace('dependsOn: []', 'dependsOn: [BOM-US-002]'));
  assert.match((await checkRequirements(f)).errors.join('\n'), /依赖.*不存在/);
  await f.put('apps/aiao-bom/requirements/stories/platform/BOM-US-002-next.md', story('BOM-US-002', 'Backlog'));
  assert.match((await checkRequirements(f)).errors.join('\n'), /依赖.*未关闭/);
});

test('硬依赖环必须拒绝', async t => {
  const f = await fixture(t);
  await f.put(appStory, story('BOM-US-001').replace('dependsOn: []', 'dependsOn: [BOM-US-002]'));
  await f.put(
    'apps/aiao-bom/requirements/stories/platform/BOM-US-002-next.md',
    story('BOM-US-002').replace('dependsOn: []', 'dependsOn: [BOM-US-001]')
  );
  assert.match((await checkRequirements(f)).errors.join('\n'), /依赖环/);
});

test('capabilities 校验平台命名空间与真实故事', async t => {
  const f = await fixture(t);
  for (const value of ['[US-525]', '[rxdb:US-9999]']) {
    await f.put(appStory, story('BOM-US-001').replace('[rxdb:US-525]', value));
    assert.match((await checkRequirements(f)).errors.join('\n'), /capabilities/);
  }
});

test('所属 epic 必须存在，Done epic 不得包含未关闭故事', async t => {
  const f = await fixture(t);
  await f.put(appStory, story('BOM-US-001').replace('BOM-EPIC-001', 'BOM-EPIC-002'));
  assert.match((await checkRequirements(f)).errors.join('\n'), /epic/);
  await f.put(appStory, story('BOM-US-001', 'Backlog'));
  assert.match((await checkRequirements(f)).errors.join('\n'), /epic.*未关闭/);
});

test('所有派生视图都校验统计、遗漏与状态标记', async t => {
  const f = await fixture(t);
  for (const file of ['status-overview.md', 'roadmap.md', 'capability-matrix.md', 'verification-report.md']) {
    for (const text of [
      view.replace('| ✅ Done | 1 |', '| ✅ Done | 9 |'),
      view.replace('- ✅ [BOM-US-001]', '- ⬜ [BOM-US-001]'),
      view.replace(/- ✅ \[BOM-US-001\].*\n/, '')
    ]) {
      await f.put(`apps/aiao-bom/requirements/${file}`, text);
      assert.match((await checkRequirements(f)).errors.join('\n'), new RegExp(file.replace('.', '\\.')));
    }
    await f.put(`apps/aiao-bom/requirements/${file}`, view);
  }
});

test('本地链接和标题锚点必须能解析', async t => {
  const f = await fixture(t);
  for (const link of ['[不存在](missing.md)', '[坏标题](#missing)', '[源码](../README.md#missing)']) {
    await f.put('apps/aiao-bom/requirements/README.md', `# 应用需求\n\n${link}\n`);
    assert.match((await checkRequirements(f)).errors.join('\n'), /链接目标不存在|标题锚点/);
  }
});

test('无 frontmatter 的故事辅助材料不进入状态统计，截断 YAML 仍拒绝', async t => {
  const f = await fixture(t);
  const auxiliary = 'apps/aiao-bom/requirements/stories/platform/BOM-US-001-evidence.md';
  await f.put(auxiliary, '# 工作区证据\n\n辅助材料不参与状态统计。\n');
  assert.deepEqual((await checkRequirements(f)).errors, []);
  await f.put(auxiliary, '---\nid: BOM-US-002\nstatus: Done\n');
  assert.match((await checkRequirements(f)).errors.join('\n'), /YAML/);
});

test('epic 使用根约定的三态与精确文件名', async t => {
  const f = await fixture(t);
  const file = 'apps/aiao-bom/requirements/epics/BOM-EPIC-001.md';
  await f.put(
    file,
    '---\nid: BOM-EPIC-001\nstatus: In Review\n---\n\n- [BOM-US-001](../stories/platform/BOM-US-001-workspace.md)\n'
  );
  assert.match((await checkRequirements(f)).errors.join('\n'), /epic status/);
  await rm(path.join(f.workspaceRoot, file));
  await f.put(
    file.replace('.md', '-wrong.md'),
    '---\nid: BOM-EPIC-001\nstatus: Done\n---\n\n- [BOM-US-001](../stories/platform/BOM-US-001-workspace.md)\n'
  );
  assert.match((await checkRequirements(f)).errors.join('\n'), /epic.*文件名/);
});

test('承接 AC 必须指向存在的应用故事及源 AC', async t => {
  const f = await fixture(t);
  for (const extra of [
    'inherited_acs:\n  - from: BOM-US-999\n    ac: 1\n',
    'inherited_acs:\n  - from: BOM-US-001\n    ac: 9\n'
  ]) {
    await f.put(appStory, story('BOM-US-001', 'Done', extra));
    assert.match((await checkRequirements(f)).errors.join('\n'), /inherited_acs/);
  }
});
