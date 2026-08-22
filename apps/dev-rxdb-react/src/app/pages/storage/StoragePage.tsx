import { normalizeDirectoryPath } from '@aiao/rxdb-plugin-storage';
import { useRxDB } from '@aiao/rxdb-react';
import { checkOPFSAvailable, STORAGE_LABELS, STORAGE_TESTID } from '@aiao/utils';
import { Database, Upload } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useGlobalDismiss } from '../../hooks/useGlobalDismiss';
import { readDroppedEntryTree } from '../../utils/read-directory-entries';
import { StorageConfirmDialog } from './components/StorageConfirmDialog';
import { StorageContextMenu, type StorageContextMenuAction } from './components/StorageContextMenu';
import { StorageDeleteDialog } from './components/StorageDeleteDialog';
import { StorageFileGrid } from './components/StorageFileGrid';
import { StorageFileList } from './components/StorageFileList';
import { StorageFilePreview } from './components/StorageFilePreview';
import { StorageNewFolderDialog } from './components/StorageNewFolderDialog';
import { StorageOverwriteDialog } from './components/StorageOverwriteDialog';
import { StorageRenameDialog } from './components/StorageRenameDialog';
import { StorageToast } from './components/StorageToast';
import { StorageToolbar } from './components/StorageToolbar';
import { useStorageBrowser } from './hooks/useStorageBrowser';
import { useStorageSelection } from './hooks/useStorageSelection';
import { useStorageTransfer } from './hooks/useStorageTransfer';
import type {
    ConfirmDialog,
    DeleteConfirm,
    OverwriteConfirm,
    RenameDialog,
    ToastState,
    ViewMode
} from './types';
import type { StorageBrowserItem } from './utils/storage-utils';

function getStoredViewMode(): ViewMode {
  const stored = localStorage.getItem('storage-view-mode');
  return stored === 'grid' || stored === 'list' ? stored : 'list';
}

function normalizeRoutePath(path: string | undefined): string {
  if (!path || path === '/') return '/';
  return normalizeDirectoryPath(path.startsWith('/') ? path : `/${path}`);
}

function buildUrlFromPath(path: string): string {
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return '/storage';
  return `/storage/${segments.map(segment => encodeURIComponent(segment)).join('/')}`;
}

export default function StoragePage(): React.JSX.Element {
  const rxdb = useRxDB();
  const navigate = useNavigate();
  const params = useParams();
  const routePath = normalizeRoutePath(params['*']);

  const [viewMode, setViewMode] = useState<ViewMode>(getStoredViewMode);
  const [previewEntry, setPreviewEntry] = useState<StorageBrowserItem | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [overwriteConfirm, setOverwriteConfirm] = useState<OverwriteConfirm>({
    show: false,
    file: null,
    existingEntry: null
  });
  const [contextMenu, setContextMenu] = useState<{
    show: boolean;
    x: number;
    y: number;
    entry: StorageBrowserItem | null;
  }>({ show: false, x: 0, y: 0, entry: null });
  const [renameDialog, setRenameDialog] = useState<RenameDialog>({ show: false, entry: null, newName: '' });
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm>({ show: false, entry: null });
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog>({ show: false, message: '' });
  const [toast, setToast] = useState<ToastState>({ show: false, message: '', type: 'info' });
  const [opfsAvailable, setOpfsAvailable] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const uploadFilesHandlerRef = useRef<(files: File[]) => void>(() => undefined);
  const uploadFolderFilesHandlerRef = useRef<(files: File[]) => void>(() => undefined);
  const initializedRef = useRef(false);

  const T = STORAGE_TESTID;
  const L = STORAGE_LABELS;

  const showToast = useCallback((message: string, type: ToastState['type'] = 'info') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ show: true, message, type });
    toastTimerRef.current = setTimeout(() => setToast({ show: false, message: '', type: 'info' }), 3000);
  }, []);

  const {
    allFiles,
    currentPath,
    currentPathRef,
    deleteEntry,
    entries,
    findExistingFileEntry,
    loading,
    navigateToPath,
    refresh,
    refreshRef,
    setCurrentPathImmediate
  } = useStorageBrowser(rxdb, showToast);
  const { clearSelection, handleEntryClick, selectedPaths, selectionBox, startBoxSelection } =
    useStorageSelection(entries);
  const { handleBatchDownload: downloadSelected, handleDownload, handleUpload, handleUploadFolder } =
    useStorageTransfer({
      rxdb,
      currentPath: () => currentPathRef.current,
      findExistingFileEntry,
      refresh: path => refresh(path ?? currentPathRef.current),
      showToast,
      uploadResolver: {
        resolve: (file, existingEntry) =>
          new Promise<boolean>(resolve => {
            setOverwriteConfirm({ show: true, file, existingEntry, resolve });
          })
      },
      fileInput: () => fileInputRef.current,
      folderInput: () => folderInputRef.current
    });

  useEffect(() => {
    void checkOPFSAvailable().then(setOpfsAvailable);

    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute('webkitdirectory', '');
      folderInputRef.current.setAttribute('directory', '');
    }
  }, []);

  useEffect(() => {
    const fileInput = fileInputRef.current;
    const folderInput = folderInputRef.current;

    if (!fileInput || !folderInput) {
      return;
    }

    const handleFileInputChange = () => {
      const files = fileInput.files ? Array.from(fileInput.files) : [];
      if (files.length > 0) {
        uploadFilesHandlerRef.current(files);
      }
    };

    const handleFolderInputChange = () => {
      const files = folderInput.files ? Array.from(folderInput.files) : [];
      if (files.length > 0) {
        uploadFolderFilesHandlerRef.current(files);
      }
    };

    fileInput.addEventListener('change', handleFileInputChange);
    folderInput.addEventListener('change', handleFolderInputChange);

    return () => {
      fileInput.removeEventListener('change', handleFileInputChange);
      folderInput.removeEventListener('change', handleFolderInputChange);
    };
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu({ show: false, x: 0, y: 0, entry: null });
  }, []);
  useGlobalDismiss(contextMenu.show, closeContextMenu);

  useEffect(() => {
    if (!initializedRef.current) return;
    navigate(buildUrlFromPath(currentPath), { replace: true });
  }, [currentPath, navigate]);

  useEffect(() => {
    localStorage.setItem('storage-view-mode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (!opfsAvailable || initializedRef.current) return;

    initializedRef.current = true;
    setCurrentPathImmediate(routePath);
    void refreshRef.current(routePath);
  }, [opfsAvailable, refreshRef, routePath, setCurrentPathImmediate]);

  useEffect(() => {
    if (!initializedRef.current || routePath === currentPathRef.current) return;

    setCurrentPathImmediate(routePath);
    clearSelection();
    closeContextMenu();
    setPreviewEntry(null);
    void refreshRef.current(routePath);
  }, [clearSelection, closeContextMenu, currentPathRef, refreshRef, routePath, setCurrentPathImmediate]);

  useEffect(() => {
    uploadFilesHandlerRef.current = files => {
      void handleUpload(files);
    };
  }, [handleUpload]);

  useEffect(() => {
    uploadFolderFilesHandlerRef.current = files => {
      void handleUploadFolder(files);
    };
  }, [handleUploadFolder]);

  const dirCount = entries.filter(entry => entry.kind === 'directory').length;
  const fileCount = entries.filter(entry => entry.kind === 'file').length;

  const confirm = (message: string): Promise<boolean> =>
    new Promise(resolve => setConfirmDialog({ show: true, message, resolve }));

  const resolveConfirm = (value: boolean) => {
    confirmDialog.resolve?.(value);
    setConfirmDialog({ show: false, message: '' });
  };

  const navigateTo = async (path: string) => {
    clearSelection();
    closeContextMenu();
    setPreviewEntry(null);
    await navigateToPath(path);
  };

  const handleDelete = async (entry: StorageBrowserItem) => {
    const shouldDelete = await new Promise<boolean>(resolve => {
      setDeleteConfirm({ show: true, entry, resolve });
    });

    if (!shouldDelete) {
      return;
    }

    const result = await deleteEntry(entry);
    if (!result) {
      showToast(`Delete failed: ${entry.name}`, 'error');
    }
  };

  const handleDeleteResponse = (confirmed: boolean) => {
    deleteConfirm.resolve?.(confirmed);
    setDeleteConfirm({ show: false, entry: null });
  };

  const handleOverwriteResponse = (confirmed: boolean) => {
    overwriteConfirm.resolve?.(confirmed);
    setOverwriteConfirm({ show: false, file: null, existingEntry: null });
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;

    try {
      await rxdb.storage.createDirectory(name, { path: currentPathRef.current });
      setShowNewFolder(false);
      setNewFolderName('');
      showToast('Folder created successfully', 'success');
      await refresh(currentPathRef.current);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const handleRename = async () => {
    if (!renameDialog.entry || !renameDialog.newName.trim()) return;

    try {
      if (renameDialog.entry.kind === 'file' && renameDialog.entry.meta) {
        await rxdb.storage.rename(renameDialog.entry.meta.id, renameDialog.newName.trim());
      } else {
        await rxdb.storage.renameDirectory(renameDialog.entry.path, renameDialog.newName.trim());
      }

      setRenameDialog({ show: false, entry: null, newName: '' });
      showToast('Rename successful', 'success');
      await refresh(currentPathRef.current);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    }
  }

  const handleBatchDelete = async () => {
    if (selectedPaths.size === 0) return;

    const selectedEntries = entries.filter(entry => selectedPaths.has(entry.path));
    const shouldDelete = await new Promise<boolean>(resolve => {
      setDeleteConfirm({
        show: true,
        entry: { name: `${selectedPaths.size} items`, kind: 'file', path: '' },
        resolve
      });
    });

    if (!shouldDelete) {
      return;
    }

    let failedCount = 0;
    for (const entry of selectedEntries) {
      const result = await deleteEntry(entry, false);
      if (!result) failedCount++;
    }

    await refresh(currentPathRef.current);

    if (failedCount > 0) {
      showToast(`${failedCount} items failed to delete`, 'error');
    } else {
      showToast(`Deleted ${selectedEntries.length} items`, 'success');
    }

    clearSelection();
  };

  const handleBatchDownload = async () => {
    const selectedEntries = entries.filter(entry => selectedPaths.has(entry.path));
    await downloadSelected(selectedEntries);
  };

  const handleContextMenu = (event: React.MouseEvent, entry: StorageBrowserItem) => {
    event.preventDefault();
    setContextMenu({ show: true, x: event.clientX, y: event.clientY, entry });
  };

  const handleContextMenuAction = async (action: StorageContextMenuAction) => {
    const entry = contextMenu.entry;
    closeContextMenu();

    if (!entry) {
      return;
    }

    switch (action) {
      case 'view':
        if (entry.kind === 'file') {
          setPreviewEntry(entry);
        } else {
          await navigateTo(entry.path);
        }
        break;
      case 'download':
        await handleDownload(entry);
        break;
      case 'rename':
        setRenameDialog({ show: true, entry, newName: entry.name });
        break;
      case 'delete':
        await handleDelete(entry);
        break;
    }
  };

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);

    if (!event.dataTransfer) return;

    const items = event.dataTransfer.items;
    if (items) {
      const droppedFiles: File[] = [];
      const promises: Promise<void>[] = [];

      for (let index = 0; index < items.length; index++) {
        const item = items[index];
        if (item.kind === 'file') {
          const entry = item.webkitGetAsEntry?.();
          if (entry) {
            promises.push(readDroppedEntryTree(entry, '', droppedFiles));
          }
        }
      }

      await Promise.all(promises);

      if (droppedFiles.length > 0) {
        const hasFolder = droppedFiles.some(file =>
          (file as File & { webkitRelativePath?: string }).webkitRelativePath?.includes('/')
        );
        if (hasFolder) {
          await handleUploadFolder(droppedFiles);
        } else {
          await handleUpload(droppedFiles);
        }
      }

      return;
    }

    if (event.dataTransfer.files) {
      await handleUpload(Array.from(event.dataTransfer.files));
    }
  };

  const handleMouseDown = (event: React.MouseEvent) => {
    if (viewMode !== 'grid' || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }

    const container = gridContainerRef.current;
    if (!container) {
      return;
    }

    startBoxSelection(event, container);
  };

  const onClearAll = async () => {
    const confirmed = await confirm(L.CONFIRM_CLEAR);
    if (!confirmed) {
      return;
    }

    try {
      await rxdb.storage.clear('/');
      clearSelection();
      setPreviewEntry(null);
      showToast(L.CLEAR_SUCCESS, 'success');
      await refresh('/');
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  return (
    <div className='flex h-full flex-col' data-testid={T.PAGE}>
      <StorageToolbar
        allFilesCount={allFiles.length}
        currentPath={currentPath}
        loading={loading}
        opfsAvailable={opfsAvailable}
        selectionSize={selectedPaths.size}
        viewMode={viewMode}
        onBatchDelete={() => void handleBatchDelete()}
        onBatchDownload={() => void handleBatchDownload()}
        onClearAll={() => void onClearAll()}
        onClearSelection={clearSelection}
        onNavigate={path => void navigateTo(path)}
        onNewFolder={() => setShowNewFolder(true)}
        onRefresh={() => void refresh(currentPathRef.current)}
        onUpload={() => fileInputRef.current?.click()}
        onUploadFolder={() => folderInputRef.current?.click()}
        onViewModeChange={setViewMode}
      />

      <div
        ref={gridContainerRef}
        className='relative flex-1 overflow-auto'
        onDragEnter={event => {
          setIsDragging(true);
          event.preventDefault();
        }}
        onDragLeave={event => {
          setIsDragging(false);
          event.preventDefault();
        }}
        onDragOver={event => event.preventDefault()}
        onDrop={event => void handleDrop(event)}
        onMouseDown={handleMouseDown}
      >
        {entries.length === 0 ?
          <div className='flex h-full items-center justify-center' data-testid={T.EMPTY_STATE}>
            <div className='text-center'>
              <Database className='text-base-content/30 mx-auto mb-4' size={48} />
              <p className='text-base-content/60 text-sm'>
                {currentPath === '/' ? L.NO_FILES : 'This folder is empty'}
              </p>
            </div>
          </div>
        : viewMode === 'list' ?
          <StorageFileList
            currentPath={currentPath}
            entries={entries}
            selectedPaths={selectedPaths}
            onContextMenu={handleContextMenu}
            onDelete={entry => void handleDelete(entry)}
            onDownload={entry => void handleDownload(entry)}
            onEntryClick={(entry, event) => handleEntryClick(entry, event)}
            onNavigate={entry => void navigateTo(entry.path)}
            onPreview={entry => setPreviewEntry(entry)}
          />
        : <StorageFileGrid
            currentPath={currentPath}
            entries={entries}
            selectedPaths={selectedPaths}
            onContextMenu={handleContextMenu}
            onDelete={entry => void handleDelete(entry)}
            onDownload={entry => void handleDownload(entry)}
            onEntryClick={(entry, event) => handleEntryClick(entry, event)}
            onNavigate={entry => void navigateTo(entry.path)}
            onPreview={entry => setPreviewEntry(entry)}
          />
        }

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

        {isDragging && (
          <div className='bg-primary/10 border-primary pointer-events-none absolute inset-0 z-50 flex items-center justify-center border-2 border-dashed'>
            <div className='bg-base-100 rounded-lg p-8 shadow-lg'>
              <Upload className='text-primary mx-auto mb-2' size={48} />
              <p className='text-primary text-lg font-semibold'>Drop files here to upload</p>
            </div>
          </div>
        )}
      </div>

      <div className='border-base-300 text-base-content/60 flex items-center gap-4 border-t px-3 py-1 text-xs'>
        <span>
          {entries.length} items ({dirCount} folders, {fileCount} files)
        </span>
      </div>

      <StorageFilePreview entry={previewEntry} onClose={() => setPreviewEntry(null)} />

      <StorageNewFolderDialog
        name={newFolderName}
        show={showNewFolder}
        onCancel={() => setShowNewFolder(false)}
        onConfirm={() => void handleCreateFolder()}
        onNameChange={setNewFolderName}
      />

      <StorageOverwriteDialog
        existingEntry={overwriteConfirm.existingEntry}
        file={overwriteConfirm.file}
        show={overwriteConfirm.show}
        onRespond={handleOverwriteResponse}
      />

      <StorageContextMenu
        entry={contextMenu.entry}
        show={contextMenu.show}
        x={contextMenu.x}
        y={contextMenu.y}
        onAction={action => void handleContextMenuAction(action)}
      />

      <StorageDeleteDialog
        entry={deleteConfirm.entry}
        show={deleteConfirm.show}
        onRespond={handleDeleteResponse}
      />

      <StorageRenameDialog
        entry={renameDialog.entry}
        newName={renameDialog.newName}
        show={renameDialog.show}
        onCancel={() => setRenameDialog({ show: false, entry: null, newName: '' })}
        onConfirm={() => void handleRename()}
        onNameChange={name => setRenameDialog(previous => ({ ...previous, newName: name }))}
      />

      <StorageConfirmDialog
        message={confirmDialog.message}
        show={confirmDialog.show}
        onRespond={resolveConfirm}
      />

      <StorageToast
        toast={toast}
        onClose={() => setToast({ show: false, message: '', type: 'info' })}
      />

      <input ref={fileInputRef} className='hidden' data-testid={T.FILE_INPUT} multiple type='file' />
      <input ref={folderInputRef} className='hidden' data-testid={T.FOLDER_INPUT} type='file' />
    </div>
  );
}
