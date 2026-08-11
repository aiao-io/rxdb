import { SQLiteChangeType, type SqliteChangeEvent } from '@aiao/rxdb-adapter-sqlite-core';
import sqliteWasmAsyncUrl from '@subframe7536/sqlite-wasm/wasm-async?url&inline';
import sqliteWasmUrl from '@subframe7536/sqlite-wasm/wasm?url&inline';
import { describe, expect, it, vi } from 'vitest';
import { SqliteClient } from '../SqliteClient.js';

const TABLE = 'rxdb$rxdb_change';

async function openClient(vfs: 'memory' | 'idb', batchTimeout = 16): Promise<SqliteClient> {
  const client = new SqliteClient();
  await client.init(`adv-${vfs}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, {
    vfs,
    batchTimeout,
    wasmUrl: vfs === 'memory' ? sqliteWasmUrl : sqliteWasmAsyncUrl
  });
  return client;
}

describe('adversarial verification', () => {
  // SWM-005：这四条原本以 `expect(true).toBe(true)` 收尾 —— 错误被 catch、连接死亡
  // 或零事件派发都会绿，等于没有断言。改成确定断言：**关键性质是「连接必须存活」**
  // （非法输入不得毒化后续查询），而不是把当前的返回值语义当成契约。
  it('S4: 非法 REGEXP 模式不得毒化连接', async () => {
    const client = await openClient('memory');
    try {
      // 当前实现对非法模式不抛错、返回 0（不匹配）。这里只锁定「有确定结果且不崩」，
      // 「非法模式该报错还是该静默返回 0」是独立的语义问题，见判定。
      const result = await client.execute(`SELECT 'x' REGEXP '['`);
      expect(result.results[0].rows).toEqual([[0]]);

      // 关键性质：错误路径之后连接仍可用
      const after = await client.execute('SELECT 1 AS ok');
      expect(after.results[0].rows).toEqual([[1]]);
    } finally {
      await client.disconnect();
    }
  });

  it('S4b: 参数不足的 regexp_replace 不得毒化连接', async () => {
    const client = await openClient('memory');
    try {
      const result = await client.execute(`SELECT regexp_replace('a','b')`);
      expect(result.results[0].rows).toEqual([['']]);

      const after = await client.execute('SELECT 1 AS ok');
      expect(after.results[0].rows).toEqual([[1]]);
    } finally {
      await client.disconnect();
    }
  });

  it('S1: idb (asyncify wasm) with bound params, many round trips', async () => {
    const unhandled: string[] = [];
    const onUnhandled = (e: PromiseRejectionEvent) => {
      unhandled.push(String(e.reason));
    };
    window.addEventListener('unhandledrejection', onUnhandled);
    const client = await openClient('idb');
    try {
      await client.execute(`CREATE TABLE IF NOT EXISTS t (id INTEGER PRIMARY KEY, name TEXT)`);
      for (let i = 0; i < 50; i++) {
        await client.execute(`INSERT INTO t (name) VALUES (?)`, [`n-${String(i)}`]);
      }
      await client.execute(`SELECT COUNT(*) FROM t WHERE name LIKE ?`, ['n-%']);
      await client.version();
    } finally {
      await client.disconnect();
    }
    await new Promise(r => setTimeout(r, 200));
    window.removeEventListener('unhandledrejection', onUnhandled);

    // asyncify 后端最容易漏掉的是「Promise 被吞掉」——必须断言零 unhandled rejection，
    // 并把内容一起打进失败信息，否则只知道数量对不上、不知道是什么。
    expect(unhandled).toEqual([]);
  });

  it('S2: throwing listener neither replays its batch nor escapes the timer', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const client = await openClient('memory', 5);
    const seen: bigint[][] = [];
    client.addEventListener(SQLiteChangeType.SQLITE_INSERT, (e: SqliteChangeEvent) => {
      seen.push(e.rowIds);
      throw new Error('boom');
    });
    await client.execute(`CREATE TABLE "${TABLE}" (id INTEGER PRIMARY KEY, v TEXT)`);
    await client.execute(`INSERT INTO "${TABLE}" (v) VALUES ('a')`);
    await new Promise(r => setTimeout(r, 60));
    await client.execute(`INSERT INTO "${TABLE}" (v) VALUES ('b')`);
    await new Promise(r => setTimeout(r, 60));
    await client.disconnect();

    // 修复前为 [['1'], ['1','2']]：第一批因监听器抛错未出队，被第二批重放
    expect(seen.map(x => x.map(String))).toEqual([['1'], ['2']]);
    expect(consoleError).toHaveBeenCalledTimes(2);
    consoleError.mockRestore();
  });

  it('S3: sustained awaited writes starve the debounce timer', async () => {
    const client = await openClient('memory', 16);
    let dispatches = 0;
    let lastRowIdCount = 0;
    let totalRowIds = 0;
    client.addEventListener(SQLiteChangeType.SQLITE_INSERT, (e: SqliteChangeEvent) => {
      dispatches++;
      lastRowIdCount = e.rowIds.length;
      totalRowIds += e.rowIds.length;
    });
    await client.execute(`CREATE TABLE "${TABLE}" (id INTEGER PRIMARY KEY, v TEXT)`);
    const start = performance.now();
    let i = 0;
    while (performance.now() - start < 400) {
      await client.execute(`INSERT INTO "${TABLE}" (v) VALUES (?)`, [`v${String(i++)}`]);
    }
    // 持续 await 写入会把宏任务队列饿死，`MAX_BATCH_WAIT_MS` 的硬上限在这种写法下**不成立**
    // （实测 400ms 循环内 0 次派发）。这里刻意**不断言循环期间的派发次数** ——
    // 断言 0 会把缺陷锁成契约，断言 >0 又与现状不符；该缺口见 SWM-005 判定，属独立立项。
    // 能确定断言的是「一条都不能丢」：饥饿只允许推迟派发，不允许吞事件。
    await new Promise(r => setTimeout(r, 200));
    await client.disconnect();

    expect(i).toBeGreaterThan(0);
    expect(dispatches).toBeGreaterThan(0);
    expect(totalRowIds).toBe(i);
    expect(lastRowIdCount).toBeGreaterThan(0);
  });
});
