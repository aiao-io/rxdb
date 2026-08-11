import { useFindAll, useRxDB } from '@aiao/rxdb-react';
import { FileNode } from '@aiao/rxdb-test/entities';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ChevronDown,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileText,
  FileVideo,
  Folder,
  FolderOpen,
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
import { useCallback, useMemo, useRef, useState } from 'react';
import { useObservable } from 'react-use';
import { HistorySidebar } from '../../components/HistorySidebar';
import { PathConflictWarning } from '../../components/PathConflictWarning';
import { useDragDrop } from '../../hooks/useDragDrop';
import { useFileManagerStore } from '../../hooks/useFileManagerStore';
import { useFileRenamePathGuard } from '../../hooks/useRenamePathGuard';
import { getErrorMessage } from '../../utils/error';
import { getFileIcon } from '../../utils/file-icons';
import { SortMode } from '../../utils/file-sorters';
import { generateBatchFiles } from '../../utils/file-utils';
import { formatFileName } from './utils/file-name';

// P2-7：提到模块级 —— 内联箭头函数每次 render 都是新身份，
// 会把 useDragDrop 内部所有 useCallback 的 deps 一起打脏。它不闭包任何东西，模块级最省。
const isFolderNode = (node: FileNode): boolean => node.type === 'folder';

export function FileManagerVirtualPage() {
  const rxdb = useRxDB();
  const fileRepository = useMemo(() => rxdb.entityManager.getRepository(FileNode), [rxdb]);
  const [showHistory, setShowHistory] = useState(true);
  const [newName, setNewName] = useState('');
  const [newExtension, setNewExtension] = useState('.txt');
  const [loadingActions, setLoadingActions] = useState<Set<string>>(new Set());
  const [isDeleting] = useState(false);
  const [editingNames, setEditingNames] = useState<Map<string, string>>(new Map());
  const parentRef = useRef<HTMLDivElement>(null);

  // 获取所有文件数据
  const { value: files } = useFindAll(FileNode, {
    where: { combinator: 'and', rules: [] },
    orderBy: [{ field: 'sortOrder', sort: 'asc' }]
  });

  const history = useMemo(() => rxdb.versionManager.history(FileNode), [rxdb]);
  const histories = useObservable(history.histories$, []);
  const undoCount = useObservable(history.undoCount$, 0);
  const redoCount = useObservable(history.redoCount$, 0);

  const store = useFileManagerStore(files);
  const {
    pathConflict: renamePathConflict,
    rename: renameWithPathGuard,
    clearPathConflict: clearRenamePathConflict
  } = useFileRenamePathGuard<FileNode>();

  // Drag and drop
  const dragDrop = useDragDrop<FileNode>(files, { isFolder: isFolderNode });

  // 虚拟滚动配置
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual returns non-memoizable callbacks by design
  const rowVirtualizer = useVirtualizer({
    count: store.treeNodes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36, // 每行高度
    overscan: 5
  });

  // 批量添加文件
  const handleAddMany = useCallback(
    async (count: number, actionKey: string) => {
      setLoadingActions(prev => new Set(prev).add(actionKey));
      try {
        const existingRoots = files.filter(f => !f.parentId);
        const newFiles = generateBatchFiles(count, FileNode, existingRoots);
        await rxdb.entityManager.saveMany(newFiles);
      } finally {
        setLoadingActions(prev => {
          const next = new Set(prev);
          next.delete(actionKey);
          return next;
        });
      }
    },
    [rxdb, files]
  );

  // 删除所有文件
  const handleDeleteAll = useCallback(async () => {
    await rxdb.entityManager.removeMany(files);
  }, [rxdb, files]);

  // 保存编辑
  const handleSave = useCallback(
    async (file: FileNode) => {
      const nextName = editingNames.get(file.id);
      if (typeof nextName === 'string' && nextName !== file.name) {
        const renamed = await renameWithPathGuard(file, nextName, files, async (current, value) => {
          await fileRepository.update(current, { name: value });
        });
        if (!renamed) return;
      }
      setEditingNames(prev => {
        const next = new Map(prev);
        next.delete(file.id);
        return next;
      });
      store.cancelEdit();
    },
    [editingNames, fileRepository, store, renameWithPathGuard, files]
  );

  const handleStartEdit = useCallback(
    (file: FileNode) => {
      setEditingNames(prev => new Map(prev).set(file.id, file.name));
      store.startEdit(file.id);
    },
    [store]
  );

  const handleCancelEdit = useCallback(
    (fileId: string) => {
      setEditingNames(prev => {
        const next = new Map(prev);
        next.delete(fileId);
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

      <main className='flex h-full min-w-0 flex-1 flex-col overflow-hidden'>
        {/* Header */}
        <div className='border-base-300 bg-base-100 flex-none border-b p-4'>
          <div className='mx-auto flex max-w-4xl flex-col gap-3'>
            {/* Title Bar */}
            <div className='flex items-center justify-between'>
              <div className='flex items-center gap-3'>
                <h1 className='text-2xl font-bold'>File Manager - Virtual</h1>
                {store.searchKeyword ?
                  <div className='badge badge-warning badge-sm' data-testid='file-count'>
                    搜索: {store.matchedFileIds.size} 项
                  </div>
                : <div className='badge badge-primary' data-testid='file-count'>
                    {files.length} 项
                  </div>
                }

                {/* 批量添加 */}
                <div className='dropdown dropdown-end'>
                  <button className='btn btn-circle btn-sm' aria-label='批量添加' data-testid='file-batch-add'>
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
                            data-testid={`file-batch-option-${count}`}
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
                    data-testid='file-undo'
                  >
                    <Undo2 size={16} />
                    {undoCount > 0 && (
                      <span className='badge badge-xs' data-testid='file-undo-count'>
                        {undoCount}
                      </span>
                    )}
                  </button>
                  <button
                    className='btn btn-sm join-item'
                    disabled={redoCount === 0}
                    onClick={() => history.redo()}
                    aria-label='重做'
                    data-testid='file-redo'
                  >
                    <Redo2 size={16} />
                    {redoCount > 0 && (
                      <span className='badge badge-xs' data-testid='file-redo-count'>
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
                  data-testid='file-history'
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
                  <span className='font-mono text-lg font-bold'>{store.expandedCount}</span>
                </div>
                <button
                  className='btn btn-sm btn-ghost btn-square'
                  title={store.isAllExpanded ? '折叠全部' : '展开全部'}
                  onClick={() => (store.isAllExpanded ? store.collapseAll() : store.expandAll())}
                >
                  {store.isAllExpanded ?
                    <ChevronsUp size={20} />
                  : <ChevronsDown size={20} />}
                </button>
              </div>

              <div className='flex items-center gap-2'>
                <button className='btn btn-sm btn-error btn-outline' disabled={isDeleting} onClick={handleDeleteAll}>
                  {isDeleting ?
                    <span className='loading loading-spinner loading-xs'></span>
                  : <Trash2 size={16} />}
                  删除所有数据
                </button>
              </div>
            </div>

            {/* Search Bar */}
            <div className='flex gap-2'>
              <div className='relative flex-1'>
                <Search className='text-base-content/50 absolute top-1/2 left-3 -translate-y-1/2' size={16} />
                <input
                  className='input input-sm w-full pr-10 pl-10'
                  data-testid='file-search-input'
                  value={store.searchKeyword}
                  onChange={e => store.setSearchKeyword(e.target.value)}
                  placeholder='搜索文件...'
                  type='text'
                />
                {store.searchKeyword && (
                  <button
                    className='btn btn-ghost btn-xs absolute top-1/2 right-2 -translate-y-1/2'
                    onClick={() => store.clearSearch()}
                    aria-label='清除搜索'
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* 排序选择器 */}
              <select
                className='select select-sm select-bordered w-32'
                data-testid='file-sort-select'
                value={store.sortMode}
                onChange={e => store.changeSortMode(e.target.value as SortMode)}
              >
                <option value='manual'>手动排序</option>
                <option value='name-asc'>名称 ↑</option>
                <option value='name-desc'>名称 ↓</option>
                <option value='type-asc'>类型 ↑</option>
                <option value='type-desc'>类型 ↓</option>
                <option value='ext-asc'>扩展名 ↑</option>
                <option value='ext-desc'>扩展名 ↓</option>
                <option value='size-asc'>大小 ↑</option>
                <option value='size-desc'>大小 ↓</option>
              </select>
            </div>

            {/* Add Root File/Folder */}
            <div className='flex flex-col gap-2'>
              {/* 父文件夹选择提示 */}
              {store.selectedFolderId && (
                <div className='bg-info/10 flex items-center gap-2 rounded px-3 py-1 text-sm'>
                  <Folder size={14} className='text-info' />
                  <span className='flex-1'>
                    将添加到: <span className='font-semibold'>{store.getSelectedFolderName()}</span>
                  </span>
                  <button
                    className='btn btn-ghost btn-xs'
                    onClick={() => store.cancelSelectFolder()}
                    aria-label='取消选择'
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              <form
                className='flex gap-2'
                onSubmit={async e => {
                  e.preventDefault();
                  if (newName.trim()) {
                    if (store.isAddingFile) {
                      // 添加文件 - 只传文件名，不包含扩展名
                      if (store.selectedFolderId) {
                        const parent = files.find(f => f.id === store.selectedFolderId);
                        if (parent) await store.addChild(parent, newName, 'file', newExtension);
                      } else {
                        await store.addRoot(newName, 'file', newExtension);
                      }
                    } else {
                      // 添加文件夹
                      if (store.selectedFolderId) {
                        const parent = files.find(f => f.id === store.selectedFolderId);
                        if (parent) await store.addChild(parent, newName, 'folder');
                      } else {
                        await store.addRoot(newName, 'folder');
                      }
                    }
                    setNewName('');
                    store.cancelSelectFolder();
                  }
                }}
              >
                {/* 文件/文件夹模式切换 */}
                <button
                  type='button'
                  className={`btn btn-sm ${store.isAddingFile ? 'btn-info' : 'btn-warning'}`}
                  onClick={() => store.toggleAddingMode()}
                  aria-label='切换模式'
                  data-testid='file-mode-toggle'
                >
                  {store.isAddingFile ?
                    <File size={16} />
                  : <Folder size={16} />}
                  {store.isAddingFile ? '文件' : '文件夹'}
                </button>

                {/* 扩展名选择器 (仅文件模式) */}
                {store.isAddingFile && (
                  <select
                    className='select select-sm select-bordered w-24'
                    data-testid='file-extension-select'
                    value={newExtension}
                    onChange={e => setNewExtension(e.target.value)}
                  >
                    {[
                      { value: '.txt', label: 'TXT' },
                      { value: '.md', label: 'MD' },
                      { value: '.json', label: 'JSON' },
                      { value: '.js', label: 'JS' },
                      { value: '.ts', label: 'TS' },
                      { value: '.html', label: 'HTML' },
                      { value: '.css', label: 'CSS' },
                      { value: '.jpg', label: 'JPG' },
                      { value: '.png', label: 'PNG' },
                      { value: '.pdf', label: 'PDF' },
                      { value: '.zip', label: 'ZIP' }
                    ].map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                )}

                <input
                  className='input input-sm flex-1'
                  data-testid='file-name-input'
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder={
                    store.isAddingFile ?
                      `添加文件${store.selectedFolderId ? '' : ' (根目录)'}...`
                    : `添加文件夹${store.selectedFolderId ? '' : ' (根目录)'}...`
                  }
                  type='text'
                />

                <button
                  className='btn btn-neutral btn-sm'
                  data-testid='file-submit'
                  disabled={!newName.trim()}
                  type='submit'
                >
                  <Plus size={16} />
                  添加
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Path Conflict Warning */}
        {store.pathConflict && (
          <div className='alert alert-warning mx-auto max-w-4xl'>
            <TriangleAlert size={20} />
            <div className='flex-1'>
              <div className='font-semibold'>路径冲突警告</div>
              <div className='text-sm'>
                已存在同名文件：
                <strong>{store.pathConflict.conflictPath}</strong>
              </div>
            </div>
            <button className='btn btn-ghost btn-sm btn-circle' onClick={store.clearPathConflict}>
              <X size={16} />
            </button>
          </div>
        )}

        <PathConflictWarning
          conflictPath={renamePathConflict?.conflictPath ?? null}
          noun='文件'
          onClose={clearRenamePathConflict}
        />

        {/* Tree List (Virtual) */}
        <div ref={parentRef} className='flex-1 overflow-auto p-4'>
          <div
            className='relative mx-auto max-w-4xl'
            style={{
              height: `${rowVirtualizer.getTotalSize() + 10}px`
            }}
          >
            {store.treeNodes.length === 0 ?
              <div className='hero absolute min-h-40 w-full'>
                <div className='hero-content text-center'>
                  <p className='text-base-content/50 text-sm font-bold'>暂无文件数据</p>
                </div>
              </div>
            : rowVirtualizer.getVirtualItems().map(virtualRow => {
                const { file, level, isExpanded, hasChildren } = store.treeNodes[virtualRow.index];
                const isEditing = store.editingId === file.id;
                const isFolder = file.type === 'folder';
                const isMatched = store.matchedFileIds.has(file.id);
                const isSelected = store.selectedFolderId === file.id;

                const isDragging = dragDrop.dragDropState.draggedItemId === file.id;
                const isTarget = dragDrop.dragDropState.targetItemId === file.id;
                const isHighlighted = dragDrop.highlightedMenuIds.has(file.id);

                const classNames = [
                  'group absolute top-0 left-0 w-full flex items-center gap-2 rounded px-2 py-1 transition-colors',
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
                  isHighlighted && 'bg-warning/20',
                  isSelected && isFolder && 'ring-2 ring-inset ring-primary z-10'
                ]
                  .filter(Boolean)
                  .join(' ');

                return (
                  <div
                    key={file.id}
                    className={classNames}
                    aria-selected={isSelected}
                    data-dragging={isDragging ? 'true' : 'false'}
                    data-drop-mode={isTarget ? dragDrop.dragDropState.dropMode : ''}
                    data-drop-target={isTarget ? 'true' : 'false'}
                    data-drop-valid={isTarget ? String(dragDrop.dragDropState.isValidTarget) : ''}
                    data-file-id={file.id}
                    data-level={level}
                    data-parent-id={file.parentId}
                    data-testid='file-row'
                    style={{
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                      paddingLeft: `${level * 20 + 8}px`
                    }}
                    draggable
                    onDragStart={e => {
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', file.id);
                      dragDrop.onDragStart(file.id);
                    }}
                    onDragOver={e => {
                      e.preventDefault();
                      const element = e.currentTarget as HTMLElement;
                      const rect = element.getBoundingClientRect();
                      const { isValid } = dragDrop.onDragOver(file, e.clientY, rect);
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
                        await dragDrop.onDrop(file, folderId => {
                          // 展开目标文件夹
                          if (!store.expandedIds.has(folderId)) {
                            store.toggleExpand(folderId);
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
                      data-testid='file-drag-handle'
                      title='拖拽排序'
                      onMouseDown={e => e.stopPropagation()}
                    >
                      <GripVertical size={14} />
                    </button>

                    {/* Expand/Collapse */}
                    <button
                      className='btn btn-ghost btn-xs p-0'
                      data-testid='file-node-toggle'
                      onClick={() => store.toggleExpand(file.id)}
                      disabled={!isFolder || !hasChildren}
                    >
                      {isFolder && hasChildren ?
                        isExpanded ?
                          <ChevronDown size={16} />
                        : <ChevronRight size={16} />
                      : <span className='w-4' />}
                    </button>

                    {/* Icon */}
                    <span className='text-base-content/70'>
                      {isFolder ?
                        isExpanded ?
                          <FolderOpen size={18} className='text-warning' />
                        : <Folder size={18} className='text-warning' />
                      : (() => {
                          const iconName = getFileIcon('file', file.extension);
                          switch (iconName) {
                            case 'file-text':
                              return <FileText size={18} className='text-info' />;
                            case 'file-code':
                              return <FileCode size={18} className='text-success' />;
                            case 'file-image':
                              return <FileImage size={18} className='text-secondary' />;
                            case 'file-video':
                              return <FileVideo size={18} className='text-error' />;
                            case 'file-audio':
                              return <FileAudio size={18} className='text-accent' />;
                            case 'file-archive':
                              return <FileArchive size={18} className='text-warning' />;
                            default:
                              return <File size={18} className='text-base-content/50' />;
                          }
                        })()
                      }
                    </span>

                    {/* Name (editable) */}
                    {isEditing ?
                      <input
                        className='input input-sm flex-1'
                        data-testid='file-edit-input'
                        value={editingNames.get(file.id) ?? file.name}
                        onChange={e => {
                          const nextName = e.target.value;
                          setEditingNames(prev => new Map(prev).set(file.id, nextName));
                        }}
                        onBlur={() => handleSave(file)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleSave(file);
                          if (e.key === 'Escape') {
                            handleCancelEdit(file.id);
                          }
                        }}
                        autoFocus
                      />
                    : <span
                        className={`flex-1 cursor-pointer truncate ${isMatched ? 'bg-warning/30 rounded px-1' : ''} ${
                          isSelected && isFolder ? 'text-primary font-semibold' : ''
                        }`}
                        onClick={() => {
                          if (isFolder) {
                            store.selectFolder(file.id);
                          }
                        }}
                        onDoubleClick={() => store.startEdit(file.id)}
                      >
                        {formatFileName(file.name, file.type === 'file' ? file.extension : null)}
                        {file.type === 'file' && file.size && (
                          <span className='text-base-content/50 ml-2 text-xs'>
                            ({(file.size / 1024).toFixed(1)} KB)
                          </span>
                        )}
                      </span>
                    }

                    {/* Actions */}
                    <div className='flex gap-1 opacity-0 group-hover:opacity-100'>
                      {isFolder && (
                        <button
                          className='btn btn-ghost btn-xs'
                          onClick={() => store.selectFolder(file.id)}
                          aria-label='选择为父文件夹'
                          data-testid='file-select-parent'
                        >
                          <Folder size={14} />
                        </button>
                      )}
                      <button
                        className='btn btn-ghost btn-xs text-primary'
                        onClick={() => handleStartEdit(file)}
                        aria-label='编辑'
                        data-testid='file-edit'
                      >
                        <Pen size={14} />
                      </button>
                      <button
                        className='btn btn-ghost btn-xs text-error'
                        onClick={() => store.showDeleteDialog(file)}
                        aria-label='删除'
                        data-testid='file-delete'
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })
            }
          </div>
        </div>
      </main>

      {/* 删除确认对话框 */}
      {store.fileToDelete && (
        <dialog className='modal modal-open'>
          <div className='modal-box'>
            <h3 className='flex items-center gap-2 text-lg font-bold'>
              <TriangleAlert size={20} className='text-warning' />
              确认删除
            </h3>
            <div className='py-4'>
              <p className='mb-2'>
                确定要删除 <span className='text-error font-semibold'>{store.fileToDelete.name}</span> 吗？
              </p>
              {store.deleteImpact && (
                <div className='bg-warning/10 rounded p-3'>
                  <p className='mb-1 text-sm font-semibold'>影响范围：</p>
                  <ul className='list-inside list-disc text-sm'>
                    {store.deleteImpact.childrenCount > 0 && <li>直接子项: {store.deleteImpact.childrenCount} 个</li>}
                    {store.deleteImpact.descendantsCount > 0 && (
                      <li>所有后代: {store.deleteImpact.descendantsCount} 个</li>
                    )}
                  </ul>
                  <p className='text-warning mt-2 text-xs'>
                    <span role='img' aria-label='warning'>
                      ⚠️
                    </span>
                    此操作不可恢复！
                  </p>
                </div>
              )}
            </div>
            <div className='modal-action'>
              <button className='btn btn-ghost' onClick={() => store.cancelDelete()}>
                取消
              </button>
              <button
                className='btn btn-error'
                onClick={async () => {
                  await store.executeCascadeDelete();
                }}
              >
                <Trash2 size={16} />
                确认删除
              </button>
            </div>
          </div>
          <div className='modal-backdrop' onClick={() => store.cancelDelete()}></div>
        </dialog>
      )}
    </div>
  );
}

export default FileManagerVirtualPage;
