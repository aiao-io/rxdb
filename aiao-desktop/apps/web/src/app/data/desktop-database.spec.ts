import { getEntityMetadata } from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDesktopDatabase, DESKTOP_ADAPTER } from './desktop-database';

const { init, getDevToolsConnector } = vi.hoisted(() => {
  const init = vi.fn();
  return { init, getDevToolsConnector: vi.fn(() => ({ init })) };
});

vi.mock('@aiao/rxdb-devtools', () => ({ getDevToolsConnector }));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('桌面数据库的开发工具', () => {
  it('生产环境不加载连接器，数据库仍保持尚未连接', async () => {
    vi.stubEnv('DEV', false);
    const database = createDesktopDatabase('/');
    try {
      await vi.dynamicImportSettled();
      expect(getDevToolsConnector).not.toHaveBeenCalled();
      expect(init).not.toHaveBeenCalled();
      expect(await firstValueFrom(database.adapterConnected$(DESKTOP_ADAPTER))).toBe(false);
    } finally {
      await database.destroy();
    }
  });

  it('开发环境把已初始化的桌面库与实体元数据接到连接器，不提前连接数据库', async () => {
    vi.stubEnv('DEV', true);
    const database = createDesktopDatabase('/');
    try {
      await vi.dynamicImportSettled();
      expect(getDevToolsConnector).toHaveBeenCalledExactlyOnceWith();
      expect(init).toHaveBeenCalledExactlyOnceWith(database, getEntityMetadata);
      expect(database.entityManager).toBeDefined();
      expect(await firstValueFrom(database.adapterConnected$(DESKTOP_ADAPTER))).toBe(false);
    } finally {
      await database.destroy();
    }
  });
});
