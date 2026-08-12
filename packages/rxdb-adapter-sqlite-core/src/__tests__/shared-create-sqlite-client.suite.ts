import { describe, expect, it } from 'vitest';
import type { AdapterFactory } from './adapter-factory.js';

/** create_sqlite_client 测试：worker 选项校验与 client 创建路径。 */
export function createSqliteClientSuite(factory: AdapterFactory) {
  describe(`create_sqlite_client [${factory.name}]`, () => {
    it('should validate options for worker clients', async () => {
      await expect(
        factory.createClient('worker-validation-db', {
          worker: true,
          workerInstance: {} as Worker
        })
      ).rejects.toThrow();
    });
  });
}
