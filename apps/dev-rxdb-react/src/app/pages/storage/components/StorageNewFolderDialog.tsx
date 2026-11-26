import { useI18n } from '@aiao/rxdb-i18n-react';
import { STORAGE_TESTID } from '@aiao/utils';

interface StorageNewFolderDialogProps {
  name: string;
  show: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onNameChange: (name: string) => void;
}

export function StorageNewFolderDialog({
  name,
  show,
  onCancel,
  onConfirm,
  onNameChange
}: StorageNewFolderDialogProps): React.JSX.Element | null {
  const { t } = useI18n();
  const T = STORAGE_TESTID;

  if (!show) {
    return null;
  }

  return (
    <div className='modal modal-open' data-testid={T.NEW_FOLDER_DIALOG} onClick={onCancel}>
      <div className='modal-box' onClick={event => event.stopPropagation()}>
        <h3 className='mb-4 text-base font-bold'>{t('file.newFolder')}</h3>
        <input
          className='input input-bordered w-full'
          data-testid={T.NEW_FOLDER_INPUT}
          onChange={event => onNameChange(event.target.value)}
          onKeyDown={event => event.key === 'Enter' && onConfirm()}
          placeholder={t('file.folderName')}
          type='text'
          value={name}
        />
        <div className='modal-action'>
          <button className='btn btn-sm' onClick={onCancel}>
            {t('file.cancel')}
          </button>
          <button className='btn btn-sm btn-primary' data-testid={T.NEW_FOLDER_CONFIRM} onClick={onConfirm}>
            {t('file.create')}
          </button>
        </div>
      </div>
    </div>
  );
}
