/**
 * @fileoverview 游离事件任务的错误判据
 *
 * 事件监听器里发起的异步任务没有调用方接得住错误（{@link VersionManager} 的
 * `#runDetachedEventTask`、{@link setupSyncListeners} 的远端事件处理器都是即发即忘）。
 * 连接正在拆除时这些任务必然撞上一批「适配器已经走了」的错误，它们是拆除过程的正常噪音，
 * 不该打进控制台当故障看。
 *
 * 判据留在历史插件、由同步插件经 `@aiao/rxdb-plugin-history` 引用：同步插件本就
 * `inject: ['plugin:history']`，这条 import 不新增依赖边；放进核心则要为一个纯谓词
 * 再撑大一圈公共表面，与 US-025「核心只留原语」的方向相反。
 */

import { isAdapterShutdownError } from '@aiao/rxdb';

/**
 * 判断游离事件任务的错误是否可忽略
 *
 * @param error - 任务抛出的错误
 * @returns 属于连接拆除噪音时返回 `true`
 *
 * @remarks
 * 包括：
 * - errno 44 = ENODEV（Emscripten IDBFS 连接关闭）
 * - name === 'AbortError'
 * - adapter shutdown 错误（统一字符串匹配模式）
 *
 * @internal
 */
export const isIgnorableDetachedVersionEventError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const name = 'name' in error ? String(error.name) : '';
  const errno = 'errno' in error ? Number((error as { errno?: unknown }).errno) : undefined;

  if (errno === 44 || name === 'AbortError') {
    return true;
  }

  return isAdapterShutdownError(error);
};
