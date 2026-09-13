/**
 * @fileoverview storage 写通道的 worker 入口
 *
 * 存在理由是 WKWebView 的能力缺口：页面上下文没有 `FileSystemFileHandle.createWritable`，
 * worker 上下文却有 `createSyncAccessHandle`。页侧经 `opfs-worker-protocol.ts` 的通道
 * 把 open/write/close/abort 投递进来，这里只做三件事 —— 解析 OPFS 根、维护句柄表、
 * 把分派结果投回去。路径段列表与 storage 插件默认后端同源（rootDir 段 + 文件段），
 * 写入落在同一物理位置。
 *
 * @remarks
 * 全部分派语义在 `handleWorkerOp` 里（可单测），本文件薄到不能再薄；`navigator.storage`
 * 的访问也留在这里，让分派逻辑不依赖 worker 全局。
 */

import type { OpfsDirectoryHandleLike, OpfsSyncHandleLike, OpfsWorkerRequest } from './opfs-worker-protocol';
import { handleWorkerOp } from './opfs-worker-protocol';

const handles = new Map<number, OpfsSyncHandleLike>();

/** OPFS 根只需解析一次：句柄在 worker 生命周期内稳定，重复解析只会多一次 IPC。 */
let root: Promise<OpfsDirectoryHandleLike> | undefined;
const getRoot = (): Promise<OpfsDirectoryHandleLike> => (root ??= navigator.storage.getDirectory());

self.onmessage = async (event: MessageEvent) => {
  const request = event.data as OpfsWorkerRequest;
  self.postMessage(await handleWorkerOp(request, await getRoot(), handles));
};
