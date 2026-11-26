import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

import {
  acIdsOf,
  checkAcStatusCells,
  checkAcSymbols,
  checkAnchorEvidence,
  checkBigStoryList,
  checkEpics,
  checkEvidenceBaseline,
  checkGeneratedViews,
  checkInheritedAcs,
  checkLinks,
  checkPackageCounts,
  checkReadme,
  checkRoadmap,
  checkStatusOverview,
  checkTables,
  collectEpics,
  collectRequirementRoots,
  collectStories,
  countStatuses,
  evidenceHits,
  evidenceSymbols,
  headingSlug,
  maskCode,
  openAcSummary,
  parseFrontmatter,
  ratchetEvidenceBaseline,
  renderEpicList,
  renderStatusOverview,
  run,
  scanEvidence,
  scanNarrative,
  updateReadme,
  updateRoadmap,
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

当前没有进行中的故事。

## 待评审（${review} 条）

当前没有待评审的故事。

## 阻塞（0 条）

当前没有 YAML 显式标为 Blocked 的故事；不等于其他故事没有前置。

## 按 Epic 索引

### [X](epics/epic-001-x.md)

${emojis.map(([e, id]) => `- ${e} [${id} ${id}](stories/core/${id}-x.md)`).join('\n')}
`;

const roadmap = (open, wip, review, backlog, ids = ['US-003'], done = 2, blocked = 0) => `# 排期与约束

## 现状快照

| 状态           | 数量   |
| :------------- | :----- |
| ✅ Done        | ${String(done).padEnd(6)} |
| 🚧 In Progress | ${String(wip).padEnd(6)} |
| 👀 In Review   | ${String(review).padEnd(6)} |
| 📝 Backlog     | ${String(backlog).padEnd(6)} |
| 🚫 Blocked     | ${String(blocked).padEnd(6)} |
| **未完成合计** | ${`**${open}**`.padEnd(6)} |

## 完成计划

仓库还剩 **${open} 条**未关闭故事（${wip} In Progress + ${review} In Review + ${backlog} Backlog，
口径同 [status-overview](status-overview.md)）。

### 批次 1

${ids.map(id => `- [${id}](stories/core/${id}-x.md)`).join('\n')}
`;

/** 搭一个最小仓库：三条 story、一个 epic、一份 overview、一份 roadmap、一份 README、一个被链接的源码文件。 */
async function scaffold(
  dir,
  { epicStatus = 'In Progress', emojis, readme = '[2/3 已交付]', roadmapText = roadmap(1, 0, 0, 1) } = {}
) {
  await mkdir(path.join(dir, 'requirements/stories/core'), { recursive: true });
  await mkdir(path.join(dir, 'requirements/epics'), { recursive: true });
  await mkdir(path.join(dir, 'packages/x/src'), { recursive: true });
  await writeFile(path.join(dir, 'requirements/stories/core/US-001-x.md'), story('US-001', 'Done'));
  await writeFile(path.join(dir, 'requirements/stories/core/US-002-x.md'), story('US-002', 'Done'));
  await writeFile(path.join(dir, 'requirements/stories/core/US-003-x.md'), story('US-003', 'Backlog'));
  await writeFile(
    path.join(dir, 'requirements/epics/epic-001-x.md'),
    `---\nid: epic-001-x\nstatus: ${epicStatus}\n---\n\n# X\n\n## 故事\n\n- [US-001](../stories/core/US-001-x.md)\n- [US-002](../stories/core/US-002-x.md)\n- [US-003](../stories/core/US-003-x.md)\n`
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
  await writeFile(path.join(dir, 'requirements/roadmap.md'), roadmapText);
  await writeFile(path.join(dir, 'README.md'), `# x\n\nStatus ${readme.replace('已交付', 'delivered')}\n`);
  await writeFile(path.join(dir, 'README.zh-CN.md'), `# x\n\n当前交付状态 ${readme}\n`);
  await writeFile(
    path.join(dir, 'requirements/README.md'),
    '# 需求管理\n\nEpic：\n\n- [epic-001 X](epics/epic-001-x.md)\n'
  );
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
  await scaffold(dir, { readme: '[0/0 已交付]', roadmapText: roadmap(9, 4, 3, 2) });
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
  // roadmap 的未关闭计数与 overview 走同一条回写路径，漏了它 --update 之后 check 仍然红。
  assert.match(
    await readFile(path.join(dir, 'requirements/roadmap.md'), 'utf8'),
    /仓库还剩 \*\*1 条\*\*未关闭故事（0 In Progress \+ 0 In Review \+ 1 Backlog/
  );
  assert.match(await readFile(path.join(dir, 'README.md'), 'utf8'), /\[2\/3 delivered\]/);
  assert.match(await readFile(path.join(dir, 'README.zh-CN.md'), 'utf8'), /\[2\/3 已交付\]/);
  assert.equal(updateReadme('x [0/0 已交付] y', countStatuses(await collectStories(dir))), 'x [2/3 已交付] y');
  assert.equal(updateStatusOverview('| **合计**       | 63   |', { total: 7 }), '| **合计**       | 7    |');
  // 行尾 `\s*$` 在 m 模式下会跨行吞掉表后的空行，表格与紧随的引用块就此粘连。
  assert.equal(
    updateStatusOverview('| **合计**       | 63   |\n\n> 注', { total: 7 }),
    '| **合计**       | 7    |\n\n> 注'
  );
  assert.match(
    updateRoadmap(roadmap(9, 4, 3, 2), { total: 3, Done: 2, 'In Progress': 0, 'In Review': 0, Backlog: 1 }),
    /仓库还剩 \*\*1 条\*\*未关闭故事（0 In Progress \+ 0 In Review \+ 1 Backlog/
  );
});

test('roadmap 的未关闭分项、以及「每条未关闭故事都排过期」都被校验', async () => {
  await scaffold(dir);
  const stories = await collectStories(dir);
  assert.deepEqual(checkRoadmap(roadmap(1, 0, 0, 1), stories), []);
  assert.match(
    checkRoadmap('# 排期与约束\n\n## 完成计划\n\n还有一些没做完。\n', stories).join('\n'),
    /找不到「仓库还剩/
  );

  const offenders = checkRoadmap(roadmap(2, 1, 0, 1, ['US-001']), stories);
  assert.match(offenders.join('\n'), /「未关闭合计」写 2，YAML 推导为 1/);
  assert.match(offenders.join('\n'), /「In Progress」写 1，YAML 推导为 0/);
  // 排期里压根没提的未关闭故事：frontmatter、索引、epic 反链可以全对，它照样没人认领。
  assert.match(offenders.join('\n'), /US-003（Backlog）未关闭，却没有排进任何批次/);
  // Done 的故事不必出现在排期里
  assert.equal(offenders.filter(o => o.includes('US-002')).length, 0, JSON.stringify(offenders));
});

test('roadmap 现状快照表的五态与未完成合计也按 YAML 校验，--update 一并回写且不动列宽', async () => {
  await scaffold(dir);
  const stories = await collectStories(dir);
  const stale = roadmap(1, 0, 0, 1)
    .replace('| 🚧 In Progress | 0      |', '| 🚧 In Progress | 1      |')
    .replace('| **未完成合计** | **1**  |', '| **未完成合计** | **9**  |');

  const offenders = checkRoadmap(stale, stories).join('\n');
  assert.match(offenders, /现状快照「🚧 In Progress」写 1，YAML 推导为 0/);
  assert.match(offenders, /现状快照「未完成合计」写 9，YAML 推导为 1/);
  assert.equal(updateRoadmap(stale, countStatuses(stories)), roadmap(1, 0, 0, 1));
  assert.match(
    checkRoadmap(roadmap(1, 0, 0, 1).replace(/^\| 🚫 Blocked .*\n/m, ''), stories).join('\n'),
    /现状快照缺「🚫 Blocked」行/
  );
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

test('epic 数字编号不得重复，即使完整 id 不同', async () => {
  const isolated = await mkdtemp(path.join(dir, 'epic-identity-'));
  await scaffold(isolated);
  await writeFile(
    path.join(isolated, 'requirements/epics/epic-001-y.md'),
    '---\nid: epic-001-y\nstatus: In Progress\n---\n'
  );
  const offenders = checkEpics(await collectEpics(isolated), await collectStories(isolated));
  assert.equal(offenders.length, 1);
  assert.match(offenders[0], /epic-001.*编号重复.*epic-001-x/);
});

test('epic 文件名必须与 frontmatter id 一致', async () => {
  const isolated = await mkdtemp(path.join(dir, 'epic-identity-'));
  await scaffold(isolated);
  await writeFile(
    path.join(isolated, 'requirements/epics/epic-002-y.md'),
    '---\nid: epic-003-z\nstatus: In Progress\n---\n'
  );
  const offenders = checkEpics(await collectEpics(isolated), await collectStories(isolated));
  assert.equal(offenders.length, 1);
  assert.match(offenders[0], /epic-002-y.*文件名.*epic-003-z/);
});

test('epic 只顺带链接、不持有的故事不受状态约束；故事声明的 epic 必须反向链接它', async () => {
  await scaffold(dir, { epicStatus: 'Backlog' });
  await writeFile(
    path.join(dir, 'requirements/epics/epic-001-x.md'),
    `---\nid: epic-001-x\nstatus: Backlog\n---\n\n## 故事\n\n- [US-003](../stories/core/US-003-x.md)\n`
  );
  await writeFile(
    path.join(dir, 'requirements/epics/epic-002-y.md'),
    `---\nid: epic-002-y\nstatus: Backlog\n---\n\n证据：[US-001](../stories/core/US-001-x.md)\n`
  );
  const offenders = checkEpics(await collectEpics(dir), await collectStories(dir));
  assert.equal(offenders.filter(o => o.includes('epic-002-y')).length, 0, 'epic-002 只是引用 US-001，不该被判');
  assert.match(offenders.join('\n'), /US-001-x\.md: 声明 epic epic-001-x，但该 epic 的故事清单没有链接到它/);
});

test('epic 的故事清单漏项不能由 References 里的旁链代替', async () => {
  await scaffold(dir);
  await writeFile(
    path.join(dir, 'requirements/epics/epic-001-x.md'),
    `---\nid: epic-001-x\nstatus: In Progress\n---\n\n## 故事\n\n- [US-001](../stories/core/US-001-x.md)\n- [US-002](../stories/core/US-002-x.md)\n\n## References\n\n[US-003](../stories/core/US-003-x.md) 是正文里的背景引用。\n`
  );
  const offenders = checkEpics(await collectEpics(dir), await collectStories(dir));
  assert.match(offenders.join('\n'), /US-003.*故事清单/);
});

test('roadmap 全景表的行内状态必须与该行故事的 YAML 一致', async () => {
  await scaffold(dir);
  const stories = await collectStories(dir);
  const table = `\n## 未完成需求全景\n\n| Story | 状态 | 剩什么 | 排期位置 |\n| --- | --- | --- | --- |\n| [US-003](stories/core/US-003-x.md) | 👀 In Review | 待评审 | 批次 1 |\n`;
  assert.match(checkRoadmap(roadmap(1, 0, 0, 1) + table, stories).join('\n'), /US-003.*In Review.*Backlog/);
  assert.deepEqual(checkRoadmap(roadmap(1, 0, 0, 1) + table.replace('👀 In Review', '📝 Backlog'), stories), []);
});

test('roadmap 全景表成组列出故事时逐个核对状态，其他章节的状态示例不参与', async () => {
  await scaffold(dir);
  const stories = await collectStories(dir);
  const table = `\n## 未完成需求全景\n\n| Story | 状态 | 剩什么 | 排期位置 |\n| --- | --- | --- | --- |\n| [US-001](stories/core/US-001-x.md) / [US-003](stories/core/US-003-x.md) | 📝 Backlog | 待办 | 批次 1 |\n\n## 排期约束\n\n| [US-001](stories/core/US-001-x.md) | 📝 Backlog | 状态示例 | — |\n`;
  const offenders = checkRoadmap(roadmap(1, 0, 0, 1) + table, stories);
  assert.equal(offenders.length, 1);
  assert.match(offenders[0], /US-001.*Backlog.*Done/);
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

test('代码块与行内代码里的同形文本不算链接', async () => {
  await scaffold(dir);
  await writeFile(
    path.join(dir, 'requirements/stories/core/US-001-x.md'),
    story('US-001', 'Done') +
      [
        '引用坏锚点的形状：`- [:234](…#L234) 说明`，以及 ``[x](gone.md)`` 双反引号。',
        '',
        '```md',
        '[fenced](../../../packages/x/src/nope.ts)',
        '```',
        '',
        '真链接仍被检查：[gone](../../../packages/x/src/nope.ts)',
        ''
      ].join('\n')
  );
  const offenders = await checkLinks(dir);
  assert.deepEqual(offenders, [
    'requirements/stories/core/US-001-x.md: 链接目标不存在 → ../../../packages/x/src/nope.ts'
  ]);
});

test('maskCode 只清内容，行数与行外文本原样保留', () => {
  assert.equal(maskCode('a `b c` d'), 'a `   ` d');
  assert.equal(maskCode('~~~\nx\n~~~\ny'), '   \n \n   \ny');
  assert.equal(maskCode('`a` 和 `b`'), '` ` 和 ` `');
  assert.equal(maskCode('单个 ` 不成对'), '单个 ` 不成对');
});

test('headingSlug 按 GitHub 规则算：标点删掉留下空位，连续空位产出连续连字符', () => {
  // 两条都取自本仓库现有的**正确**锚点，算法必须原样复现它们
  assert.equal(headingSlug('Raw SQL / adapter 直写的 bypass 门禁判定'), 'raw-sql--adapter-直写的-bypass-门禁判定');
  assert.equal(
    headingSlug('发现 7：AC#7 的 ✅ 高估了它的证据（2026-09-04 复核）'),
    '发现-7ac7-的--高估了它的证据2026-09-04-复核'
  );
  // 全角括号同样是标点：删掉后 `域` 与 `tracked` 之间没有空位，`/` 两侧的空格则留成双连字符
  assert.equal(headingSlug('版本化域（tracked / untracked）'), '版本化域tracked--untracked');
  assert.equal(
    headingSlug('`devtools/` 产物会被 nx 缓存恢复抹掉（**已修**）'),
    'devtools-产物会被-nx-缓存恢复抹掉已修'
  );
  assert.equal(headingSlug('指向 [别处](../x.md) 的标题'), '指向-别处-的标题');
});

test('标题锚点指不到目标标题时阻断，跨文件与文件内同等对待', async () => {
  await scaffold(dir);
  await writeFile(
    path.join(dir, 'requirements/stories/core/US-002-x.md'),
    `${story('US-002', 'Done')}\n## 版本化域（tracked / untracked）\n\n### Raw SQL / adapter 直写\n`
  );
  await writeFile(
    path.join(dir, 'requirements/stories/core/US-001-x.md'),
    [
      story('US-001', 'Done'),
      '## 本文标题',
      '',
      '少一个连字符：[坏](./US-002-x.md#版本化域tracked-untracked)',
      '对的：[好](./US-002-x.md#版本化域tracked--untracked)',
      '文件内指向已删章节：[没了](#已经删掉的一节)',
      '文件内对的：[在](#本文标题)',
      ''
    ].join('\n')
  );
  const offenders = await checkLinks(dir);
  assert.equal(offenders.length, 2, offenders.join('\n'));
  assert.match(offenders.join('\n'), /标题锚点 #版本化域tracked-untracked 在 .*US-002-x\.md 里没有对应标题/);
  assert.match(offenders.join('\n'), /标题锚点 #已经删掉的一节 在本文件里没有对应标题/);
});

test('evidenceSymbols 只取正文里的符号名，链接文字与 URL 里的文件名不算', () => {
  // `[:234](…/plugin.ts#L234)` 的链接文字与路径整段丢弃，否则 `plugin` 会让任何指向 plugin.ts 的锚点都"有证据"
  const symbols = evidenceSymbols(
    '- [:234](../../../packages/x/src/plugin.ts#L234) 构造期 assertSupportedAdapter() 校验**配置**里的适配器名'
  );
  assert.deepEqual([...symbols], ['assertSupportedAdapter']);
  assert.deepEqual([...evidenceSymbols('（[RxDB.ts:432-434](../x.ts#L432-L434)）：')], []);
  // 语言关键字与三字以内的短词不作证据：`this` 被剔除，`init` 留着（弱证据只会让判定更保守）
  assert.deepEqual([...evidenceSymbols('this.schemaManager.init();')], ['schemaManager', 'init']);
  // 但链接文字**本身就是反引号符号名**时它是 CONVENTIONS 优先级 1 的正体，必须留下
  assert.deepEqual(
    [...evidenceSymbols('与 [`runIsolated`](../../../packages/rxdb/src/a.ts#L39) 的首错口径一致')],
    ['runIsolated']
  );
});

test('行号锚点：符号在目标文件里整体不存在则阻断，只是行号漂了则告警', async () => {
  await scaffold(dir);
  await writeFile(
    path.join(dir, 'packages/x/src/a.ts'),
    ['export class Widget {', '  readonly inject = [];', '', '  start(): void {}', '}', ''].join('\n')
  );
  await writeFile(
    path.join(dir, 'requirements/stories/core/US-001-x.md'),
    [
      story('US-001', 'Done'),
      '- `Widget.start()` 是入口（[a.ts:4](../../../packages/x/src/a.ts#L4)）',
      '- `Widget.start()` 行号漂了（[a.ts:2](../../../packages/x/src/a.ts#L2)）',
      '- `assertSupportedAdapter()` 早已搬走（[a.ts:2](../../../packages/x/src/a.ts#L2)）',
      '- [:2](../../../packages/x/src/a.ts#L2) 构造期校验适配器名',
      ''
    ].join('\n')
  );
  const { offenders, warnings } = await checkAnchorEvidence(dir);
  assert.equal(offenders.length, 1, offenders.join('\n'));
  assert.match(offenders[0], /#L2 的伴随符号 assertSupportedAdapter 在 .*a\.ts 里不存在/);
  assert.equal(warnings.length, 2, warnings.join('\n'));
  assert.match(warnings.join('\n'), /#L2 所引区间不含 Widget \/ start，行号已漂/);
  assert.match(warnings.join('\n'), /#L2 没有伴随的符号名或代码引用（CONVENTIONS 优先级 3：行号不单用）/);
});

test('行号锚点的伴随符号可以来自紧随其后的代码块与相邻行', async () => {
  await scaffold(dir);
  await writeFile(
    path.join(dir, 'packages/x/src/a.ts'),
    ['export class Widget {', '  start(): void {', '    this.schemaManager.init();', '  }', '}', ''].join('\n')
  );
  await writeFile(
    path.join(dir, 'requirements/stories/core/US-001-x.md'),
    [
      story('US-001', 'Done'),
      '证据在下面的代码块里（[a.ts:3](../../../packages/x/src/a.ts#L3)）：',
      '',
      '```ts',
      'this.schemaManager.init();',
      '```',
      ''
    ].join('\n')
  );
  const { offenders, warnings } = await checkAnchorEvidence(dir);
  assert.deepEqual(offenders, []);
  assert.deepEqual(warnings, []);
});

test('叙述词扫描认得「（已修）」「历史快照」与带日期的标题', async () => {
  await scaffold(dir);
  await writeFile(
    path.join(dir, 'requirements/stories/core/US-001-x.md'),
    [
      story('US-001', 'Done'),
      '### 发现 1：中继一直在广播（已修）',
      '### 发现 9：dispose() 零调用点（**未修**，随 C3）',
      '### PR-C4 第一片：授权矩阵（2026-09-05）',
      '本节以下两段是 2026-08-31 的历史快照，被下一节整节取代。',
      '`dev-rxdb-tauri` 单测 24 文件 231 条（原 22 / 222）',
      ''
    ].join('\n')
  );
  const hits = (await scanNarrative(dir)).find(r => r.rel.endsWith('US-001-x.md'));
  const labels = hits.hits.map(([label]) => label);
  assert.deepEqual(labels.toSorted(), ['历史快照', '带日期的标题', '已修 / 未修', '裸测试计数'].toSorted());
});

test('正文验收日期、评审轮次和粗体验收注记属于过程叙述，交付期限不误报', async () => {
  await scaffold(dir);
  await writeFile(
    path.join(dir, 'requirements/stories/core/US-001-x.md'),
    [
      story('US-001', 'Done'),
      '> **验收注记（2026-11-16）**：测试通过。',
      '验证日期：2026-11-16。',
      '第 2 轮评审修复了遗漏。',
      '已于 **2026-11-16** 关闭。',
      ''
    ].join('\n')
  );
  await writeFile(
    path.join(dir, 'requirements/stories/core/US-002-x.md'),
    [story('US-002', 'Done'), '交付期限：2026-12-01；日期字段格式 YYYY-MM-DD。', ''].join('\n')
  );
  const hits = await scanNarrative(dir);
  assert.deepEqual(
    hits.map(hit => hit.rel),
    ['requirements/stories/core/US-001-x.md']
  );
  assert.deepEqual(
    hits[0].hits.map(([label]) => label).toSorted(),
    ['带日期的验收记录', '第 N 轮复核 / 评审', '已于 X 日'].toSorted()
  );
});

test('仓库现状：requirements 派生视图与 YAML 一致（回归护栏）', async () => {
  const root = path.resolve(import.meta.dirname, '../..');
  const { offenders } = await run({ root });
  assert.deepEqual(offenders, []);
});

test('run() 把叙述词与行号锚点两类告警分开返回，计数不再互相污染', async () => {
  await scaffold(dir);
  await writeFile(
    path.join(dir, 'packages/x/src/a.ts'),
    ['export class Widget {', '  readonly inject = [];', '', '  start(): void {}', '}', ''].join('\n')
  );
  await writeFile(
    path.join(dir, 'requirements/stories/core/US-001-x.md'),
    [story('US-001', 'Done'), '- `Widget.start()` 行号漂了（[a.ts:2](../../../packages/x/src/a.ts#L2)）', ''].join('\n')
  );
  await writeFile(
    path.join(dir, 'requirements/stories/core/US-002-x.md'),
    [story('US-002', 'Done'), '### 门禁快照（2026-01-01）', ''].join('\n')
  );
  const { warnings } = await run({ root: dir });
  // 一个文件的叙述词 + 一条锚点漂移。合成一个数组去数，就会打印成「2 个文件含过程叙述」。
  assert.equal(warnings.narrative.length, 1, JSON.stringify(warnings));
  assert.equal(warnings.evidence.length, 1, JSON.stringify(warnings));
  assert.match(warnings.narrative[0], /US-002-x\.md: 带日期的标题×1/);
  assert.match(warnings.evidence[0], /US-001-x\.md:\d+: .*#L2 所引区间不含/);
});

test('checkAnchorEvidence 阻断「符号名作链接文字」却在目标文件里查无此名的断言', async () => {
  await scaffold(dir);
  await writeFile(
    path.join(dir, 'packages/x/src/a.ts'),
    ['export class Widget {', '  start(): void {}', '}', ''].join('\n')
  );
  await writeFile(
    path.join(dir, 'requirements/stories/core/US-001-x.md'),
    [
      story('US-001', 'Done'),
      // 改了名却留着旧名当证据锚 —— 归属无歧义，就是假断言
      '- 收尾走 [`Widget.stopEverything()`](../../../packages/x/src/a.ts)',
      // 仍在的照旧放行
      '- 启动走 [`Widget.start()`](../../../packages/x/src/a.ts)',
      // 包名不是符号，不该当断言校验
      '- 归属 [`@scope/x`](../../../packages/x/src/a.ts)',
      ''
    ].join('\n')
  );
  const { offenders } = await checkAnchorEvidence(dir);
  assert.equal(offenders.length, 1, JSON.stringify(offenders));
  assert.match(offenders[0], /US-001-x\.md:\d+: `Widget\.stopEverything\(\)` 在 .*a\.ts 里不存在/);
});

test('「历史快照」只在给章节贴标签时才算叙述词，undo/redo 的领域名词不算', async () => {
  await scaffold(dir);
  await writeFile(
    path.join(dir, 'requirements/stories/core/US-001-x.md'),
    [
      story('US-001', 'Done'),
      '| undo/redo 历史快照 | `HistoryManager.ts` 持有物化视图 |',
      '- binary patch 和历史快照复制当前视图字节，不持有调用方可变引用',
      ''
    ].join('\n')
  );
  await writeFile(
    path.join(dir, 'requirements/stories/core/US-002-x.md'),
    [story('US-002', 'Done'), '本节是 2026-01-01 的历史快照。', ''].join('\n')
  );
  const hits = await scanNarrative(dir);
  assert.equal(
    hits.find(r => r.rel.endsWith('US-001-x.md')),
    undefined,
    JSON.stringify(hits)
  );
  assert.deepEqual(hits.find(r => r.rel.endsWith('US-002-x.md')).hits, [['历史快照', 1]]);
});

test('code-scanning 是告警跟踪记录，与 reviews 同样不受叙述词约束', async () => {
  await scaffold(dir);
  await mkdir(path.join(dir, 'requirements/code-scanning'), { recursive: true });
  await writeFile(
    path.join(dir, 'requirements/code-scanning/README.md'),
    '# Code Scanning 告警跟踪\n\n## 生命周期（2026-08-28 定）\n\n### 第一批（2026-08-16 报出，21 条）\n'
  );
  const hits = await scanNarrative(dir);
  assert.equal(
    hits.find(r => r.rel.includes('code-scanning')),
    undefined,
    JSON.stringify(hits)
  );
});

test('Done 故事的 AC 表残留 ⬜ 或 ⚠️ 都被抓出；✅ 放行；非 Done 不查', async () => {
  await scaffold(dir);
  await writeFile(
    path.join(dir, 'requirements/stories/core/US-001-x.md'),
    story('US-001', 'Done') +
      '\n## 验收标准\n\n| # | 前置 | 操作 | 预期 | 状态 |\n| --- | --- | --- | --- | --- |\n| 1 | a | b | c | ⬜ |\n| 2 | a | b | c | ⚠️ 部分宿主证据待补 |\n| 3 | a | b | c | ✅ |\n'
  );
  await writeFile(
    path.join(dir, 'requirements/stories/core/US-003-x.md'),
    story('US-003', 'Backlog') +
      '\n## 验收标准\n\n| # | 前置 | 操作 | 预期 | 状态 |\n| --- | --- | --- | --- | --- |\n| 1 | a | b | c | ⬜ |\n| 2 | a | b | c | ⚠️ |\n'
  );
  const stories = await collectStories(dir);
  const offenders = checkAcSymbols(stories);
  assert.match(offenders.join('\n'), /US-001-x\.md: Done 故事的 AC 行仍标 ⬜/);
  assert.match(offenders.join('\n'), /US-001-x\.md: Done 故事的 AC#2 仍标 ⚠️/);
  assert.doesNotMatch(offenders.join('\n'), /US-003/);
  assert.equal(offenders.length, 2);
});

test('Done 的 ⚠️ 只在登记为候选时放行；带脚注的 ✅ 与证据表里的 ⚠️ 字样不算', () => {
  const text =
    '## 验收标准\n\n| 1 | 当前范围 | 操作 | 结果 | ✅ ³ |\n| 2 | 待准入范围 | 操作 | 结果 | ⚠️ 候选 |\n\n| 1 | 本包单测验收；真实宿主的 ⚠️ 见候选 AC#2 |\n';
  const done = { rel: 'US-001.md', fm: { status: 'Done', candidate_acs: '[2]' }, text };
  assert.deepEqual(checkAcSymbols([done]), []);
});

test('In Review 的当前承诺 AC 全部 ✅ 时被抓出：实现 PR 内直接标 Done', () => {
  const allGreen = '## 验收标准\n\n| 1 | 前置 | 操作 | 结果 | ✅ |\n| 2 | 前置 | 操作 | 结果 | ✅ |\n';
  const review = text => ({ rel: 'US-001.md', fm: { status: 'In Review' }, text });
  assert.match(checkAcSymbols([review(allGreen)]).join('\n'), /US-001\.md: In Review 故事的当前承诺 AC 已全部 ✅/);

  // 还有一条未 ✅ 的当前承诺 AC，就是 In Review 的正当理由。
  for (const pending of ['⚠️ 待真机复验', '⬜'])
    assert.deepEqual(checkAcSymbols([review(allGreen.replace('| ✅ |\n| 2', `| ${pending} |\n| 2`))]), []);

  // 其他状态不受这条规则约束。
  for (const status of ['Backlog', 'In Progress', 'Done', 'Blocked'])
    assert.deepEqual(checkAcSymbols([{ rel: 'US-001.md', fm: { status }, text: allGreen }]), []);
});

test('In Review 不能靠候选 AC 或证据表撑着：候选不参与关闭，证据行不是 AC', () => {
  const withCandidate = {
    rel: 'US-001.md',
    fm: { status: 'In Review', candidate_acs: '[2]' },
    text: '## 验收标准\n\n| 1 | 当前范围 | 操作 | 结果 | ✅ |\n| 2 | 候选阶段 | 操作 | 结果 | ⚠️ 候选 |\n'
  };
  assert.match(checkAcSymbols([withCandidate]).join('\n'), /In Review 故事的当前承诺 AC 已全部 ✅/);

  const withEvidenceTable = {
    rel: 'US-002.md',
    fm: { status: 'In Review' },
    text: '## 验收标准\n\n| 1 | 前置 | 操作 | 结果 | ✅ |\n\n| 1 | 三端同名单测，失败路径只有单测 |\n'
  };
  assert.match(checkAcSymbols([withEvidenceTable]).join('\n'), /US-002\.md: In Review/);
});

test('没有数字编号 AC 行的 In Review 故事不判全绿（Given / When / Then 形态门禁读不到）', () => {
  const speckit = {
    rel: 'US-001.md',
    fm: { status: 'In Review' },
    text: '## 验收标准\n\n- **US1-AC1**：**Given** a，**When** b，**Then** c\n'
  };
  assert.deepEqual(checkAcSymbols([speckit]), []);
});

test('acIdsOf 只数验收标准节里带编号的行，节外与 Given/When 行不算', () => {
  const text =
    '# x\n\n## 验收标准\n\n| # | 前置 | 操作 | 预期 | 状态 |\n| --- | --- | --- | --- | --- |\n| 1 | a | b | c | ✅ |\n| 2 | a | b | c | ✅ |\n\n## 技术笔记\n\n| 99 | 这不是 AC |\n';
  assert.deepEqual(acIdsOf(text), [1, 2]);
  assert.deepEqual(acIdsOf('# x\n\n## 验收标准\n\n**Given** a / **When** b / **Then** c\n'), []);
});

test('Done 的当前承诺通过后可保留明确登记的候选 AC 未验，但不能漏掉当前 AC', () => {
  const text = '## 验收标准\n\n| 1 | 当前范围 | 操作 | 结果 | ✅ |\n| 2 | 候选阶段 | 操作 | 结果 | ⬜ |\n';
  const current = { rel: 'US-001.md', fm: { status: 'Done', candidate_acs: '[2]' }, text };
  assert.deepEqual(checkAcSymbols([current]), []);
  assert.match(checkAcSymbols([{ ...current, text: text.replace('✅', '⬜') }]).join('\n'), /Done.*⬜/);
});

test('AC 状态明确标为候选或移出时必须登记 candidate_acs，各故事状态均适用', () => {
  for (const status of ['Done', 'Backlog']) {
    for (const label of ['⚠️ 候选', '⚠️ 移出承诺范围', '⬜ 候选阶段']) {
      const current = {
        rel: 'US-001.md',
        fm: { status },
        text: `## 验收标准\n\n| 1 | 待准入范围 | 操作 | 结果 | ${label} |\n`
      };
      assert.match(checkAcSymbols([current]).join('\n'), /AC#1.*candidate_acs/);
      assert.deepEqual(checkAcSymbols([{ ...current, fm: { status, candidate_acs: '[1]' } }]), []);
    }
  }
});

test('AC 证据说明提及其他候选编号时不要求把当前 AC 也登记为候选', () => {
  const current = {
    rel: 'US-001.md',
    fm: { status: 'Done' },
    text: '## 验收标准\n\n| 1 | 当前范围 | 操作 | 结果 | ✅ |\n\n| 1 | 本包单测验收；真实宿主为候选 AC#2 |\n'
  };
  assert.deepEqual(checkAcSymbols([current]), []);
});

test('候选 AC 登记必须是存在且不重复的整数，不能借无效登记绕过验收', () => {
  const text = '## 验收标准\n\n| 1 | 当前范围 | 操作 | 结果 | ⬜ |\n';
  for (const raw of ['[2]', '[1, 1]', '["1"]', 'not-a-list']) {
    const current = { rel: 'US-001.md', fm: { status: 'Backlog', candidate_acs: raw }, text };
    assert.match(checkAcSymbols([current]).join('\n'), /candidate_acs/);
  }
});

test('候选 AC 不得先标通过；解锁后应移除候选登记再按正常范围验收', () => {
  const current = {
    rel: 'US-001.md',
    fm: { status: 'Backlog', candidate_acs: '[1]' },
    text: '## 验收标准\n\n| 1 | 候选阶段 | 操作 | 结果 | ✅ |\n'
  };
  assert.match(checkAcSymbols([current]).join('\n'), /候选 AC.*✅/);
});

test('CRLF 和行尾空白不改变当前 AC 未验与候选 AC 提前通过的阻断', () => {
  const current = {
    rel: 'US-001.md',
    fm: { status: 'Done', candidate_acs: '[2]' },
    text: '## 验收标准\r\n\r\n| 1 | 当前范围 | 操作 | 结果 | ⬜ |  \r\n| 2 | 候选阶段 | 操作 | 结果 | ✅ |\r\n'
  };
  const offenders = checkAcSymbols([current]);
  assert.equal(offenders.length, 2);
  assert.match(offenders.join('\n'), /Done.*⬜/);
  assert.match(offenders.join('\n'), /候选 AC.*✅/);
});

test('inherited_acs：from 指向不存在的故事、纯数字 ac 超出源 AC 行数，都被抓出', async () => {
  await scaffold(dir);
  await writeFile(
    path.join(dir, 'requirements/stories/core/US-002-x.md'),
    story('US-002', 'Done') +
      '\n## 验收标准\n\n| # | 前置 | 操作 | 预期 | 状态 |\n| --- | --- | --- | --- | --- |\n| 1 | a | b | c | ✅ |\n'
  );
  await writeFile(
    path.join(dir, 'requirements/stories/core/US-001-x.md'),
    story(
      'US-001',
      'Done',
      'inherited_acs:\n  - from: US-999\n    ac: 1\n    note: 幽灵\n  - from: US-002\n    ac: 9\n    note: 越界\n  - from: US-002\n    ac: US1-AC3\n    note: 复合编号留人工核对\n'
    )
  );
  const offenders = checkInheritedAcs(await collectStories(dir));
  assert.match(offenders.join('\n'), /US-001-x\.md: inherited_acs 的 from US-999 没有对应的故事文件/);
  assert.match(offenders.join('\n'), /ac 9 超出 US-002 验收标准表的最大编号 1/);
  assert.doesNotMatch(offenders.join('\n'), /US1-AC3/);
});

// 源故事 AC 表有空洞、不按编号排序时（US-212 的形状：1～26、31～34、27、28，共 32 行；29 / 30 已移出），
// 表里还在的高编号不能因为「超出行数」被拒；移出的 AC 按约定从源表删除，编号不在表里但在编号范围内照常放行。
test('inherited_acs：按源 AC 表的最大编号判越界，不按行数', async () => {
  await scaffold(dir);
  const rows = [...Array.from({ length: 26 }, (_, i) => i + 1), 31, 32, 33, 34, 27, 28]
    .map(id => `| ${id} | a | b | c | ✅ |`)
    .join('\n');
  await writeFile(
    path.join(dir, 'requirements/stories/core/US-002-x.md'),
    story('US-002', 'Done') +
      `\n## 验收标准\n\n| # | 前置 | 操作 | 预期 | 状态 |\n| --- | --- | --- | --- | --- |\n${rows}\n`
  );
  const inherit = ac => `  - from: US-002\n    ac: ${ac}\n    note: x\n`;
  await writeFile(
    path.join(dir, 'requirements/stories/core/US-001-x.md'),
    story('US-001', 'Done', `inherited_acs:\n${inherit(33)}${inherit(34)}${inherit(29)}${inherit(35)}`)
  );
  const offenders = checkInheritedAcs(await collectStories(dir));
  assert.deepEqual(offenders, [
    'requirements/stories/core/US-001-x.md: inherited_acs 的 ac 35 超出 US-002 验收标准表的最大编号 34'
  ]);
});

test('README 大故事清单与「正文含交付阶段」的集合不一致时被抓出', async () => {
  await scaffold(dir);
  const stories = await collectStories(dir);
  await writeFile(
    path.join(dir, 'requirements/stories/core/US-001-x.md'),
    story('US-001', 'Done') + '\n## 交付阶段\n\n| 阶段 | 范围 | 关闭判据 |\n| --- | --- | --- |\n| A | x | AC#1 |\n'
  );
  const actual = await collectStories(dir);
  const readme = '# x\n\n现有 2 条：[US-001](stories/core/US-001-x.md)、[US-002](stories/core/US-002-x.md)\n';
  const offenders = checkBigStoryList(readme, actual);
  assert.match(offenders.join('\n'), /大故事清单写「现有 2 条」，实际 1 条/);
  assert.match(offenders.join('\n'), /清单 US-001 US-002，实际 US-001/);
  void stories;
});

test('README 大故事清单整段缺失、为空或格式损坏时同样被抓出；实际没有大故事时不要求清单', async () => {
  await scaffold(dir);
  const withoutBigStories = await collectStories(dir);
  assert.deepEqual(checkBigStoryList('# x\n\n没有清单。\n', withoutBigStories), []);
  assert.deepEqual(checkBigStoryList('# x\n\n现有 0 条：\n', withoutBigStories), []);

  await writeFile(
    path.join(dir, 'requirements/stories/core/US-001-x.md'),
    story('US-001', 'Done') + '\n## 交付阶段\n\n| 阶段 | 范围 | 关闭判据 |\n| --- | --- | --- |\n| A | x | AC#1 |\n'
  );
  const stories = await collectStories(dir);
  assert.match(
    checkBigStoryList('# x\n\n没有清单。\n', stories).join('\n'),
    /缺少大故事清单「现有 N 条：」，实际 1 条：US-001/
  );
  assert.match(checkBigStoryList('# x\n\n现有 1 条：\n', stories).join('\n'), /清单 （空），实际 US-001/);
  assert.match(checkBigStoryList('# x\n\n现有 1 条：US-001\n', stories).join('\n'), /清单 （空），实际 US-001/);
  assert.deepEqual(checkBigStoryList('# x\n\n现有 1 条：[US-001](stories/core/US-001-x.md)\n', stories), []);
});

// 大故事清单写在 requirements/README.md；run() 曾把仓库根 README.md 传给这道检查，
// 根 README 里没有「现有 N 条」，检查因此恒绿，清单漏掉 US-313 / US-314 也没人发现。
test('run() 按 requirements/README.md 核对大故事清单', async () => {
  await scaffold(dir);
  await writeFile(
    path.join(dir, 'requirements/README.md'),
    '# 需求管理\n\n现有 1 条：[US-002](stories/core/US-002-x.md)。\n'
  );
  const { offenders } = await run({ root: dir });
  assert.match(offenders.join('\n'), /requirements\/README\.md: 大故事清单写「现有 1 条」，实际 0 条/);
});

test('capability-matrix / versioning-policy 的包计数与 packages/、api-baseline/ 实际不符时被抓出', async () => {
  await scaffold(dir);
  await writeFile(path.join(dir, 'packages/x/package.json'), JSON.stringify({ name: '@aiao/x' }));
  await mkdir(path.join(dir, 'requirements/api-baseline'), { recursive: true });
  await writeFile(path.join(dir, 'requirements/api-baseline/x.json'), '{}');
  const right = await checkPackageCounts(dir);
  assert.deepEqual(right, []);
  await writeFile(
    path.join(dir, 'requirements/capability-matrix.md'),
    '| 总包目录 | **9 个** `packages/*`（有 `package.json` 的公开包）。其中 **8 个**受 API baseline 保护 |\n'
  );
  await writeFile(
    path.join(dir, 'requirements/versioning-policy.md'),
    '全部公开包同步发版（当前 **7 个**，其中 6 个受 API 基线保护）\n'
  );
  const offenders = await checkPackageCounts(dir);
  assert.match(offenders.join('\n'), /capability-matrix\.md: 公开包写 9 个，实际 1 个/);
  assert.match(offenders.join('\n'), /capability-matrix\.md: 受基线保护写 8 个，实际 1 个/);
  assert.match(offenders.join('\n'), /versioning-policy\.md: 公开包写 7 个 \/ 受保护 6 个，实际 1 \/ 1/);
});

/** 下面的用例会增删故事与史诗文件，各用一个独立目录，不把残留留给共享目录里的其他用例。 */
async function freshRepo(t) {
  const repo = await mkdtemp(path.join(os.tmpdir(), 'req-consistency-'));
  t.after(() => rm(repo, { recursive: true, force: true }));
  await scaffold(repo);
  return repo;
}

// ── 派生段落由脚本生成 ──────────────────────────────────────────────────────────────

const acTable = rows =>
  `\n## 验收标准\n\n| # | 前置 | 操作 | 预期 | 状态 |\n| --- | --- | --- | --- | --- |\n${rows.map(([n, s]) => `| ${n} | a | b | c | ${s} |`).join('\n')}\n`;

test('openAcSummary 列出未通过的当前承诺 AC：连续编号压成区间，候选不算，没有数字 AC 时如实说明', () => {
  const of = (rows, extra = {}) => openAcSummary({ fm: { status: 'In Progress', ...extra }, text: acTable(rows) });
  assert.equal(
    of([
      [1, '✅'],
      [2, '⬜'],
      [3, '⚠️ 待真机'],
      [4, '⬜'],
      [5, '✅'],
      [6, '⬜']
    ]),
    '未通过 AC#2～#4、#6（4/6）'
  );
  assert.equal(
    of(
      [
        [1, '✅'],
        [2, '⚠️ 候选']
      ],
      { candidate_acs: '[2]' }
    ),
    'AC 已全部通过'
  );
  assert.equal(
    openAcSummary({ fm: {}, text: '## 验收标准\n\n- **US1-AC1**：**Given** a\n' }),
    'AC 不是数字编号，见故事'
  );
});

test('openAcSummary 不让没验的 AC 消失：状态格空着或写了别的也算未通过，只有候选 AC 时不说「全部通过」', () => {
  const of = (rows, extra = {}) => openAcSummary({ fm: { status: 'In Review', ...extra }, text: acTable(rows) });
  assert.equal(
    of([
      [1, '✅'],
      [2, ''],
      [3, '待定']
    ]),
    '未通过 AC#2、#3（2/3）'
  );
  assert.equal(of([[1, '⬜ 候选']], { candidate_acs: '[1]' }), '只有候选 AC，没有当前承诺的 AC');
  // 验收标准一节里按 AC 编号排的证据表不是 AC 表：表头末列不是「状态」。
  const withEvidenceTable = `${acTable([[1, '✅']])}\n| AC | 证据 |\n| --- | --- |\n| 1 | 三端同名单测 |\n| 2 | 失败路径只有单测 |\n`;
  assert.equal(openAcSummary({ fm: {}, text: withEvidenceTable }), 'AC 已全部通过');
});

test('AC 表的状态格必须以 ✅ / ⚠️ / ⬜ 开头：空着或写别的都被抓出，证据表不查', () => {
  const of = rows => ({ rel: 'US-001.md', fm: { status: 'In Progress' }, text: acTable(rows) });
  assert.deepEqual(
    checkAcStatusCells([
      of([
        [1, '✅ ³'],
        [2, '⚠️ 待真机'],
        [3, '⬜']
      ])
    ]),
    []
  );
  const offenders = checkAcStatusCells([
    of([
      [1, ''],
      [2, '↪ 已转移'],
      [3, '通过']
    ])
  ]);
  assert.equal(offenders.length, 3);
  assert.match(offenders.join('\n'), /US-001\.md: AC#2 的状态格必须以 ✅ \/ ⚠️ \/ ⬜ 开头（现为「↪ 已转移」）/);
  assert.match(offenders.join('\n'), /AC#1 的状态格必须以.*现为「」/);
  const evidenceOnly = {
    rel: 'US-002.md',
    fm: {},
    text: '## 验收标准\n\n| AC | 证据 |\n| --- | --- |\n| 1 | 三端同名单测 |\n'
  };
  assert.deepEqual(checkAcStatusCells([evidenceOnly]), []);
});

test('--update 重新生成进行中 / 待评审 / 阻塞三段与按 Epic 索引，手写的说明文字原样保留', async t => {
  const repo = await freshRepo(t);
  const put = (name, text) => writeFile(path.join(repo, 'requirements/stories/core', name), text);
  await put(
    'US-003-x.md',
    story('US-003', 'In Progress') +
      acTable([
        [1, '✅'],
        [2, '⬜']
      ])
  );
  await put('US-004-x.md', story('US-004', 'In Review') + acTable([[1, '⚠️']]));
  await put('US-010-x.md', story('US-010', 'Blocked'));
  const epicPath = path.join(repo, 'requirements/epics/epic-001-x.md');
  await writeFile(
    epicPath,
    `${await readFile(epicPath, 'utf8')}- [US-004](../stories/core/US-004-x.md)\n- [US-010](../stories/core/US-010-x.md)\n`
  );
  const overviewPath = path.join(repo, 'requirements/status-overview.md');
  await writeFile(
    overviewPath,
    (await readFile(overviewPath, 'utf8')).replace(
      '### [X](epics/epic-001-x.md)\n',
      '### [旧标题](epics/epic-001-x.md)\n\n这段说明是手写的。\n'
    )
  );
  await writeFile(
    path.join(repo, 'requirements/roadmap.md'),
    roadmap(3, 1, 1, 0, ['US-003', 'US-004', 'US-010'], 2, 1)
  );
  await writeFile(path.join(repo, 'README.md'), '# x\n\nStatus [2/5 delivered]\n');

  const stale = await run({ root: repo });
  assert.match(
    stale.offenders.join('\n'),
    /status-overview\.md: 生成段落与故事 YAML 不一致.*audit:requirements:update/
  );

  const { offenders } = await run({ root: repo, update: true });
  assert.deepEqual(offenders, []);
  const fixed = await readFile(overviewPath, 'utf8');
  assert.match(
    fixed,
    /## 进行中（1 条）\n\n- \[US-003 US-003\]\(stories\/core\/US-003-x\.md\)：未通过 AC#2（1\/2）\n\n## 待评审（1 条）/
  );
  assert.match(
    fixed,
    /## 待评审（1 条）\n\n- \[US-004 US-004\]\(stories\/core\/US-004-x\.md\)：未通过 AC#1（1\/1）\n\n## 阻塞（1 条）/
  );
  assert.match(fixed, /## 阻塞（1 条）\n\n- \[US-010 US-010\]\(stories\/core\/US-010-x\.md\)\n\n## 按 Epic 索引/);
  // 小节标题跟着 epic 的一级标题走，说明文字留着，故事按编号排。
  assert.match(
    fixed,
    /### \[X\]\(epics\/epic-001-x\.md\)\n\n这段说明是手写的。\n\n- ✅ \[US-001 US-001\]\(stories\/core\/US-001-x\.md\)\n- ✅ \[US-002 US-002\]\(stories\/core\/US-002-x\.md\)\n- 🚧 \[US-003 US-003\]\(stories\/core\/US-003-x\.md\)\n- 👀 \[US-004 US-004\]\(stories\/core\/US-004-x\.md\)\n- 🚫 \[US-010 US-010\]\(stories\/core\/US-010-x\.md\)\n$/
  );
  // 再跑一次不产生任何改动：生成结果是稳定的。
  await run({ root: repo, update: true });
  assert.equal(await readFile(overviewPath, 'utf8'), fixed);
});

test('新史诗在索引里自动得到小节并按史诗编号排位；指向不存在的史诗的小节不动并报出', async t => {
  const repo = await freshRepo(t);
  await writeFile(
    path.join(repo, 'requirements/epics/epic-002-y.md'),
    '---\nid: epic-002-y\nstatus: Backlog\n---\n\n# Y\n\n## 故事\n\n- [US-005](../stories/core/US-005-x.md)\n'
  );
  await writeFile(
    path.join(repo, 'requirements/stories/core/US-005-x.md'),
    story('US-005', 'Backlog').replace('epic: epic-001-x', 'epic: epic-002-y')
  );
  const stories = await collectStories(repo);
  const epics = await collectEpics(repo);
  const before = await readFile(path.join(repo, 'requirements/status-overview.md'), 'utf8');
  const next = renderStatusOverview(before, stories, epics);
  assert.match(
    next,
    /- ⬜ \[US-003 US-003\]\(stories\/core\/US-003-x\.md\)\n\n### \[Y\]\(epics\/epic-002-y\.md\)\n\n- ⬜ \[US-005 US-005\]\(stories\/core\/US-005-x\.md\)\n$/
  );

  const orphan = next.replace('### [Y](epics/epic-002-y.md)', '### [改名前](epics/epic-009-gone.md)');
  const readme = '# 需求管理\n\nEpic：\n\n- [epic-001 X](epics/epic-001-x.md)\n- [epic-002 Y](epics/epic-002-y.md)\n';
  const offenders = checkGeneratedViews({ overview: orphan, readme }, stories, epics);
  assert.match(offenders.join('\n'), /status-overview\.md: 索引小节指向不存在的 epic-009-gone/);
  // 回写不删那一节：标题下可能有手写的说明，改好链接之后再生成。
  assert.match(renderStatusOverview(orphan, stories, epics), /### \[改名前\]\(epics\/epic-009-gone\.md\)/);
});

test('requirements/README.md 的 Epic 清单由 epic 文件生成：漏列、多列、标题过期都算不一致', async t => {
  const repo = await freshRepo(t);
  await writeFile(
    path.join(repo, 'requirements/epics/epic-002-y.md'),
    '---\nid: epic-002-y\nstatus: Backlog\n---\n\n# Y\n\n## 故事\n'
  );
  const epics = await collectEpics(repo);
  // 一条标题过期、一条指向已经不存在的史诗、还漏了 epic-002。
  const readme =
    '# 需求管理\n\nEpic：\n\n- [epic-001 旧标题](epics/epic-001-x.md)\n- [epic-009 已删除](epics/epic-009-gone.md)\n\n视图：\n';
  assert.equal(
    renderEpicList(readme, epics),
    '# 需求管理\n\nEpic：\n\n- [epic-001 X](epics/epic-001-x.md)\n- [epic-002 Y](epics/epic-002-y.md)\n\n视图：\n'
  );
  const readmePath = path.join(repo, 'requirements/README.md');
  await writeFile(readmePath, readme);
  const { offenders } = await run({ root: repo });
  assert.match(offenders.join('\n'), /requirements\/README\.md: Epic 清单与 epics\/ 目录不一致/);
  await run({ root: repo, update: true });
  const fixed = await readFile(readmePath, 'utf8');
  assert.match(fixed, /- \[epic-002 Y\]\(epics\/epic-002-y\.md\)/);
  assert.doesNotMatch(fixed, /epic-009-gone/);
  assert.match(
    checkGeneratedViews({ overview: '', readme: '# 需求管理\n' }, [], epics).join('\n'),
    /找不到「Epic：」清单/
  );
});

// ── 表格完整性 ──────────────────────────────────────────────────────────────────────

test('掉在表格外的表格行被抓出：空行之后没有表头与分隔行，渲染出来是一串竖线', () => {
  const good = '| a | b |\n| --- | --- |\n| 1 | 2 |\n';
  assert.deepEqual(checkTables(good, 'x.md'), []);
  assert.match(checkTables(`${good}\n| 3 | 4 |\n`, 'x.md').join('\n'), /x\.md:5: 表格行不在表格里/);
  // 代码块里的竖线行是字面文本；带对齐标记的分隔行照常算表格。
  assert.deepEqual(checkTables('```text\n| 3 | 4 |\n```\n', 'x.md'), []);
  assert.deepEqual(checkTables('| a | b |\n| :-- | --: |\n| 1 | 2 |\n', 'x.md'), []);
});

test('run() 对全部需求根下的文档逐个查表格完整性：根目录的各类文档与应用需求目录都在内', async t => {
  const repo = await freshRepo(t);
  const orphanRow = '\n| [US-003](stories/core/US-003-x.md) | 📝 Backlog |\n';
  const append = async rel =>
    writeFile(path.join(repo, rel), `${await readFile(path.join(repo, rel), 'utf8')}${orphanRow}`);
  await append('requirements/roadmap.md');
  await append('requirements/status-overview.md');
  await mkdir(path.join(repo, 'apps/demo/requirements/stories'), { recursive: true });
  await writeFile(
    path.join(repo, 'apps/demo/requirements/roadmap.md'),
    `# 排期\n${orphanRow.replace(/\[US-003\]\([^)]*\)/, 'DEMO-US-001')}`
  );
  const { offenders } = await run({ root: repo });
  const report = offenders.join('\n');
  assert.match(report, /requirements\/roadmap\.md:\d+: 表格行不在表格里/);
  assert.match(report, /requirements\/status-overview\.md:\d+: 表格行不在表格里/);
  assert.match(report, /apps\/demo\/requirements\/roadmap\.md:\d+: 表格行不在表格里/);
});

// ── 验收证据区：日期与裸计数只减不增 ────────────────────────────────────────────────

test('evidenceHits 只数验收证据区里的日期与裸计数：表格行里的日期、行内代码与区外正文不算', () => {
  const text = [
    '# x',
    '',
    '立项于 2026-01-02，区外正文不算。',
    '',
    '## 验收标准',
    '',
    '| # | 前置 | 操作 | 预期 | 状态 |',
    '| --- | --- | --- | --- | --- |',
    '| 1 | 生效日 2026-11-01 的 ECN | 展开 | 16/16 通过 | ✅ |',
    '',
    '验收证据（2026-11-17）：`2026-11-18` 的样例日期写在行内代码里；62 例通过，另见 139/139。',
    '',
    '### 验收入口',
    '',
    '- 复跑于 2026-11-19，7 passed。',
    '',
    '## 技术笔记',
    '',
    '2026-11-20 的笔记与 5 例通过都不在证据区。',
    ''
  ].join('\n');
  assert.deepEqual(evidenceHits(text), { date: 2, count: 4 });
  assert.deepEqual(evidenceHits('## 验收标准\n\n- AC#1：`board.spec.ts`，复验命令 `pnpm nx test x`\n'), {
    date: 0,
    count: 0
  });
});

test('evidenceHits 认得常见的英文计数写法；不带数字的「tests passed」不算', () => {
  const count = line => evidenceHits(`## 验收标准\n\n${line}\n`).count;
  for (const line of ['7 passed', '7 tests passed', '7 tests passing', '7 cases passed', '12 specs passing'])
    assert.equal(count(line), 1, line);
  assert.equal(count('all tests passed'), 0);
  assert.equal(count('passed in 3 runs of `x.spec.ts`'), 0);
});

test('collectRequirementRoots 找出根与各应用 / 产品的需求目录，scanEvidence 按故事编号汇总各根的命中', async t => {
  const repo = await freshRepo(t);
  const app = path.join(repo, 'apps/demo/requirements/stories/platform');
  const product = path.join(repo, 'product-x/requirements/stories/platform');
  await mkdir(app, { recursive: true });
  await mkdir(product, { recursive: true });
  await mkdir(path.join(repo, 'node_modules/pkg/requirements/stories'), { recursive: true });
  await writeFile(
    path.join(app, 'DEMO-US-001-x.md'),
    `${story('DEMO-US-001', 'Done')}\n## 验收标准\n\n验收证据（2026-11-17）：3 例通过。\n`
  );
  await writeFile(
    path.join(product, 'PX-US-001-x.md'),
    `${story('PX-US-001', 'Backlog')}\n## 验收标准\n\n验收证据：2026-11-18 复跑。\n`
  );
  await writeFile(path.join(product, 'PX-US-002-x.md'), story('PX-US-002', 'Backlog'));
  await writeFile(
    path.join(product, 'PX-US-001-evidence.md'),
    '# 运行记录\n\n## 验收记录\n\n2026-11-19：62 例通过。\n'
  );
  assert.deepEqual(await collectRequirementRoots(repo), [
    'apps/demo/requirements',
    'product-x/requirements',
    'requirements'
  ]);
  const { hits, offenders } = await scanEvidence(repo);
  assert.deepEqual(offenders, []);
  assert.deepEqual(hits.get('DEMO-US-001'), {
    date: 1,
    count: 1,
    rel: 'apps/demo/requirements/stories/platform/DEMO-US-001-x.md'
  });
  assert.deepEqual(hits.get('PX-US-001'), {
    date: 1,
    count: 0,
    rel: 'product-x/requirements/stories/platform/PX-US-001-x.md'
  });
  // 没有命中的故事不进结果；证据辅助文件没有 frontmatter，不受约束。
  assert.equal(hits.has('PX-US-002'), false);
  assert.equal(hits.size, 2);
});

test('scanEvidence 认不出归属的故事不放过：有 frontmatter 没有 id、跨需求根编号重复都报出；缺 status 照样按编号扫', async t => {
  const repo = await freshRepo(t);
  const app = path.join(repo, 'apps/demo/requirements/stories/platform');
  await mkdir(app, { recursive: true });
  const evidence = '\n## 验收标准\n\n验收证据：2026-11-18 复跑。\n';
  await writeFile(
    path.join(app, 'DEMO-US-001-x.md'),
    story('DEMO-US-001', 'Done').replace('id: DEMO-US-001\n', '') + evidence
  );
  await writeFile(path.join(app, 'DEMO-US-002-x.md'), story('US-001', 'Done') + evidence);
  await writeFile(
    path.join(app, 'DEMO-US-003-x.md'),
    story('DEMO-US-003', 'Done').replace('status: Done\n', '') + evidence
  );
  const { hits, offenders } = await scanEvidence(repo);
  assert.equal(offenders.length, 2);
  assert.match(offenders.join('\n'), /DEMO-US-001-x\.md: 有 frontmatter 却没有 id/);
  assert.match(offenders.join('\n'), /故事编号 US-001 重复/);
  assert.equal(hits.get('DEMO-US-003').date, 1);
});

test('证据区基线只减不增：新增被拒，不在基线里的新故事必须为零，清掉之后要求收紧基线', () => {
  const scan = hits =>
    new Map(Object.entries(hits).map(([id, [date, count]]) => [id, { date, count, rel: `${id}.md` }]));
  const baseline = { 'US-001': { count: 2, date: 3 } };
  assert.deepEqual(checkEvidenceBaseline(scan({ 'US-001': [3, 2] }), baseline), []);
  assert.match(
    checkEvidenceBaseline(scan({ 'US-001': [4, 2] }), baseline).join('\n'),
    /US-001\.md: 验收证据区的日期从 3 处增到 4 处/
  );
  assert.match(
    checkEvidenceBaseline(scan({ 'US-001': [3, 5] }), baseline).join('\n'),
    /US-001\.md: 验收证据区的裸测试计数从 2 处增到 5 处/
  );
  assert.match(
    checkEvidenceBaseline(scan({ 'US-001': [3, 2], 'US-002': [1, 0] }), baseline).join('\n'),
    /US-002\.md: 验收证据区的日期从 0 处增到 1 处/
  );
  assert.match(
    checkEvidenceBaseline(scan({ 'US-001': [1, 2] }), baseline).join('\n'),
    /US-001 的基线高于现状.*audit:requirements:update/
  );
  assert.match(checkEvidenceBaseline(scan({}), baseline).join('\n'), /US-001 的基线高于现状/);

  // 回写只收紧、清零即删条目，从不替新故事登记，也从不上调。
  assert.deepEqual(ratchetEvidenceBaseline(scan({ 'US-001': [1, 9], 'US-002': [4, 4] }), baseline), {
    'US-001': { count: 2, date: 1 }
  });
  assert.deepEqual(ratchetEvidenceBaseline(scan({}), baseline), {});
});

test('run() 按基线文件把证据区的新增挡在门外，--update 只收紧基线', async t => {
  const repo = await freshRepo(t);
  const baselinePath = path.join(repo, 'scripts/audit/requirements-evidence-baseline.json');
  await mkdir(path.dirname(baselinePath), { recursive: true });
  const storyPath = path.join(repo, 'requirements/stories/core/US-001-x.md');
  const withEvidence = n => `${story('US-001', 'Done')}\n## 验收标准\n\n验收证据：${'2026-11-17 复跑。'.repeat(n)}\n`;
  await writeFile(storyPath, withEvidence(2));

  // 没有基线文件 = 没有登记过存量：任何命中都是新增。
  await rm(baselinePath, { force: true });
  assert.match((await run({ root: repo })).offenders.join('\n'), /US-001-x\.md: 验收证据区的日期从 0 处增到 2 处/);

  await writeFile(baselinePath, JSON.stringify({ 'US-001': { count: 0, date: 2 } }));
  assert.deepEqual((await run({ root: repo })).offenders, []);

  await writeFile(storyPath, withEvidence(1));
  assert.match((await run({ root: repo })).offenders.join('\n'), /US-001 的基线高于现状/);
  assert.deepEqual((await run({ root: repo, update: true })).offenders, []);
  assert.deepEqual(JSON.parse(await readFile(baselinePath, 'utf8')), { 'US-001': { count: 0, date: 1 } });

  await writeFile(storyPath, withEvidence(3));
  assert.match((await run({ root: repo, update: true })).offenders.join('\n'), /日期从 1 处增到 3 处/);
  assert.deepEqual(JSON.parse(await readFile(baselinePath, 'utf8')), { 'US-001': { count: 0, date: 1 } });

  // 显式重建基线是唯一能上调的入口，引入门禁或批量导入存量时才用。
  assert.deepEqual((await run({ root: repo, rebaselineEvidence: true })).offenders, []);
  assert.deepEqual(JSON.parse(await readFile(baselinePath, 'utf8')), { 'US-001': { count: 0, date: 3 } });
});

test('故事归属认不出来时 --update 不动基线：编号丢了的故事不会把自己的存量登记抹掉', async t => {
  const repo = await freshRepo(t);
  const baselinePath = path.join(repo, 'scripts/audit/requirements-evidence-baseline.json');
  await mkdir(path.dirname(baselinePath), { recursive: true });
  const storyPath = path.join(repo, 'requirements/stories/core/US-001-x.md');
  const text = `${story('US-001', 'Done')}\n## 验收标准\n\n验收证据：2026-11-17 复跑。\n`;
  await writeFile(storyPath, text);
  const baseline = JSON.stringify({ 'US-001': { count: 0, date: 1 } });
  await writeFile(baselinePath, baseline);
  assert.deepEqual((await run({ root: repo })).offenders, []);

  // 编辑到一半把 id 弄丢了：这时回写不能把 US-001 当成「已经清零」。
  await writeFile(storyPath, text.replace('id: US-001\n', ''));
  const broken = await run({ root: repo, update: true });
  assert.match(broken.offenders.join('\n'), /US-001-x\.md: 有 frontmatter 却没有 id/);
  assert.equal(await readFile(baselinePath, 'utf8'), baseline);
  assert.match((await run({ root: repo, rebaselineEvidence: true })).offenders.join('\n'), /没有 id/);
  assert.equal(await readFile(baselinePath, 'utf8'), baseline);

  // 改回来之后照旧通过，不需要重新登记。
  await writeFile(storyPath, text);
  assert.deepEqual((await run({ root: repo })).offenders, []);
});
