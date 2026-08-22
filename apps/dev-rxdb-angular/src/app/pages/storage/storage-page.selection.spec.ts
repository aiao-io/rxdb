import { describe, expect, it } from 'vitest';
import { nextSelectedPaths } from './storage-page.selection';
import type { StorageBrowserItem } from './utils/storage-utils';

const entries: StorageBrowserItem[] = [
  { kind: 'file', name: 'a', path: '/a' },
  { kind: 'file', name: 'b', path: '/b' },
  { kind: 'file', name: 'c', path: '/c' }
];

describe('nextSelectedPaths', () => {
  it('replaces the selection on a plain click', () => {
    const next = nextSelectedPaths(entries[1], {
      entries,
      lastSelectedPath: '/a',
      metaKey: false,
      selectedPaths: new Set(['/a']),
      shiftKey: false
    });

    expect([...next.selectedPaths]).toEqual(['/b']);
    expect(next.lastSelectedPath).toBe('/b');
  });

  it('toggles the path on a modifier click', () => {
    const next = nextSelectedPaths(entries[1], {
      entries,
      lastSelectedPath: '/a',
      metaKey: true,
      selectedPaths: new Set(['/a']),
      shiftKey: false
    });

    expect(next.selectedPaths.has('/a')).toBe(true);
    expect(next.selectedPaths.has('/b')).toBe(true);
    expect(next.lastSelectedPath).toBe('/b');
  });

  it('fills a range on a shift click', () => {
    const next = nextSelectedPaths(entries[2], {
      entries,
      lastSelectedPath: '/a',
      metaKey: false,
      selectedPaths: new Set(['/a']),
      shiftKey: true
    });

    expect([...next.selectedPaths].sort()).toEqual(['/a', '/b', '/c']);
    expect(next.lastSelectedPath).toBe('/a');
  });
});
