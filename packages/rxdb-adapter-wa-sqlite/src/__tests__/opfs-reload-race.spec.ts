import { afterEach, describe, expect, it } from 'vitest';
import { createSqliteClient } from '../create_sqlite_client.js';
import { syncWasmPath } from './wa-sqlite-wasm.js';

/**
 * @fileoverview US-221：整页刷新时上一个页面还占着库文件的同步访问句柄，`OPFSCoopSyncVFS` 照样打得开。
 *
 * @remarks
 * wa-sqlite 的 `OPFSCoopSyncVFS` 与 sqlite-wasm 的 `opfs` 档是同一个 VFS，竞态一样。真实 module Worker、真实 OPFS；
 * 占句柄的是 `opfs-handle-holder.worker.ts`：只开句柄、不拿 VFS 的 Web Lock，正是刷新时「锁已放、句柄还没关」的现场。
 * 占的是 OPFS 根目录下的 `<库名>.sqlite`：VFS 的落盘名对不上就占不住，「一直不放」那条用例会直接打开成功——它同时钉住落盘名。
 *
 * 只占库文件、不占旁文件，是故意的：第一次打开时 VFS 并行去开库文件与 `-journal` / `-wal`，库文件先失败，另外两个后开出来、
 * 没人关。同一个 Worker 里的重试要先交出这两个句柄才打得开（`releaseOpfsCoopSyncHandles`），这条路径由此必走。
 */

const liveWorkers: Worker[] = [];

/** 统一登记，`afterEach` 兜底 terminate。 */
const track = (worker: Worker): Worker => {
  liveWorkers.push(worker);
  return worker;
};

// `new Worker(new URL(…, import.meta.url), { type: 'module' })` 必须内联写：Vite 只认这个字面形状为 Worker 入口，
// URL 经变量传进来时文件会被当成普通测试模块送出，Worker 里没有测试运行时。
const spawnClientWorker = () =>
  track(new Worker(new URL('./wa-sqlite-client.worker', import.meta.url), { type: 'module' }));

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

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

const opfsFileExists = (root: FileSystemDirectoryHandle, name: string): Promise<boolean> =>
  root.getFileHandle(name).then(
    () => true,
    () => false
  );

/**
 * 等客户端第一次打开撞上被占的库文件：VFS 先在 OPFS 根目录建出 `-wal`，紧接着去开三个文件的句柄，库文件那个当场失败。
 * 见到 `-wal` 再等一段远长于这几步的时间，第一次打开必然已经失败；不靠 Worker 启动快慢去赌时序。
 */
const firstAttemptFailed = async (dbName: string): Promise<void> => {
  const root = await navigator.storage.getDirectory();
  while (!(await opfsFileExists(root, `${dbName}.sqlite-wal`))) await sleep(10);
  await sleep(200);
};

const opfsOptions = (workerInstance: Worker) => ({
  vfs: 'OPFSCoopSyncVFS' as const,
  // wasmPath 指向同步产物；OPFSCoopSyncVFS 两种构建都支持，适配器无从猜测，必须显式声明
  async: false,
  wasmPath: syncWasmPath,
  worker: true,
  workerInstance,
  batchTimeout: 1
});

afterEach(() => {
  for (const worker of liveWorkers.splice(0)) worker.terminate();
});

describe('US-221 · OPFSCoopSyncVFS：库文件的同步访问句柄被另一个上下文占着', () => {
  it('第一次打开撞上占用之后才释放：重试交出失败那次留下的句柄，等到释放后打开成功', async () => {
    const dbName = `us221-wa-released-${Date.now()}`;
    const release = await holdAccessHandle(`${dbName}.sqlite`);
    const releaseAfterFirstAttempt = async () => {
      await firstAttemptFailed(dbName);
      await release();
    };

    const [client] = await Promise.all([
      createSqliteClient(dbName, opfsOptions(spawnClientWorker())),
      releaseAfterFirstAttempt()
    ]);
    await client.execute('CREATE TABLE t(v TEXT)');
    await client.execute('INSERT INTO t VALUES (?)', ['opened-after-release']);
    const result = await client.execute('SELECT v FROM t');
    await client.disconnect();

    expect(result.results[0].rows).toEqual([['opened-after-release']]);
  });

  it('占着的一方一直不放：在重试上限内失败，报句柄被占用', async () => {
    const dbName = `us221-wa-held-${Date.now()}`;
    const release = await holdAccessHandle(`${dbName}.sqlite`);

    await expect(createSqliteClient(dbName, opfsOptions(spawnClientWorker()))).rejects.toThrow(
      new RegExp(`${dbName}\\.sqlite.*held by another context`)
    );
    await release();
  });
});
