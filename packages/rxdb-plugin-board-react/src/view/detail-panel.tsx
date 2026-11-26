import { labelTextColor } from '@aiao/rxdb-plugin-board';
import type { ReactNode } from 'react';

import { boardT } from '../board-i18n.js';
import type { BoardViewModel } from './model.js';

interface PartProps {
  readonly vm: BoardViewModel;
}

/** 侧栏头：所在列 · 保存状态（「已保存」旁可撤销）+ 关闭。 */
function DetailHeader({ vm }: PartProps): ReactNode {
  const { core, data, detail, header } = vm;
  const status = detail.detailStatus;
  return (
    <div className='rxb-panel-header'>
      <span className='rxb-panel-kicker'>
        {data.columnTitleOf(detail.detailBase?.columnId ?? null)}
        {status ?
          <>
            {' · '}
            <span className='rxb-panel-status' aria-live='polite' data-testid='detail-status'>
              {status}
            </span>
            {status === boardT('view.detail.statusSaved') ?
              <button
                className='rxb-link-button'
                disabled={core.writeLocked || core.board.undoCount === 0}
                onClick={() => void header.undo()}
                data-testid='detail-undo'
              >
                {boardT('view.undo.label')}
              </button>
            : null}
          </>
        : null}
      </span>
      <button
        className='rxb-btn rxb-btn-icon rxb-btn-invisible'
        onClick={detail.closeDetail}
        aria-label={boardT('view.detail.close')}
        data-testid='detail-close'
      >
        <span className='rxb-i rxb-i-close' aria-hidden='true' />
      </button>
    </div>
  );
}

/** 字段栏：所在列 / 标签（选择器）/ 截止日 / 删除。 */
function DetailFields({ vm }: PartProps): ReactNode {
  const { core, data, detail, popover } = vm;
  const { writeLocked, ids } = core;
  return (
    <aside className='rxb-panel-fields' aria-label={boardT('view.detail.fields')}>
      <div className='rxb-field'>
        <span className='rxb-field-label'>{boardT('view.detail.column')}</span>
        <button
          className='rxb-field-value'
          aria-expanded={popover.popover?.kind === 'detail-column-picker'}
          disabled={writeLocked}
          onClick={detail.openDetailColumnPicker}
          aria-haspopup='listbox'
          data-testid='detail-column'
        >
          {data.columnTitleOf(detail.detailBase?.columnId ?? null)}
          <span className='rxb-i rxb-i-chevron-down' aria-hidden='true' />
        </button>
      </div>
      <div className='rxb-field'>
        <span className='rxb-field-label'>{boardT('view.detail.labels')}</span>
        <button
          className='rxb-field-value'
          aria-expanded={popover.popover?.kind === 'detail-label-picker'}
          disabled={writeLocked}
          onClick={detail.openDetailLabelPicker}
          aria-haspopup='listbox'
          data-testid='detail-labels'
        >
          {detail.detailLabels.length > 0 ?
            detail.detailLabels.map(label => (
              <span
                key={label.id}
                className='rxb-label'
                style={{ backgroundColor: label.color, color: labelTextColor(label.color) }}
                data-testid='detail-label'
              >
                {label.name}
              </span>
            ))
          : <span className='rxb-placeholder'>{boardT('view.detail.noLabels')}</span>}
        </button>
      </div>
      <div className='rxb-field'>
        <label className='rxb-field-label' htmlFor={ids.detailDue}>
          {boardT('view.detail.due')}
        </label>
        <div className='rxb-field-row'>
          <input
            className='rxb-input'
            disabled={writeLocked}
            id={ids.detailDue}
            value={detail.detailDue}
            onChange={event => detail.onDetailDueChange(event.target.value)}
            data-testid='detail-due'
            type='date'
          />
          {detail.detailBase?.dueDate ?
            <button
              className='rxb-btn rxb-btn-icon rxb-btn-invisible'
              disabled={writeLocked}
              onClick={() => void detail.commitDetailDue('')}
              aria-label={boardT('view.detail.clearDue')}
              data-testid='detail-due-clear'
            >
              <span className='rxb-i rxb-i-close' aria-hidden='true' />
            </button>
          : null}
        </div>
      </div>
      <div className='rxb-panel-actions'>
        <button
          className='rxb-btn rxb-btn-danger'
          disabled={writeLocked}
          onClick={event => void detail.deleteDetailTask(event)}
          data-testid='detail-delete'
        >
          <span className='rxb-i rxb-i-trash' aria-hidden='true' />
          {boardT('common.deleteTask')}
        </button>
      </div>
    </aside>
  );
}

/** 任务详情侧栏：叠加在看板之上，字段即改即存（每次改动一个可撤销事务）。 */
export function DetailPanel({ vm }: PartProps): ReactNode {
  const { core, detail } = vm;
  return (
    <section
      className='rxb-panel'
      aria-label={boardT('view.detail.ariaLabel', { title: detail.detailTitle })}
      data-testid='detail-panel'
      role='dialog'
    >
      <DetailHeader vm={vm} />
      <div className='rxb-panel-title'>
        <input
          className='rxb-input'
          disabled={core.writeLocked}
          value={detail.detailTitle}
          onBlur={() => void detail.commitDetailTitle()}
          onChange={event => detail.setDetailTitle(event.target.value)}
          onKeyDown={detail.onDetailTitleKeydown}
          aria-label={boardT('view.detail.title')}
          data-testid='detail-title'
        />
      </div>
      <div className='rxb-panel-body'>
        <section className='rxb-panel-main'>
          <label className='rxb-panel-section-title' htmlFor={core.ids.detailDescription}>
            {boardT('view.detail.description')}
          </label>
          <textarea
            className='rxb-textarea'
            disabled={core.writeLocked}
            id={core.ids.detailDescription}
            value={detail.detailDescription}
            onBlur={() => void detail.commitDetailDescription()}
            onChange={event => detail.setDetailDescription(event.target.value)}
            onKeyDown={detail.onDetailDescriptionKeydown}
            data-testid='detail-description'
            placeholder={boardT('view.detail.descriptionPlaceholder')}
          />
          <p className='rxb-hint'>{boardT('view.detail.saveHint')}</p>
        </section>
        <DetailFields vm={vm} />
      </div>
    </section>
  );
}
