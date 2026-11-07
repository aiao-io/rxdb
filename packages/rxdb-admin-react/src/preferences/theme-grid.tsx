import type { DrawerRow } from '@aiao/rxdb-admin';
import { Monitor } from 'lucide-react';
import type { ReactElement } from 'react';
import { useAdminShell } from '../context.js';

/**
 * 主题网格：每张卡片在自己的 `data-theme` 作用域里预览该主题的配色。
 * @param props - 主题设置行。
 * @returns 网格元素。
 */
export function ThemeGrid({ row }: { row: DrawerRow }): ReactElement {
  const shell = useAdminShell();
  const names = ['system', ...shell.theme.options.map(theme => theme.name)];
  return (
    <div className='admin-theme-grid' role='group' aria-label={row.label}>
      {names.map(name => (
        <button
          key={name}
          type='button'
          className='admin-theme-card'
          data-theme={name === 'system' ? undefined : name}
          aria-pressed={row.value === name}
          data-testid={`pref-theme-${name}`}
          onClick={() => row.set(name)}
        >
          <span className='admin-theme-card-body'>
            <span className='flex items-center gap-1'>
              {name === 'system' && <Monitor size={14} aria-hidden='true' />}
              {shell.theme.label(name)}
            </span>
            <span className='admin-theme-swatches' aria-hidden='true'>
              <i />
              <i />
              <i />
              <i />
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
