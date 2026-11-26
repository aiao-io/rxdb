import { useI18n } from '@aiao/rxdb-i18n-react';
import { TriangleAlert, X } from 'lucide-react';

export interface PathConflictWarningProps {
  conflictPath: string | null;
  noun: '菜单' | '文件';
  onClose: () => void;
}

/** 重命名路径冲突警告：标题与正文都随当前语言解析，正文键按冲突对象类型选择。 */
export function PathConflictWarning({ conflictPath, noun, onClose }: PathConflictWarningProps) {
  const { t } = useI18n();
  if (!conflictPath) return null;

  const bodyKey = noun === '菜单' ? 'page.tree.duplicateMenuConflict' : 'page.file.pathConflictBody';

  return (
    <div className='alert alert-warning'>
      <TriangleAlert size={20} />
      <div className='flex-1'>
        <div className='font-semibold'>{t('page.tree.pathConflict')}</div>
        <div className='text-sm'>
          {t(bodyKey)}
          <strong>{conflictPath}</strong>
        </div>
      </div>
      <button className='btn btn-ghost btn-sm btn-circle' onClick={onClose} type='button'>
        <X size={16} />
      </button>
    </div>
  );
}
