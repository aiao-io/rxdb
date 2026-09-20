import { RxDBBranch } from '@aiao/rxdb';
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
import { useWorkingTree } from '@aiao/rxdb-plugin-working-tree-react';
import { useFindAll, useRxDB } from '@aiao/rxdb-react';
import { Check, ChevronDown, FolderGit2, GitBranch, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useResettableTimeout } from '../../hooks/useResettableTimeout';
import { WorkingTreeBranchMenu } from './components/BranchMenu';
import { WorkingTreeChangesList, type WorkingTreeContextMenuRequest } from './components/ChangesList';
import { WorkingTreeCommitBox } from './components/CommitBox';
import { WorkingTreeCommitDetail } from './components/CommitDetail';
import {
  WorkingTreeContextMenu,
  type WorkingTreeContextMenuItem,
  type WorkingTreeContextMenuState
} from './components/ContextMenu';
import { WorkingTreeDiffViewer } from './components/DiffViewer';
import { WorkingTreeHistoryList } from './components/HistoryList';
import { WorkingTreeMergeDialog, type MergeDialogState } from './components/MergeDialog';
import { diffEntryKey } from './utils/diff-format';
import { startDragResize } from './utils/drag';
import { gdEntryPath } from './utils/gd';
import { useKeepLastGood } from './utils/keep-last-good';

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

/** 右键菜单目标：分发动作时不再靠菜单文案反查（与 Angular 参考实现同一判别位）。 */
type WorkingTreeContextMenuTarget =
  | {
      readonly kind: 'diff';
      readonly key: string;
      readonly namespace: string;
      readonly entity: string;
      readonly entityId: string;
    }
  | { readonly kind: 'commit'; readonly commitId: string }
  | { readonly kind: 'branch'; readonly branchId: string };

/**
 * 工作树与提交历史页面 —— GitHub Desktop 形态的参考实现（Angular 版的行为级移植）。
 *
 * @remarks
 * 布局模仿 GitHub Desktop 的 Current Repository 视图：顶部一条工具栏（仓库选择器、
 * 分支下拉、本地刷新与上次刷新时间），左侧「更改 / 历史记录」
 * 标签页（文件列表 + 底部提交框），右栏选中项的详情（字段级 hunk diff 或提交详情），
 * 最底部一条窄状态条放 demo 的原始状态读数（分支 / 未提交数 / 干净与否——这些是
 * 仪器不是 UI）。视觉细节（选中行 3px 蓝左边条、hunk 盒子、头像散列取色、蓝底
 * 白字主按钮）见 `styles.css` 里的 `.gd-*` 共享样式。面板没有变更流（见
 * `useWorkingTree` 的 TSDoc），每次命令后仍要手动重读；本页发起的写之后都由
 * `refreshStatus()` 兜这一下。所有 data-testid 与行为契约与 Angular 端逐字节对齐，
 * 由 e2e（working-tree.spec / working-tree.a11y.spec）锁定。
 */
export default function WorkingTreePage(): React.JSX.Element {
  const tree = useWorkingTree();
  const rxdb = useRxDB();
  const branchesResource = useFindAll(RxDBBranch, {
    where: { combinator: 'and', rules: [] },
    orderBy: [{ field: 'createdAt', sort: 'asc' }]
  });
  const branches = branchesResource.value;

  // ── 页面状态 ──────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'changes' | 'history'>('changes');
  const [selectedDiffKey, setSelectedDiffKey] = useState<string | null>(null);
  const [selectedCommitId, setSelectedCommitId] = useState<string | null>(null);
  /** 提交草稿拆成摘要与描述两个框（GitHub Desktop 的 Summary / Description）。 */
  const [commitSummary, setCommitSummary] = useState('');
  const [commitDescription, setCommitDescription] = useState('');
  // 分支菜单：开合、创建弹层、名字与错误都由页面持有，组件只做展示与转发
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [createPopoverOpen, setCreatePopoverOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [branchError, setBranchError] = useState<string | null>(null);
  const [mergeDialog, setMergeDialog] = useState<MergeDialogState | null>(null);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [restoreSession, setRestoreSession] = useState<WorkingTreeRestoreSessionInfo | null>(null);
  const [firstVisibleMs, setFirstVisibleMs] = useState<number | null>(null);
  /** 仓库选择器的开合（工具栏最左的 rxdb-demo 下拉）。 */
  const [repoMenuOpen, setRepoMenuOpen] = useState(false);
  /** 最近一次本地读取的时刻；挂载即 now（Angular 的 ngOnInit 同款，惰性初始化避免渲染期调用 Date.now）。 */
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(() => Date.now());
  /** 工具栏 Fetch 的进行中标志（GitHub Desktop 同款：转 spinner + Fetching…）。 */
  const [fetching, setFetching] = useState(false);
  /** 供「上次获取：N 秒前」用的心跳：15s 一跳，文本不必秒级精确。 */
  const [now, setNow] = useState(Date.now);
  /** 左栏宽度；拖动分隔条调（键盘：分隔条上方向键）。工具栏的仓库段跟着它走。 */
  const [asideWidth, setAsideWidth] = useState(320);
  /** 工具栏分支段的宽度（GitHub Desktop 的固定 230px 起）。 */
  const [branchSectionWidth, setBranchSectionWidth] = useState(230);
  /** 工具栏获取段的宽度。 */
  const [fetchSectionWidth, setFetchSectionWidth] = useState(200);
  /** 右键菜单的开合状态；null = 关着。 */
  const [contextMenu, setContextMenu] = useState<WorkingTreeContextMenuState | null>(null);
  /** 右键菜单对应的目标：分发动作时不再靠菜单文案反查。 */
  const [contextMenuTarget, setContextMenuTarget] = useState<WorkingTreeContextMenuTarget | null>(null);
  // 起点在挂载副作用里取，不在渲染里取：`performance.now()` 是不纯的，
  // 渲染期间调用会随着组件重渲染而漂（react-hooks/purity）。
  const mountedAt = useRef(0);
  const toastTimer = useResettableTimeout();

  const status = tree.statusState;
  const enabledState = tree.isEnabledState;
  const diffState = tree.diffState;
  const listCommitsState = tree.listCommitsState;
  const enabled = enabledState.phase === 'success' && enabledState.value;

  // ── 渲染用保底状态：loading 期间停在上一份已知值（见 useKeepLastGood 的 TSDoc）──
  const displayStatusState = useKeepLastGood(status);
  const displayDiffState = useKeepLastGood(diffState);

  // ── 派生状态 ──────────────────────────────────────────────
  const activeBranch = branches.find(branch => branch.activated)?.id ?? '';

  /** 「更改」标签上的条数徽章；status 里那份 entryCount 与 diff 条目数同源。 */
  const changesCount =
    (
      (displayStatusState.phase === 'success' || displayStatusState.phase === 'empty') &&
      displayStatusState.value.entryCount > 0
    ) ?
      displayStatusState.value.entryCount
    : null;

  /** 工具栏刷新时间随 15s 心跳重算（GitHub Desktop 的 Last fetched 口径）。 */
  let lastFetchedLabel = '—';
  if (lastFetchedAt !== null) {
    const seconds = Math.max(0, Math.floor((now - lastFetchedAt) / 1000));
    if (seconds < 5) {
      lastFetchedLabel = 'just now';
    } else if (seconds < 60) {
      lastFetchedLabel = `${seconds} seconds ago`;
    } else {
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) {
        lastFetchedLabel = `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
      } else {
        const hours = Math.floor(minutes / 60);
        lastFetchedLabel = `${hours} hour${hours === 1 ? '' : 's'} ago`;
      }
    }
  }

  /** 恢复会话警示条的可见性：status 说 restoring / conflicted 才亮。 */
  const showRestoreBanner =
    (displayStatusState.phase === 'success' || displayStatusState.phase === 'empty') &&
    (displayStatusState.value.restoring || displayStatusState.value.conflicted);

  const diffEntries = displayDiffState.phase === 'success' ? displayDiffState.value.entries : [];
  const selectedDiffEntry =
    selectedDiffKey !== null ? (diffEntries.find(entry => diffEntryKey(entry) === selectedDiffKey) ?? null) : null;

  const commitEntries = listCommitsState.phase === 'success' ? listCommitsState.value.entries : [];
  const selectedCommit =
    selectedCommitId !== null ? (commitEntries.find(entry => entry.commitId === selectedCommitId) ?? null) : null;

  // ── 挂载：入口自己不发 IO（见 useWorkingTree 的 TSDoc），读一次状态让面板开箱能说话 ──
  useEffect(() => {
    mountedAt.current = performance.now();
    void tree
      .isEnabled()
      .then(enabledResult => {
        if (enabledResult) void tree.diff().catch(() => undefined);
      })
      .catch(() => undefined);
    void tree.status().catch(() => undefined);
    // 入口对象每次 render 都是新的；这一轮只想在挂载时跑一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 首次可见状态耗时：status 相位第一次离开 idle / loading 时定格（SC-005）。
  const statusPhase = status.phase;
  useEffect(() => {
    if (firstVisibleMs !== null) return;
    if (statusPhase === 'idle' || statusPhase === 'loading') return;
    setFirstVisibleMs(Math.round(performance.now() - mountedAt.current));
  }, [statusPhase, firstVisibleMs]);

  // 刷新时间心跳：15s 一跳（GitHub Desktop 的 Last fetched 不逐秒精确）。
  useEffect(() => {
    const ticker = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(ticker);
  }, []);

  // 列表一刷新就自动选中第一条，右栏不至于空着——GitHub Desktop 打开仓库时
  // 也是默认展示第一个文件的 diff。用户手动选中的键还在列表里就不动它。
  // 读 display 状态：loading 期间列表与详情都停在旧内容，选中键不该跟着清空。
  // （Angular 参考实现的 effect；React 端是「storing information from previous renders」模式。）
  const [previousDisplayDiff, setPreviousDisplayDiff] = useState(displayDiffState);
  if (previousDisplayDiff !== displayDiffState) {
    setPreviousDisplayDiff(displayDiffState);
    const entries = displayDiffState.phase === 'success' ? displayDiffState.value.entries : [];
    const keys = entries.map(diffEntryKey);
    if (selectedDiffKey === null || !keys.includes(selectedDiffKey)) {
      setSelectedDiffKey(keys[0] ?? null);
    }
  }

  // 历史里选中一条提交，就把它动过的变更单元读出来给右侧详情（两栏里的左栏）。
  // 只在选中变化时发 IO：commitChangesState 自己的相位变化不在依赖里。
  const commitChanges = tree.commitChanges;
  useEffect(() => {
    if (selectedCommitId !== null) void commitChanges(selectedCommitId).catch(() => undefined);
  }, [selectedCommitId, commitChanges]);

  // 历史标签页打开时的头提交选中（Angular 的 selectTab → selectHeadCommitIfNone）：
  // 「打开标签页」这一下（activeTab 切到 history）或那次打开触发的补读从 idle 落定
  // 时，没有选中项就默认选最新提交；提交 / 刷新触发的历史重读不清也不改选中。
  // 与 diff 自动选中同款 render 调整模式：两个「上一次」是判定「刚打开 / 刚落定」的锚。
  const [previousTab, setPreviousTab] = useState(activeTab);
  if (previousTab !== activeTab) {
    setPreviousTab(activeTab);
  }
  const [previousCommitsPhase, setPreviousCommitsPhase] = useState(listCommitsState.phase);
  if (previousCommitsPhase !== listCommitsState.phase) {
    setPreviousCommitsPhase(listCommitsState.phase);
  }
  const historyJustOpened = previousTab !== 'history' && activeTab === 'history';
  const commitsJustSettled =
    previousCommitsPhase === 'idle' && (listCommitsState.phase === 'success' || listCommitsState.phase === 'empty');
  if (activeTab === 'history' && (historyJustOpened || commitsJustSettled)) {
    const entries = listCommitsState.phase === 'success' ? listCommitsState.value.entries : [];
    if (selectedCommitId === null && entries.length > 0) {
      setSelectedCommitId(entries[0].commitId);
    }
  }

  // ── 工具栏 ────────────────────────────────────────────────

  const toggleRepoMenu = () => setRepoMenuOpen(open => !open);

  const closeRepoMenu = () => setRepoMenuOpen(false);

  /** 重读本地状态与历史，并更新刷新时间；进行中忽略重复点击（GitHub Desktop 的 Fetching 态）。 */
  const runFetch = async (): Promise<void> => {
    if (fetching) return;
    setFetching(true);
    try {
      await refreshStatus();
      await readCommits();
      setLastFetchedAt(Date.now());
    } finally {
      setFetching(false);
    }
  };

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
  const openChangesContextMenu = (request: WorkingTreeContextMenuRequest<WorkingTreeDiffEntry>) => {
    request.event.preventDefault();
    const entry = request.target;
    setContextMenuTarget({
      kind: 'diff',
      key: diffEntryKey(entry),
      namespace: entry.namespace,
      entity: entry.entity,
      entityId: entry.entityId
    });
    setContextMenu({
      x: request.event.clientX,
      y: request.event.clientY,
      items: [
        { id: 'discard', label: 'Discard All Changes', danger: true, testId: 'wt-discard' },
        { id: 'sep-1', label: '', separator: true },
        { id: 'copy-path', label: 'Copy Path' }
      ]
    });
  };

  /** 分支行上的右键：切换 / 合并 / 删除在前，分隔线后是复制分支名（GitHub Desktop 的分支右键菜单）。 */
  const openBranchContextMenu = (request: { target: RxDBBranch; event: React.MouseEvent }) => {
    request.event.preventDefault();
    const branch = request.target;
    const items: WorkingTreeContextMenuItem[] = [];
    if (!branch.activated) {
      items.push(
        { id: 'branch-switch', label: 'Switch', testId: 'wt-branch-menu-switch' },
        { id: 'branch-merge', label: `Merge into ${activeBranch}`, testId: 'wt-branch-menu-merge' },
        { id: 'branch-delete', label: 'Delete', danger: true, testId: 'wt-branch-menu-delete' },
        { id: 'sep-1', label: '', separator: true }
      );
    }
    items.push({ id: 'branch-copy', label: 'Copy branch name', testId: 'wt-branch-menu-copy' });
    setContextMenuTarget({ kind: 'branch', branchId: branch.id });
    setContextMenu({ x: request.event.clientX, y: request.event.clientY, items });
  };

  /** 历史行上的右键：动作（恢复）在前，分隔线后是复制提交 id（GitHub Desktop 的菜单顺序）。 */
  const openCommitContextMenu = (request: WorkingTreeContextMenuRequest<CommitLogEntry>) => {
    request.event.preventDefault();
    const items: WorkingTreeContextMenuItem[] = [];
    if (request.target.kind !== 'baseline' && request.target.kind !== 'branch_baseline') {
      items.push(
        { id: 'restore', label: 'Restore this version to working tree', testId: 'wt-restore' },
        { id: 'sep-1', label: '', separator: true }
      );
    }
    items.push({ id: 'copy-commit', label: 'Copy Commit ID' });
    setContextMenuTarget({ kind: 'commit', commitId: request.target.commitId });
    setContextMenu({ x: request.event.clientX, y: request.event.clientY, items });
  };

  /** 菜单项被点：按 id 分发动作，然后收起菜单。 */
  const handleContextMenuSelect = (item: WorkingTreeContextMenuItem) => {
    const target = contextMenuTarget;
    setContextMenu(null);
    setContextMenuTarget(null);
    if (target === null) return;
    if (item.id === 'discard') {
      void runDiscard();
      return;
    }
    if (item.id === 'copy-path') {
      void copyText(
        target.kind === 'diff' ?
          gdEntryPath({ namespace: target.namespace, entity: target.entity, entityId: target.entityId })
        : ''
      );
      return;
    }
    if (item.id === 'copy-commit') {
      void copyText(target.kind === 'commit' ? target.commitId : '');
      return;
    }
    if (target.kind === 'branch') {
      if (item.id === 'branch-switch') {
        void switchBranch(target.branchId);
      } else if (item.id === 'branch-merge') {
        openMergeDialog(target.branchId);
      } else if (item.id === 'branch-delete') {
        void removeBranch(target.branchId);
      } else if (item.id === 'branch-copy') {
        void copyText(target.branchId);
      }
      return;
    }
    if (item.id === 'restore') {
      // 右键不选中行（GitHub Desktop 同款），按右键目标 id 从已读历史里找回条目。
      if (target.kind !== 'commit') return;
      const commits = tree.listCommitsState;
      if (commits.phase !== 'success' && commits.phase !== 'empty') return;
      const entry = commits.value.entries.find(candidate => candidate.commitId === target.commitId) ?? null;
      if (entry !== null) void restoreEntry(entry);
    }
  };

  /** 写剪贴板 + toast 反馈；失败不假装成功。 */
  const copyText = async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      showToast('success', 'Copied to clipboard');
    } catch {
      showToast('error', 'Clipboard unavailable — copy failed.');
    }
  };

  // ── 左栏宽度（拖分隔条） ──────────────────────────────────

  /** 按绝对宽度夹回 [MIN, MAX]。 */
  const clampAsideWidth = (width: number): number => Math.min(ASIDE_WIDTH_MAX, Math.max(ASIDE_WIDTH_MIN, width));

  /** 键盘调宽：分隔条上的方向键（左 / 右各 16px，Home/End 到边界）。 */
  const handleAsideResizeKey = (event: React.KeyboardEvent) => {
    const step = 16;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setAsideWidth(clampAsideWidth(asideWidth - step));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      setAsideWidth(clampAsideWidth(asideWidth + step));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setAsideWidth(ASIDE_WIDTH_MIN);
    } else if (event.key === 'End') {
      event.preventDefault();
      setAsideWidth(ASIDE_WIDTH_MAX);
    }
  };

  /** 按住分隔条拖动；move/up 挂 document，拖出组件也不断。 */
  const startAsideResize = (event: React.PointerEvent) => {
    startDragResize(event, {
      getWidth: () => asideWidth,
      setWidth: setAsideWidth,
      min: ASIDE_WIDTH_MIN,
      max: ASIDE_WIDTH_MAX
    });
  };

  /** 拖动工具栏分段分隔条调宽（分支 / 获取两段），宽度限在 200–480px（再窄文案读不了）。 */
  const startSectionResize = (event: React.PointerEvent, section: 'branch' | 'fetch') => {
    startDragResize(event, {
      getWidth: () => (section === 'branch' ? branchSectionWidth : fetchSectionWidth),
      setWidth: width => {
        if (section === 'branch') {
          setBranchSectionWidth(width);
        } else {
          setFetchSectionWidth(width);
        }
      },
      min: 200,
      max: 480
    });
  };

  // `enable()` 自己会重读一次 status，但**不会**重读 isEnabled ——
  // 不补这一句，成功启用之后「提交能力」那行仍然写着「未启用」。
  const runEnable = async (): Promise<void> => {
    await tree.enable().catch(() => undefined);
    await tree.isEnabled().catch(() => undefined);
    await refreshStatus();
    await readCommits();
  };

  /**
   * 重读 status，并顺带刷新紧随其后的两个读数。
   *
   * diff 跟着重读：面板没有变更流（见 `useWorkingTree` 的 TSDoc），本页发起的写
   * （写 Todo、提交、丢弃、合并、恢复）之后不补这一句，「未提交改动」区就会停在旧内容。
   * 恢复会话只在 status 说 restoring / conflicted 时才读：其余时刻多一次 IO 没有意义。
   */
  const refreshStatus = async (): Promise<void> => {
    const fresh = await tree.status().catch(() => null);
    await tree.diff().catch(() => undefined);
    if (fresh !== null && (fresh.restoring || fresh.conflicted)) {
      const session = await tree.restoreSession().catch(() => null);
      setRestoreSession(session);
    } else {
      setRestoreSession(null);
    }
  };

  const readCommits = async (): Promise<void> => {
    await tree.listCommits({ limit: 50 }).catch(() => undefined);
  };

  /**
   * 为下一次命令**现读**一份 status 并取出三个捕获位。
   *
   * 不读状态快照（`statusState`）：上一次命令的收尾刷新可能还在飞行（phase 还是
   * `loading`），快照会读出 null 让命令静默跳过；也可能读到刷新前的旧值，让 CAS 带着
   * 过期的 revision 打出去——两种都表现为「点了没反应」。现读拿到的是事务提交后的
   * 最新值，CAS 要么命中要么得到一次诚实的 conflict（`WorkingTreeCredentials` 的 TSDoc）。
   *
   * 读不到就返回 `null` 而不是补默认值：三个位里任何一个给默认值，都等于让这次
   * 命令跳过一次并发比较。
   */
  const freshCredentials = async (): Promise<WorkingTreeCredentials | null> => {
    const fresh = await tree.status().catch(() => null);
    if (fresh === null) return null;
    return {
      expectedBranch: { branchId: fresh.branchId, activationRevision: fresh.activationRevision },
      expectedHeadRevision: fresh.headRevision,
      expectedWorkingTreeRevision: fresh.workingTreeRevision
    };
  };

  const runCommit = async (): Promise<void> => {
    const credentials = await freshCredentials();
    if (credentials === null) {
      setNotice('Cannot read the working tree — refresh status before committing.');
      return;
    }
    setNotice(null);
    const summary = commitSummary.trim();
    const description = commitDescription.trim();
    const message = description ? `${summary}\n\n${description}` : summary;
    // GitHub Desktop 的提交失败是对话框，demo 的对应物是 toast：校验类拒绝
    // （空提交 / 空消息）与后端 IO 失败都走这一条，不再有可见的内联错误行。
    let result: CommitResult | null;
    try {
      result = await tree.commit(message, {
        ...credentials,
        authorId: AUTHOR_ID,
        operationId: crypto.randomUUID()
      });
    } catch (cause: unknown) {
      if (cause instanceof CommitValidationError) {
        showToast('error', COMMIT_REJECTION_TEXT[cause.reason]);
      } else {
        showToast('error', cause instanceof Error ? cause.message : 'Commit failed.');
      }
      result = null;
    }
    if (result !== null && !result.ok) {
      showToast('error', 'Concurrent conflict: the working tree changed. Retry.');
    }
    if (result?.ok) {
      setCommitSummary('');
      setCommitDescription('');
    }
    await refreshStatus();
    await readCommits();
  };

  /**
   * 丢弃整棵工作树的未提交改动
   *
   * @remarks
   * 先确认再读凭证：`discard()` 不可撤销且粒度是整棵树，而它唯一的入口是某一行上的右键菜单——
   * 「我只右键了这一行」与「丢的是全部」之间的落差，只有这一步能拦住。条数来自
   * `changesCount`（与 diff 条目同源），读不到时说「所有未提交改动」而不是编一个数字。
   */
  const runDiscard = async (): Promise<void> => {
    const scope = changesCount === null ? 'all uncommitted changes' : `all ${changesCount} uncommitted changes`;
    if (
      !window.confirm(
        `Discard ${scope} in the working tree? This covers the whole tree, not just the selected row, and cannot be undone.`
      )
    )
      return;
    const credentials = await freshCredentials();
    if (credentials === null) {
      setNotice('Cannot read the working tree — refresh status before discarding.');
      return;
    }
    setNotice(null);
    await tree.discard(credentials).catch(() => undefined);
    await refreshStatus();
  };

  /**
   * 把历史里某个提交的内容写回工作树（FR-013 的恢复，不是 checkout）。
   *
   * 恢复完的工作树是**脏的**，下一步是 commit() 或 discard()——与手写变更走同一条路，
   * 因此这里刷新 status 与 diff、不刷历史：历史在 commit 之后才会多一行。
   */
  const restoreEntry = async (entry: CommitLogEntry): Promise<void> => {
    const credentials = await freshCredentials();
    if (credentials === null) {
      setNotice('Cannot read the working tree — refresh status before restoring.');
      return;
    }
    setNotice(null);
    // restore 的入参只有三个捕获位，没有第四个（FR-014 / FR-034：脏与冲突的答案分别是
    // 「拒绝」与「两份都留着」，没有入参可承载）——不带 authorId / operationId。
    const result = await tree.restore({ commitId: entry.commitId }, credentials).catch(() => null);
    if (result !== null && !result.ok) {
      showToast('error', RESTORE_REJECTION_TEXT[result.reason] ?? `Restore rejected: ${result.reason}`);
    }
    await refreshStatus();
  };

  // ── 标签页与选中 ──────────────────────────────────────────

  const selectTab = (tab: 'changes' | 'history') => {
    setActiveTab(tab);
    if (tab !== 'history') return;
    // 第一次进历史页时补一次读取并默认选中最新的提交；读过了就不重复发 IO。
    // 「打开标签页」要选头提交这个意图由上面的 render 调整在历史相位落定后兑现。
    if (tree.listCommitsState.phase === 'idle') {
      void readCommits();
    }
  };

  const selectDiffEntry = (entry: WorkingTreeDiffEntry) => {
    setSelectedDiffKey(diffEntryKey(entry));
  };

  const selectCommit = (entry: CommitLogEntry) => {
    setSelectedCommitId(entry.commitId);
  };

  // ── 分支操作 ──────────────────────────────────────────────

  const createBranch = async (name: string) => {
    try {
      await rxdb.versionManager.createBranch(name);
      setCreatePopoverOpen(false);
      setNewBranchName('');
      showToast('success', `Branch "${name}" created.`);
    } catch (e: unknown) {
      setBranchError(e instanceof Error ? e.message : '创建失败');
    }
  };

  /**
   * 切换分支，带 `requireClean`：工作树非空时被 `WorkingTreeDirtyError` 拒掉。
   *
   * 不传 `requireClean` 的话切换照样发生（脏工作树按分支隔离保留，切走再切回原样还在），
   * 但那把「先处理未提交改动」这个 git 流程里最关键的一步藏起来了——demo 要演的就是这一步。
   * 无论成败都收起菜单：点行即切换（GitHub Desktop 同款），收起来让 toast 成为唯一的反馈。
   */
  const switchBranch = async (branchId: string) => {
    setBranchMenuOpen(false);
    try {
      await tree.switchBranch(branchId, { requireClean: true });
      showToast('success', `Switched to branch "${branchId}".`);
      await refreshStatus();
      await readCommits();
    } catch (e: unknown) {
      showToast(
        'error',
        e instanceof WorkingTreeDirtyError ? DIRTY_SWITCH_TEXT
        : e instanceof Error ? e.message
        : 'Switch failed.'
      );
    }
  };

  const removeBranch = async (branchId: string) => {
    if (!window.confirm(`确定要删除分支 "${branchId}" 吗？`)) return;
    try {
      await rxdb.versionManager.removeBranch(branchId);
      setBranchMenuOpen(false);
      showToast('success', `Branch "${branchId}" deleted.`);
    } catch (e: unknown) {
      showToast('error', e instanceof Error ? e.message : 'Delete failed.');
    }
  };

  // ── 合并对话框 ────────────────────────────────────────────

  const openMergeDialog = (sourceBranchId: string) => {
    setBranchMenuOpen(false);
    setMergeError(null);
    setMergeDialog({ sourceBranchId, strategy: 'squash', deleteSource: false });
  };

  const closeMergeDialog = () => {
    setMergeDialog(null);
    setMergeError(null);
  };

  const setMergeStrategy = (strategy: MergeDialogState['strategy']) => {
    setMergeDialog(current => (current === null ? null : { ...current, strategy }));
  };

  const setDeleteSource = (value: boolean) => {
    setMergeDialog(current => (current === null ? null : { ...current, deleteSource: value }));
  };

  /**
   * 执行合并，并把「合并 ≠ 入史」这一步讲给用户。
   *
   * 实测语义（write-entry-matrix 行 2）：合并结果**落入目标分支的工作树**成为未提交单元，
   * 与 `git merge --no-commit` 同构——历史里出现合并节点，是在用户接下来那次 commit() 之后。
   * toast 里点破这一点，否则「合并了怎么历史没变」会像 bug。
   */
  const executeMerge = async () => {
    if (mergeDialog === null) return;
    setMergeError(null);
    try {
      const result = await rxdb.versionManager.mergeBranch(mergeDialog.sourceBranchId, {
        strategy: mergeDialog.strategy,
        deleteSource: mergeDialog.deleteSource
      });
      closeMergeDialog();
      showToast(
        'success',
        `Merged ${result.merged} change(s) into the working tree of ${activeBranch}` +
          ` — commit to record them${result.sourceDeleted ? '; source branch deleted' : ''}.`
      );
      await refreshStatus();
    } catch (e: unknown) {
      setMergeError(e instanceof Error ? e.message : 'Merge failed.');
    }
  };

  // ── Toast ─────────────────────────────────────────────────

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    toastTimer.schedule(() => setToast(null), 3000);
  };

  return (
    <div className='page-host gd-workspace flex h-full flex-col overflow-hidden' data-testid='working-tree-page'>
      {/* GitHub Desktop 没有页面标题栏：标题只留给读屏，视觉上第一行就是工具栏 */}
      <h1 className='sr-only'>工作树与提交历史</h1>

      {enabled ?
        <>
          {/* ═══════════════════ 工具栏：仓库选择器 · 分支选择器 · 获取 origin · 上次获取 ═══════════════════ */}
          {/* GitHub Desktop 的工具栏蓝（$gray-900）：两种主题都保持蓝色；仓库段宽度跟着下面左栏走，
              分支段与获取段右侧各有一条可拖的分隔条调宽。 */}
          <div className='gd-toolbar flex shrink-0 items-stretch'>
            <div className='gd-toolbar-section gd-repository-section relative' style={{ width: asideWidth }}>
              <button
                className='gd-toolbar-select'
                aria-expanded={repoMenuOpen}
                aria-haspopup={true}
                onClick={toggleRepoMenu}
                data-testid='wt-repo-menu'
                type='button'
              >
                <FolderGit2 size={18} />
                <span className='min-w-0 flex-1 text-left'>
                  <small>Current Repository</small>
                  <strong>rxdb-demo</strong>
                </span>
                <ChevronDown size={14} />
              </button>
              {repoMenuOpen && (
                <>
                  {/* GitHub Desktop 的仓库 foldout：整列、全高、贴工具栏下缘，
                      其余区域盖一层黑透明遮罩（源码 foldoutStyle: width=sidebarWidth, height 100%）。 */}
                  <div
                    className='fixed inset-0 z-30'
                    style={{ background: 'rgba(0, 0, 0, 0.35)' }}
                    onClick={closeRepoMenu}
                    onKeyDown={event => {
                      if (event.key === 'Escape') closeRepoMenu();
                    }}
                    aria-label='Close repository menu'
                    role='button'
                    tabIndex={0}
                  ></div>
                  <div
                    className='gd-menu gd-menu-flush absolute top-full left-0 z-40 w-64 overflow-y-auto'
                    style={{
                      height: 'calc(100vh - 50px)',
                      width: asideWidth < MIN_DROPDOWN_WIDTH ? MIN_DROPDOWN_WIDTH : asideWidth
                    }}
                    aria-label='Repository list'
                    data-testid='wt-repo-menu-popup'
                    role='menu'
                  >
                    <div className='gd-menu-header'>Current Repository</div>
                    <button className='gd-menu-row' onClick={closeRepoMenu} type='button'>
                      <FolderGit2 size={14} />
                      <span className='min-w-0 flex-1 truncate text-left'>rxdb-demo</span>
                      <Check className='ml-auto shrink-0 text-[var(--gd-accent)]' size={13} />
                    </button>
                    <div className='gd-menu-divider'></div>
                    <Link className='gd-menu-row' onClick={closeRepoMenu} data-testid='wt-edit-data' to='/todo'>
                      Edit Todo data
                    </Link>
                    <Link className='gd-menu-row' onClick={closeRepoMenu} to='/home'>
                      Back to RxDB Demo
                    </Link>
                  </div>
                </>
              )}
            </div>

            <div className='gd-toolbar-section gd-branch-section' style={{ width: branchSectionWidth }}>
              <WorkingTreeBranchMenu
                activeBranch={activeBranch}
                branchError={branchError}
                branchName={newBranchName}
                branches={branches}
                createOpen={createPopoverOpen}
                menuOpen={branchMenuOpen}
                popupWidth={branchSectionWidth < MIN_DROPDOWN_WIDTH ? MIN_DROPDOWN_WIDTH : branchSectionWidth}
                onBranchErrorChange={setBranchError}
                onBranchNameChange={setNewBranchName}
                onCreateBranch={name => void createBranch(name)}
                onCreateOpenChange={setCreatePopoverOpen}
                onMenuOpenChange={setBranchMenuOpen}
                onMenuRequest={openBranchContextMenu}
                onSwitchBranch={branchId => void switchBranch(branchId)}
              />
            </div>

            {/* 分支段右侧的可拖分隔条（GitHub Desktop 的工具栏分段拖宽）。 */}
            <div
              className='gd-toolbar-handle'
              onPointerDown={event => startSectionResize(event, 'branch')}
              aria-hidden={true}
            ></div>

            {/* 本地工作树没有远端 fetch 能力，这里只重读本地状态；文案对齐 GitHub Desktop
                的 Fetch origin / Last fetched。 */}
            <button
              className='gd-toolbar-refresh gd-toolbar-section'
              style={{ width: fetchSectionWidth }}
              onClick={() => void runFetch()}
              aria-label='Fetch origin（重读本地状态与提交历史）'
              data-testid='wt-refresh-status'
              title='Fetch origin（重读本地状态与提交历史）'
              type='button'
            >
              <RefreshCw className={fetching ? 'animate-spin' : undefined} size={18} />
              <span className='min-w-0 flex-1 text-left'>
                <strong>{fetching ? 'Fetching…' : 'Fetch origin'}</strong>
                <small>{fetching ? 'Fetching changes…' : `Last fetched ${lastFetchedLabel}`}</small>
              </span>
            </button>

            {/* 获取段右侧的可拖分隔条。 */}
            <div
              className='gd-toolbar-handle'
              onPointerDown={event => startSectionResize(event, 'fetch')}
              aria-hidden={true}
            ></div>
          </div>

          {/* ═══════════════════ 主体：左侧标签页 + 右栏详情 ═══════════════════ */}
          <div className='flex min-h-0 flex-1 overflow-hidden'>
            <aside className='gd-sidebar flex shrink-0 flex-col' style={{ width: asideWidth }}>
              {/* GitHub Desktop 的 tab bar：选中项深色字 + 蓝色下划线。Changes / History 面板头
                  都没有刷新按钮（对照过 desktop/desktop 源码），重读走顶部工具栏的「刷新本地状态」。 */}
              <div className='gd-tabs flex shrink-0 items-center border-b' style={{ borderColor: 'var(--gd-border)' }}>
                <div className='flex h-full flex-1 items-center' role='tablist'>
                  <button
                    className={`gd-tab ${activeTab === 'changes' ? 'gd-tab-active' : ''}`}
                    aria-selected={activeTab === 'changes'}
                    onClick={() => selectTab('changes')}
                    data-testid='wt-tab-changes'
                    role='tab'
                    type='button'
                  >
                    Changes
                    {changesCount !== null && <span className='gd-pill'>{changesCount}</span>}
                  </button>
                  <button
                    className={`gd-tab ${activeTab === 'history' ? 'gd-tab-active' : ''}`}
                    aria-selected={activeTab === 'history'}
                    onClick={() => selectTab('history')}
                    data-testid='wt-tab-history'
                    role='tab'
                    type='button'
                  >
                    History
                  </button>
                </div>
              </div>

              {activeTab === 'changes' ?
                <>
                  {showRestoreBanner && (
                    <div className='gd-warn-strip shrink-0' data-testid='wt-restore-session' role='status'>
                      {restoreSession !== null && (
                        <>
                          Restore session in progress from commit
                          <code>{restoreSession.targetCommitId}</code>— commit to complete the restore, discard to
                          cancel it.
                        </>
                      )}
                      {displayStatusState.phase === 'success' && displayStatusState.value.conflicted && (
                        <>
                          The restore session has diverged from the working tree (capture mismatch) — discard to cancel,
                          then restore again.
                        </>
                      )}
                    </div>
                  )}
                  <WorkingTreeChangesList
                    diffState={displayDiffState}
                    selectedKey={selectedDiffKey}
                    onMenuRequest={openChangesContextMenu}
                    onSelectEntry={selectDiffEntry}
                  />
                  <WorkingTreeCommitBox
                    activeBranch={activeBranch}
                    commitState={tree.commitState}
                    description={commitDescription}
                    notice={notice}
                    summary={commitSummary}
                    onCommit={() => void runCommit()}
                    onDescriptionChange={setCommitDescription}
                    onSummaryChange={setCommitSummary}
                  />
                </>
              : <WorkingTreeHistoryList
                  commitsState={listCommitsState}
                  selectedCommitId={selectedCommitId}
                  onMenuRequest={openCommitContextMenu}
                  onSelectEntry={selectCommit}
                />
              }
            </aside>

            {/* 左栏 / 右栏分隔条：按住拖动调宽，方向键也能调（Home/End 到边界） */}
            <button
              className='gd-resizer'
              aria-valuemax={560}
              aria-valuemin={240}
              aria-valuenow={asideWidth}
              onKeyDown={handleAsideResizeKey}
              onPointerDown={startAsideResize}
              aria-label='Resize sidebar'
              aria-orientation='vertical'
              data-testid='wt-aside-resize'
              role='separator'
              type='button'
            ></button>

            <main className='flex min-w-0 flex-1 flex-col overflow-hidden'>
              {activeTab === 'changes' ?
                // 数据在别的页面（如 /todo）产生：本页只做「看」与「提交」，
                // 和 GitHub Desktop 打开一个别人编辑过的仓库是同一件事
                <WorkingTreeDiffViewer entry={selectedDiffEntry} />
              : <WorkingTreeCommitDetail changesState={tree.commitChangesState} commit={selectedCommit} />}
            </main>
          </div>
        </>
      : <>
          {/* ═══════════════════ 初始化石板（GitHub Desktop 的空白石板形态） ═══════════════════ */}
          <div
            className='flex flex-1 flex-col items-center justify-center gap-3 overflow-y-auto p-8'
            style={{ background: 'var(--gd-bg)' }}
          >
            <GitBranch style={{ color: 'var(--gd-muted)' }} size={40} />
            <h2 className='text-xl font-semibold'>Initialize repository</h2>
            <p className='max-w-md text-center text-sm' style={{ color: 'var(--gd-muted)' }}>
              <code>enable()</code> is a one-time database-level switch (v1 has no <code>disable()</code>): once
              enabled, the whole database runs under working-tree semantics and every write is captured as an
              uncommitted change — the equivalent of <code>git init</code>. Empty databases initialize automatically at
              app startup; a database that already contains data still needs this explicit click.
            </p>
            <button className='gd-btn-primary' onClick={() => void runEnable()} data-testid='wt-enable' type='button'>
              Initialize repository (enable)
            </button>
          </div>
        </>
      }

      {/* ═══════════════════ 状态读数（sr-only） ═══════════════════ */}
      {/* GitHub Desktop 没有底部 footer；这些原始读数（相位 / 分支 / 未提交数 / 干净与否 /
          首次可见耗时）是 demo 的仪器不是 UI——e2e 与读屏仍靠它锚定，眼睛看不到。 */}
      <div className='gd-strip sr-only'>
        <div
          className='flex min-w-0 flex-wrap items-center gap-1.5'
          aria-live='polite'
          data-testid='wt-status'
          role='status'
        >
          <span data-testid='wt-status-phase'>{status.phase}</span>
          {status.phase === 'success' || status.phase === 'empty' ?
            <>
              <span className='min-w-0 truncate'>
                {' · 分支'}
                <span className='font-medium' data-testid='wt-status-branch'>
                  {status.value.branchId}
                </span>
                {' · 未提交'}
                <span data-testid='wt-status-entry-count'>{status.value.entryCount}</span>
                {'条 · '}
                <span data-testid='wt-status-clean'>{status.value.clean ? '干净' : '有未提交改动'}</span>
                {' · 远端同步来源'}
                <span data-testid='wt-status-remote-sync'>{status.value.byOrigin.remote_sync}</span>
                {'条'}
              </span>
              {status.value.restoring && (
                <span
                  className='rounded-full border border-amber-400 px-1.5 text-amber-700'
                  data-testid='wt-status-restore'
                >
                  恢复中
                </span>
              )}
              {status.value.conflicted && (
                <span
                  className='rounded-full border border-red-400 px-1.5 text-red-700'
                  data-testid='wt-status-restore'
                >
                  会话分叉
                </span>
              )}
            </>
          : status.phase === 'error' ?
            <span>· 尚未初始化，先点「初始化仓库」</span>
          : null}
        </div>
        <div className='flex shrink-0 items-center gap-3'>
          <span
            className={`rounded-full border px-1.5${enabled ? 'border-green-500 text-green-700' : ''}`}
            data-testid='wt-enabled'
            role='status'
          >
            {enabledState.phase === 'success' ?
              enabledState.value ?
                '已启用'
              : '未启用'
            : enabledState.phase}
          </span>
          <span data-testid='wt-first-visible'>
            首次可见状态耗时：
            <span data-testid='wt-first-visible-ms'>{firstVisibleMs}</span>
            ms
          </span>
          {!enabled && (
            <button
              className='gd-btn-ghost'
              onClick={() => void refreshStatus()}
              data-testid='wt-refresh-status'
              type='button'
            >
              刷新状态
            </button>
          )}
        </div>
      </div>

      {/* ═══════════════════ 右键菜单 ═══════════════════ */}
      <WorkingTreeContextMenu
        menu={contextMenu}
        onCloseRequested={() => setContextMenu(null)}
        onItemSelected={handleContextMenuSelect}
      />

      {/* ═══════════════════ 合并对话框 ═══════════════════ */}
      <WorkingTreeMergeDialog
        activeBranch={activeBranch}
        dialog={mergeDialog}
        error={mergeError}
        onCloseRequested={closeMergeDialog}
        onConfirm={() => void executeMerge()}
        onDeleteSourceChange={setDeleteSource}
        onStrategyChange={setMergeStrategy}
      />

      {/* ═══════════════════ Toast ═══════════════════ */}
      {toast !== null && (
        <div className='toast toast-top toast-end z-50'>
          <div
            className={`alert text-sm ${toast.type === 'error' ? 'alert-error' : 'alert-success'}`}
            data-testid='wt-toast'
            role='status'
          >
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
