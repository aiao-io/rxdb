import sqliteWasmUrl from '@subframe7536/sqlite-wasm/wasm?url&inline';
import { afterEach, describe, expect, it } from 'vitest';
import { createSqliteClient } from '../create_sqlite_client.js';

/**
 * @fileoverview US-221：整页刷新时上一个页面还占着库文件的同步访问句柄，新页面照样打得开。
 *
 * @remarks
 * 真实 module Worker、真实 OPFS。占句柄的是 `opfs-handle-holder.worker.ts`：它只开句柄、不拿 VFS 的 Web Lock，
 * 正是刷新时「锁已放、句柄还没关」的现场，不靠真实刷新的时序。
 */

const liveWorkers: Worker[] = [];

/** 统一登记，`afterEach` 兜底 terminate。 */
const track = (worker: Worker): Worker => {
  liveWorkers.push(worker);
  return worker;
};

// `new Worker(new URL(…, import.meta.url), { type: 'module' })` 必须内联写：Vite 只认这个字面形状为 Worker 入口，
// URL 经变量传进来时文件会被当成普通测试模块送出，Worker 里没有测试运行时。
const spawnSqliteWorker = () =>
  track(new Worker(new URL('./sqlite-wasm-lifecycle.worker', import.meta.url), { type: 'module' }));

/** 起一个占句柄的 Worker，等它真的拿到句柄；返回释放函数。 */
const holdAccessHandle = async (fileName: string): Promise<() => Promise<void>> => {
  const holder = track(new Worker(new URL('./opfs-handle-holder.worker', import.meta.url), { type: 'module' }));
  const reply = (expected: string) =>
    new Promise<void>(resolve => {
      holder.addEventListener('message', function onMessage(event: MessageEvent<string>) {
        if (event.data !== expected) return;
        holder.removeEventListener('message', onMessage);
        resolve();
      });
    });
  const held = reply('held');
  holder.postMessage({ type: 'hold', fileName });
  await held;
  return async () => {
    const released = reply('released');
    holder.postMessage({ type: 'release' });
    await released;
  };
};

const opfsOptions = (workerInstance: Worker) => ({
  vfs: 'opfs' as const,
  wasmUrl: sqliteWasmUrl,
  worker: true,
  batchTimeout: 1,
  workerInstance
});

afterEach(() => {
  for (const worker of liveWorkers.splice(0)) worker.terminate();
});

describe('US-221 · 库文件的同步访问句柄被另一个上下文占着', () => {
  it('占着的一方随后释放：打开等到释放后成功', { timeout: 15000 }, async () => {
    const dbName = `us221-released-${Date.now()}`;
    const release = await holdAccessHandle(`${dbName}.sqlite`);
    const releasing = new Promise<void>(resolve => setTimeout(() => void release().then(resolve), 300));

    const client = await createSqliteClient(dbName, opfsOptions(spawnSqliteWorker()));
    await releasing;
    await client.execute('CREATE TABLE t(v TEXT)');
    await client.execute('INSERT INTO t VALUES (?)', ['opened-after-release']);
    const result = await client.execute('SELECT v FROM t');
    await client.disconnect();

    expect(result.results[0].rows).toEqual([['opened-after-release']]);
  });

  it('占着的一方一直不放：在重试上限内失败，报句柄被占用', { timeout: 15000 }, async () => {
    const dbName = `us221-held-${Date.now()}`;
    const release = await holdAccessHandle(`${dbName}.sqlite`);

    await expect(createSqliteClient(dbName, opfsOptions(spawnSqliteWorker()))).rejects.toThrow(
      new RegExp(`${dbName}\\.sqlite.*held by another context`)
    );
    await release();
  });
});
