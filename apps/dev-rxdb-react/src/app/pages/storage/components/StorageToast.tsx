import { useI18n } from '@aiao/rxdb-i18n-react';
import { STORAGE_TESTID } from '@aiao/utils';
import { renderFileMessage } from '@modules/demo-i18n/files';
import { X } from 'lucide-react';
import type { ToastState } from '../types';

interface StorageToastProps {
  toast: ToastState;
  onClose: () => void;
}

export function StorageToast({ toast, onClose }: StorageToastProps): React.JSX.Element | null {
  const { t } = useI18n();
  const T = STORAGE_TESTID;

  if (!toast.show) {
    return null;
  }

  return (
    <div className='toast toast-top toast-end'>
      <div
        className={`alert ${
          toast.type === 'success' ? 'alert-success'
          : toast.type === 'error' ? 'alert-error'
          : 'alert-info'
        }`}
        data-testid={
          toast.type === 'success' ? T.SUCCESS_TOAST
          : toast.type === 'error' ?
            T.ERROR_TOAST
          : undefined
        }
      >
        <span>{renderFileMessage(t, toast.message)}</span>
        <button className='btn btn-sm btn-ghost' onClick={onClose} aria-label={t('file.close')}>
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
