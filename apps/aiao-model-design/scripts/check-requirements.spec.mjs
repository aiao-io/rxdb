import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { checkRequirements } from './check-requirements.mjs';

const STORY = 'stories/agent/MODEL-US-101-tools.md';
const EPIC = 'epics/MODEL-EPIC-001.md';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'model-requirements-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const appRoot = path.join(root, 'apps/aiao-model-design');
  const requirements = path.join(appRoot, 'requirements');
  const put = async (relative, text) => {
    const file = path.join(requirements, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, text);
  };
  const edit = async (relative, change) =>
    put(relative, change(await readFile(path.join(requirements, relative), 'utf8')));
  await put(
    STORY,
    `---
id: MODEL-US-101
title: 建模工具
status: Backlog
priority: High
epic: MODEL-EPIC-001
created: 2026-11-11
updated: 2026-11-11
tags: [agent]
dependsOn: []
capabilities: [rxdb:US-301]
---

# 用户故事：建模工具

## 验收标准

| # | 前置条件 | 操作 | 预期结果 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 空模型 | 建实体 | 生成 | ⬜ |
`
  );
  await put(
    EPIC,
    `---
id: MODEL-EPIC-001
status: Backlog
startDate: 2026-11-11
targetDate: TBD
owner: jimmy
---

# 建模智能体

## 故事

- [MODEL-US-101](../${STORY})
`
  );
  await put('README.md', '# 需求\n\n[0/1 已交付]\n');
  await put(
    'status-overview.md',
    `# 状态

| 状态 | 数量 |
| --- | --- |
| ✅ Done | 0 |
| 🚧 In Progress | 0 |
| 👀 In Review | 0 |
| 📝 Backlog | 1 |
| 🚫 Blocked | 0 |
| **合计** | 1 |

## 进行中（0 条）

## 待评审（0 条）

- ⬜ [MODEL-US-101 建模工具](${STORY})
`
  );
  await put('roadmap.md', `# 路线\n\n- [MODEL-US-101](${STORY})\n`);
  const platform = path.join(root, 'requirements/stories/collaboration');
  await mkdir(platform, { recursive: true });
  await writeFile(path.join(platform, 'US-301-version-control.md'), '---\nid: US-301\nstatus: Done\n---\n');
  return { appRoot, workspaceRoot: root, put, edit };
}

test('当前应用需求目录通过结构门禁', async () => {
  assert.deepEqual((await checkRequirements()).errors, []);
});

test('MODEL 前缀的需求树通过', async t => {
  const options = await fixture(t);
  const { errors, counts } = await checkRequirements(options);
  assert.deepEqual(errors, []);
  assert.equal(counts.total, 1);
});

test('其他应用前缀的故事编号被拒绝', async t => {
  const options = await fixture(t);
  await options.edit(STORY, text => text.replace('id: MODEL-US-101', 'id: ADMIN-US-101'));
  assert.match((await checkRequirements(options)).errors.join('\n'), /story id 格式无效/);
});

test('其他应用前缀的史诗被拒绝', async t => {
  const options = await fixture(t);
  await options.edit(EPIC, text => text.replace('id: MODEL-EPIC-001', 'id: ADMIN-EPIC-001'));
  assert.match((await checkRequirements(options)).errors.join('\n'), /epic id 格式无效/);
});
