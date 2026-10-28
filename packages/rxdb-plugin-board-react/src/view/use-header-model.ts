import type { UUID } from '@aiao/rxdb';
import type { ChangeEvent, KeyboardEvent } from 'react';

import type { ModelGetter, TriggerEvent } from './model.js';
import { isModifier } from './types.js';
import { useStateRef } from './use-state-ref.js';
import type { ViewCore } from './use-view-core.js';

/** 页头：板切换 / 标题 / 描述 / 看板菜单 / 撤销重做。 */
export interface HeaderModel {
  readonly editingBoardTitle: boolean;
  readonly boardTitleDraft: string;
  readonly editingBoardDescription: boolean;
  readonly boardDescriptionDraft: string;
  readonly setBoardTitleDraft: (value: string) => void;
  readonly setBoardDescriptionDraft: (value: string) => void;
  readonly onBoardSelectionChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  /** 切板：关闭弹层与详情，切换数据流，并按原查询词重建搜索句柄。 */
  readonly selectBoard: (boardId: UUID) => void;
  readonly startBoardTitle: () => void;
  readonly commitBoardTitle: () => Promise<void>;
  readonly onBoardTitleKeydown: (event: KeyboardEvent<HTMLInputElement>) => void;
  readonly startBoardDescription: () => void;
  readonly commitBoardDescription: () => Promise<void>;
  readonly onBoardDescriptionKeydown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  readonly openBoardMenu: (event: TriggerEvent) => void;
  readonly onExportBackup: () => Promise<void>;
  readonly confirmBoardDelete: () => Promise<void>;
  readonly undo: () => Promise<void>;
  readonly redo: () => Promise<void>;
  readonly undoFromToast: () => Promise<void>;
}

/** 页头。 */
export const useHeaderModel = (core: ViewCore, model: ModelGetter): HeaderModel => {
  const [editingBoardTitle, setEditingBoardTitle, editingBoardTitleRef] = useStateRef(false);
  const [boardTitleDraft, setBoardTitleDraft, boardTitleDraftRef] = useStateRef('');
  const [editingBoardDescription, setEditingBoardDescription, editingBoardDescriptionRef] = useStateRef(false);
  const [boardDescriptionDraft, setBoardDescriptionDraft, boardDescriptionDraftRef] = useStateRef('');
  const latest = () => core.boardRef.current;

  const selectBoard = (boardId: UUID): void => {
    model().popover.closePopover(false);
    model().detail.reset();
    latest().selectBoard(boardId);
    // 切板销毁旧搜索句柄（setQuery 同词会被 distinctUntilChanged 吞掉，必须重建）
    model().search.rebuildSearch();
  };

  const commitBoardTitle = async (): Promise<void> => {
    const current = latest().currentBoard;
    if (!editingBoardTitleRef.current || !current) return;
    setEditingBoardTitle(false);
    const title = boardTitleDraftRef.current;
    if (title.trim() === current.title) return;
    const saved = await core.guard(() => latest().actions.updateBoard(current.id, { title }));
    if (saved === undefined) setEditingBoardTitle(true);
  };

  const commitBoardDescription = async (): Promise<void> => {
    const current = latest().currentBoard;
    if (!editingBoardDescriptionRef.current || !current) return;
    setEditingBoardDescription(false);
    const description = boardDescriptionDraftRef.current.trim();
    if (description === (current.description ?? '')) return;
    await core.guard(() => latest().actions.updateBoard(current.id, { description }));
  };

  const runHistory = async (operation: () => Promise<void>): Promise<void> => {
    const done = await core.guard(async () => {
      await operation();
      return true;
    });
    if (done) await model().detail.refreshDetail();
  };
  const undo = (): Promise<void> => runHistory(() => latest().actions.undo());

  return {
    editingBoardTitle,
    boardTitleDraft,
    editingBoardDescription,
    boardDescriptionDraft,
    setBoardTitleDraft,
    setBoardDescriptionDraft,
    onBoardSelectionChange: event => selectBoard(event.target.value as UUID),
    selectBoard,
    startBoardTitle: () => {
      setBoardTitleDraft(latest().currentBoard?.title ?? '');
      setEditingBoardTitle(true);
      core.focusSoon('[data-testid="board-title-editor"]');
    },
    commitBoardTitle,
    onBoardTitleKeydown: event => {
      if (event.key === 'Enter') void commitBoardTitle();
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setEditingBoardTitle(false);
    },
    startBoardDescription: () => {
      setBoardDescriptionDraft(latest().currentBoard?.description ?? '');
      setEditingBoardDescription(true);
      core.focusSoon('[data-testid="board-description-editor"]');
    },
    commitBoardDescription,
    onBoardDescriptionKeydown: event => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setEditingBoardDescription(false);
      }
      if (event.key === 'Enter' && isModifier(event)) void commitBoardDescription();
    },
    openBoardMenu: event => model().popover.togglePopover('board-menu', null, event),
    onExportBackup: async () => {
      model().popover.closePopover();
      const callback = core.exportBackupRef.current;
      if (!callback) {
        core.showNotice('备份导出由宿主接线（US-537）');
        return;
      }
      await core.guard(async () => {
        await callback();
        core.showToast('备份已生成', false);
      });
    },
    confirmBoardDelete: async () => {
      const current = latest().currentBoard;
      model().popover.closePopover(false);
      if (!current) return;
      const plan = await core.guard(() => latest().actions.planBoardDelete(current.id));
      if (plan) model().dialog.openDialog({ kind: 'confirm-delete', plan });
    },
    undo,
    redo: () => runHistory(() => latest().actions.redo()),
    undoFromToast: async () => {
      core.setToast(null);
      await undo();
    }
  };
};
