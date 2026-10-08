import { describe, expect, it } from 'vitest';
import { formatTreeWriteError, type TreeWriteOperation } from './tree-write-error';

describe('formatTreeWriteError', () => {
  it('Error 取 message，拼成「<操作>失败：<消息>」', () => {
    expect(formatTreeWriteError('新建', new Error('UNIQUE constraint failed'))).toBe(
      '新建失败：UNIQUE constraint failed'
    );
  });

  it('非 Error 的抛出值用 String() 转文本', () => {
    expect(formatTreeWriteError('删除', 'boom')).toBe('删除失败：boom');
    expect(formatTreeWriteError('批量添加', 42)).toBe('批量添加失败：42');
    expect(formatTreeWriteError('级联删除', null)).toBe('级联删除失败：null');
  });

  it('七个固定操作名都按同一格式输出', () => {
    const operations: TreeWriteOperation[] = [
      '新建',
      '重命名',
      '批量添加',
      '删除',
      '级联删除',
      '删除并提升子节点',
      '拖放'
    ];

    for (const operation of operations) {
      expect(formatTreeWriteError(operation, new Error('x'))).toBe(`${operation}失败：x`);
    }
  });
});
