import type { RxDB } from '@aiao/rxdb';
import { useCallback, useEffect, useRef } from 'react';

import type { BoardViewModel, ModelGetter } from './model.js';
import { isEditable, isModifier } from './types.js';
import { useBoardData } from './use-board-data.js';
import { useCardModel } from './use-card-model.js';
import { useColumnModel } from './use-column-model.js';
import { useDetailModel } from './use-detail-model.js';
import { useDialogModel } from './use-dialog-model.js';
import { useDragModel } from './use-drag-model.js';
import { useHeaderModel } from './use-header-model.js';
import { usePopoverModel } from './use-popover-model.js';
import { useSearchModel } from './use-search-model.js';
import { useViewCore } from './use-view-core.js';

/** Esc 由内向外：弹层 → 对话框 → 详情侧栏。 */
const handleEscape = (vm: BoardViewModel): boolean => {
  if (vm.popover.popoverRef.current) {
    vm.popover.closePopover();
    return true;
  }
  if (vm.dialog.dialogRef.current) {
    vm.dialog.closeDialog();
    return true;
  }
  if (vm.detail.detailTaskIdRef.current === null) return false;
  vm.detail.closeDetail();
  return true;
};

/** 单键与撤销快捷键（非编辑框内、无对话框时）。 */
const runGlobalShortcut = (vm: BoardViewModel, event: KeyboardEvent): boolean => {
  if (isModifier(event) && event.key.toLowerCase() === 'z') {
    void (event.shiftKey ? vm.header.redo() : vm.header.undo());
    return true;
  }
  if (isModifier(event) || event.altKey) return false;
  if (event.key === '?') {
    vm.dialog.openShortcuts();
    return true;
  }
  if (event.key !== '/') return false;
  vm.core.areaRef.current?.querySelector<HTMLInputElement>('[data-testid="board-filter-input"]')?.focus();
  return true;
};

/** document 级按键：只在焦点位于看板内或 body 时生效。 */
const onDocumentKeydown = (vm: BoardViewModel, event: KeyboardEvent): void => {
  const root = vm.core.areaRef.current;
  const active = document.activeElement;
  const inside = active === null || active === document.body || (root?.contains(active) ?? false);
  if (!root || event.defaultPrevented || !inside) return;
  if (event.key === 'Escape') {
    if (handleEscape(vm)) event.preventDefault();
    return;
  }
  if (isModifier(event) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    const board = vm.core.boardRef.current;
    if (board.searchSource || board.searchUnavailableReason) vm.dialog.openSearch();
    return;
  }
  if (isEditable(event.target) || vm.dialog.dialogRef.current !== null) return;
  if (runGlobalShortcut(vm, event)) event.preventDefault();
};

/** 外部指针按下（捕获阶段）关闭弹层；弹层内与展开中的触发器除外。 */
const onDocumentPointerdown = (vm: BoardViewModel, event: PointerEvent): void => {
  if (!vm.popover.popoverRef.current) return;
  const target = event.target;
  if (target instanceof Element && target.closest('.rxb-popover, [aria-expanded="true"]')) return;
  vm.popover.closePopover(false);
};

/** 全局快捷键、外部点击与视口变化。 */
const useGlobalListeners = (model: ModelGetter): void => {
  useEffect(() => {
    const keydown = (event: KeyboardEvent): void => onDocumentKeydown(model(), event);
    const pointerdown = (event: PointerEvent): void => onDocumentPointerdown(model(), event);
    const resize = (): void => model().popover.closePopover(false);
    document.addEventListener('keydown', keydown);
    document.addEventListener('pointerdown', pointerdown, true);
    window.addEventListener('resize', resize);
    return () => {
      document.removeEventListener('keydown', keydown);
      document.removeEventListener('pointerdown', pointerdown, true);
      window.removeEventListener('resize', resize);
    };
  }, [model]);
};

/**
 * 看板视图模型：组装各区域，区域之间经 {@link ModelGetter} 互相调用。
 *
 * @param rxdb - 已连接的看板 RxDB 实例
 * @param exportBackup - 宿主接线的备份导出回调
 */
export const useBoardViewModel = (
  rxdb: RxDB,
  exportBackup: (() => void | Promise<void>) | undefined
): BoardViewModel => {
  const latest = useRef<BoardViewModel | null>(null);
  const model = useCallback((): BoardViewModel => {
    if (latest.current === null) throw new Error('看板视图模型尚未就绪');
    return latest.current;
  }, []);
  const core = useViewCore(rxdb, exportBackup);
  const data = useBoardData(core);
  const vm: BoardViewModel = {
    core,
    data,
    popover: usePopoverModel(core, data, model),
    detail: useDetailModel(core, model),
    dialog: useDialogModel(core, model),
    header: useHeaderModel(core, model),
    columns: useColumnModel(core, data, model),
    cards: useCardModel(core, data, model),
    search: useSearchModel(core, data, model),
    drag: useDragModel(core, data, model)
  };
  latest.current = vm;
  useGlobalListeners(model);
  return vm;
};
