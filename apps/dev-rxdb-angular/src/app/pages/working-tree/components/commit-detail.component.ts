import type { CommitChangeSetPage, CommitLogEntry, WorkingTreeQueryState } from '@aiao/rxdb-plugin-working-tree';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, signal } from '@angular/core';
import {
  LucideChevronDown as ChevronDown,
  LucideChevronUp as ChevronUp,
  LucideCopy as Copy,
  LucideGitCommitHorizontal as GitCommitHorizontal,
  LucideDynamicIcon
} from '@lucide/angular';
import { startDragResize } from '../working-tree.drag';
import {
  gdAvatarColor,
  gdAvatarInitial,
  gdEntryPath,
  gdOpColor,
  gdOpIcon,
  gdPathColor,
  gdTableName
} from '../working-tree.gd';
import { WorkingTreeDiffViewerComponent } from './diff-viewer.component';

/** 一个变更单元的选中键：同一 commit 里的单元也互不相同。 */
const changeUnitKey = (unit: CommitChangeSetPage['entries'][number]): string =>
  `${unit.unitId}:${unit.namespace}:${unit.entity}:${unit.entityId}`;

/**
 * 右栏的提交详情，对应 GitHub Desktop 历史里选中提交后的右侧视图。
 *
 * @remarks
 * 提交元信息下方是文件列表与逐字段差异。`commitChanges()` 返回不可变变更单元，
 * 补丁字段与未提交 diff 同形，因此共用查看器；`diff()` 本身仍只比较 HEAD 和工作树。
 *
 * 没有「恢复」按钮（GitHub Desktop 的详情区也没有）：恢复入口只在历史行的右键菜单里。
 * 标题行右端的折叠 chevron 收的是**附加基本信息**（描述 + 作者 / 时间 / sha 元数据行），
 * 下面的文件列表与差异栏始终可见。文件列表右缘有可拖分隔条（GitHub Desktop 的同款可拖宽度）。
 */
@Component({
  selector: 'app-working-tree-commit-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, LucideDynamicIcon, WorkingTreeDiffViewerComponent],
  styles: [
    `
      /* 宿主是右栏 main 的 flex 子项：与 diff-viewer 同一组规则 */
      :host {
        display: flex;
        flex-direction: column;
        flex: 1 1 0%;
        min-height: 0;
      }
    `
  ],
  template: `
    @if (commit(); as commit) {
      <div class="flex h-full min-h-0 flex-col" data-testid="wt-commit-detail">
        <div class="gd-commit-header shrink-0 px-4 py-2">
          <div class="flex items-center gap-2">
            <h2 class="min-w-0 flex-1 truncate text-[15px] font-semibold" [title]="title()">{{ title() }}</h2>
            @if (commit.kind === 'baseline' || commit.kind === 'branch_baseline') {
              <span
                class="shrink-0 rounded-full border border-[var(--gd-border)] px-1.5 text-[10px]"
                [style.color]="'var(--gd-muted)'"
              >
                Baseline
              </span>
            } @else {
              <span
                class="shrink-0 rounded-full border border-[var(--gd-border)] px-1.5 text-[10px]"
                [style.color]="'var(--gd-muted)'"
              >
                Commit
              </span>
            }
            @if (commit.parentIds.length > 1) {
              <span
                class="shrink-0 rounded-full border border-[var(--gd-border)] px-1.5 text-[10px]"
                [style.color]="'var(--gd-muted)'"
              >
                Merge
              </span>
            }
            <button
              class="gd-icon-btn shrink-0"
              [attr.aria-expanded]="!$collapsed()"
              [attr.aria-label]="$collapsed() ? 'Expand details' : 'Collapse details'"
              [title]="$collapsed() ? 'Expand details' : 'Collapse details'"
              (click)="$collapsed.update(value => !value)"
              data-testid="wt-detail-collapse"
              type="button"
            >
              <svg [lucideIcon]="$collapsed() ? ChevronDown : ChevronUp" size="15"></svg>
            </button>
          </div>
          @if (!$collapsed()) {
            @if (description(); as description) {
              <p class="mt-1 text-sm whitespace-pre-wrap" [style.color]="'var(--gd-muted)'">{{ description }}</p>
            }

            <div
              class="gd-commit-meta mt-1 flex items-center gap-2 text-xs"
              [style.color]="'var(--gd-muted)'"
              [title]="commit.createdAt.toLocaleString()"
            >
              <span
                class="gd-avatar text-[9px]"
                [style.background]="gdAvatarColor(commit.authorId ?? '?')"
                [style.height.px]="18"
                [style.width.px]="18"
              >
                {{ gdAvatarInitial(commit.authorId ?? '?') }}
              </span>
              <span>{{ commit.authorId ?? '无作者' }}</span>
              <span class="gd-commit-time">committed on {{ commit.createdAt.toLocaleString() }}</span>
              <span class="min-w-0 truncate font-mono text-[11px]" [title]="commit.commitId">
                {{ commit.commitId.slice(0, 8) }}
              </span>
              <button
                class="gd-btn-ghost shrink-0"
                (click)="copySha(commit.commitId)"
                data-testid="wt-commit-copy"
                title="Copy commit ID"
                type="button"
              >
                <svg [lucideIcon]="Copy" size="12"></svg>
                <span class="sr-only">{{ $copied() ? 'Copied' : 'Copy commit ID' }}</span>
              </button>
            </div>
          }
        </div>

        <!-- 提交列表之外的文件列表与差异栏；始终可见，折叠只收上面的附加信息。 -->
        <div
          class="gd-history-layout min-h-0 flex-1 border-t"
          [style.border-color]="'var(--gd-border)'"
          data-testid="wt-commit-changes"
        >
          @let changes = changesState();
          @if (changes.phase === 'success' || changes.phase === 'empty') {
            <div class="gd-history-files" [style.--gd-files-w.px]="$filesWidth()" data-testid="wt-history-files">
              <div class="gd-files-count">{{ changes.value.entries.length }} changed files</div>
              <ul class="min-h-0 flex-1 overflow-y-auto" data-testid="wt-commit-changes-list">
                @for (unit of changes.value.entries; track changeUnitKey(unit)) {
                  <li>
                    <div
                      class="gd-row"
                      [attr.data-unit-key]="changeUnitKey(unit)"
                      [class.gd-row-selected]="selectedUnit() === unit"
                      (click)="$selectedUnitKey.set(changeUnitKey(unit))"
                      (keydown.enter)="$selectedUnitKey.set(changeUnitKey(unit))"
                      data-testid="wt-commit-change-item"
                      role="button"
                      tabindex="0"
                    >
                      <div class="flex min-w-0 items-center gap-2" [title]="gdEntryPath(unit)">
                        <!-- 路径中间省略（与更改列表同一形态） -->
                        <span
                          class="flex min-w-0 flex-1 items-center text-[13px]"
                          [style.color]="gdPathColor(unit.operation)"
                        >
                          <span class="shrink-0">{{ unit.namespace }}/{{ gdTableName(unit.entity) }}/</span>
                          <span class="gd-truncate-tail min-w-0"
                            ><span>{{ unit.entityId }}</span></span
                          >
                        </span>
                        <svg
                          class="shrink-0"
                          [lucideIcon]="gdOpIcon(unit.operation)"
                          [style.color]="gdOpColor(unit.operation)"
                          size="16"
                        ></svg>
                      </div>
                    </div>
                  </li>
                }
              </ul>
            </div>
            <!-- 文件列表右缘的分隔条：按住拖动调宽（GitHub Desktop 的同款可拖分隔）。 -->
            <div class="gd-resizer" (pointerdown)="startFilesResize($event)" aria-hidden="true"></div>
            <div class="gd-history-diff min-w-0 flex-1" data-testid="wt-history-diff">
              <app-working-tree-diff-viewer [entry]="selectedUnit()" />
            </div>
          } @else if (changes.phase === 'loading') {
            <p class="py-6 text-center text-xs" [style.color]="'var(--gd-muted)'">Loading changes…</p>
          } @else if (changes.phase === 'error') {
            <p class="py-6 text-center text-xs" [style.color]="'var(--gd-del-fg)'">{{ changes.error.message }}</p>
          }
        </div>
      </div>
    } @else {
      <div class="gd-empty h-full text-sm">
        <svg class="text-[var(--gd-line-num)]" [lucideIcon]="GitCommitHorizontal" size="40"></svg>
        <p>Select a commit from the left to see its details</p>
      </div>
    }
  `
})
export class WorkingTreeCommitDetailComponent {
  #resetTimer: ReturnType<typeof setTimeout> | null = null;
  /** SHA 的复制反馈；2s 后复位。 */
  readonly $copied = signal(false);
  /** 左栏里选中的变更单元键。 */
  readonly $selectedUnitKey = signal<string | null>(null);
  /** 内容区折叠（GitHub Desktop 的 diff 折叠 chevron）。 */
  readonly $collapsed = signal(false);
  /** 文件列表宽度；右缘分隔条拖动调。 */
  readonly $filesWidth = signal(280);

  readonly commit = input<CommitLogEntry | null>(null);
  readonly changesState = input.required<WorkingTreeQueryState<CommitChangeSetPage>>();

  /** 提交标题 = message 的第一行（GitHub Desktop 的大字标题位）。 */
  readonly title = computed(() => this.commit()?.message.split('\n', 1)[0] ?? '');
  /** 描述 = message 第一行之后的全部（GitHub Desktop 的灰色描述段）。 */
  readonly description = computed(() => {
    const message = this.commit()?.message ?? '';
    const newline = message.indexOf('\n');
    return newline === -1 ? '' : message.slice(newline + 1).replace(/^\n+/, '');
  });

  /** 左栏当前选中的变更单元；没选中时回落到第一条（GitHub Desktop 默认展示第一个文件）。 */
  readonly selectedUnit = computed(() => {
    const changes = this.changesState();
    if (changes.phase !== 'success' && changes.phase !== 'empty') return null;
    const entries = changes.value.entries;
    const key = this.$selectedUnitKey();
    if (key !== null) return entries.find(unit => changeUnitKey(unit) === key) ?? null;
    return entries[0] ?? null;
  });

  readonly changeUnitKey = changeUnitKey;
  readonly Copy = Copy;
  readonly ChevronDown = ChevronDown;
  readonly ChevronUp = ChevronUp;
  readonly GitCommitHorizontal = GitCommitHorizontal;
  readonly gdAvatarColor = gdAvatarColor;
  readonly gdAvatarInitial = gdAvatarInitial;
  readonly gdOpColor = gdOpColor;
  readonly gdOpIcon = gdOpIcon;
  readonly gdPathColor = gdPathColor;
  readonly gdEntryPath = gdEntryPath;
  readonly gdTableName = gdTableName;

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => {
      if (this.#resetTimer !== null) clearTimeout(this.#resetTimer);
    });
    // 换一个 commit 就清掉上一个的左栏选中与折叠态：两个 commit 的单元键可能撞上（都叫 u1）。
    effect(() => {
      this.commit();
      this.$selectedUnitKey.set(null);
      this.$collapsed.set(false);
    });
  }

  async copySha(sha: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(sha);
      this.$copied.set(true);
    } catch {
      // 剪贴板不可用（非安全上下文等）：不假装成功
      return;
    }
    if (this.#resetTimer !== null) clearTimeout(this.#resetTimer);
    this.#resetTimer = setTimeout(() => this.$copied.set(false), 2000);
  }

  /** 拖动文件列表右缘的分隔条调宽（公共拖拽样板，见 working-tree.drag）。 */
  startFilesResize(event: PointerEvent): void {
    startDragResize(event, {
      getWidth: () => this.$filesWidth(),
      setWidth: width => this.$filesWidth.set(width),
      min: 140,
      max: 420
    });
  }
}
