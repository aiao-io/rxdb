import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { LucideAngularModule, MessageSquare, X } from 'lucide-angular';
import { AiDrawerService } from './ai-drawer.service';

/**
 * 全局 AI 抽屉组件
 *
 * 右侧抽屉容器，宽度 400px 可拖拽调整（min 320px / max 600px）。
 * 移动端 ≤768px 时全屏覆盖。
 *
 * 由 layout 的 `@defer (when aiDrawer.isOpen(); prefetch on idle)` 延迟加载：
 * 空闲时预取 chunk，真正实例化推迟到用户点开抽屉。原先写的 `on idle` 把两件事
 * 绑死了——主线程繁忙导致 `requestIdleCallback` 迟迟不触发时，用户点了也没有抽屉，
 * 而这个组件恰恰是**点了才需要**的。拆开后加载时机不变，且不再依赖 idle 一定会来。
 */
@Component({
  selector: 'aiao-ai-drawer',
  imports: [NgTemplateOutlet, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (drawer.isOpen()) {
      <!-- 移动端遮罩 -->
      <div
        class="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm md:hidden"
        [attr.aria-label]="translations.aiDrawer_close()"
        (click)="drawer.close()"
        (keydown.escape)="drawer.close()"
        role="button"
        tabindex="-1"
      ></div>

      <!-- 抽屉面板 -->
      <div
        class="bg-base-100 border-base-300 fixed top-0 right-0 z-9 flex h-full flex-col border-l shadow-xl max-md:top-0 max-md:z-50 max-md:h-full"
        [style.width.px]="isDesktop() ? drawer.drawerWidth() : undefined"
      >
        <!-- 拖拽手柄 -->
        <div
          class="hover:bg-primary/30 absolute top-0 left-0 h-full w-1 cursor-col-resize max-md:hidden"
          (mousedown)="onResizeStart($event)"
        ></div>

        <!-- 头部 -->
        <div class="border-base-300 flex items-center justify-between border-b px-4 py-2">
          <div class="flex items-center gap-2">
            <lucide-icon [img]="MessageSquare" size="16"></lucide-icon>
            <span class="text-sm font-medium">{{ translations.aiDrawer_title() }}</span>
          </div>
          <button class="btn btn-ghost btn-xs btn-circle" (click)="drawer.close()">
            <lucide-icon [img]="X" size="14"></lucide-icon>
          </button>
        </div>

        <!-- 内容区 -->
        <div class="min-h-0 flex-1 overflow-auto">
          @if (drawer.hasContent()) {
            <ng-container [ngTemplateOutlet]="drawer.contentTemplate()!"></ng-container>
          }
        </div>
      </div>
    }
  `,
  host: {
    class: 'ai-drawer-host'
  }
})
export class AiDrawerComponent {
  readonly #isDesktop = signal(typeof window !== 'undefined' ? window.innerWidth > 768 : true);
  readonly #destroyRef = inject(DestroyRef);
  #activeResizeCleanup: (() => void) | null = null;

  protected readonly drawer = inject(AiDrawerService);
  protected readonly translations = { aiDrawer_close: () => '关闭 AI 面板', aiDrawer_title: () => 'AI 助手' };
  protected readonly MessageSquare = MessageSquare;
  protected readonly X = X;

  readonly isDesktop = this.#isDesktop.asReadonly();

  constructor() {
    this.#destroyRef.onDestroy(() => {
      this.#activeResizeCleanup?.();
    });
  }

  onResizeStart(e: MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = this.drawer.drawerWidth();

    const onMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX;
      const newWidth = Math.min(600, Math.max(320, startWidth + delta));
      this.drawer.drawerWidth.set(newWidth);
    };

    const cleanup = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      this.#activeResizeCleanup = null;
    };

    const onUp = () => cleanup();

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    this.#activeResizeCleanup = cleanup;
  }
}
