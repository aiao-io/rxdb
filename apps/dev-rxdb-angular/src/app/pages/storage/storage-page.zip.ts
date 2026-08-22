import type { RxDB } from '@aiao/rxdb';
import { zipSync, type Zippable } from 'fflate';
import { mapStorageEntry } from './storage-page.helpers';
import type { StorageBrowserItem } from './utils/storage-utils';

export type StorageZipService = Pick<RxDB['storage'], 'listEntries' | 'read'>;

export function isZipDirectory(entry: unknown): entry is Zippable {
  return !!entry && typeof entry === 'object' && !Array.isArray(entry) && !(entry instanceof Uint8Array);
}

export function ensureZipDirectory(zipTree: Zippable, pathSegments: string[]): Zippable {
  let currentDirectory = zipTree;

  for (const segment of pathSegments) {
    const existingEntry = currentDirectory[segment];

    if (!isZipDirectory(existingEntry)) {
      currentDirectory[segment] = {};
    }

    currentDirectory = currentDirectory[segment] as Zippable;
  }

  return currentDirectory;
}

export async function addEntryToZip(
  storage: StorageZipService,
  zipTree: Zippable,
  entry: StorageBrowserItem,
  zipPathSegments: string[]
): Promise<number> {
  if (entry.kind === 'file') {
    if (!entry.meta) {
      return 0;
    }

    const blob = await storage.read(entry.meta.id);
    const parentDirectory = ensureZipDirectory(zipTree, zipPathSegments.slice(0, -1));
    const fileName = zipPathSegments[zipPathSegments.length - 1];

    parentDirectory[fileName] = new Uint8Array(await blob.arrayBuffer());
    return 1;
  }

  ensureZipDirectory(zipTree, zipPathSegments);

  const childEntries = await storage.listEntries({ path: entry.path });
  let fileCount = 0;

  for (const childEntry of childEntries) {
    fileCount += await addEntryToZip(storage, zipTree, mapStorageEntry(childEntry), [
      ...zipPathSegments,
      childEntry.name
    ]);
  }

  return fileCount;
}

export async function downloadBlob(blob: Blob, suggestedName: string): Promise<void> {
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
    URL.revokeObjectURL(url);
  }
}

export async function downloadEntriesAsZip(
  storage: StorageZipService,
  entries: StorageBrowserItem[],
  suggestedName: string
): Promise<number> {
  const zipTree: Zippable = {};
  let fileCount = 0;

  for (const entry of entries) {
    fileCount += await addEntryToZip(storage, zipTree, entry, [entry.name]);
  }

  const zipData = zipSync(zipTree, { level: 6 });
  const zipBuffer = new ArrayBuffer(zipData.byteLength);
  const zipBytes = new Uint8Array(zipBuffer);
  zipBytes.set(zipData);

  await downloadBlob(new Blob([zipBuffer], { type: 'application/zip' }), suggestedName);

  return fileCount;
}
