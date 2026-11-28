import { describe, expect, it } from 'vitest';
import { fieldDiffOf, formatFieldValue } from './field-diff';

describe('fieldDiffOf', () => {
  it('新建只有改之后：字段取自 patch', () => {
    expect(fieldDiffOf({ type: 'INSERT', patch: { title: '买牛奶', completed: false }, inversePatch: null })).toEqual([
      { key: 'title', before: undefined, after: '买牛奶' },
      { key: 'completed', before: undefined, after: false }
    ]);
  });

  it('删除只有改之前：字段取自 inversePatch', () => {
    expect(fieldDiffOf({ type: 'DELETE', patch: null, inversePatch: { title: '买牛奶' } })).toEqual([
      { key: 'title', before: '买牛奶', after: undefined }
    ]);
  });

  it('修改取两侧字段的并集：只在一侧的字段，另一侧是 undefined', () => {
    expect(
      fieldDiffOf({ type: 'UPDATE', patch: { price: 199, note: '新' }, inversePatch: { price: 299, tag: '旧' } })
    ).toEqual([
      { key: 'price', before: 299, after: 199 },
      { key: 'tag', before: '旧', after: undefined },
      { key: 'note', before: undefined, after: '新' }
    ]);
  });

  it('不列主键与记账字段：它们每次都变，盖住了真正的修改', () => {
    const lines = fieldDiffOf({
      type: 'UPDATE',
      patch: { id: 'a', title: '新', updatedAt: '2026-11-26T00:00:00Z', updatedBy: 'alice' },
      inversePatch: { title: '旧', updatedAt: '2026-11-25T00:00:00Z', updatedBy: 'bob', createdAt: 'x', createdBy: 'y' }
    });

    expect(lines.map(line => line.key)).toEqual(['title']);
  });
});

describe('formatFieldValue', () => {
  it('缺失的一侧显示破折号，其余按 JSON 显示', () => {
    expect(formatFieldValue(undefined)).toBe('—');
    expect(formatFieldValue(null)).toBe('null');
    expect(formatFieldValue('买牛奶')).toBe('"买牛奶"');
    expect(formatFieldValue(42)).toBe('42');
  });
});
