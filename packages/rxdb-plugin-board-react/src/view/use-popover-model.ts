import type { UUID } from '@aiao/rxdb';
import { nextLabelColor, placePopover } from '@aiao/rxdb-plugin-board';
import { useRef, type KeyboardEvent } from 'react';

import { anchorOf, type ModelGetter, type TriggerEvent } from './model.js';
import { POPOVER_HEIGHT, POPOVER_WIDTH, type BoardPopoverKind, type PickerOption, type PopoverState } from './types.js';
import type { BoardData } from './use-board-data.js';
import { useStateRef, type LatestRef } from './use-state-ref.js';
import type { ViewCore } from './use-view-core.js';

/** 菜单与选择器（根层 `position: fixed`，坐标取核心 `placePopover`）。 */
export interface PopoverModel {
  readonly popover: PopoverState | null;
  readonly popoverRef: LatestRef<PopoverState | null>;
  readonly pickerQuery: string;
  readonly pickerActive: number;
  readonly pickerOptions: readonly PickerOption[];
  readonly canCreateLabelFromPicker: boolean;
  readonly isPopoverFor: (kind: BoardPopoverKind, targetId: UUID) => boolean;
  readonly popoverLabel: (pop: PopoverState) => string;
  /** 关闭弹层；标签选择器关闭即提交草稿；默认把焦点还给触发器。 */
  readonly closePopover: (restoreFocus?: boolean) => void;
  /** 该种弹层已打开则关闭并返回 `true`（触发器再点即关闭）。 */
  readonly closeIfOpen: (kind: BoardPopoverKind) => boolean;
  /** 同一触发器再点关闭，否则换成新菜单。 */
  readonly togglePopover: (kind: BoardPopoverKind, targetId: UUID | null, event: TriggerEvent) => void;
  /** 以元素为锚点打开菜单（Shift+F10 / ContextMenu）。 */
  readonly openMenuAt: (kind: BoardPopoverKind, targetId: UUID, anchor: HTMLElement) => void;
  readonly openPicker: (
    kind: BoardPopoverKind,
    targetId: UUID | null,
    anchor: DOMRect,
    selection: readonly UUID[],
    event?: TriggerEvent
  ) => void;
  /** 从当前菜单展开子选择器（「移到列…」），锚点取菜单位置。 */
  readonly openChildPicker: (kind: BoardPopoverKind, targetId: UUID, selection: readonly UUID[]) => void;
  /** 标签选择器打开时的原选择（关闭时比对差集）。 */
  readonly setLabelDraft: (labelIds: readonly UUID[]) => void;
  readonly onPickerInput: (value: string) => void;
  readonly onPickerKeydown: (event: KeyboardEvent<HTMLInputElement>) => void;
  readonly choosePickerOption: (optionId: UUID) => Promise<void>;
  readonly createLabelFromPicker: () => Promise<void>;
  readonly onPopoverKeydown: (event: KeyboardEvent<HTMLElement>) => void;
}

const sameIds = (a: readonly UUID[], b: readonly UUID[]): boolean =>
  a.length === b.length && a.every(id => b.includes(id));

/** 菜单与选择器。 */
export const usePopoverModel = (core: ViewCore, data: BoardData, model: ModelGetter): PopoverModel => {
  const { board } = core;
  const [popover, setPopover, popoverRef] = useStateRef<PopoverState | null>(null);
  const [pickerQuery, setPickerQuery, pickerQueryRef] = useStateRef('');
  const [pickerActive, setPickerActive, pickerActiveRef] = useStateRef(0);
  const [pickerSelection, setPickerSelection, pickerSelectionRef] = useStateRef<readonly UUID[]>([]);
  const labelDraftRef = useRef<readonly UUID[]>([]);

  const query = pickerQuery.trim().toLowerCase();
  const candidates: readonly Omit<PickerOption, 'selected'>[] =
    popover?.kind === 'detail-label-picker' ?
      board.labels.map(label => ({ id: label.id, label: label.name, color: label.color }))
    : board.columns.map(column => ({ id: column.id, label: column.title, color: null }));
  const pickerOptions: readonly PickerOption[] =
    popover === null ?
      []
    : candidates
        .filter(option => option.label.toLowerCase().includes(query))
        .map(option => ({ ...option, selected: pickerSelection.includes(option.id) }));
  const newLabelName = pickerQuery.trim();
  const canCreateLabelFromPicker =
    popover?.kind === 'detail-label-picker' &&
    newLabelName !== '' &&
    !board.labels.some(label => label.name === newLabelName);

  const commitPickerLabels = async (): Promise<void> => {
    const selection = pickerSelectionRef.current;
    if (sameIds(selection, labelDraftRef.current)) return;
    await model().detail.saveLabels(selection);
  };

  const closePopover = (restoreFocus = true): void => {
    const pop = popoverRef.current;
    if (!pop) return;
    setPopover(null);
    if (pop.kind === 'detail-label-picker') void commitPickerLabels();
    if (restoreFocus) core.restoreFocus();
  };

  const placed = (
    kind: BoardPopoverKind,
    targetId: UUID | null,
    anchor: DOMRect,
    align: 'start' | 'end'
  ): PopoverState => {
    const width = POPOVER_WIDTH[kind];
    const position = placePopover(
      anchor,
      { width, height: POPOVER_HEIGHT[kind] },
      { width: window.innerWidth, height: window.innerHeight },
      { align }
    );
    return { kind, targetId, width, ...position };
  };

  const openPicker: PopoverModel['openPicker'] = (kind, targetId, anchor, selection, event) => {
    closePopover(false);
    if (event) core.setReturnFocus(event.currentTarget);
    setPickerQuery('');
    setPickerActive(0);
    setPickerSelection(selection);
    setPopover(placed(kind, targetId, anchor, kind === 'move-picker' ? 'end' : 'start'));
    core.focusSoon('[data-testid="picker-filter"]');
  };

  const onPickerInput = (value: string): void => {
    setPickerQuery(value);
    setPickerActive(0);
  };

  const choosePickerOption = async (optionId: UUID): Promise<void> => {
    const pop = popoverRef.current;
    if (!pop) return;
    if (pop.kind === 'detail-label-picker') {
      const selection = pickerSelectionRef.current;
      setPickerSelection(
        selection.includes(optionId) ? selection.filter(id => id !== optionId) : [...selection, optionId]
      );
      return;
    }
    const fromDetail = pop.kind === 'detail-column-picker';
    closePopover(fromDetail);
    if (pop.targetId !== null) await model().cards.moveTaskToColumn(pop.targetId, optionId, !fromDetail);
  };

  const createLabelFromPicker = async (): Promise<void> => {
    const name = pickerQueryRef.current.trim();
    const color = nextLabelColor(core.boardRef.current.labels.map(label => label.color));
    const created = await core.guard(() => core.boardRef.current.actions.createLabel({ name, color }));
    if (!created) return;
    setPickerSelection([...pickerSelectionRef.current, created.id]);
    onPickerInput('');
  };

  return {
    popover,
    popoverRef,
    pickerQuery,
    pickerActive,
    pickerOptions,
    canCreateLabelFromPicker,
    isPopoverFor: (kind, targetId) => popover?.kind === kind && popover.targetId === targetId,
    popoverLabel: pop => {
      if (pop.kind === 'board-menu') return '看板操作';
      if (pop.kind === 'column-menu') return `列操作：${data.columnTitleOf(pop.targetId)}`;
      if (pop.kind === 'task-menu') return `任务操作：${data.taskById(pop.targetId)?.title ?? ''}`;
      return pop.kind === 'detail-label-picker' ? '选择标签' : '移到列';
    },
    closePopover,
    closeIfOpen: kind => {
      if (popoverRef.current?.kind !== kind) return false;
      closePopover();
      return true;
    },
    togglePopover: (kind, targetId, event) => {
      const pop = popoverRef.current;
      if (pop?.kind === kind && pop.targetId === targetId) {
        closePopover();
        return;
      }
      closePopover(false);
      core.setReturnFocus(event.currentTarget);
      setPopover(placed(kind, targetId, anchorOf(event), 'end'));
      core.focusSoon('.rxb-popover button:not(:disabled)');
    },
    openMenuAt: (kind, targetId, anchor) => {
      closePopover(false);
      core.setReturnFocus(anchor);
      setPopover(placed(kind, targetId, anchor.getBoundingClientRect(), 'end'));
      core.focusSoon('.rxb-popover button:not(:disabled)');
    },
    openPicker,
    openChildPicker: (kind, targetId, selection) => {
      const pop = popoverRef.current;
      const anchor = pop ? new DOMRect(pop.left + pop.width, pop.top, 0, 0) : new DOMRect();
      setPopover(null);
      openPicker(kind, targetId, anchor, selection);
    },
    setLabelDraft: labelIds => {
      labelDraftRef.current = labelIds;
    },
    onPickerInput,
    onPickerKeydown: event => {
      const count = pickerOptions.length;
      if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && count > 0) {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setPickerActive((pickerActiveRef.current + step + count) % count);
        return;
      }
      if (event.key !== 'Enter') return;
      event.preventDefault();
      const option = pickerOptions[pickerActiveRef.current];
      if (option) void choosePickerOption(option.id);
      else if (canCreateLabelFromPicker) void createLabelFromPicker();
    },
    choosePickerOption,
    createLabelFromPicker,
    onPopoverKeydown: event => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      closePopover();
    }
  };
};
