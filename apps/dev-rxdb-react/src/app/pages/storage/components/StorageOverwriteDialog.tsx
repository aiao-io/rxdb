import { formatFileSize } from '@aiao/utils';
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
  if (!show || !file || !existingEntry) {
    return null;
  }

  return (
    <div className='modal modal-open' onClick={() => onRespond(false)}>
      <div className='modal-box' onClick={event => event.stopPropagation()}>
        <h3 className='mb-4 flex items-center gap-2 text-base font-bold'>
          <AlertTriangle className='text-warning' size={18} /> File Already Exists
        </h3>
        <p className='mb-4'>
          File <span className='font-semibold'>{file.name}</span> already exists. Overwrite it?
        </p>
        <div className='bg-base-200 mb-4 space-y-2 rounded-lg p-3'>
          <div className='flex justify-between text-sm'>
            <span className='text-base-content/60'>Existing file:</span>
            <span className='font-mono'>{formatFileSize(existingEntry.size || 0)}</span>
          </div>
          <div className='flex justify-between text-sm'>
            <span className='text-base-content/60'>New file:</span>
            <span className='font-mono'>{formatFileSize(file.size)}</span>
          </div>
        </div>
        <div className='modal-action'>
          <button className='btn btn-sm' onClick={() => onRespond(false)}>
            Cancel
          </button>
          <button className='btn btn-sm btn-warning' onClick={() => onRespond(true)}>
            Overwrite
          </button>
        </div>
      </div>
    </div>
  );
}
