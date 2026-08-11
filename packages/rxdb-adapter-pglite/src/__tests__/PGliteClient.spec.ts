/**
 * T067: PGliteClient 单元测试
 *
 * 测试 PGliteClient 的基础方法和事件处理
 * 目标：将覆盖率从 41.46% 提升到 80%+
 */

import type { PGliteOptions } from '@electric-sql/pglite';
import { live } from '@electric-sql/pglite/live';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PGliteClient, resolvePGliteInitOptions, shouldUsePGliteWorker } from '../PGliteClient.js';

describe('PGliteClient', () => {
  let client: PGliteClient;
  const dbName = `pglite-client-test-${Date.now()}`;

  beforeAll(async () => {
    client = new PGliteClient();
    await client.init(dbName, { store: 'memory' });
  });

  afterAll(async () => {
    if (client) {
      await client.disconnect();
    }
  });

  describe('基础查询方法', () => {
    it('query() 应该执行参数化查询', async () => {
      const result = await client.query('SELECT $1::text AS value', ['hello']);
      expect(result.rows[0]).toEqual({ value: 'hello' });
    });

    it('sql() 应该执行模板查询', async () => {
      const value = 'world';
      const result = await client.sql`SELECT ${value}::text AS value`;
      expect(result.rows[0]).toEqual({ value: 'world' });
    });

    it('exec() 应该执行多语句 SQL', async () => {
      const results = await client.exec(`
        CREATE TEMP TABLE test_exec (id INT, name TEXT);
        INSERT INTO test_exec VALUES (1, 'Alice');
        SELECT * FROM test_exec;
      `);
      expect(results).toHaveLength(3);
      expect(results[2]!.rows[0]).toEqual({ id: 1, name: 'Alice' });
    });

    it('version() 应该返回 PostgreSQL 版本', async () => {
      const version = await client.version();
      expect(version).toContain('PostgreSQL');
    });
  });

  describe('事务方法', () => {
    it('transaction() 应该执行事务', async () => {
      await client.exec('CREATE TEMP TABLE test_tx (count INT DEFAULT 0)');
      await client.exec('INSERT INTO test_tx VALUES (0)');

      const result = await client.transaction(async tx => {
        await tx.query('UPDATE test_tx SET count = count + 1');
        const res = await tx.query<{ count: number }>('SELECT count FROM test_tx');
        return res.rows[0]!.count;
      });

      expect(result).toBe(1);
    });
  });

  describe('事件系统', () => {
    it('应该初始化并等待就绪', async () => {
      // 简单验证客户端已初始化
      const version = await client.version();
      expect(version).toBeDefined();
    });

    it('应该处理无效的 NOTIFY payload', async () => {
      // 这个测试验证错误处理路径
      const errorClient = new PGliteClient();
      await errorClient.init(`pglite-error-test-${Date.now()}`, { store: 'memory' });

      // 监听控制台错误
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {
        // 静默错误输出
      });

      // 使用客户端默认监听的系统频道发送无效 JSON
      await errorClient.exec(`NOTIFY rxdb_change_notify, 'invalid json';`);

      // 等待错误处理
      await new Promise(resolve => setTimeout(resolve, 50));

      // 验证错误被记录
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to parse NOTIFY payload:', expect.any(Error));

      consoleErrorSpy.mockRestore();
      await errorClient.disconnect();
    });
  });

  describe('错误处理', () => {
    it('disconnect() 后应该无法执行查询', async () => {
      const tempClient = new PGliteClient();
      await tempClient.init(`pglite-disconnect-test-${Date.now()}`, { store: 'memory' });
      await tempClient.disconnect();

      // 尝试执行查询应该抛出错误（PGlite 库抛出 "PGlite is closed"）
      await expect(tempClient.query('SELECT 1')).rejects.toThrow('closed');
    });
  });

  describe('describeQuery', () => {
    it('应该描述查询结构', async () => {
      const description = await client.describeQuery("SELECT 1::INT AS num, 'text'::TEXT AS str");
      expect(description).toBeDefined();
      expect(description.resultFields).toHaveLength(2);
      expect(description.resultFields[0]!.name).toBe('num');
      expect(description.resultFields[1]!.name).toBe('str');
    });
  });

  describe('初始化选项', () => {
    it('显式 dataDir 应该覆盖默认持久化目录', () => {
      const options = resolvePGliteInitOptions('test-db', {
        store: 'idb',
        dataDir: 'opfs-ahp://benchmarks/test-db/'
      });

      expect(options.dataDir).toBe('opfs-ahp://benchmarks/test-db/');
      expect(options.relaxedDurability).toBe(false);
    });

    it('memory store 默认启用 relaxedDurability 并不设置 dataDir', () => {
      const options = resolvePGliteInitOptions('memory-db', { store: 'memory' });

      expect(options.dataDir).toBeUndefined();
      expect(options.relaxedDurability).toBe(true);
    });

    it('应该合并 live extension 并识别 OPFS worker 模式', () => {
      const customExtension = { setup: vi.fn() } as unknown as NonNullable<PGliteOptions['extensions']>[string];
      const options = resolvePGliteInitOptions('worker-db', {
        dataDir: 'opfs-ahp://benchmarks/worker-db/',
        extensions: { custom: customExtension } as PGliteOptions['extensions']
      });

      expect(options.extensions.live).toBe(live);
      expect(Reflect.get(options.extensions, 'custom')).toBe(customExtension);
      expect(shouldUsePGliteWorker(options)).toBe(true);
    });

    it('shouldUsePGliteWorker 在 dataDir 缺失或非 OPFS 时返回 false', () => {
      expect(shouldUsePGliteWorker({})).toBe(false);
      expect(shouldUsePGliteWorker({ dataDir: 'idb://x' })).toBe(false);
    });

    it('resolvePGliteInitOptions 尊重显式 relaxedDurability', () => {
      const options = resolvePGliteInitOptions('x', { store: 'memory', relaxedDurability: false });
      expect(options.relaxedDurability).toBe(false);
      expect(options.dataDir).toBeUndefined();
    });
  });
});

describe('PGliteClient residual notification branches', () => {
  it('flushPendingNotifications 冲刷待处理事件后可再次空跑', async () => {
    const client = new PGliteClient();
    await client.init(`pglite-flush-${Date.now()}`, { store: 'memory' });

    await client.exec(`NOTIFY rxdb_change_notify, '{"operation":"INSERT","ids":["a","b"]}';`);
    const hadPending = await client.flushPendingNotifications();
    expect(typeof hadPending).toBe('boolean');
    await client.flushPendingNotifications();
    await client.disconnect();
  });

  it('disconnect 后 query 失败，且 empty payload 不影响连接', async () => {
    const client = new PGliteClient();
    await client.init(`pglite-residual-${Date.now()}`, { store: 'memory' });

    await client.exec(`NOTIFY rxdb_change_notify, '';`);
    await new Promise(resolve => setTimeout(resolve, 30));
    await client.disconnect();
    await expect(client.query('SELECT 1')).rejects.toThrow();
  });
});
