import { ref } from 'vue';
import { formatTreeWriteError, type TreeWriteOperation } from '../utils/tree-write-error';

/**
 * 树页面写入错误状态：把一次写入的失败转成页内提示文案，而不是未处理的拒绝。
 *
 * @remarks
 * `guardWrite` 在每次写入开始时清掉上一条提示；失败时写入 `writeError` 并返回 `false`，
 * 不再向外抛。失败后页面状态即库里已提交的状态，下一次操作照常可用。
 */
export function useTreeWriteError() {
  const writeError = ref<string | null>(null);

  const clearWriteError = () => {
    writeError.value = null;
  };

  const guardWrite = async (operation: TreeWriteOperation, write: () => Promise<unknown>): Promise<boolean> => {
    writeError.value = null;
    try {
      await write();
      return true;
    } catch (error: unknown) {
      writeError.value = formatTreeWriteError(operation, error);
      return false;
    }
  };

  return { writeError, clearWriteError, guardWrite };
}
