import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SelectionBox } from '../types';
import type { StorageBrowserItem } from '../utils/storage-utils';

interface EntryClickModifiers {
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

export function useStorageSelection(entries: StorageBrowserItem[]) {
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [lastSelectedPath, setLastSelectedPath] = useState<string | null>(null);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const mouseMoveRef = useRef<((event: MouseEvent) => void) | null>(null);
  const mouseUpRef = useRef<(() => void) | null>(null);
  const validPaths = useMemo(() => new Set(entries.map(entry => entry.path)), [entries]);
  const visibleSelectedPaths = useMemo(
    () => new Set([...selectedPaths].filter(pathItem => validPaths.has(pathItem))),
    [selectedPaths, validPaths]
  );
  const visibleLastSelectedPath = lastSelectedPath && validPaths.has(lastSelectedPath) ? lastSelectedPath : null;

  useEffect(() => {
    return () => {
      if (mouseMoveRef.current) window.removeEventListener('mousemove', mouseMoveRef.current);
      if (mouseUpRef.current) window.removeEventListener('mouseup', mouseUpRef.current);
    };
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedPaths(new Set());
    setLastSelectedPath(null);
  }, []);

  const handleEntryClick = useCallback(
    (entry: StorageBrowserItem, event: EntryClickModifiers) => {
      if (event.ctrlKey || event.metaKey) {
        setSelectedPaths(previous => {
          const next = new Set(previous);
          if (next.has(entry.path)) {
            next.delete(entry.path);
          } else {
            next.add(entry.path);
          }

          return next;
        });
        setLastSelectedPath(entry.path);
        return;
      }

      if (event.shiftKey && lastSelectedPath) {
        const startIndex = entries.findIndex(item => item.path === lastSelectedPath);
        const endIndex = entries.findIndex(item => item.path === entry.path);

        if (startIndex !== -1 && endIndex !== -1) {
          const [start, end] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
          setSelectedPaths(previous => {
            const next = new Set(previous);
            for (let index = start; index <= end; index++) {
              next.add(entries[index].path);
            }

            return next;
          });
        }

        return;
      }

      setSelectedPaths(new Set([entry.path]));
      setLastSelectedPath(entry.path);
    },
    [entries, lastSelectedPath]
  );

  const startBoxSelection = useCallback((event: React.MouseEvent, container: HTMLElement) => {
    const target = event.target as HTMLElement;
    if (target.closest('button') || target.closest('a') || target.closest('[role="button"]')) {
      return;
    }

    const rect = container.getBoundingClientRect();
    const startX = event.clientX - rect.left;
    const startY = event.clientY - rect.top;
    setSelectionBox({ active: true, startX, startY, currentX: startX, currentY: startY });

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const containerRect = container.getBoundingClientRect();
      const currentX = moveEvent.clientX - containerRect.left;
      const currentY = moveEvent.clientY - containerRect.top;
      setSelectionBox({ active: true, startX, startY, currentX, currentY });

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
          if (path) {
            selected.add(path);
          }
        }
      });

      setSelectedPaths(selected);
    };

    const handleMouseUp = () => {
      setSelectionBox(null);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      mouseMoveRef.current = null;
      mouseUpRef.current = null;
    };

    mouseMoveRef.current = handleMouseMove;
    mouseUpRef.current = handleMouseUp;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, []);

  return {
    clearSelection,
    handleEntryClick,
    lastSelectedPath: visibleLastSelectedPath,
    selectedPaths: visibleSelectedPaths,
    selectionBox,
    startBoxSelection
  };
}
