import { labelTextColor } from '@aiao/rxdb-plugin-board';
import type { ReactNode } from 'react';

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
            {status === '已保存' ?
              <button
                className='rxb-link-button'
                disabled={core.writeLocked || core.board.undoCount === 0}
                onClick={() => void header.undo()}
                data-testid='detail-undo'
              >
                撤销
              </button>
            : null}
          </>
        : null}
      </span>
      <button
        className='rxb-btn rxb-btn-icon rxb-btn-invisible'
        onClick={detail.closeDetail}
        aria-label='关闭详情'
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
    <aside className='rxb-panel-fields' aria-label='字段'>
      <div className='rxb-field'>
        <span className='rxb-field-label'>所在列</span>
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
        <span className='rxb-field-label'>标签</span>
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
          : <span className='rxb-placeholder'>无标签</span>}
        </button>
      </div>
      <div className='rxb-field'>
        <label className='rxb-field-label' htmlFor={ids.detailDue}>
          截止日
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
              aria-label='清除截止日'
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
          删除任务
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
      aria-label={`任务详情：${detail.detailTitle}`}
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
          aria-label='标题'
          data-testid='detail-title'
        />
      </div>
      <div className='rxb-panel-body'>
        <section className='rxb-panel-main'>
          <label className='rxb-panel-section-title' htmlFor={core.ids.detailDescription}>
            描述
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
            placeholder='补充背景、验收标准或链接…'
          />
          <p className='rxb-hint'>失焦或 ⌘Enter 保存，Esc 还原；每次保存都可撤销。</p>
        </section>
        <DetailFields vm={vm} />
      </div>
    </section>
  );
}
