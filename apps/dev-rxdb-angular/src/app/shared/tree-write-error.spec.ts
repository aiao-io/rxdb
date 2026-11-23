import { I18n } from '@aiao/rxdb-i18n';
import { treeMenuCatalogs } from '@modules/demo-i18n/tree-menu';
import { describe, expect, it } from 'vitest';
import { formatTreeWriteError, type TreeWriteOperation } from './tree-write-error';

const i18n = new I18n({ defaultLocale: 'zh-Hans', deviceLocale: 'zh-Hans', catalogs: treeMenuCatalogs });

describe('formatTreeWriteError', () => {
  it('Error 取其 message，文案为「<操作>失败：<错误消息>」', () => {
    expect(formatTreeWriteError('新建', new Error('唯一索引冲突'), i18n.t)).toBe('新建失败：唯一索引冲突');
  });

  it('非 Error 用 String(error)', () => {
    expect(formatTreeWriteError('重命名', 'boom', i18n.t)).toBe('重命名失败：boom');
    expect(formatTreeWriteError('删除', 42, i18n.t)).toBe('删除失败：42');
    expect(formatTreeWriteError('级联删除', null, i18n.t)).toBe('级联删除失败：null');
  });

  it('八个操作名都原样进入文案', () => {
    const operations: TreeWriteOperation[] = [
      '新建',
      '重命名',
      '批量添加',
      '删除',
      '级联删除',
      '删除并提升子节点',
      '拖放',
      '删除全部'
    ];
    for (const operation of operations) {
      expect(formatTreeWriteError(operation, new Error('x'), i18n.t)).toBe(`${operation}失败：x`);
    }
  });

  it('英文语言下操作名与提示都随目录翻译', () => {
    const en = new I18n({ defaultLocale: 'zh-Hans', deviceLocale: 'en', catalogs: treeMenuCatalogs });
    expect(formatTreeWriteError('批量添加', new Error('boom'), en.t)).toBe('Batch add failed: boom');
  });
});
