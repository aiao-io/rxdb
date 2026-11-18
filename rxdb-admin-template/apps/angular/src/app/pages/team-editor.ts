import { useRxDB } from '@aiao/rxdb-angular';
import { useI18n } from '@aiao/rxdb-i18n-angular';
import { EntityListComponent } from '@aiao/rxdb-model-angular';
import { ChangeDetectionStrategy, Component, computed, ElementRef, signal, viewChildren } from '@angular/core';
import { entityDisplayName } from '../entities/entity-labels';
import { visibleEntityEntries, type WorkbenchEntityEntry } from '../entities/entity-registry';

/** 页签组的键盘移动：左右方向键首尾相接，Home / End 到首尾；其余按键返回 `undefined`，不处理。 */
function movedPosition(key: string, position: number, count: number): number | undefined {
  if (key === 'ArrowRight') return (position + 1) % count;
  if (key === 'ArrowLeft') return (position + count - 1) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return undefined;
}

/** 已创建的编辑界面个数：先后打开的任务各有一个实例，元素 id 靠它区分。 */
let created = 0;

/**
 * 团队任务编辑界面（ADMIN-US-221 AC#4）：用模型驱动的实体列表编辑任务所在的团队库。
 *
 * @remarks
 * 实体页签与列表都来自团队库（注入器里的 `RxDB`）注册的实体元数据，标签是随语言切换的实体显示名，
 * 组件里不写任何具体实体名；换一套业务实体，这里不需要改。每次保存都由团队库的 working-tree 捕获进任务工作树。
 * 页签遵循 WAI-ARIA 页签模式：只有选中的页签在 Tab 序列里，左右方向键与 Home / End 在页签间移动。
 * 切换实体时按实体重建列表，不把上一个实体的筛选与排序状态带过去。
 *
 * 组件由协作页用 `createComponent` 动态创建，宿主元素就是协作界面的容器里新建的元素：固定高度与纵向排布写在宿主上。
 */
@Component({
  selector: 'app-team-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EntityListComponent],
  host: { 'data-testid': 'team-editor', class: 'flex flex-col', style: 'height: 32rem' },
  template: `
    @if (current(); as entry) {
      <div
        class="tabs tabs-border shrink-0 overflow-x-auto"
        [attr.aria-label]="t('teamEditor.entities')"
        role="tablist"
      >
        @for (item of entries; track item.namespace + '/' + item.name; let index = $index) {
          <button
            class="tab"
            #tab
            [attr.aria-controls]="panelId"
            [attr.aria-selected]="index === position()"
            [id]="tabId(index)"
            [tabindex]="index === position() ? 0 : -1"
            (click)="position.set(index)"
            (keydown)="onKeydown($event, index)"
            role="tab"
            type="button"
          >
            {{ label(item) }}
          </button>
        }
      </div>
      <div class="page-host min-h-0 flex-1" [attr.aria-labelledby]="tabId(position())" [id]="panelId" role="tabpanel">
        <!-- 单元素循环按实体身份跟踪：切换实体就销毁旧列表、重建新列表 -->
        @for (shown of [entry]; track shown.namespace + '/' + shown.name) {
          <rxdb-entity-list [name]="shown.name" [namespace]="shown.namespace" />
        }
      </div>
    } @else {
      <div role="alert">{{ t('entity.none') }}</div>
    }
  `
})
export default class TeamEditor {
  private readonly instance = created++;
  private readonly tabs = viewChildren<ElementRef<HTMLButtonElement>>('tab');
  /** 翻译函数：随工作台语言切换。 */
  readonly t = useI18n().t;
  /** 可见实体条目：来自团队库注册的实体元数据，按命名空间与名称排序。 */
  readonly entries: readonly WorkbenchEntityEntry[] = visibleEntityEntries(useRxDB().config.entities);
  /** 当前选中的页签位置，默认第一项。 */
  readonly position = signal(0);
  /** 当前选中的实体；没有可见实体时为 `undefined`。 */
  readonly current = computed<WorkbenchEntityEntry | undefined>(() => this.entries[this.position()]);
  /** 页签面板的元素 id，页签的 `aria-controls` 指向它。 */
  readonly panelId = `team-editor-${this.instance}-panel`;

  /** 页签的显示名：实体显示名随语言切换。 */
  label(entry: WorkbenchEntityEntry): string {
    return entityDisplayName(entry, this.t);
  }

  /** 第 `index` 个页签的元素 id。 */
  tabId(index: number): string {
    return `team-editor-${this.instance}-tab-${index}`;
  }

  /** 页签上的按键：方向键与 Home / End 移动选中并聚焦目标页签。 */
  onKeydown(event: KeyboardEvent, index: number): void {
    const next = movedPosition(event.key, index, this.entries.length);
    if (next === undefined) return;
    event.preventDefault();
    this.position.set(next);
    this.tabs()[next]?.nativeElement.focus();
  }
}
