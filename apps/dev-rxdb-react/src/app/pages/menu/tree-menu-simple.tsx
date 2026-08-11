import { useFindAll, useRxDB } from '@aiao/rxdb-react';
import { MenuSimple } from '@aiao/rxdb-test/entities';
import {
  ChevronDown,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  GripVertical,
  History,
  Pen,
  Plus,
  Redo2,
  Search,
  Trash2,
  TriangleAlert,
  Undo2,
  X
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { useObservable } from 'react-use';
import { HistorySidebar } from '../../components/HistorySidebar';
import { OperationErrorAlert } from '../../components/OperationErrorAlert';
import { PathConflictWarning } from '../../components/PathConflictWarning';
import { useDragDrop } from '../../hooks/useDragDrop';
import { useMenuRenamePathGuard } from '../../hooks/useRenamePathGuard';
import { useTreeMenuStore } from '../../hooks/useTreeMenuStore';
import { getErrorMessage } from '../../utils/error';
import { generateBatchMenus } from '../../utils/menu-utils';

const MIN_LOADING_MS = 500;

const keepLoadingVisible = () => new Promise<void>(resolve => setTimeout(resolve, MIN_LOADING_MS));

export function TreeMenuSimplePage() {
  const rxdb = useRxDB();
  const menuRepository = useMemo(() => rxdb.entityManager.getRepository(MenuSimple), [rxdb]);
  const [showHistory, setShowHistory] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [loadingActions, setLoadingActions] = useState<Set<string>>(new Set());
  const [editingTitles, setEditingTitles] = useState<Map<string, string>>(new Map());

  // 获取所有菜单数据 - 使用 useFindAll 实现响应式订阅
  const { value: menus } = useFindAll(MenuSimple, {
    where: { combinator: 'and', rules: [] },
    orderBy: [{ field: 'sortOrder', sort: 'asc' }]
  });

  const history = useMemo(() => rxdb.versionManager.history(MenuSimple), [rxdb]);
  const histories = useObservable(history.histories$, []);
  const undoCount = useObservable(history.undoCount$, 0);
  const redoCount = useObservable(history.redoCount$, 0);

  const store = useTreeMenuStore(menus);
  const {
    pathConflict: renamePathConflict,
    rename: renameWithPathGuard,
    clearPathConflict: clearRenamePathConflict
  } = useMenuRenamePathGuard<MenuSimple>();

  // Drag and drop
  const dragDrop = useDragDrop<MenuSimple>(menus);

  // 删除所有菜单
  const handleDeleteAll = useCallback(async () => {
    const actionKey = 'delete-all';
    flushSync(() => {
      setLoadingActions(prev => new Set(prev).add(actionKey));
    });
    try {
      await Promise.all([rxdb.entityManager.removeMany(menus), keepLoadingVisible()]);
    } catch (err) {
      console.error('[TreeMenuSimple] handleDeleteAll failed:', err);
    } finally {
      setLoadingActions(prev => {
        const next = new Set(prev);
        next.delete(actionKey);
        return next;
      });
    }
  }, [rxdb, menus]);

  // 批量添加菜单（带随机层级）
  const handleAddMany = useCallback(
    async (count: number, actionKey: string) => {
      flushSync(() => {
        setLoadingActions(prev => new Set(prev).add(actionKey));
      });
      try {
        const existingRoots = menus
          .filter(m => !m.parentId)
          .sort((a, b) => (a.sortOrder || '').localeCompare(b.sortOrder || ''));

        const newMenus = generateBatchMenus(count, MenuSimple, existingRoots);
        await Promise.all([rxdb.entityManager.saveMany(newMenus), keepLoadingVisible()]);
      } finally {
        setLoadingActions(prev => {
          const next = new Set(prev);
          next.delete(actionKey);
          return next;
        });
      }
    },
    [rxdb, menus]
  );

  // 保存编辑
  const handleSave = useCallback(
    async (menu: MenuSimple) => {
      const nextTitle = editingTitles.get(menu.id);
      if (typeof nextTitle === 'string' && nextTitle !== menu.title) {
        const renamed = await renameWithPathGuard(menu, nextTitle, menus, async (current, value) => {
          await menuRepository.update(current, { title: value });
        });
        if (!renamed) return;
      }
      setEditingTitles(prev => {
        const next = new Map(prev);
        next.delete(menu.id);
        return next;
      });
      store.cancelEdit();
    },
    [editingTitles, menuRepository, store, renameWithPathGuard, menus]
  );

  const handleStartEdit = useCallback(
    (menu: MenuSimple) => {
      setEditingTitles(prev => new Map(prev).set(menu.id, menu.title));
      store.startEdit(menu.id);
    },
    [store]
  );

  const handleCancelEdit = useCallback(
    (menuId: string) => {
      setEditingTitles(prev => {
        const next = new Map(prev);
        next.delete(menuId);
        return next;
      });
      store.cancelEdit();
    },
    [store]
  );

  return (
    <div className='flex h-full w-full'>
      {/* 历史侧边栏 */}
      <HistorySidebar
        show={showHistory}
        histories={histories}
        scopeType={history.type}
        borderSide='right'
        onClose={() => setShowHistory(false)}
      />

      <main className='flex h-full min-w-0 flex-1 flex-col overflow-auto'>
        {/* Header */}
        <div className='border-base-300 bg-base-100 flex-none border-b p-4'>
          <div className='mx-auto flex max-w-4xl flex-col gap-3'>
            {/* Title Bar */}
            <div className='flex items-center justify-between'>
              <div className='flex items-center gap-3'>
                <h1 className='text-2xl font-bold'>Tree Menu - Simple</h1>
                <div className='badge badge-primary' data-testid='menu-count'>
                  {menus.length} 项
                </div>

                {/* 批量添加 */}
                <div className='dropdown dropdown-end'>
                  <button className='btn btn-circle btn-sm' aria-label='批量添加' data-testid='menu-batch-add'>
                    <Plus size={16} />
                  </button>
                  <ul className='dropdown-content menu rounded-box bg-base-100 z-10 w-52 p-2 shadow'>
                    {[
                      { count: 100, label: '添加 100 条' },
                      { count: 1000, label: '添加 1000 条' },
                      { count: 5000, label: '添加 5000 条' },
                      { count: 10000, label: '添加 10000 条' }
                    ].map(({ count, label }) => {
                      const actionKey = `add-${count}`;
                      const isLoading = loadingActions.has(actionKey);
                      return (
                        <li key={actionKey}>
                          <button
                            data-testid={`menu-batch-option-${count}`}
                            disabled={isLoading}
                            onClick={() => handleAddMany(count, actionKey)}
                          >
                            {isLoading && <span className='loading loading-spinner loading-xs'></span>}
                            {label}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>

              <div className='flex items-center gap-2'>
                {/* Undo/Redo */}
                <div className='join'>
                  <button
                    className='btn btn-sm join-item'
                    disabled={undoCount === 0}
                    onClick={() => history.undo()}
                    aria-label='撤销'
                    data-testid='menu-undo'
                  >
                    <Undo2 size={16} />
                    {undoCount > 0 && (
                      <span className='badge badge-xs' data-testid='menu-undo-count'>
                        {undoCount}
                      </span>
                    )}
                  </button>
                  <button
                    className='btn btn-sm join-item'
                    disabled={redoCount === 0}
                    onClick={() => history.redo()}
                    aria-label='重做'
                    data-testid='menu-redo'
                  >
                    <Redo2 size={16} />
                    {redoCount > 0 && (
                      <span className='badge badge-xs' data-testid='menu-redo-count'>
                        {redoCount}
                      </span>
                    )}
                  </button>
                </div>

                {/* History Toggle */}
                <button
                  className={`btn btn-sm ${showHistory ? 'btn-primary' : ''}`}
                  onClick={() => setShowHistory(!showHistory)}
                  aria-label='历史记录'
                  data-testid='menu-history'
                >
                  <History size={16} />
                </button>
              </div>
            </div>

            {/* 统计信息 & 操作栏 */}
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <div className='flex items-center gap-2'>
                <div className='bg-base-100 border-base-200 flex items-center gap-2 rounded-lg border px-3 py-1 shadow-sm'>
                  <span className='text-xs opacity-70'>已展开</span>
                  <span className='font-mono text-lg font-bold' data-testid='menu-expanded-count'>
                    {store.expandedCount}
                  </span>
                </div>
                <button
                  className='btn btn-sm btn-ghost btn-square'
                  title={store.isAllExpanded ? '折叠全部' : '展开全部'}
                  onClick={() => (store.isAllExpanded ? store.collapseAll() : store.expandAll())}
                  data-testid='menu-toggle-all'
                >
                  {store.isAllExpanded ?
                    <ChevronsUp size={20} />
                  : <ChevronsDown size={20} />}
                </button>
              </div>

              <button
                className='btn btn-sm btn-error btn-outline'
                data-testid='menu-delete-all'
                disabled={loadingActions.has('delete-all')}
                onClick={handleDeleteAll}
              >
                {loadingActions.has('delete-all') ?
                  <span className='loading loading-spinner loading-xs'></span>
                : <Trash2 size={16} />}
                删除所有数据
              </button>
            </div>

            {/* 添加菜单 (根/子) */}
            <form
              className='flex gap-2'
              onSubmit={async e => {
                e.preventDefault();
                if (!newTitle.trim()) return;

                if (store.selectedParentId) {
                  const parent = menus.find(m => m.id === store.selectedParentId);
                  if (parent) {
                    await store.addChild(parent, newTitle);
                    setNewTitle('');
                  }
                } else {
                  await store.addRoot(newTitle);
                  setNewTitle('');
                }
              }}
            >
              <div className='join flex-1'>
                {store.selectedParentId && (
                  <div className='join-item bg-base-200 border-base-300 flex items-center border border-r-0 px-3 text-sm'>
                    <span className='mr-1 opacity-70'>父节点:</span>
                    <span className='max-w-[8rem] truncate font-medium'>
                      {menus.find(m => m.id === store.selectedParentId)?.title}
                    </span>
                    <button
                      className='btn btn-ghost btn-xs btn-circle ml-1 h-5 min-h-0 w-5'
                      onClick={() => {
                        store.setSelectedParentId(null);
                        setNewTitle('');
                      }}
                      title='取消选择父节点'
                      type='button'
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
                <input
                  id='menu-title-input'
                  className='input input-sm join-item min-w-0 flex-1'
                  data-testid='menu-title-input'
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder={store.selectedParentId ? '输入子菜单标题...' : '输入根菜单标题...'}
                  type='text'
                />
              </div>
              <button
                className='btn btn-primary btn-sm'
                data-testid={store.selectedParentId ? 'menu-submit-child' : 'menu-add-root'}
                disabled={!newTitle.trim()}
                type='submit'
              >
                <Plus size={16} />
                {store.selectedParentId ? '添加子菜单' : '添加根菜单'}
              </button>
            </form>

            {/* Search Bar */}
            <div className='flex gap-2'>
              <div className='relative flex-1'>
                <Search className='text-base-content/40 absolute top-1/2 left-3 -translate-y-1/2' size={16} />
                <input
                  className='input input-bordered input-sm w-full pl-10'
                  data-testid='menu-search-input'
                  value={store.searchKeyword}
                  onChange={e => store.setSearchKeyword(e.target.value)}
                  placeholder='搜索菜单...'
                  type='text'
                />
              </div>
              {store.searchKeyword && (
                <button
                  className='btn btn-ghost btn-sm'
                  data-testid='menu-clear-search'
                  onClick={() => store.setSearchKeyword('')}
                  type='button'
                >
                  <X size={16} />
                  清除
                </button>
              )}
            </div>
          </div>
        </div>

        <div className='p-6'>
          <div className='mx-auto max-w-4xl space-y-6'>
            <PathConflictWarning
              conflictPath={renamePathConflict?.conflictPath ?? null}
              noun='菜单'
              onClose={clearRenamePathConflict}
            />

            <OperationErrorAlert message={store.deleteError} onClose={store.clearDeleteError} />

            {/* Path Conflict Warning */}
            {store.pathConflict && (
              <div className='alert alert-warning'>
                <TriangleAlert size={20} />
                <div className='flex-1'>
                  <div className='font-semibold'>路径冲突警告</div>
                  <div className='text-sm'>
                    已存在同名菜单：
                    <strong>{store.pathConflict.conflictPath}</strong>
                  </div>
                </div>
                <button className='btn btn-ghost btn-sm btn-circle' onClick={store.clearPathConflict}>
                  <X size={16} />
                </button>
              </div>
            )}

            {/* Tree List */}
            <div className='card bg-base-100 shadow-sm'>
              <div className='card-body p-4'>
                {store.treeNodes.length === 0 ?
                  <div className='hero min-h-40'>
                    <div className='hero-content text-center'>
                      <h1 className='text-sm font-bold'>暂无菜单数据</h1>
                    </div>
                  </div>
                : <div className='space-y-0.5'>
                    {store.treeNodes.map(({ menu, level, isExpanded, hasChildren }) => {
                      const isEditing = store.editingId === menu.id;
                      const isDragging = dragDrop.dragDropState.draggedItemId === menu.id;
                      const isTarget = dragDrop.dragDropState.targetItemId === menu.id;
                      const isHighlighted = dragDrop.highlightedMenuIds.has(menu.id);

                      const classNames = [
                        'group flex items-center gap-2 rounded px-2 py-1 transition-colors',
                        !isDragging && 'hover:bg-base-200',
                        isDragging && 'opacity-50 cursor-move',
                        isTarget && !dragDrop.dragDropState.isValidTarget && 'ring-2 ring-error',
                        isTarget &&
                          dragDrop.dragDropState.isValidTarget &&
                          dragDrop.dragDropState.dropMode === 'before' &&
                          'border-t-2 border-t-primary',
                        isTarget &&
                          dragDrop.dragDropState.isValidTarget &&
                          dragDrop.dragDropState.dropMode === 'after' &&
                          'border-b-2 border-b-primary',
                        isTarget &&
                          dragDrop.dragDropState.isValidTarget &&
                          dragDrop.dragDropState.dropMode === 'into' &&
                          'bg-primary/10 ring-2 ring-primary',
                        isHighlighted && 'bg-warning/20'
                      ]
                        .filter(Boolean)
                        .join(' ');

                      return (
                        <div
                          key={menu.id}
                          className={classNames}
                          data-level={level}
                          data-dragging={isDragging ? 'true' : 'false'}
                          data-drop-mode={isTarget ? dragDrop.dragDropState.dropMode : ''}
                          data-drop-target={isTarget ? 'true' : 'false'}
                          data-drop-valid={isTarget ? String(dragDrop.dragDropState.isValidTarget) : ''}
                          data-menu-id={menu.id}
                          data-parent-id={menu.parentId}
                          data-testid='menu-row'
                          style={{ paddingLeft: `${level * 20 + 8}px` }}
                          draggable
                          onDragStart={e => {
                            e.dataTransfer.effectAllowed = 'move';
                            e.dataTransfer.setData('text/plain', menu.id);
                            dragDrop.onDragStart(menu.id);
                          }}
                          onDragOver={e => {
                            e.preventDefault();
                            const element = e.currentTarget as HTMLElement;
                            const rect = element.getBoundingClientRect();
                            const { isValid } = dragDrop.onDragOver(menu, e.clientY, rect);
                            e.dataTransfer.dropEffect = isValid ? 'move' : 'none';
                          }}
                          onDragLeave={e => {
                            const target = e.currentTarget as HTMLElement;
                            const related = e.relatedTarget as HTMLElement;
                            if (!target.contains(related)) {
                              dragDrop.onDragLeave();
                            }
                          }}
                          onDrop={async e => {
                            e.preventDefault();
                            e.stopPropagation();
                            try {
                              await dragDrop.onDrop(menu, menuId => {
                                // 展开目标菜单
                                if (!store.expandedIds.has(menuId)) {
                                  store.toggleExpand(menuId);
                                }
                              });
                            } catch (error: unknown) {
                              console.error('Drop error:', error);
                              alert(getErrorMessage(error, '拖放操作失败'));
                            }
                          }}
                          onDragEnd={() => dragDrop.onDragEnd()}
                        >
                          {/* Drag Handle */}
                          <button
                            className='btn btn-ghost btn-xs cursor-grab p-0 opacity-0 group-hover:opacity-100'
                            data-testid='menu-drag-handle'
                            title='拖拽排序'
                            onMouseDown={e => e.stopPropagation()}
                          >
                            <GripVertical size={14} />
                          </button>

                          {/* Expand/Collapse */}
                          <button
                            className='btn btn-ghost btn-xs p-0'
                            data-testid='menu-node-toggle'
                            onClick={() => store.toggleExpand(menu.id)}
                            disabled={!hasChildren}
                          >
                            {hasChildren ?
                              isExpanded ?
                                <ChevronDown size={16} />
                              : <ChevronRight size={16} />
                            : <span className='w-4' />}
                          </button>

                          {/* Title (editable) */}
                          {isEditing ?
                            <input
                              className='input input-sm flex-1'
                              data-testid='menu-edit-input'
                              value={editingTitles.get(menu.id) ?? menu.title}
                              onChange={e => {
                                const nextTitle = e.target.value;
                                setEditingTitles(prev => new Map(prev).set(menu.id, nextTitle));
                              }}
                              onBlur={() => handleSave(menu)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleSave(menu);
                                if (e.key === 'Escape') {
                                  handleCancelEdit(menu.id);
                                }
                              }}
                              autoFocus
                            />
                          : <span
                              className={`flex-1 cursor-pointer truncate text-sm ${
                                (
                                  store.searchKeyword &&
                                  menu.title.toLowerCase().includes(store.searchKeyword.toLowerCase())
                                ) ?
                                  'bg-yellow-200 font-semibold'
                                : ''
                              }`}
                              onDoubleClick={() => handleStartEdit(menu)}
                            >
                              {menu.title}
                            </span>
                          }

                          {/* Actions */}
                          <div className='flex gap-1 opacity-0 group-hover:opacity-100'>
                            <button
                              className='btn btn-ghost btn-xs'
                              onClick={() => {
                                store.setSelectedParentId(menu.id);
                                document.getElementById('menu-title-input')?.focus();
                              }}
                              aria-label='添加子菜单'
                              data-testid='menu-add-child'
                            >
                              <Plus size={14} />
                            </button>
                            <button
                              className='btn btn-ghost btn-xs text-primary'
                              onClick={() => handleStartEdit(menu)}
                              aria-label='编辑'
                              data-testid='menu-edit'
                            >
                              <Pen size={14} />
                            </button>
                            <button
                              className='btn btn-ghost btn-xs text-error'
                              onClick={() => void store.deleteMenu(menu)}
                              aria-label='删除'
                              data-testid='menu-delete'
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                }
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* 删除确认对话框 */}
      {store.menuToDelete && (
        <dialog className='modal modal-open'>
          <div className='modal-box'>
            <h3 className='text-lg font-bold'>确认删除</h3>

            <div className='py-4'>
              <p className='mb-3'>
                确定要删除菜单
                <span className='text-primary font-semibold'> "{store.menuToDelete.title}" </span>
                吗？
              </p>

              {store.deleteImpact.childrenCount > 0 && (
                <div className='alert alert-warning'>
                  <TriangleAlert size={20} />
                  <div className='flex flex-col gap-1 text-sm'>
                    <p className='font-medium'>此操作将级联删除：</p>
                    <ul className='ml-4 list-disc'>
                      <li>{store.deleteImpact.childrenCount} 个直接子节点</li>
                      {store.deleteImpact.descendantsCount > store.deleteImpact.childrenCount && (
                        <li>共 {store.deleteImpact.descendantsCount} 个所有后代节点</li>
                      )}
                    </ul>
                  </div>
                </div>
              )}
            </div>

            <div className='modal-action flex-col gap-2 sm:flex-row'>
              <button className='btn btn-ghost' onClick={store.cancelDelete} type='button'>
                取消
              </button>

              {store.deleteImpact.childrenCount > 0 ?
                <>
                  <button className='btn btn-warning' onClick={store.executePromoteChildrenDelete} type='button'>
                    <Trash2 size={16} />
                    删除父节点 (子节点提升)
                  </button>
                  <button className='btn btn-error' onClick={store.executeCascadeDelete} type='button'>
                    <Trash2 size={16} />
                    级联删除 (删除所有)
                  </button>
                </>
              : <button className='btn btn-error' onClick={store.executeCascadeDelete} type='button'>
                  <Trash2 size={16} />
                  确认删除
                </button>
              }
            </div>
          </div>
          <form className='modal-backdrop' onClick={store.cancelDelete} method='dialog'>
            <button aria-label='关闭对话框' type='button'>
              close
            </button>
          </form>
        </dialog>
      )}
    </div>
  );
}

export default TreeMenuSimplePage;
