import { requireCondition } from '../core/errors.js';
import { normalizeRoute } from '../core/routes.js';
import type { VirtualFile } from '../core/types.js';

export function directoryTrail(directories: readonly VirtualFile[], parentId: string | null): VirtualFile[] | null {
  const byId = new Map(directories.map(directory => [directory.id, directory]));
  const trail: VirtualFile[] = [];
  let id = parentId;
  while (id !== null) {
    const directory = byId.get(id);
    if (!directory) return null;
    trail.unshift(directory);
    id = directory.parentId;
  }
  return trail;
}

export interface FilesLocation {
  parentId: string | null;
  trash: boolean;
  search: string;
  selected: string | null;
}

export function parseFilesRoute(route: string): FilesLocation {
  const url = new URL(normalizeRoute(route), 'https://files.invalid/');
  requireCondition(
    url.pathname === '/' || url.pathname === '/trash' || /^\/folders\/[^/]+$/.test(url.pathname),
    'UNSUPPORTED',
    '文件位置不存在'
  );
  return {
    parentId: url.pathname.startsWith('/folders/') ? decodeURIComponent(url.pathname.slice(9)) : null,
    trash: url.pathname === '/trash',
    search: url.searchParams.get('q') ?? '',
    selected: new URLSearchParams(url.hash.slice(1)).get('selected')
  };
}

export function filesRoute(location: FilesLocation): string {
  const url = new URL(
    location.trash ? '/trash'
    : location.parentId === null ? '/'
    : `/folders/${encodeURIComponent(location.parentId)}`,
    'https://files.invalid/'
  );
  if (location.search) url.searchParams.set('q', location.search);
  if (location.selected) url.hash = new URLSearchParams({ selected: location.selected }).toString();
  return url.pathname + url.search + url.hash;
}
