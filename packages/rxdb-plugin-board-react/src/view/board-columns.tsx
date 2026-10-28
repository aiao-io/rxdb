import { labelTextColor, type Column, type Task } from '@aiao/rxdb-plugin-board';
import type { ReactNode } from 'react';

import type { BoardViewModel } from './model.js';
import { cx } from './types.js';

interface PartProps {
  readonly vm: BoardViewModel;
}

/** 卡片底部字段：标签（点击即筛选）与截止日（逾期 / 今天用文字说明）。 */
function CardFields({ vm, task }: PartProps & { readonly task: Task }): ReactNode {
  const { data } = vm;
  const labels = data.labelsOf(task.id);
  const due = task.dueDate ?? null;
  if (labels.length === 0 && due === null) return null;
  const status = due === null ? null : data.dueStatusOf(due);
  return (
    <div className='rxb-card-fields'>
      {labels.map(label => (
        <button
          key={label.id}
          className={cx('rxb-label', data.isLabelFiltered(label.name) && 'is-active')}
          aria-label={label.name}
          aria-pressed={data.isLabelFiltered(label.name)}
          style={{ backgroundColor: label.color, color: labelTextColor(label.color) }}
          onClick={() => data.toggleLabelFilter(label.name)}
          data-testid='card-label'
          tabIndex={-1}
          title='按此标签筛选'
        >
          {label.name}
        </button>
      ))}
      {due === null ? null : (
        <span
          className={cx('rxb-due', status === 'overdue' && 'is-overdue', status === 'today' && 'is-today')}
          data-testid='task-due'
        >
          <span className='rxb-i rxb-i-calendar' aria-hidden='true' />
          {data.dueText(due)}
        </span>
      )}
    </div>
  );
}

/** 卡片标题就地编辑器（F2 / 菜单「编辑标题」）。 */
function CardEditor({ vm, task }: PartProps & { readonly task: Task }): ReactNode {
  const { cards } = vm;
  return (
    <div className='rxb-card-editor'>
      <input
        className='rxb-input'
        value={cards.taskTitleDraft}
        onChange={event => cards.setTaskTitleDraft(event.target.value)}
        onKeyDown={event => cards.onTaskTitleKeydown(event, task)}
        aria-label='任务标题'
        data-autofocus
        data-testid='task-title-editor'
      />
      <div className='rxb-composer-actions'>
        <button
          className='rxb-btn rxb-btn-sm'
          onClick={() => cards.cancelTaskTitle()}
          aria-label='取消'
          data-testid='task-title-cancel'
        >
          取消
        </button>
        <button
          className='rxb-btn rxb-btn-sm rxb-btn-primary'
          onClick={() => void cards.commitTaskTitle(task)}
          aria-label='保存标题'
          data-testid='task-title-save'
        >
          保存
        </button>
      </div>
    </div>
  );
}

/** 卡片：漫游 tabindex、键盘体系、拖拽源。 */
function TaskCard({ vm, task }: PartProps & { readonly task: Task }): ReactNode {
  const { core, data, drag, cards, detail, search, popover } = vm;
  return (
    <article
      className={cx(
        'rxb-card',
        drag.isDraggingTask(task) && 'is-dragging',
        drag.isDropAfter(task) && 'is-drop-after',
        drag.isDropBefore(task) && 'is-drop-before',
        search.searchHighlightId === task.id && 'is-search-hit',
        detail.detailTaskId === task.id && 'is-selected'
      )}
      aria-label={`任务：${task.title}`}
      data-task-id={task.id}
      draggable={!core.writeLocked && cards.editingTaskId !== task.id}
      tabIndex={data.rovingTaskId === task.id ? 0 : -1}
      onDragStart={event => drag.onTaskDragStart(event, task)}
      onFocus={event => {
        if (event.target === event.currentTarget) data.setFocusedTaskId(task.id);
      }}
      onKeyDown={event => cards.onCardKeydown(event, task)}
      data-testid='task-card'
    >
      {cards.editingTaskId === task.id ?
        <CardEditor vm={vm} task={task} />
      : <>
          <div className='rxb-card-main'>
            <button
              className='rxb-card-title'
              onClick={() => void detail.openDetail(task.id)}
              data-testid='task-title'
              tabIndex={-1}
            >
              {task.title}
            </button>
            <button
              className='rxb-btn rxb-btn-sm rxb-btn-icon rxb-btn-invisible rxb-card-menu'
              aria-expanded={popover.isPopoverFor('task-menu', task.id)}
              aria-label={`任务操作：${task.title}`}
              onClick={event => cards.openTaskMenu(event, task)}
              aria-haspopup='menu'
              data-testid='task-menu-trigger'
              tabIndex={-1}
            >
              <span className='rxb-i rxb-i-kebab' aria-hidden='true' />
            </button>
          </div>
          <CardFields vm={vm} task={task} />
        </>
      }
    </article>
  );
}

/** 列底建任务：回车即建，输入框保持打开以便连续录入。 */
function AddTaskForm({ vm }: PartProps): ReactNode {
  const { columns } = vm;
  return (
    <div className='rxb-composer' data-testid='add-task-form'>
      <input
        className='rxb-input'
        disabled={columns.creatingTask}
        value={columns.addTaskTitle}
        onChange={event => columns.setAddTaskTitle(event.target.value)}
        onKeyDown={columns.onAddTaskKeydown}
        aria-label='新任务标题'
        data-autofocus
        data-testid='add-task-input'
        placeholder='输入标题后回车创建'
      />
      <div className='rxb-composer-actions'>
        <button
          className='rxb-btn rxb-btn-sm'
          disabled={columns.creatingTask}
          onClick={() => columns.cancelAddTask()}
          aria-label='取消'
          data-testid='add-task-cancel'
        >
          取消
        </button>
        <button
          className='rxb-btn rxb-btn-sm rxb-btn-primary'
          disabled={columns.creatingTask || columns.addTaskTitle.trim() === ''}
          onClick={() => void columns.commitAddTask()}
          data-testid='add-task-submit'
        >
          添加
        </button>
      </div>
    </div>
  );
}

/** 列头：标题 / 计数 / 逾期数，或就地改名输入框；右侧列菜单与加任务。 */
function ColumnHeader({ vm, column }: PartProps & { readonly column: Column }): ReactNode {
  const { core, data, drag, columns, popover } = vm;
  const overdue = data.overdueCount(column);
  return (
    <header
      className={cx(
        'rxb-column-header',
        drag.isDraggingColumn(column) && 'is-dragging',
        drag.isColumnDropAfter(column) && 'is-drop-after',
        drag.isColumnDropBefore(column) && 'is-drop-before'
      )}
      data-column-header-id={column.id}
      draggable={!core.writeLocked && columns.editingColumnId !== column.id}
      onDragStart={event => drag.onColumnDragStart(event, column)}
      data-testid='column-header'
    >
      {columns.editingColumnId === column.id ?
        <input
          className='rxb-input'
          value={columns.columnTitleDraft}
          onBlur={() => void columns.commitColumnTitle()}
          onChange={event => columns.setColumnTitleDraft(event.target.value)}
          onKeyDown={columns.onColumnTitleKeydown}
          aria-label='列标题'
          data-autofocus
          data-testid='column-title-editor'
        />
      : <>
          <h2 className='rxb-column-title' data-testid='column-title'>
            {column.title}
          </h2>
          <span className='rxb-counter' title={data.countLabel(column)} data-testid='column-count'>
            {data.visibleTasksOf(column).length}
          </span>
          {overdue > 0 ?
            <span className='rxb-column-overdue' data-testid='column-overdue'>
              逾期 {overdue}
            </span>
          : null}
        </>
      }
      <div className='rxb-column-actions'>
        <button
          className='rxb-btn rxb-btn-sm rxb-btn-icon rxb-btn-invisible'
          aria-expanded={popover.isPopoverFor('column-menu', column.id)}
          aria-label={`列操作：${column.title}`}
          onClick={event => columns.openColumnMenu(event, column)}
          aria-haspopup='menu'
          data-testid='column-menu-trigger'
        >
          <span className='rxb-i rxb-i-kebab' aria-hidden='true' />
        </button>
        <button
          className='rxb-btn rxb-btn-sm rxb-btn-icon rxb-btn-invisible'
          aria-label={`添加任务到 ${column.title}`}
          disabled={core.writeLocked}
          onClick={() => columns.openAddTask(column.id)}
          data-testid='column-add-task'
        >
          <span className='rxb-i rxb-i-plus' aria-hidden='true' />
        </button>
      </div>
    </header>
  );
}

/** 列：列头 + 可见卡片 + 列底建任务。 */
function BoardColumn({ vm, column }: PartProps & { readonly column: Column }): ReactNode {
  const { core, data, drag, columns } = vm;
  const visible = data.visibleTasksOf(column);
  return (
    <section
      className={cx(
        'rxb-column',
        drag.isDropEnd(column) && 'is-drop-end',
        drag.isDropColumn(column) && 'is-drop-target'
      )}
      aria-label={`列：${column.title}`}
      data-column-id={column.id}
      onDragOver={drag.onColumnDragOver}
      onDrop={event => void drag.onTaskDrop(event)}
      data-testid='column'
    >
      <ColumnHeader vm={vm} column={column} />
      <div className='rxb-cards'>
        {visible.length > 0 ?
          visible.map(task => <TaskCard key={task.id} vm={vm} task={task} />)
        : <p className='rxb-column-empty' data-testid='column-empty'>
            {data.filterActive && data.tasksOf(column).length > 0 ? '没有匹配筛选的任务' : '暂无任务'}
          </p>
        }
        {columns.addTaskColumnId === column.id ?
          <AddTaskForm vm={vm} />
        : <button
            className='rxb-add-item'
            disabled={core.writeLocked || columns.creatingTask}
            onClick={() => columns.openAddTask(column.id)}
            data-testid='add-task'
          >
            <span className='rxb-i rxb-i-plus' aria-hidden='true' />
            添加任务
          </button>
        }
      </div>
    </section>
  );
}

/** 末尾「+ 添加列」与就地建列。 */
function AddColumn({ vm }: PartProps): ReactNode {
  const { core, columns } = vm;
  return (
    <div className='rxb-add-column'>
      {columns.addingColumn ?
        <div className='rxb-composer'>
          <input
            className='rxb-input'
            value={columns.addColumnTitle}
            onChange={event => columns.setAddColumnTitle(event.target.value)}
            onKeyDown={columns.onAddColumnKeydown}
            aria-label='新列标题'
            data-autofocus
            data-testid='column-composer-input'
            placeholder='列名，如 In review'
          />
          <div className='rxb-composer-actions'>
            <button
              className='rxb-btn rxb-btn-sm'
              onClick={() => columns.cancelAddColumn()}
              data-testid='column-composer-cancel'
            >
              取消
            </button>
            <button
              className='rxb-btn rxb-btn-sm rxb-btn-primary'
              disabled={columns.addColumnTitle.trim() === ''}
              onClick={() => void columns.commitAddColumn()}
              data-testid='column-composer-submit'
            >
              添加列
            </button>
          </div>
        </div>
      : <button
          className='rxb-btn'
          disabled={core.writeLocked}
          onClick={columns.openAddColumn}
          data-testid='create-column'
        >
          <span className='rxb-i rxb-i-plus' aria-hidden='true' />
          添加列
        </button>
      }
    </div>
  );
}

/** 列区（横向滚动；滚动即关闭弹层）。 */
export function BoardColumns({ vm }: PartProps): ReactNode {
  return (
    <div className='rxb-columns' onScroll={() => vm.popover.closePopover(false)} data-testid='columns'>
      {vm.core.board.columns.map(column => (
        <BoardColumn key={column.id} vm={vm} column={column} />
      ))}
      <AddColumn vm={vm} />
    </div>
  );
}

/** 空态：还没有看板 / 请选择看板。 */
export function EmptyBoard({ vm }: PartProps): ReactNode {
  const { core, dialog } = vm;
  return (
    <div className='rxb-empty' data-testid='empty-board'>
      <p className='rxb-empty-title'>{core.board.boards.length === 0 ? '还没有看板' : '请选择看板'}</p>
      <p>看板把任务按列组织；数据只保存在本地浏览器，可随时导出备份。</p>
      <button
        className='rxb-btn rxb-btn-primary'
        disabled={core.writeLocked}
        onClick={dialog.openBoardComposer}
        data-testid='create-board-empty'
      >
        新建看板
      </button>
    </div>
  );
}
