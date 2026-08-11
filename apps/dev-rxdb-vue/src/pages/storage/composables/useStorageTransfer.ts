import type { RxDB } from '@aiao/rxdb';
import { normalizeDirectoryPath, type StorageFileMeta } from '@aiao/rxdb-plugin-storage';
import { STORAGE_LABELS } from '@aiao/utils';
import { zipSync, type Zippable } from 'fflate';
import { formatErrorMessage, useToast } from '../../../app/composables/useToast';
import { readDirectoryEntries } from '../../../app/utils/read-directory-entries';
import type { StorageBrowserItem } from '../utils/storage-utils';
import { mapEntry } from './useStorageBrowser';

interface UploadResolver {
  resolve(file: File, existingEntry: StorageBrowserItem): Promise<boolean>;
}

interface UploadDeps {
  rxdb: RxDB;
  currentPath: () => string;
  findExistingFileEntry: (name: string, dir: string) => StorageBrowserItem | null;
  refresh: () => Promise<void>;
  uploadResolver: UploadResolver;
}

function getUploadDirectory(relativePath: string, currentPath: string): string {
  const segments = relativePath.replace(/\\/g, '/').split('/').filter(Boolean);
  if (segments.length <= 1) return currentPath;
  return normalizeDirectoryPath([currentPath, ...segments.slice(0, -1)].join('/'));
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
      if (error instanceof DOMException && error.name === 'AbortError') return;
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

function ensureZipDirectory(zipTree: Zippable, pathItems: string[]): Zippable {
  let currentDirectory = zipTree;
  for (const segment of pathItems) {
    const existing = currentDirectory[segment];
    if (!existing || Array.isArray(existing) || existing instanceof Uint8Array) {
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
    if (!entry.meta) return 0;
    const blob = await rxdb.storage.read(entry.meta.id);
    const parent = ensureZipDirectory(zipTree, zipPathItems.slice(0, -1));
    parent[zipPathItems[zipPathItems.length - 1]] = new Uint8Array(await blob.arrayBuffer());
    return 1;
  }

  ensureZipDirectory(zipTree, zipPathItems);
  const childEntries = await rxdb.storage.listEntries({ path: entry.path });
  let fileCount = 0;
  for (const child of childEntries) {
    fileCount += await addEntryToZip(rxdb, zipTree, mapEntry(child), [...zipPathItems, child.name]);
  }
  return fileCount;
}

async function downloadEntriesAsZip(rxdb: RxDB, items: StorageBrowserItem[], suggestedName: string): Promise<number> {
  const zipTree: Zippable = {};
  let fileCount = 0;
  for (const entry of items) {
    fileCount += await addEntryToZip(rxdb, zipTree, entry, [entry.name]);
  }

  const zipData = zipSync(zipTree, { level: 6 });
  const buffer = new ArrayBuffer(zipData.byteLength);
  new Uint8Array(buffer).set(zipData);
  await downloadBlob(new Blob([buffer], { type: 'application/zip' }), suggestedName);
  return fileCount;
}

export function useStorageTransfer(deps: UploadDeps) {
  const toast = useToast();
  const L = STORAGE_LABELS;

  async function upload(filesToUpload: File[]): Promise<void> {
    if (filesToUpload.length === 0) return;

    let successCount = 0;
    const path = deps.currentPath();

    for (const file of filesToUpload) {
      const existing = deps.findExistingFileEntry(file.name, path);
      let overwrite = false;

      if (existing) {
        const ok = await deps.uploadResolver.resolve(file, existing);
        if (!ok) continue;
        overwrite = true;
      }

      try {
        await deps.rxdb.storage.upload(file, { path, overwrite });
        successCount++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        toast.error(message.includes('already exists') ? L.FILE_EXISTS : message);
        return;
      }
    }

    if (successCount > 0) {
      toast.success(successCount === 1 ? L.UPLOAD_SUCCESS : `Uploaded ${successCount} files`);
      await deps.refresh();
    }
  }

  async function uploadFolder(files: File[]): Promise<void> {
    if (files.length === 0) return;

    toast.info(`Uploading folder with ${files.length} files...`);
    const root = deps.currentPath();

    let successCount = 0;
    let failedCount = 0;

    for (const file of files) {
      const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      const targetDirectory = getUploadDirectory(relativePath, root);
      const existing = deps.findExistingFileEntry(file.name, targetDirectory);
      let overwrite = false;

      if (existing) {
        const ok = await deps.uploadResolver.resolve(file, existing);
        if (!ok) continue;
        overwrite = true;
      }

      try {
        await deps.rxdb.storage.upload(file, { path: targetDirectory, overwrite });
        successCount++;
      } catch {
        failedCount++;
      }
    }

    await deps.refresh();

    if (failedCount > 0) {
      toast.error(`Upload finished: ${successCount} succeeded, ${failedCount} failed`);
    } else {
      toast.success(`Uploaded ${successCount} files`);
    }
  }

  async function downloadEntry(entry: StorageBrowserItem): Promise<void> {
    if (entry.kind === 'directory') {
      toast.info(`Preparing ${entry.name}...`);
      try {
        const fileCount = await downloadEntriesAsZip(deps.rxdb, [entry], `${entry.name}.zip`);
        toast.success(
          fileCount === 0 ? `Downloaded empty folder ${entry.name}` : `Downloaded ${fileCount} files from ${entry.name}`
        );
      } catch (err) {
        toast.error(formatErrorMessage('下载失败', err));
      }
      return;
    }

    if (!entry.meta) return;

    try {
      await deps.rxdb.storage.download(entry.meta.id);
    } catch (err) {
      toast.error(formatErrorMessage('下载失败', err));
    }
  }

  async function downloadBatch(items: StorageBrowserItem[]): Promise<void> {
    if (items.length === 0) {
      toast.error('No files selected');
      return;
    }

    if (items.length === 1) {
      await downloadEntry(items[0]);
      return;
    }

    const folderName = deps.currentPath().split('/').filter(Boolean).pop() || 'storage';
    toast.info(`Preparing ${items.length} items...`);

    try {
      const fileCount = await downloadEntriesAsZip(deps.rxdb, items, `${folderName}.zip`);
      toast.success(
        fileCount === 0 ?
          `Downloaded ${items.length} empty folders`
        : `Downloaded ${items.length} items (${fileCount} files)`
      );
    } catch (err) {
      toast.error(formatErrorMessage('下载失败', err));
    }
  }

  return { upload, uploadFolder, downloadEntry, downloadBatch };
}

export async function traverseDataTransferTree(item: FileSystemEntry, path: string, files: File[]): Promise<void> {
  return new Promise(resolve => {
    if ((item as FileSystemFileEntry).isFile) {
      (item as FileSystemFileEntry).file((file: File) => {
        Object.defineProperty(file, 'webkitRelativePath', { value: path + file.name, writable: false });
        files.push(file);
        resolve();
      });
      return;
    }

    if ((item as FileSystemDirectoryEntry).isDirectory) {
      const reader = (item as FileSystemDirectoryEntry).createReader();
      void readDirectoryEntries(reader).then(async childEntries => {
        await Promise.all(childEntries.map(entry => traverseDataTransferTree(entry, path + item.name + '/', files)));
        resolve();
      });
      return;
    }

    resolve();
  });
}

export type { StorageFileMeta };
