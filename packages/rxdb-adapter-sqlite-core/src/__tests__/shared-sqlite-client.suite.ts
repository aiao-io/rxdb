import { describe, expect, it } from 'vitest';
import type { SqliteClientLike } from '../RxDBAdapterSqliteBase.js';
import type { AdapterFactory } from './adapter-factory.js';

/** SqliteClient 测试：执行、断开连接等基础契约。 */
export function sqliteClientSuite(factory: AdapterFactory) {
  describe(`SqliteClient [${factory.name}]`, () => {
    it('execute() 应该在断开连接后抛出错误', async () => {
      const client = await factory.createClient<SqliteClientLike>('test-disconnect-db');

      await client.disconnect();

      try {
        await client.execute('SELECT 1');
        expect.fail('Should have thrown an error');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(Error);
        if (!(error instanceof Error)) throw error;
        expect(error.message).toContain('disconnected');
      }
    });
  });
}
