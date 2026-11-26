import { useI18n } from '@aiao/rxdb-i18n-react';
import { STORAGE_TESTID } from '@aiao/utils';
import type { StorageBrowserItem } from '../utils/storage-utils';

interface StorageRenameDialogProps {
  entry: StorageBrowserItem | null;
  newName: string;
  show: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onNameChange: (name: string) => void;
}

export function StorageRenameDialog({
  entry,
  newName,
  show,
  onCancel,
  onConfirm,
  onNameChange
}: StorageRenameDialogProps): React.JSX.Element | null {
  const { t } = useI18n();
  const T = STORAGE_TESTID;

  if (!show || !entry) {
    return null;
  }

  return (
    <div className='modal modal-open' data-testid={T.RENAME_DIALOG} onClick={onCancel}>
      <div className='modal-box' onClick={event => event.stopPropagation()}>
        <h3 className='mb-4 text-base font-bold'>{t('file.renameEntry', { kind: entry.kind })}</h3>
        <input
          className='input input-bordered w-full'
          data-testid={T.RENAME_INPUT}
          onChange={event => onNameChange(event.target.value)}
          onKeyDown={event => event.key === 'Enter' && onConfirm()}
          placeholder={entry.kind === 'file' ? t('file.fileName') : t('file.folderName')}
          type='text'
          value={newName}
        />
        <div className='modal-action'>
          <button className='btn btn-sm' onClick={onCancel}>
            {t('file.cancel')}
          </button>
          <button className='btn btn-sm btn-primary' data-testid={T.RENAME_CONFIRM} onClick={onConfirm}>
            {t('file.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
