'use client';

import type { ReactNode } from 'react';
import './board-view.css';

import type { useBoard } from './use-board.js';
import { BoardColumns, EmptyBoard } from './view/board-columns.js';
import { BoardDialog } from './view/board-dialogs.js';
import { BoardHeader, BoardToolbar } from './view/board-header.js';
import { BoardPopover } from './view/board-popover.js';
import { DetailPanel } from './view/detail-panel.js';
import type { BoardViewModel } from './view/model.js';
import { useBoardViewModel } from './view/use-board-view-model.js';

/** {@link BoardView} 的属性。 */
export interface BoardViewProps {
  /** 已连接的看板 RxDB 实例（实体含 board 命名空间五实体，需历史插件）。 */
  readonly rxdb: Parameters<typeof useBoard>[0];
  /** 备份导出回调（US-537 编排由宿主接线；缺省展示占位提示）。 */
  readonly onExportBackup?: () => void | Promise<void>;
}

/** 读取状态、恢复中与操作失败的提示横幅。 */
function BoardBanners({ vm }: { readonly vm: BoardViewModel }): ReactNode {
  const { board, notice } = vm.core;
  return (
    <>
      {board.loading ?
        <p className='rxb-banner' data-testid='board-loading' role='status'>
          <span>正在读取看板数据…</span>
        </p>
      : board.readError ?
        <p className='rxb-banner rxb-banner-danger' data-testid='board-read-error' role='alert'>
          <span>读取看板数据失败：{board.readError}</span>
          <button className='rxb-btn rxb-btn-sm' onClick={board.retryReads} data-testid='board-read-retry'>
            重试
          </button>
        </p>
      : null}
      {board.restoring ?
        <p className='rxb-banner rxb-banner-attention' data-testid='restoring-note'>
          <span>恢复进行中：浏览可用，写入口已暂停。</span>
        </p>
      : null}
      {notice ?
        <p className='rxb-banner rxb-banner-danger' data-testid='board-notice' role='alert'>
          <span>{notice}</span>
          {/* 关提示不抢焦点：正在编辑的字段失焦会把刚被拒的草稿再提交一次 */}
          <button
            className='rxb-btn rxb-btn-sm rxb-btn-icon rxb-btn-invisible'
            onMouseDown={event => event.preventDefault()}
            onClick={() => vm.core.setNotice(null)}
            aria-label='关闭提示'
            data-testid='board-notice-close'
          >
            <span className='rxb-i rxb-i-close' aria-hidden='true' />
          </button>
        </p>
      : null}
    </>
  );
}

/** 操作提示：移动 / 删除 / 排序后出现，带「撤销」，6 秒消失。 */
function BoardToast({ vm }: { readonly vm: BoardViewModel }): ReactNode {
  const { core, header } = vm;
  const toast = core.toast;
  if (toast === null) return null;
  return (
    <div className='rxb-toast' aria-live='polite' data-testid='board-toast' role='status'>
      <span>{toast.message}</span>
      {toast.undoable ?
        <button
          className='rxb-btn rxb-btn-sm rxb-toast-undo'
          disabled={core.writeLocked || core.board.undoCount === 0}
          onClick={() => void header.undoFromToast()}
          data-testid='board-toast-undo'
        >
          撤销
        </button>
      : null}
      <button
        className='rxb-btn rxb-btn-sm rxb-btn-icon'
        onClick={() => core.setToast(null)}
        aria-label='关闭提示'
        data-testid='board-toast-close'
      >
        <span className='rxb-i rxb-i-close' aria-hidden='true' />
      </button>
    </div>
  );
}

/**
 * 看板视图组件（看板 v2，GitHub Projects 风格）：页头 + 筛选条 + 列 / 卡片 + 叠加详情侧栏 +
 * 根层菜单 / 选择器 + 模态对话框 + 带撤销的操作提示。
 *
 * @remarks
 * 动作收进上下文菜单、就地编辑即改即存（每次改动一个可撤销事务）、一个选择器与一套筛选语法走天下。
 * 三端只采集指针 / 键盘事件，落点、键盘目标、筛选与弹层定位都调用核心包同一份纯函数；
 * 全部写入口经 {@link useBoard} 的领域动作（恢复中写门禁与校验在服务层复核，不靠隐藏按钮）。
 * 样式来自 `@aiao/rxdb-plugin-board/board.css`（本包 `./board-view.css` 子路径已内联），
 * DOM 契约（类名 + data-testid）与 Angular / Vue 绑定同构。
 */
export function BoardView({ rxdb, onExportBackup }: BoardViewProps): ReactNode {
  const vm = useBoardViewModel(rxdb, onExportBackup);
  const { core, drag, popover, detail, dialog } = vm;
  const { board } = core;
  return (
    <section
      className={dialog.dialog === null && detail.detailTaskId === null ? 'rxb' : 'rxb has-overlay'}
      ref={core.areaRef}
      onDragEnd={drag.clearDragFeedback}
      onDragOver={drag.onTaskDragOver}
      onDrop={event => void drag.onColumnDrop(event)}
      data-testid='board-view'
    >
      <BoardHeader vm={vm} />
      {board.currentBoard ?
        <BoardToolbar vm={vm} />
      : null}
      <BoardBanners vm={vm} />
      {board.currentBoard ?
        <BoardColumns vm={vm} />
      : !board.loading && board.readError === null ?
        <EmptyBoard vm={vm} />
      : null}
      {detail.detailTaskId === null ? null : <DetailPanel vm={vm} />}
      {popover.popover === null ? null : <BoardPopover vm={vm} pop={popover.popover} />}
      {dialog.dialog === null ? null : <BoardDialog vm={vm} current={dialog.dialog} />}
      <BoardToast vm={vm} />
    </section>
  );
}
