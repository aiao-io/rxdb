import { RxDB } from '@aiao/rxdb';
import type { WorktreeView } from '@aiao/rxdb-plugin-working-tree';
import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, Injector, input, output, signal } from '@angular/core';
import { LucideEye as Eye, LucideDynamicIcon } from '@lucide/angular';
import { readOnlyCatalog } from '../working-tree.read-only-checkout';
import { WorkingTreeDialogShellComponent } from './dialog-shell.component';
import { WorkingTreeReadOnlyEntityPaneComponent } from './read-only-entity-pane.component';

/** 只读检出位查看器的状态；页面持有，本组件只做展示。 */
export interface ReadOnlyViewerState {
  readonly view: WorktreeView;
  /** 横幅里的检出目标，见 `readOnlyTargetLabel` */
  readonly label: string;
}

/**
 * 只读检出位查看器（US-313）：不切换分支，以只读方式浏览另一条分支或一个提交的完整数据。
 *
 * @remarks
 * 视图的 `rxdb` 是第二个只读实例，经右栏的注入器（`{ provide: RxDB }`）交给里面的实体列表，照常查询；
 * 只读实例上列表不出新建、编辑与删除。左栏只列复制进快照的实体，主实例上不记变更日志的标「不随版本」：
 * 它们在快照里是此刻的内容，不随检出的分支或提交。
 */
@Component({
  selector: 'app-working-tree-read-only-viewer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideDynamicIcon, NgComponentOutlet, WorkingTreeDialogShellComponent],
  template: `
    @if (viewer(); as viewer) {
      <app-working-tree-dialog-shell
        (closeRequested)="closeRequested.emit()"
        labelledBy="wt-readonly-title"
        size="wide"
        testId="wt-readonly-dialog"
      >
        <div class="mb-3 flex items-center gap-2">
          <svg class="text-[var(--gd-accent)]" [lucideIcon]="Eye" aria-hidden="true" size="18"></svg>
          <h2 class="text-[15px] font-semibold" id="wt-readonly-title">Read-only checkout</h2>
        </div>

        <div class="gd-warn-strip mb-3" data-testid="wt-readonly-banner" role="status">
          Viewing <span class="font-mono">{{ viewer.label }}</span> read-only, as it was when opened. Creating, editing
          and deleting are disabled.
        </div>

        <div class="flex h-[60dvh] min-h-0 gap-3 max-md:flex-col">
          <nav
            class="w-52 shrink-0 overflow-y-auto rounded border border-[var(--gd-border)] max-md:h-32 max-md:w-full"
            aria-label="Entities in this checkout"
            data-testid="wt-readonly-catalog"
          >
            <ul class="py-1">
              @for (entry of catalog(); track entry.key) {
                <li>
                  <button
                    class="gd-row flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm"
                    [attr.aria-current]="entry.key === selected()?.key ? 'true' : null"
                    [attr.data-entity-key]="entry.key"
                    [class.gd-row-selected]="entry.key === selected()?.key"
                    (click)="selectedKey.set(entry.key)"
                    data-testid="wt-readonly-entity"
                    type="button"
                  >
                    <span class="min-w-0 flex-1 truncate">{{ entry.displayName }}</span>
                    @if (entry.unversioned) {
                      <span
                        class="badge badge-ghost badge-xs shrink-0"
                        data-testid="wt-readonly-unversioned"
                        title="Shows the current content, not the version being viewed"
                      >
                        不随版本
                      </span>
                    }
                  </button>
                </li>
              }
            </ul>
          </nav>

          <div class="min-h-0 min-w-0 flex-1" data-testid="wt-readonly-list">
            @if (selected()) {
              <ng-container *ngComponentOutlet="pane; inputs: paneInputs(); injector: paneInjector()" />
            }
          </div>
        </div>

        <div class="mt-4 flex justify-end gap-2">
          <button
            class="gd-btn-secondary"
            [disabled]="refreshing()"
            (click)="refreshRequested.emit()"
            data-testid="wt-readonly-refresh"
            type="button"
          >
            {{ refreshing() ? 'Refreshing…' : 'Refresh' }}
          </button>
          <button
            class="gd-btn-secondary"
            (click)="closeRequested.emit()"
            data-testid="wt-readonly-close"
            type="button"
          >
            Close
          </button>
        </div>
      </app-working-tree-dialog-shell>
    }
  `
})
export class WorkingTreeReadOnlyViewerComponent {
  readonly #injector = inject(Injector);

  readonly viewer = input<ReadOnlyViewerState | null>(null);
  /** 主实例：「不随版本」按它的实体元数据判 */
  readonly mainRxdb = input.required<RxDB>();
  /** 正在刷新：按钮置灰，连点不会叠出第二个检出位 */
  readonly refreshing = input(false);

  readonly refreshRequested = output<void>();
  readonly closeRequested = output<void>();

  readonly Eye = Eye;
  readonly pane = WorkingTreeReadOnlyEntityPaneComponent;

  readonly catalog = computed(() => {
    const viewer = this.viewer();
    return viewer === null ? [] : readOnlyCatalog(viewer.view.rxdb.config.entities, this.mainRxdb().config.entities);
  });
  /** 刷新换了视图也留着选中的实体：快照的实体集合跟主实例走，刷新前后是同一份 */
  readonly selectedKey = signal<string | null>(null);
  readonly selected = computed(
    () => this.catalog().find(entry => entry.key === this.selectedKey()) ?? this.catalog()[0]
  );
  readonly paneInputs = computed(() => {
    const entry = this.selected();
    return entry === undefined ? {} : { namespace: entry.namespace, name: entry.name };
  });
  /**
   * 右栏的注入器：`RxDB` 指向视图的只读实例。刷新换了视图就换一个注入器，`NgComponentOutlet` 随之重建右栏，
   * 旧实例上的订阅退场。右栏只在有视图时渲染，没有视图时这里不会被读到。
   */
  readonly paneInjector = computed(() => {
    const viewer = this.viewer();
    if (viewer === null) return this.#injector;
    return Injector.create({ providers: [{ provide: RxDB, useValue: viewer.view.rxdb }], parent: this.#injector });
  });
}
