import { normalizeDirectoryPath, type StorageBrowserEntry, type StorageFileMeta } from '@aiao/rxdb-plugin-storage';
import type { StorageBrowserItem } from './utils/storage-utils';

export type ViewMode = 'list' | 'grid';

export const VIEW_MODE_STORAGE_KEY = 'storage-view-mode';

export function toTimestamp(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return value;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

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

export function sortMappedEntries(entries: readonly StorageBrowserItem[]): StorageBrowserItem[] {
  return [...entries].sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === 'directory' ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  });
}

export function sortAllFiles(metas: readonly StorageFileMeta[]): StorageFileMeta[] {
  return [...metas].sort((left, right) => left.opfsPath.localeCompare(right.opfsPath));
}

export function normalizeRoutePath(path: string | null): string {
  if (!path || path === '/') {
    return '/';
  }

  const withLeadingSlash = path.startsWith('/') ? path : `/${path}`;
  return normalizeDirectoryPath(withLeadingSlash);
}

export function getStoredViewMode(storage: Pick<Storage, 'getItem'> = localStorage): ViewMode {
  const stored = storage.getItem(VIEW_MODE_STORAGE_KEY);
  return stored === 'grid' || stored === 'list' ? stored : 'list';
}

export function buildUrlFromPath(path: string): string {
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) {
    return '/storage';
  }

  return `/storage/${segments.map(segment => encodeURIComponent(segment)).join('/')}`;
}

export function getUploadDirectory(relativePath: string, currentPath: string): string {
  const segments = relativePath.replace(/\\/g, '/').split('/').filter(Boolean);
  if (segments.length <= 1) {
    return currentPath;
  }

  const joined = [currentPath, ...segments.slice(0, -1)].join('/');
  return normalizeDirectoryPath(joined.replace(/\/+/g, '/'));
}

export function pathSegmentsFrom(path: string): Array<{ name: string; path: string }> {
  if (!path || path === '/') {
    return [];
  }

  return path
    .split('/')
    .filter(Boolean)
    .map((segment, index, allSegments) => ({
      name: segment,
      path: '/' + allSegments.slice(0, index + 1).join('/')
    }));
}

export function getBatchArchiveName(currentPath: string): string {
  const folderName = currentPath.split('/').filter(Boolean).pop() || 'storage';
  return `${folderName}.zip`;
}

export function pruneSelectedPaths(
  selectedPaths: Iterable<string>,
  lastSelectedPath: string | null,
  entries: readonly StorageBrowserItem[]
): { lastSelectedPath: string | null; selectedChanged: boolean; selectedPaths: Set<string> } {
  const previousSelected = selectedPaths instanceof Set ? selectedPaths : new Set(selectedPaths);
  const validPaths = new Set(entries.map(entry => entry.path));
  const nextSelected = new Set([...previousSelected].filter(pathItem => validPaths.has(pathItem)));

  return {
    lastSelectedPath: lastSelectedPath && validPaths.has(lastSelectedPath) ? lastSelectedPath : null,
    selectedChanged: nextSelected.size !== previousSelected.size,
    selectedPaths: nextSelected
  };
}
