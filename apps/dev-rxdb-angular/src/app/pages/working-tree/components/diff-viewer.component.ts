import type { WorkingTreeDiffEntry } from '@aiao/rxdb-plugin-working-tree';
import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  HostListener,
  inject,
  Injectable,
  input,
  signal,
  viewChild
} from '@angular/core';
import {
  LucideChevronDown as ChevronDown,
  LucideFileDiff as FileDiff,
  LucideDynamicIcon,
  LucideSettings as Settings
} from '@lucide/angular';
import {
  buildFieldDiff,
  buildHunks,
  filterWhitespaceOnlyChanges,
  formatFieldValue,
  formatSide
} from '../working-tree.diff-format';
import { gdOpColor, gdOpIcon, gdOpLabel, gdPathColor } from '../working-tree.gd';

/** 右侧 diff 的两种显示（GitHub Desktop 的 Unified / Split 同义）。 */
export type WorkingTreeDiffViewMode = 'unified' | 'split';

@Injectable({ providedIn: 'root' })
export class WorkingTreeDiffDisplayPreferences {
  /** 显示模式；GitHub Desktop 默认 Unified。 */
  readonly mode = signal<WorkingTreeDiffViewMode>('unified');
  /** 隐藏只有空白差异的字段（GitHub Desktop Diff Settings 的 Hide Whitespace Changes）。 */
  readonly hideWhitespace = signal(false);
  /** 自动换行（GitHub Desktop Diff Settings 的 Show Word Wrap）。 */
  readonly wrap = signal(true);
}

/** Split 视图里的一行：一个字段的旧 / 新两侧，缺侧为 `null`。 */
interface SplitRow {
  readonly key: string;
  readonly before: unknown;
  readonly after: unknown;
  readonly oldNumber: number | null;
  readonly newNumber: number | null;
}

/**
 * 右栏的 diff 查看器，模仿 GitHub Desktop 的文件 diff 视图。
 *
 * @remarks
 * 没有选中项时显示空态提示而不是空白：右栏是页面的主视觉区，空白会让
 * 「点左侧文件看右侧 diff」这个轴显得没接上。每个**字段**画成一个 hunk 盒子
 * （`buildHunks`，见 diff-format 的 TSDoc）：头部是 git 风格的
 * `@@ -a,b +c,d @@ <字段名>`（字段名占 git 里「函数上下文」的位置）。
 *
 * **两种显示模式**（GitHub Desktop 的 Unified / Split）：
 * Unified 逐字段显示 `- / +` 行；Split 是**逐行对齐的双栏**（side-by-side 形态）——
 * 一个字段占一行，旧值左栏红底、新值右栏绿底，缺侧留灰槽，两侧行号独立推进，
 * **不带「改前 / 改后」文字标签**（GitHub Desktop 的 split 也没有）。
 * 切换入口在 Diff Settings 菜单里，与 Hide Whitespace Changes / Show Word Wrap
 * 两个开关同处一菜单。两种模式只改变显示，不改变补丁内容。
 *
 * 文件头不显示**事务** id（`transactionId` 是工作树的簿记，与内容无关），
 * 路径 `entities/<实体>/<实体id>` 是「文件名」本身，完整保留、按状态着色
 * （PathLabel 同款）；操作类型图标放在 Settings 按钮的右侧（源码 diff-header 同位置）。
 *
 * 视觉对齐 GitHub Desktop：浅灰行号槽（`.gd-diff-gutter`），`-`/`+` 行整行红 / 绿底，
 * 行号与符号用对应侧的深红 / 深绿，内容文字保持正文色。
 */
@Component({
  selector: 'app-working-tree-diff-viewer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, LucideDynamicIcon],
  styles: [
    `
      /* 宿主是右栏 main 的 flex 子项：行数一多要在查看器内部滚动，不能把 main 撑开 */
      :host {
        display: flex;
        flex-direction: column;
        flex: 1 1 0%;
        min-height: 0;
      }
      .gd-diff-settings-panel {
        width: min(240px, calc(100% - 8px));
      }
      .gd-diff-settings-panel input {
        accent-color: var(--gd-accent);
      }
    `
  ],
  template: `
    @if (entry(); as entry) {
      <div class="flex h-full min-h-0 flex-col" data-testid="wt-diff-viewer">
        <div
          class="relative shrink-0 border-b px-3 py-1"
          [style.background]="'var(--gd-panel)'"
          [style.border-color]="'var(--gd-border)'"
        >
          <div class="flex min-w-0 items-center gap-2">
            <svg [lucideIcon]="FileDiff" [style.color]="gdOpColor(entry.operation)" size="14"></svg>
            <!-- 路径里的实体 id 是「文件名」的一部分，不能省略；空间不够时中间省略（尾部保留结尾）；
                 文本按状态着色（GitHub Desktop PathLabel 同款） -->
            <span
              class="flex min-w-0 flex-1 items-center text-[12px] font-semibold"
              [style.color]="gdPathColor(entry.operation)"
              [title]="'entities/' + entry.entity + '/' + entry.entityId"
            >
              <span class="min-w-0 truncate">entities/{{ entry.entity }}/</span>
              <span class="gd-truncate-tail min-w-0"
                ><span>{{ entry.entityId }}</span></span
              >
            </span>
            @if (entry.origin === 'remote_sync') {
              <span
                class="rounded-full border border-[var(--gd-border)] px-1.5 text-[10px]"
                [style.color]="'var(--gd-muted)'"
              >
                Remote sync
              </span>
            }
            <div class="flex shrink-0 items-center" #settingsContainer>
              <button
                class="gd-icon-btn"
                #settingsButton
                [attr.aria-expanded]="$settingsOpen()"
                (click)="$settingsOpen.update(open => !open)"
                aria-haspopup="true"
                aria-label="Diff Settings"
                data-testid="wt-diff-settings"
                title="Diff Settings"
                type="button"
              >
                <svg [lucideIcon]="Settings" size="15"></svg>
                <svg [lucideIcon]="ChevronDown" size="10"></svg>
              </button>
              @if ($settingsOpen()) {
                <div
                  class="gd-menu gd-diff-settings-panel absolute top-full right-2 z-40 mt-1"
                  aria-label="Diff Settings"
                  data-testid="wt-diff-settings-popup"
                  role="group"
                >
                  <div class="px-3 py-1.5 text-xs font-semibold">Diff Settings</div>
                  <div class="gd-menu-header">Diff display</div>
                  <label class="gd-menu-row cursor-pointer">
                    <input
                      [checked]="preferences.mode() === 'unified'"
                      (change)="setViewMode('unified')"
                      name="wt-diff-display"
                      type="radio"
                    />
                    Unified
                  </label>
                  <label class="gd-menu-row cursor-pointer">
                    <input
                      [checked]="preferences.mode() === 'split'"
                      (change)="setViewMode('split')"
                      name="wt-diff-display"
                      type="radio"
                    />
                    Split
                  </label>
                  <label class="gd-menu-row cursor-pointer">
                    <input
                      [checked]="preferences.hideWhitespace()"
                      (change)="toggleWhitespace()"
                      data-testid="wt-diff-whitespace"
                      type="checkbox"
                    />
                    Hide Whitespace Changes
                  </label>
                  <label class="gd-menu-row cursor-pointer">
                    <input
                      [checked]="preferences.wrap()"
                      (change)="toggleWrap()"
                      data-testid="wt-diff-wrap"
                      type="checkbox"
                    />
                    Show Word Wrap
                  </label>
                </div>
              }
            </div>
            <!-- 操作类型图标；title / aria-label 挂在 span 上——实测 svg + lucideDynamicIcon
                 的 [title] 绑定渲染不出来（style 绑定正常），span 是稳定的载体 -->
            <span [attr.aria-label]="gdOpLabel(entry.operation)" [title]="gdOpLabel(entry.operation)" role="img">
              <svg
                class="shrink-0"
                [lucideIcon]="gdOpIcon(entry.operation)"
                [style.color]="gdOpColor(entry.operation)"
                size="14"
              ></svg>
            </span>
          </div>
        </div>
        <div class="min-h-0 flex-1 overflow-auto">
          @if (preferences.mode() === 'unified') {
            @for (hunk of hunks(); track hunk.key + hunk.oldStart + hunk.newStart) {
              <div class="gd-hunk">
                <div class="gd-hunk-header">
                  @@ -{{ hunk.oldStart }},{{ hunk.oldCount }} +{{ hunk.newStart }},{{ hunk.newCount }} @@ {{ hunk.key }}
                </div>
                @for (row of hunk.rows; track row.key + row.sign + formatFieldValue(row.value)) {
                  <div class="gd-diff-row" [class.gd-add]="row.sign === '+'" [class.gd-del]="row.sign === '-'">
                    <div class="gd-diff-gutter border-r border-[var(--gd-border)]">
                      <span class="gd-diff-num">{{ row.oldNumber ?? '' }}</span>
                      <span class="gd-diff-num">{{ row.newNumber ?? '' }}</span>
                      <span class="gd-diff-sign" [class.gd-add]="row.sign === '+'" [class.gd-del]="row.sign === '-'">{{
                        row.sign
                      }}</span>
                    </div>
                    <div class="gd-diff-content" [style.white-space]="preferences.wrap() ? null : 'pre'">
                      <span [style.color]="'var(--gd-muted)'">{{ row.key }}:</span>
                      <span>{{ formatFieldValue(row.value) }}</span>
                    </div>
                  </div>
                }
              </div>
            } @empty {
              <p class="py-3 text-center text-xs" [style.color]="'var(--gd-muted)'">No field-level patch to display</p>
            }
          } @else {
            <div class="gd-split" data-testid="wt-split">
              @for (row of splitRows(); track row.key) {
                <div class="gd-split-row">
                  <div
                    class="gd-split-cell gd-split-old"
                    [class.gd-split-cell-empty]="row.before === undefined"
                    data-testid="wt-split-old"
                  >
                    @if (row.before !== undefined) {
                      <span class="gd-split-num">{{ row.oldNumber }}</span>
                      <span class="gd-split-sign">-</span>
                      <span class="gd-split-value">{{ row.key }}: {{ formatSide(row.before) }}</span>
                    }
                  </div>
                  <div
                    class="gd-split-cell gd-split-new"
                    [class.gd-split-cell-empty]="row.after === undefined"
                    data-testid="wt-split-new"
                  >
                    @if (row.after !== undefined) {
                      <span class="gd-split-num">{{ row.newNumber }}</span>
                      <span class="gd-split-sign">+</span>
                      <span class="gd-split-value">{{ row.key }}: {{ formatSide(row.after) }}</span>
                    }
                  </div>
                </div>
              }
            </div>
          }
        </div>
      </div>
    } @else {
      <div class="gd-empty h-full text-sm">
        <svg class="text-[var(--gd-line-num)]" [lucideIcon]="FileDiff" size="40"></svg>
        <p>Select a change from the left to see its field-level diff</p>
      </div>
    }
  `
})
export class WorkingTreeDiffViewerComponent {
  readonly preferences = inject(WorkingTreeDiffDisplayPreferences);
  readonly entry = input<WorkingTreeDiffEntry | null>(null);
  readonly $settingsOpen = signal(false);
  readonly settingsContainer = viewChild<ElementRef<HTMLElement>>('settingsContainer');
  readonly settingsButton = viewChild<ElementRef<HTMLButtonElement>>('settingsButton');

  readonly hunks = computed(() => {
    const entry = this.entry();
    if (entry === null) return [];
    const hunks = buildHunks(entry);
    return this.preferences.hideWhitespace() ? filterWhitespaceOnlyChanges(hunks) : hunks;
  });

  /** Split 视图的行：一个字段一行，两侧行号独立推进（GitHub Desktop 的 side-by-side 行对齐）。 */
  readonly splitRows = computed<SplitRow[]>(() => {
    const entry = this.entry();
    if (entry === null) return [];
    let oldLine = 1;
    let newLine = 1;
    return buildFieldDiff(entry).map(line => {
      const oldNumber = line.before === undefined ? null : oldLine++;
      const newNumber = line.after === undefined ? null : newLine++;
      return { key: line.key, before: line.before, after: line.after, oldNumber, newNumber };
    });
  });

  readonly FileDiff = FileDiff;
  readonly Settings = Settings;
  readonly ChevronDown = ChevronDown;
  readonly formatFieldValue = formatFieldValue;
  readonly formatSide = formatSide;
  readonly gdOpIcon = gdOpIcon;
  readonly gdOpColor = gdOpColor;
  readonly gdOpLabel = gdOpLabel;
  readonly gdPathColor = gdPathColor;

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.$settingsOpen() && !this.settingsContainer()?.nativeElement.contains(event.target as Node)) {
      this.$settingsOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  closeSettings(event: Event): void {
    if (!this.$settingsOpen()) return;
    event.stopPropagation();
    this.$settingsOpen.set(false);
    this.settingsButton()?.nativeElement.focus();
  }

  toggleWrap(): void {
    this.preferences.wrap.update(wrap => !wrap);
    this.$settingsOpen.set(false);
  }

  toggleWhitespace(): void {
    this.preferences.hideWhitespace.update(hide => !hide);
    this.$settingsOpen.set(false);
  }

  setViewMode(mode: WorkingTreeDiffViewMode): void {
    this.preferences.mode.set(mode);
    this.$settingsOpen.set(false);
  }
}
