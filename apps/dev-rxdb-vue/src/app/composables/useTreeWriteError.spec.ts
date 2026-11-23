import { describe, expect, it } from 'vitest';


// 页面 composable 现在经 useI18n 取文案；桩一个真实 zh 运行时，避免每个用例都 provideI18n。
vi.mock('@aiao/rxdb-i18n-vue', async () => {
  const { I18n } = await import('@aiao/rxdb-i18n');
  const { treeMenuCatalogs } = await import('@modules/demo-i18n/tree-menu');
  const runtime = new I18n({ defaultLocale: 'zh-Hans', deviceLocale: 'zh-Hans', catalogs: treeMenuCatalogs });
  return {
    useI18n: () => ({ t: runtime.t, locale: { value: 'zh-Hans' } }),
    useI18nOptional: () => ({ t: runtime.t, locale: { value: 'zh-Hans' } })
  };
});
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
