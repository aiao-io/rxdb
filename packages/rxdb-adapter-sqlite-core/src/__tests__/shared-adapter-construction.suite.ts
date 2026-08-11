import { Todo } from '@aiao/rxdb-test/entities';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import type { AdapterFactory } from './adapter-factory.js';

const LISTENER_INIT_ERROR = '[RxDBAdapterSqliteBase] Failed to register event listeners';

export function adapterConstructionSuite(factory: AdapterFactory) {
  describe(`RxDB SQLite 适配器构造阶段 [${factory.name}]`, () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('不应在子类状态完成初始化前访问 SQLite client 配置', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      let adapter: RxDBAdapterSqliteBase | undefined;
      try {
        adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [Todo] });
      } finally {
        if (adapter) {
          await adapter.rxdb.disconnectAll();
        }
      }

      expect(consoleErrorSpy.mock.calls.some(([message]) => String(message).includes(LISTENER_INIT_ERROR))).toBe(false);
    });
  });
}
