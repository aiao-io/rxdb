import {
  joinDirectoryAndFileName,
  normalizeDirectoryPath,
  StorageBrowserEntry,
  StorageFileMeta
} from '@aiao/rxdb-plugin-storage';
import { useRxDB } from '@aiao/rxdb-react';
import { checkOPFSAvailable, formatFileSize, STORAGE_LABELS, STORAGE_TESTID } from '@aiao/utils';
import { zipSync, type Zippable } from 'fflate';
import {
  AlertTriangle,
  ChevronRight,
  Database,
  Download,
  Edit3,
  Eye,
  Folder,
  FolderOpen,
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
import { useGlobalDismiss } from '../hooks/useGlobalDismiss';
import { readDroppedEntryTree } from '../utils/read-directory-entries';
import { StorageFileGrid } from './storage/components/StorageFileGrid';
import { StorageFileList } from './storage/components/StorageFileList';
import { StorageFilePreview } from './storage/components/StorageFilePreview';
import { StorageBrowserItem } from './storage/utils/storage-utils';

type ViewMode = 'list' | 'grid';

interface ConfirmDialog {
  show: boolean;
  message: string;
  resolve?: (value: boolean) => void;
}

interface DeleteConfirm {
  show: boolean;
  entry: StorageBrowserItem | null;
  resolve?: (value: boolean) => void;
}

interface RenameDialog {
  show: boolean;
  entry: StorageBrowserItem | null;
  newName: string;
}

interface OverwriteConfirm {
  show: boolean;
  file: File | null;
  existingEntry: StorageBrowserItem | null;
  resolve?: (value: boolean) => void;
}

interface ContextMenu {
  show: boolean;
  x: number;
  y: number;
  entry: StorageBrowserItem | null;
}

interface Toast {
  show: boolean;
  message: string;
  type: 'error' | 'success' | 'info';
}

interface SelectionBox {
  active: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

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

function waitFor(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function toTimestamp(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const timestamp = new Date(value).getTime();
    return Number.isNaN(timestamp) ? undefined : timestamp;
  }

  return undefined;
}

function mapStorageEntry(entry: StorageBrowserEntry): StorageBrowserItem {
  if (entry.kind === 'directory') {
    return {
      kind: 'directory',
      name: entry.name,
      path: entry.path
    };
  }

  return {
    kind: 'file',
    name: entry.meta.name,
    path: entry.path,
    meta: entry.meta,
    size: entry.meta.size,
    type: entry.meta.mimeType,
    lastModified: toTimestamp(entry.meta.updatedAt ?? entry.meta.createdAt)
  };
}

export default function StoragePage() {
  const rxdb = useRxDB();
  const navigate = useNavigate();
  const params = useParams();
  const routePath = normalizeRoutePath(params['*']);

  const [allFiles, setAllFiles] = useState<StorageFileMeta[]>([]);
  const [entries, setEntries] = useState<StorageBrowserItem[]>([]);
  const [currentPath, setCurrentPath] = useState('/');
  const [loading, setLoading] = useState(false);
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
  const [contextMenu, setContextMenu] = useState<ContextMenu>({ show: false, x: 0, y: 0, entry: null });
  const [renameDialog, setRenameDialog] = useState<RenameDialog>({ show: false, entry: null, newName: '' });
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm>({ show: false, entry: null });
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog>({ show: false, message: '' });
  const [toast, setToast] = useState<Toast>({ show: false, message: '', type: 'info' });
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [lastSelectedPath, setLastSelectedPath] = useState<string | null>(null);
  const [opfsAvailable, setOpfsAvailable] = useState(false);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mouseMoveRef = useRef<((event: MouseEvent) => void) | null>(null);
  const mouseUpRef = useRef<(() => void) | null>(null);
  const uploadFilesHandlerRef = useRef<(files: File[]) => void>(() => undefined);
  const uploadFolderFilesHandlerRef = useRef<(files: File[]) => void>(() => undefined);
  const refreshCurrentDirectoryRef = useRef<(path?: string) => Promise<void>>(async () => undefined);
  const initializedRef = useRef(false);
  const currentPathRef = useRef('/');
  const allFilesRef = useRef<StorageFileMeta[]>([]);

  const T = STORAGE_TESTID;
  const L = STORAGE_LABELS;

  useEffect(() => {
    currentPathRef.current = currentPath;
  }, [currentPath]);

  useEffect(() => {
    allFilesRef.current = allFiles;
  }, [allFiles]);

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

  // P1-3：原先这里只有一个**常驻**的 window click 监听（菜单没开也在听），且**没有 Escape**。
  // 换成与 OPFS 共用的 useGlobalDismiss：只在菜单可见时挂监听，click 与 Escape 一起支持。
  const closeContextMenu = useCallback(() => {
    setContextMenu({ show: false, x: 0, y: 0, entry: null });
  }, []);
  useGlobalDismiss(contextMenu.show, closeContextMenu);

  useEffect(() => {
    return () => {
      if (mouseMoveRef.current) window.removeEventListener('mousemove', mouseMoveRef.current);
      if (mouseUpRef.current) window.removeEventListener('mouseup', mouseUpRef.current);
    };
  }, []);

  useEffect(() => {
    if (!initializedRef.current) return;
    navigate(buildUrlFromPath(currentPath), { replace: true });
  }, [currentPath, navigate]);

  useEffect(() => {
    localStorage.setItem('storage-view-mode', viewMode);
  }, [viewMode]);

  const showToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ show: true, message, type });
    toastTimerRef.current = setTimeout(() => setToast({ show: false, message: '', type: 'info' }), 3000);
  }, []);

  const pathSegments = currentPath
    .split('/')
    .filter(Boolean)
    .map((segment, index, segments) => ({
      name: segment,
      path: '/' + segments.slice(0, index + 1).join('/')
    }));

  const dirCount = entries.filter(entry => entry.kind === 'directory').length;
  const fileCount = entries.filter(entry => entry.kind === 'file').length;

  const confirm = (message: string): Promise<boolean> =>
    new Promise(resolve => setConfirmDialog({ show: true, message, resolve }));

  const resolveConfirm = (value: boolean) => {
    confirmDialog.resolve?.(value);
    setConfirmDialog({ show: false, message: '' });
  };

  const refreshCurrentDirectory = useCallback(
    async (path = currentPathRef.current) => {
      async function run(targetPath: string): Promise<void> {
        setLoading(true);

        try {
          const listedFiles = await rxdb.storage.list();
          const sortedFiles = [...listedFiles].sort((a, b) => a.opfsPath.localeCompare(b.opfsPath));
          setAllFiles(sortedFiles);
          allFilesRef.current = sortedFiles;

          const listedEntries = await rxdb.storage.listEntries({ path: targetPath });
          const mappedEntries = listedEntries.map(mapStorageEntry).sort((left, right) => {
            if (left.kind !== right.kind) {
              return left.kind === 'directory' ? -1 : 1;
            }

            return left.name.localeCompare(right.name);
          });
          setEntries(mappedEntries);

          const validPaths = new Set(mappedEntries.map(entry => entry.path));
          setSelectedPaths(previous => new Set([...previous].filter(pathItem => validPaths.has(pathItem))));
          setLastSelectedPath(previous => (previous && !validPaths.has(previous) ? null : previous));
        } catch (err) {
          if (targetPath !== '/') {
            setCurrentPath('/');
            currentPathRef.current = '/';
            await run('/');
            return;
          }

          setEntries([]);
          const message = err instanceof Error ? err.message : String(err);
          showToast(message || 'Unknown error', 'error');
        } finally {
          setLoading(false);
        }
      }

      await run(path);
    },
    [rxdb, showToast]
  );

  useEffect(() => {
    refreshCurrentDirectoryRef.current = refreshCurrentDirectory;
  }, [refreshCurrentDirectory]);

  useEffect(() => {
    if (!opfsAvailable || initializedRef.current) return;

    initializedRef.current = true;
    setCurrentPath(routePath);
    currentPathRef.current = routePath;
    void refreshCurrentDirectoryRef.current(routePath);
  }, [opfsAvailable, routePath]);

  useEffect(() => {
    if (!initializedRef.current || routePath === currentPathRef.current) return;

    setCurrentPath(routePath);
    currentPathRef.current = routePath;
    setSelectedPaths(new Set());
    setLastSelectedPath(null);
    setContextMenu({ show: false, x: 0, y: 0, entry: null });
    setPreviewEntry(null);
    void refreshCurrentDirectoryRef.current(routePath);
  }, [routePath]);

  const navigateTo = async (path: string) => {
    const nextPath = normalizeDirectoryPath(path);
    setCurrentPath(nextPath);
    currentPathRef.current = nextPath;
    setSelectedPaths(new Set());
    setLastSelectedPath(null);
    setContextMenu({ show: false, x: 0, y: 0, entry: null });
    setPreviewEntry(null);
    await refreshCurrentDirectory(nextPath);
  };

  const findExistingFileEntry = useCallback((fileName: string, directoryPath: string): StorageBrowserItem | null => {
    const targetOpfsPath = joinDirectoryAndFileName(directoryPath, fileName);
    const meta = allFilesRef.current.find(file => file.opfsPath === targetOpfsPath);

    if (!meta) {
      return null;
    }

    return mapStorageEntry({
      kind: 'file',
      name: meta.name,
      path: `/${meta.opfsPath}`,
      meta
    });
  }, []);

  const getUploadDirectory = useCallback((relativePath: string): string => {
    const segments = relativePath.replace(/\\/g, '/').split('/').filter(Boolean);
    if (segments.length <= 1) {
      return currentPathRef.current;
    }

    return normalizeDirectoryPath([currentPathRef.current, ...segments.slice(0, -1)].join('/'));
  }, []);

  const deleteEntry = async (entry: StorageBrowserItem, refresh = true): Promise<boolean> => {
    try {
      if (entry.kind === 'file' && entry.meta) {
        await rxdb.storage.delete(entry.meta.id);
      } else {
        await rxdb.storage.clear(entry.path);
      }

      if (refresh) await refreshCurrentDirectory(currentPathRef.current);
      return true;
    } catch {
      return false;
    }
  };

  const ensureZipDirectory = (zipTree: Zippable, pathItems: string[]): Zippable => {
    let currentDirectory = zipTree;

    for (const segment of pathItems) {
      const existingEntry = currentDirectory[segment];

      if (!existingEntry || Array.isArray(existingEntry) || existingEntry instanceof Uint8Array) {
        currentDirectory[segment] = {};
      }

      currentDirectory = currentDirectory[segment] as Zippable;
    }

    return currentDirectory;
  };

  const addEntryToZip = async (
    zipTree: Zippable,
    entry: StorageBrowserItem,
    zipPathItems: string[]
  ): Promise<number> => {
    if (entry.kind === 'file') {
      if (!entry.meta) {
        return 0;
      }

      const blob = await rxdb.storage.read(entry.meta.id);
      const parentDirectory = ensureZipDirectory(zipTree, zipPathItems.slice(0, -1));
      const fileName = zipPathItems[zipPathItems.length - 1];
      parentDirectory[fileName] = new Uint8Array(await blob.arrayBuffer());
      return 1;
    }

    ensureZipDirectory(zipTree, zipPathItems);
    const childEntries = await rxdb.storage.listEntries({ path: entry.path });
    let fileCount = 0;

    for (const childEntry of childEntries) {
      fileCount += await addEntryToZip(zipTree, mapStorageEntry(childEntry), [...zipPathItems, childEntry.name]);
    }

    return fileCount;
  };

  const downloadBlob = async (blob: Blob, suggestedName: string): Promise<void> => {
    const windowWithPicker = window as Window & {
      showSaveFilePicker?: (options: { suggestedName: string }) => Promise<FileSystemFileHandle>;
    };

    if (windowWithPicker.showSaveFilePicker) {
      try {
        const saveHandle = await windowWithPicker.showSaveFilePicker({ suggestedName });
        const writable = await saveHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        throw error;
      }
    }

    const url = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = suggestedName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

  const downloadEntriesAsZip = async (items: StorageBrowserItem[], suggestedName: string): Promise<number> => {
    const zipTree: Zippable = {};
    let fileCount = 0;

    for (const entry of items) {
      fileCount += await addEntryToZip(zipTree, entry, [entry.name]);
    }

    const zipData = zipSync(zipTree, { level: 6 });
    const zipBuffer = new ArrayBuffer(zipData.byteLength);
    const zipBytes = new Uint8Array(zipBuffer);
    zipBytes.set(zipData);
    await downloadBlob(new Blob([zipBuffer], { type: 'application/zip' }), suggestedName);

    return fileCount;
  };

  const getBatchArchiveName = () => {
    const folderName = currentPathRef.current.split('/').filter(Boolean).pop() || 'storage';
    return `${folderName}.zip`;
  };

  const handleDownload = async (entry: StorageBrowserItem) => {
    if (entry.kind === 'directory') {
      showToast(`Preparing ${entry.name}...`, 'info');

      try {
        const fileCount = await downloadEntriesAsZip([entry], `${entry.name}.zip`);
        showToast(
          fileCount === 0 ?
            `Downloaded empty folder ${entry.name}`
          : `Downloaded ${fileCount} files from ${entry.name}`,
          'success'
        );
      } catch (err) {
        showToast(err instanceof Error ? err.message : String(err), 'error');
      }

      return;
    }

    if (!entry.meta) {
      return;
    }

    try {
      await rxdb.storage.download(entry.meta.id);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    }
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

  const handleUpload = useCallback(
    async (files?: File[]) => {
      const filesToUpload = files || (fileInputRef.current?.files ? Array.from(fileInputRef.current.files) : null);
      if (!filesToUpload || filesToUpload.length === 0) return;

      let successCount = 0;

      for (const file of filesToUpload) {
        const existingFile = findExistingFileEntry(file.name, currentPathRef.current);
        let overwrite = false;

        if (existingFile) {
          const shouldOverwrite = await new Promise<boolean>(resolve => {
            setOverwriteConfirm({ show: true, file, existingEntry: existingFile, resolve });
          });

          if (!shouldOverwrite) {
            continue;
          }

          overwrite = true;
        }

        try {
          await rxdb.storage.upload(file, { path: currentPathRef.current, overwrite });
          successCount++;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          showToast(message.includes('already exists') ? L.FILE_EXISTS : message, 'error');
          return;
        }
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      if (successCount > 0) {
        showToast(successCount === 1 ? L.UPLOAD_SUCCESS : `Uploaded ${successCount} files`, 'success');
        await refreshCurrentDirectory(currentPathRef.current);
        await waitFor(100);
        await refreshCurrentDirectory(currentPathRef.current);
      }
    },
    [findExistingFileEntry, refreshCurrentDirectory, rxdb, showToast, L.FILE_EXISTS, L.UPLOAD_SUCCESS]
  );

  const handleUploadFolder = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      showToast(`Uploading folder with ${files.length} files...`, 'info');

      let successCount = 0;
      let failedCount = 0;

      for (const file of files) {
        const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        const targetDirectory = getUploadDirectory(relativePath);
        const existingFile = findExistingFileEntry(file.name, targetDirectory);
        let overwrite = false;

        if (existingFile) {
          const shouldOverwrite = await new Promise<boolean>(resolve => {
            setOverwriteConfirm({ show: true, file, existingEntry: existingFile, resolve });
          });

          if (!shouldOverwrite) {
            continue;
          }

          overwrite = true;
        }

        try {
          await rxdb.storage.upload(file, { path: targetDirectory, overwrite });
          successCount++;
        } catch {
          failedCount++;
        }
      }

      if (folderInputRef.current) {
        folderInputRef.current.value = '';
      }

      await refreshCurrentDirectory(currentPathRef.current);
      await waitFor(100);
      await refreshCurrentDirectory(currentPathRef.current);

      if (failedCount > 0) {
        showToast(`Upload finished: ${successCount} succeeded, ${failedCount} failed`, 'error');
      } else {
        showToast(`Uploaded ${successCount} files`, 'success');
      }
    },
    [findExistingFileEntry, getUploadDirectory, refreshCurrentDirectory, rxdb, showToast]
  );

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
      await refreshCurrentDirectory(currentPathRef.current);
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
      await refreshCurrentDirectory(currentPathRef.current);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

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

    await refreshCurrentDirectory(currentPathRef.current);

    if (failedCount > 0) {
      showToast(`${failedCount} items failed to delete`, 'error');
    } else {
      showToast(`Deleted ${selectedEntries.length} items`, 'success');
    }

    setSelectedPaths(new Set());
    setLastSelectedPath(null);
  };

  const handleBatchDownload = async () => {
    const selectedEntries = entries.filter(entry => selectedPaths.has(entry.path));

    if (selectedEntries.length === 0) {
      showToast('No files selected', 'error');
      return;
    }

    if (selectedEntries.length === 1) {
      await handleDownload(selectedEntries[0]);
      return;
    }

    showToast(`Preparing ${selectedEntries.length} items...`, 'info');

    try {
      const fileCount = await downloadEntriesAsZip(selectedEntries, getBatchArchiveName());
      showToast(
        fileCount === 0 ?
          `Downloaded ${selectedEntries.length} empty folders`
        : `Downloaded ${selectedEntries.length} items (${fileCount} files)`,
        'success'
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const handleEntryClick = (entry: StorageBrowserItem, event: React.MouseEvent) => {
    if (event.ctrlKey || event.metaKey) {
      setSelectedPaths(previous => {
        const next = new Set(previous);
        if (next.has(entry.path)) {
          next.delete(entry.path);
        } else {
          next.add(entry.path);
        }

        return next;
      });
      setLastSelectedPath(entry.path);
      return;
    }

    if (event.shiftKey && lastSelectedPath) {
      const startIndex = entries.findIndex(item => item.path === lastSelectedPath);
      const endIndex = entries.findIndex(item => item.path === entry.path);

      if (startIndex !== -1 && endIndex !== -1) {
        const [start, end] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
        setSelectedPaths(previous => {
          const next = new Set(previous);
          for (let index = start; index <= end; index++) {
            next.add(entries[index].path);
          }

          return next;
        });
      }

      return;
    }

    setSelectedPaths(new Set([entry.path]));
    setLastSelectedPath(entry.path);
  };

  const handleContextMenu = (event: React.MouseEvent, entry: StorageBrowserItem) => {
    event.preventDefault();
    setContextMenu({ show: true, x: event.clientX, y: event.clientY, entry });
  };

  const handleContextMenuAction = async (action: 'view' | 'download' | 'rename' | 'delete') => {
    const entry = contextMenu.entry;
    setContextMenu({ show: false, x: 0, y: 0, entry: null });

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

    const target = event.target as HTMLElement;
    if (target.closest('button') || target.closest('a') || target.closest('[role="button"]')) {
      return;
    }

    const container = gridContainerRef.current;
    if (!container) {
      return;
    }

    const rect = container.getBoundingClientRect();
    const startX = event.clientX - rect.left;
    const startY = event.clientY - rect.top;
    setSelectionBox({ active: true, startX, startY, currentX: startX, currentY: startY });

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const containerRect = container.getBoundingClientRect();
      const currentX = moveEvent.clientX - containerRect.left;
      const currentY = moveEvent.clientY - containerRect.top;
      setSelectionBox({ active: true, startX, startY, currentX, currentY });

      const boxLeft = Math.min(startX, currentX) + containerRect.left;
      const boxTop = Math.min(startY, currentY) + containerRect.top;
      const boxRight = Math.max(startX, currentX) + containerRect.left;
      const boxBottom = Math.max(startY, currentY) + containerRect.top;

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
          if (path) {
            selected.add(path);
          }
        }
      });

      setSelectedPaths(selected);
    };

    const handleMouseUp = () => {
      setSelectionBox(null);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      mouseMoveRef.current = null;
      mouseUpRef.current = null;
    };

    mouseMoveRef.current = handleMouseMove;
    mouseUpRef.current = handleMouseUp;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const onClearAll = async () => {
    const confirmed = await confirm(L.CONFIRM_CLEAR);
    if (!confirmed) {
      return;
    }

    try {
      await rxdb.storage.clear('/');
      setSelectedPaths(new Set());
      setLastSelectedPath(null);
      setPreviewEntry(null);
      showToast(L.CLEAR_SUCCESS, 'success');
      await refreshCurrentDirectory('/');
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const isBatchDeleteEntry = (entry: StorageBrowserItem | null) => !!entry && !entry.path;

  return (
    <div className='flex h-full flex-col' data-testid={T.PAGE}>
      <div className='border-base-300 flex items-center justify-between border-b px-3 py-2'>
        <div className='flex items-center gap-3'>
          <span className='text-sm font-bold'>{L.PAGE_TITLE}</span>
          <div className='flex items-center gap-1.5'>
            <div className={`h-2 w-2 rounded-full ${opfsAvailable ? 'bg-success' : 'bg-error'}`} />
            <span className='text-base-content/60 text-xs'>{opfsAvailable ? 'Connected' : 'Disconnected'}</span>
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

      <div className='border-base-300 flex items-center gap-2 border-b p-2'>
        <button className='btn btn-xs btn-ghost' onClick={() => void navigateTo('/')} title='Root'>
          <Home size={16} />
        </button>
        <button
          className='btn btn-xs btn-ghost'
          onClick={() => void refreshCurrentDirectory(currentPathRef.current)}
          title='Refresh'
        >
          <RefreshCw className={loading ? 'animate-spin' : ''} size={16} />
        </button>
        <div className='divider divider-horizontal m-0' />
        <button
          className='btn btn-xs btn-primary'
          data-testid={T.UPLOAD_BTN}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={16} /> {L.UPLOAD}
        </button>
        <button
          className='btn btn-xs btn-primary'
          data-testid={T.UPLOAD_FOLDER_BTN}
          onClick={() => folderInputRef.current?.click()}
        >
          <Folder size={16} /> Upload Folder
        </button>
        <button
          className='btn btn-xs btn-secondary'
          data-testid={T.NEW_FOLDER_BTN}
          onClick={() => setShowNewFolder(true)}
        >
          <FolderPlus size={16} /> New Folder
        </button>
        {selectedPaths.size > 0 && (
          <>
            <div className='divider divider-horizontal m-0' />
            <span className='text-base-content/60 text-xs'>Selected {selectedPaths.size} items</span>
            <button
              className='btn btn-xs btn-ghost'
              data-testid={T.CLEAR_SELECTION_BTN}
              onClick={() => {
                setSelectedPaths(new Set());
                setLastSelectedPath(null);
              }}
              title='Clear selection'
            >
              <X size={14} />
            </button>
            <button
              className='btn btn-xs btn-info'
              data-testid={T.BATCH_DOWNLOAD_BTN}
              onClick={() => void handleBatchDownload()}
              title='Batch download'
            >
              <Download size={16} /> Download
            </button>
            <button
              className='btn btn-xs btn-error'
              data-testid={T.BATCH_DELETE_BTN}
              onClick={() => void handleBatchDelete()}
              title='Batch delete'
            >
              <Trash2 size={16} /> Delete
            </button>
          </>
        )}
        {currentPath === '/' && allFiles.length > 0 && (
          <>
            <div className='divider divider-horizontal m-0' />
            <button
              className='btn btn-xs btn-error btn-outline'
              data-testid={T.CLEAR_BTN}
              onClick={() => void onClearAll()}
            >
              <Trash2 size={16} /> {L.CLEAR_ALL}
            </button>
          </>
        )}
      </div>

      <div className='border-base-300 flex items-center gap-1 border-b px-3 py-2 text-sm'>
        <button className='hover:underline' onClick={() => void navigateTo('/')}>
          Root
        </button>
        {pathSegments.map(segment => (
          <div key={segment.path} className='flex items-center gap-1'>
            <ChevronRight className='text-base-content/40' size={14} />
            <button className='hover:underline' onClick={() => void navigateTo(segment.path)}>
              {segment.name}
            </button>
          </div>
        ))}
      </div>

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
            onEntryClick={handleEntryClick}
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
            onEntryClick={handleEntryClick}
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

      {showNewFolder && (
        <div className='modal modal-open' data-testid={T.NEW_FOLDER_DIALOG} onClick={() => setShowNewFolder(false)}>
          <div className='modal-box' onClick={event => event.stopPropagation()}>
            <h3 className='mb-4 text-base font-bold'>New Folder</h3>
            <input
              className='input input-bordered w-full'
              data-testid={T.NEW_FOLDER_INPUT}
              onChange={event => setNewFolderName(event.target.value)}
              onKeyDown={event => event.key === 'Enter' && void handleCreateFolder()}
              placeholder='Folder name'
              type='text'
              value={newFolderName}
            />
            <div className='modal-action'>
              <button className='btn btn-sm' onClick={() => setShowNewFolder(false)}>
                Cancel
              </button>
              <button
                className='btn btn-sm btn-primary'
                data-testid={T.NEW_FOLDER_CONFIRM}
                onClick={() => void handleCreateFolder()}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {overwriteConfirm.show && overwriteConfirm.file && overwriteConfirm.existingEntry && (
        <div className='modal modal-open' onClick={() => handleOverwriteResponse(false)}>
          <div className='modal-box' onClick={event => event.stopPropagation()}>
            <h3 className='mb-4 flex items-center gap-2 text-base font-bold'>
              <AlertTriangle className='text-warning' size={18} /> File Already Exists
            </h3>
            <p className='mb-4'>
              File <span className='font-semibold'>{overwriteConfirm.file.name}</span> already exists. Overwrite it?
            </p>
            <div className='bg-base-200 mb-4 space-y-2 rounded-lg p-3'>
              <div className='flex justify-between text-sm'>
                <span className='text-base-content/60'>Existing file:</span>
                <span className='font-mono'>{formatFileSize(overwriteConfirm.existingEntry.size || 0)}</span>
              </div>
              <div className='flex justify-between text-sm'>
                <span className='text-base-content/60'>New file:</span>
                <span className='font-mono'>{formatFileSize(overwriteConfirm.file.size)}</span>
              </div>
            </div>
            <div className='modal-action'>
              <button className='btn btn-sm' onClick={() => handleOverwriteResponse(false)}>
                Cancel
              </button>
              <button className='btn btn-sm btn-warning' onClick={() => handleOverwriteResponse(true)}>
                Overwrite
              </button>
            </div>
          </div>
        </div>
      )}

      {contextMenu.show && contextMenu.entry && (
        // P1-4：容器必须是 <ul>。菜单项是 <li>，而 <li> 的内容模型要求父级为 ul / ol / menu，
        // 挂在 <div> 下浏览器不给 list 语义，辅助技术读不到"这是一个 4 项菜单"。
        // （daisyUI 的 `menu` 类本身也是给 <ul> 用的。）
        <ul
          className='menu border-base-content/10 bg-base-300/95 fixed z-50 w-40 rounded-lg border p-1.5 text-sm shadow-2xl'
          data-testid={T.CONTEXT_MENU}
          onClick={event => event.stopPropagation()}
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)'
          }}
        >
          <li>
            <button
              className='w-full gap-2 px-2 py-1.5 text-left'
              data-testid={T.CONTEXT_VIEW}
              onClick={() => void handleContextMenuAction('view')}
              type='button'
            >
              {contextMenu.entry.kind === 'file' ?
                <>
                  <Eye size={14} />
                  <span>View</span>
                </>
              : <>
                  <FolderOpen size={14} />
                  <span>Open</span>
                </>
              }
            </button>
          </li>
          <li>
            <button
              className='w-full gap-2 px-2 py-1.5 text-left'
              data-testid={T.CONTEXT_DOWNLOAD}
              onClick={() => void handleContextMenuAction('download')}
              type='button'
            >
              <Download size={14} />
              <span>{contextMenu.entry.kind === 'file' ? 'Download' : 'Download ZIP'}</span>
            </button>
          </li>
          <li>
            <button
              className='w-full gap-2 px-2 py-1.5 text-left'
              data-testid={T.CONTEXT_RENAME}
              onClick={() => void handleContextMenuAction('rename')}
              type='button'
            >
              <Edit3 size={14} />
              <span>Rename</span>
            </button>
          </li>
          <li>
            <button
              className='text-error w-full gap-2 px-2 py-1.5 text-left'
              data-testid={T.CONTEXT_DELETE}
              onClick={() => void handleContextMenuAction('delete')}
              type='button'
            >
              <Trash2 size={14} />
              <span>Delete</span>
            </button>
          </li>
        </ul>
      )}

      {deleteConfirm.show && deleteConfirm.entry && (
        <div className='modal modal-open' data-testid={T.CONFIRM_DIALOG} onClick={() => handleDeleteResponse(false)}>
          <div className='modal-box' onClick={event => event.stopPropagation()}>
            <h3 className='mb-4 flex items-center gap-2 text-base font-bold'>
              <Trash2 className='text-error' size={18} /> Confirm Delete
            </h3>
            {isBatchDeleteEntry(deleteConfirm.entry) ?
              <p className='mb-4'>
                Are you sure you want to delete
                <span className='text-error font-semibold'>{deleteConfirm.entry.name}</span>?
              </p>
            : <>
                <p className='mb-4'>
                  Are you sure you want to delete
                  <span className='font-semibold'>{deleteConfirm.entry.kind === 'file' ? 'file' : 'folder'}</span>
                  <span className='text-error font-semibold'>{deleteConfirm.entry.name}</span>?
                </p>
                {deleteConfirm.entry.kind === 'directory' && (
                  <p className='text-warning mb-4 flex items-center gap-1 text-sm'>
                    <AlertTriangle size={16} /> This will delete the folder and all of its contents.
                  </p>
                )}
              </>
            }
            <div className='modal-action'>
              <button className='btn btn-sm' data-testid={T.CONFIRM_NO} onClick={() => handleDeleteResponse(false)}>
                Cancel
              </button>
              <button
                className='btn btn-sm btn-error'
                data-testid={T.CONFIRM_YES}
                onClick={() => handleDeleteResponse(true)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {renameDialog.show && renameDialog.entry && (
        <div
          className='modal modal-open'
          data-testid={T.RENAME_DIALOG}
          onClick={() => setRenameDialog({ show: false, entry: null, newName: '' })}
        >
          <div className='modal-box' onClick={event => event.stopPropagation()}>
            <h3 className='mb-4 text-base font-bold'>
              Rename {renameDialog.entry.kind === 'file' ? 'File' : 'Folder'}
            </h3>
            <input
              className='input input-bordered w-full'
              data-testid={T.RENAME_INPUT}
              onChange={event => setRenameDialog(previous => ({ ...previous, newName: event.target.value }))}
              onKeyDown={event => event.key === 'Enter' && void handleRename()}
              placeholder={renameDialog.entry.kind === 'file' ? 'File name' : 'Folder name'}
              type='text'
              value={renameDialog.newName}
            />
            <div className='modal-action'>
              <button className='btn btn-sm' onClick={() => setRenameDialog({ show: false, entry: null, newName: '' })}>
                Cancel
              </button>
              <button
                className='btn btn-sm btn-primary'
                data-testid={T.RENAME_CONFIRM}
                onClick={() => void handleRename()}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDialog.show && (
        <div className='modal modal-open' data-testid={T.CONFIRM_DIALOG} onClick={() => resolveConfirm(false)}>
          <div className='modal-box' onClick={event => event.stopPropagation()}>
            <h3 className='mb-4 flex items-center gap-2 text-base font-bold'>
              <AlertTriangle className='text-warning' size={18} /> Confirm Action
            </h3>
            <p className='mb-4'>{confirmDialog.message}</p>
            <div className='modal-action'>
              <button className='btn btn-sm' data-testid={T.CONFIRM_NO} onClick={() => resolveConfirm(false)}>
                Cancel
              </button>
              <button className='btn btn-sm btn-error' data-testid={T.CONFIRM_YES} onClick={() => resolveConfirm(true)}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {toast.show && (
        <div className='toast toast-top toast-end'>
          <div
            className={`alert ${
              toast.type === 'success' ? 'alert-success'
              : toast.type === 'error' ? 'alert-error'
              : 'alert-info'
            }`}
            data-testid={
              toast.type === 'success' ? T.SUCCESS_TOAST
              : toast.type === 'error' ?
                T.ERROR_TOAST
              : undefined
            }
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

      <input ref={fileInputRef} className='hidden' data-testid={T.FILE_INPUT} multiple type='file' />
      <input ref={folderInputRef} className='hidden' data-testid={T.FOLDER_INPUT} type='file' />
    </div>
  );
}
