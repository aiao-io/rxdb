import { useI18n } from '@aiao/rxdb-i18n-react';
import { Link } from 'react-router-dom';

/** 首次操作前提供录入与恢复入口，避免空工作台提前初始化。 */
export default function StartPage() {
  const { t } = useI18n();
  return (
    <div className='page-host items-center justify-center gap-5 overflow-auto p-6'>
      <h2 className='text-xl font-semibold'>{t('start.title')}</h2>
      <p className='max-w-md text-center text-sm'>{t('start.description')}</p>
      <div className='flex flex-wrap justify-center gap-3'>
        <Link className='btn btn-primary' to='/entities'>
          {t('start.open')}
        </Link>
        <Link className='btn btn-outline' to='/backup'>
          {t('start.restore')}
        </Link>
      </div>
      <p className='max-w-md text-center text-sm opacity-70'>{t('start.warning')}</p>
    </div>
  );
}
