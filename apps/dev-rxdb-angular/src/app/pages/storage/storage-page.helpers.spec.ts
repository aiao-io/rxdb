import { describe, expect, it } from 'vitest';
import type { StorageBrowserEntry } from '@aiao/rxdb-plugin-storage';
import {
  buildUrlFromPath,
  getBatchArchiveName,
  getStoredViewMode,
  getUploadDirectory,
  mapStorageEntry,
  normalizeRoutePath,
  pathSegmentsFrom,
  pruneSelectedPaths,
  sortMappedEntries,
  toTimestamp
} from './storage-page.helpers';
import { isZipDirectory } from './storage-page.zip';
import type { StorageBrowserItem } from './utils/storage-utils';

describe('normalizeRoutePath', () => {
  it('maps empty and root values to /', () => {
    expect(normalizeRoutePath(null)).toBe('/');
    expect(normalizeRoutePath('')).toBe('/');
    expect(normalizeRoutePath('/')).toBe('/');
  });

  it('normalizes relative and absolute nested paths', () => {
    expect(normalizeRoutePath('docs')).toBe('/docs');
    expect(normalizeRoutePath('/docs/api')).toBe('/docs/api');
  });
});

describe('buildUrlFromPath', () => {
  it('maps the storage root to /storage', () => {
    expect(buildUrlFromPath('/')).toBe('/storage');
  });

  it('encodes nested path segments', () => {
    expect(buildUrlFromPath('/docs/api')).toBe('/storage/docs/api');
    expect(buildUrlFromPath('/docs/a b')).toBe('/storage/docs/a%20b');
  });
});

describe('getUploadDirectory', () => {
  it('keeps files in the current directory when there is no relative folder', () => {
    expect(getUploadDirectory('readme.md', '/docs')).toBe('/docs');
    expect(getUploadDirectory('folder/readme.md', '/docs')).toBe('/docs/folder');
  });

  it('normalizes nested windows paths against the current directory', () => {
    expect(getUploadDirectory('a\\b\\c.txt', '/')).toBe('/a/b');
  });
});

describe('toTimestamp', () => {
  it('accepts numbers, dates and parseable strings', () => {
    expect(toTimestamp(1700000000000)).toBe(1700000000000);
    expect(toTimestamp(new Date('2020-01-02T00:00:00.000Z'))).toBe(Date.parse('2020-01-02T00:00:00.000Z'));
    expect(toTimestamp('2020-01-02T00:00:00.000Z')).toBe(Date.parse('2020-01-02T00:00:00.000Z'));
  });

  it('returns undefined for unparseable values', () => {
    expect(toTimestamp('not-a-date')).toBeUndefined();
    expect(toTimestamp(null)).toBeUndefined();
  });
});

describe('mapStorageEntry', () => {
  it('maps a directory without fabricating file metadata', () => {
    expect(
      mapStorageEntry({
        kind: 'directory',
        name: 'docs',
        path: '/docs'
      })
    ).toEqual({
      kind: 'directory',
      name: 'docs',
      path: '/docs'
    });
  });

  it('maps a file from its metadata', () => {
    const meta = {
      name: 'readme.md',
      mimeType: 'text/markdown',
      size: 12,
      opfsPath: 'docs/readme.md',
      contentVersion: 1,
      updatedAt: '2020-01-02T00:00:00.000Z'
    } as StorageBrowserEntry extends { kind: 'file' } ? StorageBrowserEntry['meta'] : never;

    expect(
      mapStorageEntry({
        kind: 'file',
        name: 'readme.md',
        path: '/docs/readme.md',
        meta
      })
    ).toEqual({
      kind: 'file',
      name: 'readme.md',
      path: '/docs/readme.md',
      meta,
      size: 12,
      type: 'text/markdown',
      lastModified: Date.parse('2020-01-02T00:00:00.000Z')
    });
  });
});

describe('sortMappedEntries', () => {
  it('puts directories before files then sorts by name', () => {
    const entries: StorageBrowserItem[] = [
      { kind: 'file', name: 'b.txt', path: '/b.txt' },
      { kind: 'directory', name: 'z', path: '/z' },
      { kind: 'file', name: 'a.txt', path: '/a.txt' },
      { kind: 'directory', name: 'a', path: '/a' }
    ];

    expect(sortMappedEntries(entries).map(entry => entry.path)).toEqual(['/a', '/z', '/a.txt', '/b.txt']);
  });
});

describe('pathSegmentsFrom', () => {
  it('returns an empty list at the storage root', () => {
    expect(pathSegmentsFrom('/')).toEqual([]);
  });

  it('builds cumulative paths for nested directories', () => {
    expect(pathSegmentsFrom('/docs/api')).toEqual([
      { name: 'docs', path: '/docs' },
      { name: 'api', path: '/docs/api' }
    ]);
  });
});

describe('getBatchArchiveName', () => {
  it('uses the current folder name or falls back to storage.zip', () => {
    expect(getBatchArchiveName('/')).toBe('storage.zip');
    expect(getBatchArchiveName('/docs/api')).toBe('api.zip');
  });
});

describe('getStoredViewMode', () => {
  it('accepts only list and grid values', () => {
    const storage = {
      getItem(key: string): string | null {
        return key === 'storage-view-mode' ? 'grid' : null;
      }
    } as Pick<Storage, 'getItem'>;

    expect(getStoredViewMode(storage)).toBe('grid');
    expect(
      getStoredViewMode({
        getItem: () => 'cards'
      })
    ).toBe('list');
  });
});

describe('pruneSelectedPaths', () => {
  it('drops stale selected and last-selected paths', () => {
    const next = pruneSelectedPaths(
      ['/keep', '/gone'],
      '/gone',
      [{ kind: 'file', name: 'keep', path: '/keep' }]
    );

    expect([...next.selectedPaths]).toEqual(['/keep']);
    expect(next.lastSelectedPath).toBeNull();
    expect(next.selectedChanged).toBe(true);
  });

  it('keeps the last selected path when it is still visible', () => {
    const next = pruneSelectedPaths(
      ['/keep'],
      '/keep',
      [{ kind: 'file', name: 'keep', path: '/keep' }]
    );

    expect(next.lastSelectedPath).toBe('/keep');
    expect(next.selectedChanged).toBe(false);
  });
});

describe('isZipDirectory', () => {
  it('treats nested objects as directories and arrays or bytes as files', () => {
    expect(isZipDirectory({})).toBe(true);
    expect(isZipDirectory(new Uint8Array([1]))).toBe(false);
    expect(isZipDirectory([0, new Uint8Array([1])])).toBe(false);
    expect(isZipDirectory(undefined)).toBe(false);
  });
});
