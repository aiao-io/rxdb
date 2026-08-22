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
  const T = STORAGE_TESTID;

  if (!show || !entry) {
    return null;
  }

  return (
    <div className='modal modal-open' data-testid={T.RENAME_DIALOG} onClick={onCancel}>
      <div className='modal-box' onClick={event => event.stopPropagation()}>
        <h3 className='mb-4 text-base font-bold'>Rename {entry.kind === 'file' ? 'File' : 'Folder'}</h3>
        <input
          className='input input-bordered w-full'
          data-testid={T.RENAME_INPUT}
          onChange={event => onNameChange(event.target.value)}
          onKeyDown={event => event.key === 'Enter' && onConfirm()}
          placeholder={entry.kind === 'file' ? 'File name' : 'Folder name'}
          type='text'
          value={newName}
        />
        <div className='modal-action'>
          <button className='btn btn-sm' onClick={onCancel}>
            Cancel
          </button>
          <button className='btn btn-sm btn-primary' data-testid={T.RENAME_CONFIRM} onClick={onConfirm}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
