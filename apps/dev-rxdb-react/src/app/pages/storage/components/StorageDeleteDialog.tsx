import { useI18n } from '@aiao/rxdb-i18n-react';
import { STORAGE_TESTID } from '@aiao/utils';
import type { FileDeleteTarget } from '@modules/demo-i18n/files';
import { AlertTriangle, Trash2 } from 'lucide-react';
import type { StorageBrowserItem } from '../utils/storage-utils';

interface StorageDeleteDialogProps {
  target: FileDeleteTarget<StorageBrowserItem> | null;
  show: boolean;
  onRespond: (confirmed: boolean) => void;
}

export function StorageDeleteDialog({ target, show, onRespond }: StorageDeleteDialogProps): React.JSX.Element | null {
  const { t } = useI18n();
  const T = STORAGE_TESTID;

  if (!show || !target) {
    return null;
  }

  return (
    <div className='modal modal-open' data-testid={T.CONFIRM_DIALOG} onClick={() => onRespond(false)}>
      <div className='modal-box' onClick={event => event.stopPropagation()}>
        <h3 className='mb-4 flex items-center gap-2 text-base font-bold'>
          <Trash2 className='text-error' size={18} /> {t('file.confirmDelete')}
        </h3>
        <p className='mb-4'>
          {target.type === 'batch' ?
            t('file.deleteMany', { count: target.count })
          : t('file.deleteOne', { kind: target.entry.kind, name: target.entry.name })}
        </p>
        {target.type === 'single' && target.entry.kind === 'directory' && (
          <p className='text-warning mb-4 flex items-center gap-1 text-sm'>
            <AlertTriangle size={16} /> {t('file.deleteContents')}
          </p>
        )}
        <div className='modal-action'>
          <button className='btn btn-sm' data-testid={T.CONFIRM_NO} onClick={() => onRespond(false)}>
            {t('file.cancel')}
          </button>
          <button className='btn btn-sm btn-error' data-testid={T.CONFIRM_YES} onClick={() => onRespond(true)}>
            {t('file.delete')}
          </button>
        </div>
      </div>
    </div>
  );
}
