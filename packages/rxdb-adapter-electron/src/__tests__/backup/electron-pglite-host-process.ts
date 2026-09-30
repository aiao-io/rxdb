/**
 * PGlite 恢复强杀用例（US-217 AC#11）的 host 子进程入口：在 `argv[2]` 指定的数据根目录上跑带备份能力的
 * 真实 PGlite host，经 Node 的 IPC 通道收发协议消息。
 *
 * @remarks
 * 与进程内的 `startBackupHost` 同构：新数据目录从 `argv[3]` 的 initdb 模板复制，请求交给
 * {@link createElectronPgliteHost} 的 `handle()`，应答与 NOTIFY 原样发回。由 `forked-host-process.ts`
 * 按源码打包后 fork；PGlite 按自身位置找 wasm 与数据文件，留在包外从 node_modules 加载。
 *
 * 可选的 `argv[4]` 是一个 PostgreSQL 版本号：给了它，`pg.engine` 的探针不再起 PGlite 内存实例，直接回答这个版本。
 * 只给内存用例（AC#9）用：探针关掉之后 WASM 堆何时归还操作系统取决于 GC 与内核，它与备份 / 恢复叠不叠在一起并不确定。
 * 探针的固定开销由内存用例在另一个真实探针的 host 上单独量。
 */
import type { DesktopPgliteNotifyMessage, DesktopPgliteResponse } from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
import { PGlite } from '@electric-sql/pglite';
import { cpSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createElectronPgliteHost, type ElectronPgliteProbeRuntime } from '../../pglite-host.js';
import type { HostProcessMessage, HostProcessRequest } from './forked-host-process.js';
import { decodeWire, encodeWire, isPeakRssProbe, peakRssBytes, type PeakRssProbe } from './host-process-wire.js';

/** 父进程发来的一条请求的内容：协议负载与发起窗口，或读峰值内存的探针。 */
export type PgliteHostProcessBody = { readonly payload: unknown; readonly ownerId: number } | PeakRssProbe;

type Message = HostProcessMessage<DesktopPgliteResponse | number, DesktopPgliteNotifyMessage>;

const [root, template, probeServerVersion] = process.argv.slice(2);
if (root === undefined || template === undefined || process.send === undefined) {
  throw new Error('fork this entry with the data root and the template directory as arguments and an IPC channel');
}
const post = process.send.bind(process);
const send = (message: Message): void => {
  post(encodeWire(message));
};
const directoryOf = (name: string): string => join(root, name);

/** 按 `argv[4]` 回答版本的探针；没给版本号时起真实的 PGlite 内存实例。 */
const createProbeRuntime = async (): Promise<ElectronPgliteProbeRuntime> => {
  if (probeServerVersion === undefined) return new PGlite();
  return {
    query: async () => ({ rows: [{ server_version: probeServerVersion }], fields: [] }),
    close: async () => undefined
  };
};

const host = createElectronPgliteHost({
  createRuntime: async name => {
    const directory = directoryOf(name);
    // 只给还不存在的目录铺模板：恢复在 open 时起的私有实例必须打开归档写出来的那棵树。
    if (!existsSync(directory)) cpSync(template, directory, { recursive: true });
    const runtime = new PGlite(directory);
    await runtime.waitReady;
    return runtime;
  },
  postNotify: notify => send({ event: notify }),
  onDeliveryError: error => send({ deliveryError: String(error) }),
  backup: {
    resolveDataDirectory: directoryOf,
    createProbeRuntime,
    extensions: []
  }
});

process.on('message', message => {
  const request = decodeWire(message as Uint8Array) as HostProcessRequest<PgliteHostProcessBody>;
  if (isPeakRssProbe(request)) {
    send({ id: request.id, response: peakRssBytes() });
    return;
  }
  // `handle()` 从不 reject：失败以协议错误应答的形式回来。
  void host.handle(request.payload, request.ownerId).then(response => send({ id: request.id, response }));
});

// 父进程断开时关掉全部会话与恢复，之后事件循环里不剩任何东西，子进程随之退出。
process.once('disconnect', () => void host.closeAll());
