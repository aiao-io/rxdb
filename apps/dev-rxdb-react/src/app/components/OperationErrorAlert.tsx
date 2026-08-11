import { CircleAlert, X } from 'lucide-react';

export interface OperationErrorAlertProps {
  /** 错误文案；`null` 表示无错误，组件不渲染。 */
  message: string | null;
  onClose: () => void;
}

/**
 * 写操作失败的页面级提示。
 *
 * @remarks
 * REACT-FRESH-01：三个 tree store 的删除失败原先只能 `void` 掉 —— 页面没有任何承接错误的位置。
 * 这里补上这个位置，让 store 的 `deleteError` 有地方可去；否则"改成 await"只是把悬空 Promise
 * 换成了悬空状态。
 */
export function OperationErrorAlert({ message, onClose }: OperationErrorAlertProps) {
  if (!message) return null;

  return (
    <div className='alert alert-error' role='alert'>
      <CircleAlert size={20} />
      <div className='flex-1 text-sm'>{message}</div>
      <button aria-label='关闭错误提示' className='btn btn-ghost btn-sm btn-circle' onClick={onClose} type='button'>
        <X size={16} />
      </button>
    </div>
  );
}
