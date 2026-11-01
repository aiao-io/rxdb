import type { UUID } from '@aiao/rxdb';
import {
  dueStatus,
  dueStatusText,
  isBoardFilterEmpty,
  matchesBoardFilter,
  parseBoardFilter,
  resolveKeyboardMove,
  suggestBoardFilter,
  toggleBoardFilterValue,
  type BoardFilterSuggestion,
  type BoardKeyboardColumn,
  type BoardLabel,
  type BoardMoveDirection,
  type Column,
  type DueStatus,
  type Task
} from '@aiao/rxdb-plugin-board';
import { useMemo, useState, type KeyboardEvent } from 'react';

import type { ColumnTaskIds } from './types.js';
import { useStateRef } from './use-state-ref.js';
import type { ViewCore } from './use-view-core.js';

/** 看板派生数据与筛选条。 */
export interface BoardData {
  readonly filterQuery: string;
  readonly filterActive: boolean;
  readonly visibleCount: number;
  readonly suggestions: readonly BoardFilterSuggestion[];
  readonly suggestionsOpen: boolean;
  readonly activeSuggestion: number;
  readonly activeSuggestionId: string | undefined;
  /** 漫游 tabindex：上次聚焦的可见卡片，否则第一张可见卡片。 */
  readonly rovingTaskId: UUID | null;
  readonly labelsOf: (taskId: UUID) => readonly BoardLabel[];
  readonly tasksOf: (column: Column) => readonly Task[];
  readonly visibleTasksOf: (column: Column) => readonly Task[];
  readonly countLabel: (column: Column) => string;
  readonly overdueCount: (column: Column) => number;
  readonly dueStatusOf: (dueDate: string) => DueStatus | null;
  readonly dueText: (dueDate: string) => string;
  readonly isLabelFiltered: (name: string) => boolean;
  readonly columnById: (columnId: UUID | null) => Column | undefined;
  readonly taskById: (taskId: UUID | null) => Task | undefined;
  readonly columnTitleOf: (columnId: UUID | null) => string;
  readonly isFirstColumn: (column: Column) => boolean;
  readonly isLastColumn: (column: Column) => boolean;
  readonly canMoveTask: (task: Task, direction: BoardMoveDirection) => boolean;
  /** 网格导航：每列可见卡片。 */
  readonly gridColumns: () => ColumnTaskIds[];
  /** 菜单移动：每列完整任务序列。 */
  readonly menuColumns: () => ColumnTaskIds[];
  /** 键盘移动：完整序列 + 可见序列。 */
  readonly keyboardColumns: () => BoardKeyboardColumn[];
  readonly setFocusedTaskId: (taskId: UUID) => void;
  readonly setFilterFocused: (focused: boolean) => void;
  readonly onFilterInput: (value: string) => void;
  readonly onFilterKeydown: (event: KeyboardEvent<HTMLInputElement>) => void;
  readonly applySuggestion: (query: string) => void;
  readonly clearFilter: () => void;
  /** 点击卡片上的标签即筛选（再次点击取消）。 */
  readonly toggleLabelFilter: (name: string) => void;
}

const EMPTY_LABELS: readonly BoardLabel[] = [];
const EMPTY_TASKS: readonly Task[] = [];

/** 看板派生数据与筛选条（关键词 + `field:value` 令牌，补全默认高亮第一项）。 */
export const useBoardData = (core: ViewCore): BoardData => {
  const { board, boardRef, today } = core;
  const [filterQuery, setFilterQuery, filterQueryRef] = useStateRef('');
  const [filterFocused, setFilterFocused] = useState(false);
  const [activeSuggestion, setActiveSuggestion, activeSuggestionRef] = useStateRef(-1);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  const [focusedTaskId, setFocusedTaskId] = useState<UUID | null>(null);

  const taskMap = useMemo(() => {
    const grouped = new Map<UUID, Task[]>();
    for (const column of board.columns) grouped.set(column.id, []);
    for (const task of board.tasks) grouped.get(task.columnId)?.push(task);
    return grouped;
  }, [board.columns, board.tasks]);

  const filter = useMemo(() => parseBoardFilter(filterQuery), [filterQuery]);
  const filterActive = !isBoardFilterEmpty(filter);
  const labelsOf = (taskId: UUID): readonly BoardLabel[] => board.taskLabels.get(taskId) ?? EMPTY_LABELS;

  const visibleTaskMap = useMemo(() => {
    const visible = new Map<UUID, readonly Task[]>();
    for (const column of board.columns) {
      const tasks = taskMap.get(column.id) ?? EMPTY_TASKS;
      const matches = (task: Task): boolean =>
        matchesBoardFilter(
          {
            title: task.title,
            description: task.description ?? null,
            dueDate: task.dueDate ?? null,
            columnTitle: column.title,
            labelNames: (board.taskLabels.get(task.id) ?? EMPTY_LABELS).map(label => label.name)
          },
          filter,
          today
        );
      visible.set(column.id, filterActive ? tasks.filter(matches) : tasks);
    }
    return visible;
  }, [board.columns, board.taskLabels, taskMap, filter, filterActive, today]);

  const suggestions = useMemo(
    () =>
      suggestBoardFilter(filterQuery, {
        labels: board.labels,
        columns: board.columns.map(column => column.title)
      }),
    [filterQuery, board.labels, board.columns]
  );
  const suggestionsOpen = filterFocused && !suggestionsDismissed && suggestions.length > 0;
  const filteredLabelNames = filter.terms
    .filter(term => term.field === 'label' && !term.negated)
    .flatMap(term => term.values.map(value => value.toLowerCase()));

  const tasksOf = (column: Column): readonly Task[] => taskMap.get(column.id) ?? EMPTY_TASKS;
  const visibleTasksOf = (column: Column): readonly Task[] => visibleTaskMap.get(column.id) ?? EMPTY_TASKS;
  const visibleIds = [...visibleTaskMap.values()].flat().map(task => task.id);
  const keyboardColumns = (): BoardKeyboardColumn[] =>
    board.columns.map(column => ({
      columnId: column.id,
      taskIds: tasksOf(column).map(task => task.id),
      visibleIds: visibleTasksOf(column).map(task => task.id)
    }));

  const onFilterInput = (value: string): void => {
    setFilterQuery(value);
    setSuggestionsDismissed(false);
    setActiveSuggestion(0);
  };
  const applySuggestion = (query: string): void => {
    onFilterInput(query);
    core.focusSoon('[data-testid="board-filter-input"]');
  };

  /** 补全键盘：↓ / ↑ 循环（未选中时 ↑ 到最后一项），回车或 Tab 采纳，Esc 先收起补全再失焦。 */
  const onFilterKeydown = (event: KeyboardEvent<HTMLInputElement>): void => {
    const count = suggestionsOpen ? suggestions.length : 0;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (count === 0) return;
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const current = activeSuggestionRef.current;
      const start = step > 0 ? -1 : count;
      setActiveSuggestion(((current < 0 ? start : current) + step + count) % count);
      return;
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      const suggestion = suggestions[activeSuggestionRef.current];
      if (count === 0 || suggestion === undefined) return;
      event.preventDefault();
      applySuggestion(suggestion.query);
      return;
    }
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    if (suggestionsOpen) setSuggestionsDismissed(true);
    else event.currentTarget.blur();
  };

  const columnById = (columnId: UUID | null): Column | undefined =>
    boardRef.current.columns.find(column => column.id === columnId);

  return {
    filterQuery,
    filterActive,
    visibleCount: visibleIds.length,
    suggestions,
    suggestionsOpen,
    activeSuggestion,
    activeSuggestionId:
      suggestionsOpen && activeSuggestion >= 0 ? `${core.ids.suggestionList}-${activeSuggestion}` : undefined,
    rovingTaskId:
      focusedTaskId !== null && visibleIds.includes(focusedTaskId) ? focusedTaskId : (visibleIds[0] ?? null),
    labelsOf,
    tasksOf,
    visibleTasksOf,
    countLabel: column => {
      const visible = visibleTasksOf(column).length;
      return filterActive ? `筛选后 ${visible} / 共 ${tasksOf(column).length} 个任务` : `${visible} 个任务`;
    },
    overdueCount: column =>
      visibleTasksOf(column).filter(task => dueStatus(task.dueDate ?? null, today) === 'overdue').length,
    dueStatusOf: dueDate => dueStatus(dueDate, today),
    dueText: dueDate => dueStatusText(dueDate, today),
    isLabelFiltered: name => filteredLabelNames.includes(name.toLowerCase()),
    columnById,
    taskById: taskId => boardRef.current.tasks.find(task => task.id === taskId),
    columnTitleOf: columnId => columnById(columnId)?.title ?? '',
    isFirstColumn: column => board.columns[0]?.id === column.id,
    isLastColumn: column => board.columns.at(-1)?.id === column.id,
    canMoveTask: (task, direction) => resolveKeyboardMove(keyboardColumns(), task.id, direction) !== null,
    gridColumns: () =>
      board.columns.map(column => ({ columnId: column.id, taskIds: visibleTasksOf(column).map(task => task.id) })),
    menuColumns: () =>
      board.columns.map(column => ({ columnId: column.id, taskIds: tasksOf(column).map(task => task.id) })),
    keyboardColumns,
    setFocusedTaskId,
    setFilterFocused,
    onFilterInput,
    onFilterKeydown,
    applySuggestion,
    clearFilter: () => onFilterInput(''),
    toggleLabelFilter: name => {
      setFilterQuery(toggleBoardFilterValue(filterQueryRef.current, 'label', name));
      setSuggestionsDismissed(true);
    }
  };
};
