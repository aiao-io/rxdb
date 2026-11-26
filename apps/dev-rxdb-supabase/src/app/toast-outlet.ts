import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LucideDynamicIcon, LucideX as X } from '@lucide/angular';
import { type Toast, type ToastKind, Toasts } from './toasts';

const KIND_CLASSES: Record<ToastKind, string> = {
  success: 'alert-success',
  info: 'alert-info',
  warning: 'alert-warning',
  error: 'alert-error'
};

/**
 * 消息（toast）的槽位：右下角，盖在页面与右侧面板之上
 *
 * @remarks
 * 播报区域一直挂着、新消息加进去才会被读屏读到；错误另外带 `role="alert"`，立刻打断播报。
 */
@Component({
  selector: 'app-toast-outlet',
  imports: [LucideDynamicIcon],
  template: `
    <div
      class="pointer-events-none fixed right-4 bottom-4 z-[70] flex w-[min(24rem,calc(100%-2rem))] flex-col gap-2"
      aria-label="消息"
      aria-live="polite"
      data-testid="toasts"
      role="region"
    >
      @for (toast of toasts.list(); track toast.id) {
        <div
          class="alert alert-soft pointer-events-auto py-2 text-sm shadow-lg"
          [attr.data-kind]="toast.kind"
          [attr.data-source]="toast.source ?? null"
          [attr.role]="toast.kind === 'error' ? 'alert' : null"
          [class]="kindClass(toast)"
          data-testid="toast"
        >
          <span class="min-w-0 break-words">{{ toast.message }}</span>
          <span class="flex items-center gap-1">
            @if (toast.action; as action) {
              <button class="btn btn-xs" (click)="runAction(toast)" data-testid="toast-action" type="button">
                {{ action.label }}
              </button>
            }
            <button
              class="btn btn-ghost btn-xs btn-circle"
              (click)="toasts.dismiss(toast.id)"
              aria-label="关掉这条消息"
              type="button"
            >
              <svg [lucideIcon]="X" size="14"></svg>
            </button>
          </span>
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ToastOutlet {
  readonly toasts = inject(Toasts);
  readonly X = X;

  kindClass(toast: Toast): string {
    return KIND_CLASSES[toast.kind];
  }

  runAction(toast: Toast): void {
    toast.action?.run();
    this.toasts.dismiss(toast.id);
  }
}
