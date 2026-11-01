import {
  BOARD_LABEL_COLORS,
  isHexColor,
  labelTextColor,
  type DeletePlan,
  type LabelDeletePlan
} from '@aiao/rxdb-plugin-board';
import type { ReactNode } from 'react';

import type { BoardViewModel } from './model.js';
import { SHORTCUT_GROUPS, type DialogState, type LabelEditorState } from './types.js';

interface PartProps {
  readonly vm: BoardViewModel;
}

const sameColor = (a: string, b: string): boolean => a.toLowerCase() === b.trim().toLowerCase();

/** 预览色：输入未完成时沿用灰色，不把非法色交给对比度计算。 */
const previewColor = (color: string): string => (isHexColor(color) ? color.trim() : BOARD_LABEL_COLORS[0].color);

/** 对话框头：标题 + 可选关闭按钮。 */
function DialogHeader({
  vm,
  title,
  closable = true,
  autofocusClose = false
}: PartProps & { readonly title: string; readonly closable?: boolean; readonly autofocusClose?: boolean }): ReactNode {
  return (
    <div className='rxb-dialog-header'>
      <h2 className='rxb-dialog-title' id={vm.core.ids.dialogTitle}>
        {title}
      </h2>
      {closable ?
        <button
          className='rxb-btn rxb-btn-sm rxb-btn-icon rxb-btn-invisible'
          onClick={() => vm.dialog.closeDialog()}
          aria-label='关闭'
          data-autofocus={autofocusClose || undefined}
          data-testid='dialog-close'
        >
          <span className='rxb-i rxb-i-close' aria-hidden='true' />
        </button>
      : null}
    </div>
  );
}

/** 删除确认的影响清单。 */
function DeleteImpact({ plan }: { readonly plan: DeletePlan }): ReactNode {
  if (plan.kind === 'task') {
    return (
      <>
        <p>删除任务「{plan.taskTitle}」？</p>
        <div className='rxb-impact'>
          <span>将同时移除 {plan.taskLabelIds.length} 条标签关联。</span>
        </div>
      </>
    );
  }
  if (plan.kind === 'column') {
    return (
      <>
        <p>删除列「{plan.columnTitle}」？</p>
        <div className='rxb-impact'>
          <span>其中 {plan.taskIds.length} 个任务会一并删除；</span>
          <span>{plan.taskLabelIds.length} 条任务标签关联随之移除，板级标签定义保留。</span>
        </div>
      </>
    );
  }
  return (
    <>
      <p>删除看板「{plan.boardTitle}」？</p>
      <div className='rxb-impact'>
        <span>
          {plan.columnIds.length} 列、{plan.taskIds.length} 个任务、{plan.boardLabelIds.length} 个标签定义、
          {plan.taskLabelIds.length} 条任务标签关联会一并删除。
        </span>
      </div>
    </>
  );
}

/** 删除确认（任务 / 列 / 板 / 标签），取消零写。 */
function ConfirmDialog({
  vm,
  title,
  children
}: PartProps & { readonly title: string; readonly children: ReactNode }): ReactNode {
  return (
    <div
      className='rxb-dialog'
      aria-labelledby={vm.core.ids.dialogTitle}
      aria-modal='true'
      data-testid='confirm-delete'
      role='alertdialog'
    >
      <DialogHeader vm={vm} title={title} closable={false} />
      <div className='rxb-dialog-body'>
        {children}
        <p className='rxb-hint'>删除后可用「撤销」恢复（仅限本次会话）。</p>
      </div>
      <div className='rxb-dialog-footer'>
        <button
          className='rxb-btn'
          onClick={() => vm.dialog.closeDialog()}
          data-autofocus
          data-testid='confirm-delete-no'
        >
          取消
        </button>
        <button
          className='rxb-btn rxb-btn-danger'
          onClick={() => void vm.dialog.executeConfirmedDelete()}
          data-testid='confirm-delete-yes'
        >
          确认删除
        </button>
      </div>
    </div>
  );
}

function LabelDeleteImpact({ plan }: { readonly plan: LabelDeletePlan }): ReactNode {
  return (
    <>
      <p>删除标签「{plan.labelName}」？</p>
      <div className='rxb-impact'>
        <span>将从 {plan.taskLabelIds.length} 个任务上移除这个标签。</span>
      </div>
    </>
  );
}

/** 新建看板。 */
function BoardComposer({ vm }: PartProps): ReactNode {
  const { dialog } = vm;
  return (
    <div
      className='rxb-dialog'
      aria-labelledby={vm.core.ids.dialogTitle}
      aria-modal='true'
      data-testid='board-composer'
      role='dialog'
    >
      <DialogHeader vm={vm} title='新建看板' />
      <div className='rxb-dialog-body'>
        <label className='rxb-form-field'>
          看板名称
          <input
            className='rxb-input'
            value={dialog.boardComposerTitle}
            onChange={event => dialog.setBoardComposerTitle(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') void dialog.submitBoardComposer();
            }}
            data-autofocus
            data-testid='board-composer-input'
            placeholder='如：2026 Q4 发布计划'
          />
        </label>
      </div>
      <div className='rxb-dialog-footer'>
        <button className='rxb-btn' onClick={() => dialog.closeDialog()}>
          取消
        </button>
        <button
          className='rxb-btn rxb-btn-primary'
          disabled={dialog.boardComposerTitle.trim() === ''}
          onClick={() => void dialog.submitBoardComposer()}
          data-testid='board-composer-submit'
        >
          创建
        </button>
      </div>
    </div>
  );
}

/** 标签编辑器：名称 + 8 预设色 + 自定义色 + 预览。 */
function LabelEditor({ vm, editor }: PartProps & { readonly editor: LabelEditorState }): ReactNode {
  const { dialog } = vm;
  const preview = previewColor(editor.color);
  return (
    <>
      <div className='rxb-dialog-body' data-testid='label-editor'>
        <div className='rxb-label-preview'>
          <span className='rxb-label' style={{ backgroundColor: preview, color: labelTextColor(preview) }}>
            {editor.name.trim() || '标签预览'}
          </span>
        </div>
        <label className='rxb-form-field'>
          名称
          <input
            className='rxb-input'
            value={editor.name}
            onChange={event => dialog.updateLabelEditor({ name: event.target.value })}
            onKeyDown={event => {
              if (event.key === 'Enter') void dialog.saveLabelEditor();
            }}
            data-autofocus
            data-testid='label-name-input'
          />
        </label>
        <div className='rxb-form-field' role='group' aria-label='颜色'>
          颜色
          <div className='rxb-swatches'>
            {BOARD_LABEL_COLORS.map(option => (
              <button
                key={option.color}
                className='rxb-swatch-button'
                aria-label={option.name}
                aria-pressed={sameColor(option.color, editor.color)}
                style={{ backgroundColor: option.color }}
                onClick={() => dialog.updateLabelEditor({ color: option.color })}
                data-testid='label-color-option'
              >
                {sameColor(option.color, editor.color) ?
                  <span
                    className='rxb-i rxb-i-check'
                    style={{ color: labelTextColor(option.color) }}
                    aria-hidden='true'
                  />
                : null}
              </button>
            ))}
          </div>
          <div className='rxb-color-row'>
            <span className='rxb-hint'>自定义</span>
            <input
              className='rxb-input'
              value={editor.color}
              onChange={event => dialog.updateLabelEditor({ color: event.target.value })}
              aria-label='自定义颜色（#rrggbb）'
              data-testid='label-color-input'
              maxLength={7}
            />
          </div>
        </div>
      </div>
      <div className='rxb-dialog-footer'>
        <button className='rxb-btn' onClick={dialog.cancelLabelEditor} data-testid='label-editor-cancel'>
          取消
        </button>
        <button
          className='rxb-btn rxb-btn-primary'
          disabled={editor.name.trim() === '' || !isHexColor(editor.color)}
          onClick={() => void dialog.saveLabelEditor()}
          data-testid='label-editor-save'
        >
          保存
        </button>
      </div>
    </>
  );
}

/** 标签列表：编辑 / 删除，底部新建。 */
function LabelList({ vm }: PartProps): ReactNode {
  const { core, dialog } = vm;
  const labels = core.board.labels;
  return (
    <>
      <div className='rxb-dialog-body'>
        {labels.length === 0 ?
          <p className='rxb-hint'>当前看板还没有标签。</p>
        : null}
        <ul className='rxb-label-list'>
          {labels.map(label => (
            <li key={label.id} className='rxb-label-row' data-testid='label-row'>
              <span
                className='rxb-label'
                style={{ backgroundColor: label.color, color: labelTextColor(label.color) }}
                data-testid='label-chip'
              >
                {label.name}
              </span>
              <button
                className='rxb-btn rxb-btn-sm'
                aria-label={`编辑标签 ${label.name}`}
                disabled={core.writeLocked}
                onClick={() => dialog.startEditLabel(label)}
                data-testid='label-edit'
              >
                编辑
              </button>
              <button
                className='rxb-btn rxb-btn-sm rxb-btn-danger'
                aria-label={`删除标签 ${label.name}`}
                disabled={core.writeLocked}
                onClick={() => void dialog.deleteLabel(label)}
                data-testid='label-delete'
              >
                删除
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className='rxb-dialog-footer'>
        <button
          className='rxb-btn rxb-btn-primary'
          disabled={core.writeLocked}
          onClick={dialog.startCreateLabel}
          data-autofocus
          data-testid='create-label'
        >
          <span className='rxb-i rxb-i-plus' aria-hidden='true' />
          新建标签
        </button>
      </div>
    </>
  );
}

/** 「标签」对话框：列表与编辑器两态。 */
function LabelManager({ vm }: PartProps): ReactNode {
  const editor = vm.dialog.labelEditor;
  const title =
    editor === null ? '标签'
    : editor.labelId === null ? '新建标签'
    : '编辑标签';
  return (
    <div
      className='rxb-dialog'
      aria-labelledby={vm.core.ids.dialogTitle}
      aria-modal='true'
      data-testid='label-manager'
      role='dialog'
    >
      <DialogHeader vm={vm} title={title} />
      {editor ?
        <LabelEditor vm={vm} editor={editor} />
      : <LabelList vm={vm} />}
    </div>
  );
}

/** 搜索结果区：加载中 / 失败 / 无匹配 / 结果与加载更多。 */
function SearchResults({ vm }: PartProps): ReactNode {
  const { search } = vm;
  if (search.searchState === 'loading') {
    return (
      <p className='rxb-hint' data-testid='board-search-loading'>
        搜索中…
      </p>
    );
  }
  if (search.searchState === 'error') {
    return (
      <p className='rxb-hint' data-testid='board-search-error'>
        {search.searchErrorText}
      </p>
    );
  }
  if (search.searchState === 'empty') {
    return (
      <p className='rxb-hint' data-testid='board-search-empty'>
        无匹配
      </p>
    );
  }
  return (
    <>
      {search.searchResults.map(result => (
        <button
          key={result.id}
          className='rxb-search-result'
          onClick={() => search.onSearchResultClick(result)}
          data-testid='board-search-result'
        >
          <span className='rxb-search-result-title'>{search.searchResultTitle(result)}</span>
          <span className='rxb-search-result-column'>{search.searchColumnTitle(result)}</span>
          <span className='rxb-search-result-snippet'>{result.snippet}</span>
        </button>
      ))}
      {search.searchHasMore ?
        <button className='rxb-btn rxb-btn-sm' onClick={search.onSearchMore} data-testid='board-search-more'>
          加载更多
        </button>
      : null}
    </>
  );
}

/** 搜索当前板任务（⌘K）。 */
function SearchDialog({ vm }: PartProps): ReactNode {
  const { core, search } = vm;
  const { board } = core;
  const unavailable = search.searchUnavailableText(board.searchUnavailableReason);
  return (
    <div
      className='rxb-dialog rxb-dialog-wide'
      aria-labelledby={core.ids.dialogTitle}
      aria-modal='true'
      data-testid='board-search'
      role='dialog'
    >
      <DialogHeader vm={vm} title='搜索当前板任务' />
      <div className='rxb-dialog-body'>
        <input
          className='rxb-input'
          disabled={!board.searchSource}
          placeholder={board.searchSource ? '全文搜索标题与描述' : unavailable}
          value={search.searchQuery}
          onChange={event => search.onSearchInput(event.target.value)}
          aria-label='搜索当前板任务'
          data-autofocus
          data-testid='board-search-input'
        />
        {board.searchSource ? null : (
          <p className='rxb-hint' data-testid='board-search-unavailable'>
            {unavailable}
          </p>
        )}
        {search.searchQuery.trim() === '' ? null : (
          <div className='rxb-search-results' data-testid='board-search-results'>
            <SearchResults vm={vm} />
          </div>
        )}
      </div>
    </div>
  );
}

/** 键盘快捷键一览（?）。 */
function ShortcutsDialog({ vm }: PartProps): ReactNode {
  return (
    <div
      className='rxb-dialog rxb-dialog-wide'
      aria-labelledby={vm.core.ids.dialogTitle}
      aria-modal='true'
      data-testid='shortcuts-dialog'
      role='dialog'
    >
      <DialogHeader vm={vm} title='键盘快捷键' autofocusClose />
      <div className='rxb-dialog-body'>
        <div className='rxb-shortcuts'>
          {SHORTCUT_GROUPS.map(group => (
            <section key={group.title} className='rxb-shortcut-group'>
              <h3 className='rxb-panel-section-title'>{group.title}</h3>
              {group.items.map(item => (
                <div key={item.label} className='rxb-shortcut'>
                  <span>{item.label}</span>
                  <span>
                    {item.keys.map(key => (
                      <kbd key={key} className='rxb-kbd'>
                        {key}
                      </kbd>
                    ))}
                  </span>
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 按种类渲染对话框本体。 */
function DialogContent({ vm, current }: PartProps & { readonly current: DialogState }): ReactNode {
  switch (current.kind) {
    case 'confirm-delete':
      return (
        <ConfirmDialog vm={vm} title='确认删除'>
          <DeleteImpact plan={current.plan} />
        </ConfirmDialog>
      );
    case 'confirm-label-delete':
      return (
        <ConfirmDialog vm={vm} title='删除标签'>
          <LabelDeleteImpact plan={current.plan} />
        </ConfirmDialog>
      );
    case 'board-composer':
      return <BoardComposer vm={vm} />;
    case 'labels':
      return <LabelManager vm={vm} />;
    case 'search':
      return <SearchDialog vm={vm} />;
    case 'shortcuts':
      return <ShortcutsDialog vm={vm} />;
  }
}

/** 模态对话框（点遮罩空白处关闭）。 */
export function BoardDialog({ vm, current }: PartProps & { readonly current: DialogState }): ReactNode {
  return (
    <div className='rxb-dialog-backdrop' onMouseDown={vm.dialog.onBackdropMousedown} data-testid='dialog-backdrop'>
      <DialogContent vm={vm} current={current} />
    </div>
  );
}
