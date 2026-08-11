import type { RxDB } from '@aiao/rxdb';
import {
  joinDirectoryAndFileName,
  normalizeDirectoryPath,
  type StorageBrowserEntry,
  type StorageFileMeta
} from '@aiao/rxdb-plugin-storage';
import { ref } from 'vue';
import { formatErrorMessage, useToast } from '../../../app/composables/useToast';
import type { StorageBrowserItem } from '../utils/storage-utils';

export type StorageBrowserService = Pick<RxDB['storage'], 'clear' | 'delete' | 'list' | 'listEntries'>;

export interface StorageBrowserDatabase {
  storage: StorageBrowserService;
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

export function mapEntry(entry: StorageBrowserEntry): StorageBrowserItem {
  if (entry.kind === 'directory') {
    return { kind: 'directory', name: entry.name, path: entry.path };
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

export function useStorageBrowser(rxdb: StorageBrowserDatabase) {
  const toast = useToast();

  const allFiles = ref<StorageFileMeta[]>([]);
  const entries = ref<StorageBrowserItem[]>([]);
  const currentPath = ref('/');
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function refresh(path: string = currentPath.value): Promise<void> {
    loading.value = true;
    error.value = null;

    try {
      const listedFiles = await rxdb.storage.list();
      allFiles.value = [...listedFiles].sort((a, b) => a.opfsPath.localeCompare(b.opfsPath));

      const listedEntries = await rxdb.storage.listEntries({ path });
      entries.value = listedEntries.map(mapEntry).sort((left, right) => {
        if (left.kind !== right.kind) return left.kind === 'directory' ? -1 : 1;
        return left.name.localeCompare(right.name);
      });
    } catch (err) {
      entries.value = [];
      const message = formatErrorMessage('加载目录失败', err);
      error.value = message;
      toast.error(message);
    } finally {
      loading.value = false;
    }
  }

  async function navigateTo(path: string): Promise<void> {
    currentPath.value = normalizeDirectoryPath(path);
    await refresh(currentPath.value);
  }

  function findExistingFileEntry(fileName: string, directoryPath: string): StorageBrowserItem | null {
    const targetOpfsPath = joinDirectoryAndFileName(directoryPath, fileName);
    const meta = allFiles.value.find(file => file.opfsPath === targetOpfsPath);
    if (!meta) return null;

    return mapEntry({ kind: 'file', name: meta.name, path: `/${meta.opfsPath}`, meta });
  }

  async function deleteEntry(entry: StorageBrowserItem): Promise<boolean> {
    try {
      if (entry.kind === 'file' && entry.meta) {
        await rxdb.storage.delete(entry.meta.id);
      } else {
        await rxdb.storage.clear(entry.path);
      }

      await refresh(currentPath.value);
      return true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  return {
    allFiles,
    entries,
    currentPath,
    loading,
    error,
    refresh,
    navigateTo,
    findExistingFileEntry,
    deleteEntry
  };
}
