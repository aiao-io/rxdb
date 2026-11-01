import type { Board } from '@aiao/rxdb-plugin-board';
import type { ReactNode } from 'react';

import type { BoardViewModel } from './model.js';

interface PartProps {
  readonly vm: BoardViewModel;
}

/** 板标题与描述：点击就地编辑（回车 / 失焦保存，Esc 取消）。 */
function BoardTitle({ vm, current }: PartProps & { readonly current: Board }): ReactNode {
  const { header, core } = vm;
  return (
    <>
      <h1 className='rxb-board-title'>
        {header.editingBoardTitle ?
          <input
            className='rxb-input'
            value={header.boardTitleDraft}
            onBlur={() => void header.commitBoardTitle()}
            onChange={event => header.setBoardTitleDraft(event.target.value)}
            onKeyDown={header.onBoardTitleKeydown}
            aria-label='看板标题'
            data-autofocus
            data-testid='board-title-editor'
          />
        : <button
            className='rxb-title-button'
            aria-label={`改板标题：${current.title}`}
            disabled={core.writeLocked}
            onClick={header.startBoardTitle}
            data-testid='rename-board'
          >
            {current.title}
          </button>
        }
      </h1>
      <div className='rxb-board-desc'>
        {header.editingBoardDescription ?
          <textarea
            className='rxb-textarea'
            value={header.boardDescriptionDraft}
            onBlur={() => void header.commitBoardDescription()}
            onChange={event => header.setBoardDescriptionDraft(event.target.value)}
            onKeyDown={header.onBoardDescriptionKeydown}
            aria-label='看板描述'
            data-autofocus
            data-testid='board-description-editor'
            rows={2}
          />
        : <button
            className='rxb-title-button'
            disabled={core.writeLocked}
            onClick={header.startBoardDescription}
            data-testid='board-description'
            title='编辑看板描述'
          >
            {current.description ? current.description : <span className='rxb-placeholder'>添加描述</span>}
          </button>
        }
      </div>
    </>
  );
}

/** 页头右侧操作：恢复中徽标、撤销 / 重做、搜索、标签、看板菜单。 */
function HeaderActions({ vm }: PartProps): ReactNode {
  const { core, header, dialog, popover } = vm;
  const { board, writeLocked } = core;
  return (
    <div className='rxb-header-actions'>
      {board.restoring ?
        <span className='rxb-badge rxb-badge-attention' aria-live='polite' data-testid='restoring-badge'>
          恢复中
        </span>
      : null}
      <div className='rxb-btn-group'>
        <button
          className='rxb-btn rxb-btn-icon'
          disabled={writeLocked || board.undoCount === 0}
          onClick={() => void header.undo()}
          aria-label='撤销'
          data-testid='undo'
          title='撤销（⌘Z）'
        >
          <span className='rxb-i rxb-i-undo' aria-hidden='true' />
        </button>
        <button
          className='rxb-btn rxb-btn-icon'
          disabled={writeLocked || board.redoCount === 0}
          onClick={() => void header.redo()}
          aria-label='重做'
          data-testid='redo'
          title='重做（⇧⌘Z）'
        >
          <span className='rxb-i rxb-i-redo' aria-hidden='true' />
        </button>
      </div>
      {board.searchSource || board.searchUnavailableReason ?
        <button className='rxb-btn' onClick={dialog.openSearch} data-testid='search-open' title='搜索任务（⌘K）'>
          <span className='rxb-i rxb-i-search' aria-hidden='true' />
          搜索
        </button>
      : null}
      <button className='rxb-btn' disabled={!board.currentBoard} onClick={dialog.openLabels} data-testid='labels-open'>
        <span className='rxb-i rxb-i-tag' aria-hidden='true' />
        标签
      </button>
      <button
        className='rxb-btn rxb-btn-icon'
        aria-expanded={popover.popover?.kind === 'board-menu'}
        onClick={header.openBoardMenu}
        aria-haspopup='menu'
        aria-label='看板操作'
        data-testid='board-menu-trigger'
      >
        <span className='rxb-i rxb-i-kebab' aria-hidden='true' />
      </button>
    </div>
  );
}

/** 页头：板切换 / 标题 / 描述 / 操作（GitHub Projects 项目头）。 */
export function BoardHeader({ vm }: PartProps): ReactNode {
  const { core, header, dialog } = vm;
  const { board } = core;
  return (
    <header className='rxb-header' data-testid='board-header'>
      <div className='rxb-header-main'>
        <div className='rxb-board-switch'>
          {/* 受控 value：React 每次提交都按当前选项重新应用，新板选项晚于当前板 id 渲染也不会失配 */}
          <select
            className='rxb-select'
            value={board.currentBoardId ?? ''}
            onChange={header.onBoardSelectionChange}
            aria-label='选择看板'
            data-testid='board-selector'
          >
            {board.boards.map(item => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
          <button
            className='rxb-btn rxb-btn-sm rxb-btn-invisible'
            disabled={core.writeLocked}
            onClick={dialog.openBoardComposer}
            data-testid='create-board'
          >
            <span className='rxb-i rxb-i-plus' aria-hidden='true' />
            新建看板
          </button>
        </div>
        {board.currentBoard ?
          <BoardTitle vm={vm} current={board.currentBoard} />
        : null}
      </div>
      <HeaderActions vm={vm} />
    </header>
  );
}

/** 筛选条：关键词 + `field:value` 令牌，补全与命中数。 */
export function BoardToolbar({ vm }: PartProps): ReactNode {
  const { data, core } = vm;
  const listId = core.ids.suggestionList;
  return (
    <div className='rxb-toolbar'>
      <div className='rxb-filter' data-testid='board-filter'>
        <span className='rxb-i rxb-i-search' aria-hidden='true' />
        <input
          className='rxb-filter-input'
          aria-activedescendant={data.activeSuggestionId}
          aria-controls={listId}
          aria-expanded={data.suggestionsOpen}
          value={data.filterQuery}
          onBlur={() => data.setFilterFocused(false)}
          onFocus={() => data.setFilterFocused(true)}
          onChange={event => data.onFilterInput(event.target.value)}
          onKeyDown={data.onFilterKeydown}
          aria-autocomplete='list'
          aria-label='筛选任务'
          autoComplete='off'
          data-testid='board-filter-input'
          placeholder='按关键词或字段筛选，如 label:核心 due:overdue'
          role='combobox'
        />
        {data.filterActive ?
          <>
            <span className='rxb-filter-count' aria-live='polite' data-testid='board-filter-count'>
              {data.visibleCount} 项
            </span>
            <button
              className='rxb-btn rxb-btn-sm rxb-btn-icon rxb-btn-invisible'
              onClick={data.clearFilter}
              aria-label='清除筛选'
              data-testid='board-filter-clear'
            >
              <span className='rxb-i rxb-i-close' aria-hidden='true' />
            </button>
          </>
        : null}
        {data.suggestionsOpen ?
          <ul
            className='rxb-popover'
            id={listId}
            style={{ left: 0, position: 'absolute', top: 'calc(100% + 4px)' }}
            aria-label='筛选补全'
            data-testid='board-filter-suggestions'
            role='listbox'
          >
            {data.suggestions.map((suggestion, index) => (
              <li
                key={suggestion.query}
                className={
                  index === data.activeSuggestion ?
                    'rxb-menu-item rxb-suggestion is-active'
                  : 'rxb-menu-item rxb-suggestion'
                }
                aria-selected={index === data.activeSuggestion}
                id={`${listId}-${index}`}
                onMouseDown={event => event.preventDefault()}
                onClick={() => data.applySuggestion(suggestion.query)}
                data-testid='board-filter-suggestion'
                role='option'
              >
                {suggestion.color ?
                  <span className='rxb-swatch' style={{ backgroundColor: suggestion.color }} aria-hidden='true' />
                : null}
                <span className='rxb-suggestion-value'>{suggestion.value}</span>
                <span className='rxb-suggestion-desc'>{suggestion.description}</span>
              </li>
            ))}
          </ul>
        : null}
      </div>
    </div>
  );
}
