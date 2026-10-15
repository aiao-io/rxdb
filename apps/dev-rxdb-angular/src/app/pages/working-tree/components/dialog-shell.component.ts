import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  viewChild
} from '@angular/core';

/**
 * 模态对话框外壳：合并与对比两个对话框共用（GitHub Desktop 对话框形态：白面板圆角描边、半透明背板）。
 *
 * @remarks
 * 背板与面板是**兄弟**节点。背板是 `role="button"`（点它关闭），而按钮的子孙不许可聚焦——
 * 背板包着面板就是 axe 的 `nested-interactive` 违规。打开时焦点移进面板，面板里任意处按 Escape 关闭。
 */
@Component({
  selector: 'app-working-tree-dialog-shell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-3">
      <div
        class="absolute inset-0 bg-black/50"
        (click)="closeRequested.emit()"
        (keydown.enter)="closeRequested.emit()"
        (keydown.escape)="closeRequested.emit()"
        aria-label="Close dialog"
        role="button"
        tabindex="0"
      ></div>
      <div
        class="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-md border border-[var(--gd-border)] p-5 shadow-2xl outline-none"
        #panel
        [attr.aria-labelledby]="labelledBy()"
        [attr.data-testid]="testId()"
        [style.background]="'var(--gd-panel)'"
        (keydown.escape)="closeRequested.emit()"
        aria-modal="true"
        role="dialog"
        tabindex="-1"
      >
        <ng-content />
      </div>
    </div>
  `
})
export class WorkingTreeDialogShellComponent {
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');

  /** 面板的 `data-testid` */
  readonly testId = input.required<string>();
  /** 标题元素的 id：对话框的可读名 */
  readonly labelledBy = input.required<string>();

  readonly closeRequested = output<void>();

  constructor() {
    afterNextRender(() => this.panel().nativeElement.focus());
  }
}
