import { useI18n } from '@aiao/rxdb-i18n-react';
import { Menu } from 'lucide-react';
import { useAppService } from '../hooks/useAppService';
import { DEMO_DATE_OPTIONS, DEMO_FORMAT_DATE, DEMO_FORMAT_NUMBER } from '../rxdb/i18n';

export function AppHeader() {
  const { toggleSidebar } = useAppService();
  const { t, locale, setLocale, formatDate, formatNumber } = useI18n();

  return (
    <div
      className='flex items-center justify-between p-1'
      id='layout-topbar'
      aria-label='Navbar'
      role='navigation'
      style={{ pointerEvents: 'none' }}
    >
      <div className='inline-flex items-center gap-3'>
        <button
          className='btn btn-ghost btn-sm pointer-events-auto md:hidden'
          onClick={toggleSidebar}
          aria-label='Toggle menu'
        >
          <Menu size={20} />
        </button>
      </div>
      <div className='pointer-events-auto inline-flex items-center gap-3'>
        <div className='hidden text-xs sm:block' aria-label={t('preview', undefined, 'demo')}>
          <span data-testid='i18n-formatted-date'>{formatDate(DEMO_FORMAT_DATE, DEMO_DATE_OPTIONS)}</span>
          <span className='mx-2' aria-hidden='true'>
            ·
          </span>
          <span data-testid='i18n-formatted-number'>{formatNumber(DEMO_FORMAT_NUMBER)}</span>
        </div>
        <label className='inline-flex items-center gap-2 text-sm'>
          <span>{t('language', undefined, 'demo')}</span>
          <select
            className='select select-sm w-auto'
            data-testid='i18n-locale'
            value={locale.startsWith('en') ? 'en' : 'zh-Hans'}
            onChange={event => {
              void setLocale(event.target.value);
            }}
          >
            <option value='zh-Hans'>简体中文</option>
            <option value='en'>English</option>
          </select>
        </label>
      </div>
    </div>
  );
}
