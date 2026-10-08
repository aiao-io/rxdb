import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LucideDynamicIcon, LucideX as X } from '@lucide/angular';

/**
 * 树页面（菜单 / 文件管理器）的写入失败提示条。
 *
 * @remarks
 * 承接新建、重命名、批量添加、删除、级联删除、删除并提升子节点的失败文案；
 * 不自动消失，由用户点关闭按钮（`closed`）清空。`message` 为空时不渲染。
 */
@Component({
  selector: 'app-tree-write-error',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideDynamicIcon],
  template: `
    @if (message(); as text) {
      <div class="alert alert-error" data-testid="tree-write-error" role="alert">
        <span class="flex-1 text-sm">{{ text }}</span>
        <button class="btn btn-ghost btn-sm btn-circle" (click)="closed.emit()" aria-label="关闭错误提示" type="button">
          <svg [lucideIcon]="X" [size]="16" />
        </button>
      </div>
    }
  `
})
export class TreeWriteError {
  protected readonly X = X;

  /** 要显示的错误文案；`null` 表示没有错误。 */
  readonly message = input<string | null>(null);
  /** 用户点击关闭按钮。 */
  readonly closed = output<void>();
}
