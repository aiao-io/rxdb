import { MergeStrategy, RxDB, RxDBBranch } from '@aiao/rxdb';
import { useFindAll } from '@aiao/rxdb-angular';
import type {
  CommitLogEntry,
  WorkingTreeCredentials,
  WorkingTreeDiffEntry,
  WorkingTreeRestoreFailureReason,
  WorkingTreeRestoreSessionInfo
} from '@aiao/rxdb-plugin-working-tree';
import { WorkingTreeDirtyError } from '@aiao/rxdb-plugin-working-tree';
import { useWorkingTree, type WorkingTreeResource } from '@aiao/rxdb-plugin-working-tree-angular';
import { Todo } from '@aiao/rxdb-test/entities';
import { OverlayModule } from '@angular/cdk/overlay';
import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  OnInit,
  signal,
  viewChild
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideAlertCircle as AlertCircle,
  LucideChevronRight as ChevronRight,
  LucideCircleDot as CircleDot,
  LucideGitBranch as GitBranch,
  LucideGitCommitHorizontal as GitCommitHorizontal,
  LucideGitMerge as GitMerge,
  LucideHistory as History,
  LucideDynamicIcon,
  LucidePlus as Plus,
  LucideRotateCcw as RotateCcw,
  LucideTrash2 as Trash2
} from '@lucide/angular';
import { ResettableTimer } from '../opfs/utils/resettable-timer';

const AUTHOR_ID = 'demo-author';

/** `restore()` 的四个被拒成因 → 用户能看懂的提示。 */
const RESTORE_REJECTION_TEXT: Record<WorkingTreeRestoreFailureReason, string> = {
  conflict: '并发冲突：有人动过工作树，重试即可。',
  dirty_working_tree: '工作树里还有未提交改动：先提交或丢弃，再恢复历史版本。',
  incompatible_schema: '这个提交里有当前客户端不认识的实体，恢复不了。',
  unreachable_target: '这个提交不在当前分支的可达历史里。'
};

/** 合并对话框状态 */
interface MergeDialogState {
  sourceBranchId: string;
  strategy: MergeStrategy;
  deleteSource: boolean;
}

@Component({
  selector: 'app-working-tree-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './working-tree.page.html',
  imports: [CommonModule, FormsModule, OverlayModule, LucideDynamicIcon],
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
    `
  ]
})
export default class WorkingTreePage implements OnInit {
  readonly #rxdb = inject(RxDB);
  private readonly createdAt = performance.now();
  private readonly destroyRef = inject(DestroyRef);
  private readonly toastTimer = new ResettableTimer();

  readonly tree: WorkingTreeResource = useWorkingTree();

  readonly branches = useFindAll(RxDBBranch, {
    where: { combinator: 'and', rules: [] },
    orderBy: [{ field: 'createdAt', sort: 'asc' }]
  });

  // ── 页面状态 ──────────────────────────────────────────────
  readonly $selectedBranchId = signal<string | null>(null);
  readonly $showCreatePopover = signal(false);
  readonly $newBranchName = signal('');
  readonly $branchError = signal<string | null>(null);
  readonly $mergeDialog = signal<MergeDialogState | null>(null);
  readonly $mergeError = signal<string | null>(null);
  readonly $toast = signal<{ type: 'success' | 'error'; message: string } | null>(null);
  readonly $notice = signal<string | null>(null);
  readonly $restoreSession = signal<WorkingTreeRestoreSessionInfo | null>(null);
  readonly $firstVisibleMs = signal<number | null>(null);

  message = '';
  title = '写一条 Todo 作为改动';

  // ── 派生状态 ──────────────────────────────────────────────
  readonly $activeBranch = computed(() => this.branches.value().find(b => b.activated)?.id ?? '');

  // ── 图标 ──────────────────────────────────────────────────
  readonly GitBranch = GitBranch;
  readonly GitCommitHorizontal = GitCommitHorizontal;
  readonly GitMerge = GitMerge;
  readonly History = History;
  readonly Plus = Plus;
  readonly RotateCcw = RotateCcw;
  readonly Trash2 = Trash2;
  readonly ChevronRight = ChevronRight;
  readonly CircleDot = CircleDot;
  readonly AlertCircle = AlertCircle;

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

  readonly createInput = viewChild<ElementRef<HTMLInputElement>>('createInput');

  constructor() {
    this.destroyRef.onDestroy(() => this.toastTimer.clear());
    effect(() => {
      const phase = this.tree.statusState().phase;
      if (this.$firstVisibleMs() !== null) return;
      if (phase === 'idle' || phase === 'loading') return;
      this.$firstVisibleMs.set(Math.round(performance.now() - this.createdAt));
    });
    effect(() => {
      if (this.$showCreatePopover()) {
        setTimeout(() => this.createInput()?.nativeElement.focus(), 0);
      }
    });
  }

  // 面板初始化后主动读一次状态：入口自己不发 IO（见它的 TSDoc），而一个开着却说不出
  // 「现在脏不脏」的面板，正是 SC-005 要防的那种「核心很快、UI 没反应」。
  ngOnInit(): void {
    void this.tree.isEnabled().catch(() => undefined);
    void this.tree.status().catch(() => undefined);
  }

  // `enable()` 自己会重读一次 status，但**不会**重读 isEnabled ——
  // 不补这一句，成功启用之后「提交能力」那行仍然写着「未启用」。
  async runEnable(): Promise<void> {
    await this.tree.enable().catch(() => undefined);
    await this.tree.isEnabled().catch(() => undefined);
    await this.refreshStatus();
    await this.readCommits();
  }

  /**
   * 重读 status，并顺带刷新紧随其后的两个读数。
   *
   * diff 跟着重读：面板没有变更流（见 `useWorkingTree` 的 TSDoc），本页发起的写
   * （写 Todo、提交、丢弃、合并、恢复）之后不补这一句，「未提交改动」区就会停在旧内容。
   * 恢复会话只在 status 说 restoring / conflicted 时才读：其余时刻多一次 IO 没有意义。
   */
  async refreshStatus(): Promise<void> {
    const status = await this.tree.status().catch(() => null);
    await this.tree.diff().catch(() => undefined);
    if (status !== null && (status.restoring || status.conflicted)) {
      const session = await this.tree.restoreSession().catch(() => null);
      this.$restoreSession.set(session);
    } else {
      this.$restoreSession.set(null);
    }
  }

  async readCommits(): Promise<void> {
    await this.tree.listCommits({ limit: 50 }).catch(() => undefined);
  }

  async writeTodo(): Promise<void> {
    const todo = new Todo();
    todo.title = this.title;
    await todo.save();
    await this.refreshStatus();
  }

  /**
   * 为下一次命令**现读**一份 status 并取出三个捕获位。
   *
   * 不读信号快照（`statusState()`）：上一次命令的收尾刷新可能还在飞行（phase 还是
   * `loading`），快照会读出 null 让命令静默跳过；也可能读到刷新前的旧值，让 CAS 带着
   * 过期的 revision 打出去——两种都表现为「点了没反应」。现读拿到的是事务提交后的
   * 最新值，CAS 要么命中要么得到一次诚实的 conflict（`WorkingTreeCredentials` 的 TSDoc）。
   *
   * 读不到就返回 `null` 而不是补默认值：三个位里任何一个给默认值，都等于让这次
   * 命令跳过一次并发比较。
   */
  async freshCredentials(): Promise<WorkingTreeCredentials | null> {
    const status = await this.tree.status().catch(() => null);
    if (status === null) return null;
    return {
      expectedBranch: { branchId: status.branchId, activationRevision: status.activationRevision },
      expectedHeadRevision: status.headRevision,
      expectedWorkingTreeRevision: status.workingTreeRevision
    };
  }

  async runCommit(): Promise<void> {
    const credentials = await this.freshCredentials();
    if (credentials === null) {
      this.$notice.set('读不到工作树状态，提交凭据无从谈起——先刷新状态。');
      return;
    }
    this.$notice.set(null);
    await this.tree
      .commit(this.message, { ...credentials, authorId: AUTHOR_ID, operationId: crypto.randomUUID() })
      .catch(() => undefined);
    await this.refreshStatus();
    await this.readCommits();
  }

  async runDiscard(): Promise<void> {
    const credentials = await this.freshCredentials();
    if (credentials === null) {
      this.$notice.set('读不到工作树状态，丢弃凭据无从谈起——先刷新状态。');
      return;
    }
    this.$notice.set(null);
    await this.tree.discard(credentials).catch(() => undefined);
    await this.refreshStatus();
  }

  /**
   * 把历史里某个提交的内容写回工作树（FR-013 的恢复，不是 checkout）。
   *
   * 恢复完的工作树是**脏的**，下一步是 commit() 或 discard()——与手写变更走同一条路，
   * 因此这里刷新 status 与 diff、不刷历史：历史在 commit 之后才会多一行。
   */
  async restoreEntry(entry: CommitLogEntry): Promise<void> {
    const credentials = await this.freshCredentials();
    if (credentials === null) {
      this.$notice.set('读不到工作树状态，恢复凭据无从谈起——先刷新状态。');
      return;
    }
    this.$notice.set(null);
    // restore 的入参只有三个捕获位，没有第四个（FR-014 / FR-034：脏与冲突的答案分别是
    // 「拒绝」与「两份都留着」，没有入参可承载）——不带 authorId / operationId。
    const result = await this.tree.restore({ commitId: entry.commitId }, credentials).catch(() => null);
    if (result !== null && !result.ok) {
      this.showToast('error', RESTORE_REJECTION_TEXT[result.reason] ?? `恢复被拒：${result.reason}`);
    }
    await this.refreshStatus();
  }

  // ── 分支操作 ──────────────────────────────────────────────

  selectBranch(id: string) {
    this.$selectedBranchId.set(id);
  }

  toggleCreatePopover() {
    if (this.$showCreatePopover()) {
      this.closeCreatePopover();
    } else {
      this.$newBranchName.set('');
      this.$branchError.set(null);
      this.$showCreatePopover.set(true);
    }
  }

  closeCreatePopover() {
    this.$showCreatePopover.set(false);
  }

  async createBranch() {
    const name = this.$newBranchName().trim();
    if (!name) {
      this.$branchError.set('分支名不能为空');
      return;
    }
    try {
      await this.#rxdb.versionManager.createBranch(name);
      this.$newBranchName.set('');
      this.closeCreatePopover();
      this.showToast('success', `分支 "${name}" 创建成功`);
    } catch (e: unknown) {
      this.$branchError.set(e instanceof Error ? e.message : '创建失败');
    }
  }

  /**
   * 切换分支，带 `requireClean`：工作树非空时被 `WorkingTreeDirtyError` 拒掉。
   *
   * 不传 `requireClean` 的话切换照样发生（脏工作树按分支隔离保留，切走再切回原样还在），
   * 但那把「先处理未提交改动」这个 git 流程里最关键的一步藏起来了——demo 要演的就是这一步。
   */
  async switchBranch(branchId: string) {
    try {
      await this.tree.switchBranch(branchId, { requireClean: true });
      this.$selectedBranchId.set(branchId);
      this.showToast('success', `已切换到分支 "${branchId}"`);
      await this.refreshStatus();
      await this.readCommits();
    } catch (e: unknown) {
      this.showToast(
        'error',
        e instanceof WorkingTreeDirtyError ? e.message
        : e instanceof Error ? e.message
        : '切换失败'
      );
    }
  }

  async removeBranch(branchId: string) {
    if (!confirm(`确定要删除分支 "${branchId}" 吗？`)) return;
    try {
      await this.#rxdb.versionManager.removeBranch(branchId);
      if (this.$selectedBranchId() === branchId) {
        this.$selectedBranchId.set(null);
      }
      this.showToast('success', `分支 "${branchId}" 已删除`);
    } catch (e: unknown) {
      this.showToast('error', e instanceof Error ? e.message : '删除失败');
    }
  }

  // ── 合并对话框 ────────────────────────────────────────────

  openMergeDialog(sourceBranchId: string) {
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

  /**
   * 执行合并，并把「合并 ≠ 入史」这一步讲给用户。
   *
   * 实测语义（write-entry-matrix 行 2）：合并结果**落入目标分支的工作树**成为未提交单元，
   * 与 `git merge --no-commit` 同构——历史里出现合并节点，是在用户接下来那次 commit() 之后。
   * toast 里点破这一点，否则「合并了怎么历史没变」会像 bug。
   */
  async executeMerge() {
    const dialog = this.$mergeDialog();
    if (!dialog) return;
    this.$mergeError.set(null);
    try {
      const result = await this.#rxdb.versionManager.mergeBranch(dialog.sourceBranchId, {
        strategy: dialog.strategy,
        deleteSource: dialog.deleteSource
      });
      this.closeMergeDialog();
      this.showToast(
        'success',
        `合并完成：${result.merged} 条变更已进入 ${this.$activeBranch()} 的工作树` +
          `，提交之后才入史${result.sourceDeleted ? '，源分支已删除' : ''}`
      );
      await this.refreshStatus();
    } catch (e: unknown) {
      this.$mergeError.set(e instanceof Error ? e.message : '合并失败');
    }
  }

  // ── 展示辅助 ──────────────────────────────────────────────

  /** diff 条目的一行补丁摘要；与 branch-manager 的变更摘要同一个「旧 → 新」口味。 */
  formatPatchSummary(entry: WorkingTreeDiffEntry): string {
    const MAX = 200;
    let text: string;
    if (entry.operation === 'insert') {
      text = entry.patch ? JSON.stringify(entry.patch) : '';
    } else if (entry.operation === 'delete') {
      text = entry.inversePatch ? JSON.stringify(entry.inversePatch) : '';
    } else {
      const ip = (entry.inversePatch ?? {}) as Record<string, unknown>;
      const p = (entry.patch ?? {}) as Record<string, unknown>;
      const keys = [...new Set([...Object.keys(ip), ...Object.keys(p)])];
      text = keys.map(k => `${k}: ${JSON.stringify(ip[k])} → ${JSON.stringify(p[k])}`).join(', ');
    }
    return text.length > MAX ? text.slice(0, MAX) + '…' : text;
  }

  private showToast(type: 'success' | 'error', message: string) {
    this.$toast.set({ type, message });
    this.toastTimer.schedule(() => this.$toast.set(null), 3000);
  }
}
