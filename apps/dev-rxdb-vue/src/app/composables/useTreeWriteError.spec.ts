import { describe, expect, it, vi } from 'vitest';

const zhT = vi.hoisted(() => {
  const names: Record<string, string> = {
    'page.tree.writeOp.create': '新建',
    'page.tree.writeOp.rename': '重命名',
    'page.tree.writeOp.batchAdd': '批量添加',
    'page.tree.writeOp.delete': '删除',
    'page.tree.writeOp.deleteAll': '删除全部',
    'page.tree.writeOp.cascadeDelete': '级联删除',
    'page.tree.writeOp.deletePromote': '删除并提升子节点',
    'page.tree.writeOp.drag': '拖放'
  };
  return (key: string, params?: Record<string, unknown>): string => {
    if (key === 'page.tree.writeFailed') return `${params?.operation ?? ''}失败：${params?.message ?? ''}`;
    return names[key] ?? key;
  };
});

vi.mock('@aiao/rxdb-i18n-vue', () => ({
  useI18n: () => ({ t: zhT, locale: { value: 'zh-Hans' } }),
  useI18nOptional: () => ({ t: zhT, locale: { value: 'zh-Hans' } })
}));

import { useTreeWriteError } from './useTreeWriteError';

describe('useTreeWriteError', () => {
  it('写入成功：返回 true，不设置错误', async () => {
    const { writeError, guardWrite } = useTreeWriteError();

    await expect(guardWrite('新建', async () => undefined)).resolves.toBe(true);

    expect(writeError.value).toBeNull();
  });

  it('写入失败：返回 false 并写入「<操作>失败：<消息>」，不向外抛出', async () => {
    const { writeError, guardWrite } = useTreeWriteError();

    await expect(
      guardWrite('批量添加', async () => {
        throw new Error('boom');
      })
    ).resolves.toBe(false);

    expect(writeError.value).toBe('批量添加失败：boom');
  });

  it('同步抛出的非 Error 值也被接住', async () => {
    const { writeError, guardWrite } = useTreeWriteError();

    await guardWrite('删除', () => {
      throw 'plain';
    });

    expect(writeError.value).toBe('删除失败：plain');
  });

  it('新的写入开始时清掉上一条提示；clearWriteError 手动清除', async () => {
    const { writeError, clearWriteError, guardWrite } = useTreeWriteError();
    await guardWrite('新建', () => Promise.reject(new Error('boom')));
    expect(writeError.value).toBe('新建失败：boom');

    await guardWrite('重命名', async () => undefined);
    expect(writeError.value).toBeNull();

    await guardWrite('新建', () => Promise.reject(new Error('boom')));
    clearWriteError();
    expect(writeError.value).toBeNull();
  });
});
