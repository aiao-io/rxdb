import { useI18n } from '@aiao/rxdb-i18n-react';
import { formatFileSize } from '@modules/demo-i18n/files';
import { AlertTriangle } from 'lucide-react';
import type { StorageBrowserItem } from '../utils/storage-utils';

interface StorageOverwriteDialogProps {
  existingEntry: StorageBrowserItem | null;
  file: File | null;
  show: boolean;
  onRespond: (confirmed: boolean) => void;
}

export function StorageOverwriteDialog({
  existingEntry,
  file,
  show,
  onRespond
}: StorageOverwriteDialogProps): React.JSX.Element | null {
  const { t, locale } = useI18n();
  if (!show || !file || !existingEntry) {
    return null;
  }

  return (
    <div className='modal modal-open' onClick={() => onRespond(false)}>
      <div className='modal-box' onClick={event => event.stopPropagation()}>
        <h3 className='mb-4 flex items-center gap-2 text-base font-bold'>
          <AlertTriangle className='text-warning' size={18} /> {t('file.fileExists')}
        </h3>
        <p className='mb-4'>{t('file.overwriteQuestion', { name: file.name })}</p>
        <div className='bg-base-200 mb-4 space-y-2 rounded-lg p-3'>
          <div className='flex justify-between text-sm'>
            <span className='text-base-content/60'>{t('file.existingFile')}</span>
            <span className='font-mono'>{formatFileSize(existingEntry.size || 0, locale)}</span>
          </div>
          <div className='flex justify-between text-sm'>
            <span className='text-base-content/60'>{t('file.newFile')}</span>
            <span className='font-mono'>{formatFileSize(file.size, locale)}</span>
          </div>
        </div>
        <div className='modal-action'>
          <button className='btn btn-sm' onClick={() => onRespond(false)}>
            {t('file.cancel')}
          </button>
          <button className='btn btn-sm btn-warning' onClick={() => onRespond(true)}>
            {t('file.overwrite')}
          </button>
        </div>
      </div>
    </div>
  );
}
