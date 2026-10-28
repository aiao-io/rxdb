import type { UUID } from '@aiao/rxdb';
import type { BoardLabel, TaskDraftSnapshot, TaskFieldPatch } from '@aiao/rxdb-plugin-board';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

import { anchorOf, type ModelGetter, type TriggerEvent } from './model.js';
import { isModifier } from './types.js';
import { useStateRef, type LatestRef } from './use-state-ref.js';
import type { ViewCore } from './use-view-core.js';

interface DetailSession {
  readonly taskId: UUID;
  readonly actions: ViewCore['board']['actions'];
  base: TaskDraftSnapshot;
}

/** 任务详情侧栏（叠加在看板之上，字段即改即存，每次改动一个可撤销事务）。 */
export interface DetailModel {
  readonly detailTaskId: UUID | null;
  readonly detailTaskIdRef: LatestRef<UUID | null>;
  readonly detailBase: TaskDraftSnapshot | null;
  readonly detailTitle: string;
  readonly detailDescription: string;
  /** 截止日输入框的草稿（保存成功或重读后以最新快照为准）。 */
  readonly detailDue: string;
  readonly detailStatus: string | null;
  readonly detailLabels: readonly BoardLabel[];
  readonly setDetailTitle: (value: string) => void;
  readonly setDetailDescription: (value: string) => void;
  readonly openDetail: (taskId: UUID) => Promise<void>;
  readonly closeDetail: () => void;
  readonly commitDetailTitle: () => Promise<void>;
  readonly onDetailTitleKeydown: (event: KeyboardEvent<HTMLInputElement>) => void;
  readonly commitDetailDescription: () => Promise<void>;
  readonly onDetailDescriptionKeydown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  readonly onDetailDueChange: (value: string) => void;
  readonly commitDetailDue: (value: string) => Promise<void>;
  readonly openDetailColumnPicker: (event: TriggerEvent) => void;
  readonly openDetailLabelPicker: (event: TriggerEvent) => void;
  readonly deleteDetailTask: (event: TriggerEvent) => Promise<void>;
  /** 标签选择器关闭时的一次提交（进同一条串行队列）。 */
  readonly saveLabels: (labelIds: readonly UUID[]) => Promise<void>;
  /** 撤销 / 重做后重读：任务已不存在则关闭侧栏。 */
  readonly refreshDetail: () => Promise<void>;
  /** 删除落库后：被删任务的详情关闭，加载中的迟到快照作废。 */
  readonly dropRemoved: (taskIds: readonly UUID[]) => void;
  /** 切板：关闭详情并作废加载中的快照。 */
  readonly reset: () => void;
  /** 本侧栏发起或看板上的移动成功后同步「所在列」基线。 */
  readonly applyMovedColumn: (taskId: UUID, columnId: UUID) => void;
}

/** 任务详情侧栏。 */
export const useDetailModel = (core: ViewCore, model: ModelGetter): DetailModel => {
  const [detailTaskId, setDetailTaskId, detailTaskIdRef] = useStateRef<UUID | null>(null);
  const [detailBase, setDetailBase, detailBaseRef] = useStateRef<TaskDraftSnapshot | null>(null);
  const [detailTitle, setDetailTitle, detailTitleRef] = useStateRef('');
  const [detailDescription, setDetailDescription, detailDescriptionRef] = useStateRef('');
  const [detailDue, setDetailDue] = useStateRef('');
  const [detailStatus, setDetailStatus] = useState<string | null>(null);
  const requestRef = useRef(0);
  const pendingRef = useRef<UUID | null>(null);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const sessionRef = useRef<DetailSession | null>(null);

  // 卸载后迟到的快照不再写入
  useEffect(
    () => () => {
      requestRef.current++;
    },
    []
  );

  const actions = () => core.boardRef.current.actions;

  const applySnapshot = (snapshot: TaskDraftSnapshot): void => {
    if (sessionRef.current !== null) sessionRef.current.base = snapshot;
    setDetailBase(snapshot);
    setDetailTitle(snapshot.title);
    setDetailDescription(snapshot.description ?? '');
    setDetailDue(snapshot.dueDate ?? '');
  };

  const clear = (): void => {
    requestRef.current++;
    sessionRef.current = null;
    setDetailTaskId(null);
    setDetailBase(null);
  };

  /** 详情字段的提交串行执行：回车后紧跟失焦等重复提交读到的是上一笔保存后的基线。 */
  const enqueue = (operation: (session: DetailSession) => Promise<unknown>): Promise<void> => {
    const session = sessionRef.current;
    if (session === null) return Promise.resolve();
    const run = () => operation(session);
    const next = queueRef.current.then(run, run);
    queueRef.current = next.catch(() => undefined);
    return next.then(() => undefined);
  };

  const saveFields = async (session: DetailSession, patch: TaskFieldPatch): Promise<void> => {
    if (session === sessionRef.current) setDetailStatus('保存中…');
    const result = await core.guard(() => session.actions.saveTaskFields(session.taskId, session.base, patch));
    if (result === undefined) {
      if (session === sessionRef.current) setDetailStatus(null);
      return;
    }
    const fresh = await core.guard(() => session.actions.openSnapshot(session.taskId));
    if (fresh) session.base = fresh;
    if (session !== sessionRef.current) return;
    if (!fresh) {
      setDetailStatus(null);
      return;
    }
    setDetailBase(fresh);
    if (patch.title !== undefined) setDetailTitle(fresh.title);
    if (patch.description !== undefined) setDetailDescription(fresh.description ?? '');
    if (patch.dueDate !== undefined) setDetailDue(fresh.dueDate ?? '');
    setDetailStatus(result.kind === 'saved' ? '已保存' : null);
  };

  const closeDetail = (): void => {
    const taskId = detailTaskIdRef.current;
    clear();
    if (taskId !== null) core.focusTaskSoon(taskId);
  };

  const commitDetailTitle = (): Promise<void> => {
    const title = detailTitleRef.current;
    return enqueue(async session => {
      if (title !== session.base.title) await saveFields(session, { title });
    });
  };
  const commitDetailDescription = (): Promise<void> => {
    const description = detailDescriptionRef.current;
    return enqueue(async session => {
      if (description.trim() !== (session.base.description ?? '')) await saveFields(session, { description });
    });
  };
  const commitDetailDue = (value: string): Promise<void> =>
    enqueue(async session => {
      const dueDate = value === '' ? null : value;
      if (dueDate !== session.base.dueDate) await saveFields(session, { dueDate });
    });

  return {
    detailTaskId,
    detailTaskIdRef,
    detailBase,
    detailTitle,
    detailDescription,
    detailDue,
    detailStatus,
    detailLabels: detailBase === null ? [] : core.board.labels.filter(label => detailBase.labelIds.includes(label.id)),
    setDetailTitle,
    setDetailDescription,
    openDetail: async taskId => {
      model().popover.closePopover(false);
      const request = ++requestRef.current;
      pendingRef.current = taskId;
      const currentActions = actions();
      const snapshot = await core.guard(() => currentActions.openSnapshot(taskId));
      if (request !== requestRef.current || !snapshot) return;
      pendingRef.current = null;
      sessionRef.current = { taskId, actions: currentActions, base: snapshot };
      setDetailTaskId(taskId);
      model().data.setFocusedTaskId(taskId);
      applySnapshot(snapshot);
      setDetailStatus(null);
    },
    closeDetail,
    commitDetailTitle,
    onDetailTitleKeydown: event => {
      if (event.key === 'Enter') void commitDetailTitle();
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setDetailTitle(detailBaseRef.current?.title ?? '');
    },
    commitDetailDescription,
    onDetailDescriptionKeydown: event => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setDetailDescription(detailBaseRef.current?.description ?? '');
      }
      if (event.key === 'Enter' && isModifier(event)) void commitDetailDescription();
    },
    onDetailDueChange: value => {
      setDetailDue(value);
      void commitDetailDue(value);
    },
    commitDetailDue,
    openDetailColumnPicker: event => {
      const base = detailBaseRef.current;
      if (!base || model().popover.closeIfOpen('detail-column-picker')) return;
      model().popover.openPicker(
        'detail-column-picker',
        detailTaskIdRef.current,
        anchorOf(event),
        [base.columnId],
        event
      );
    },
    openDetailLabelPicker: event => {
      const base = detailBaseRef.current;
      // 再点同一字段 = 关闭（并提交）：不能以未刷新的旧基线重开
      if (!base || model().popover.closeIfOpen('detail-label-picker')) return;
      model().popover.setLabelDraft(base.labelIds);
      model().popover.openPicker('detail-label-picker', detailTaskIdRef.current, anchorOf(event), base.labelIds, event);
    },
    deleteDetailTask: async event => {
      const task = model().data.taskById(detailTaskIdRef.current);
      core.setReturnFocus(event.currentTarget);
      if (task) await model().cards.confirmTaskDelete(task);
    },
    saveLabels: labelIds => enqueue(session => saveFields(session, { labelIds: [...labelIds] })),
    refreshDetail: async () => {
      const taskId = detailTaskIdRef.current;
      if (taskId === null) return;
      try {
        const snapshot = await actions().openSnapshot(taskId);
        if (taskId === detailTaskIdRef.current) applySnapshot(snapshot);
      } catch {
        if (taskId === detailTaskIdRef.current) closeDetail();
      }
    },
    dropRemoved: taskIds => {
      if (pendingRef.current !== null && taskIds.includes(pendingRef.current)) requestRef.current++;
      const taskId = detailTaskIdRef.current;
      if (taskId !== null && taskIds.includes(taskId)) clear();
    },
    reset: clear,
    applyMovedColumn: (taskId, columnId) => {
      const base = detailBaseRef.current;
      if (detailTaskIdRef.current === taskId && base !== null) {
        const fresh = { ...base, columnId };
        if (sessionRef.current !== null) sessionRef.current.base = fresh;
        setDetailBase(fresh);
      }
    }
  };
};
