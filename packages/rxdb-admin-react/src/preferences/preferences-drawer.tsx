import type { DrawerRow, PreferenceTab } from '@aiao/rxdb-admin';
import { X } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useAdminShell, useAdminStore, useAdminText } from '../context.js';
import { closeOnBackdrop, useModalDialog } from '../use-dialog.js';
import { RowControl, STACKED_KINDS } from './controls.js';

function Row({ row }: { row: DrawerRow }): ReactElement {
  const stacked = STACKED_KINDS.has(row.control.kind);
  const labelled = row.control.kind !== 'widgets' && row.control.kind !== 'shortcuts';
  return (
    <div className='admin-row' data-disabled={!row.enabled} data-stacked={stacked} data-testid={`pref-row-${row.path}`}>
      <div>
        {labelled && (
          <label className={row.labelHidden ? 'admin-sr-only' : 'admin-row-label'} htmlFor={`prefs-${row.id}`}>
            {row.label}
          </label>
        )}
        {row.hint && <p className='admin-row-hint'>{row.hint}</p>}
      </div>
      <RowControl row={row} />
    </div>
  );
}

function ImportPanel({ onDone }: { onDone: () => void }): ReactElement {
  const shell = useAdminShell();
  const t = useAdminText();
  const [text, setText] = useState('');
  const [error, setError] = useState(false);
  return (
    <div className='flex flex-col gap-2' data-testid='pref-import-panel'>
      <textarea
        className='textarea textarea-sm h-28 w-full font-mono'
        value={text}
        placeholder={t('prefs.import.placeholder')}
        aria-label={t('prefs.import')}
        data-testid='pref-import-text'
        onChange={event => {
          setText(event.target.value);
          setError(false);
        }}
      />
      {error && (
        <p role='alert' className='text-error text-sm'>
          {t('prefs.import.invalid')}
        </p>
      )}
      <div className='flex justify-end gap-2'>
        <button type='button' className='btn btn-ghost btn-sm' onClick={onDone}>
          {t('prefs.import.cancel')}
        </button>
        <button
          type='button'
          className='btn btn-primary btn-sm'
          data-testid='pref-import-apply'
          onClick={() => (shell.preferences.importJson(text).ok ? onDone() : setError(true))}
        >
          {t('prefs.import.apply')}
        </button>
      </div>
    </div>
  );
}

/**
 * 偏好抽屉：由 schema 驱动的五个页签，页脚提供重置 / 复制 / 导入配置。
 * 以原生模态 `<dialog>` 呈现，焦点陷阱、Esc 与背景惰性由浏览器负责。
 * @returns 抽屉元素。
 */
export function PreferencesDrawer(): ReactElement {
  const shell = useAdminShell();
  const t = useAdminText();
  const ui = useAdminStore(shell.ui);
  const tabs = useAdminStore(shell.drawer);
  const hasDiff = useAdminStore(shell.preferences.hasDiff);
  const [active, setActive] = useState<PreferenceTab>('appearance');
  const [importing, setImporting] = useState(false);
  const [copyState, setCopyState] = useState<'copy' | 'copied' | 'copyFailed'>('copy');
  const close = (): void => shell.ui.setPreferencesOpen(false);
  const ref = useModalDialog(ui.preferencesOpen, close);
  const current = tabs.find(tab => tab.id === active) ?? tabs[0];

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(shell.preferences.exportJson());
      setCopyState('copied');
    } catch {
      setCopyState('copyFailed');
    }
    setTimeout(() => setCopyState('copy'), 1500);
  };

  return (
    <dialog
      ref={ref}
      className='admin-drawer'
      aria-labelledby='admin-prefs-title'
      data-testid='admin-preferences'
      onClick={event => closeOnBackdrop(event, close)}
    >
      {ui.preferencesOpen && (
        <>
          <header className='flex items-center justify-between px-5 pt-4'>
            <h2 id='admin-prefs-title' className='text-lg font-semibold'>
              {t('prefs.title')}
            </h2>
            <button
              type='button'
              className='btn btn-ghost btn-sm btn-square'
              aria-label={t('prefs.close')}
              data-testid='pref-close'
              onClick={close}
            >
              <X size={16} />
            </button>
          </header>
          <div role='tablist' className='tabs tabs-border admin-drawer-tabs px-5'>
            {tabs.map(tab => (
              <button
                key={tab.id}
                type='button'
                role='tab'
                id={`prefs-tab-${tab.id}`}
                aria-selected={tab.id === current?.id}
                aria-controls='prefs-panel'
                className={tab.id === current?.id ? 'tab tab-active' : 'tab'}
                data-testid={`pref-tab-${tab.id}`}
                onClick={() => setActive(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div
            id='prefs-panel'
            role='tabpanel'
            aria-labelledby={`prefs-tab-${current?.id}`}
            className='admin-drawer-body'
          >
            {current?.sections.length === 0 && <p className='text-sm opacity-60'>{t('prefs.empty.extension')}</p>}
            {current?.sections.map(section => (
              <section key={section.id} className='admin-section' aria-labelledby={`prefs-section-${section.id}`}>
                <h3 id={`prefs-section-${section.id}`} className='admin-section-title'>
                  {section.title}
                </h3>
                {section.rows.map(row => (
                  <Row key={row.id} row={row} />
                ))}
              </section>
            ))}
          </div>
          <footer className='admin-drawer-footer'>
            {importing ?
              <ImportPanel onDone={() => setImporting(false)} />
            : <>
                <button
                  type='button'
                  className='btn btn-ghost btn-sm'
                  data-testid='pref-reset'
                  onClick={() => shell.preferences.reset()}
                >
                  {t('prefs.reset')}
                  {hasDiff && <span className='admin-reset-dot' aria-hidden='true' data-testid='pref-reset-dot' />}
                </button>
                <span className='flex gap-1'>
                  <button
                    type='button'
                    className='btn btn-ghost btn-sm'
                    data-testid='pref-import'
                    onClick={() => setImporting(true)}
                  >
                    {t('prefs.import')}
                  </button>
                  <button
                    type='button'
                    className='btn btn-ghost btn-sm'
                    data-testid='pref-copy'
                    onClick={() => void copy()}
                  >
                    {t(`prefs.${copyState}`)}
                  </button>
                </span>
              </>
            }
          </footer>
        </>
      )}
    </dialog>
  );
}
