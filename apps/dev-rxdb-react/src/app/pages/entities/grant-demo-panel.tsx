import { useI18n } from '@aiao/rxdb-i18n-react';
import { useRxDB } from '@aiao/rxdb-react';
import { useEffect, useState } from 'react';
import { describeSnapshot, grantPreset, seedScopedRows, type GrantDemoTarget, type GrantPreset } from './grant-demo';

/** {@link GrantDemoPanel} 的属性 */
export interface GrantDemoPanelProps {
  /** 声明了 `access.scope` 的实体与它的作用域 */
  readonly target: GrantDemoTarget;
}

/**
 * 授权快照演示面板（US-029）：出在演示实体 `TenantNote` 的列表上方
 *
 * 状态文字随 `rxdb.grants.snapshot$` 变化；三个按钮见 `grant-demo.ts`。
 */
export function GrantDemoPanel({ target }: GrantDemoPanelProps): React.JSX.Element {
  const { t } = useI18n();
  const rxdb = useRxDB();
  const [snapshot, setSnapshot] = useState(() => rxdb.grants.snapshot);
  useEffect(() => {
    const subscription = rxdb.grants.snapshot$.subscribe(setSnapshot);
    return () => subscription.unsubscribe();
  }, [rxdb]);

  const status = describeSnapshot(snapshot);
  const apply = (preset: GrantPreset): Promise<void> => rxdb.grants.set(grantPreset(preset, target.scope));

  return (
    <section
      aria-label={t('page.entity.grantDemo.title')}
      className='border-base-300 bg-base-200 flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2 text-sm'
      data-testid='grant-demo'
    >
      <span className='font-medium'>{t('page.entity.grantDemo.title')}</span>
      <span className='text-base-content/70 font-mono' data-testid='grant-demo-status'>
        {status.kind === 'message' ? t(status.key) : status.text}
      </span>
      <span className='flex-1' />
      <button className='btn btn-xs' onClick={() => void seedScopedRows(rxdb, target)} type='button'>
        {t('page.entity.grantDemo.seed')}
      </button>
      <button className='btn btn-xs' onClick={() => void apply('a-editable')} type='button'>
        {t('page.entity.grantDemo.grantA')}
      </button>
      <button className='btn btn-xs' onClick={() => void apply('a-revoked')} type='button'>
        {t('page.entity.grantDemo.revokeA')}
      </button>
    </section>
  );
}
