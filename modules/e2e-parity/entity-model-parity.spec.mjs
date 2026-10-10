/**
 * `entity-model-parity.mjs` 的单测：归一化的每条失败分支，以及易失字段「先校验形态、再换占位符」。
 *
 * 三端浏览器对拍只能证明「三端与 golden 一致」，证明不了归一化本身没有放水 ——
 * 某个分支该抛不抛时，三端会一起错成同一个样子，照样对上 golden。
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadParityGolden, normalizeParitySnapshot } from './entity-model-parity.mjs';

const ID = '0f8b2c4e-1d2a-4b3c-8d9e-0a1b2c3d4e5f';
const NOW = new Date('2026-10-10T08:00:00.000Z');
const COLUMNS = ['_vtable_rowSeries_number', 'id', 'title', 'completed', 'createdAt', 'updatedAt', 'actions'];

/** 三端 spec 采集出来的那种原始快照；每次调用都是新对象，用例可以就地改坏其中一处。 */
function validRaw() {
  const row = title => ({ id: ID, title, completed: false, createdAt: NOW, updatedAt: NOW });
  return {
    entity: 'public:Todo',
    list: { columns: [...COLUMNS], rows: [row('parity-alpha'), row('parity-bravo')] },
    detail: {
      tabs: [' 基本信息 '],
      form: [
        { label: 'title', kind: 'textbox', value: 'parity-alpha' },
        { label: 'ID', value: ID },
        { label: '创建时间', value: '10/10/2026, 8:00:00 AM' },
        { label: '更新时间', value: '2026/10/10 08:00:00' },
        { label: '创建者', value: 'userId' }
      ]
    },
    createForm: [
      { label: 'title', kind: 'textbox', value: '' },
      { label: 'completed', kind: 'checkbox', value: false }
    ],
    filter: { combinator: 'and', rules: [{ field: 'title', operator: '包含', value: 'parity-bravo' }] },
    filterCountText: '1 条记录',
    filteredList: { columns: [...COLUMNS], rows: [row('parity-bravo')] }
  };
}

const normalizedRow = title => ({ id: '<uuid>', title, completed: false, createdAt: '<date>', updatedAt: '<date>' });
const NORMALIZED_COLUMNS = [null, 'id', 'title', 'completed', 'createdAt', 'updatedAt', 'actions'];

test('完整原始快照归一化成语义快照：易失值换占位符，其余原样保留', () => {
  assert.deepEqual(normalizeParitySnapshot(validRaw()), {
    format: 'aiao-rxdb-e2e-entity-model-parity',
    version: 1,
    entity: 'public:Todo',
    list: { columns: NORMALIZED_COLUMNS, rows: [normalizedRow('parity-alpha'), normalizedRow('parity-bravo')] },
    detail: {
      tabs: ['基本信息'],
      form: [
        { label: 'title', kind: 'textbox', value: 'parity-alpha' },
        { label: 'ID', value: '<uuid>' },
        { label: '创建时间', value: '<date>' },
        { label: '更新时间', value: '<date>' },
        { label: '创建者', value: 'userId' }
      ]
    },
    createForm: [
      { label: 'title', kind: 'textbox', value: '' },
      { label: 'completed', kind: 'checkbox', value: false }
    ],
    filter: { combinator: 'and', rules: [{ field: 'title', operator: '包含', value: 'parity-bravo' }] },
    filteredCount: 1,
    filteredList: { columns: NORMALIZED_COLUMNS, rows: [normalizedRow('parity-bravo')] }
  });
});

test('记录时间也接受可解析的时间字符串', () => {
  const raw = validRaw();
  raw.list.rows[0].createdAt = '2026-10-10T08:00:00.000Z';
  assert.equal(normalizeParitySnapshot(raw).list.rows[0].createdAt, '<date>');
});

/** 每条：把合法原始快照改坏一处，归一化必须按对应的报错失败。 */
const BROKEN = [
  ['缺实体标识', raw => (raw.entity = ''), /缺实体标识/],
  ['列表没有列', raw => (raw.list.columns = []), /缺少列定义/],
  ['列表没有行', raw => (raw.list.rows = []), /没有任何行/],
  ['列字段名不是字符串', raw => (raw.list.columns[2] = 42), /列字段名超出语义契约/],
  ['行值不是标量', raw => (raw.list.rows[0].title = { text: 'x' }), /行值超出语义契约/],
  ['行 id 不是 UUID', raw => (raw.list.rows[0].id = 'not-a-uuid'), /易失字段形态不对：字段 "id"/],
  ['行 id 缺失', raw => delete raw.list.rows[1].id, /易失字段形态不对：字段 "id"/],
  ['行 createdAt 是无效 Date', raw => (raw.list.rows[0].createdAt = new Date('x')), /字段 "createdAt"/],
  ['行 updatedAt 为 null', raw => (raw.filteredList.rows[0].updatedAt = null), /字段 "updatedAt"/],
  ['行时间是空串', raw => (raw.list.rows[0].updatedAt = ''), /字段 "updatedAt"/],
  ['表单没有字段', raw => (raw.createForm = []), /表单没有任何字段/],
  ['表单字段缺显示名', raw => (raw.detail.form[0].label = '  '), /字段缺显示名/],
  ['表单 ID 为空（详情记录还没加载完）', raw => (raw.detail.form[1].value = ''), /易失字段形态不对："ID"/],
  ['表单创建时间是 Invalid Date', raw => (raw.detail.form[2].value = 'Invalid Date'), /"创建时间"/],
  ['表单更新时间为空', raw => (raw.detail.form[3].value = ''), /"更新时间"/],
  ['条件树组合关系越界', raw => (raw.filter.combinator = 'xor'), /组合关系超出语义契约/],
  ['条件树没有规则', raw => (raw.filter.rules = []), /没有任何规则/],
  ['条件规则缺操作符', raw => (raw.filter.rules[0].operator = ''), /缺字段或操作符/],
  ['计数徽标读不出数字', raw => (raw.filterCountText = '暂无记录'), /读出计数/],
  ['详情没有 Tab', raw => (raw.detail.tabs = []), /缺 Tab 列表/]
];

for (const [name, breakIt, error] of BROKEN) {
  test(`失败分支：${name}`, () => {
    const raw = validRaw();
    breakIt(raw);
    assert.throws(() => normalizeParitySnapshot(raw), error);
  });
}

/** 某个工作区根下的 e2e spec 路径：golden 按「spec 所在目录 / ../../../modules/e2e-parity」定位。 */
const specPathUnder = root => join(root, 'apps', 'dev-rxdb-angular-e2e', 'src', 'entity-model-parity.spec.ts');

test('checked-in golden：格式与版本对得上，易失字段全是占位符', () => {
  const golden = loadParityGolden(specPathUnder(join(import.meta.dirname, '../..')));
  assert.equal(golden.format, 'aiao-rxdb-e2e-entity-model-parity');
  assert.equal(golden.version, 1);
  for (const row of [...golden.list.rows, ...golden.filteredList.rows]) {
    assert.deepEqual([row.id, row.createdAt, row.updatedAt], ['<uuid>', '<date>', '<date>']);
  }
  const volatile = golden.detail.form.filter(field => ['ID', '创建时间', '更新时间'].includes(field.label));
  assert.deepEqual(
    volatile.map(field => field.value),
    ['<uuid>', '<date>', '<date>']
  );
});

test('golden 格式或版本不对时失败', () => {
  const root = mkdtempSync(join(tmpdir(), 'e2e-parity-golden-'));
  try {
    mkdirSync(join(root, 'modules', 'e2e-parity'), { recursive: true });
    writeFileSync(
      join(root, 'modules', 'e2e-parity', 'entity-model-parity.golden.json'),
      JSON.stringify({ format: 'aiao-rxdb-e2e-entity-model-parity', version: 2 })
    );
    assert.throws(() => loadParityGolden(specPathUnder(root)), /golden 快照格式不匹配/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
