import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

import {
  checkAnchorEvidence,
  checkEpics,
  checkLinks,
  checkReadme,
  checkStatusOverview,
  collectEpics,
  collectStories,
  countStatuses,
  evidenceSymbols,
  headingSlug,
  maskCode,
  parseFrontmatter,
  run,
  scanNarrative,
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
