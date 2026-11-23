import { useI18n } from '@aiao/rxdb-i18n-react';
import { STORAGE_TESTID } from '@aiao/utils';
import { AlertTriangle } from 'lucide-react';

interface StorageConfirmDialogProps {
  message: string;
  show: boolean;
  onRespond: (confirmed: boolean) => void;
}

export function StorageConfirmDialog({
  message,
  show,
  onRespond
}: StorageConfirmDialogProps): React.JSX.Element | null {
  const { t } = useI18n();
  const T = STORAGE_TESTID;

  if (!show) {
    return null;
  }

  return (
    <div className='modal modal-open' data-testid={T.CONFIRM_DIALOG} onClick={() => onRespond(false)}>
      <div className='modal-box' onClick={event => event.stopPropagation()}>
        <h3 className='mb-4 flex items-center gap-2 text-base font-bold'>
          <AlertTriangle className='text-warning' size={18} /> {t('file.confirmAction')}
        </h3>
        <p className='mb-4'>{message}</p>
        <div className='modal-action'>
          <button className='btn btn-sm' data-testid={T.CONFIRM_NO} onClick={() => onRespond(false)}>
            {t('file.cancel')}
          </button>
          <button className='btn btn-sm btn-error' data-testid={T.CONFIRM_YES} onClick={() => onRespond(true)}>
            {t('file.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
