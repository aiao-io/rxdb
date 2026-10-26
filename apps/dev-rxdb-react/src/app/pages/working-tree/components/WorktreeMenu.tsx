import type { WorktreeTableSet } from '@aiao/rxdb';
import type { Worktree } from '@aiao/rxdb-plugin-working-tree';
import { Check, ChevronDown, GitBranch, MoreVertical, Plus, SquareStack } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { isImeComposing } from '../utils/ime';
import { fitToolbarPopup } from '../utils/toolbar-popup';

export interface WorkingTreeWorktreeMenuProps {
  readonly busy?: boolean;
  readonly worktrees: readonly Worktree[];
  readonly mounted: WorktreeTableSet;
  readonly activeBranch: string;
  readonly popupWidth: number;
  readonly menuOpen: boolean;
  readonly onMenuOpenChange: (open: boolean) => void;
  readonly onCreateRequest: () => void;
  readonly onMountRequest: (id: string | null) => void;
  readonly onRenameRequest: (worktree: Worktree) => void;
  readonly onDeleteRequest: (worktree: Worktree) => void;
}

/**
 * 工作树选择器：主检出位与可写链接检出位分组显示。
 *
 * 下拉内联渲染，保证从触发按钮按 Tab 能自然走进列表；链接检出位的操作按钮
 * 直接暴露给键盘用户，主检出位没有改名、删除入口。
 */
export function WorkingTreeWorktreeMenu({
  activeBranch,
  busy,
  menuOpen,
  mounted,
  onCreateRequest,
  onDeleteRequest,
  onMenuOpenChange,
  onMountRequest,
  onRenameRequest,
  popupWidth,
  worktrees
}: WorkingTreeWorktreeMenuProps): React.JSX.Element {
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const popup = popupRef.current;
    if (!popup) return undefined;
    const fit = (): void => fitToolbarPopup(popup);
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [menuOpen, popupWidth]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !isImeComposing(event)) onMenuOpenChange(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onMenuOpenChange]);

  const close = (): void => onMenuOpenChange(false);
  const linked = worktrees.filter(worktree => worktree.mode === 'writable');
  const isCurrent = (worktree: Worktree): boolean => !mounted.isMain && worktree.tableSetSuffix === mounted.suffix;

  return (
    <div className='flex h-full items-stretch'>
      <div className='relative flex-1'>
        <button
          className='gd-toolbar-select'
          aria-controls='wt-worktree-menu-popup'
          aria-expanded={menuOpen}
          aria-haspopup='dialog'
          disabled={busy}
          data-testid='wt-worktree-menu'
          onClick={() => onMenuOpenChange(!menuOpen)}
          type='button'
        >
          <SquareStack size={18} />
          <span className='min-w-0 flex-1 text-left'>
            <small>Worktree</small>
            <strong className='truncate'>
              {mounted.isMain ? 'Main worktree' : (linked.find(isCurrent)?.name ?? '…')}
            </strong>
          </span>
          <ChevronDown
            className='transition-transform'
            size={14}
            style={{ transform: menuOpen ? 'rotate(180deg)' : undefined }}
          />
        </button>

        {menuOpen && (
          <>
            <div
              className='fixed inset-0 z-30'
              style={{ background: 'rgba(0, 0, 0, 0.35)' }}
              aria-label='Close worktree menu'
              onClick={close}
              onKeyDown={event => event.key === 'Escape' && close()}
              role='button'
              tabIndex={0}
            />
            <div
              ref={popupRef}
              className='gd-menu gd-menu-flush absolute top-full left-0 z-40 flex flex-col overflow-y-auto'
              style={{ height: 'calc(100vh - 50px)', width: popupWidth }}
              aria-label='Worktree list'
              data-testid='wt-worktree-menu-popup'
              id='wt-worktree-menu-popup'
              role='dialog'
            >
              <div className='flex items-center justify-between px-3 pt-1 pb-1.5'>
                <span className='text-[11px] font-semibold uppercase' style={{ color: 'var(--gd-muted)' }}>
                  Worktrees
                </span>
                <button
                  className='gd-btn-ghost shrink-0'
                  data-testid='wt-worktree-create'
                  onClick={() => {
                    close();
                    onCreateRequest();
                  }}
                  type='button'
                >
                  <Plus size={12} />
                  New worktree
                </button>
              </div>

              <div className='gd-menu-header'>Main worktree</div>
              <div className='flex items-stretch'>
                <button
                  className='gd-menu-row min-w-0 flex-1'
                  aria-current={mounted.isMain || undefined}
                  data-worktree-id='main'
                  data-testid='wt-worktree-item'
                  onClick={() => {
                    close();
                    if (!mounted.isMain) onMountRequest(null);
                  }}
                  type='button'
                >
                  {mounted.isMain ?
                    <Check className='shrink-0' size={12} style={{ color: 'var(--gd-accent)' }} />
                  : <GitBranch className='shrink-0' size={12} />}
                  <span className='min-w-0 flex-1 truncate text-sm font-medium'>Main worktree</span>
                  <span className='shrink-0 text-xs' style={{ color: 'var(--gd-muted)' }}>
                    {activeBranch || '…'}
                  </span>
                </button>
              </div>

              <div className='gd-menu-header'>Linked worktrees ({linked.length})</div>
              <ul className='min-h-0 flex-1 overflow-y-auto py-1'>
                {linked.map(worktree => {
                  const current = isCurrent(worktree);
                  return (
                    <li key={worktree.id} data-worktree-id={worktree.id}>
                      <div className='flex items-stretch'>
                        <button
                          className='gd-menu-row min-w-0 flex-1'
                          aria-current={current || undefined}
                          data-worktree-id={worktree.id}
                          data-testid='wt-worktree-item'
                          onClick={() => {
                            close();
                            if (!current) onMountRequest(worktree.id);
                          }}
                          type='button'
                        >
                          {current ?
                            <Check className='shrink-0' size={12} style={{ color: 'var(--gd-accent)' }} />
                          : <SquareStack className='shrink-0' size={12} />}
                          <span className='min-w-0 flex-1 truncate text-left text-sm font-medium'>
                            {worktree.name ?? worktree.branchId}
                          </span>
                          <span className='shrink-0 text-xs' style={{ color: 'var(--gd-muted)' }}>
                            {worktree.branchId}
                          </span>
                        </button>
                        <button
                          className='gd-icon-btn'
                          aria-label={`Rename ${worktree.name ?? worktree.branchId}`}
                          data-testid={`wt-worktree-rename-${worktree.id}`}
                          onClick={() => {
                            close();
                            onRenameRequest(worktree);
                          }}
                          title='Rename worktree'
                          type='button'
                        >
                          <MoreVertical size={14} />
                        </button>
                        <button
                          className='gd-icon-btn'
                          aria-label={`Delete ${worktree.name ?? worktree.branchId}`}
                          data-testid={`wt-worktree-delete-${worktree.id}`}
                          onClick={() => {
                            close();
                            onDeleteRequest(worktree);
                          }}
                          title='Delete worktree'
                          type='button'
                        >
                          ×
                        </button>
                      </div>
                    </li>
                  );
                })}
                {linked.length === 0 && (
                  <li className='px-4 py-4 text-center text-sm' style={{ color: 'var(--gd-muted)' }}>
                    No linked worktrees
                  </li>
                )}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
