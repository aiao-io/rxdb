import { describe, expect, it } from 'vitest';
import { formatTreeWriteError } from './tree-write-error';

describe('formatTreeWriteError', () => {
  it('Error 取其 message，拼成「<操作>失败：<消息>」', () => {
    expect(formatTreeWriteError('新建', new Error('唯一索引冲突'))).toBe('新建失败：唯一索引冲突');
  });

  it('非 Error 的抛出值用 String() 转成消息', () => {
    expect(formatTreeWriteError('批量添加', 'boom')).toBe('批量添加失败：boom');
    expect(formatTreeWriteError('删除', 42)).toBe('删除失败：42');
  });

  it.each(['新建', '重命名', '批量添加', '删除', '级联删除', '删除并提升子节点'] as const)(
    '操作名「%s」原样出现在文案开头',
    operation => {
      expect(formatTreeWriteError(operation, new Error('x'))).toBe(`${operation}失败：x`);
    }
  );
});
