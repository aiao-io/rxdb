/**
 * OPFS 文件管理页面 - React
 */

import { checkOPFSAvailable } from '@aiao/utils';
import {
  AlertTriangle,
  ChevronRight,
  Folder,
  FolderPlus,
  Grid3x3,
  Home,
  List,
  RefreshCw,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useResettableTimeout } from '../../hooks/useResettableTimeout';
import { readDroppedEntryTree } from '../../utils/read-directory-entries';
import { OpfsContextMenu } from './components/OpfsContextMenu';
import { OpfsFileGrid } from './components/OpfsFileGrid';
import { OpfsFileList } from './components/OpfsFileList';
import { OpfsFilePreview } from './components/OpfsFilePreview';
import { useOpfsRouteSync } from './hooks/useOpfsRouteSync';
import { useOpfsService } from './hooks/useOpfsService';
import { formatFileSize, OPFSFileEntry } from './utils/opfs-utils';

type ViewMode = 'list' | 'grid';

interface Toast {
  show: boolean;
  message: string;
  type: 'error' | 'success' | 'info';
}

function getStoredViewMode(): ViewMode {
  const stored = localStorage.getItem('opfs-view-mode');
  return stored === 'grid' || stored === 'list' ? stored : 'list';
}

function normalizeRoutePath(path: string | undefined): string {
  if (!path || path === '/') return '/';
  const withLeading = path.startsWith('/') ? path : `/${path}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

function buildUrlFromPath(path: string): string {
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return '/opfs';
  const pathStr = segments.map(s => encodeURIComponent(s)).join('/');
  return `/opfs/${pathStr}`;
}

export default function OpfsPage() {
  const opfs = useOpfsService();
  const navigate = useNavigate();
  const params = useParams();
  const routePath = normalizeRoutePath(params['*']);

  const [opfsAvailable, setOpfsAvailable] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(getStoredViewMode);
  const [previewEntry, setPreviewEntry] = useState<OPFSFileEntry | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [lastSelectedPath, setLastSelectedPath] = useState<string | null>(null);

  const [deleteConfirm, setDeleteConfirm] = useState<{
    show: boolean;
    entry: OPFSFileEntry | null;
    resolve?: (v: boolean) => void;
  }>({ show: false, entry: null });
  const [renameDialog, setRenameDialog] = useState<{ show: boolean; entry: OPFSFileEntry | null; newName: string }>({
    show: false,
    entry: null,
    newName: ''
  });
  const [overwriteConfirm, setOverwriteConfirm] = useState<{
    show: boolean;
    file: File | null;
    existingEntry: OPFSFileEntry | null;
    resolve?: (v: boolean) => void;
  }>({ show: false, file: null, existingEntry: null });
  const [folderOverwriteConfirm, setFolderOverwriteConfirm] = useState<{
    show: boolean;
    conflictPaths: string[];
    resolve?: (overwrite: boolean) => void;
  }>({ show: false, conflictPaths: [] });
  const [contextMenu, setContextMenu] = useState<{ show: boolean; x: number; y: number; entry: OPFSFileEntry | null }>({
    show: false,
    x: 0,
    y: 0,
    entry: null
  });
  const [toast, setToast] = useState<Toast>({ show: false, message: '', type: 'info' });
  const [selectionBox, setSelectionBox] = useState<{
    active: boolean;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const mouseMoveRef = useRef<((e: MouseEvent) => void) | null>(null);
  const mouseUpRef = useRef<(() => void) | null>(null);
  const { schedule: scheduleToastHide } = useResettableTimeout();

  // Check availability & init
  useEffect(() => {
    checkOPFSAvailable().then(setOpfsAvailable);
  }, []);

  useOpfsRouteSync({
    available: opfsAvailable,
    routePath,
    currentPath: opfs.currentPath,
    init: opfs.init,
    navigateTo: opfs.navigateTo
  });

  const navigateToPath = useCallback(
    (path: string) => {
      navigate(buildUrlFromPath(path));
    },
    [navigate]
  );

  // Persist view mode
  useEffect(() => {
    localStorage.setItem('opfs-view-mode', viewMode);
  }, [viewMode]);

  // Cleanup global listeners
  useEffect(() => {
    return () => {
      if (mouseMoveRef.current) window.removeEventListener('mousemove', mouseMoveRef.current);
      if (mouseUpRef.current) window.removeEventListener('mouseup', mouseUpRef.current);
    };
  }, []);

  const showToast = useCallback(
    (message: string, type: Toast['type'] = 'info') => {
      setToast({ show: true, message, type });
      scheduleToastHide(() => setToast({ show: false, message: '', type: 'info' }), 3000);
    },
    [scheduleToastHide]
  );

  // Statistics
  const dirCount = opfs.entries.filter(e => e.kind === 'directory').length;
  const fileCount = opfs.entries.filter(e => e.kind === 'file').length;

  // Path segments
  const pathSegments = (() => {
    const path = opfs.currentPath;
    if (!path || path === '/') return [];
    return path
      .split('/')
      .filter(Boolean)
      .map((segment, index, arr) => ({
        name: segment,
        path: '/' + arr.slice(0, index + 1).join('/') + '/'
      }));
  })();

  // Handlers
  const handleNavigate = useCallback(
    (entry: OPFSFileEntry) => {
      if (entry.kind === 'directory') navigateToPath(entry.path);
    },
    [navigateToPath]
  );

  const handleDownload = useCallback(
    async (entry: OPFSFileEntry) => {
      if (entry.kind === 'file') await opfs.downloadFile(entry);
    },
    [opfs]
  );

  const handleDelete = useCallback(
    async (entry: OPFSFileEntry) => {
      const shouldDelete = await new Promise<boolean>(resolve => {
        setDeleteConfirm({ show: true, entry, resolve });
      });
      if (shouldDelete) {
        const result = await opfs.deleteEntry(entry);
        if (!result) showToast(`删除失败: ${entry.name}`, 'error');
      }
    },
    [opfs, showToast]
  );

  const handleDeleteResponse = useCallback(
    (confirm: boolean) => {
      if (deleteConfirm.resolve) deleteConfirm.resolve(confirm);
      setDeleteConfirm({ show: false, entry: null });
    },
    [deleteConfirm]
  );

  const handleUpload = useCallback(
    async (files?: File[]) => {
      const filesToUpload = files || (fileInputRef.current?.files ? Array.from(fileInputRef.current.files) : null);
      if (!filesToUpload || filesToUpload.length === 0) return;

      for (const file of filesToUpload) {
        const existingFile = opfs.entries.find(e => e.kind === 'file' && e.name === file.name);
        if (existingFile) {
          const shouldOverwrite = await new Promise<boolean>(resolve => {
            setOverwriteConfirm({ show: true, file, existingEntry: existingFile, resolve });
          });
          if (!shouldOverwrite) continue;
        }
        await opfs.uploadFile(file);
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [opfs]
  );

  const handleUploadFolder = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      showToast(`正在上传文件夹，共 ${files.length} 个文件...`, 'info');

      const filesWithPaths = files.map(file => ({ file, relativePath: file.webkitRelativePath || file.name }));
      const conflictPaths = await opfs.findUploadConflicts(filesWithPaths.map(item => item.relativePath));
      const overwriteConflicts =
        conflictPaths.length === 0 ?
          true
        : await new Promise<boolean>(resolve => {
            setFolderOverwriteConfirm({ show: true, conflictPaths, resolve });
          });
      const skippedPaths = overwriteConflicts ? new Set<string>() : new Set(conflictPaths);

      let successCount = 0;
      let failedCount = 0;
      for (const { file, relativePath } of filesWithPaths) {
        if (skippedPaths.has(relativePath)) continue;
        const success = await opfs.uploadFileWithPath(file, relativePath);
        if (success) successCount++;
        else failedCount++;
      }
      await opfs.refresh();

      if (failedCount > 0) showToast(`上传完成：${successCount} 成功，${failedCount} 失败`, 'error');
      else showToast(`成功上传 ${successCount} 个文件`, 'success');
    },
    [opfs, showToast]
  );

  const handleFolderOverwriteResponse = useCallback(
    (overwrite: boolean) => {
      folderOverwriteConfirm.resolve?.(overwrite);
      setFolderOverwriteConfirm({ show: false, conflictPaths: [] });
    },
    [folderOverwriteConfirm]
  );

  const handleOverwriteResponse = useCallback(
    (confirm: boolean) => {
      if (overwriteConfirm.resolve) overwriteConfirm.resolve(confirm);
      setOverwriteConfirm({ show: false, file: null, existingEntry: null });
    },
    [overwriteConfirm]
  );

  const handleCreateFolder = useCallback(async () => {
    const name = newFolderName.trim();
    if (!name) return;
    const success = await opfs.createDirectory(name);
    if (success) {
      setShowNewFolder(false);
      setNewFolderName('');
    }
  }, [newFolderName, opfs]);

  const handleRename = useCallback(async () => {
    if (!renameDialog.entry || !renameDialog.newName.trim()) return;
    const success = await opfs.renameEntry(renameDialog.entry, renameDialog.newName.trim());
    if (success) setRenameDialog({ show: false, entry: null, newName: '' });
  }, [renameDialog, opfs]);

  const handleBatchDelete = useCallback(async () => {
    if (selectedPaths.size === 0) return;
    const entriesToDelete = opfs.entries.filter(e => selectedPaths.has(e.path));
    const shouldDelete = await new Promise<boolean>(resolve => {
      const virtualEntry: OPFSFileEntry = {
        name: `${selectedPaths.size} 个项目`,
        kind: 'file',
        handle: {} as FileSystemFileHandle,
        path: ''
      };
      setDeleteConfirm({ show: true, entry: virtualEntry, resolve });
    });

    if (shouldDelete) {
      let failedCount = 0;
      for (const entry of entriesToDelete) {
        const result = await opfs.deleteEntry(entry);
        if (!result) failedCount++;
      }
      if (failedCount > 0) showToast(`${failedCount} 个项目删除失败`, 'error');
      else showToast(`成功删除 ${entriesToDelete.length} 个项目`, 'success');
      setSelectedPaths(new Set());
      setLastSelectedPath(null);
    }
  }, [selectedPaths, opfs, showToast]);

  const handleEntryClick = useCallback(
    (entry: OPFSFileEntry, event: React.MouseEvent) => {
      if (event.ctrlKey || event.metaKey) {
        setSelectedPaths(prev => {
          const next = new Set(prev);
          if (next.has(entry.path)) next.delete(entry.path);
          else next.add(entry.path);
          return next;
        });
        setLastSelectedPath(entry.path);
      } else if (event.shiftKey && lastSelectedPath) {
        const startIndex = opfs.entries.findIndex(e => e.path === lastSelectedPath);
        const endIndex = opfs.entries.findIndex(e => e.path === entry.path);
        if (startIndex !== -1 && endIndex !== -1) {
          const [start, end] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
          setSelectedPaths(prev => {
            const next = new Set(prev);
            for (let i = start; i <= end; i++) next.add(opfs.entries[i].path);
            return next;
          });
        }
      } else {
        setSelectedPaths(new Set([entry.path]));
        setLastSelectedPath(entry.path);
      }
    },
    [lastSelectedPath, opfs.entries]
  );

  const handleContextMenu = useCallback((event: React.MouseEvent, entry: OPFSFileEntry) => {
    event.preventDefault();
    setContextMenu({ show: true, x: event.clientX, y: event.clientY, entry });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu({ show: false, x: 0, y: 0, entry: null });
  }, []);

  const handleContextMenuAction = useCallback(
    async (action: 'view' | 'rename' | 'delete') => {
      const entry = contextMenu.entry;
      closeContextMenu();
      if (!entry) return;

      switch (action) {
        case 'view':
          if (entry.kind === 'file') setPreviewEntry(entry);
          else handleNavigate(entry);
          break;
        case 'rename':
          setRenameDialog({ show: true, entry, newName: entry.name });
          break;
        case 'delete':
          await handleDelete(entry);
          break;
      }
    },
    [contextMenu.entry, closeContextMenu, handleNavigate, handleDelete]
  );

  // Drag & drop
  const handleDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragging(false);
      if (!event.dataTransfer) return;

      const items = event.dataTransfer.items;
      if (items) {
        const entries: File[] = [];
        const promises: Promise<void>[] = [];

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.kind === 'file') {
            const entry = item.webkitGetAsEntry?.();
            if (entry) promises.push(readDroppedEntryTree(entry, '', entries));
          }
        }
        await Promise.all(promises);

        if (entries.length > 0) {
          const hasFolder = entries.some(f => f.webkitRelativePath?.includes('/'));
          if (hasFolder) await handleUploadFolder(entries);
          else await handleUpload(entries);
        }
      } else if (event.dataTransfer.files) {
        await handleUpload(Array.from(event.dataTransfer.files));
      }
    },
    [handleUpload, handleUploadFolder]
  );

  // Selection box
  const handleMouseDown = useCallback(
    (event: React.MouseEvent) => {
      if (viewMode !== 'grid' || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target as HTMLElement;
      if (target.closest('button') || target.closest('a') || target.closest('[role="button"]')) return;

      const container = gridContainerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const startX = event.clientX - rect.left;
      const startY = event.clientY - rect.top;
      setSelectionBox({ active: true, startX, startY, currentX: startX, currentY: startY });

      const onMouseMove = (e: MouseEvent) => {
        const rect = container.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;
        setSelectionBox(prev => (prev ? { ...prev, currentX, currentY } : null));

        const boxLeft = Math.min(startX, currentX) + rect.left;
        const boxTop = Math.min(startY, currentY) + rect.top;
        const boxRight = Math.max(startX, currentX) + rect.left;
        const boxBottom = Math.max(startY, currentY) + rect.top;

        const selected = new Set<string>();
        container.querySelectorAll('[data-entry-path]').forEach(item => {
          const itemRect = item.getBoundingClientRect();
          const intersects = !(
            itemRect.right < boxLeft ||
            itemRect.left > boxRight ||
            itemRect.bottom < boxTop ||
            itemRect.top > boxBottom
          );
          if (intersects) {
            const path = item.getAttribute('data-entry-path');
            if (path) selected.add(path);
          }
        });
        setSelectedPaths(selected);
      };

      const onMouseUp = () => {
        setSelectionBox(null);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        mouseMoveRef.current = null;
        mouseUpRef.current = null;
      };

      mouseMoveRef.current = onMouseMove;
      mouseUpRef.current = onMouseUp;
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [viewMode]
  );

  return (
    <div className='flex h-full flex-col'>
      {/* Header */}
      <div className='border-base-300 flex items-center justify-between border-b px-3 py-2'>
        <div className='flex items-center gap-3'>
          <span className='text-sm font-bold'>OPFS 文件管理</span>
          <div className='flex items-center gap-1.5'>
            <div className={`h-2 w-2 rounded-full ${opfsAvailable ? 'bg-success' : 'bg-error'}`} />
            <span className='text-base-content/60 text-xs'>{opfsAvailable ? '已连接' : '未连接'}</span>
          </div>
        </div>
        <div className='tabs tabs-boxed tabs-xs' role='tablist'>
          <button
            className={`tab gap-1 ${viewMode === 'list' ? 'tab-active' : ''}`}
            onClick={() => setViewMode('list')}
            role='tab'
          >
            <List size={12} /> List
          </button>
          <button
            className={`tab gap-1 ${viewMode === 'grid' ? 'tab-active' : ''}`}
            onClick={() => setViewMode('grid')}
            role='tab'
          >
            <Grid3x3 size={12} /> Grid
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className='border-base-300 flex items-center gap-2 border-b p-2'>
        <button className='btn btn-xs btn-ghost' onClick={() => navigateToPath('/')} title='根目录'>
          <Home size={16} />
        </button>
        <button className='btn btn-xs btn-ghost' onClick={() => opfs.refresh()} title='刷新'>
          <RefreshCw size={16} className={opfs.loading ? 'animate-spin' : ''} />
        </button>
        <div className='divider divider-horizontal m-0' />
        <button className='btn btn-xs btn-primary' onClick={() => fileInputRef.current?.click()}>
          <Upload size={16} /> 上传文件
        </button>
        <button className='btn btn-xs btn-primary' onClick={() => folderInputRef.current?.click()}>
          <Folder size={16} /> 上传文件夹
        </button>
        <button className='btn btn-xs btn-secondary' onClick={() => setShowNewFolder(true)}>
          <FolderPlus size={16} /> 新建文件夹
        </button>
        {selectedPaths.size > 0 && (
          <>
            <div className='divider divider-horizontal m-0' />
            <span className='text-base-content/60 text-xs'>已选择 {selectedPaths.size} 项</span>
            <button
              className='btn btn-xs btn-ghost'
              onClick={() => {
                setSelectedPaths(new Set());
                setLastSelectedPath(null);
              }}
              title='取消选择'
            >
              <X size={14} />
            </button>
            <button className='btn btn-xs btn-error' onClick={handleBatchDelete} title='批量删除'>
              <Trash2 size={16} /> 删除
            </button>
          </>
        )}
      </div>

      {/* Breadcrumb */}
      <div className='border-base-300 flex items-center gap-1 border-b px-3 py-2 text-sm'>
        <button className='hover:underline' onClick={() => navigateToPath('/')}>
          根目录
        </button>
        {pathSegments.map(segment => (
          <div key={segment.path} className='flex items-center gap-1'>
            <ChevronRight size={14} className='text-base-content/40' />
            <button className='hover:underline' onClick={() => navigateToPath(segment.path)}>
              {segment.name}
            </button>
          </div>
        ))}
      </div>

      {/* File list/grid */}
      <div
        ref={gridContainerRef}
        className='relative flex-1 overflow-auto'
        onDragEnter={e => {
          setIsDragging(true);
          e.preventDefault();
        }}
        onDragLeave={e => {
          setIsDragging(false);
          e.preventDefault();
        }}
        onDragOver={e => e.preventDefault()}
        onDrop={handleDrop}
        onMouseDown={handleMouseDown}
      >
        {viewMode === 'list' ?
          <OpfsFileList
            entries={opfs.entries}
            currentPath={opfs.currentPath}
            selectedPaths={selectedPaths}
            onNavigate={handleNavigate}
            onDownload={handleDownload}
            onDelete={handleDelete}
            onPreview={entry => setPreviewEntry(entry)}
            onContextMenu={handleContextMenu}
            onEntryClick={handleEntryClick}
          />
        : <OpfsFileGrid
            entries={opfs.entries}
            currentPath={opfs.currentPath}
            selectedPaths={selectedPaths}
            previewFile={opfs.previewFile}
            onNavigate={handleNavigate}
            onDownload={handleDownload}
            onDelete={handleDelete}
            onPreview={entry => setPreviewEntry(entry)}
            onContextMenu={handleContextMenu}
            onEntryClick={handleEntryClick}
          />
        }

        {/* Selection box */}
        {selectionBox?.active && (
          <div
            className='border-primary bg-primary/10 pointer-events-none absolute border-2'
            style={{
              left: Math.min(selectionBox.startX, selectionBox.currentX),
              top: Math.min(selectionBox.startY, selectionBox.currentY),
              width: Math.abs(selectionBox.currentX - selectionBox.startX),
              height: Math.abs(selectionBox.currentY - selectionBox.startY)
            }}
          />
        )}

        {/* Drag overlay */}
        {isDragging && (
          <div className='bg-primary/10 border-primary pointer-events-none absolute inset-0 z-50 flex items-center justify-center border-2 border-dashed'>
            <div className='bg-base-100 rounded-lg p-8 shadow-lg'>
              <Upload size={48} className='text-primary mx-auto mb-2' />
              <p className='text-primary text-lg font-semibold'>拖放文件到这里上传</p>
            </div>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className='border-base-300 text-base-content/60 flex items-center gap-4 border-t px-3 py-1 text-xs'>
        <span>
          {opfs.entries.length} 项 ({dirCount} 个文件夹, {fileCount} 个文件)
        </span>
      </div>

      {/* Preview */}
      <OpfsFilePreview entry={previewEntry} previewFile={opfs.previewFile} onClose={() => setPreviewEntry(null)} />

      {/* New folder dialog */}
      {showNewFolder && (
        <div className='modal modal-open' onClick={() => setShowNewFolder(false)}>
          <div className='modal-box' onClick={e => e.stopPropagation()}>
            <h3 className='mb-4 text-base font-bold'>新建文件夹</h3>
            <input
              className='input input-bordered w-full'
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
              placeholder='文件夹名称'
              type='text'
            />
            <div className='modal-action'>
              <button className='btn btn-sm' onClick={() => setShowNewFolder(false)}>
                取消
              </button>
              <button className='btn btn-sm btn-primary' onClick={handleCreateFolder}>
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Overwrite confirm */}
      {overwriteConfirm.show && overwriteConfirm.file && overwriteConfirm.existingEntry && (
        <div className='modal modal-open' onClick={() => handleOverwriteResponse(false)}>
          <div className='modal-box' onClick={e => e.stopPropagation()}>
            <h3 className='mb-4 flex items-center gap-2 text-base font-bold'>
              <AlertTriangle size={18} className='text-warning' /> 文件已存在
            </h3>
            <p className='mb-4'>
              文件 <span className='font-semibold'>{overwriteConfirm.file.name}</span> 已存在，是否覆盖？
            </p>
            <div className='bg-base-200 mb-4 space-y-2 rounded-lg p-3'>
              <div className='flex justify-between text-sm'>
                <span className='text-base-content/60'>现有文件:</span>
                <span className='font-mono'>{formatFileSize(overwriteConfirm.existingEntry.size || 0)}</span>
              </div>
              <div className='flex justify-between text-sm'>
                <span className='text-base-content/60'>新文件:</span>
                <span className='font-mono'>{formatFileSize(overwriteConfirm.file.size)}</span>
              </div>
            </div>
            <div className='modal-action'>
              <button className='btn btn-sm' onClick={() => handleOverwriteResponse(false)}>
                取消
              </button>
              <button className='btn btn-sm btn-warning' onClick={() => handleOverwriteResponse(true)}>
                覆盖
              </button>
            </div>
          </div>
        </div>
      )}

      {folderOverwriteConfirm.show && (
        <div className='modal modal-open' onClick={() => handleFolderOverwriteResponse(false)}>
          <div className='modal-box' onClick={event => event.stopPropagation()}>
            <h3 className='mb-4 flex items-center gap-2 text-base font-bold'>
              <AlertTriangle size={18} className='text-warning' /> 文件夹上传存在冲突
            </h3>
            <p className='mb-2'>检测到 {folderOverwriteConfirm.conflictPaths.length} 个同路径文件。</p>
            <div className='bg-base-200 mb-4 max-h-40 overflow-auto rounded-lg p-3 font-mono text-xs'>
              {folderOverwriteConfirm.conflictPaths.map(path => (
                <div key={path}>{path}</div>
              ))}
            </div>
            <div className='modal-action'>
              <button className='btn btn-sm' onClick={() => handleFolderOverwriteResponse(false)}>
                跳过冲突
              </button>
              <button className='btn btn-sm btn-warning' onClick={() => handleFolderOverwriteResponse(true)}>
                全部覆盖
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Context menu */}
      {contextMenu.show && contextMenu.entry && (
        <OpfsContextMenu
          entry={contextMenu.entry}
          onAction={action => void handleContextMenuAction(action)}
          onClose={closeContextMenu}
          x={contextMenu.x}
          y={contextMenu.y}
        />
      )}

      {/* Delete confirm */}
      {deleteConfirm.show && deleteConfirm.entry && (
        <div className='modal modal-open' onClick={() => handleDeleteResponse(false)}>
          <div className='modal-box' onClick={e => e.stopPropagation()}>
            <h3 className='mb-4 flex items-center gap-2 text-base font-bold'>
              <Trash2 size={18} className='text-error' /> 确认删除
            </h3>
            <p className='mb-4'>
              确定要删除
              <span className='font-semibold'>{deleteConfirm.entry.kind === 'file' ? '文件' : '文件夹'}</span>
              <span className='text-error font-semibold'>{deleteConfirm.entry.name}</span> 吗？
            </p>
            {deleteConfirm.entry.kind === 'directory' && (
              <p className='text-warning mb-4 flex items-center gap-1 text-sm'>
                <AlertTriangle size={16} /> 此操作将删除文件夹及其所有内容
              </p>
            )}
            <div className='modal-action'>
              <button className='btn btn-sm' onClick={() => handleDeleteResponse(false)}>
                取消
              </button>
              <button className='btn btn-sm btn-error' onClick={() => handleDeleteResponse(true)}>
                删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename dialog */}
      {renameDialog.show && renameDialog.entry && (
        <div className='modal modal-open' onClick={() => setRenameDialog({ show: false, entry: null, newName: '' })}>
          <div className='modal-box' onClick={e => e.stopPropagation()}>
            <h3 className='mb-4 text-base font-bold'>重命名{renameDialog.entry.kind === 'file' ? '文件' : '文件夹'}</h3>
            <input
              className='input input-bordered w-full'
              value={renameDialog.newName}
              onChange={e => setRenameDialog(prev => ({ ...prev, newName: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && handleRename()}
              placeholder={renameDialog.entry.kind === 'file' ? '文件名' : '文件夹名'}
              type='text'
            />
            <div className='modal-action'>
              <button className='btn btn-sm' onClick={() => setRenameDialog({ show: false, entry: null, newName: '' })}>
                取消
              </button>
              <button className='btn btn-sm btn-primary' onClick={handleRename}>
                确定
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast.show && (
        <div className='toast toast-top toast-end'>
          <div
            className={`alert ${
              toast.type === 'error' ? 'alert-error'
              : toast.type === 'success' ? 'alert-success'
              : 'alert-info'
            }`}
          >
            <span>{toast.message}</span>
            <button
              className='btn btn-sm btn-ghost'
              onClick={() => setToast({ show: false, message: '', type: 'info' })}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Hidden inputs */}
      <input
        ref={fileInputRef}
        type='file'
        multiple
        className='hidden'
        onChange={e => e.target.files && handleUpload(Array.from(e.target.files))}
        data-testid='opfs-file-input'
      />
      <input
        ref={folderInputRef}
        type='file'
        className='hidden'
        onChange={e => e.target.files && handleUploadFolder(Array.from(e.target.files))}
        // React 类型未声明 webkitdirectory/directory，但 Chromium / WebKit 支持。
        {...({ webkitdirectory: '', directory: '' } as unknown as React.InputHTMLAttributes<HTMLInputElement>)}
      />
    </div>
  );
}
