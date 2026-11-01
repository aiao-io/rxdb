'use client';

import {
  BoardShellController,
  focusModalTab,
  type BoardShellConfirm,
  type BoardShellOptions,
  type BoardShellState
} from '@aiao/rxdb-plugin-board';
import { useEffect, useId, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from 'react';
import './board-view.css';

import { BoardView } from './board-view.js';

/** {@link BoardShell} 的属性。 */
export interface BoardShellProps {
  /**
   * 宿主配置：实例工厂、本地适配器名、可选的演示数据。传稳定引用（模块级常量或 `useMemo`）——
   * 引用变化会重建外壳并断开当前看板。Angular 绑定的同名输入为 `options`。
   */
  readonly options: BoardShellOptions;
}

interface ShellPartProps {
  readonly state: BoardShellState;
  readonly controller: BoardShellController;
  readonly onRestoreFile: (event: ChangeEvent<HTMLInputElement>) => void;
}

/** 启动选择：选择前不连接、不建表、不装种子（US-537）。 */
function ShellStartup({ state, controller, onRestoreFile }: ShellPartProps): ReactNode {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <section className='rxb-shell-startup' aria-label='选择如何开始' data-testid='startup-page'>
      <div className='rxb-shell-card'>
        <p className='rxb-shell-eyebrow'>RxDB 本地优先看板</p>
        <h1 className='rxb-shell-heading'>任务看板</h1>
        <p className='rxb-shell-hint'>选择如何开始；选择前不会连接或创建任何数据。</p>
        <div className='rxb-shell-options'>
          <button
            className='rxb-shell-option'
            type='button'
            onClick={() => void controller.startEmpty()}
            data-testid='start-empty'
          >
            <strong>新建空看板</strong>
            <span>从零开始建板、建列、建任务</span>
          </button>
          {state.canSeed ?
            <button
              className='rxb-shell-option'
              type='button'
              onClick={() => void controller.startSeed()}
              data-testid='start-seed'
            >
              <strong>装载演示数据</strong>
              <span>在新库里装一份演示看板，体验拖拽、筛选、键盘与撤销</span>
            </button>
          : null}
          <button
            className='rxb-shell-option'
            type='button'
            onClick={() => fileRef.current?.click()}
            data-testid='start-restore'
          >
            <strong>从备份恢复</strong>
            <span>选择 .rxdb 备份文件，恢复到新库后打开</span>
          </button>
          <input
            ref={fileRef}
            type='file'
            accept='.rxdb'
            hidden
            aria-label='选择备份文件'
            onChange={onRestoreFile}
            data-testid='restore-file'
          />
        </div>
        {state.error ?
          <p className='rxb-shell-error' role='alert' data-testid='app-error'>
            {state.error}
          </p>
        : null}
      </div>
    </section>
  );
}

/** 看板阶段：工具栏（重置为演示数据 / 从备份恢复）+ 失败提示 + 看板视图。 */
function ShellBoard({ state, controller, onRestoreFile }: ShellPartProps): ReactNode {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className='rxb-shell-board'>
      <header className='rxb-shell-bar' data-testid='board-tools'>
        <span className='rxb-shell-brand'>任务看板</span>
        <span className='rxb-shell-spacer' />
        {state.canSeed ?
          <button
            className='rxb-btn rxb-btn-sm'
            type='button'
            onClick={() => void controller.resetDemo()}
            data-testid='reset-demo'
          >
            重置为演示数据
          </button>
        : null}
        <button
          className='rxb-btn rxb-btn-sm'
          type='button'
          onClick={() => fileRef.current?.click()}
          data-testid='restore-open'
        >
          从备份恢复…
        </button>
        <input
          ref={fileRef}
          type='file'
          accept='.rxdb'
          hidden
          aria-label='选择备份文件'
          onChange={onRestoreFile}
          data-testid='restore-file-menu'
        />
      </header>
      {state.error ?
        <p className='rxb-shell-error' role='alert' data-testid='app-error'>
          {state.error}
        </p>
      : null}
      {state.rxdb ?
        // 换库即换视图实例：useBoard 只认挂载时的那个实例
        <BoardView
          key={state.rxdb.config.dbName}
          rxdb={state.rxdb}
          onExportBackup={() => controller.downloadBackup()}
        />
      : null}
    </div>
  );
}

interface ShellConfirmProps {
  readonly confirm: BoardShellConfirm;
  readonly titleId: string;
  readonly onSettle: (confirmed: boolean) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
}

/** 应用内确认（重置 / 恢复）：不用浏览器原生弹窗。 */
function ShellConfirm({ confirm, titleId, onSettle, onKeyDown }: ShellConfirmProps): ReactNode {
  return (
    <div className='rxb-dialog-backdrop' onKeyDown={onKeyDown}>
      <div
        className='rxb-dialog'
        role='alertdialog'
        aria-modal='true'
        aria-labelledby={titleId}
        data-testid='host-confirm'
      >
        <div className='rxb-dialog-header'>
          <h2 className='rxb-dialog-title' id={titleId}>
            {confirm.title}
          </h2>
        </div>
        <div className='rxb-dialog-body'>
          <p>{confirm.message}</p>
        </div>
        <div className='rxb-dialog-footer'>
          <button className='rxb-btn' type='button' onClick={() => onSettle(false)} data-testid='host-confirm-no'>
            取消
          </button>
          <button
            className='rxb-btn rxb-btn-primary'
            type='button'
            onClick={() => onSettle(true)}
            data-testid='host-confirm-yes'
          >
            {confirm.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 看板外壳（US-537 / US-539 AC#4 / #5）：启动选择（新建空看板 / 装载演示数据 / 从备份恢复）、
 * 准备中与恢复中、工具栏（重置为演示数据 / 从备份恢复）与应用内确认，看板阶段嵌入 {@link BoardView}。
 *
 * @remarks
 * 编排全部在核心包 `BoardShellController`（活动位置、恢复到新库名后整页重载读回、跨页面恢复中与切库重载），
 * 组件只渲染其状态并转发用户动作。与 Angular 的 `BoardShellComponent`、Vue 的 `BoardShell` 同功能同 DOM 契约
 * （类名 + data-testid）。样式随 `./board-view.css` 子路径交付，消费端在入口引入。
 */
export function BoardShell({ options }: BoardShellProps): ReactNode {
  const [controller, setController] = useState<BoardShellController | null>(null);
  const [state, setState] = useState<BoardShellState | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const created = new BoardShellController(options);
    const subscription = created.state$.subscribe(setState);
    setController(created);
    void created.start();
    return () => {
      subscription.unsubscribe();
      void created.destroy().catch((cause: unknown) => console.error('[board-shell] 断开看板失败', cause));
    };
  }, [options]);

  // 确认框打开聚焦「取消」（破坏性操作默认不确认），关闭后焦点回到触发入口
  const confirmOpen = (state?.confirm ?? null) !== null;
  useEffect(() => {
    if (!confirmOpen) return;
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    rootRef.current?.querySelector<HTMLElement>('[data-testid="host-confirm-no"]')?.focus();
    return () => {
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, [confirmOpen]);

  if (controller === null || state === null) return null;

  const onRestoreFile = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    void controller.restoreFromFile(file);
  };
  /** 确认对话框的键盘：Esc 取消；Tab 不离开对话框（WAI-ARIA 模态对话框）。 */
  const onConfirmKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      controller.settleConfirm(false);
      return;
    }
    if (event.key === 'Tab' && rootRef.current && focusModalTab(rootRef.current, event.shiftKey))
      event.preventDefault();
  };
  const parts = { state, controller, onRestoreFile };

  return (
    <div className='rxb rxb-shell' ref={rootRef} data-testid='board-shell'>
      {state.phase === 'startup' ?
        <ShellStartup {...parts} />
      : null}
      {state.phase === 'loading' ?
        <p className='rxb-shell-status' role='status' data-testid='loading-page'>
          正在准备看板数据…
        </p>
      : null}
      {state.phase === 'restoring' ?
        <p className='rxb-shell-status' role='status' data-testid='restoring-page'>
          {state.restore.state === 'switching' ? '正在打开恢复的看板…' : '恢复中：全部写入口已暂停。'}
        </p>
      : null}
      {state.phase === 'board' ?
        <ShellBoard {...parts} />
      : null}
      {state.confirm ?
        <ShellConfirm
          confirm={state.confirm}
          titleId={titleId}
          onSettle={confirmed => controller.settleConfirm(confirmed)}
          onKeyDown={onConfirmKeyDown}
        />
      : null}
    </div>
  );
}
