import { describe, expect, it } from 'vitest';

import { cn } from '../cn.js';

describe('cn', () => {
  it('用空格拼接多个字符串类名', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c');
  });

  it('过滤 falsy 值（false/null/undefined/0/空串）', () => {
    expect(cn('a', false, null, undefined, 0, '', 'b')).toBe('a b');
  });

  it('支持对象形式的条件类名', () => {
    expect(cn('a', { b: true, c: false })).toBe('a b');
  });

  it('支持数组形式的类名', () => {
    expect(cn(['a', 'b'], 'c')).toBe('a b c');
  });

  it('支持基础类 + 三元条件（模板字符串的等价替代）', () => {
    const tabType = 'form';
    expect(cn('tab-content flex-col', tabType === 'form' ? 'overflow-auto p-4' : 'overflow-hidden')).toBe(
      'tab-content flex-col overflow-auto p-4'
    );
  });

  it('条件为 false 时只保留基础类', () => {
    const active = false;
    expect(cn('btn', active && 'btn-active')).toBe('btn');
  });

  it('类名中间存在空格时仍能正确拼接', () => {
    expect(cn('a b', 'c')).toBe('a b c');
  });
});
