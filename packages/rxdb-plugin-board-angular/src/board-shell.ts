import {
  BoardShellController,
  focusModalTab,
  type BoardShellOptions,
  type BoardShellState
} from '@aiao/rxdb-plugin-board';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  OnDestroy,
  OnInit,
  signal,
  viewChild
} from '@angular/core';
import { Subscription } from 'rxjs';

import { BoardViewComponent } from './board-view.js';

let shellCounter = 0;

/**
 * 看板外壳组件（`<board-shell>`，US-537 / US-539 AC#4 / #5）：启动选择（新建空看板 / 装载演示数据 / 从备份恢复）、
 * 准备中与恢复中、工具栏（重置为演示数据 / 从备份恢复）与应用内确认，看板阶段嵌入 {@link BoardViewComponent}。
 *
 * @remarks
 * 编排全部在核心包 `BoardShellController`（活动位置、恢复到新库名后整页重载读回、跨页面恢复中与切库重载），
 * 组件只渲染其状态并转发用户动作。与 React / Vue 的 `BoardShell` 同功能同 DOM 契约（类名 + data-testid）。
 * `options` 只在初始化时读取一次；样式随 `./board-view.css` 子路径交付。
 */
@Component({
  selector: 'board-shell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BoardViewComponent],
  templateUrl: './board-shell.html'
})
export class BoardShellComponent implements OnInit, OnDestroy {
  private readonly shellRoot = viewChild<ElementRef<HTMLElement>>('shellRoot');
  private readonly subs = new Subscription();
  private controller: BoardShellController | null = null;
  private returnFocus: HTMLElement | null = null;

  private get shell(): BoardShellController {
    if (this.controller === null) throw new Error('board-shell 尚未初始化');
    return this.controller;
  }

  protected readonly state = signal<BoardShellState | null>(null);
  protected readonly confirmTitleId = `rxb-shell-${++shellCounter}-confirm-title`;

  /** 宿主配置：实例工厂、本地适配器名、可选的演示数据（初始化时读取一次）。 */
  readonly options = input.required<BoardShellOptions>();

  ngOnInit(): void {
    const controller = new BoardShellController(this.options());
    this.controller = controller;
    this.subs.add(
      controller.state$.subscribe(next => {
        const previous = this.state()?.confirm ?? null;
        const opened = next.confirm !== null && previous === null;
        const closed = next.confirm === null && previous !== null;
        this.state.set(next);
        if (opened) this.focusConfirm();
        if (closed) this.restoreFocus();
      })
    );
    void controller.start();
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    void this.controller?.destroy().catch((cause: unknown) => console.error('[board-shell] 断开看板失败', cause));
  }

  /** 看板视图的导出回调：归档完整生成后才交给浏览器下载。 */
  protected readonly downloadBackup = (): Promise<void> => this.shell.downloadBackup();

  protected startEmpty(): void {
    void this.shell.startEmpty();
  }

  protected startSeed(): void {
    void this.shell.startSeed();
  }

  protected resetDemo(): void {
    void this.shell.resetDemo();
  }

  protected onRestoreFile(event: Event): void {
    const fileInput = event.target as HTMLInputElement;
    const file = fileInput.files?.[0];
    if (!file) return;
    fileInput.value = '';
    void this.shell.restoreFromFile(file);
  }

  protected settleConfirm(confirmed: boolean): void {
    this.shell.settleConfirm(confirmed);
  }

  /** 确认对话框的键盘：Esc 取消；Tab 不离开对话框（WAI-ARIA 模态对话框）。 */
  protected onConfirmKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.settleConfirm(false);
      return;
    }
    const root = this.shellRoot()?.nativeElement;
    if (event.key === 'Tab' && root !== undefined && focusModalTab(root, event.shiftKey)) event.preventDefault();
  }

  /** 打开时聚焦「取消」（破坏性操作默认不确认），关闭后焦点回到触发入口。 */
  private focusConfirm(): void {
    this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    requestAnimationFrame(() =>
      this.shellRoot()?.nativeElement.querySelector<HTMLElement>('[data-testid="host-confirm-no"]')?.focus()
    );
  }

  private restoreFocus(): void {
    const target = this.returnFocus;
    this.returnFocus = null;
    if (target?.isConnected) target.focus();
  }
}
