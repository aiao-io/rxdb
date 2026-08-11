import { describe, expect, it } from 'vitest';

import { computeMinimalDocumentChange } from '../document-sync.js';

describe('computeMinimalDocumentChange', () => {
  it('内容相同时返回 null，调用方据此完全跳过事务', () => {
    expect(computeMinimalDocumentChange('same', 'same')).toBeNull();
    expect(computeMinimalDocumentChange('', '')).toBeNull();
  });

  // 关键性质：替换区间不能覆盖未变化的部分，否则 CodeMirror 会把区间内的光标映射到区间起点
  it('只替换变化区间，保留公共前后缀', () => {
    expect(computeMinimalDocumentChange('hello world', 'hello brave world')).toEqual({
      from: 6,
      to: 6,
      insert: 'brave '
    });
  });

  it.each([
    ['纯追加', 'abc', 'abcdef', { from: 3, to: 3, insert: 'def' }],
    ['纯前置', 'abc', 'xyabc', { from: 0, to: 0, insert: 'xy' }],
    ['纯删除（尾部）', 'abcdef', 'abc', { from: 3, to: 6, insert: '' }],
    ['纯删除（头部）', 'xyabc', 'abc', { from: 0, to: 2, insert: '' }],
    ['中间替换', 'a-OLD-z', 'a-NEW-z', { from: 2, to: 5, insert: 'NEW' }],
    ['清空', 'abc', '', { from: 0, to: 3, insert: '' }],
    ['从空写入', '', 'abc', { from: 0, to: 0, insert: 'abc' }],
    ['完全不同', 'abc', 'xyz', { from: 0, to: 3, insert: 'xyz' }]
  ])('%s', (_name, current, next, expected) => {
    expect(computeMinimalDocumentChange(current, next)).toEqual(expected);
  });

  // 前后缀重叠是最容易写错的边界：'aaa' -> 'aa' 时前缀吃掉 2 个后，
  // 剩余可比后缀只有 0 个，不能让 from 越过 to。
  it.each([
    ['重复字符缩短', 'aaa', 'aa'],
    ['重复字符加长', 'aa', 'aaa'],
    ['同字符全串', 'aaaa', 'aaaaaa'],
    ['单字符', 'a', 'b']
  ])('前后缀重叠时区间仍然合法：%s', (_name, current, next) => {
    const change = computeMinimalDocumentChange(current, next);

    expect(change).not.toBeNull();
    if (!change) return;
    expect(change.from).toBeLessThanOrEqual(change.to);
    expect(change.to).toBeLessThanOrEqual(current.length);
    // 套用该 change 必须真的得到 next
    expect(current.slice(0, change.from) + change.insert + current.slice(change.to)).toBe(next);
  });

  it('多行文本按字符定位，行尾符不影响正确性', () => {
    const current = 'line1\nline2\nline3';
    const next = 'line1\nCHANGED\nline3';
    const change = computeMinimalDocumentChange(current, next);

    expect(change).not.toBeNull();
    if (!change) return;
    expect(current.slice(0, change.from) + change.insert + current.slice(change.to)).toBe(next);
    // 第一行完全未被触碰
    expect(change.from).toBeGreaterThanOrEqual('line1\n'.length);
  });
});
