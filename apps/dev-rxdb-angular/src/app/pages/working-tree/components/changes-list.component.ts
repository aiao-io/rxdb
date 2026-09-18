import type { WorkingTreeDiff, WorkingTreeDiffEntry, WorkingTreeQueryState } from '@aiao/rxdb-plugin-working-tree';
import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  HostListener,
  input,
  output,
  signal,
  viewChild
} from '@angular/core';
import {
  LucideCheck as Check,
  LucideChevronDown as ChevronDown,
  LucideFileDiff as FileDiff,
  LucideListFilter as ListFilter,
  LucideDynamicIcon,
  LucideSearch as Search
} from '@lucide/angular';
import { diffEntryKey, formatPatchSummary } from '../working-tree.diff-format';
import { gdOpColor, gdOpIcon, gdPathColor } from '../working-tree.gd';

/** 列表行上的一次右键；`event` 给页面定位菜单用。 */
export interface WorkingTreeContextMenuRequest<T> {
  readonly target: T;
  readonly event: MouseEvent;
}

/** 变更类型筛选的四个档位。 */
const KINDS = [
  { value: 'all', label: 'All' },
  { value: 'insert', label: 'Added' },
  { value: 'update', label: 'Modified' },
  { value: 'delete', label: 'Deleted' }
] as const;

/**
 * 「更改」标签页的文件列表，模仿 GitHub Desktop 的 Changes 列表。
 *
 * @remarks
 * 一条实体记录在这里就是一个文件，路径为 `entities/<实体>/<主键>`。
 * 类型筛选和路径/补丁文本筛选只影响列表，不改变待提交内容。
 * 筛选栏是**一个组合盒子**（GitHub Desktop 形态）：左侧漏斗图标按钮打开类型菜单
 * （全部 / 新增 / 修改 / 删除），分隔线右侧是放大镜 + 文本输入。
 *
 * 行是**可选中**的（选中键 = `diffEntryKey`），右栏的详情区跟随选中项——
 * 这正是 GitHub Desktop「左边点文件、右边看 diff」的轴。选中行是 GitHub Desktop
 * 的签名样式：3px 蓝左边条 + 浅蓝底（`.gd-row` / `.gd-row-selected` 见 styles.scss）。
 * 行用 `role="button"` 的 div 而不是 `<button>`：模板里没有嵌套按钮，但保持与
 * 历史列表同一种键盘形态（Enter 选中），让两个列表的 a11y 行为一致。
 *
 * 没有暂存区（v1 硬裁决），所以行上没有 GitHub Desktop 的勾选框——列表只做「看」，
 * 「提交哪些」由提交框那句「提交全部未提交改动」说清。
 */
@Component({
  selector: 'app-working-tree-changes-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, LucideDynamicIcon],
  styles: [
    `
      /* 宿主是 aside 的 flex 子项：默认 display:inline 会让根 div 的 flex-1/min-h-0
         失效，列表一多就把底部提交框挤下去而不是内部滚动 */
      :host {
        display: flex;
        flex-direction: column;
        flex: 1 1 0%;
        min-height: 0;
      }
    `
  ],
  template: `
    <div class="flex min-h-0 flex-1 flex-col">
      <div class="gd-filter-bar">
        <div class="gd-filter-combo">
          <div class="relative flex shrink-0" #kindContainer>
            <button
              class="gd-filter-kind-btn"
              [attr.aria-expanded]="$kindOpen()"
              [title]="'Change type: ' + kindLabel()"
              (click)="$kindOpen.update(open => !open)"
              aria-haspopup="true"
              data-testid="wt-filter-kind"
              type="button"
            >
              <svg [lucideIcon]="ListFilter" size="14"></svg>
              <svg [lucideIcon]="ChevronDown" size="10"></svg>
            </button>
            @if ($kindOpen()) {
              <div
                class="gd-menu absolute top-full left-0 z-40 mt-1 w-36 py-1"
                aria-label="Change type"
                data-testid="wt-filter-kind-popup"
                role="menu"
              >
                @for (kind of KINDS; track kind.value) {
                  <button
                    class="gd-menu-row"
                    [attr.data-testid]="'wt-filter-kind-' + kind.value"
                    (click)="setOperation(kind.value)"
                    role="menuitem"
                    type="button"
                  >
                    {{ kind.label }}
                    @if ($operation() === kind.value) {
                      <svg class="ml-auto shrink-0 text-[var(--gd-accent)]" [lucideIcon]="Check" size="13"></svg>
                    }
                  </button>
                }
              </div>
            }
          </div>
          <label class="gd-filter-search">
            <svg [lucideIcon]="Search" size="14"></svg>
            <input
              [value]="$filter()"
              (input)="setFilter($event)"
              aria-label="Filter changes"
              data-testid="wt-change-filter"
              placeholder="Filter"
              type="search"
            />
          </label>
        </div>
      </div>
      <div class="gd-files-count">{{ filteredEntries().length }} changed files</div>
      <div class="min-h-0 flex-1 overflow-y-auto" aria-live="polite" data-testid="wt-diff-result">
        @let diff = diffState();
        <!-- 相位是给 e2e / 读屏的读数，不是给眼睛的 UI：sr-only -->
        <span class="sr-only" data-testid="wt-diff-phase">{{ diff.phase }}</span>
        @if (diff.phase === 'empty') {
          <div class="gd-empty py-10 text-xs">
            <svg class="text-[var(--gd-line-num)]" [lucideIcon]="FileDiff" size="28"></svg>
            <p>No local changes</p>
            <p class="text-xs">Data written on other pages (like Todo) shows up here as uncommitted changes</p>
          </div>
        } @else if (diff.phase === 'success') {
          <ul data-testid="wt-diff-list">
            @for (entry of filteredEntries(); track diffEntryKey(entry)) {
              <li>
                <div
                  class="gd-row"
                  [attr.aria-current]="selectedKey() === diffEntryKey(entry) ? 'true' : null"
                  [attr.data-diff-key]="diffEntryKey(entry)"
                  [class.gd-row-selected]="selectedKey() === diffEntryKey(entry)"
                  (click)="selectEntry.emit(entry)"
                  (contextmenu)="menuRequest.emit({ target: entry, event: $event })"
                  (keydown.enter)="selectEntry.emit(entry)"
                  data-testid="wt-diff-item"
                  role="button"
                  tabindex="0"
                >
                  <div
                    class="flex min-w-0 items-center gap-2"
                    [title]="'entities/' + entry.entity + '/' + entry.entityId + ' · ' + formatPatchSummary(entry)"
                  >
                    <!-- 路径中间省略（GitHub Desktop 的文件列表同款）：前缀段照常截断，id 尾部保留结尾 -->
                    <span
                      class="gd-file-name flex min-w-0 flex-1 items-center"
                      [style.color]="gdPathColor(entry.operation)"
                    >
                      <span class="min-w-0 truncate">entities/{{ entry.entity }}/</span>
                      <span class="gd-truncate-tail min-w-0"
                        ><span>{{ entry.entityId }}</span></span
                      >
                    </span>
                    <svg
                      class="shrink-0"
                      [lucideIcon]="opIcon(entry.operation)"
                      [style.color]="opColor(entry.operation)"
                      size="16"
                    ></svg>
                  </div>
                </div>
              </li>
            } @empty {
              <li class="gd-empty py-8 text-xs">No matching changes</li>
            }
          </ul>
        }
      </div>
    </div>
  `
})
export class WorkingTreeChangesListComponent {
  readonly diffState = input.required<WorkingTreeQueryState<WorkingTreeDiff>>();
  readonly selectedKey = input<string | null>(null);
  readonly $filter = signal('');
  readonly $operation = signal<'all' | WorkingTreeDiffEntry['operation']>('all');
  readonly $kindOpen = signal(false);
  readonly kindContainer = viewChild<ElementRef<HTMLElement>>('kindContainer');
  readonly filteredEntries = computed(() => {
    const state = this.diffState();
    if (state.phase !== 'success') return [];
    const needle = this.$filter().trim().toLowerCase();
    return state.value.entries.filter(
      entry =>
        (this.$operation() === 'all' || entry.operation === this.$operation()) &&
        `entities/${entry.entity}/${entry.entityId} ${formatPatchSummary(entry)}`.toLowerCase().includes(needle)
    );
  });

  readonly selectEntry = output<WorkingTreeDiffEntry>();
  /** 行上右键；页面按条目拼菜单（复制 / 丢弃）。 */
  readonly menuRequest = output<WorkingTreeContextMenuRequest<WorkingTreeDiffEntry>>();

  readonly KINDS = KINDS;
  readonly FileDiff = FileDiff;
  readonly Search = Search;
  readonly ListFilter = ListFilter;
  readonly ChevronDown = ChevronDown;
  readonly Check = Check;
  readonly diffEntryKey = diffEntryKey;
  readonly formatPatchSummary = formatPatchSummary;
  readonly opIcon = gdOpIcon;
  readonly opColor = gdOpColor;
  readonly gdPathColor = gdPathColor;

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.$kindOpen() && !this.kindContainer()?.nativeElement.contains(event.target as Node)) {
      this.$kindOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  closeKind(event: Event): void {
    if (!this.$kindOpen()) return;
    event.stopPropagation();
    this.$kindOpen.set(false);
  }

  /** 当前类型的展示名（漏斗按钮的 title 用）。 */
  kindLabel(): string {
    return KINDS.find(kind => kind.value === this.$operation())?.label ?? 'All';
  }

  setFilter(event: Event): void {
    this.$filter.set((event.target as HTMLInputElement).value);
  }

  setOperation(value: 'all' | WorkingTreeDiffEntry['operation']): void {
    this.$operation.set(value);
    this.$kindOpen.set(false);
  }
}
