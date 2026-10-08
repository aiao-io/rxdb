import { CircleAlert, X } from 'lucide-react';

export interface OperationErrorAlertProps {
  /** 错误文案；`null` 表示无错误，组件不渲染。 */
  message: string | null;
  onClose: () => void;
}

/**
 * 树页面除拖放外的写入失败的页面级提示（新建、重命名、批量添加、删除、级联删除、删除并提升子节点）。
 *
 * @remarks
 * 菜单与文件管理器各三页共用，文案由 `formatTreeWriteError` 生成，状态来自 store 的 `writeError`。
 * 根元素带 `data-testid="tree-write-error"`，三端 e2e 与单测按它定位。
 * REACT-FRESH-01：页面此前没有任何承接写入失败的位置，失败只能是未处理的拒绝。
 */
export function OperationErrorAlert({ message, onClose }: OperationErrorAlertProps) {
  if (!message) return null;

  return (
    <div className='alert alert-error' data-testid='tree-write-error' role='alert'>
      <CircleAlert size={20} />
      <div className='flex-1 text-sm'>{message}</div>
      <button aria-label='关闭错误提示' className='btn btn-ghost btn-sm btn-circle' onClick={onClose} type='button'>
        <X size={16} />
      </button>
    </div>
  );
}
