/**
 * `board-parity.mjs` 的单测：归一化的每条失败分支，以及 golden 自身的一致性与不可漂移。
 *
 * 三端浏览器对拍只能证明「三端与 golden 一致」，证明不了归一化本身没有放水 ——
 * 某个分支该抛不抛时，三端会一起错成同一个样子，照样对上 golden。
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadParityGolden, normalizeParitySnapshot } from './board-parity.mjs';

/** 三端 spec 采集出来的那种原始快照；每次调用都是新对象，用例可以就地改坏其中一处。 */
function validRaw() {
  return {
    seed: {
      boardTitle: 'rxdb 1.0 发布计划',
      columns: [
        {
          title: 'To do',
          tasks: [
            { title: '修复登录 bug', labels: ['核心'], dueDate: '2026-11-05' },
            { title: '写发布说明', labels: ['文档'], dueDate: null }
          ]
        },
        { title: 'Ideas', tasks: [] }
      ],
      labels: [
        { name: '核心', color: 'rgb(225, 29, 72)' },
        { name: '文档', color: 'rgb(37, 99, 235)' }
      ]
    },
    afterDrag: {
      columns: [
        { title: 'To do', taskTitles: ['写发布说明'] },
        { title: 'Ideas', taskTitles: [] }
      ]
    },
    afterEdit: {
      taskTitle: '修复登录 bug（回归）',
      description: '回归修复验证',
      dueDate: '2026-11-20',
      labels: ['文档', '核心']
    }
  };
}

/** 某个工作区根下的 e2e spec 路径：golden 按「spec 所在目录 / ../../../modules/e2e-parity」定位。 */
const specPathUnder = root => join(root, 'apps', 'dev-rxdb-angular-e2e', 'src', 'board-parity.spec.ts');

test('完整原始快照归一化成语义快照：标签排序、空截止日归一为 null、列序与任务序保留', () => {
  assert.deepEqual(normalizeParitySnapshot(validRaw()), {
    format: 'aiao-rxdb-e2e-board-parity',
    version: 1,
    snapshot: {
      seed: {
        boardTitle: 'rxdb 1.0 发布计划',
        columns: [
          {
            title: 'To do',
            tasks: [
              { title: '修复登录 bug', labels: ['核心'], dueDate: '2026-11-05' },
              { title: '写发布说明', labels: ['文档'], dueDate: null }
            ]
          },
          { title: 'Ideas', tasks: [] }
        ],
        labels: [
          { name: '核心', color: 'rgb(225, 29, 72)' },
          { name: '文档', color: 'rgb(37, 99, 235)' }
        ]
      },
      afterDrag: {
        columns: [
          { title: 'To do', taskTitles: ['写发布说明'] },
          { title: 'Ideas', taskTitles: [] }
        ]
      },
      afterEdit: {
        taskTitle: '修复登录 bug（回归）',
        description: '回归修复验证',
        dueDate: '2026-11-20',
        labels: ['文档', '核心']
      }
    }
  });
});

/** 每条：把合法原始快照改坏一处，归一化必须按对应的报错失败。 */
const BROKEN = [
  ['缺 seed 段', raw => (raw.seed = undefined), /缺 seed \/ afterDrag \/ afterEdit/],
  ['缺 afterDrag 段', raw => (raw.afterDrag = undefined), /缺 seed \/ afterDrag \/ afterEdit/],
  ['缺 afterEdit 段', raw => (raw.afterEdit = undefined), /缺 seed \/ afterDrag \/ afterEdit/],
  ['板标题不是字符串', raw => (raw.seed.boardTitle = 42), /boardTitle \/ columns \/ labels/],
  ['列没有任务列表', raw => (raw.seed.columns[0].tasks = undefined), /缺标题或任务列表/],
  ['任务标题不是字符串', raw => (raw.seed.columns[0].tasks[0].title = 42), /缺标题/],
  ['任务缺标签列表', raw => (raw.seed.columns[0].tasks[0].labels = undefined), /任务语义输出缺标签列表/],
  ['标签名不是字符串', raw => (raw.seed.columns[0].tasks[0].labels = [42]), /标签名不是字符串/],
  ['任务缺截止日字段', raw => (raw.seed.columns[0].tasks[0].dueDate = undefined), /截止日不是字符串或 null/],
  ['截止日不是字符串或 null', raw => (raw.seed.columns[0].tasks[0].dueDate = 42), /截止日不是字符串或 null/],
  ['标签定义缺颜色', raw => (raw.seed.labels[0].color = undefined), /缺 name \/ color/],
  ['拖拽后列缺标题列表', raw => (raw.afterDrag.columns[0].taskTitles = undefined), /缺标题或任务标题列表/],
  ['拖拽后任务标题不是字符串', raw => (raw.afterDrag.columns[0].taskTitles = [1]), /任务标题不是字符串/],
  ['编辑后缺描述', raw => (raw.afterEdit.description = undefined), /afterEdit 字段形状不对/],
  ['编辑后标签名不是字符串', raw => (raw.afterEdit.labels = [0]), /afterEdit 标签名不是字符串/]
];

for (const [name, breakIt, error] of BROKEN) {
  test(`失败分支：${name}`, () => {
    const raw = validRaw();
    breakIt(raw);
    assert.throws(() => normalizeParitySnapshot(raw), error);
  });
}

test('checked-in golden：格式与版本对得上，种子语义与 US-540 种子一致', () => {
  const golden = loadParityGolden(specPathUnder(join(import.meta.dirname, '../..')));
  assert.equal(golden.format, 'aiao-rxdb-e2e-board-parity');
  assert.equal(golden.version, 1);
  const titles = golden.snapshot.seed.columns.map(column => column.title);
  assert.deepEqual(titles, ['To do', 'Doing', 'Done', 'Ideas']);
  assert.equal(golden.snapshot.seed.columns.flatMap(column => column.tasks).length, 12);
  assert.deepEqual(
    golden.snapshot.afterDrag.columns.find(column => column.title === 'Doing').taskTitles[0],
    '修复登录 bug'
  );
});

test('golden 格式或版本不对时失败', () => {
  const root = mkdtempSync(join(tmpdir(), 'e2e-parity-golden-'));
  try {
    mkdirSync(join(root, 'modules', 'e2e-parity'), { recursive: true });
    writeFileSync(
      join(root, 'modules', 'e2e-parity', 'board-parity.golden.json'),
      JSON.stringify({ format: 'aiao-rxdb-e2e-board-parity', version: 2 })
    );
    assert.throws(() => loadParityGolden(specPathUnder(root)), /golden 快照格式不匹配/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
