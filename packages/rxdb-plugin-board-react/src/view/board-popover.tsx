import type { Column, Task } from '@aiao/rxdb-plugin-board';
import type { ReactNode } from 'react';

import type { BoardViewModel } from './model.js';
import { cx, type PopoverState } from './types.js';

interface PartProps {
  readonly vm: BoardViewModel;
}

/** 看板菜单：导出备份 / 键盘快捷键 / 删除看板。 */
function BoardMenu({ vm }: PartProps): ReactNode {
  const { core, header, dialog } = vm;
  return (
    <>
      <button
        className='rxb-menu-item'
        disabled={core.writeLocked}
        onClick={() => void header.onExportBackup()}
        data-testid='export-backup'
        role='menuitem'
      >
        <span className='rxb-i rxb-i-download' aria-hidden='true' />
        导出备份
      </button>
      <button className='rxb-menu-item' onClick={dialog.openShortcuts} data-testid='shortcuts-open' role='menuitem'>
        <span className='rxb-i rxb-i-keyboard' aria-hidden='true' />
        键盘快捷键
        <kbd className='rxb-kbd'>?</kbd>
      </button>
      <div className='rxb-menu-divider' role='separator' />
      <button
        className='rxb-menu-item rxb-menu-item-danger'
        disabled={core.writeLocked || !core.board.currentBoard}
        onClick={() => void header.confirmBoardDelete()}
        data-testid='delete-board'
        role='menuitem'
      >
        <span className='rxb-i rxb-i-trash' aria-hidden='true' />
        删除看板
      </button>
    </>
  );
}

/** 列菜单：改名 / 删除、本列排序（一次性）、左右移（首尾禁用并写明原因）。 */
function ColumnMenu({ vm, column }: PartProps & { readonly column: Column }): ReactNode {
  const { core, data, columns } = vm;
  const { writeLocked } = core;
  const sorting = columns.sortingColumnId !== null;
  const first = data.isFirstColumn(column);
  const last = data.isLastColumn(column);
  return (
    <>
      <div aria-label='列' role='group'>
        <p className='rxb-menu-heading' aria-hidden='true'>
          列
        </p>
        <button
          className='rxb-menu-item'
          disabled={writeLocked}
          onClick={() => columns.startColumnTitle(column.id)}
          data-testid='column-rename'
          role='menuitem'
        >
          <span className='rxb-i rxb-i-pencil' aria-hidden='true' />
          改名
        </button>
        <button
          className='rxb-menu-item rxb-menu-item-danger'
          disabled={writeLocked}
          onClick={() => void columns.confirmColumnDelete(column)}
          data-testid='column-delete'
          role='menuitem'
        >
          <span className='rxb-i rxb-i-trash' aria-hidden='true' />
          删除列
        </button>
      </div>
      <div className='rxb-menu-divider' role='separator' />
      <div aria-label='本列排序' role='group'>
        <p className='rxb-menu-heading' aria-hidden='true'>
          本列排序（一次性）
        </p>
        <button
          className='rxb-menu-item'
          disabled={writeLocked || sorting}
          onClick={() => void columns.sortColumnBy(column.id, 'dueDate')}
          data-testid='column-sort-due'
          role='menuitem'
        >
          <span className='rxb-i rxb-i-calendar' aria-hidden='true' />
          按截止日
        </button>
        <button
          className='rxb-menu-item'
          disabled={writeLocked || sorting}
          onClick={() => void columns.sortColumnBy(column.id, 'title')}
          data-testid='column-sort-title'
          role='menuitem'
        >
          <span className='rxb-i rxb-i-sort' aria-hidden='true' />
          按标题
        </button>
      </div>
      <div className='rxb-menu-divider' role='separator' />
      <div aria-label='位置' role='group'>
        <p className='rxb-menu-heading' aria-hidden='true'>
          位置
        </p>
        <button
          className='rxb-menu-item'
          disabled={writeLocked || first}
          onClick={() => void columns.moveColumnBy(column.id, -1)}
          data-testid='column-move-back'
          role='menuitem'
        >
          <span className='rxb-i rxb-i-arrow-left' aria-hidden='true' />
          <span className='rxb-menu-item-label'>
            左移
            {first ?
              <span className='rxb-menu-item-hint'>已是最左列</span>
            : null}
          </span>
        </button>
        <button
          className='rxb-menu-item'
          disabled={writeLocked || last}
          onClick={() => void columns.moveColumnBy(column.id, 1)}
          data-testid='column-move-forward'
          role='menuitem'
        >
          <span className='rxb-i rxb-i-arrow-right' aria-hidden='true' />
          <span className='rxb-menu-item-label'>
            右移
            {last ?
              <span className='rxb-menu-item-hint'>已是最右列</span>
            : null}
          </span>
        </button>
      </div>
    </>
  );
}

/** 卡片菜单：打开详情 / 编辑标题 / 移到列… / 上移 / 下移 / 删除。 */
function TaskMenu({ vm, task }: PartProps & { readonly task: Task }): ReactNode {
  const { core, data, cards, detail } = vm;
  const { writeLocked } = core;
  return (
    <>
      <button
        className='rxb-menu-item'
        onClick={() => void detail.openDetail(task.id)}
        data-testid='task-menu-open'
        role='menuitem'
      >
        <span className='rxb-i rxb-i-open' aria-hidden='true' />
        打开详情
        <kbd className='rxb-kbd'>↵</kbd>
      </button>
      <button
        className='rxb-menu-item'
        disabled={writeLocked}
        onClick={() => cards.startTaskTitle(task)}
        data-testid='task-edit-title'
        role='menuitem'
      >
        <span className='rxb-i rxb-i-pencil' aria-hidden='true' />
        编辑标题
        <kbd className='rxb-kbd'>F2</kbd>
      </button>
      <div className='rxb-menu-divider' role='separator' />
      <button
        className='rxb-menu-item'
        disabled={writeLocked}
        onClick={() => cards.openMovePicker(task)}
        aria-haspopup='listbox'
        data-testid='task-move-to-column'
        role='menuitem'
      >
        <span className='rxb-i rxb-i-arrow-right' aria-hidden='true' />
        移到列…
        <span className='rxb-i rxb-i-chevron-right' aria-hidden='true' />
      </button>
      <button
        className='rxb-menu-item'
        disabled={writeLocked || !data.canMoveTask(task, 'up')}
        onClick={() => void cards.moveTaskBy(task, 'up')}
        data-testid='task-move-up'
        role='menuitem'
      >
        <span className='rxb-i rxb-i-arrow-up' aria-hidden='true' />
        上移
        <kbd className='rxb-kbd'>⌥↑</kbd>
      </button>
      <button
        className='rxb-menu-item'
        disabled={writeLocked || !data.canMoveTask(task, 'down')}
        onClick={() => void cards.moveTaskBy(task, 'down')}
        data-testid='task-move-down'
        role='menuitem'
      >
        <span className='rxb-i rxb-i-arrow-down' aria-hidden='true' />
        下移
        <kbd className='rxb-kbd'>⌥↓</kbd>
      </button>
      <div className='rxb-menu-divider' role='separator' />
      <button
        className='rxb-menu-item rxb-menu-item-danger'
        disabled={writeLocked}
        onClick={() => void cards.confirmTaskDelete(task)}
        data-testid='task-delete'
        role='menuitem'
      >
        <span className='rxb-i rxb-i-trash' aria-hidden='true' />
        删除任务
        <kbd className='rxb-kbd'>Del</kbd>
      </button>
    </>
  );
}

/** 可搜索选择器：移到列 / 详情所在列（单选）、详情标签（多选，可就地创建）。 */
function Picker({ vm, pop }: PartProps & { readonly pop: PopoverState }): ReactNode {
  const { popover } = vm;
  const multiple = pop.kind === 'detail-label-picker';
  return (
    <>
      <p className='rxb-picker-title'>{multiple ? '选择标签' : '移到列'}</p>
      <div className='rxb-picker-filter'>
        <input
          className='rxb-input'
          value={popover.pickerQuery}
          onChange={event => popover.onPickerInput(event.target.value)}
          onKeyDown={popover.onPickerKeydown}
          aria-label='过滤选项'
          data-autofocus
          data-testid='picker-filter'
          placeholder='过滤选项'
        />
      </div>
      {/* listbox 只容 option：空态段落放在 listbox 之外 */}
      {popover.pickerOptions.length > 0 ?
        <div aria-label={multiple ? '选择标签' : '移到列'} aria-multiselectable={multiple} role='listbox'>
          {popover.pickerOptions.map((option, index) => (
            <button
              key={option.id}
              className={cx('rxb-menu-item', index === popover.pickerActive && 'is-active')}
              aria-selected={option.selected}
              onClick={() => void popover.choosePickerOption(option.id)}
              data-testid='picker-option'
              role='option'
            >
              <span className='rxb-picker-check'>
                {option.selected ?
                  <span className='rxb-i rxb-i-check' aria-hidden='true' />
                : null}
              </span>
              {option.color ?
                <span className='rxb-swatch' style={{ backgroundColor: option.color }} aria-hidden='true' />
              : null}
              {option.label}
            </button>
          ))}
        </div>
      : <p className='rxb-picker-empty'>没有匹配的选项</p>}
      {popover.canCreateLabelFromPicker ?
        <>
          <div className='rxb-menu-divider' role='separator' />
          <button
            className='rxb-menu-item'
            onClick={() => void popover.createLabelFromPicker()}
            data-testid='picker-create'
          >
            <span className='rxb-i rxb-i-plus' aria-hidden='true' />
            创建标签「{popover.pickerQuery.trim()}」
          </button>
        </>
      : null}
    </>
  );
}

/** 弹层内容：按种类分派；目标已不存在的列 / 卡片菜单渲染为空。 */
function PopoverContent({ vm, pop }: PartProps & { readonly pop: PopoverState }): ReactNode {
  if (pop.kind === 'board-menu') return <BoardMenu vm={vm} />;
  if (pop.kind === 'column-menu') {
    const column = vm.data.columnById(pop.targetId);
    return column ? <ColumnMenu vm={vm} column={column} /> : null;
  }
  if (pop.kind === 'task-menu') {
    const task = vm.data.taskById(pop.targetId);
    return task ? <TaskMenu vm={vm} task={task} /> : null;
  }
  return <Picker vm={vm} pop={pop} />;
}

/** 弹层：菜单与选择器（根层 fixed 定位，避免被横向滚动的列区裁切）。 */
export function BoardPopover({ vm, pop }: PartProps & { readonly pop: PopoverState }): ReactNode {
  return (
    <div
      className='rxb-popover'
      aria-label={vm.popover.popoverLabel(pop)}
      role={pop.kind.endsWith('picker') ? 'dialog' : 'menu'}
      style={{ left: pop.left, top: pop.top, width: pop.width }}
      onKeyDown={vm.popover.onPopoverKeydown}
      data-testid='popover'
    >
      <PopoverContent vm={vm} pop={pop} />
    </div>
  );
}
