import type { StorageBrowserItem } from './utils/storage-utils';

export interface SelectionClickState {
  entries: readonly StorageBrowserItem[];
  lastSelectedPath: string | null;
  metaKey: boolean;
  selectedPaths: ReadonlySet<string>;
  shiftKey: boolean;
}

export interface SelectionClickResult {
  lastSelectedPath: string | null;
  selectedPaths: Set<string>;
}

export function nextSelectedPaths(entry: StorageBrowserItem, state: SelectionClickState): SelectionClickResult {
  if (state.metaKey) {
    const selected = new Set(state.selectedPaths);
    if (selected.has(entry.path)) {
      selected.delete(entry.path);
    } else {
      selected.add(entry.path);
    }

    return {
      lastSelectedPath: entry.path,
      selectedPaths: selected
    };
  }

  if (state.shiftKey && state.lastSelectedPath) {
    const startIndex = state.entries.findIndex(item => item.path === state.lastSelectedPath);
    const endIndex = state.entries.findIndex(item => item.path === entry.path);

    if (startIndex !== -1 && endIndex !== -1) {
      const [start, end] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
      const selected = new Set(state.selectedPaths);
      for (let index = start; index <= end; index++) {
        selected.add(state.entries[index].path);
      }

      return {
        lastSelectedPath: state.lastSelectedPath,
        selectedPaths: selected
      };
    }
  }

  return {
    lastSelectedPath: entry.path,
    selectedPaths: new Set([entry.path])
  };
}
