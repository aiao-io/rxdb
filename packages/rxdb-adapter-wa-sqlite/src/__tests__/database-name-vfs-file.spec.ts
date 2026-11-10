import { afterEach, describe, expect, it } from 'vitest';
import { assertWaSqliteDatabaseName, WaSqliteClient } from '../SqliteClient.js';
import { asyncWasmPath } from './wa-sqlite-wasm.js';

/**
 * 内置 VFS 把 `${dbName}.sqlite` 当 URL 解析，按 pathname 认文件：两个不同的库名落到同一个文件时，
 * 第二个逻辑库读写、`dropStorage()` 删的都是第一个库。
 */
describe('wa-sqlite 库名与 VFS 文件一一对应', () => {
  it.each([
    ['字面的百分号转义与它解出的字符撞文件', 'tenant%20alice'],
    ['非 ASCII 字符的大写转义', 'caf%C3%A9'],
    ['? 截掉后面的部分', 'a?x'],
    ['# 截掉后面的部分', 'a#x'],
    ['反斜杠被当成 /', 'a\\b'],
    ['制表符被丢掉', 'a\tb'],
    ['开头的空白被丢掉', ' a'],
    ['. 段被折叠', './a'],
    ['中间的 . 段被折叠', 'a/./b'],
    ['%2e 也算 . 段', '%2e/a'],
    ['像 scheme 的前缀', 'a:b']
  ])('拒绝：%s（%j）', (_title, dbName) => {
    expect(() => assertWaSqliteDatabaseName(dbName)).toThrow(/maps to a VFS file/);
  });

  it.each([
    'app',
    'tenant alice',
    'tenant alice@0.0.1',
    'café',
    'alice%40example.com',
    'a%2fb',
    '100%',
    'a/b',
    'with-dash_and.dot'
  ])('放行：%j', dbName => {
    expect(() => assertWaSqliteDatabaseName(dbName)).not.toThrow();
  });

  describe('IDBBatchAtomicVFS 上的两个逻辑库', () => {
    const clients: WaSqliteClient[] = [];

    afterEach(async () => {
      await Promise.all(clients.splice(0).map(client => client.disconnect()));
    });

    const open = async (dbName: string): Promise<WaSqliteClient> => {
      const client = new WaSqliteClient();
      clients.push(client);
      await client.init(dbName, { vfs: 'IDBBatchAtomicVFS', async: true, wasmPath: asyncWasmPath });
      return client;
    };

    it('空格与字面 %20 的库名不会共用一个文件：后者在打开前被拒', async () => {
      const tag = Math.random().toString(36).slice(2, 10);
      const alice = await open(`tenant alice ${tag}`);
      await alice.execute('CREATE TABLE secrets (value TEXT)');
      await alice.execute(`INSERT INTO secrets (value) VALUES ('alice-only')`);

      await expect(open(`tenant%20alice%20${tag}`)).rejects.toThrow(/maps to a VFS file/);
    });
  });
});
