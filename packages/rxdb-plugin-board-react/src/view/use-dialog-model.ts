import { isHexColor, nextLabelColor, type BoardLabel, type DeletePlan } from '@aiao/rxdb-plugin-board';
import type { MouseEvent } from 'react';

import type { ModelGetter, TriggerEvent } from './model.js';
import type { DialogState, LabelEditorState } from './types.js';
import { useStateRef, type LatestRef } from './use-state-ref.js';
import type { ViewCore } from './use-view-core.js';

/** 模态对话框：删除确认、新建看板、标签、搜索、快捷键。 */
export interface DialogModel {
  readonly dialog: DialogState | null;
  readonly dialogRef: LatestRef<DialogState | null>;
  readonly boardComposerTitle: string;
  readonly labelEditor: LabelEditorState | null;
  readonly setBoardComposerTitle: (value: string) => void;
  readonly openDialog: (state: DialogState, event?: TriggerEvent) => void;
  /** 关闭对话框；标签删除确认关闭后回到标签列表。 */
  readonly closeDialog: (restoreFocus?: boolean) => void;
  readonly onBackdropMousedown: (event: MouseEvent<HTMLElement>) => void;
  readonly openBoardComposer: (event?: TriggerEvent) => void;
  /** 建板后切到新板；建板落库期间用户已自己切过板则尊重用户的选择。 */
  readonly submitBoardComposer: () => Promise<void>;
  readonly openLabels: (event?: TriggerEvent) => void;
  readonly openSearch: (event?: TriggerEvent) => void;
  readonly openShortcuts: () => void;
  readonly executeConfirmedDelete: () => Promise<void>;
  readonly startCreateLabel: () => void;
  readonly startEditLabel: (label: BoardLabel) => void;
  readonly updateLabelEditor: (patch: Partial<LabelEditorState>) => void;
  readonly cancelLabelEditor: () => void;
  readonly saveLabelEditor: () => Promise<void>;
  readonly deleteLabel: (label: BoardLabel) => Promise<void>;
}

const deletedMessage = (plan: DeletePlan): string => {
  if (plan.kind === 'task') return `已删除任务「${plan.taskTitle}」`;
  if (plan.kind === 'column') return `已删除列「${plan.columnTitle}」`;
  return `已删除看板「${plan.boardTitle}」`;
};

const sameColor = (a: string, b: string): boolean => a.toLowerCase() === b.trim().toLowerCase();

/** 模态对话框。 */
export const useDialogModel = (core: ViewCore, model: ModelGetter): DialogModel => {
  const [dialog, setDialog, dialogRef] = useStateRef<DialogState | null>(null);
  const [boardComposerTitle, setBoardComposerTitle, boardComposerTitleRef] = useStateRef('');
  const [labelEditor, setLabelEditor, labelEditorRef] = useStateRef<LabelEditorState | null>(null);
  const actions = () => core.boardRef.current.actions;

  const openDialog = (state: DialogState, event?: TriggerEvent): void => {
    model().popover.closePopover(false);
    if (event) core.setReturnFocus(event.currentTarget);
    setDialog(state);
    core.focusSoon('.rxb-dialog [data-autofocus]');
  };

  const closeDialog = (restoreFocus = true): void => {
    const current = dialogRef.current;
    setDialog(null);
    setLabelEditor(null);
    if (current?.kind === 'confirm-label-delete') {
      setDialog({ kind: 'labels' });
      return;
    }
    if (restoreFocus) core.restoreFocus();
  };

  /** 新建或保存标签；编辑时只写改动的名称 / 颜色（标签已被删由领域入口报 label_not_found）。 */
  const persistLabel = async (editor: LabelEditorState): Promise<true> => {
    const color = editor.color.trim();
    if (editor.labelId === null) {
      await actions().createLabel({ name: editor.name, color });
      return true;
    }
    const label = core.boardRef.current.labels.find(item => item.id === editor.labelId);
    if (label?.name !== editor.name.trim()) await actions().renameLabel(editor.labelId, editor.name);
    if (label === undefined || !sameColor(label.color, color)) await actions().recolorLabel(editor.labelId, color);
    return true;
  };

  const executeDelete = async (plan: DeletePlan): Promise<void> => {
    setDialog(null);
    const deleted = await core.guard(async () => {
      await actions().executeDelete(plan);
      return true;
    });
    if (!deleted) return;
    model().detail.dropRemoved(plan.kind === 'task' ? [plan.taskId] : plan.taskIds);
    if (plan.kind === 'board') model().search.destroySearch();
    core.showToast(deletedMessage(plan), true);
  };

  return {
    dialog,
    dialogRef,
    boardComposerTitle,
    labelEditor,
    setBoardComposerTitle,
    openDialog,
    closeDialog,
    onBackdropMousedown: event => {
      if (event.target === event.currentTarget) closeDialog();
    },
    openBoardComposer: event => {
      setBoardComposerTitle('');
      openDialog({ kind: 'board-composer' }, event);
    },
    submitBoardComposer: async () => {
      const title = boardComposerTitleRef.current.trim();
      if (title === '') return;
      const before = core.boardRef.current.currentBoardId;
      const created = await core.guard(() => actions().createBoard({ title }));
      if (!created) return;
      closeDialog(false);
      if (core.boardRef.current.currentBoardId === before) model().header.selectBoard(created.id);
    },
    openLabels: event => {
      setLabelEditor(null);
      openDialog({ kind: 'labels' }, event);
    },
    openSearch: event => openDialog({ kind: 'search' }, event),
    openShortcuts: () => {
      model().popover.closePopover(false);
      openDialog({ kind: 'shortcuts' });
    },
    executeConfirmedDelete: async () => {
      const current = dialogRef.current;
      if (current?.kind === 'confirm-delete') {
        await executeDelete(current.plan);
        return;
      }
      if (current?.kind !== 'confirm-label-delete') return;
      setDialog({ kind: 'labels' });
      const deleted = await core.guard(async () => {
        await actions().executeLabelDelete(current.plan);
        return true;
      });
      if (deleted) core.showToast(`已删除标签「${current.plan.labelName}」`, true);
    },
    startCreateLabel: () => {
      const colors = core.boardRef.current.labels.map(label => label.color);
      setLabelEditor({ labelId: null, name: '', color: nextLabelColor(colors) });
      core.focusSoon('[data-testid="label-name-input"]');
    },
    startEditLabel: label => {
      setLabelEditor({ labelId: label.id, name: label.name, color: label.color });
      core.focusSoon('[data-testid="label-name-input"]');
    },
    updateLabelEditor: patch => {
      const editor = labelEditorRef.current;
      if (editor) setLabelEditor({ ...editor, ...patch });
    },
    cancelLabelEditor: () => setLabelEditor(null),
    saveLabelEditor: async () => {
      const editor = labelEditorRef.current;
      if (!editor || editor.name.trim() === '' || !isHexColor(editor.color)) return;
      const saved = await core.guard(() => persistLabel(editor));
      if (saved !== undefined) setLabelEditor(null);
    },
    deleteLabel: async label => {
      const plan = await core.guard(() => actions().planLabelDelete(label.id));
      if (plan) setDialog({ kind: 'confirm-label-delete', plan });
    }
  };
};
