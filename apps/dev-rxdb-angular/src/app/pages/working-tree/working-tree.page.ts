import { RxDB, RxDBBranch } from '@aiao/rxdb';
import { useFindAll } from '@aiao/rxdb-angular';
import type {
  CommitLogEntry,
  CommitResult,
  CommitValidationReason,
  WorkingTreeCredentials,
  WorkingTreeDiffEntry,
  WorkingTreeRestoreFailureReason,
  WorkingTreeRestoreSessionInfo
} from '@aiao/rxdb-plugin-working-tree';
import { CommitValidationError, WorkingTreeDirtyError } from '@aiao/rxdb-plugin-working-tree';
import { useWorkingTree, type WorkingTreeResource } from '@aiao/rxdb-plugin-working-tree-angular';
import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  OnInit,
  signal
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  LucideCheck as Check,
  LucideChevronDown as ChevronDown,
  LucideFolderGit2 as FolderGit2,
  LucideGitBranch as GitBranch,
  LucideDynamicIcon,
  LucideRefreshCw as RefreshCw
} from '@lucide/angular';
import { ResettableTimer } from '../opfs/utils/resettable-timer';
import { WorkingTreeBranchMenuComponent } from './components/branch-menu.component';
import {
  WorkingTreeChangesListComponent,
  type WorkingTreeContextMenuRequest
} from './components/changes-list.component';
import { WorkingTreeCommitBoxComponent } from './components/commit-box.component';
import { WorkingTreeCommitDetailComponent } from './components/commit-detail.component';
import {
  WorkingTreeContextMenuComponent,
  type WorkingTreeContextMenuItem,
  type WorkingTreeContextMenuState
} from './components/context-menu.component';
import { WorkingTreeDiffViewerComponent } from './components/diff-viewer.component';
import { WorkingTreeHistoryListComponent } from './components/history-list.component';
import { MergeDialogState, WorkingTreeMergeDialogComponent } from './components/merge-dialog.component';
import { diffEntryKey } from './working-tree.diff-format';
import { startDragResize } from './working-tree.drag';
import { gdEntryPath } from './working-tree.gd';

const AUTHOR_ID = 'demo-author';

/** 左栏宽度下限 / 上限：太窄列表读不了，太宽把右栏挤没。 */
const ASIDE_WIDTH_MIN = 240;
const ASIDE_WIDTH_MAX = 560;

/** 下拉面板的最小宽度：跟触发按钮同宽，但窄到读不了时保底一整列的宽度。 */
const MIN_DROPDOWN_WIDTH = 320;

/** `restore()` 的四个被拒成因 → 用户能看懂的提示。 */
const RESTORE_REJECTION_TEXT: Record<WorkingTreeRestoreFailureReason, string> = {
  conflict: 'Concurrent conflict: the working tree changed. Retry.',
  dirty_working_tree: 'The working tree has uncommitted changes. Commit or discard them before restoring.',
  incompatible_schema: 'This commit contains entities the current client cannot read.',
  unreachable_target: 'This commit is not reachable from the current branch.'
};

/** `commit()` 的五种校验拒绝 → 用户能看懂的提示（demo 的入参只会命中 empty_commit）。 */
const COMMIT_REJECTION_TEXT: Record<CommitValidationReason, string> = {
  empty_message: 'The commit message is empty. Write a summary first.',
  missing_author: 'The commit is missing author information.',
  missing_operation_id: 'The commit is missing an idempotency key and cannot be replayed safely.',
  empty_commit: 'The working tree has no changes to commit.',
  user_authored_system_commit: 'System baseline commits cannot carry user information.'
};

/** `requireClean` 切换被拒的提示；GitHub Desktop 会在切换时拒绝脏工作树，同款语义。 */
const DIRTY_SWITCH_TEXT = 'The working tree has uncommitted changes. Commit or discard them before switching branches.';

/**
 * 工作树与提交历史页面 —— GitHub Desktop 形态的参考实现。
 *
 * @remarks
 * 布局模仿 GitHub Desktop 的 Current Repository 视图：顶部一条工具栏（仓库选择器、
 * 分支下拉、本地刷新与上次刷新时间），左侧「更改 / 历史记录」
 * 标签页（文件列表 + 底部提交框），右栏选中项的详情（字段级 hunk diff 或提交详情），
 * 最底部一条窄状态条放 demo 的原始状态读数（分支 / 未提交数 / 干净与否——这些是
 * 仪器不是 UI）。视觉细节（选中行 3px 蓝左边条、hunk 盒子、头像散列取色、蓝底
 * 白字主按钮）见 `styles.scss` 里的 `.gd-*` 共享样式。面板没有变更流（见
 * `useWorkingTree` 的 TSDoc），每次命令后仍要手动重读；本页发起的写之后都由
 * `refreshStatus()` 兜这一下。
 */
@Component({
  selector: 'app-working-tree-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './working-tree.page.html',
  // page-host（absolute inset-0 + overflow-hidden）是各页占满路由可用区的标准做法：
  // 旧写法 height:100% 依赖 #layout-content 的 flex 链，而它是 grow 子项且 min-height:auto，
  // 页面内容一高就把它撑高，内部滚动随之失效（列表把提交框挤出去）。absolute 脱离文档流，
  // 不再参与撑高，页内 flex 布局才拿得到确定高度。
  host: { class: 'page-host' },
  imports: [
    CommonModule,
    LucideDynamicIcon,
    RouterLink,
    WorkingTreeBranchMenuComponent,
    WorkingTreeChangesListComponent,
    WorkingTreeCommitBoxComponent,
    WorkingTreeCommitDetailComponent,
    WorkingTreeContextMenuComponent,
    WorkingTreeDiffViewerComponent,
    WorkingTreeHistoryListComponent,
    WorkingTreeMergeDialogComponent
  ]
})
export default class WorkingTreePage implements OnInit {
  readonly #rxdb = inject(RxDB);
  private readonly createdAt = performance.now();
  private readonly destroyRef = inject(DestroyRef);
  private readonly toastTimer = new ResettableTimer();
  /** 上次刷新的相对时间心跳；destroy 时清掉。 */
  private readonly fetchedTicker: ReturnType<typeof setInterval>;

  readonly tree: WorkingTreeResource = useWorkingTree();

  readonly branches = useFindAll(RxDBBranch, {
    where: { combinator: 'and', rules: [] },
    orderBy: [{ field: 'createdAt', sort: 'asc' }]
  });

  // ── 页面状态 ──────────────────────────────────────────────
  readonly $activeTab = signal<'changes' | 'history'>('changes');
  readonly $selectedDiffKey = signal<string | null>(null);
  readonly $selectedCommitId = signal<string | null>(null);
  /** 提交草稿拆成摘要与描述两个框（GitHub Desktop 的 Summary / Description）。 */
  readonly $commitSummary = signal('');
  readonly $commitDescription = signal('');
  // 分支菜单：开合、创建弹层、名字与错误都交给 branch-menu 组件用 model() 双向持有
  readonly $branchMenuOpen = signal(false);
  readonly $createPopoverOpen = signal(false);
  readonly $newBranchName = signal('');
  readonly $branchError = signal<string | null>(null);
  readonly $mergeDialog = signal<MergeDialogState | null>(null);
  readonly $mergeError = signal<string | null>(null);
  readonly $toast = signal<{ type: 'success' | 'error'; message: string } | null>(null);
  readonly $notice = signal<string | null>(null);
  readonly $restoreSession = signal<WorkingTreeRestoreSessionInfo | null>(null);
  readonly $firstVisibleMs = signal<number | null>(null);
  /** 仓库选择器的开合（工具栏最左的 rxdb-demo 下拉）。 */
  readonly $repoMenuOpen = signal(false);
  /** 最近一次本地读取的时刻。 */
  readonly $lastFetchedAt = signal<number | null>(null);
  /** 工具栏 Fetch 的进行中标志（GitHub Desktop 同款：转 spinner + Fetching…）。 */
  readonly $fetching = signal(false);
  /** 下拉面板保底宽度（模板里用三元夹到按钮宽与保底宽）。 */
  readonly MIN_DROPDOWN_WIDTH = MIN_DROPDOWN_WIDTH;
  /** 供「上次获取：N 秒前」用的心跳：15s 一跳，文本不必秒级精确。 */
  readonly $now = signal(Date.now());
  /** 左栏宽度；拖动分隔条调（键盘：分隔条上方向键）。工具栏的仓库段跟着它走。 */
  readonly $asideWidth = signal(320);
  /** 工具栏分支段的宽度（GitHub Desktop 的固定 230px 起）。 */
  readonly $branchSectionWidth = signal(230);
  /** 工具栏获取段的宽度。 */
  readonly $fetchSectionWidth = signal(200);
  /** 右键菜单的开合状态；null = 关着。 */
  readonly $contextMenu = signal<WorkingTreeContextMenuState | null>(null);
  /** 右键菜单对应的目标：分发动作时不再靠菜单文案反查。 */
  readonly $contextMenuTarget = signal<
    | {
        readonly kind: 'diff';
        readonly key: string;
        readonly namespace: string;
        readonly entity: string;
        readonly entityId: string;
      }
    | { readonly kind: 'commit'; readonly commitId: string }
    | { readonly kind: 'branch'; readonly branchId: string }
    | null
  >(null);

  // ── 派生状态 ──────────────────────────────────────────────
  readonly $activeBranch = computed(() => this.branches.value().find(b => b.activated)?.id ?? '');

  /** 「更改」标签上的条数徽章；status 里那份 entryCount 与 diff 条目数同源。 */
  readonly $changesCount = computed(() => {
    const status = this.tree.statusState();
    if (status.phase !== 'success' && status.phase !== 'empty') return null;
    return status.value.entryCount > 0 ? status.value.entryCount : null;
  });

  /** 工具栏刷新时间随 15s 心跳重算（GitHub Desktop 的 Last fetched 口径）。 */
  readonly $lastFetchedLabel = computed(() => {
    const at = this.$lastFetchedAt();
    if (at === null) return '—';
    const seconds = Math.max(0, Math.floor((this.$now() - at) / 1000));
    if (seconds < 5) return 'just now';
    if (seconds < 60) return `${seconds} seconds ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  });

  /** 恢复会话警示条的可见性：status 说 restoring / conflicted 才亮。 */
  readonly $showRestoreBanner = computed(() => {
    const status = this.tree.statusState();
    if (status.phase !== 'success' && status.phase !== 'empty') return false;
    return status.value.restoring || status.value.conflicted;
  });

  readonly $selectedDiffEntry = computed(() => {
    const diff = this.tree.diffState();
    if (diff.phase !== 'success') return null;
    const key = this.$selectedDiffKey();
    return diff.value.entries.find(entry => diffEntryKey(entry) === key) ?? null;
  });

  readonly $selectedCommit = computed(() => {
    const commits = this.tree.listCommitsState();
    if (commits.phase !== 'success') return null;
    const id = this.$selectedCommitId();
    return commits.value.entries.find(entry => entry.commitId === id) ?? null;
  });

  // ── 图标 ──────────────────────────────────────────────────
  readonly RefreshCw = RefreshCw;
  readonly Check = Check;
  readonly ChevronDown = ChevronDown;
  readonly FolderGit2 = FolderGit2;
  readonly GitBranch = GitBranch;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.toastTimer.clear();
      clearInterval(this.fetchedTicker);
    });
    this.fetchedTicker = setInterval(() => this.$now.set(Date.now()), 15000);
    effect(() => {
      const phase = this.tree.statusState().phase;
      if (this.$firstVisibleMs() !== null) return;
      if (phase === 'idle' || phase === 'loading') return;
      this.$firstVisibleMs.set(Math.round(performance.now() - this.createdAt));
    });
    // 列表一刷新就自动选中第一条，右栏不至于空着——GitHub Desktop 打开仓库时
    // 也是默认展示第一个文件的 diff。用户手动选中的键还在列表里就不动它。
    effect(() => {
      const diff = this.tree.diffState();
      const entries = diff.phase === 'success' ? diff.value.entries : [];
      const keys = entries.map(diffEntryKey);
      const current = this.$selectedDiffKey();
      if (current !== null && keys.includes(current)) return;
      this.$selectedDiffKey.set(keys[0] ?? null);
    });
    // 历史里选中一条提交，就把它动过的变更单元读出来给右侧详情（两栏里的左栏）。
    // 只在选中变化时发 IO：commitChangesState 自己的相位变化不在依赖里。
    effect(() => {
      const id = this.$selectedCommitId();
      if (id !== null) void this.tree.commitChanges(id).catch(() => undefined);
    });
  }

  // 面板初始化后主动读一次状态：入口自己不发 IO（见它的 TSDoc），而一个开着却说不出
  // 「现在脏不脏」的面板，正是 SC-005 要防的那种「核心很快、UI 没反应」。
  ngOnInit(): void {
    // 挂载时读取本地状态，刷新时间从这一刻起算。
    this.$lastFetchedAt.set(Date.now());
    void this.tree
      .isEnabled()
      .then(enabled => {
        if (enabled) void this.tree.diff().catch(() => undefined);
      })
      .catch(() => undefined);
    void this.tree.status().catch(() => undefined);
  }

  // ── 工具栏 ────────────────────────────────────────────────

  toggleRepoMenu() {
    this.$repoMenuOpen.update(open => !open);
  }

  closeRepoMenu() {
    this.$repoMenuOpen.set(false);
  }

  /** 重读本地状态与历史，并更新刷新时间；进行中忽略重复点击（GitHub Desktop 的 Fetching 态）。 */
  async runFetch(): Promise<void> {
    if (this.$fetching()) return;
    this.$fetching.set(true);
    try {
      await this.refreshStatus();
      await this.readCommits();
      this.$lastFetchedAt.set(Date.now());
    } finally {
      this.$fetching.set(false);
    }
  }

  // ── 右键菜单 ──────────────────────────────────────────────

  /**
   * 更改列表行上的右键，对齐 GitHub Desktop 的文件右键菜单：
   * 动作（Discard）在前，分隔线后是复制路径。
   *
   * @remarks
   * 动作项写的是 **Discard All Changes** 而不是 GitHub Desktop 的 `Discard Changes`：
   * 那一条在 GitHub Desktop 里丢的是右键那几行，而这里的 `discard()` 只有整棵工作树一种粒度
   * （`working-tree-facade.ts` 里那条「不收选择集」的硬裁决）。照抄标签等于让菜单许诺一个
   * 做不到的范围——用户以为退掉了一行，实际连同别处正在写的改动一起没了，而这一步不可撤销。
   * 复制路径仍按右键那一行走，所以右键目标照常记。
   */
  openChangesContextMenu(request: WorkingTreeContextMenuRequest<WorkingTreeDiffEntry>) {
    request.event.preventDefault();
    const entry = request.target;
    this.$contextMenuTarget.set({
      kind: 'diff',
      key: diffEntryKey(entry),
      namespace: entry.namespace,
      entity: entry.entity,
      entityId: entry.entityId
    });
    this.$contextMenu.set({
      x: request.event.clientX,
      y: request.event.clientY,
      items: [
        { id: 'discard', label: 'Discard All Changes', danger: true, testId: 'wt-discard' },
        { id: 'sep-1', label: '', separator: true },
        { id: 'copy-path', label: 'Copy Path' }
      ]
    });
  }

  /** 分支行上的右键：切换 / 合并 / 删除在前，分隔线后是复制分支名（GitHub Desktop 的分支右键菜单）。 */
  openBranchContextMenu(request: { target: RxDBBranch; event: MouseEvent }) {
    request.event.preventDefault();
    const branch = request.target;
    const items: WorkingTreeContextMenuItem[] = [];
    if (!branch.activated) {
      items.push(
        { id: 'branch-switch', label: 'Switch', testId: 'wt-branch-menu-switch' },
        { id: 'branch-merge', label: `Merge into ${this.$activeBranch()}`, testId: 'wt-branch-menu-merge' },
        { id: 'branch-delete', label: 'Delete', danger: true, testId: 'wt-branch-menu-delete' },
        { id: 'sep-1', label: '', separator: true }
      );
    }
    items.push({ id: 'branch-copy', label: 'Copy branch name', testId: 'wt-branch-menu-copy' });
    this.$contextMenuTarget.set({ kind: 'branch', branchId: branch.id });
    this.$contextMenu.set({ x: request.event.clientX, y: request.event.clientY, items });
  }

  /** 历史行上的右键：动作（恢复）在前，分隔线后是复制提交 id（GitHub Desktop 的菜单顺序）。 */
  openCommitContextMenu(request: WorkingTreeContextMenuRequest<CommitLogEntry>) {
    request.event.preventDefault();
    const items: WorkingTreeContextMenuItem[] = [];
    if (request.target.kind !== 'baseline' && request.target.kind !== 'branch_baseline') {
      items.push(
        { id: 'restore', label: 'Restore this version to working tree', testId: 'wt-restore' },
        { id: 'sep-1', label: '', separator: true }
      );
    }
    items.push({ id: 'copy-commit', label: 'Copy Commit ID' });
    this.$contextMenuTarget.set({ kind: 'commit', commitId: request.target.commitId });
    this.$contextMenu.set({ x: request.event.clientX, y: request.event.clientY, items });
  }

  /** 菜单项被点：按 id 分发动作，然后收起菜单。 */
  handleContextMenuSelect(item: WorkingTreeContextMenuItem) {
    const target = this.$contextMenuTarget();
    this.$contextMenu.set(null);
    this.$contextMenuTarget.set(null);
    if (target === null) return;
    if (item.id === 'discard') {
      void this.runDiscard();
      return;
    }
    if (item.id === 'copy-path') {
      void this.copyText(
        target.kind === 'diff' ?
          gdEntryPath({ namespace: target.namespace, entity: target.entity, entityId: target.entityId })
        : ''
      );
      return;
    }
    if (item.id === 'copy-commit') {
      void this.copyText(target.kind === 'commit' ? target.commitId : '');
      return;
    }
    if (target.kind === 'branch') {
      if (item.id === 'branch-switch') {
        void this.switchBranch(target.branchId);
      } else if (item.id === 'branch-merge') {
        this.openMergeDialog(target.branchId);
      } else if (item.id === 'branch-delete') {
        void this.removeBranch(target.branchId);
      } else if (item.id === 'branch-copy') {
        void this.copyText(target.branchId);
      }
      return;
    }
    if (item.id === 'restore') {
      // 右键不选中行（GitHub Desktop 同款），按右键目标 id 从已读历史里找回条目。
      if (target.kind !== 'commit') return;
      const commits = this.tree.listCommitsState();
      if (commits.phase !== 'success' && commits.phase !== 'empty') return;
      const entry = commits.value.entries.find(candidate => candidate.commitId === target.commitId) ?? null;
      if (entry !== null) void this.restoreEntry(entry);
    }
  }

  /** 写剪贴板 + toast 反馈；失败不假装成功。 */
  async copyText(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.showToast('success', 'Copied to clipboard');
    } catch {
      this.showToast('error', 'Clipboard unavailable — copy failed.');
    }
  }

  // ── 左栏宽度（拖分隔条） ──────────────────────────────────

  /** 键盘调宽：分隔条上的方向键（左 / 右各 16px，Home/End 到边界）。 */
  handleAsideResizeKey(event: KeyboardEvent) {
    const step = 16;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.$asideWidth.set(this.clampAsideWidth(this.$asideWidth() - step));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.$asideWidth.set(this.clampAsideWidth(this.$asideWidth() + step));
    } else if (event.key === 'Home') {
      event.preventDefault();
      this.$asideWidth.set(ASIDE_WIDTH_MIN);
    } else if (event.key === 'End') {
      event.preventDefault();
      this.$asideWidth.set(ASIDE_WIDTH_MAX);
    }
  }

  /** 按住分隔条拖动；move/up 挂 document，拖出组件也不断。 */
  startAsideResize(event: PointerEvent) {
    startDragResize(event, {
      getWidth: () => this.$asideWidth(),
      setWidth: width => this.$asideWidth.set(width),
      min: ASIDE_WIDTH_MIN,
      max: ASIDE_WIDTH_MAX
    });
  }

  /** 拖动工具栏分段分隔条调宽（分支 / 获取两段），宽度限在 200–480px（再窄文案读不了）。 */
  startSectionResize(event: PointerEvent, section: 'branch' | 'fetch') {
    startDragResize(event, {
      getWidth: () => (section === 'branch' ? this.$branchSectionWidth() : this.$fetchSectionWidth()),
      setWidth: width => {
        if (section === 'branch') {
          this.$branchSectionWidth.set(width);
        } else {
          this.$fetchSectionWidth.set(width);
        }
      },
      min: 200,
      max: 480
    });
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
      this.$notice.set('Cannot read the working tree — refresh status before committing.');
      return;
    }
    this.$notice.set(null);
    const summary = this.$commitSummary().trim();
    const description = this.$commitDescription().trim();
    const message = description ? `${summary}\n\n${description}` : summary;
    // GitHub Desktop 的提交失败是对话框，demo 的对应物是 toast：校验类拒绝
    // （空提交 / 空消息）与后端 IO 失败都走这一条，不再有可见的内联错误行。
    let result: CommitResult | null;
    try {
      result = await this.tree.commit(message, {
        ...credentials,
        authorId: AUTHOR_ID,
        operationId: crypto.randomUUID()
      });
    } catch (cause: unknown) {
      if (cause instanceof CommitValidationError) {
        this.showToast('error', COMMIT_REJECTION_TEXT[cause.reason]);
      } else {
        this.showToast('error', cause instanceof Error ? cause.message : 'Commit failed.');
      }
      result = null;
    }
    if (result !== null && !result.ok) {
      this.showToast('error', 'Concurrent conflict: the working tree changed. Retry.');
    }
    if (result?.ok) {
      this.$commitSummary.set('');
      this.$commitDescription.set('');
    }
    await this.refreshStatus();
    await this.readCommits();
  }

  /**
   * 丢弃整棵工作树的未提交改动
   *
   * @remarks
   * 先确认再读凭证：`discard()` 不可撤销且粒度是整棵树，而它唯一的入口是某一行上的右键菜单——
   * 「我只右键了这一行」与「丢的是全部」之间的落差，只有这一步能拦住。条数来自
   * {@link $changesCount}（与 diff 条目同源），读不到时说「所有未提交改动」而不是编一个数字。
   */
  async runDiscard(): Promise<void> {
    const count = this.$changesCount();
    const scope = count === null ? 'all uncommitted changes' : `all ${count} uncommitted changes`;
    if (
      !confirm(
        `Discard ${scope} in the working tree? This covers the whole tree, not just the selected row, and cannot be undone.`
      )
    )
      return;
    const credentials = await this.freshCredentials();
    if (credentials === null) {
      this.$notice.set('Cannot read the working tree — refresh status before discarding.');
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
      this.$notice.set('Cannot read the working tree — refresh status before restoring.');
      return;
    }
    this.$notice.set(null);
    // restore 的入参只有三个捕获位，没有第四个（FR-014 / FR-034：脏与冲突的答案分别是
    // 「拒绝」与「两份都留着」，没有入参可承载）——不带 authorId / operationId。
    const result = await this.tree.restore({ commitId: entry.commitId }, credentials).catch(() => null);
    if (result !== null && !result.ok) {
      this.showToast('error', RESTORE_REJECTION_TEXT[result.reason] ?? `Restore rejected: ${result.reason}`);
    }
    await this.refreshStatus();
  }

  // ── 标签页与选中 ──────────────────────────────────────────

  selectTab(tab: 'changes' | 'history') {
    this.$activeTab.set(tab);
    if (tab !== 'history') return;
    // 第一次进历史页时补一次读取并默认选中最新的提交；读过了就不重复发 IO。
    if (this.tree.listCommitsState().phase === 'idle') {
      void this.readCommits().then(() => this.selectHeadCommitIfNone());
    } else {
      this.selectHeadCommitIfNone();
    }
  }

  selectDiffEntry(entry: WorkingTreeDiffEntry) {
    this.$selectedDiffKey.set(diffEntryKey(entry));
  }

  selectCommit(entry: CommitLogEntry) {
    this.$selectedCommitId.set(entry.commitId);
  }

  // ── 分支操作 ──────────────────────────────────────────────

  async createBranch(name: string) {
    try {
      await this.#rxdb.versionManager.createBranch(name);
      this.$createPopoverOpen.set(false);
      this.$newBranchName.set('');
      this.showToast('success', `Branch "${name}" created.`);
    } catch (e: unknown) {
      this.$branchError.set(e instanceof Error ? e.message : '创建失败');
    }
  }

  /**
   * 切换分支，带 `requireClean`：工作树非空时被 `WorkingTreeDirtyError` 拒掉。
   *
   * 不传 `requireClean` 的话切换照样发生（脏工作树按分支隔离保留，切走再切回原样还在），
   * 但那把「先处理未提交改动」这个 git 流程里最关键的一步藏起来了——demo 要演的就是这一步。
   * 无论成败都收起菜单：点行即切换（GitHub Desktop 同款），收起来让 toast 成为唯一的反馈。
   */
  async switchBranch(branchId: string) {
    this.$branchMenuOpen.set(false);
    try {
      await this.tree.switchBranch(branchId, { requireClean: true });
      this.showToast('success', `Switched to branch "${branchId}".`);
      await this.refreshStatus();
      await this.readCommits();
    } catch (e: unknown) {
      this.showToast(
        'error',
        e instanceof WorkingTreeDirtyError ? DIRTY_SWITCH_TEXT
        : e instanceof Error ? e.message
        : 'Switch failed.'
      );
    }
  }

  async removeBranch(branchId: string) {
    if (!confirm(`确定要删除分支 "${branchId}" 吗？`)) return;
    try {
      await this.#rxdb.versionManager.removeBranch(branchId);
      this.$branchMenuOpen.set(false);
      this.showToast('success', `Branch "${branchId}" deleted.`);
    } catch (e: unknown) {
      this.showToast('error', e instanceof Error ? e.message : 'Delete failed.');
    }
  }

  // ── 合并对话框 ────────────────────────────────────────────

  openMergeDialog(sourceBranchId: string) {
    this.$branchMenuOpen.set(false);
    this.$mergeError.set(null);
    this.$mergeDialog.set({ sourceBranchId, strategy: 'squash', deleteSource: false });
  }

  closeMergeDialog() {
    this.$mergeDialog.set(null);
    this.$mergeError.set(null);
  }

  setMergeStrategy(strategy: MergeDialogState['strategy']) {
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
        `Merged ${result.merged} change(s) into the working tree of ${this.$activeBranch()}` +
          ` — commit to record them${result.sourceDeleted ? '; source branch deleted' : ''}.`
      );
      await this.refreshStatus();
    } catch (e: unknown) {
      this.$mergeError.set(e instanceof Error ? e.message : 'Merge failed.');
    }
  }

  // ── 私有辅助（成员排序规则：私有方法放最后） ──────────────

  private selectHeadCommitIfNone(): void {
    if (this.$selectedCommitId() !== null) return;
    const commits = this.tree.listCommitsState();
    if (commits.phase !== 'success' || commits.value.entries.length === 0) return;
    this.$selectedCommitId.set(commits.value.entries[0].commitId);
  }

  private showToast(type: 'success' | 'error', message: string) {
    this.$toast.set({ type, message });
    this.toastTimer.schedule(() => this.$toast.set(null), 3000);
  }

  /** 按绝对宽度夹回 [MIN, MAX]。 */
  private clampAsideWidth(width: number): number {
    return Math.min(ASIDE_WIDTH_MAX, Math.max(ASIDE_WIDTH_MIN, width));
  }
}
