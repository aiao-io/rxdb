import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { StorageBrowserItem } from '../utils/storage-utils';
import { useStorageSelection } from './useStorageSelection';

const entries: StorageBrowserItem[] = [
  { kind: 'directory', name: 'a', path: '/a' },
  { kind: 'file', name: 'b.txt', path: '/b.txt' },
  { kind: 'file', name: 'c.txt', path: '/c.txt' }
];

describe('useStorageSelection', () => {
  it('replaces the selection on a plain click', () => {
    const { result } = renderHook(() => useStorageSelection(entries));

    act(() => {
      result.current.handleEntryClick(entries[0], { ctrlKey: false, metaKey: false, shiftKey: false });
    });
    act(() => {
      result.current.handleEntryClick(entries[1], { ctrlKey: false, metaKey: false, shiftKey: false });
    });

    expect([...result.current.selectedPaths]).toEqual(['/b.txt']);
  });

  it('toggles paths with ctrl/meta and ranges with shift', () => {
    const { result } = renderHook(() => useStorageSelection(entries));

    act(() => {
      result.current.handleEntryClick(entries[0], { ctrlKey: true, metaKey: false, shiftKey: false });
    });
    act(() => {
      result.current.handleEntryClick(entries[2], { ctrlKey: false, metaKey: false, shiftKey: true });
    });

    expect(result.current.selectedPaths).toEqual(new Set(['/a', '/b.txt', '/c.txt']));
  });

  it('drops stale paths when the entry list changes', () => {
    const { result, rerender } = renderHook(({ items }) => useStorageSelection(items), {
      initialProps: { items: entries }
    });

    act(() => {
      result.current.handleEntryClick(entries[1], { ctrlKey: false, metaKey: false, shiftKey: false });
    });

    rerender({ items: [entries[0]] });

    expect(result.current.selectedPaths.size).toBe(0);
    expect(result.current.lastSelectedPath).toBeNull();
  });
});
