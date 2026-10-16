import type { RxDB } from '@aiao/rxdb';
import { EntityList } from '@aiao/rxdb-model-react';
import type { WorktreeView } from '@aiao/rxdb-plugin-working-tree';
import { RxDBProvider } from '@aiao/rxdb-react';
import { Eye } from 'lucide-react';
import { useMemo, useState } from 'react';
import { readOnlyCatalog } from '../utils/read-only-checkout';
import { WorkingTreeDialogShell } from './DialogShell';

/** 只读检出位查看器的状态；页面持有，本组件只做展示。 */
export interface ReadOnlyViewerState {
  readonly view: WorktreeView;
  /** 横幅里的检出目标，见 `readOnlyTargetLabel` */
  readonly label: string;
}

interface WorkingTreeReadOnlyViewerProps {
  readonly viewer: ReadOnlyViewerState | null;
  /** 主实例：「不随版本」按它的实体元数据判 */
  readonly mainRxdb: RxDB;
  /** 正在刷新：按钮置灰，连点不会叠出第二个检出位 */
  readonly refreshing: boolean;
  readonly onRefreshRequested: () => void;
  readonly onCloseRequested: () => void;
}

/**
 * 只读检出位查看器（US-313）：不切换分支，以只读方式浏览另一条分支或一个提交的完整数据。
 *
 * @remarks
 * 视图的 `rxdb` 是第二个只读实例，交给嵌套的 `RxDBProvider`，里面的实体列表照常查询；
 * 只读实例上列表不出新建、编辑与删除。左栏只列复制进快照的实体，主实例上不记变更日志的标「不随版本」：
 * 它们在快照里是此刻的内容，不随检出的分支或提交。
 */
export function WorkingTreeReadOnlyViewer({
  viewer,
  ...rest
}: WorkingTreeReadOnlyViewerProps): React.JSX.Element | null {
  if (viewer === null) return null;
  return <ReadOnlyViewerPanel viewer={viewer} {...rest} />;
}

function ReadOnlyViewerPanel({
  mainRxdb,
  onCloseRequested,
  onRefreshRequested,
  refreshing,
  viewer
}: Omit<WorkingTreeReadOnlyViewerProps, 'viewer'> & { readonly viewer: ReadOnlyViewerState }): React.JSX.Element {
  const { label, view } = viewer;
  const catalog = useMemo(() => readOnlyCatalog(view.rxdb.config.entities, mainRxdb.config.entities), [mainRxdb, view]);
  // 刷新换了视图也留着选中的实体：快照的实体集合跟主实例走，刷新前后是同一份
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = catalog.find(entry => entry.key === selectedKey) ?? catalog[0];

  return (
    <WorkingTreeDialogShell
      labelledBy='wt-readonly-title'
      onCloseRequested={onCloseRequested}
      size='wide'
      testId='wt-readonly-dialog'
    >
      <div className='mb-3 flex items-center gap-2'>
        <Eye className='text-[var(--gd-accent)]' aria-hidden='true' size={18} />
        <h2 className='text-[15px] font-semibold' id='wt-readonly-title'>
          Read-only checkout
        </h2>
      </div>

      <div className='gd-warn-strip mb-3' data-testid='wt-readonly-banner' role='status'>
        Viewing <span className='font-mono'>{label}</span> read-only, as it was when opened. Creating, editing and
        deleting are disabled.
      </div>

      <div className='flex h-[60dvh] min-h-0 gap-3 max-md:flex-col'>
        <nav
          aria-label='Entities in this checkout'
          className='w-52 shrink-0 overflow-y-auto rounded border border-[var(--gd-border)] max-md:h-32 max-md:w-full'
          data-testid='wt-readonly-catalog'
        >
          <ul className='py-1'>
            {catalog.map(entry => (
              <li key={entry.key}>
                <button
                  aria-current={entry.key === selected?.key ? 'true' : undefined}
                  className={`gd-row flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${entry.key === selected?.key ? 'gd-row-selected' : ''}`}
                  data-entity-key={entry.key}
                  data-testid='wt-readonly-entity'
                  onClick={() => setSelectedKey(entry.key)}
                  type='button'
                >
                  <span className='min-w-0 flex-1 truncate'>{entry.displayName}</span>
                  {entry.unversioned && (
                    <span
                      className='badge badge-ghost badge-xs shrink-0'
                      data-testid='wt-readonly-unversioned'
                      title='Shows the current content, not the version being viewed'
                    >
                      不随版本
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className='min-h-0 min-w-0 flex-1' data-testid='wt-readonly-list'>
          {/* 按视图 id 重建：刷新换了一个只读实例，旧实例上的订阅不能沿用 */}
          <RxDBProvider db={view.rxdb} key={view.id}>
            {selected !== undefined && (
              <EntityList key={selected.key} name={selected.name} namespace={selected.namespace} />
            )}
          </RxDBProvider>
        </div>
      </div>

      <div className='mt-4 flex justify-end gap-2'>
        <button
          className='gd-btn-secondary'
          data-testid='wt-readonly-refresh'
          disabled={refreshing}
          onClick={onRefreshRequested}
          type='button'
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
        <button className='gd-btn-secondary' data-testid='wt-readonly-close' onClick={onCloseRequested} type='button'>
          Close
        </button>
      </div>
    </WorkingTreeDialogShell>
  );
}
