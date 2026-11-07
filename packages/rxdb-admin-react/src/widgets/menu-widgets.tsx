import { TIMEZONE_REGIONS, buildTimezoneEntries, timeInZone } from '@aiao/rxdb-admin';
import { Check, Clock, Languages } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useAdminShell, useAdminStore, useAdminText } from '../context.js';

const TICK_MS = 30_000;

function blurActive(): void {
  const active = document.activeElement;
  if (active instanceof HTMLElement) active.blur();
}

function localeLabel(locale: string): string {
  return new Intl.DisplayNames([locale], { type: 'language' }).of(locale) ?? locale;
}

/**
 * 语言切换：列出运行时的可用语言，选择后写入偏好。只有一种语言时不渲染。
 * @returns 下拉菜单元素。
 */
export function LanguageWidget(): ReactElement | null {
  const shell = useAdminShell();
  const t = useAdminText();
  const { app } = useAdminStore(shell.preferences);
  const locales = shell.i18n.availableLocales;
  if (locales.length < 2) return null;
  const current = app.locale || shell.i18n.locale;
  return (
    <div className='dropdown dropdown-end'>
      <button
        type='button'
        tabIndex={0}
        className='btn btn-ghost btn-sm btn-square'
        aria-label={t('widget.language')}
        aria-haspopup='menu'
        data-testid='admin-widget-language'
      >
        <Languages size={18} />
      </button>
      <ul tabIndex={0} role='menu' className='dropdown-content menu bg-base-100 rounded-box z-50 w-48 p-2 shadow'>
        {locales.map(locale => (
          <li key={locale}>
            <button
              type='button'
              role='menuitemradio'
              aria-checked={locale === current}
              onClick={() => {
                shell.preferences.setPath('app.locale', locale);
                blurActive();
              }}
            >
              {localeLabel(locale)}
              {locale === current && <Check size={14} />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * 时区切换：按地理分组列出常用时区、各自当前时间与 UTC 偏移。
 * @returns 下拉菜单元素。
 */
export function TimezoneWidget(): ReactElement {
  const shell = useAdminShell();
  const t = useAdminText();
  const current = useAdminStore(shell.timezone);
  const { app } = useAdminStore(shell.preferences);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const entries = useMemo(() => buildTimezoneEntries(now), [now]);
  const currentEntry = entries.find(entry => entry.zone === current);
  const regions = TIMEZONE_REGIONS.map(region => ({ region, items: entries.filter(entry => entry.region === region) }));

  return (
    <div className='dropdown dropdown-end'>
      <button
        type='button'
        tabIndex={0}
        className='btn btn-ghost btn-sm gap-1'
        aria-label={`${t('widget.timezone')}：${currentEntry?.offset ?? current}`}
        aria-haspopup='menu'
        data-testid='admin-widget-timezone'
      >
        <Clock size={16} />
        <span className='admin-widget-text text-xs'>{currentEntry?.offset ?? current}</span>
      </button>
      <div
        tabIndex={0}
        className='dropdown-content bg-base-100 rounded-box admin-popover-list z-50 mt-1 p-2 shadow'
        role='menu'
      >
        <button
          type='button'
          role='menuitemradio'
          aria-checked={app.timezone === ''}
          className='admin-popover-item'
          onClick={() => {
            shell.preferences.setPath('app.timezone', '');
            blurActive();
          }}
        >
          <span>{t('prefs.option.app.timezone.system')}</span>
          {app.timezone === '' && <Check size={14} />}
        </button>
        {regions.map(group => (
          <div key={group.region} role='group' aria-label={t(`timezone.region.${group.region}`)}>
            <div className='admin-popover-group'>{t(`timezone.region.${group.region}`)}</div>
            {group.items.map(entry => (
              <button
                key={entry.zone}
                type='button'
                role='menuitemradio'
                aria-checked={app.timezone === entry.zone}
                className='admin-popover-item'
                onClick={() => {
                  shell.preferences.setPath('app.timezone', entry.zone);
                  blurActive();
                }}
              >
                <span>
                  {entry.city}
                  {app.timezone === entry.zone && <Check size={14} className='ms-1 inline' />}
                </span>
                <span className='text-xs opacity-70'>
                  {timeInZone(entry.zone, now)} · {entry.offset}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
