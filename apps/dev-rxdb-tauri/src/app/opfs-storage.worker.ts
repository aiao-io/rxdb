/**
 * @fileoverview storage 写通道的 worker 入口
 *
 * 存在理由是 WKWebView 的能力缺口：页面上下文没有 `FileSystemFileHandle.createWritable`，
 * worker 上下文却有 `createSyncAccessHandle`。页侧经 `opfs-worker-protocol.ts` 的通道
 * 把 open/write/close/abort 投递进来，这里只做四件事 —— 校验消息来源、解析 OPFS 根、
 * 维护句柄表、把分派结果投回去。路径段列表与 storage 插件默认后端同源（rootDir 段 +
 * 文件段），写入落在同一物理位置。
 *
 * @remarks
 * 全部分派语义在 `handleWorkerOp` 里（可单测），本文件薄到不能再薄；`navigator.storage`
 * 的访问也留在这里，让分派逻辑不依赖 worker 全局。
 *
 * **每一条请求都必须结算**：async onmessage 的拒绝只会变成 unhandledrejection，不触发
 * Worker 的 error 事件——页面侧 `port.onError` 收不到，那条请求会永远等一个到不了的
 * 响应。所以根解析失败时也回同 id 的失败响应，而不是让异常逃出 handler。
 */

import type { OpfsDirectoryHandleLike, OpfsSyncHandleLike, OpfsWorkerRequest } from './opfs-worker-protocol';
import { failureResponse, handleWorkerOp } from './opfs-worker-protocol';

const handles = new Map<number, OpfsSyncHandleLike>();

/** OPFS 根只需解析一次：句柄在 worker 生命周期内稳定，重复解析只会多一次 IPC。 */
let root: Promise<OpfsDirectoryHandleLike> | undefined;
const getRoot = (): Promise<OpfsDirectoryHandleLike> => {
  root ??= navigator.storage.getDirectory().catch(error => {
    // 失败不缓存：缓存住一个 rejected promise 会让每次后续请求重放同一次失败，
    // OPFS 恢复后写通道也不会自愈。下一次请求重新解析即可。
    root = undefined;
    throw error;
  });
  return root;
};

self.onmessage = async (event: MessageEvent) => {
  const request = event.data as OpfsWorkerRequest;
  try {
    // 信任边界：消息必须来自创建本 worker 的窗口（同一安全源）。worker 句柄目前模块私有，
    // 跨源窗口拿不到引用，但这条线把「将来端口被分享 / 页面被嵌入宿主」的余量提前封死 ——
    // 静默丢弃而不是回错误响应，不给不信任的发送方当探针。
    //
    // WebKit（WKWebView）不填 worker MessageEvent 的 origin（恒为空串，e2e 实测），
    // 而 worker 句柄只有创建它的页面拿得到：空串按同源放行，非空按精确匹配判。
    // 这不是把校验关掉 —— 填 origin 的引擎（Chromium / Firefox）上异源依旧被拒。
    if (event.origin !== '' && event.origin !== self.location.origin) {
      return;
    }
    self.postMessage(await handleWorkerOp(request, await getRoot(), handles));
  } catch (error) {
    self.postMessage(failureResponse(request.id, error));
  }
};
