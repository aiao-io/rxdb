import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { checkRequirements } from './check-requirements.mjs';

const STORY = 'stories/desktop/ADESK-US-101-shell.md';
const EPIC = 'epics/ADESK-EPIC-002.md';

async function fixture(t, { withWorkspace = true } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aiao-desktop-requirements-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const appRoot = path.join(root, 'aiao-desktop');
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
id: ADESK-US-101
title: 桌面外壳
status: Backlog
priority: High
epic: ADESK-EPIC-002
created: 2026-11-12
updated: 2026-11-12
tags: [desktop]
dependsOn: []
capabilities: [rxdb:US-301]
---

# 用户故事：桌面外壳

## 验收标准

| # | 前置条件 | 操作 | 预期结果 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 正式构建 | 打开桌面 | 出现 Dock | ⬜ |
`
  );
  await put(
    EPIC,
    `---
id: ADESK-EPIC-002
status: Backlog
startDate: 2026-11-12
targetDate: TBD
owner: jimmy
---

# 桌面外壳

## 故事

- [ADESK-US-101](../${STORY})
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

- ⬜ [ADESK-US-101 桌面外壳](${STORY})
`
  );
  await put('roadmap.md', `# 路线\n\n- [ADESK-US-101](${STORY})\n`);
  if (!withWorkspace) return { appRoot, put, edit };
  const platform = path.join(root, 'requirements/stories/collaboration');
  await mkdir(platform, { recursive: true });
  await writeFile(path.join(platform, 'US-301-version-control.md'), '---\nid: US-301\nstatus: Done\n---\n');
  return { appRoot, workspaceRoot: root, put, edit };
}

const errorsOf = async options => (await checkRequirements(options)).errors.join('\n');

test('当前产品需求目录通过结构门禁', async () => {
  assert.deepEqual((await checkRequirements()).errors, []);
});

test('ADESK 前缀的需求树通过', async t => {
  const options = await fixture(t);
  const { errors, counts } = await checkRequirements(options);
  assert.deepEqual(errors, []);
  assert.equal(counts.total, 1);
});

test('默认按仓库根解析平台故事引用', async t => {
  const { appRoot } = await fixture(t, { withWorkspace: false });
  assert.deepEqual((await checkRequirements({ appRoot })).errors, []);
});

test('Web Desktop 的 DESKTOP 前缀故事被拒绝', async t => {
  const options = await fixture(t);
  await options.edit(STORY, text => text.replace('id: ADESK-US-101', 'id: DESKTOP-US-101'));
  assert.match(await errorsOf(options), /story id 格式无效/);
});

test('其他产品前缀的史诗被拒绝', async t => {
  const options = await fixture(t);
  await options.edit(EPIC, text => text.replace('id: ADESK-EPIC-002', 'id: MODEL-EPIC-002'));
  assert.match(await errorsOf(options), /epic id 格式无效/);
});

test('Done 故事的 AC 必须全部通过', async t => {
  const options = await fixture(t);
  await options.edit(STORY, text => text.replace('status: Backlog', 'status: Done'));
  assert.match(await errorsOf(options), /Done 故事 AC#1 必须全部 ✅/);
});

test('指向不存在文件的链接被拒绝', async t => {
  const options = await fixture(t);
  await options.edit('README.md', text => `${text}\n见 [旧位置](../../apps/aiao-desktop/README.md)。\n`);
  assert.match(await errorsOf(options), /链接目标不存在/);
});
