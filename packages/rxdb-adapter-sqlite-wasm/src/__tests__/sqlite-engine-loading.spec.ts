import { expect, it, vi } from 'vitest';

const engineLoaded = vi.hoisted(() => vi.fn());
vi.mock('@subframe7536/sqlite-wasm', async importOriginal => {
  engineLoaded();
  return importOriginal<typeof import('@subframe7536/sqlite-wasm')>();
});

it('准备 Worker 代理及校验 VFS 时，主线程不加载 SQLite 引擎', async () => {
  await import('../create_sqlite_client.js');
  const { sqliteLoad } = await import('../sqlite-load.utils.js');
  await expect(sqliteLoad('worker-only', { vfs: 'opfs' })).rejects.toThrow(/only support worker/);
  expect(engineLoaded).not.toHaveBeenCalled();
});
