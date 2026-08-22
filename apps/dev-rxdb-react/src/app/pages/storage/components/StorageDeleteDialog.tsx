import { STORAGE_TESTID } from '@aiao/utils';
import { AlertTriangle, Trash2 } from 'lucide-react';
import type { StorageBrowserItem } from '../utils/storage-utils';

interface StorageDeleteDialogProps {
  entry: StorageBrowserItem | null;
  show: boolean;
  onRespond: (confirmed: boolean) => void;
}

function isBatchDeleteEntry(entry: StorageBrowserItem | null): boolean {
  return !!entry && !entry.path;
}

export function StorageDeleteDialog({
  entry,
  show,
  onRespond
}: StorageDeleteDialogProps): React.JSX.Element | null {
  const T = STORAGE_TESTID;

  if (!show || !entry) {
    return null;
  }

  return (
    <div className='modal modal-open' data-testid={T.CONFIRM_DIALOG} onClick={() => onRespond(false)}>
      <div className='modal-box' onClick={event => event.stopPropagation()}>
        <h3 className='mb-4 flex items-center gap-2 text-base font-bold'>
          <Trash2 className='text-error' size={18} /> Confirm Delete
        </h3>
        {isBatchDeleteEntry(entry) ?
          <p className='mb-4'>
            Are you sure you want to delete
            <span className='text-error font-semibold'>{entry.name}</span>?
          </p>
        : <>
            <p className='mb-4'>
              Are you sure you want to delete
              <span className='font-semibold'>{entry.kind === 'file' ? 'file' : 'folder'}</span>
              <span className='text-error font-semibold'>{entry.name}</span>?
            </p>
            {entry.kind === 'directory' && (
              <p className='text-warning mb-4 flex items-center gap-1 text-sm'>
                <AlertTriangle size={16} /> This will delete the folder and all of its contents.
              </p>
            )}
          </>
        }
        <div className='modal-action'>
          <button className='btn btn-sm' data-testid={T.CONFIRM_NO} onClick={() => onRespond(false)}>
            Cancel
          </button>
          <button className='btn btn-sm btn-error' data-testid={T.CONFIRM_YES} onClick={() => onRespond(true)}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
