<script setup lang="ts">
import { computed, onBeforeUnmount, ref, toRaw } from 'vue';
import type { UUID } from '@aiao/rxdb';
import {
  labelTextColor,
  resolveCardDrop,
  resolveColumnDrop,
  type BoardLabel,
  type BoardSearchUpstream,
  type CardDropColumnView,
  type CardDropTarget,
  type SearchHandle,
  type SearchResult,
  type TaskDraftSnapshot
} from '@aiao/rxdb-plugin-board';
import { Subscription } from 'rxjs';

import { useBoard } from './use-board.js';

/**
 * 看板视图组件（US-539 阶段 A）：列 + 卡片 + 拖拽 + 本列排序 + 详情面板 +
 * 标签管理 + 撤销重做 + 备份入口占位 + 删除确认。
 *
 * 三端只采集指针事件，落点换算调用核心包同一份 `resolveCardDrop` /
 * `resolveColumnDrop`；全部写入口经 {@link useBoard} 的领域动作。
 * 与 Angular / React 同功能同领域 API（交互约定见 US-539）。
 */
const props = defineProps<{
  /** 已连接的看板 RxDB 实例（实体含 board 命名空间五实体，需历史插件）。 */
  rxdb: Parameters<typeof useBoard>[0];
  /** 备份导出回调（US-537 编排由宿主接线；缺省展示占位提示）。 */
  onExportBackup?: () => void | Promise<void>;
}>();

// Vue 会把 props 包成 reactive 代理：类实例（EntityManager 等）经代理调用
// 会丢私有成员与原型链，必须取回原始对象（Vue 官方 toRaw 语义）
const searchUpstream = toRaw(props.rxdb).getPlugins('search')[0];
const board = useBoard(
  toRaw(props.rxdb),
  searchUpstream ? { search: { upstream: searchUpstream as unknown as BoardSearchUpstream } } : undefined
);

const editTitleTaskId = ref<UUID | null>(null);
const editTitleValue = ref('');
const detailTaskId = ref<UUID | null>(null);
const draft = ref({ title: '', description: '', dueDate: '', labelIds: [] as readonly UUID[] });
const snapshot = ref<TaskDraftSnapshot | null>(null);
const confirm = ref<ConfirmState | null>(null);

// ---------- 板内搜索（US-539 阶段 B） ----------
const searchQuery = ref('');
const searchState = ref<'idle' | 'loading' | 'success' | 'empty' | 'error'>('idle');
const searchResults = ref<readonly SearchResult[]>([]);
const searchHasMore = ref(false);
const searchErrorText = ref<string | null>(null);
const searchHighlightId = ref<UUID | null>(null);
let searchHandle: SearchHandle | null = null;
let searchSubs: Subscription | null = null;
let highlightTimer: number | null = null;

const destroySearch = (): void => {
  searchHandle?.destroy();
  searchHandle = null;
  searchState.value = 'idle';
  searchResults.value = [];
  searchHasMore.value = false;
  searchErrorText.value = null;
};

const onSearchInputValue = (value: string): void => {
  searchQuery.value = value;
  const query = value.trim();
  if (query === '') {
    destroySearch();
    return;
  }
  const source = board.searchSource;
  if (!source) return;
  if (searchHandle === null) {
    const handle = source.search(query);
    searchHandle = handle;
    // 上一组句柄订阅先退订（destroy 不保证上游 observable 不再发射）
    searchSubs?.unsubscribe();
    const subs = new Subscription();
    subs.add(handle.state$.subscribe(state => (searchState.value = state)));
    subs.add(handle.results$.subscribe(results => (searchResults.value = results)));
    subs.add(handle.hasMore$.subscribe(more => (searchHasMore.value = more)));
    subs.add(handle.error$.subscribe(error => (searchErrorText.value = String(error))));
    searchSubs = subs;
  } else {
    searchHandle.setQuery(query);
  }
};

const onSearchInput = (event: Event): void => {
  onSearchInputValue((event.target as HTMLInputElement).value);
};

/** 点结果：滚动到目标卡片并短暂高亮（更新中由「搜索中」状态接管，无结果可点）。 */
const onSearchResultClick = (result: SearchResult): void => {
  document.querySelector<HTMLElement>(`[data-task-id="${result.id}"]`)?.scrollIntoView({ block: 'center' });
  const targetId = result.id as UUID;
  searchHighlightId.value = targetId;
  if (highlightTimer !== null) window.clearTimeout(highlightTimer);
  highlightTimer = window.setTimeout(() => {
    if (searchHighlightId.value === targetId) searchHighlightId.value = null;
  }, 2000);
};

const searchResultTitle = (result: SearchResult): string =>
  board.tasks.value.find(task => task.id === (result.id as UUID))?.title ?? '';
const searchResultColumn = (result: SearchResult): string => {
  const task = board.tasks.value.find(candidate => candidate.id === (result.id as UUID));
  return task ? (board.columns.value.find(column => column.id === task.columnId)?.title ?? '') : '';
};

onBeforeUnmount(() => {
  if (highlightTimer !== null) window.clearTimeout(highlightTimer);
  if (noticeTimer !== null) window.clearTimeout(noticeTimer);
  searchSubs?.unsubscribe();
  searchHandle?.destroy();
});
const notice = ref<string | null>(null);

const taskMap = computed(() => {
  const grouped = new Map<UUID, (typeof board.tasks.value)[number][]>();
  for (const column of board.columns.value) grouped.set(column.id, []);
  for (const task of board.tasks.value) {
    const list = grouped.get(task.columnId) ?? [];
    list.push(task);
    grouped.set(task.columnId, list);
  }
  return grouped;
});

let noticeTimer: number | null = null;
const scheduleNoticeClear = (): void => {
  if (noticeTimer !== null) window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => (notice.value = null), 5000);
};

const guard = async <T,>(operation: () => Promise<T>): Promise<T | undefined> => {
  try {
    notice.value = null;
    return await operation();
  } catch (error) {
    notice.value = error instanceof Error ? error.message : String(error);
    scheduleNoticeClear();
    return undefined;
  }
};

const promptTitle = (message: string, initial?: string): string | null => {
  const value = typeof window !== 'undefined' ? window.prompt(message, initial) : null;
  return value === null ? null : value;
};

const createBoard = async (): Promise<void> => {
  const title = promptTitle('新建看板：标题');
  if (title === null) return;
  await guard(() => board.actions.createBoard({ title }));
};
const createColumn = async (): Promise<void> => {
  const title = promptTitle('新建列：标题');
  if (title === null) return;
  await guard(() => board.actions.createColumn({ title }));
};
const createTask = async (columnId: UUID): Promise<void> => {
  const title = promptTitle('新建任务：标题');
  if (title === null) return;
  await guard(() => board.actions.createTask({ columnId, title }));
};

const startEditTitle = (taskId: UUID, title: string): void => {
  editTitleValue.value = title;
  editTitleTaskId.value = taskId;
};
const commitEditTitle = async (taskId: UUID): Promise<void> => {
  editTitleTaskId.value = null;
  await guard(() => board.actions.updateTaskTitle(taskId, editTitleValue.value));
};

/** 拖拽落点反馈（GitHub Projects 同款：插入线 / 列高亮 / 源卡片半透明）。 */
const dragging = ref<{ readonly kind: 'task' | 'column'; readonly id: UUID } | null>(null);
const dropTarget = ref<
  | { readonly kind: 'task'; readonly columnId: UUID; readonly mode: 'before' | 'after'; readonly taskId: UUID }
  | { readonly kind: 'task-end'; readonly columnId: UUID }
  | { readonly kind: 'column'; readonly columnId: UUID; readonly mode: 'before' | 'after' }
  | null
>(null);

const onTaskDragStart = (event: DragEvent, taskId: UUID): void => {
  event.dataTransfer?.setData('application/x-board-task', taskId);
  dragging.value = { kind: 'task', id: taskId };
};
const onColumnDragStart = (event: DragEvent, columnId: UUID): void => {
  event.dataTransfer?.setData('application/x-board-column', columnId);
  dragging.value = { kind: 'column', id: columnId };
};

const columnViews = (): CardDropColumnView[] =>
  board.columns.value.map(column => {
    const columnEl = document.querySelector<HTMLElement>(`[data-column-id="${column.id}"]`);
    const rect = columnEl?.getBoundingClientRect();
    const cards = (taskMap.value.get(column.id) ?? []).map(task => {
      const cardEl = document.querySelector<HTMLElement>(`[data-task-id="${task.id}"]`);
      const cardRect = cardEl?.getBoundingClientRect();
      return { id: task.id, top: cardRect?.top ?? 0, bottom: cardRect?.bottom ?? 0 };
    });
    return {
      columnId: column.id,
      rect: { left: rect?.left ?? 0, right: rect?.right ?? 0, top: rect?.top ?? 0, bottom: rect?.bottom ?? 0 },
      cards,
      taskIds: (taskMap.value.get(column.id) ?? []).map(task => task.id)
    };
  });

/** 卡片落点反馈：dragover 时预计算落点并标在目标卡片 / 空列上。 */
const onTaskDragOver = (event: DragEvent): void => {
  event.preventDefault();
  const movedId = dragging.value?.id;
  if (!movedId) return;
  const target = resolveCardDrop(columnViews(), movedId, event.clientX, event.clientY);
  if (!target) {
    dropTarget.value = null;
    return;
  }
  dropTarget.value =
    target.kind === 'end' ?
      { kind: 'task-end', columnId: target.columnId }
    : {
        kind: 'task',
        columnId: target.columnId,
        mode: target.prevId === null ? 'before' : 'after',
        taskId: (target.prevId ?? target.nextId)!
      };
};

/** 列头落点反馈：列间插入线。 */
const onColumnDragOver = (event: DragEvent): void => {
  event.preventDefault();
  const movedId = dragging.value?.id;
  if (!movedId) return;
  const target = resolveColumnDrop(
    board.columns.value.map(column => {
      const headerEl = document.querySelector<HTMLElement>(`[data-column-header-id="${column.id}"]`);
      const rect = headerEl?.getBoundingClientRect();
      return { columnId: column.id, rect: { left: rect?.left ?? 0, right: rect?.right ?? 0 } };
    }),
    board.columns.value.map(column => column.id),
    movedId,
    event.clientX
  );
  if (!target) {
    dropTarget.value = null;
    return;
  }
  const anchorId = target.prevId ?? target.nextId;
  if (anchorId === null) {
    dropTarget.value = null;
    return;
  }
  dropTarget.value = { kind: 'column', columnId: anchorId, mode: target.prevId === null ? 'before' : 'after' };
};

const clearDragFeedback = (): void => {
  dragging.value = null;
  dropTarget.value = null;
};

const resolveTaskTarget = (movedId: UUID, clientX: number, clientY: number): CardDropTarget | null =>
  resolveCardDrop(columnViews(), movedId, clientX, clientY);

const resolveColumnTarget = (
  movedId: UUID,
  clientX: number
): { readonly prevId: UUID | null; readonly nextId: UUID | null } | null => {
  const views = board.columns.value.map(column => {
    const headerEl = document.querySelector<HTMLElement>(`[data-column-header-id="${column.id}"]`);
    const rect = headerEl?.getBoundingClientRect();
    return { columnId: column.id, rect: { left: rect?.left ?? 0, right: rect?.right ?? 0 } };
  });
  const target = resolveColumnDrop(
    views,
    board.columns.value.map(column => column.id),
    movedId,
    clientX
  );
  return target ? { prevId: target.prevId as UUID, nextId: target.nextId as UUID } : null;
};

const onTaskDrop = async (event: DragEvent, columnId: UUID): Promise<void> => {
  event.preventDefault();
  const movedId = event.dataTransfer?.getData('application/x-board-task') as UUID | undefined;
  if (!movedId) return;
  clearDragFeedback();
  const target = resolveTaskTarget(movedId, event.clientX, event.clientY);
  if (!target) return;
  await guard(() => board.actions.moveTask(movedId, target));
};

const onColumnDrop = async (event: DragEvent): Promise<void> => {
  event.preventDefault();
  const movedId = event.dataTransfer?.getData('application/x-board-column') as UUID | undefined;
  if (!movedId) return;
  clearDragFeedback();
  const target = resolveColumnTarget(movedId, event.clientX);
  if (!target) return;
  await guard(() => board.actions.moveColumn(movedId, target));
};

const sortColumnBy = async (columnId: UUID, mode: 'dueDate' | 'title'): Promise<void> => {
  const result = await guard(() => board.actions.sortColumn(columnId, mode));
  if (result && !result.written) notice.value = '已按目标顺序排列，无变化';
};

const moveColumnBy = async (columnId: UUID, direction: -1 | 1): Promise<void> => {
  const ids = board.columns.value.map(column => column.id);
  const index = ids.indexOf(columnId);
  if (index < 0) return;
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= ids.length) return;
  const target =
    direction < 0 ?
      { prevId: ids[targetIndex - 1] ?? null, nextId: ids[targetIndex] }
    : { prevId: ids[targetIndex], nextId: ids[targetIndex + 1] ?? null };
  await guard(() => board.actions.moveColumn(columnId, target));
};

const openDetail = async (taskId: UUID): Promise<void> => {
  const snap = await board.actions.openSnapshot(taskId);
  snapshot.value = snap;
  draft.value = {
    title: snap.title,
    description: snap.description ?? '',
    dueDate: snap.dueDate ?? '',
    labelIds: [...snap.labelIds]
  };
  detailTaskId.value = taskId;
};
const saveDetail = async (): Promise<void> => {
  if (!detailTaskId.value || !snapshot.value) return;
  const result = await guard(() =>
    board.actions.saveTaskDraft(detailTaskId.value!, snapshot.value!, {
      title: draft.value.title,
      description: draft.value.description,
      dueDate: draft.value.dueDate === '' ? null : draft.value.dueDate,
      labelIds: draft.value.labelIds
    })
  );
  // 保存失败（空标题 / 非法日期 / 快照复核拒绝等）保留草稿，不关面板
  if (result === undefined) return;
  detailTaskId.value = null;
  snapshot.value = null;
};
const toggleDraftLabel = (labelId: UUID): void => {
  draft.value.labelIds =
    draft.value.labelIds.includes(labelId) ?
      draft.value.labelIds.filter(id => id !== labelId)
    : [...draft.value.labelIds, labelId];
};

const createLabel = async (): Promise<void> => {
  const name = promptTitle('新建标签：名称');
  if (name === null) return;
  const color = promptTitle('标签颜色（#rrggbb）', '#e11d48');
  if (color === null) return;
  await guard(() => board.actions.createLabel({ name, color }));
};
const renameLabel = async (labelId: UUID): Promise<void> => {
  const label = board.labels.value.find(item => item.id === labelId);
  if (!label) return;
  const name = promptTitle('改标签名', label.name);
  if (name === null) return;
  await guard(() => board.actions.renameLabel(labelId, name));
};
const deleteLabel = async (labelId: UUID): Promise<void> => {
  const plan = await board.actions.planLabelDelete(labelId);
  if (!window.confirm(`删除标签「${plan.labelName}」？将移除 ${plan.taskLabelIds.length} 条任务关联。`)) return;
  await guard(() => board.actions.executeLabelDelete(plan));
};

const confirmTaskDelete = async (taskId: UUID): Promise<void> => {
  const plan = await board.actions.planTaskDelete(taskId);
  confirm.value = { kind: 'task', taskId, title: plan.taskTitle };
};
const confirmColumnDelete = async (columnId: UUID): Promise<void> => {
  const plan = await board.actions.planColumnDelete(columnId);
  confirm.value = { kind: 'column', columnId, title: plan.columnTitle, count: plan.taskIds.length };
};
const confirmBoardDelete = async (): Promise<void> => {
  const current = board.currentBoard.value;
  if (!current) return;
  const plan = await board.actions.planBoardDelete(current.id);
  confirm.value = {
    kind: 'board',
    boardId: current.id,
    title: plan.boardTitle,
    count: plan.taskIds.length,
    columns: plan.columnIds.length
  };
};
const executeConfirmedDelete = async (): Promise<void> => {
  const pending = confirm.value;
  if (!pending) return;
  confirm.value = null;
  if (pending.kind === 'task') {
    const plan = await board.actions.planTaskDelete(pending.taskId);
    await guard(() => board.actions.executeDelete(plan));
  } else if (pending.kind === 'column') {
    const plan = await board.actions.planColumnDelete(pending.columnId);
    await guard(() => board.actions.executeDelete(plan));
  } else {
    const plan = await board.actions.planBoardDelete(pending.boardId);
    await guard(() => board.actions.executeDelete(plan));
  }
};

const dueDateText = (due: string | null): string => {
  if (!due) return '';
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return (
    due < today ? `已逾期 ${due}`
    : due === today ? '今天到期'
    : due
  );
};

const labelsOf = (taskId: UUID): readonly BoardLabel[] => board.taskLabels.value.get(taskId) ?? [];

const onSelectBoard = (event: Event): void => {
  board.selectBoard((event.target as HTMLSelectElement).value as UUID);
  // 切板丢弃旧板结果：销毁重建句柄重发（setQuery 同词会被 distinctUntilChanged 吞掉）
  const query = searchQuery.value.trim();
  if (query !== '') {
    destroySearch();
    onSearchInputValue(query);
  }
};

const onRenameBoard = (): void => {
  const current = board.currentBoard.value;
  if (!current) return;
  const title = promptTitle('改板标题', current.title);
  if (title !== null) void guard(() => board.actions.updateBoard(current.id, { title }));
};

const onRenameColumn = (columnId: UUID): void => {
  const column = board.columns.value.find(item => item.id === columnId);
  if (!column) return;
  const title = promptTitle('改列标题', column.title);
  if (title !== null) void guard(() => board.actions.updateColumn(columnId, { title }));
};

const exportBackup = (): void => {
  if (props.onExportBackup) void props.onExportBackup();
  else notice.value = '备份导出由宿主接线（US-537）';
};

type ConfirmState =
  | { readonly kind: 'task'; readonly taskId: UUID; readonly title: string }
  | { readonly kind: 'column'; readonly columnId: UUID; readonly title: string; readonly count: number }
  | {
      readonly kind: 'board';
      readonly boardId: UUID;
      readonly title: string;
      readonly count: number;
      readonly columns: number;
    };
</script>

<template>
  <section
    class="board-view"
    data-testid="board-view"
    @dragover.prevent
    @dragend="clearDragFeedback"
    @drop="onColumnDrop"
  >
    <template v-if="board.currentBoard.value">
      <header
        class="board-header"
        data-testid="board-header"
      >
        <select
          class="board-selector"
          :value="board.currentBoardId.value ?? ''"
          @change="onSelectBoard"
          data-testid="board-selector"
          aria-label="选择看板"
        >
          <option
            v-for="item in board.boards.value"
            :key="item.id"
            :value="item.id"
            >{{ item.title }}</option
          >
        </select>
        <button
          class="header-button"
          @click="onRenameBoard"
          data-testid="rename-board"
          aria-label="改板标题"
        >
          {{ board.currentBoard.value.title }}
        </button>
        <span
          v-if="board.restoring.value"
          class="restoring-badge"
          data-testid="restoring-badge"
          aria-live="polite"
          >恢复中</span
        >
        <div class="header-actions">
          <button
            @click="createBoard"
            data-testid="create-board"
            :disabled="board.restoring.value"
            >新建板</button
          >
          <button
            @click="confirmBoardDelete"
            data-testid="delete-board"
            :disabled="board.restoring.value"
            >删除看板</button
          >
          <button
            @click="createColumn"
            data-testid="create-column"
            :disabled="board.restoring.value"
            >新建列</button
          >
          <button
            @click="createLabel"
            data-testid="create-label"
            :disabled="board.restoring.value"
            >新建标签</button
          >
          <button
            @click="() => void guard(() => board.actions.undo())"
            data-testid="undo"
            :disabled="board.restoring.value || board.undoCount.value === 0"
            aria-label="撤销"
            >撤销</button
          >
          <button
            @click="() => void guard(() => board.actions.redo())"
            data-testid="redo"
            :disabled="board.restoring.value || board.redoCount.value === 0"
            aria-label="重做"
            >重做</button
          >
          <button
            @click="exportBackup"
            data-testid="export-backup"
            :disabled="board.restoring.value"
            >导出备份</button
          >
        </div>
      </header>

      <p
        v-if="board.restoring.value"
        class="restoring-note"
        data-testid="restoring-note"
        >恢复进行中：浏览可用，写入口已暂停。</p
      >

      <div
        v-if="board.labels.value.length > 0"
        class="label-strip"
        data-testid="label-strip"
      >
        <span
          v-for="label in board.labels.value"
          :key="label.id"
          class="label-chip"
          :style="{ background: label.color, color: labelTextColor(label.color) }"
          data-testid="label-chip"
        >
          <button
            class="label-name"
            @click="renameLabel(label.id)"
            aria-label="改名"
            >{{ label.name }}</button
          >
          <button
            class="label-delete"
            @click="deleteLabel(label.id)"
            :aria-label="`删除标签 ${label.name}`"
            >×</button
          >
        </span>
      </div>

      <p
        v-if="notice"
        class="board-notice"
        role="alert"
        data-testid="board-notice"
        >{{ notice }}
        <button
          @click="notice = null"
          data-testid="board-notice-close"
          aria-label="关闭提示"
          >×</button
        ></p
      >

      <!-- 板内搜索（US-539 阶段 B） -->
      <div
        v-if="board.searchSource"
        class="board-search"
        data-testid="board-search"
      >
        <input
          class="search-input"
          :value="searchQuery"
          @input="onSearchInput"
          placeholder="搜索当前板任务"
          aria-label="搜索当前板任务"
          data-testid="board-search-input"
        />
        <div
          v-if="searchQuery.trim() !== ''"
          class="search-results"
          data-testid="board-search-results"
        >
          <p
            v-if="searchState === 'loading'"
            class="search-state"
            data-testid="board-search-loading"
            >搜索中…</p
          >
          <p
            v-else-if="searchState === 'error'"
            class="search-state"
            data-testid="board-search-error"
            >{{ searchErrorText }}</p
          >
          <p
            v-else-if="searchState === 'empty'"
            class="search-state"
            data-testid="board-search-empty"
            >无匹配</p
          >
          <template v-else>
            <button
              v-for="result in searchResults"
              :key="result.id"
              class="search-result"
              @click="onSearchResultClick(result)"
              data-testid="board-search-result"
            >
              <span class="search-result-title">{{ searchResultTitle(result) }}</span>
              <span class="search-result-column">{{ searchResultColumn(result) }}</span>
              <span class="search-result-snippet">{{ result.snippet }}</span>
            </button>
            <button
              v-if="searchHasMore"
              class="search-more"
              @click="searchHandle?.loadMore()"
              data-testid="board-search-more"
              >加载更多</button
            >
          </template>
        </div>
      </div>

      <div
        class="columns"
        data-testid="columns"
      >
        <section
          v-for="column in board.columns.value"
          :key="column.id"
          :class="{ column: true, 'drop-end': dropTarget?.kind === 'task-end' && dropTarget.columnId === column.id }"
          :data-column-id="column.id"
          @dragover="onTaskDragOver"
          @drop="event => void onTaskDrop(event, column.id)"
          data-testid="column"
        >
          <header
            :class="{
              'column-header': true,
              'drop-before':
                dropTarget?.kind === 'column' && dropTarget.columnId === column.id && dropTarget.mode === 'before',
              'drop-after':
                dropTarget?.kind === 'column' && dropTarget.columnId === column.id && dropTarget.mode === 'after',
              dragging: dragging?.kind === 'column' && dragging.id === column.id
            }"
            :data-column-header-id="column.id"
            draggable="true"
            @dragover="onColumnDragOver"
            @dragstart="event => onColumnDragStart(event, column.id)"
            data-testid="column-header"
          >
            <h2
              class="column-title"
              data-testid="column-title"
              >{{ column.title }}</h2
            >
            <span
              class="column-count"
              data-testid="column-count"
              >{{ (taskMap.get(column.id) ?? []).length }}</span
            >
            <div class="column-menu">
              <button
                @click="onRenameColumn(column.id)"
                data-testid="column-rename"
                aria-label="改列名"
              >
                改名
              </button>
              <button
                @click="moveColumnBy(column.id, -1)"
                data-testid="column-move-back"
                aria-label="前移"
                >前移</button
              >
              <button
                @click="moveColumnBy(column.id, 1)"
                data-testid="column-move-forward"
                aria-label="后移"
                >后移</button
              >
              <button
                @click="sortColumnBy(column.id, 'dueDate')"
                data-testid="column-sort-due"
                aria-label="按截止日排序"
                >按截止日</button
              >
              <button
                @click="sortColumnBy(column.id, 'title')"
                data-testid="column-sort-title"
                aria-label="按标题排序"
                >按标题</button
              >
              <button
                @click="confirmColumnDelete(column.id)"
                data-testid="column-delete"
                aria-label="删除列"
                >删除</button
              >
            </div>
          </header>
          <div class="cards">
            <article
              v-for="task in taskMap.get(column.id) ?? []"
              :key="task.id"
              :class="{
                card: true,
                'search-hit': searchHighlightId === task.id,
                'drop-before':
                  dropTarget?.kind === 'task' && dropTarget.taskId === task.id && dropTarget.mode === 'before',
                'drop-after':
                  dropTarget?.kind === 'task' && dropTarget.taskId === task.id && dropTarget.mode === 'after',
                dragging: dragging?.kind === 'task' && dragging.id === task.id
              }"
              :data-task-id="task.id"
              draggable="true"
              @dragstart="event => onTaskDragStart(event, task.id)"
              data-testid="task-card"
            >
              <template v-if="editTitleTaskId === task.id">
                <input
                  v-model="editTitleValue"
                  class="title-editor"
                  @keydown.enter="commitEditTitle(task.id)"
                  @keydown.escape="editTitleTaskId = null"
                  data-testid="task-title-editor"
                  aria-label="任务标题"
                />
                <button
                  @click="commitEditTitle(task.id)"
                  data-testid="task-title-save"
                  aria-label="保存标题"
                  >保存</button
                >
                <button
                  @click="editTitleTaskId = null"
                  data-testid="task-title-cancel"
                  aria-label="取消"
                  >取消</button
                >
              </template>

              <template v-else>
                <button
                  class="card-title"
                  @click="openDetail(task.id)"
                  data-testid="task-title"
                  >{{ task.title }}</button
                >
                <button
                  class="card-edit"
                  @click="startEditTitle(task.id, task.title)"
                  data-testid="task-edit-title"
                  aria-label="编辑标题"
                  >编辑</button
                >
              </template>

              <div
                v-if="labelsOf(task.id).length > 0"
                class="card-labels"
              >
                <span
                  v-for="label in labelsOf(task.id)"
                  :key="label.id"
                  class="card-label"
                  :style="{ background: label.color, color: labelTextColor(label.color) }"
                  data-testid="card-label"
                  :aria-label="label.name"
                  >{{ label.name }}</span
                >
              </div>
              <span
                v-if="dueDateText(task.dueDate)"
                class="card-due"
                :class="{ overdue: dueDateText(task.dueDate).startsWith('已逾期') }"
                data-testid="task-due"
                >{{ dueDateText(task.dueDate) }}</span
              >
            </article>
            <button
              class="add-task"
              @click="createTask(column.id)"
              :disabled="board.restoring.value"
              data-testid="add-task"
              >添加任务</button
            >
          </div>
        </section>
      </div>

      <aside
        v-if="detailTaskId"
        class="detail-panel"
        data-testid="detail-panel"
      >
        <h3>任务详情</h3>
        <label>
          标题
          <input
            v-model="draft.title"
            data-testid="detail-title"
          />
        </label>
        <label>
          描述
          <textarea
            v-model="draft.description"
            data-testid="detail-description"
          ></textarea>
        </label>
        <label>
          截止日（YYYY-MM-DD）
          <input
            v-model="draft.dueDate"
            placeholder="YYYY-MM-DD"
            data-testid="detail-due"
          />
        </label>
        <fieldset>
          <legend>标签</legend>
          <label
            v-for="label in board.labels.value"
            :key="label.id"
            class="detail-label"
          >
            <input
              type="checkbox"
              :checked="draft.labelIds.includes(label.id)"
              @change="toggleDraftLabel(label.id)"
              data-testid="detail-label-check"
            />
            <span :style="{ background: label.color, color: labelTextColor(label.color) }">{{ label.name }}</span>
          </label>
        </fieldset>
        <div class="detail-actions">
          <button
            @click="saveDetail"
            data-testid="detail-save"
            >保存</button
          >
          <button
            @click="confirmTaskDelete(detailTaskId!)"
            data-testid="detail-delete"
            >删除任务</button
          >
          <button
            @click="detailTaskId = null"
            data-testid="detail-cancel"
            >取消</button
          >
        </div>
      </aside>

      <aside
        v-if="confirm"
        class="confirm-panel"
        data-testid="confirm-delete"
      >
        <p v-if="confirm.kind === 'task'">删除任务「{{ confirm.title }}」？</p>
        <p v-else-if="confirm.kind === 'column'">删除列「{{ confirm.title }}」及其 {{ confirm.count }} 个任务？</p>
        <p v-else
          >删除看板「{{ confirm.title }}」（{{ confirm.columns }} 列、{{
            confirm.count
          }}
          任务、含全部标签定义与关联）？</p
        >
        <div class="confirm-actions">
          <button
            @click="executeConfirmedDelete"
            data-testid="confirm-delete-yes"
            >确认删除</button
          >
          <button
            @click="confirm = null"
            data-testid="confirm-delete-no"
            >取消</button
          >
        </div>
      </aside>
    </template>

    <template v-else>
      <!-- 空态也保留选择器：删除当前板后仍能切到其余板（与 Angular / React 对称） -->
      <header
        class="board-header"
        data-testid="board-header"
      >
        <select
          class="board-selector"
          :value="board.currentBoardId.value ?? ''"
          @change="onSelectBoard"
          data-testid="board-selector"
          aria-label="选择看板"
        >
          <option
            v-for="item in board.boards.value"
            :key="item.id"
            :value="item.id"
            >{{ item.title }}</option
          >
        </select>
      </header>
      <div
        class="empty-board"
        data-testid="empty-board"
      >
        <p>没有看板</p>
        <button
          @click="createBoard"
          data-testid="create-board-empty"
          :disabled="board.restoring.value"
          >新建板</button
        >
      </div>
    </template>
  </section>
</template>

<style scoped>
/* 看板布局（US-539 交互约定：列横向排列、任务卡片纵向堆叠、列横向滚动；详情/确认面板固定右侧） */
.board-view {
  display: block;
  padding-bottom: 4rem;
}
.board-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  flex-wrap: wrap;
}
.board-selector {
  padding: 0.25rem;
}
.header-button {
  background: none;
  border: none;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
}
.header-actions {
  display: flex;
  gap: 0.375rem;
  flex-wrap: wrap;
}
.restoring-badge {
  background: #f59e0b;
  color: #fff;
  padding: 0 0.375rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
}
.restoring-note {
  padding: 0.25rem 1rem;
  color: #92400e;
}
.label-strip {
  display: flex;
  gap: 0.375rem;
  padding: 0.25rem 1rem;
  flex-wrap: wrap;
}
.label-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  border-radius: 0.25rem;
  padding: 0 0.375rem;
  color: #fff;
  font-size: 0.75rem;
}
.label-name,
.label-delete {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: inherit;
  padding: 0;
}
.board-notice {
  padding: 0.25rem 1rem;
  color: #b91c1c;
}
.columns {
  display: flex;
  gap: 0.75rem;
  overflow-x: auto;
  padding: 0.5rem 1rem;
  align-items: flex-start;
}
.column {
  flex: 0 0 17rem;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
}
.column-header {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.5rem;
}
.column-title {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
  flex: 1;
}
.column-count {
  font-size: 0.75rem;
  color: #64748b;
}
.column-menu {
  display: flex;
  gap: 0.125rem;
  flex-wrap: wrap;
}
.column-menu button {
  font-size: 0.75rem;
  padding: 0.125rem 0.25rem;
}
.cards {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding: 0.375rem;
}
.card {
  background: #fff;
  border-radius: 0.375rem;
  padding: 0.5rem;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.08);
}
.card-title {
  display: block;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.875rem;
  text-align: left;
  padding: 0;
  width: 100%;
}
.card-edit {
  font-size: 0.75rem;
}
.card-labels {
  display: flex;
  gap: 0.25rem;
  margin-top: 0.25rem;
  flex-wrap: wrap;
}
.card-label {
  padding: 0 0.375rem;
  border-radius: 0.25rem;
  color: #fff;
  font-size: 0.75rem;
}
.card-due {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.75rem;
  color: #64748b;
}
.card-due.overdue {
  color: #dc2626;
}
.add-task {
  width: 100%;
  margin-top: 0.25rem;
}
.title-editor {
  width: 100%;
  box-sizing: border-box;
}
.empty-board {
  padding: 2rem;
}
.detail-panel,
.confirm-panel {
  position: fixed;
  right: 1rem;
  top: 4rem;
  width: 20rem;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  padding: 1rem;
  box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
  z-index: 10;
  max-height: calc(100vh - 6rem);
  overflow-y: auto;
}
.detail-panel label {
  display: block;
  margin-bottom: 0.5rem;
}
.detail-panel input,
.detail-panel textarea {
  width: 100%;
  box-sizing: border-box;
}
.detail-actions,
.confirm-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
}
.board-connecting {
  padding: 2rem;
  color: #666;
}
</style>
