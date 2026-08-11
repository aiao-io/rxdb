import { NgClass } from '@angular/common';
import { Component, Injectable, type OnDestroy, signal } from '@angular/core';

export interface Toast {
  id: number;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

/**
 * Toast 服务 - 管理通知消息
 */
@Injectable({ providedIn: 'root' })
export class ToastService implements OnDestroy {
  private nextId = 0;
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();
  readonly toasts = signal<Toast[]>([]);

  show(message: string, type: Toast['type'] = 'info', duration = 3000): void {
    const id = this.nextId++;
    const toast: Toast = { id, message, type };

    this.toasts.update(list => [...list, toast]);

    if (duration > 0) {
      this.timers.set(
        id,
        setTimeout(() => this.dismiss(id), duration)
      );
    }
  }

  dismiss(id: number): void {
    const timer = this.timers.get(id);
    if (timer) clearTimeout(timer);
    this.timers.delete(id);
    this.toasts.update(list => list.filter(t => t.id !== id));
  }

  ngOnDestroy(): void {
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();
  }

  info(message: string): void {
    this.show(message, 'info');
  }

  success(message: string): void {
    this.show(message, 'success');
  }

  warning(message: string): void {
    this.show(message, 'warning');
  }

  error(message: string): void {
    this.show(message, 'error', 5000);
  }
}

/**
 * Toast 通知组件
 */
@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [NgClass],
  template: `
    <div class="toast toast-end toast-bottom z-50">
      @for (toast of toastService.toasts(); track toast.id) {
        <div
          class="alert"
          [ngClass]="{
            'alert-info': toast.type === 'info',
            'alert-success': toast.type === 'success',
            'alert-warning': toast.type === 'warning',
            'alert-error': toast.type === 'error'
          }"
        >
          <span>{{ toast.message }}</span>
          <button class="btn btn-ghost btn-xs" (click)="toastService.dismiss(toast.id)">✕</button>
        </div>
      }
    </div>
  `
})
export class ToastComponent {
  constructor(public readonly toastService: ToastService) {}
}
