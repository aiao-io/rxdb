import { useCallback, useState } from 'react';
import { formatTreeWriteError, type TreeWriteOperation } from '../utils/tree-write-error';

/** {@link UseTreeWriteError.runWrite} 的结果：成功带回动作的返回值，失败只标记 `ok: false`。 */
export type WriteResult<T> = { ok: true; value: T } | { ok: false };

export interface UseTreeWriteError {
  /** 最近一次写入失败的文案；`null` 表示没有未处理的失败。 */
  writeError: string | null;
  clearWriteError: () => void;
  /**
   * 执行一次写入：开始前清掉上一次的失败，失败时把「<操作>失败：<消息>」写进 `writeError`，不向外抛出。
   *
   * @param operation - 操作名，决定文案前缀
   * @param action - 实际的写入动作
   */
  runWrite: <T>(operation: TreeWriteOperation, action: () => Promise<T>) => Promise<WriteResult<T>>;
}

/**
 * 树页面（菜单与文件管理器各三页）的写入失败状态。
 *
 * @remarks
 * 新建、重命名、批量添加、删除、级联删除、删除并提升子节点、拖放都经 `runWrite`（拖放由 `useDragDrop` 接入），
 * 失败不再是未处理的拒绝，而是页内可见、可关闭的提示。
 */
export function useTreeWriteError(): UseTreeWriteError {
  const [writeError, setWriteError] = useState<string | null>(null);

  const clearWriteError = useCallback(() => setWriteError(null), []);

  const runWrite = useCallback(
    async <T>(operation: TreeWriteOperation, action: () => Promise<T>): Promise<WriteResult<T>> => {
      setWriteError(null);
      try {
        return { ok: true, value: await action() };
      } catch (error: unknown) {
        setWriteError(formatTreeWriteError(operation, error));
        return { ok: false };
      }
    },
    []
  );

  return { writeError, clearWriteError, runWrite };
}
