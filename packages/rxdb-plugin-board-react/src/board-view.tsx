'use client';

import type { UUID } from '@aiao/rxdb';
import {
  Column,
  labelTextColor,
  resolveCardDrop,
  resolveColumnDrop,
  Task,
  type BoardLabel,
  type BoardSearchUpstream,
  type CardDropTarget,
  type SearchHandle,
  type SearchResult,
  type TaskDraftSnapshot
} from '@aiao/rxdb-plugin-board';
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Subscription } from 'rxjs';
import './board-view.css';

import { useBoard } from './use-board.js';

/**
 * 看板视图组件（US-539 阶段 A）：列 + 卡片 + 拖拽 + 本列排序 + 详情面板 +
 * 标签管理 + 撤销重做 + 备份入口占位 + 删除确认。
 *
 * 三端只采集指针事件，落点换算调用核心包同一份 `resolveCardDrop` /
 * `resolveColumnDrop`；全部写入口经 {@link useBoard} 的领域动作。
 * 与 Angular / Vue 同功能同领域 API（交互约定见 US-539）。
 */
export interface BoardViewProps {
  /** 已连接的看板 RxDB 实例（实体含 board 命名空间五实体，需历史插件）。 */
  readonly rxdb: Parameters<typeof useBoard>[0];
  /** 备份导出回调（US-537 编排由宿主接线；缺省展示占位提示）。 */
  readonly onExportBackup?: () => void | Promise<void>;
}

export function BoardView({ rxdb, onExportBackup }: BoardViewProps): ReactNode {
  const searchUpstream = rxdb.getPlugins('search')[0];
  const board = useBoard(
    rxdb,
    searchUpstream ? { search: { upstream: searchUpstream as unknown as BoardSearchUpstream } } : undefined
  );
  const [editTitleTaskId, setEditTitleTaskId] = useState<UUID | null>(null);
  const [editTitleValue, setEditTitleValue] = useState<string>('');
  const [detailTaskId, setDetailTaskId] = useState<UUID | null>(null);
  const [draft, setDraft] = useState({ title: '', description: '', dueDate: '', labelIds: [] as readonly UUID[] });
  const [snapshot, setSnapshot] = useState<TaskDraftSnapshot | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  // ---------- 板内搜索（US-539 阶段 B） ----------
  const [searchQuery, setSearchQuery] = useState('');
  const [searchState, setSearchState] = useState<'idle' | 'loading' | 'success' | 'empty' | 'error'>('idle');
  const [searchResults, setSearchResults] = useState<readonly SearchResult[]>([]);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [searchErrorText, setSearchErrorText] = useState<string | null>(null);
  const [searchHighlightId, setSearchHighlightId] = useState<UUID | null>(null);
  const searchHandleRef = useRef<SearchHandle | null>(null);
  const searchSubsRef = useRef<Subscription | null>(null);
  const highlightTimerRef = useRef<number | null>(null);

  const destroySearch = (): void => {
    searchHandleRef.current?.destroy();
    searchHandleRef.current = null;
    setSearchState('idle');
    setSearchResults([]);
    setSearchHasMore(false);
    setSearchErrorText(null);
  };

  const onSearchInput = (value: string): void => {
    setSearchQuery(value);
    const query = value.trim();
    if (query === '') {
      destroySearch();
      return;
    }
    const source = board.searchSource;
    if (!source) return;
    if (searchHandleRef.current === null) {
      const handle = source.search(query);
      searchHandleRef.current = handle;
      // 上一组句柄订阅先退订（destroy 不保证上游 observable 不再发射）
      searchSubsRef.current?.unsubscribe();
      const subs = new Subscription();
      subs.add(handle.state$.subscribe(state => setSearchState(state)));
      subs.add(handle.results$.subscribe(results => setSearchResults(results)));
      subs.add(handle.hasMore$.subscribe(more => setSearchHasMore(more)));
      subs.add(handle.error$.subscribe(error => setSearchErrorText(String(error))));
      searchSubsRef.current = subs;
    } else {
      searchHandleRef.current.setQuery(query);
    }
  };

  /** 点结果：滚动到目标卡片并短暂高亮（更新中不可点）。 */
  const onSearchResultClick = (result: SearchResult): void => {
    if (searchState === 'loading') return;
    document.querySelector<HTMLElement>(`[data-task-id="${result.id}"]`)?.scrollIntoView({ block: 'center' });
    const targetId = result.id as UUID;
    setSearchHighlightId(targetId);
    if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = window.setTimeout(() => {
      setSearchHighlightId(current => (current === targetId ? null : current));
    }, 2000);
  };

  useEffect(
    () => () => {
      if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
      searchSubsRef.current?.unsubscribe();
      searchHandleRef.current?.destroy();
    },
    []
  );
  const [notice, setNotice] = useState<string | null>(null);

  const taskMap = useMemo(() => {
    const grouped = new Map<UUID, Task[]>();
    for (const column of board.columns) grouped.set(column.id, []);
    for (const task of board.tasks) {
      const list = grouped.get(task.columnId) ?? [];
      list.push(task);
      grouped.set(task.columnId, list);
    }
    return grouped;
  }, [board.columns, board.tasks]);

  const guard = async <T,>(operation: () => Promise<T>): Promise<T | undefined> => {
    try {
      setNotice(null);
      return await operation();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
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
  const createLabel = async (): Promise<void> => {
    const name = promptTitle('新建标签：名称');
    if (name === null) return;
    const color = promptTitle('标签颜色（#rrggbb）', '#e11d48');
    if (color === null) return;
    await guard(() => board.actions.createLabel({ name, color }));
  };

  const createTask = async (columnId: UUID): Promise<void> => {
    const title = promptTitle('新建任务：标题');
    if (title === null) return;
    await guard(() => board.actions.createTask({ columnId, title }));
  };

  const startEditTitle = (task: Task): void => {
    setEditTitleValue(task.title);
    setEditTitleTaskId(task.id);
  };
  const commitEditTitle = async (task: Task): Promise<void> => {
    setEditTitleTaskId(null);
    await guard(() => board.actions.updateTaskTitle(task.id, editTitleValue));
  };

  const onTaskDragStart = (event: DragEvent, task: Task): void => {
    event.dataTransfer.setData('application/x-board-task', task.id);
  };
  const onColumnDragStart = (event: DragEvent, column: Column): void => {
    event.dataTransfer.setData('application/x-board-column', column.id);
  };

  const resolveTaskTarget = (movedId: UUID, clientX: number, clientY: number): CardDropTarget | null => {
    const views = board.columns.map(column => {
      const columnEl = document.querySelector<HTMLElement>(`[data-column-id="${column.id}"]`);
      const rect = columnEl?.getBoundingClientRect();
      const cards = (taskMap.get(column.id) ?? []).map(task => {
        const cardEl = document.querySelector<HTMLElement>(`[data-task-id="${task.id}"]`);
        const cardRect = cardEl?.getBoundingClientRect();
        return { id: task.id, top: cardRect?.top ?? 0, bottom: cardRect?.bottom ?? 0 };
      });
      return {
        columnId: column.id,
        rect: { left: rect?.left ?? 0, right: rect?.right ?? 0, top: rect?.top ?? 0, bottom: rect?.bottom ?? 0 },
        cards,
        taskIds: (taskMap.get(column.id) ?? []).map(task => task.id)
      };
    });
    return resolveCardDrop(views, movedId, clientX, clientY);
  };

  const resolveColumnTarget = (
    movedId: UUID,
    clientX: number
  ): { readonly prevId: UUID | null; readonly nextId: UUID | null } | null => {
    const views = board.columns.map(column => {
      const headerEl = document.querySelector<HTMLElement>(`[data-column-header-id="${column.id}"]`);
      const rect = headerEl?.getBoundingClientRect();
      return { columnId: column.id, rect: { left: rect?.left ?? 0, right: rect?.right ?? 0 } };
    });
    const target = resolveColumnDrop(
      views,
      board.columns.map(column => column.id),
      movedId,
      clientX
    );
    return target ? { prevId: target.prevId as UUID, nextId: target.nextId as UUID } : null;
  };

  const onTaskDrop = async (event: DragEvent, column: Column): Promise<void> => {
    event.preventDefault();
    const movedId = event.dataTransfer.getData('application/x-board-task') as UUID;
    if (!movedId) return;
    const target = resolveTaskTarget(movedId, event.clientX, event.clientY);
    if (!target) return;
    await guard(() => board.actions.moveTask(movedId, target));
  };

  const onColumnDrop = async (event: DragEvent): Promise<void> => {
    event.preventDefault();
    const movedId = event.dataTransfer.getData('application/x-board-column') as UUID;
    if (!movedId) return;
    const target = resolveColumnTarget(movedId, event.clientX);
    if (!target) return;
    await guard(() => board.actions.moveColumn(movedId, target));
  };

  const sortColumnBy = async (columnId: UUID, mode: 'dueDate' | 'title'): Promise<void> => {
    const result = await guard(() => board.actions.sortColumn(columnId, mode));
    if (result && !result.written) setNotice('已按目标顺序排列，无变化');
  };

  const openDetail = async (taskId: UUID): Promise<void> => {
    const snap = await board.actions.openSnapshot(taskId);
    setSnapshot(snap);
    setDraft({
      title: snap.title,
      description: snap.description ?? '',
      dueDate: snap.dueDate ?? '',
      labelIds: [...snap.labelIds]
    });
    setDetailTaskId(taskId);
  };
  const saveDetail = async (): Promise<void> => {
    if (!detailTaskId || !snapshot) return;
    const result = await guard(() =>
      board.actions.saveTaskDraft(detailTaskId, snapshot, {
        title: draft.title,
        description: draft.description,
        dueDate: draft.dueDate === '' ? null : draft.dueDate,
        labelIds: draft.labelIds
      })
    );
    // 保存失败（空标题 / 非法日期 / 快照复核拒绝等）保留草稿，不关面板
    if (result === undefined) return;
    setDetailTaskId(null);
    setSnapshot(null);
  };

  const moveColumnBy = async (columnId: UUID, direction: -1 | 1): Promise<void> => {
    const ids = board.columns.map(column => column.id);
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

  const detailTask = detailTaskId ? board.tasks.find(task => task.id === detailTaskId) : undefined;

  const confirmTaskDelete = async (task: Task): Promise<void> => {
    const plan = await board.actions.planTaskDelete(task.id);
    setConfirm({ kind: 'task', taskId: task.id, title: plan.taskTitle });
  };
  const confirmColumnDelete = async (column: Column): Promise<void> => {
    const plan = await board.actions.planColumnDelete(column.id);
    setConfirm({ kind: 'column', columnId: column.id, title: plan.columnTitle, count: plan.taskIds.length });
  };
  const confirmBoardDelete = async (): Promise<void> => {
    if (!current) return;
    const plan = await board.actions.planBoardDelete(current.id);
    setConfirm({
      kind: 'board',
      boardId: current.id,
      title: plan.boardTitle,
      count: plan.taskIds.length,
      columns: plan.columnIds.length
    });
  };
  const executeConfirmedDelete = async (): Promise<void> => {
    if (!confirm) return;
    setConfirm(null);
    if (confirm.kind === 'task') {
      const plan = await board.actions.planTaskDelete(confirm.taskId);
      await guard(() => board.actions.executeDelete(plan));
    } else if (confirm.kind === 'column') {
      const plan = await board.actions.planColumnDelete(confirm.columnId);
      await guard(() => board.actions.executeDelete(plan));
    } else {
      const plan = await board.actions.planBoardDelete(confirm.boardId);
      await guard(() => board.actions.executeDelete(plan));
    }
  };

  const dueDateText = (task: Task): string => {
    const due = task.dueDate;
    if (!due) return '';
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return (
      due < today ? `已逾期 ${due}`
      : due === today ? '今天到期'
      : due
    );
  };

  const labelsOf = (taskId: UUID): readonly BoardLabel[] => board.taskLabels.get(taskId) ?? [];

  const onSelectBoard = (boardId: UUID): void => {
    board.selectBoard(boardId);
    // 切板丢弃旧板结果：销毁重建句柄重发（setQuery 同词会被 distinctUntilChanged 吞掉）
    const query = searchQuery.trim();
    if (query !== '') {
      destroySearch();
      onSearchInput(query);
    }
  };

  const boardSelector = (
    <select
      className='board-selector'
      value={board.currentBoardId ?? ''}
      onChange={event => onSelectBoard(event.target.value as UUID)}
      data-testid='board-selector'
      aria-label='选择看板'
    >
      {board.boards.map(item => (
        <option key={item.id} value={item.id}>
          {item.title}
        </option>
      ))}
    </select>
  );

  const current = board.currentBoard;
  if (!current) {
    // 空态也保留选择器：删除当前板后仍能切到其余板（与 Angular / Vue 对称）
    return (
      <section className='board-view' data-testid='board-view'>
        <header className='board-header' data-testid='board-header'>
          {boardSelector}
        </header>
        <div className='empty-board' data-testid='empty-board'>
          <p>没有看板</p>
          <button onClick={() => void createBoard()} data-testid='create-board-empty' disabled={board.restoring}>
            新建板
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      className='board-view'
      data-testid='board-view'
      onDragOver={event => event.preventDefault()}
      onDrop={event => void onColumnDrop(event)}
    >
      <header className='board-header' data-testid='board-header'>
        {boardSelector}
        <button
          className='header-button'
          onClick={() => {
            const title = promptTitle('改板标题', current.title);
            if (title !== null) void guard(() => board.actions.updateBoard(current.id, { title }));
          }}
          data-testid='rename-board'
          aria-label='改板标题'
        >
          {current.title}
        </button>
        {board.restoring ?
          <span className='restoring-badge' data-testid='restoring-badge' aria-live='polite'>
            恢复中
          </span>
        : null}
        <div className='header-actions'>
          <button onClick={() => void createBoard()} data-testid='create-board' disabled={board.restoring}>
            新建板
          </button>
          <button onClick={() => void confirmBoardDelete()} data-testid='delete-board' disabled={board.restoring}>
            删除看板
          </button>
          <button onClick={() => void createColumn()} data-testid='create-column' disabled={board.restoring}>
            新建列
          </button>
          <button onClick={() => void createLabel()} data-testid='create-label' disabled={board.restoring}>
            新建标签
          </button>
          <button
            onClick={() => void guard(() => board.actions.undo())}
            data-testid='undo'
            disabled={board.restoring || board.undoCount === 0}
            aria-label='撤销'
          >
            撤销
          </button>
          <button
            onClick={() => void guard(() => board.actions.redo())}
            data-testid='redo'
            disabled={board.restoring || board.redoCount === 0}
            aria-label='重做'
          >
            重做
          </button>
          <button
            onClick={() => {
              if (onExportBackup) void onExportBackup();
              else setNotice('备份导出由宿主接线（US-537）');
            }}
            data-testid='export-backup'
            disabled={board.restoring}
          >
            导出备份
          </button>
        </div>
      </header>

      {board.restoring ?
        <p className='restoring-note' data-testid='restoring-note'>
          恢复进行中：浏览可用，写入口已暂停。
        </p>
      : null}

      {board.labels.length > 0 ?
        <div className='label-strip' data-testid='label-strip'>
          {board.labels.map(label => (
            <span
              key={label.id}
              className='label-chip'
              style={{ background: label.color, color: labelTextColor(label.color) }}
              data-testid='label-chip'
            >
              <button
                className='label-name'
                onClick={() => {
                  const name = promptTitle('改标签名', label.name);
                  if (name !== null) void guard(() => board.actions.renameLabel(label.id, name));
                }}
                aria-label='改名'
              >
                {label.name}
              </button>
              <button
                className='label-delete'
                onClick={() => {
                  void (async () => {
                    const plan = await board.actions.planLabelDelete(label.id);
                    if (
                      window.confirm(`删除标签「${plan.labelName}」？将移除 ${plan.taskLabelIds.length} 条任务关联。`)
                    ) {
                      await guard(() => board.actions.executeLabelDelete(plan));
                    }
                  })();
                }}
                aria-label={`删除标签 ${label.name}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      : null}

      {notice ?
        <p className='board-notice' role='alert' data-testid='board-notice'>
          {notice}
        </p>
      : null}

      {/* 板内搜索（US-539 阶段 B） */}
      {board.searchSource ?
        <div className='board-search' data-testid='board-search'>
          <input
            className='search-input'
            value={searchQuery}
            onChange={event => onSearchInput(event.target.value)}
            placeholder='搜索当前板任务'
            aria-label='搜索当前板任务'
            data-testid='board-search-input'
          />
          {searchQuery.trim() !== '' ?
            <div className='search-results' data-testid='board-search-results'>
              {searchState === 'loading' ?
                <p className='search-state' data-testid='board-search-loading'>
                  搜索中…
                </p>
              : searchState === 'error' ?
                <p className='search-state' data-testid='board-search-error'>
                  {searchErrorText}
                </p>
              : searchState === 'empty' ?
                <p className='search-state' data-testid='board-search-empty'>
                  无匹配
                </p>
              : <>
                  {searchResults.map(result => (
                    <button
                      key={result.id}
                      className='search-result'
                      onClick={() => onSearchResultClick(result)}
                      data-testid='board-search-result'
                    >
                      <span className='search-result-title'>
                        {board.tasks.find(task => task.id === (result.id as UUID))?.title ?? ''}
                      </span>
                      <span className='search-result-column'>
                        {board.columns.find(column => {
                          const task = board.tasks.find(candidate => candidate.id === (result.id as UUID));
                          return task ? column.id === task.columnId : false;
                        })?.title ?? ''}
                      </span>
                      <span className='search-result-snippet'>{result.snippet}</span>
                    </button>
                  ))}
                  {searchHasMore ?
                    <button
                      className='search-more'
                      onClick={() => void searchHandleRef.current?.loadMore()}
                      data-testid='board-search-more'
                    >
                      加载更多
                    </button>
                  : null}
                </>
              }
            </div>
          : null}
        </div>
      : null}

      <div className='columns' data-testid='columns'>
        {board.columns.map(column => (
          <section
            key={column.id}
            className='column'
            data-column-id={column.id}
            onDragOver={event => event.preventDefault()}
            onDrop={event => void onTaskDrop(event, column)}
            data-testid='column'
          >
            <header
              className='column-header'
              data-column-header-id={column.id}
              draggable
              onDragStart={event => onColumnDragStart(event, column)}
              data-testid='column-header'
            >
              <h2 className='column-title' data-testid='column-title'>
                {column.title}
              </h2>
              <span className='column-count' data-testid='column-count'>
                {(taskMap.get(column.id) ?? []).length}
              </span>
              <div className='column-menu'>
                <button
                  onClick={() => {
                    const title = promptTitle('改列标题', column.title);
                    if (title !== null) void guard(() => board.actions.updateColumn(column.id, { title }));
                  }}
                  data-testid='column-rename'
                  aria-label='改列名'
                >
                  改名
                </button>
                <button
                  onClick={() => void moveColumnBy(column.id, -1)}
                  data-testid='column-move-back'
                  aria-label='前移'
                >
                  前移
                </button>
                <button
                  onClick={() => void moveColumnBy(column.id, 1)}
                  data-testid='column-move-forward'
                  aria-label='后移'
                >
                  后移
                </button>
                <button
                  onClick={() => void sortColumnBy(column.id, 'dueDate')}
                  data-testid='column-sort-due'
                  aria-label='按截止日排序'
                >
                  按截止日
                </button>
                <button
                  onClick={() => void sortColumnBy(column.id, 'title')}
                  data-testid='column-sort-title'
                  aria-label='按标题排序'
                >
                  按标题
                </button>
                <button
                  onClick={() => void confirmColumnDelete(column)}
                  data-testid='column-delete'
                  aria-label='删除列'
                >
                  删除
                </button>
              </div>
            </header>
            <div className='cards'>
              {(taskMap.get(column.id) ?? []).map(task => (
                <article
                  key={task.id}
                  className={searchHighlightId === task.id ? 'card search-hit' : 'card'}
                  data-task-id={task.id}
                  draggable
                  onDragStart={event => onTaskDragStart(event, task)}
                  data-testid='task-card'
                >
                  {editTitleTaskId === task.id ?
                    <>
                      <input
                        className='title-editor'
                        value={editTitleValue}
                        onChange={event => setEditTitleValue(event.target.value)}
                        onKeyDown={event => {
                          if (event.key === 'Enter') void commitEditTitle(task);
                          if (event.key === 'Escape') setEditTitleTaskId(null);
                        }}
                        data-testid='task-title-editor'
                        aria-label='任务标题'
                      />
                      <button
                        onClick={() => void commitEditTitle(task)}
                        data-testid='task-title-save'
                        aria-label='保存标题'
                      >
                        保存
                      </button>
                      <button
                        onClick={() => setEditTitleTaskId(null)}
                        data-testid='task-title-cancel'
                        aria-label='取消'
                      >
                        取消
                      </button>
                    </>
                  : <>
                      <button className='card-title' onClick={() => void openDetail(task.id)} data-testid='task-title'>
                        {task.title}
                      </button>
                      <button
                        className='card-edit'
                        onClick={() => startEditTitle(task)}
                        data-testid='task-edit-title'
                        aria-label='编辑标题'
                      >
                        编辑
                      </button>
                    </>
                  }
                  {labelsOf(task.id).length > 0 ?
                    <div className='card-labels'>
                      {labelsOf(task.id).map(label => (
                        <span
                          key={label.id}
                          className='card-label'
                          style={{ background: label.color, color: labelTextColor(label.color) }}
                          data-testid='card-label'
                          aria-label={label.name}
                        >
                          {label.name}
                        </span>
                      ))}
                    </div>
                  : null}
                  {dueDateText(task) ?
                    <span
                      className={`card-due${dueDateText(task).startsWith('已逾期') ? 'overdue' : ''}`}
                      data-testid='task-due'
                    >
                      {dueDateText(task)}
                    </span>
                  : null}
                </article>
              ))}
              <button
                className='add-task'
                onClick={() => void createTask(column.id)}
                disabled={board.restoring}
                data-testid='add-task'
              >
                添加任务
              </button>
            </div>
          </section>
        ))}
      </div>

      {detailTaskId ?
        <aside className='detail-panel' data-testid='detail-panel'>
          <h3>任务详情</h3>
          <label>
            标题
            <input
              value={draft.title}
              onChange={event => setDraft({ ...draft, title: event.target.value })}
              data-testid='detail-title'
            />
          </label>
          <label>
            描述
            <textarea
              value={draft.description}
              onChange={event => setDraft({ ...draft, description: event.target.value })}
              data-testid='detail-description'
            />
          </label>
          <label>
            截止日（YYYY-MM-DD）
            <input
              value={draft.dueDate}
              onChange={event => setDraft({ ...draft, dueDate: event.target.value })}
              placeholder='YYYY-MM-DD'
              data-testid='detail-due'
            />
          </label>
          <fieldset>
            <legend>标签</legend>
            {board.labels.map(label => (
              <label key={label.id} className='detail-label'>
                <input
                  type='checkbox'
                  checked={draft.labelIds.includes(label.id)}
                  onChange={() =>
                    setDraft({
                      ...draft,
                      labelIds:
                        draft.labelIds.includes(label.id) ?
                          draft.labelIds.filter(id => id !== label.id)
                        : [...draft.labelIds, label.id]
                    })
                  }
                  data-testid='detail-label-check'
                />
                <span style={{ background: label.color, color: labelTextColor(label.color) }}>{label.name}</span>
              </label>
            ))}
          </fieldset>
          <div className='detail-actions'>
            <button onClick={() => void saveDetail()} data-testid='detail-save'>
              保存
            </button>
            <button
              onClick={() => {
                if (detailTask) void confirmTaskDelete(detailTask);
              }}
              data-testid='detail-delete'
            >
              删除任务
            </button>
            <button onClick={() => setDetailTaskId(null)} data-testid='detail-cancel'>
              取消
            </button>
          </div>
        </aside>
      : null}

      {confirm ?
        <aside className='confirm-panel' data-testid='confirm-delete'>
          {confirm.kind === 'task' ?
            <p>删除任务「{confirm.title}」？</p>
          : confirm.kind === 'column' ?
            <p>
              删除列「{confirm.title}」及其 {confirm.count} 个任务？
            </p>
          : <p>
              删除看板「{confirm.title}」（{confirm.columns} 列、{confirm.count} 任务、含全部标签定义与关联）？
            </p>
          }
          <div className='confirm-actions'>
            <button onClick={() => void executeConfirmedDelete()} data-testid='confirm-delete-yes'>
              确认删除
            </button>
            <button onClick={() => setConfirm(null)} data-testid='confirm-delete-no'>
              取消
            </button>
          </div>
        </aside>
      : null}
    </section>
  );
}

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
