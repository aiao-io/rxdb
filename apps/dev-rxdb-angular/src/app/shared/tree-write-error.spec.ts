import { describe, expect, it } from 'vitest';
import { formatTreeWriteError, type TreeWriteOperation } from './tree-write-error';

describe('formatTreeWriteError', () => {
  it('Error 取其 message，文案为「<操作>失败：<错误消息>」', () => {
    expect(formatTreeWriteError('新建', new Error('唯一索引冲突'))).toBe('新建失败：唯一索引冲突');
  });

  it('非 Error 用 String(error)', () => {
    expect(formatTreeWriteError('重命名', 'boom')).toBe('重命名失败：boom');
    expect(formatTreeWriteError('删除', 42)).toBe('删除失败：42');
    expect(formatTreeWriteError('级联删除', null)).toBe('级联删除失败：null');
  });

  it('七个操作名都原样进入文案', () => {
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
