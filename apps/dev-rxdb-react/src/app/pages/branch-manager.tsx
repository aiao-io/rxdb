import { MergeStrategy, RxDBBranch, RxDBChange } from '@aiao/rxdb';
import { useFindAll, useRxDB } from '@aiao/rxdb-react';
import { Todo } from '@aiao/rxdb-test/entities';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  AlertCircle,
  Check,
  ChevronRight,
  CircleDot,
  GitBranch,
  GitMerge,
  Plus,
  RefreshCw,
  Trash2
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAutoDismissedState, useResettableTimeout } from '../hooks/useResettableTimeout';
import { getErrorMessage } from '../utils/error';

interface MergeDialogState {
  sourceBranchId: string;
  strategy: MergeStrategy;
  deleteSource: boolean;
}

interface ToastState {
  type: 'success' | 'error';
  message: string;
}

const CHANGE_ITEM_SIZE = 68;
const CHANGE_PAGE_SIZE = 50;

function formatChangePatch(change: RxDBChange): string {
  const MAX = 200;
  let text: string;
  if (change.type === 'INSERT') {
    text = change.patch ? JSON.stringify(change.patch) : '';
  } else if (change.type === 'DELETE') {
    text = change.inversePatch ? JSON.stringify(change.inversePatch) : '';
  } else {
    const ip = (change.inversePatch ?? {}) as Record<string, unknown>;
    const p = (change.patch ?? {}) as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(ip), ...Object.keys(p)])];
    text = keys.map(k => `${k}: ${JSON.stringify(ip[k])} → ${JSON.stringify(p[k])}`).join(', ');
  }
  return text.length > MAX ? text.slice(0, MAX) + '…' : text;
}

function formatChangeTooltip(change: RxDBChange): string {
  if (change.type === 'UPDATE') {
    return `patch: ${JSON.stringify(change.patch, null, 2)}\ninversePatch: ${JSON.stringify(change.inversePatch, null, 2)}`;
  }
  if (change.type === 'INSERT') return `patch: ${JSON.stringify(change.patch, null, 2)}`;
  return `inversePatch: ${JSON.stringify(change.inversePatch, null, 2)}`;
}

export default function BranchManagerPage() {
  const rxdb = useRxDB();

  // ── 状态 ──
  const [busy, setBusy] = useState(false);
  const [showCreatePopover, setShowCreatePopover] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'active' | 'stale'>('all');
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [branchChanges, setBranchChanges] = useState<RxDBChange[]>([]);
  const [loadingChanges, setLoadingChanges] = useState(false);
  const [hasMoreChanges, setHasMoreChanges] = useState(true);
  const [mergeDialog, setMergeDialog] = useState<MergeDialogState | null>(null);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const { value: toast, show: showTimedToast } = useAutoDismissedState<ToastState>(3000);
  const { schedule: scheduleCreateFocus } = useResettableTimeout();

  const changeCursorRef = useRef<number | null>(null);
  const selectedBranchIdRef = useRef<string | null>(null);
  const changesRequestIdRef = useRef(0);
  const loadingBranchRef = useRef<string | null>(null);
  const createInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // ── 数据 ──
  const branchesResource = useFindAll(RxDBBranch, {
    where: { combinator: 'and', rules: [] },
    orderBy: [{ field: 'createdAt', sort: 'asc' }]
  });
  // P2-4：见 AppBranchManager 中的同名说明。
  const branches = branchesResource.value;
  const activeBranch = useMemo(() => branches.find(b => b.activated)?.id ?? '', [branches]);

  const filteredBranches = useMemo(() => {
    if (filterTab === 'active') return branches.filter(b => b.activated);
    if (filterTab === 'stale') return branches.filter(b => !b.activated);
    return branches;
  }, [branches, filterTab]);

  const selectedBranchIsActive = selectedBranchId === activeBranch;

  // ── 虚拟滚动 ──
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual returns non-memoizable callbacks by design
  const virtualizer = useVirtualizer({
    count: branchChanges.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => CHANGE_ITEM_SIZE,
    overscan: 10
  });

  // ── Popover 自动聚焦 ──
  useEffect(() => {
    if (showCreatePopover) {
      scheduleCreateFocus(() => createInputRef.current?.focus(), 0);
    }
  }, [scheduleCreateFocus, showCreatePopover]);

  // ── Toast ──
  const showToast = useCallback(
    (type: 'success' | 'error', message: string) => {
      showTimedToast({ type, message });
    },
    [showTimedToast]
  );

  // ── 变更加载 ──
  const loadBranchChanges = useCallback(
    async (branchId: string | null, reset: boolean) => {
      if (!branchId || (!reset && loadingBranchRef.current === branchId) || (!reset && !hasMoreChanges)) return;

      const requestId = ++changesRequestIdRef.current;
      const cursor = reset ? null : changeCursorRef.current;
      if (reset) {
        changeCursorRef.current = null;
        setBranchChanges([]);
        setHasMoreChanges(true);
      }
      loadingBranchRef.current = branchId;
      setLoadingChanges(true);

      try {
        const { changeRepository } = await rxdb.versionManager.getLocalRepositories();
        const branch = branches.find(item => item.id === branchId);
        const changes = await changeRepository.find({
          where: {
            combinator: 'and',
            rules: [
              { field: 'branchId', operator: '=', value: branchId },
              ...(branch?.fromChangeId != null ?
                [{ field: 'id' as const, operator: '>' as const, value: branch.fromChangeId }]
              : []),
              ...(cursor != null ? [{ field: 'id' as const, operator: '<' as const, value: cursor }] : [])
            ]
          },
          orderBy: [{ field: 'id', sort: 'desc' }],
          limit: CHANGE_PAGE_SIZE
        });

        if (selectedBranchIdRef.current !== branchId || changesRequestIdRef.current !== requestId) return;
        setBranchChanges(previous => (reset ? changes : [...previous, ...changes]));
        setHasMoreChanges(changes.length === CHANGE_PAGE_SIZE);
        if (changes.length > 0) changeCursorRef.current = changes.at(-1)?.id ?? null;
      } finally {
        if (changesRequestIdRef.current === requestId) {
          loadingBranchRef.current = null;
          setLoadingChanges(false);
        }
      }
    },
    [rxdb, branches, hasMoreChanges]
  );

  // ── 无限滚动 ──
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || !selectedBranchId) return;
    const handleScroll = () => {
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 400) {
        loadBranchChanges(selectedBranchId, false);
      }
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [selectedBranchId, loadBranchChanges]);

  // ── 分支操作 ──
  const selectBranch = (id: string) => {
    selectedBranchIdRef.current = id;
    changesRequestIdRef.current += 1;
    loadingBranchRef.current = null;
    setSelectedBranchId(id);
    setLoadingChanges(false);
    void loadBranchChanges(id, true);
  };

  const refreshChanges = () => loadBranchChanges(selectedBranchId, true);

  const toggleCreatePopover = () => {
    if (showCreatePopover) {
      setShowCreatePopover(false);
    } else {
      setNewBranchName('');
      setShowCreatePopover(true);
    }
  };

  const createBranch = async () => {
    const name = newBranchName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await rxdb.versionManager.createBranch(name);
      setNewBranchName('');
      setShowCreatePopover(false);
      showToast('success', `分支 "${name}" 创建成功`);
    } catch (error: unknown) {
      showToast('error', getErrorMessage(error, '创建失败'));
    } finally {
      setBusy(false);
    }
  };

  const switchBranch = async (branchId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setBusy(true);
    try {
      await rxdb.versionManager.switchBranch(branchId);
      showToast('success', `已切换到分支 "${branchId}"`);
      selectBranch(branchId);
    } catch (error: unknown) {
      showToast('error', getErrorMessage(error, '切换失败'));
    } finally {
      setBusy(false);
    }
  };

  const deleteBranch = async (branchId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!window.confirm(`确定要删除分支 "${branchId}" 吗？`)) return;
    setBusy(true);
    try {
      await rxdb.versionManager.removeBranch(branchId);
      if (selectedBranchId === branchId) {
        selectedBranchIdRef.current = null;
        changesRequestIdRef.current += 1;
        setSelectedBranchId(null);
        setBranchChanges([]);
      }
      showToast('success', `分支 "${branchId}" 已删除`);
    } catch (error: unknown) {
      showToast('error', getErrorMessage(error, '删除失败'));
    } finally {
      setBusy(false);
    }
  };

  // ── 合并 ──
  const openMergeDialog = (sourceBranchId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setMergeError(null);
    setMergeDialog({ sourceBranchId, strategy: 'squash', deleteSource: false });
  };

  const closeMergeDialog = () => {
    setMergeDialog(null);
    setMergeError(null);
  };

  const executeMerge = async () => {
    if (!mergeDialog) return;
    setBusy(true);
    setMergeError(null);
    try {
      const result = await rxdb.versionManager.mergeBranch(mergeDialog.sourceBranchId, {
        strategy: mergeDialog.strategy,
        deleteSource: mergeDialog.deleteSource
      });
      closeMergeDialog();
      showToast(
        'success',
        `合并完成：${result.merged} 条变更已应用到 ${activeBranch}` + (result.sourceDeleted ? `，源分支已删除` : '')
      );
      const selectedSourceWasDeleted = result.sourceDeleted && selectedBranchId === mergeDialog.sourceBranchId;
      if (selectedSourceWasDeleted) {
        selectedBranchIdRef.current = null;
        changesRequestIdRef.current += 1;
        setSelectedBranchId(null);
        setBranchChanges([]);
      } else if (selectedBranchId) {
        await loadBranchChanges(selectedBranchId, true);
      }
    } catch (error: unknown) {
      setMergeError(getErrorMessage(error, '合并失败'));
    } finally {
      setBusy(false);
    }
  };

  // ── 示例数据 ──
  const addSampleTodo = async () => {
    setBusy(true);
    try {
      const titles = [
        'Fix bug in login flow',
        'Add unit tests for merge_branch',
        'Update README docs',
        'Refactor query builder',
        'Improve error messages',
        'Add dark mode support',
        'Performance optimizations'
      ];
      const title = titles[Math.floor(Math.random() * titles.length)];
      const todo = new Todo({ title });
      await todo.save();
      showToast('success', `已添加 Todo：${title}`);
      if (selectedBranchId === activeBranch) {
        await loadBranchChanges(selectedBranchId, true);
      }
    } catch (error: unknown) {
      showToast('error', getErrorMessage(error, '添加失败'));
    } finally {
      setBusy(false);
    }
  };

  const filterTabs = [
    { key: 'all' as const, label: '全部' },
    { key: 'active' as const, label: '当前分支' },
    { key: 'stale' as const, label: '其他分支' }
  ];

  return (
    <div className='flex h-full flex-col overflow-hidden'>
      {/* ▸ 顶部标题栏 */}
      <div className='border-base-300 flex shrink-0 items-center justify-between border-b px-4 py-3'>
        <div className='flex items-center gap-2'>
          <GitBranch className='text-primary' size={20} />
          <h1 className='text-lg font-semibold'>分支管理</h1>
          <span className='badge badge-ghost badge-sm'>{branches.length} 个分支</span>
        </div>
        <div className='flex items-center gap-2'>
          <button className='btn btn-ghost btn-sm gap-1' disabled={busy} onClick={addSampleTodo}>
            <Plus size={14} />
            添加 Todo 变更
          </button>
          <div className='relative'>
            <button className='btn btn-primary btn-sm gap-1' disabled={busy} onClick={toggleCreatePopover}>
              <GitBranch size={14} />
              新建分支
            </button>
            {showCreatePopover && (
              <>
                <div className='fixed inset-0 z-40' onClick={() => setShowCreatePopover(false)} />
                <div className='bg-base-100 border-base-300 absolute top-full right-0 z-50 mt-2 rounded-lg border p-3 shadow-xl'>
                  <div className='flex flex-col gap-2'>
                    <div className='text-xs font-medium'>
                      创建新分支 <span className='text-base-content/40'>（基于 {activeBranch}）</span>
                    </div>
                    <input
                      ref={createInputRef}
                      className='input input-sm input-bordered w-56'
                      placeholder='feature/my-feature'
                      type='text'
                      value={newBranchName}
                      onChange={e => setNewBranchName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') createBranch();
                        if (e.key === 'Escape') setShowCreatePopover(false);
                      }}
                    />
                    <div className='flex justify-end gap-2'>
                      <button className='btn btn-ghost btn-sm' onClick={() => setShowCreatePopover(false)}>
                        取消
                      </button>
                      <button
                        className='btn btn-primary btn-sm'
                        disabled={!newBranchName.trim() || busy}
                        onClick={createBranch}
                      >
                        创建
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ▸ 主体（两栏） */}
      <div className='flex min-h-0 flex-1 overflow-hidden'>
        {/* ══ 左栏：分支列表 ══ */}
        <div className='border-base-300 flex w-72 shrink-0 flex-col overflow-hidden border-r'>
          {/* 分类 Tab */}
          <div className='border-base-300 flex shrink-0 border-b'>
            {filterTabs.map(tab => (
              <button
                key={tab.key}
                className={`flex-1 py-2 text-xs font-medium transition-colors ${
                  filterTab === tab.key ? 'border-primary text-primary border-b-2' : ''
                }`}
                onClick={() => setFilterTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* 分支列表 */}
          <ul className='flex-1 overflow-y-auto py-1'>
            {filteredBranches.map(branch => (
              <li
                key={branch.id}
                className={`hover:bg-base-200 cursor-pointer border-b border-transparent px-3 py-2.5 transition-colors ${
                  selectedBranchId === branch.id ? 'bg-base-200 border-base-300' : ''
                }`}
                role='button'
                tabIndex={0}
                onClick={() => selectBranch(branch.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') selectBranch(branch.id);
                }}
              >
                <div className='flex items-start justify-between gap-1'>
                  <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
                    <div className='flex items-center gap-1.5'>
                      {branch.activated ?
                        <CircleDot className='text-success shrink-0' size={12} />
                      : <GitBranch className='text-base-content/40 shrink-0' size={12} />}
                      <span
                        className={`min-w-0 truncate text-sm font-medium ${branch.activated ? 'text-success' : ''}`}
                        title={branch.id}
                      >
                        {branch.id}
                      </span>
                    </div>
                    {branch.parentId && (
                      <div className='text-base-content/50 ml-4 flex items-center gap-0.5 text-xs'>
                        <ChevronRight size={10} />
                        <span>来自 {branch.parentId}</span>
                      </div>
                    )}
                  </div>
                  {branch.activated && <span className='badge badge-success badge-xs shrink-0'>当前</span>}
                </div>

                {/* 操作按钮行 */}
                {selectedBranchId === branch.id && !branch.activated && (
                  <div className='mt-2 flex flex-wrap gap-1.5'>
                    <button
                      className='btn btn-xs btn-outline btn-primary'
                      disabled={busy}
                      onClick={e => switchBranch(branch.id, e)}
                    >
                      切换
                    </button>
                    <button
                      className='btn btn-xs btn-outline btn-success gap-1'
                      disabled={busy}
                      onClick={e => openMergeDialog(branch.id, e)}
                    >
                      <GitMerge size={11} />
                      合并到 {activeBranch}
                    </button>
                    <button
                      className='btn btn-xs btn-outline btn-error gap-1'
                      disabled={busy}
                      onClick={e => deleteBranch(branch.id, e)}
                    >
                      <Trash2 size={11} />
                      删除
                    </button>
                  </div>
                )}
              </li>
            ))}
            {filteredBranches.length === 0 && (
              <li className='text-base-content/40 px-4 py-8 text-center text-sm'>暂无分支</li>
            )}
          </ul>
        </div>

        {/* ══ 右栏：变更记录 ══ */}
        <div className='flex min-w-0 flex-1 flex-col overflow-hidden'>
          {selectedBranchId ?
            <>
              {/* 变更列表头 */}
              <div className='border-base-300 flex shrink-0 items-center justify-between border-b px-4 py-2.5'>
                <div className='flex items-center gap-2'>
                  <GitBranch className='text-primary' size={16} />
                  <span className='font-medium'>{selectedBranchId}</span>
                  {selectedBranchIsActive && <span className='badge badge-success badge-sm'>当前分支</span>}
                </div>
                <div className='flex items-center gap-2'>
                  <span className='text-base-content/50 text-xs'>
                    {branchChanges.length} 条{hasMoreChanges ? '+' : ''}
                  </span>
                  <button
                    className='btn btn-ghost btn-xs btn-circle'
                    disabled={loadingChanges}
                    title='刷新'
                    onClick={refreshChanges}
                  >
                    <RefreshCw className={loadingChanges ? 'animate-spin' : ''} size={13} />
                  </button>
                </div>
              </div>

              {/* 变更列表（虚拟滚动） */}
              <div ref={scrollContainerRef} className='flex-1 overflow-auto'>
                {!loadingChanges && branchChanges.length === 0 ?
                  <div className='flex flex-col items-center gap-2 p-12 text-center'>
                    <Check className='text-base-content/20' size={32} />
                    <p className='text-base-content/50 text-sm'>此分支无变更记录</p>
                    <p className='text-base-content/30 text-xs'>
                      {selectedBranchIsActive ?
                        '点击「添加 Todo 变更」来创建一些变更'
                      : '切换到此分支后添加数据即可产生变更'}
                    </p>
                  </div>
                : <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}>
                    <ul>
                      {virtualizer.getVirtualItems().map(virtualRow => {
                        const change = branchChanges[virtualRow.index];
                        return (
                          <li
                            key={change.id}
                            className='border-base-300 hover:bg-base-200 absolute flex w-full flex-col justify-center gap-0.5 border-b px-4 transition-colors'
                            style={{
                              height: `${CHANGE_ITEM_SIZE}px`,
                              transform: `translateY(${virtualRow.start}px)`
                            }}
                            title={formatChangeTooltip(change)}
                          >
                            <div className='flex items-center gap-3'>
                              <div className='w-16 shrink-0'>
                                {change.type === 'INSERT' && (
                                  <span className='badge badge-success badge-sm'>INSERT</span>
                                )}
                                {change.type === 'UPDATE' && (
                                  <span className='badge badge-warning badge-sm'>UPDATE</span>
                                )}
                                {change.type === 'DELETE' && <span className='badge badge-error badge-sm'>DELETE</span>}
                              </div>
                              <div className='flex min-w-0 flex-1 items-center gap-2'>
                                <span className='text-sm font-medium'>{change.entity}</span>
                                <span className='text-base-content/40 font-mono text-xs'>#{change.entityId}</span>
                                {change.revertChangeId && (
                                  <span className='badge badge-ghost badge-xs shrink-0'>已撤销</span>
                                )}
                              </div>
                              <div className='text-base-content/30 shrink-0 font-mono text-xs'>#{change.id}</div>
                            </div>
                            <div className='text-base-content/40 ml-[76px] truncate font-mono text-xs leading-none'>
                              {formatChangePatch(change)}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                }

                {loadingChanges && (
                  <div className='flex justify-center py-4'>
                    <span className='loading loading-spinner loading-sm' />
                  </div>
                )}
                {!hasMoreChanges && branchChanges.length > 0 && (
                  <div className='text-base-content/30 py-4 text-center text-xs'>
                    已加载全部 {branchChanges.length} 条变更
                  </div>
                )}
              </div>
            </>
          : <div className='flex flex-1 flex-col items-center justify-center gap-3 p-12 text-center'>
              <GitBranch className='text-base-content/15' size={48} />
              <p className='text-base-content/50'>选择一个分支查看变更记录</p>
            </div>
          }
        </div>
      </div>

      {/* ═══════ 合并对话框 ═══════ */}
      {mergeDialog && (
        <div
          className='fixed inset-0 z-50 flex items-center justify-center bg-black/50'
          role='button'
          tabIndex={0}
          onClick={closeMergeDialog}
          onKeyDown={e => {
            if (e.key === 'Escape') closeMergeDialog();
          }}
        >
          <div
            className='bg-base-100 w-full max-w-md rounded-xl p-6 shadow-2xl'
            role='dialog'
            aria-modal='true'
            onClick={e => e.stopPropagation()}
            onKeyDown={e => e.stopPropagation()}
          >
            <div className='mb-4 flex items-center gap-2'>
              <GitMerge className='text-success' size={20} />
              <h2 className='text-lg font-semibold'>合并分支</h2>
            </div>

            {/* 合并路径 */}
            <div className='bg-base-200 mb-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm'>
              <span className='font-mono font-medium text-orange-500'>{mergeDialog.sourceBranchId}</span>
              <ChevronRight className='text-base-content/50' size={14} />
              <span className='font-mono font-medium text-green-600'>{activeBranch}</span>
            </div>

            {/* 合并策略 */}
            <div className='mb-4'>
              <span className='mb-1.5 block text-sm font-medium'>合并策略</span>
              <div className='flex gap-2'>
                <button
                  className={`flex-1 rounded-lg border px-3 py-2 text-left text-sm transition ${
                    mergeDialog.strategy === 'squash' ? 'bg-primary/10 border-primary' : 'border-base-300'
                  }`}
                  onClick={() => setMergeDialog({ ...mergeDialog, strategy: 'squash' })}
                >
                  <div className='font-medium'>Squash</div>
                  <div className='text-base-content/50 mt-0.5 text-xs'>压缩为最小变更集，过滤幽灵操作</div>
                </button>
                <button
                  className={`flex-1 rounded-lg border px-3 py-2 text-left text-sm transition ${
                    mergeDialog.strategy === 'normal' ? 'bg-primary/10 border-primary' : 'border-base-300'
                  }`}
                  onClick={() => setMergeDialog({ ...mergeDialog, strategy: 'normal' })}
                >
                  <div className='font-medium'>Normal</div>
                  <div className='text-base-content/50 mt-0.5 text-xs'>逐条应用，保留每条独立变更记录</div>
                </button>
              </div>
            </div>

            {/* 删除源分支 */}
            <label className='mb-6 flex cursor-pointer items-center gap-3'>
              <input
                className='checkbox checkbox-sm'
                type='checkbox'
                checked={mergeDialog.deleteSource}
                onChange={e => setMergeDialog({ ...mergeDialog, deleteSource: e.target.checked })}
              />
              <span className='text-sm'>
                合并后删除源分支 <code className='text-xs opacity-70'>{mergeDialog.sourceBranchId}</code>
              </span>
            </label>

            {/* 错误信息 */}
            {mergeError && (
              <div className='alert alert-error mb-4 py-2 text-sm'>
                <AlertCircle size={16} />
                {mergeError}
              </div>
            )}

            <div className='flex justify-end gap-2'>
              <button className='btn btn-ghost btn-sm' disabled={busy} onClick={closeMergeDialog}>
                取消
              </button>
              <button className='btn btn-success btn-sm gap-1' disabled={busy} onClick={executeMerge}>
                {busy ?
                  <span className='loading loading-spinner loading-xs' />
                : <GitMerge size={14} />}
                确认合并
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className='toast toast-top toast-end z-50'>
          <div className={`alert text-sm ${toast.type === 'error' ? 'alert-error' : 'alert-success'}`}>
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
