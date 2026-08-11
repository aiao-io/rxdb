import { MergeStrategy, RxDB, RxDBBranch, RxDBChange } from '@aiao/rxdb';
import { useFindAll } from '@aiao/rxdb-angular';
import { Todo } from '@aiao/rxdb-test/entities';
import { OverlayModule } from '@angular/cdk/overlay';
import { CdkVirtualScrollableElement, ScrollingModule } from '@angular/cdk/scrolling';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import {
  LucideAlertCircle as AlertCircle,
  LucideCheck as Check,
  LucideChevronRight as ChevronRight,
  LucideCircleDot as CircleDot,
  LucideGitBranch as GitBranch,
  LucideGitMerge as GitMerge,
  LucideDynamicIcon,
  LucidePlus as Plus,
  LucideRefreshCw as RefreshCw,
  LucideTrash2 as Trash2,
  LucideX as X
} from '@lucide/angular';
import { auditTime, EMPTY, filter, map, switchMap } from 'rxjs';
import { ResettableTimer } from '../opfs/utils/resettable-timer';

// ────────────────────────────────────────────────
// 合并对话框状态
// ────────────────────────────────────────────────
interface MergeDialogState {
  sourceBranchId: string;
  strategy: MergeStrategy;
  deleteSource: boolean;
}

@Component({
  selector: 'app-branch-manager-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideDynamicIcon, ScrollingModule, OverlayModule],
  template: `
    <!-- ═══════════════════ 页面容器 ═══════════════════ -->
    <div class="flex h-full flex-col overflow-hidden">
      <!-- ▸ 顶部标题栏 -->
      <div class="border-base-300 flex shrink-0 items-center justify-between border-b px-4 py-3">
        <div class="flex items-center gap-2">
          <svg class="text-primary" [lucideIcon]="GitBranch" size="20"></svg>
          <h1 class="text-lg font-semibold">分支管理</h1>
          <span class="badge badge-ghost badge-sm">{{ branches.value().length }} 个分支</span>
        </div>

        <div class="flex items-center gap-2">
          <button
            class="btn btn-ghost btn-sm gap-1"
            [disabled]="$busy()"
            (click)="addSampleTodo()"
            title="在当前分支新增一条 Todo 以产生变更记录"
          >
            <svg [lucideIcon]="Plus" size="14"></svg>
            添加 Todo 变更
          </button>
          <button
            class="btn btn-primary btn-sm gap-1"
            #createTrigger="cdkOverlayOrigin"
            [disabled]="$busy()"
            (click)="toggleCreatePopover()"
            cdkOverlayOrigin
          >
            <svg [lucideIcon]="GitBranch" size="14"></svg>
            新建分支
          </button>
        </div>
      </div>

      <!-- ▸ 创建分支 Popover -->
      <ng-template
        [cdkConnectedOverlayBackdropClass]="'cdk-overlay-transparent-backdrop'"
        [cdkConnectedOverlayHasBackdrop]="true"
        [cdkConnectedOverlayOpen]="$showCreatePopover()"
        [cdkConnectedOverlayOrigin]="createTrigger"
        [cdkConnectedOverlayPositions]="createOverlayPositions"
        (backdropClick)="closeCreatePopover()"
        cdkConnectedOverlay
      >
        <div class="bg-base-100 border-base-300 rounded-lg border p-3 shadow-xl">
          <div class="flex flex-col gap-2">
            <div class="text-xs font-medium">
              创建新分支 <span class="text-base-content/40">（基于 {{ $activeBranch() }}）</span>
            </div>
            <input
              class="input input-sm input-bordered w-56"
              #createInput
              [(ngModel)]="$newBranchName"
              (keydown.enter)="createBranch()"
              (keydown.escape)="closeCreatePopover()"
              placeholder="feature/my-feature"
              type="text"
            />
            <div class="flex justify-end gap-2">
              <button class="btn btn-ghost btn-sm" (click)="closeCreatePopover()">取消</button>
              <button
                class="btn btn-primary btn-sm"
                [disabled]="!$newBranchName().trim() || $busy()"
                (click)="createBranch()"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      </ng-template>

      <!-- ▸ 主体（两栏） -->
      <div class="flex min-h-0 flex-1 overflow-hidden">
        <!-- ══ 左栏：分支列表（内滚） ══ -->
        <div class="border-base-300 flex w-72 shrink-0 flex-col overflow-hidden border-r">
          <!-- 分类 Tab（固定） -->
          <div class="border-base-300 flex shrink-0 border-b">
            @for (tab of filterTabs; track tab.key) {
              <button
                class="flex-1 py-2 text-xs font-medium transition-colors"
                [class.border-b-2]="$filterTab() === tab.key"
                [class.border-primary]="$filterTab() === tab.key"
                [class.text-primary]="$filterTab() === tab.key"
                (click)="$filterTab.set(tab.key)"
              >
                {{ tab.label }}
              </button>
            }
          </div>

          <!-- 分支列表（可独立滚动） -->
          <ul class="flex-1 overflow-y-auto py-1">
            @for (branch of $filteredBranches(); track branch.id) {
              <li
                class="hover:bg-base-200 cursor-pointer border-b border-transparent px-3 py-2.5 transition-colors"
                [class.bg-base-200]="$selectedBranchId() === branch.id"
                [class.border-base-300]="$selectedBranchId() === branch.id"
                (click)="selectBranch(branch.id)"
                (keydown.enter)="selectBranch(branch.id)"
                (keydown.space)="selectBranch(branch.id)"
                role="button"
                tabindex="0"
              >
                <div class="flex items-start justify-between gap-1">
                  <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div class="flex items-center gap-1.5">
                      @if (branch.activated) {
                        <svg class="text-success shrink-0" [lucideIcon]="CircleDot" size="12"></svg>
                      } @else {
                        <svg class="text-base-content/40 shrink-0" [lucideIcon]="GitBranch" size="12"></svg>
                      }
                      <span
                        class="min-w-0 truncate text-sm font-medium"
                        [class.text-success]="branch.activated"
                        [title]="branch.id"
                        >{{ branch.id }}</span
                      >
                    </div>
                    @if (branch.parentId) {
                      <div class="text-base-content/50 ml-4 flex items-center gap-0.5 text-xs">
                        <svg [lucideIcon]="ChevronRight" size="10"></svg>
                        <span>来自 {{ branch.parentId }}</span>
                      </div>
                    }
                  </div>
                  @if (branch.activated) {
                    <span class="badge badge-success badge-xs shrink-0">当前</span>
                  }
                </div>

                <!-- 操作按钮行（选中后显示） -->
                @if ($selectedBranchId() === branch.id) {
                  <div class="mt-2 flex flex-wrap gap-1.5">
                    @if (!branch.activated) {
                      <button
                        class="btn btn-xs btn-outline btn-primary"
                        [disabled]="$busy()"
                        (click)="switchBranch(branch.id, $event)"
                      >
                        切换
                      </button>
                      <button
                        class="btn btn-xs btn-outline btn-success gap-1"
                        [disabled]="$busy()"
                        (click)="openMergeDialog(branch.id, $event)"
                      >
                        <svg [lucideIcon]="GitMerge" size="11"></svg>
                        合并到 {{ $activeBranch() }}
                      </button>
                      <button
                        class="btn btn-xs btn-outline btn-error gap-1"
                        [disabled]="$busy()"
                        (click)="deleteBranch(branch.id, $event)"
                      >
                        <svg [lucideIcon]="Trash2" size="11"></svg>
                        删除
                      </button>
                    }
                  </div>
                }
              </li>
            }
            @if ($filteredBranches().length === 0) {
              <li class="text-base-content/40 px-4 py-8 text-center text-sm">暂无分支</li>
            }
          </ul>
        </div>

        <!-- ══ 右栏：变更记录 ══ -->
        <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
          @if ($selectedBranchId()) {
            <!-- 变更列表头（固定） -->
            <div class="border-base-300 flex shrink-0 items-center justify-between border-b px-4 py-2.5">
              <div class="flex items-center gap-2">
                <svg class="text-primary" [lucideIcon]="GitBranch" size="16"></svg>
                <span class="font-medium">{{ $selectedBranchId() }}</span>
                @if ($selectedBranchIsActive()) {
                  <span class="badge badge-success badge-sm">当前分支</span>
                }
              </div>
              <div class="flex items-center gap-2">
                <span class="text-base-content/50 text-xs">
                  {{ $branchChanges().length }} 条{{ $hasMoreChanges() ? '+' : '' }}
                </span>
                <button
                  class="btn btn-ghost btn-xs btn-circle"
                  [disabled]="$loadingChanges()"
                  (click)="refreshChanges()"
                  title="刷新"
                >
                  <svg [class.animate-spin]="$loadingChanges()" [lucideIcon]="RefreshCw" size="13"></svg>
                </button>
              </div>
            </div>

            <!-- 变更列表（虚拟滚动 + 无限加载） -->
            <div class="flex-1 overflow-auto" cdkVirtualScrollingElement>
              <cdk-virtual-scroll-viewport class="h-full" [itemSize]="CHANGE_ITEM_SIZE">
                <!-- 空状态 -->
                @if (!$loadingChanges() && $branchChanges().length === 0) {
                  <div class="flex flex-col items-center gap-2 p-12 text-center">
                    <svg class="text-base-content/20" [lucideIcon]="Check" size="32"></svg>
                    <p class="text-base-content/50 text-sm">此分支无变更记录</p>
                    <p class="text-base-content/30 text-xs">
                      @if ($selectedBranchIsActive()) {
                        点击「添加 Todo 变更」来创建一些变更
                      } @else {
                        切换到此分支后添加数据即可产生变更
                      }
                    </p>
                  </div>
                }

                <!-- 变更列表 -->
                <ul>
                  <li
                    class="border-base-300 hover:bg-base-200 flex flex-col justify-center gap-0.5 border-b px-4 transition-colors"
                    *cdkVirtualFor="let change of $branchChanges(); trackBy: trackChangeFn"
                    [style.height.px]="CHANGE_ITEM_SIZE"
                    [title]="formatChangeTooltip(change)"
                  >
                    <!-- 第一行: badge + entity + id -->
                    <div class="flex items-center gap-3">
                      <div class="w-16 shrink-0">
                        @switch (change.type) {
                          @case ('INSERT') {
                            <span class="badge badge-success badge-sm">INSERT</span>
                          }
                          @case ('UPDATE') {
                            <span class="badge badge-warning badge-sm">UPDATE</span>
                          }
                          @case ('DELETE') {
                            <span class="badge badge-error badge-sm">DELETE</span>
                          }
                        }
                      </div>
                      <div class="flex min-w-0 flex-1 items-center gap-2">
                        <span class="text-sm font-medium">{{ change.entity }}</span>
                        <span class="text-base-content/40 font-mono text-xs">#{{ change.entityId }}</span>
                        @if (change.revertChangeId) {
                          <span class="badge badge-ghost badge-xs shrink-0">已撤销</span>
                        }
                      </div>
                      <div class="text-base-content/30 shrink-0 font-mono text-xs">#{{ change.id }}</div>
                    </div>
                    <!-- 第二行: patch 摘要 -->
                    <div class="text-base-content/40 ml-[76px] truncate font-mono text-xs leading-none">
                      {{ formatChangePatch(change) }}
                    </div>
                  </li>
                </ul>

                <!-- 加载更多指示器 -->
                @if ($loadingChanges()) {
                  <div class="flex justify-center py-4">
                    <span class="loading loading-spinner loading-sm"></span>
                  </div>
                }
                @if (!$hasMoreChanges() && $branchChanges().length > 0) {
                  <div class="text-base-content/30 py-4 text-center text-xs">
                    已加载全部 {{ $branchChanges().length }} 条变更
                  </div>
                }
              </cdk-virtual-scroll-viewport>
            </div>
          } @else {
            <!-- 未选择分支时的空状态 -->
            <div class="flex flex-1 flex-col items-center justify-center gap-3 p-12 text-center">
              <svg class="text-base-content/15" [lucideIcon]="GitBranch" size="48"></svg>
              <p class="text-base-content/50">选择一个分支查看变更记录</p>
            </div>
          }
        </div>
      </div>
    </div>

    <!-- ═══════════════════ 合并对话框 ═══════════════════ -->
    @if ($mergeDialog()) {
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        (click)="closeMergeDialog()"
        (keydown.escape)="closeMergeDialog()"
        aria-label="关闭对话框"
        role="button"
        tabindex="0"
      >
        <div
          class="bg-base-100 w-full max-w-md rounded-xl p-6 shadow-2xl"
          (click)="$event.stopPropagation()"
          (keydown)="$event.stopPropagation()"
          aria-modal="true"
          role="dialog"
        >
          <div class="mb-4 flex items-center gap-2">
            <svg class="text-success" [lucideIcon]="GitMerge" size="20"></svg>
            <h2 class="text-lg font-semibold">合并分支</h2>
          </div>

          <!-- 合并路径 -->
          <div class="bg-base-200 mb-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm">
            <span class="font-mono font-medium text-orange-500">{{ $mergeDialog()!.sourceBranchId }}</span>
            <svg class="text-base-content/50" [lucideIcon]="ChevronRight" size="14"></svg>
            <span class="font-mono font-medium text-green-600">{{ $activeBranch() }}</span>
          </div>

          <!-- 合并策略 -->
          <div class="mb-4">
            <span class="mb-1.5 block text-sm font-medium">合并策略</span>
            <div class="flex gap-2">
              <button
                class="flex-1 rounded-lg border px-3 py-2 text-left text-sm transition"
                [class]="$mergeDialog()!.strategy === 'squash' ? 'bg-primary/10 border-primary' : 'border-base-300'"
                (click)="setMergeStrategy('squash')"
              >
                <div class="font-medium">Squash</div>
                <div class="text-base-content/50 mt-0.5 text-xs">压缩为最小变更集，过滤幽灵操作</div>
              </button>
              <button
                class="flex-1 rounded-lg border px-3 py-2 text-left text-sm transition"
                [class]="$mergeDialog()!.strategy === 'normal' ? 'bg-primary/10 border-primary' : 'border-base-300'"
                (click)="setMergeStrategy('normal')"
              >
                <div class="font-medium">Normal</div>
                <div class="text-base-content/50 mt-0.5 text-xs">逐条应用，保留每条独立变更记录</div>
              </button>
            </div>
          </div>

          <!-- 删除源分支 -->
          <label class="mb-6 flex cursor-pointer items-center gap-3">
            <input
              class="checkbox checkbox-sm"
              [ngModel]="$mergeDialog()!.deleteSource"
              (ngModelChange)="setDeleteSource($event)"
              type="checkbox"
            />
            <span class="text-sm">
              合并后删除源分支
              <code class="text-xs opacity-70">{{ $mergeDialog()!.sourceBranchId }}</code>
            </span>
          </label>

          <!-- 错误信息 -->
          @if ($mergeError()) {
            <div class="alert alert-error mb-4 py-2 text-sm">
              <svg [lucideIcon]="AlertCircle" size="16"></svg>
              {{ $mergeError() }}
            </div>
          }

          <div class="flex justify-end gap-2">
            <button class="btn btn-ghost btn-sm" [disabled]="$busy()" (click)="closeMergeDialog()">取消</button>
            <button class="btn btn-success btn-sm gap-1" [disabled]="$busy()" (click)="executeMerge()">
              @if ($busy()) {
                <span class="loading loading-spinner loading-xs"></span>
              } @else {
                <svg [lucideIcon]="GitMerge" size="14"></svg>
              }
              确认合并
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Toast -->
    @if ($toast()) {
      <div class="toast toast-top toast-end z-50">
        <div
          class="alert text-sm"
          [class.alert-error]="$toast()!.type === 'error'"
          [class.alert-success]="$toast()!.type === 'success'"
        >
          {{ $toast()!.message }}
        </div>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
    `
  ]
})
export default class BranchManagerPage {
  readonly #rxdb = inject(RxDB);
  #changeCursor: number | null = null;
  #changeLoadSequence = 0;
  private readonly destroyRef = inject(DestroyRef);
  private readonly toastTimer = new ResettableTimer();

  // ── 虚拟滚动 ──────────────────────────────────────────────
  readonly CHANGE_ITEM_SIZE = 68;
  readonly CHANGE_PAGE_SIZE = 50;

  $hasMoreChanges = signal(true);

  readonly _viewport = viewChild(CdkVirtualScrollableElement);
  readonly createInput = viewChild<ElementRef<HTMLInputElement>>('createInput');

  readonly createOverlayPositions = [
    {
      originX: 'end' as const,
      originY: 'bottom' as const,
      overlayX: 'end' as const,
      overlayY: 'top' as const,
      offsetY: 8
    },
    {
      originX: 'end' as const,
      originY: 'top' as const,
      overlayX: 'end' as const,
      overlayY: 'bottom' as const,
      offsetY: -8
    }
  ];

  // ── 分类标签 ──────────────────────────────────────────────
  readonly filterTabs = [
    { key: 'all' as const, label: '全部' },
    { key: 'active' as const, label: '当前分支' },
    { key: 'stale' as const, label: '其他分支' }
  ];

  // ── 图标 ──────────────────────────────────────────────────
  readonly GitBranch = GitBranch;
  readonly GitMerge = GitMerge;
  readonly Plus = Plus;
  readonly X = X;
  readonly Check = Check;
  readonly Trash2 = Trash2;
  readonly ChevronRight = ChevronRight;
  readonly CircleDot = CircleDot;
  readonly RefreshCw = RefreshCw;
  readonly AlertCircle = AlertCircle;

  // ── 状态 ──────────────────────────────────────────────────
  $busy = signal(false);
  $showCreatePopover = signal(false);
  $newBranchName = signal('');
  $filterTab = signal<'all' | 'active' | 'stale'>('all');
  $selectedBranchId = signal<string | null>(null);
  $branchChanges = signal<RxDBChange[]>([]);
  $loadingChanges = signal(false);
  $mergeDialog = signal<MergeDialogState | null>(null);
  $mergeError = signal<string | null>(null);
  $toast = signal<{ type: 'success' | 'error'; message: string } | null>(null);

  // ── 数据 ──────────────────────────────────────────────────
  readonly branches = useFindAll(RxDBBranch, {
    where: { combinator: 'and', rules: [] },
    orderBy: [{ field: 'createdAt', sort: 'asc' }]
  });

  // ── 派生状态 ──────────────────────────────────────────────
  readonly $activeBranch = computed(() => this.branches.value().find(b => b.activated)?.id ?? '');

  readonly $filteredBranches = computed(() => {
    const tab = this.$filterTab();
    const list = this.branches.value();
    if (tab === 'active') return list.filter(b => b.activated);
    if (tab === 'stale') return list.filter(b => !b.activated);
    return list;
  });

  readonly $selectedBranchIsActive = computed(() => this.$selectedBranchId() === this.$activeBranch());

  constructor() {
    this.destroyRef.onDestroy(() => this.toastTimer.clear());
    effect(() => {
      if (this.$showCreatePopover()) {
        setTimeout(() => this.createInput()?.nativeElement.focus(), 0);
      }
    });
    toObservable(this._viewport)
      .pipe(
        switchMap(vp =>
          vp ?
            vp.elementScrolled().pipe(
              auditTime(50),
              map(() => vp.measureScrollOffset('bottom')),
              filter(bottom => bottom < 400)
            )
          : EMPTY
        ),
        takeUntilDestroyed()
      )
      .subscribe(() => this.loadMoreChanges());
  }

  readonly trackChangeFn = (_: number, c: RxDBChange) => c.id;

  // ── 分支操作 ──────────────────────────────────────────────

  selectBranch(id: string) {
    this.$selectedBranchId.set(id);
    this.loadBranchChanges(id, true);
  }

  refreshChanges() {
    this.loadBranchChanges(this.$selectedBranchId(), true);
  }

  async loadBranchChanges(branchId: string | null, reset = false) {
    if (!branchId) return;
    if (!reset && this.$loadingChanges()) return;

    const sequence = ++this.#changeLoadSequence;
    if (reset) {
      this.#changeCursor = null;
      this.$branchChanges.set([]);
      this.$hasMoreChanges.set(true);
    }
    if (!this.$hasMoreChanges()) return;

    const cursor = this.#changeCursor;
    this.$loadingChanges.set(true);
    try {
      const { changeRepository } = await this.#rxdb.versionManager.getLocalRepositories();
      const branch = this.branches.value().find(item => item.id === branchId);
      const changes = await changeRepository.find({
        where: {
          combinator: 'and',
          rules: [
            { field: 'branchId', operator: '=', value: branchId },
            ...(branch?.fromChangeId != null ?
              [{ field: 'id' as const, operator: '>' as const, value: branch.fromChangeId }]
            : []),
            ...(cursor != null ? [{ field: 'id' as const, operator: '<' as const, value: cursor }] : [])
          ]
        },
        orderBy: [{ field: 'id', sort: 'desc' }],
        limit: this.CHANGE_PAGE_SIZE
      });

      if (sequence !== this.#changeLoadSequence || branchId !== this.$selectedBranchId()) return;
      this.$branchChanges.update(previous => [...previous, ...changes]);
      this.$hasMoreChanges.set(changes.length === this.CHANGE_PAGE_SIZE);
      if (changes.length > 0) this.#changeCursor = changes[changes.length - 1].id;
    } finally {
      if (sequence === this.#changeLoadSequence) this.$loadingChanges.set(false);
    }
  }

  loadMoreChanges() {
    this.loadBranchChanges(this.$selectedBranchId(), false);
  }

  toggleCreatePopover() {
    if (this.$showCreatePopover()) {
      this.closeCreatePopover();
    } else {
      this.$newBranchName.set('');
      this.$showCreatePopover.set(true);
    }
  }

  closeCreatePopover() {
    this.$showCreatePopover.set(false);
  }

  async createBranch() {
    const name = this.$newBranchName().trim();
    if (!name) return;
    this.$busy.set(true);
    try {
      await this.#rxdb.versionManager.createBranch(name);
      this.$newBranchName.set('');
      this.closeCreatePopover();
      this.showToast('success', `分支 "${name}" 创建成功`);
    } catch (e: unknown) {
      this.showToast('error', e instanceof Error ? e.message : '创建失败');
    } finally {
      this.$busy.set(false);
    }
  }

  async switchBranch(branchId: string, event: Event) {
    event.stopPropagation();
    this.$busy.set(true);
    try {
      await this.#rxdb.versionManager.switchBranch(branchId);
      this.showToast('success', `已切换到分支 "${branchId}"`);
      // 刷新变更预览
      await this.loadBranchChanges(this.$selectedBranchId(), true);
    } catch (e: unknown) {
      this.showToast('error', e instanceof Error ? e.message : '切换失败');
    } finally {
      this.$busy.set(false);
    }
  }

  async deleteBranch(branchId: string, event: Event) {
    event.stopPropagation();
    if (!confirm(`确定要删除分支 "${branchId}" 吗？`)) return;
    this.$busy.set(true);
    try {
      await this.#rxdb.versionManager.removeBranch(branchId);
      if (this.$selectedBranchId() === branchId) {
        this.$selectedBranchId.set(null);
        this.$branchChanges.set([]);
      }
      this.showToast('success', `分支 "${branchId}" 已删除`);
    } catch (e: unknown) {
      this.showToast('error', e instanceof Error ? e.message : '删除失败');
    } finally {
      this.$busy.set(false);
    }
  }

  // ── 合并对话框 ────────────────────────────────────────────

  openMergeDialog(sourceBranchId: string, event: Event) {
    event.stopPropagation();
    this.$mergeError.set(null);
    this.$mergeDialog.set({ sourceBranchId, strategy: 'squash', deleteSource: false });
  }

  closeMergeDialog() {
    this.$mergeDialog.set(null);
    this.$mergeError.set(null);
  }

  setMergeStrategy(strategy: MergeStrategy) {
    const cur = this.$mergeDialog();
    if (cur) this.$mergeDialog.set({ ...cur, strategy });
  }

  setDeleteSource(value: boolean) {
    const cur = this.$mergeDialog();
    if (cur) this.$mergeDialog.set({ ...cur, deleteSource: value });
  }

  async executeMerge() {
    const dialog = this.$mergeDialog();
    if (!dialog) return;
    this.$busy.set(true);
    this.$mergeError.set(null);
    try {
      const result = await this.#rxdb.versionManager.mergeBranch(dialog.sourceBranchId, {
        strategy: dialog.strategy,
        deleteSource: dialog.deleteSource
      });
      this.closeMergeDialog();
      this.showToast(
        'success',
        `合并完成：${result.merged} 条变更已应用到 ${this.$activeBranch()}` +
          (result.sourceDeleted ? `，源分支已删除` : '')
      );
      // 刷新当前分支变更
      if (this.$selectedBranchId()) {
        await this.loadBranchChanges(this.$selectedBranchId(), true);
      }
    } catch (e: unknown) {
      this.$mergeError.set(e instanceof Error ? e.message : '合并失败');
    } finally {
      this.$busy.set(false);
    }
  }

  // ── 示例数据 ──────────────────────────────────────────────

  async addSampleTodo() {
    this.$busy.set(true);
    try {
      const titles = [
        'Fix bug in login flow',
        'Add unit tests for merge_branch',
        'Update README docs',
        'Refactor query builder',
        'Improve error messages',
        'Add dark mode support',
        'Performance optimizations'
      ];
      const title = titles[Math.floor(Math.random() * titles.length)];
      const todo = new Todo({ title });
      await todo.save();
      this.showToast('success', `已添加 Todo：${title}`);
      // 刷新当前分支变更
      if (this.$selectedBranchId() === this.$activeBranch()) {
        await this.loadBranchChanges(this.$selectedBranchId(), true);
      }
    } catch (e: unknown) {
      this.showToast('error', e instanceof Error ? e.message : '添加失败');
    } finally {
      this.$busy.set(false);
    }
  }

  // ── 工具方法 ──────────────────────────────────────────────

  formatChangePatch(change: RxDBChange): string {
    const MAX = 200;
    let text: string;
    if (change.type === 'INSERT') {
      text = change.patch ? JSON.stringify(change.patch) : '';
    } else if (change.type === 'DELETE') {
      text = change.inversePatch ? JSON.stringify(change.inversePatch) : '';
    } else {
      const ip = (change.inversePatch ?? {}) as Record<string, unknown>;
      const p = (change.patch ?? {}) as Record<string, unknown>;
      const keys = [...new Set([...Object.keys(ip), ...Object.keys(p)])];
      text = keys.map(k => `${k}: ${JSON.stringify(ip[k])} → ${JSON.stringify(p[k])}`).join(', ');
    }
    return text.length > MAX ? text.slice(0, MAX) + '…' : text;
  }

  formatChangeTooltip(change: RxDBChange): string {
    if (change.type === 'UPDATE') {
      return `patch: ${JSON.stringify(change.patch, null, 2)}\ninversePatch: ${JSON.stringify(change.inversePatch, null, 2)}`;
    }
    if (change.type === 'INSERT') return `patch: ${JSON.stringify(change.patch, null, 2)}`;
    return `inversePatch: ${JSON.stringify(change.inversePatch, null, 2)}`;
  }

  private showToast(type: 'success' | 'error', message: string) {
    this.$toast.set({ type, message });
    this.toastTimer.schedule(() => this.$toast.set(null), 3000);
  }
}
