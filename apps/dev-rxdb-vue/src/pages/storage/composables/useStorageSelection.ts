import { type Ref, ref, watch } from 'vue';
import type { StorageBrowserItem } from '../utils/storage-utils';

export interface SelectionBox {
  active: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export function useStorageSelection(entries: Ref<StorageBrowserItem[]>) {
  const selectedPaths = ref<Set<string>>(new Set());
  const lastSelectedPath = ref<string | null>(null);
  const selectionBox = ref<SelectionBox | null>(null);

  let mouseMoveListener: ((event: MouseEvent) => void) | null = null;
  let mouseUpListener: (() => void) | null = null;

  watch(entries, items => {
    const valid = new Set(items.map(e => e.path));
    selectedPaths.value = new Set([...selectedPaths.value].filter(p => valid.has(p)));
    if (lastSelectedPath.value && !valid.has(lastSelectedPath.value)) {
      lastSelectedPath.value = null;
    }
  });

  function clearSelection(): void {
    selectedPaths.value = new Set();
    lastSelectedPath.value = null;
  }

  function handleEntryClick(entry: StorageBrowserItem, event: MouseEvent): void {
    if (event.ctrlKey || event.metaKey) {
      const next = new Set(selectedPaths.value);
      if (next.has(entry.path)) next.delete(entry.path);
      else next.add(entry.path);
      selectedPaths.value = next;
      lastSelectedPath.value = entry.path;
      return;
    }

    if (event.shiftKey && lastSelectedPath.value) {
      const startIndex = entries.value.findIndex(item => item.path === lastSelectedPath.value);
      const endIndex = entries.value.findIndex(item => item.path === entry.path);

      if (startIndex !== -1 && endIndex !== -1) {
        const [start, end] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
        const next = new Set(selectedPaths.value);
        for (let index = start; index <= end; index++) {
          next.add(entries.value[index].path);
        }
        selectedPaths.value = next;
      }
      return;
    }

    selectedPaths.value = new Set([entry.path]);
    lastSelectedPath.value = entry.path;
  }

  function teardownDrag(): void {
    selectionBox.value = null;
    if (mouseMoveListener) {
      window.removeEventListener('mousemove', mouseMoveListener);
      mouseMoveListener = null;
    }
    if (mouseUpListener) {
      window.removeEventListener('mouseup', mouseUpListener);
      mouseUpListener = null;
    }
  }

  function startBoxSelection(event: MouseEvent, container: HTMLElement): void {
    const target = event.target as HTMLElement;
    if (target.closest('button') || target.closest('a') || target.closest('[role="button"]')) {
      return;
    }

    const rect = container.getBoundingClientRect();
    const startX = event.clientX - rect.left;
    const startY = event.clientY - rect.top;
    selectionBox.value = { active: true, startX, startY, currentX: startX, currentY: startY };

    mouseMoveListener = moveEvent => {
      const containerRect = container.getBoundingClientRect();
      const currentX = moveEvent.clientX - containerRect.left;
      const currentY = moveEvent.clientY - containerRect.top;
      selectionBox.value = { active: true, startX, startY, currentX, currentY };

      const boxLeft = Math.min(startX, currentX) + containerRect.left;
      const boxTop = Math.min(startY, currentY) + containerRect.top;
      const boxRight = Math.max(startX, currentX) + containerRect.left;
      const boxBottom = Math.max(startY, currentY) + containerRect.top;

      const selected = new Set<string>();
      container.querySelectorAll('[data-entry-path]').forEach(item => {
        const itemRect = item.getBoundingClientRect();
        const intersects = !(
          itemRect.right < boxLeft ||
          itemRect.left > boxRight ||
          itemRect.bottom < boxTop ||
          itemRect.top > boxBottom
        );
        if (intersects) {
          const path = item.getAttribute('data-entry-path');
          if (path) selected.add(path);
        }
      });

      selectedPaths.value = selected;
    };

    mouseUpListener = () => teardownDrag();

    window.addEventListener('mousemove', mouseMoveListener);
    window.addEventListener('mouseup', mouseUpListener);
  }

  return {
    selectedPaths,
    lastSelectedPath,
    selectionBox,
    clearSelection,
    handleEntryClick,
    startBoxSelection,
    teardownDrag
  };
}
