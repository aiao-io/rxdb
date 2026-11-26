import type { RxDB } from '@aiao/rxdb';
import { normalizeDirectoryPath } from '@aiao/rxdb-plugin-storage';
import { fileError, fileMessage, type FileMessage } from '@modules/demo-i18n/files';
import { zipSync, type Zippable } from 'fflate';
import { useCallback, useLayoutEffect, useRef } from 'react';
import type { ToastState } from '../types';
import type { StorageBrowserItem } from '../utils/storage-utils';
import { mapStorageEntry } from './useStorageBrowser';

export function waitFor(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

export function getUploadDirectory(relativePath: string, currentPath: string): string {
  const segments = relativePath.replace(/\\/g, '/').split('/').filter(Boolean);
  if (segments.length <= 1) {
    return currentPath;
  }

  const joined = [currentPath, ...segments.slice(0, -1)].join('/');
  return normalizeDirectoryPath(joined.replace(/\/+/g, '/'));
}

function ensureZipDirectory(zipTree: Zippable, pathItems: string[]): Zippable {
  let currentDirectory = zipTree;

  for (const segment of pathItems) {
    const existingEntry = currentDirectory[segment];

    if (!existingEntry || Array.isArray(existingEntry) || existingEntry instanceof Uint8Array) {
      currentDirectory[segment] = {};
    }

    currentDirectory = currentDirectory[segment] as Zippable;
  }

  return currentDirectory;
}

async function addEntryToZip(
  rxdb: RxDB,
  zipTree: Zippable,
  entry: StorageBrowserItem,
  zipPathItems: string[]
): Promise<number> {
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
    fileCount += await addEntryToZip(rxdb, zipTree, mapStorageEntry(childEntry), [...zipPathItems, childEntry.name]);
  }

  return fileCount;
}

async function downloadBlob(blob: Blob, suggestedName: string): Promise<void> {
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
}

async function downloadEntriesAsZip(rxdb: RxDB, items: StorageBrowserItem[], suggestedName: string): Promise<number> {
  const zipTree: Zippable = {};
  let fileCount = 0;

  for (const entry of items) {
    fileCount += await addEntryToZip(rxdb, zipTree, entry, [entry.name]);
  }

  const zipData = zipSync(zipTree, { level: 6 });
  const zipBuffer = new ArrayBuffer(zipData.byteLength);
  const zipBytes = new Uint8Array(zipBuffer);
  zipBytes.set(zipData);
  await downloadBlob(new Blob([zipBuffer], { type: 'application/zip' }), suggestedName);

  return fileCount;
}

interface UploadResolver {
  resolve(file: File, existingEntry: StorageBrowserItem): Promise<boolean>;
}

interface StorageTransferDeps {
  rxdb: RxDB;
  currentPath: () => string;
  findExistingFileEntry: (fileName: string, directoryPath: string) => StorageBrowserItem | null;
  refresh: (path?: string) => Promise<void>;
  showToast: (message: string | FileMessage, type?: ToastState['type']) => void;
  uploadResolver: UploadResolver;
  fileInput: () => HTMLInputElement | null;
  folderInput: () => HTMLInputElement | null;
}

export function useStorageTransfer(deps: StorageTransferDeps) {
  const depsRef = useRef(deps);
  useLayoutEffect(() => {
    depsRef.current = deps;
  }, [deps]);

  const handleUpload = useCallback(async (files?: File[]) => {
    const current = depsRef.current;
    const filesToUpload = files || (current.fileInput()?.files ? Array.from(current.fileInput()!.files!) : null);
    if (!filesToUpload || filesToUpload.length === 0) return;

    let successCount = 0;
    const path = current.currentPath();

    for (const file of filesToUpload) {
      const existingFile = current.findExistingFileEntry(file.name, path);
      let overwrite = false;

      if (existingFile) {
        const shouldOverwrite = await current.uploadResolver.resolve(file, existingFile);
        if (!shouldOverwrite) {
          continue;
        }

        overwrite = true;
      }

      try {
        await current.rxdb.storage.upload(file, { path, overwrite });
        successCount++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        current.showToast(
          message.includes('already exists') ? fileMessage('file.fileExists') : fileError('file.uploadFailed', err),
          'error'
        );
        return;
      }
    }

    const fileInput = current.fileInput();
    if (fileInput) {
      fileInput.value = '';
    }

    if (successCount > 0) {
      current.showToast(
        successCount === 1 ? fileMessage('file.uploadSuccess') : fileMessage('file.uploaded', { count: successCount }),
        'success'
      );
      await current.refresh(path);
      await waitFor(100);
      await current.refresh(path);
    }
  }, []);

  const handleUploadFolder = useCallback(async (files: File[]) => {
    if (files.length === 0) return;

    const current = depsRef.current;
    current.showToast(fileMessage('file.uploadingFolder', { count: files.length }), 'info');
    const root = current.currentPath();

    let successCount = 0;
    let failedCount = 0;

    for (const file of files) {
      const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      const targetDirectory = getUploadDirectory(relativePath, root);
      const existingFile = current.findExistingFileEntry(file.name, targetDirectory);
      let overwrite = false;

      if (existingFile) {
        const shouldOverwrite = await current.uploadResolver.resolve(file, existingFile);
        if (!shouldOverwrite) {
          continue;
        }

        overwrite = true;
      }

      try {
        await current.rxdb.storage.upload(file, { path: targetDirectory, overwrite });
        successCount++;
      } catch {
        failedCount++;
      }
    }

    const folderInput = current.folderInput();
    if (folderInput) {
      folderInput.value = '';
    }

    await current.refresh(root);
    await waitFor(100);
    await current.refresh(root);

    if (failedCount > 0) {
      current.showToast(fileMessage('file.uploadFinished', { succeeded: successCount, failed: failedCount }), 'error');
    } else {
      current.showToast(fileMessage('file.uploaded', { count: successCount }), 'success');
    }
  }, []);

  const handleDownload = useCallback(async (entry: StorageBrowserItem) => {
    const current = depsRef.current;
    if (entry.kind === 'directory') {
      current.showToast(fileMessage('file.preparingFile', { name: entry.name }), 'info');

      try {
        const fileCount = await downloadEntriesAsZip(current.rxdb, [entry], `${entry.name}.zip`);
        current.showToast(
          fileCount === 0 ?
            fileMessage('file.downloadedEmptyFolder', { name: entry.name })
          : fileMessage('file.downloadedFromFolder', { count: fileCount, name: entry.name }),
          'success'
        );
      } catch (err) {
        current.showToast(fileError('file.downloadFailed', err), 'error');
      }

      return;
    }

    if (!entry.meta) {
      return;
    }

    try {
      await current.rxdb.storage.download(entry.meta.id);
    } catch (err) {
      current.showToast(fileError('file.downloadFailed', err), 'error');
    }
  }, []);

  const handleBatchDownload = useCallback(
    async (selectedEntries: StorageBrowserItem[]) => {
      const current = depsRef.current;
      if (selectedEntries.length === 0) {
        current.showToast(fileMessage('file.noSelection'), 'error');
        return;
      }

      if (selectedEntries.length === 1) {
        await handleDownload(selectedEntries[0]);
        return;
      }

      const folderName = current.currentPath().split('/').filter(Boolean).pop() || 'storage';
      current.showToast(fileMessage('file.preparingItems', { count: selectedEntries.length }), 'info');

      try {
        const fileCount = await downloadEntriesAsZip(current.rxdb, selectedEntries, `${folderName}.zip`);
        current.showToast(
          fileCount === 0 ?
            fileMessage('file.downloadedEmptyFolders', { count: selectedEntries.length })
          : fileMessage('file.downloadedItems', { count: selectedEntries.length, files: fileCount }),
          'success'
        );
      } catch (err) {
        current.showToast(fileError('file.downloadFailed', err), 'error');
      }
    },
    [handleDownload]
  );

  return {
    handleBatchDownload,
    handleDownload,
    handleUpload,
    handleUploadFolder
  };
}
