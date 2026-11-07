import type { ReactElement } from 'react';
import { useAdminShell, useAdminStore, useAdminText } from '../context.js';

/**
 * 已注册快捷键列表：键帽 + 单独启停（总开关关闭时整体禁用）。
 * @returns 列表元素。
 */
export function ShortcutList(): ReactElement {
  const shell = useAdminShell();
  const t = useAdminText();
  const infos = useAdminStore(shell.shortcuts.list);
  const { shortcuts } = useAdminStore(shell.preferences);
  if (infos.length === 0) return <p className='text-sm opacity-60'>{t('prefs.shortcuts.empty')}</p>;
  return (
    <ul className='flex flex-col gap-1'>
      {infos.map(info => {
        const label = info.labelKey ? t(info.labelKey) : (info.label ?? info.id);
        return (
          <li key={info.id} className='admin-row' data-disabled={!shortcuts.enable}>
            <label htmlFor={`prefs-shortcut-${info.id}`} className='admin-row-label'>
              {label}
            </label>
            <span className='flex items-center gap-3'>
              <span className='flex gap-0.5' aria-hidden='true'>
                {info.keys.map(key => (
                  <kbd key={key} className='kbd kbd-sm'>
                    {key}
                  </kbd>
                ))}
              </span>
              <input
                id={`prefs-shortcut-${info.id}`}
                type='checkbox'
                className='toggle toggle-sm'
                checked={!shortcuts.disabled.includes(info.id)}
                disabled={!shortcuts.enable}
                data-testid={`pref-shortcut-${info.id}`}
                onChange={event => shell.shortcuts.setEnabled(info.id, event.target.checked)}
              />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
