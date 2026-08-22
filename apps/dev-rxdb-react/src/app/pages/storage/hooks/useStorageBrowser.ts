import type { RxDB } from '@aiao/rxdb';
import {
    joinDirectoryAndFileName,
    normalizeDirectoryPath,
    type StorageBrowserEntry,
    type StorageFileMeta
} from '@aiao/rxdb-plugin-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ToastState } from '../types';
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

export function mapStorageEntry(entry: StorageBrowserEntry): StorageBrowserItem {
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

export function useStorageBrowser(
  rxdb: StorageBrowserDatabase,
  showToast: (message: string, type?: ToastState['type']) => void
) {
  const [allFiles, setAllFiles] = useState<StorageFileMeta[]>([]);
  const [entries, setEntries] = useState<StorageBrowserItem[]>([]);
  const [currentPath, setCurrentPath] = useState('/');
  const [loading, setLoading] = useState(false);

  const currentPathRef = useRef('/');
  const allFilesRef = useRef<StorageFileMeta[]>([]);
  const refreshRef = useRef<(path?: string) => Promise<void>>(async () => undefined);

  useEffect(() => {
    currentPathRef.current = currentPath;
  }, [currentPath]);

  useEffect(() => {
    allFilesRef.current = allFiles;
  }, [allFiles]);

  const refresh = useCallback(
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
    refreshRef.current = refresh;
  }, [refresh]);

  const setCurrentPathImmediate = useCallback((path: string) => {
    setCurrentPath(path);
    currentPathRef.current = path;
  }, []);

  const navigateToPath = useCallback(
    async (path: string) => {
      const nextPath = normalizeDirectoryPath(path);
      setCurrentPathImmediate(nextPath);
      await refresh(nextPath);
    },
    [refresh, setCurrentPathImmediate]
  );

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

  const deleteEntry = useCallback(
    async (entry: StorageBrowserItem, shouldRefresh = true): Promise<boolean> => {
      try {
        if (entry.kind === 'file' && entry.meta) {
          await rxdb.storage.delete(entry.meta.id);
        } else {
          await rxdb.storage.clear(entry.path);
        }

        if (shouldRefresh) await refresh(currentPathRef.current);
        return true;
      } catch {
        return false;
      }
    },
    [refresh, rxdb]
  );

  return {
    allFiles,
    allFilesRef,
    currentPath,
    currentPathRef,
    deleteEntry,
    entries,
    findExistingFileEntry,
    loading,
    navigateToPath,
    refresh,
    refreshRef,
    setCurrentPath,
    setCurrentPathImmediate
  };
}
