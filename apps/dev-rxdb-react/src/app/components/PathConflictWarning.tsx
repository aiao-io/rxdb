import { TriangleAlert, X } from 'lucide-react';

export interface PathConflictWarningProps {
  conflictPath: string | null;
  noun: '菜单' | '文件';
  onClose: () => void;
}

export function PathConflictWarning({ conflictPath, noun, onClose }: PathConflictWarningProps) {
  if (!conflictPath) return null;

  return (
    <div className='alert alert-warning'>
      <TriangleAlert size={20} />
      <div className='flex-1'>
        <div className='font-semibold'>路径冲突警告</div>
        <div className='text-sm'>
          已存在同名{noun}：<strong>{conflictPath}</strong>
        </div>
      </div>
      <button className='btn btn-ghost btn-sm btn-circle' onClick={onClose} type='button'>
        <X size={16} />
      </button>
    </div>
  );
}
