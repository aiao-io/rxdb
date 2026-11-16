import { firstValueFrom } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

const backend = vi.hoisted(() => ({ loaded: vi.fn() }));

vi.mock('@aiao/rxdb-adapter-sqlite-wasm', async importOriginal => {
  backend.loaded();
  return importOriginal<typeof import('@aiao/rxdb-adapter-sqlite-wasm')>();
});

describe('工作台数据库后端按需加载', () => {
  it('创建工作台时不加载后端，首次并发取得适配器时只加载一次且不连接空库', async () => {
    const { createWorkbenchDatabase } = await import('./setup_rxdb');
    const database = createWorkbenchDatabase();
    try {
      expect(backend.loaded).not.toHaveBeenCalled();
      const [first, second] = await Promise.all([
        database.getAdapter('sqlite-wasm'),
        database.getAdapter('sqlite-wasm')
      ]);
      expect(backend.loaded).toHaveBeenCalledTimes(1);
      expect(first).toBe(second);
      expect(first.options.vfs).toBe('idb');
      expect(await firstValueFrom(database.adapterConnected$('sqlite-wasm'))).toBe(false);
    } finally {
      await database.destroy();
    }
  });
});
