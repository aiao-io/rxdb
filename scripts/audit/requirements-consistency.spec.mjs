import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

import {
  checkEpics,
  checkLinks,
  checkReadme,
  checkStatusOverview,
  collectEpics,
  collectStories,
  countStatuses,
  parseFrontmatter,
  run,
  updateReadme,
  updateStatusOverview
} from './requirements-consistency.mjs';

const story = (id, status, extra = '') =>
  `---\nid: ${id}\ntitle: ${id}\nstatus: ${status}\npriority: Medium\nepic: epic-001-x\ncreated: 2026-01-01\nupdated: 2026-01-01\ntags: [a]\n${extra}---\n\n# ${id}\n`;

const overview = (done, wip, review, backlog, total, emojis) => `# 状态概览

| 状态           | 数量 |
| :------------- | :--- |
| ✅ Done        | ${String(done).padEnd(4)} |
| 🚧 In Progress | ${String(wip).padEnd(4)} |
| 👀 In Review   | ${String(review).padEnd(4)} |
| 📝 Backlog     | ${String(backlog).padEnd(4)} |
| 🚫 Blocked     | 0    |
| **合计**       | ${String(total).padEnd(4)} |

## 进行中（${wip} 条）

## 待评审（${review} 条）

## 按 Epic 索引

${emojis.map(([e, id]) => `- ${e} [${id} 标题](stories/core/${id}-x.md)`).join('\n')}
`;

/** 搭一个最小仓库：三条 story、一个 epic、一份 overview、一份 README、一个被链接的源码文件。 */
async function scaffold(dir, { epicStatus = 'In Progress', emojis, readme = '[2/3 已交付]' } = {}) {
  await mkdir(path.join(dir, 'requirements/stories/core'), { recursive: true });
  await mkdir(path.join(dir, 'requirements/epics'), { recursive: true });
  await mkdir(path.join(dir, 'packages/x/src'), { recursive: true });
  await writeFile(path.join(dir, 'requirements/stories/core/US-001-x.md'), story('US-001', 'Done'));
  await writeFile(path.join(dir, 'requirements/stories/core/US-002-x.md'), story('US-002', 'Done'));
  await writeFile(path.join(dir, 'requirements/stories/core/US-003-x.md'), story('US-003', 'Backlog'));
  await writeFile(
    path.join(dir, 'requirements/epics/epic-001-x.md'),
    `---\nid: epic-001-x\nstatus: ${epicStatus}\n---\n\n- [US-001](../stories/core/US-001-x.md)\n- [US-002](../stories/core/US-002-x.md)\n- [US-003](../stories/core/US-003-x.md)\n`
  );
  await writeFile(
    path.join(dir, 'requirements/status-overview.md'),
    overview(
      2,
      0,
      0,
      1,
      3,
      emojis ?? [
        ['✅', 'US-001'],
        ['✅', 'US-002'],
        ['⬜', 'US-003']
      ]
    )
  );
  await writeFile(path.join(dir, 'README.md'), `# x\n\n当前交付状态 ${readme}\n`);
  await writeFile(path.join(dir, 'packages/x/src/a.ts'), 'a\nb\nc\n');
}

let dir;
before(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'req-consistency-'));
});
after(async () => {
  await rm(dir, { recursive: true, force: true });
});

test('frontmatter 只认扁平 key: value，行尾注释被剥掉', () => {
  const fm = parseFrontmatter('---\nid: US-1\nepic: epic-001 # 备注\ntags: [a, b]\n---\nbody');
  assert.deepEqual(fm, { id: 'US-1', epic: 'epic-001', tags: '[a, b]' });
  assert.equal(parseFrontmatter('# 没有 frontmatter'), null);
  assert.equal(parseFrontmatter('---\ntags:\n  [tooling, devtools]\nid: US-2\n---\n').tags, '[tooling, devtools]');
});

test('一致的仓库全绿', async () => {
  await scaffold(dir);
  const { offenders } = await run({ root: dir });
  assert.deepEqual(offenders, []);
});

test('汇总表数字、标题条数、README 的 N/M 与 YAML 不符时被抓出', async () => {
  await scaffold(dir, { readme: '[1/3 已交付]' });
  const stories = await collectStories(dir);
  const counts = countStatuses(stories);
  const text = (await readFile(path.join(dir, 'requirements/status-overview.md'), 'utf8')).replace(
    '| 2    |',
    '| 9    |'
  );
  assert.match(checkStatusOverview(text, stories).join('\n'), /「✅ Done」写 9，YAML 推导为 2/);
  assert.match(checkReadme('[1/3 已交付]', counts).join('\n'), /写 1\/3 已交付，YAML 推导为 2\/3/);
});

test('--update 只改数字不动列宽，改完能过 check', async () => {
  await scaffold(dir, { readme: '[0/0 已交付]' });
  const overviewPath = path.join(dir, 'requirements/status-overview.md');
  const broken = (await readFile(overviewPath, 'utf8'))
    .replace('| 2    |', '| 7    |')
    .replace('## 进行中（0 条）', '## 进行中（5 条）');
  await writeFile(overviewPath, broken);
  const { offenders } = await run({ root: dir, update: true });
  assert.deepEqual(offenders, []);
  const fixed = await readFile(overviewPath, 'utf8');
  assert.match(fixed, /\| ✅ Done {8}\| 2 {4}\|/);
  assert.match(fixed, /## 进行中（0 条）/);
  assert.equal(updateReadme('x [0/0 已交付] y', countStatuses(await collectStories(dir))), 'x [2/3 已交付] y');
  assert.equal(updateStatusOverview('| **合计**       | 63   |', { total: 7 }), '| **合计**       | 7    |');
});

test('索引里状态符号与 YAML 不一致、或漏了故事，都被抓出', async () => {
  await scaffold(dir, {
    emojis: [
      ['🚧', 'US-001'],
      ['✅', 'US-002']
    ]
  });
  const stories = await collectStories(dir);
  const text = await readFile(path.join(dir, 'requirements/status-overview.md'), 'utf8');
  const offenders = checkStatusOverview(text, stories);
  assert.match(offenders.join('\n'), /US-001 标 🚧，YAML 是 Done/);
  assert.match(offenders.join('\n'), /索引里没有 US-003/);
});

test('Done 的 epic 不得持有 Backlog 故事；Backlog 的 epic 不得持有已开工故事；In Review 不挡 Done', async () => {
  await scaffold(dir, { epicStatus: 'Done' });
  let offenders = checkEpics(await collectEpics(dir), await collectStories(dir));
  assert.match(offenders.join('\n'), /epic 是 Done，但 US-003 是 Backlog/);
  assert.equal(offenders.length, 1);

  await writeFile(path.join(dir, 'requirements/stories/core/US-003-x.md'), story('US-003', 'In Review'));
  offenders = checkEpics(await collectEpics(dir), await collectStories(dir));
  assert.deepEqual(offenders, []);

  await scaffold(dir, { epicStatus: 'Backlog' });
  offenders = checkEpics(await collectEpics(dir), await collectStories(dir));
  assert.equal(offenders.filter(o => /epic 是 Backlog，但 US-00[12] 已是 Done/.test(o)).length, 2);
});

test('epic 只顺带链接、不持有的故事不受状态约束；故事声明的 epic 必须反向链接它', async () => {
  await scaffold(dir, { epicStatus: 'Backlog' });
  await writeFile(
    path.join(dir, 'requirements/epics/epic-001-x.md'),
    `---\nid: epic-001-x\nstatus: Backlog\n---\n\n- [US-003](../stories/core/US-003-x.md)\n`
  );
  await writeFile(
    path.join(dir, 'requirements/epics/epic-002-y.md'),
    `---\nid: epic-002-y\nstatus: Backlog\n---\n\n证据：[US-001](../stories/core/US-001-x.md)\n`
  );
  const offenders = checkEpics(await collectEpics(dir), await collectStories(dir));
  assert.equal(offenders.filter(o => o.includes('epic-002-y')).length, 0, 'epic-002 只是引用 US-001，不该被判');
  assert.match(offenders.join('\n'), /US-001-x\.md: 声明 epic epic-001-x，但该 epic 文件没有链接到它/);
});

test('死链与超出文件行数的 #L 锚点被抓出，合法锚点与 http 链接放行', async () => {
  await scaffold(dir);
  await writeFile(
    path.join(dir, 'requirements/stories/core/US-001-x.md'),
    story('US-001', 'Done') +
      '[ok](../../../packages/x/src/a.ts#L2-L3) [far](../../../packages/x/src/a.ts#L9) [gone](../../../packages/x/src/nope.ts) [web](https://example.com/#L999)\n'
  );
  const offenders = await checkLinks(dir);
  assert.equal(offenders.length, 2);
  assert.match(offenders.join('\n'), /#L9 超出文件行数 3/);
  assert.match(offenders.join('\n'), /链接目标不存在 → \.\.\/\.\.\/\.\.\/packages\/x\/src\/nope\.ts/);
});

test('仓库现状：requirements 派生视图与 YAML 一致（回归护栏）', async () => {
  const root = path.resolve(import.meta.dirname, '../..');
  const { offenders } = await run({ root });
  assert.deepEqual(offenders, []);
});
