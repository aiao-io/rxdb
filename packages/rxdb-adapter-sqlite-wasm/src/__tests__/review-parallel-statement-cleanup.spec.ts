import { describe, expect, it, vi } from 'vitest';
import { executeHelper } from '../execute_helper.js';
import type { SQLiteAPI } from '../sqlite-api.type.js';

describe('并行评审：绑定语句的 prepare 失败清理', () => {
  it('第二条语句 prepare 抛错仍释放第一条 unscoped statement', async () => {
    const prepareError = new Error('second statement prepare failed');
    const finalize = vi.fn<SQLiteAPI['finalize']>().mockResolvedValue(0);
    const sqlite = {
      set_authorizer: vi.fn(),
      finalize,
      statements: async function* () {
        yield 41;
        throw prepareError;
      }
    } as unknown as SQLiteAPI;

    await expect(executeHelper(sqlite, 1, 'SELECT ?; invalid SQL', [1])).rejects.toThrow(prepareError.message);
    expect(finalize).toHaveBeenCalledExactlyOnceWith(41);
  });
});
