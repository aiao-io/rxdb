import type { WorkingTreeDiffEntry } from '@aiao/rxdb-plugin-working-tree';
import { describe, expect, it } from 'vitest';
import {
  buildDiffRows,
  buildFieldDiff,
  buildHunks,
  diffEntryKey,
  filterWhitespaceOnlyChanges,
  formatFieldValue,
  formatPatchSummary
} from './diff-format';

/**
 * @fileoverview `diff-format` 的纯函数单测（Angular 参考实现的原样移植）。
 *
 * @remarks
 * 页面重做为 GitHub Desktop 形态之后，列表行的摘要与详情区的字段级 - / + 行
 * 共用这一份取值规则：两份排版分写两个文件，迟早「列表说 A、详情说 B」。
 * 这里把所有分支（insert / update / delete）与缺失字段的组合锁住。
 */

/** 造一条最小 diff 条目，只填本模块要读的字段。 */
const makeEntry = (
  operation: WorkingTreeDiffEntry['operation'],
  patch: Record<string, unknown> | null,
  inversePatch: Record<string, unknown> | null
): WorkingTreeDiffEntry => ({
  unitId: 'u1',
  transactionId: null,
  namespace: 'demo',
  entity: 'Todo',
  entityId: '1',
  operation,
  patch,
  inversePatch,
  origin: 'local'
});

describe('buildFieldDiff', () => {
  it('insert：补丁里每个字段都是一行「新增」', () => {
    const lines = buildFieldDiff(makeEntry('insert', { title: '买牛奶', done: false }, null));
    expect(lines).toEqual([
      { key: 'title', before: undefined, after: '买牛奶' },
      { key: 'done', before: undefined, after: false }
    ]);
  });

  it('delete：逆向补丁里每个字段都是一行「删除」', () => {
    const lines = buildFieldDiff(makeEntry('delete', null, { title: '买牛奶' }));
    expect(lines).toEqual([{ key: 'title', before: '买牛奶', after: undefined }]);
  });

  it('update：两侧键的并集，新增/删除/修改三种字段都在', () => {
    const lines = buildFieldDiff(
      makeEntry('update', { title: '买牛奶', done: true }, { title: '买咖啡', note: '老备注' })
    );
    expect(lines).toEqual([
      { key: 'title', before: '买咖啡', after: '买牛奶' },
      // 只在逆向补丁里 = 被删掉的字段；只在补丁里 = 新增的字段
      { key: 'note', before: '老备注', after: undefined },
      { key: 'done', before: undefined, after: true }
    ]);
  });

  it('update 两侧补丁都为空：没有字段级差异', () => {
    expect(buildFieldDiff(makeEntry('update', null, null))).toEqual([]);
    expect(buildFieldDiff(makeEntry('update', {}, {}))).toEqual([]);
  });
});

describe('buildDiffRows', () => {
  it('把字段差异摊平成 - / + 行，先旧后新', () => {
    const rows = buildDiffRows(makeEntry('update', { title: '新标题' }, { title: '旧标题' }));
    expect(rows).toEqual([
      { key: 'title', sign: '-', value: '旧标题' },
      { key: 'title', sign: '+', value: '新标题' }
    ]);
  });

  it('insert 只有 + 行，delete 只有 - 行', () => {
    expect(buildDiffRows(makeEntry('insert', { a: 1 }, null))).toEqual([{ key: 'a', sign: '+', value: 1 }]);
    expect(buildDiffRows(makeEntry('delete', null, { a: 1 }))).toEqual([{ key: 'a', sign: '-', value: 1 }]);
  });
});

describe('formatFieldValue', () => {
  it('字符串带引号、数字与对象走 JSON', () => {
    expect(formatFieldValue('hi')).toBe('"hi"');
    expect(formatFieldValue(42)).toBe('42');
    expect(formatFieldValue({ a: 1 })).toBe('{"a":1}');
  });
});

describe('formatPatchSummary', () => {
  it('insert 摘要 = 补丁的 JSON，delete 摘要 = 逆向补丁的 JSON', () => {
    const insert = formatPatchSummary(makeEntry('insert', { title: '买牛奶' }, null));
    expect(insert).toBe('{"title":"买牛奶"}');
    const del = formatPatchSummary(makeEntry('delete', null, { title: '买牛奶' }));
    expect(del).toBe('{"title":"买牛奶"}');
  });

  it('update 摘要按「旧 → 新」逐字段拼接，缺失侧写 —', () => {
    const text = formatPatchSummary(makeEntry('update', { title: '买牛奶', done: true }, { title: '买咖啡' }));
    expect(text).toBe('title: "买咖啡" → "买牛奶", done: — → true');
  });

  it('超过 200 字符截断并以 … 收尾', () => {
    const long = 'x'.repeat(300);
    const text = formatPatchSummary(makeEntry('insert', { note: long }, null));
    expect(text.endsWith('…')).toBe(true);
    expect(text.length).toBeLessThanOrEqual(201);
  });
});

describe('buildHunks', () => {
  it('连续字段合成一个 hunk，旧侧与新侧行号各自推进', () => {
    const hunks = buildHunks(makeEntry('update', { title: '买牛奶', done: true }, { title: '买咖啡' }));
    expect(hunks).toEqual([
      {
        key: 'Todo',
        oldStart: 1,
        oldCount: 1,
        newStart: 1,
        newCount: 2,
        rows: [
          { key: 'title', sign: '-', value: '买咖啡', oldNumber: 1, newNumber: null },
          { key: 'title', sign: '+', value: '买牛奶', oldNumber: null, newNumber: 1 },
          { key: 'done', sign: '+', value: true, oldNumber: null, newNumber: 2 }
        ]
      }
    ]);
  });

  it('delete-only 字段：新侧行数 0，旧侧行号照常推进', () => {
    const hunks = buildHunks(makeEntry('delete', null, { title: '买牛奶' }));
    expect(hunks).toEqual([
      {
        key: 'Todo',
        oldStart: 1,
        oldCount: 1,
        newStart: 0,
        newCount: 0,
        rows: [{ key: 'title', sign: '-', value: '买牛奶', oldNumber: 1, newNumber: null }]
      }
    ]);
  });

  it('insert-only 字段从旧侧第 0 行起算，所有新增行在同一个 hunk', () => {
    expect(buildHunks(makeEntry('insert', { title: '买牛奶', done: false }, null))).toEqual([
      {
        key: 'Todo',
        oldStart: 0,
        oldCount: 0,
        newStart: 1,
        newCount: 2,
        rows: [
          { key: 'title', sign: '+', value: '买牛奶', oldNumber: null, newNumber: 1 },
          { key: 'done', sign: '+', value: false, oldNumber: null, newNumber: 2 }
        ]
      }
    ]);
  });

  it('没有字段级差异：空数组', () => {
    expect(buildHunks(makeEntry('update', {}, {}))).toEqual([]);
  });
});

describe('diffEntryKey', () => {
  it('键 = unitId:entityId，同一事务里的多实体也能区分', () => {
    const base = makeEntry('insert', { a: 1 }, null);
    expect(diffEntryKey(base)).toBe('u1:1');
    expect(diffEntryKey({ ...base, entityId: '2' })).toBe('u1:2');
  });
});

describe('filterWhitespaceOnlyChanges', () => {
  it('只有空白差异的字段：- / + 两行一起藏掉', () => {
    const hunks = buildHunks(makeEntry('update', { note: 'a b' }, { note: 'a  b' }));
    expect(hunks[0].rows).toHaveLength(2);
    const filtered = filterWhitespaceOnlyChanges(hunks);
    expect(filtered[0].rows).toEqual([]);
    expect(filtered[0].oldCount).toBe(0);
    expect(filtered[0].newCount).toBe(0);
  });

  it('真实差异与新增 / 删除字段原样保留', () => {
    const hunks = buildHunks(
      makeEntry('update', { title: '买牛奶', note: 'a b', done: true }, { title: '买咖啡', note: 'a  b' })
    );
    const filtered = filterWhitespaceOnlyChanges(hunks);
    expect(filtered[0].rows.map(row => row.key)).toEqual(['title', 'title', 'done']);
  });

  it('过滤后行号连续：旧 / 新行号按剩余行重新推进', () => {
    const hunks = buildHunks(
      makeEntry('update', { title: '新标题', note: 'a b', done: true }, { title: '旧标题', note: 'a  b' })
    );
    const filtered = filterWhitespaceOnlyChanges(hunks);
    expect(filtered[0].rows).toEqual([
      { key: 'title', sign: '-', value: '旧标题', oldNumber: 1, newNumber: null },
      { key: 'title', sign: '+', value: '新标题', oldNumber: null, newNumber: 1 },
      { key: 'done', sign: '+', value: true, oldNumber: null, newNumber: 2 }
    ]);
    expect(filtered[0].oldStart).toBe(1);
    expect(filtered[0].oldCount).toBe(1);
    expect(filtered[0].newStart).toBe(1);
    expect(filtered[0].newCount).toBe(2);
  });

  it('insert 只有 + 行，没有可比较的对——原样不动', () => {
    const hunks = buildHunks(makeEntry('insert', { title: ' a ' }, null));
    expect(filterWhitespaceOnlyChanges(hunks)).toEqual(hunks);
  });
});
