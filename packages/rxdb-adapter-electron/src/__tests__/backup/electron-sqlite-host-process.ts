/**
 * 备份强杀用例（US-217 AC#11）的 host 子进程入口：在 `argv[2]` 指定的工作区上跑真实的 `node:sqlite` host，
 * 经 Node 的 IPC 通道收发协议消息。
 *
 * @remarks
 * 请求交给 {@link createElectronSqliteHost} 的 `handle()`，应答与变更事件原样发回，被替掉的只有 IPC 那根管子。
 * 由 `forked-host-process.ts` 按源码打包后 fork，不经 vitest 转译。
 */
import type { DesktopHostChangeEventMessage, DesktopHostResponse } from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
import { join } from 'node:path';
import { createElectronSqliteHost } from '../../electron-sqlite-host.js';
import type { HostProcessMessage, HostProcessRequest } from './forked-host-process.js';
import { decodeWire, encodeWire, isPeakRssProbe, peakRssBytes, type PeakRssProbe } from './host-process-wire.js';

/** 父进程发来的一条请求的内容：协议负载，或读峰值内存的探针。 */
export type SqliteHostProcessBody = { readonly payload: unknown } | PeakRssProbe;

type Message = HostProcessMessage<DesktopHostResponse | number, DesktopHostChangeEventMessage>;

const workspace = process.argv[2];
if (workspace === undefined || process.send === undefined) {
  throw new Error('fork this entry with the workspace as its only argument and an IPC channel');
}
const post = process.send.bind(process);
const send = (message: Message): void => {
  post(encodeWire(message));
};

const host = createElectronSqliteHost({
  resolveDatabasePath: databaseName => join(workspace, databaseName),
  postChange: change => send({ event: change }),
  onDeliveryError: error => send({ deliveryError: String(error) })
});

process.on('message', message => {
  const request = decodeWire(message as Uint8Array) as HostProcessRequest<SqliteHostProcessBody>;
  if (isPeakRssProbe(request)) {
    send({ id: request.id, response: peakRssBytes() });
    return;
  }
  // `handle()` 从不 reject：失败以协议错误应答的形式回来。
  void host.handle(request.payload).then(response => send({ id: request.id, response }));
});

// 父进程断开时关掉全部连接；IPC 通道一断，事件循环里就不剩任何东西，子进程随之退出。
process.once('disconnect', () => host.closeAll());
