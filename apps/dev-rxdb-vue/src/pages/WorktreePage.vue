<script lang="ts" setup>
import { RxDBBranch } from '@aiao/rxdb';
import type {
  CommitLogEntry,
  CommitResult,
  CommitValidationReason,
  WorktreeCredentials,
  WorktreeDiffEntry,
  WorktreeInfo,
  WorktreeQueryState,
  WorktreeRestoreFailureReason,
  WorktreeRestoreSessionInfo
} from '@aiao/rxdb-plugin-worktree';
import {
  CommitValidationError,
  WorktreeActiveError,
  WorktreeBranchNotFoundError,
  WorktreeBranchPinnedError,
  WorktreeDirtyError,
  WorktreeLabelError,
  WorktreeNotFoundError
} from '@aiao/rxdb-plugin-worktree';
import { useWorktree } from '@aiao/rxdb-plugin-worktree-vue';
import { useFindAll, useRxDB } from '@aiao/rxdb-vue';
import { Check, ChevronDown, FolderGit2, GitBranch, RefreshCw } from '@lucide/vue';
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { RouterLink } from 'vue-router';
import BranchMenu from './worktree/components/BranchMenu.vue';
import ChangesList from './worktree/components/ChangesList.vue';
import CommitBox from './worktree/components/CommitBox.vue';
import CommitDetail from './worktree/components/CommitDetail.vue';
import ContextMenu from './worktree/components/ContextMenu.vue';
import DiffViewer from './worktree/components/DiffViewer.vue';
import HistoryList from './worktree/components/HistoryList.vue';
import MergeDialog, { type MergeDialogState } from './worktree/components/MergeDialog.vue';
import WorktreeMenu from './worktree/components/WorktreeMenu.vue';
import type {
  WorktreeContextMenuItem,
  WorktreeContextMenuRequest,
  WorktreeContextMenuState
} from './worktree/utils/context-menu';
import { diffEntryKey } from './worktree/utils/diff-format';
import { startDragResize } from './worktree/utils/drag';
import { gdEntryPath } from './worktree/utils/gd';
import type { WorktreeCreateRequest } from './worktree/utils/worktree-menu';

const AUTHOR_ID = 'demo-author';

/** 左栏宽度下限 / 上限：太窄列表读不了，太宽把右栏挤没。 */
const ASIDE_WIDTH_MIN = 240;
const ASIDE_WIDTH_MAX = 560;

/** 下拉面板的最小宽度：跟触发按钮同宽，但窄到读不了时保底一整列的宽度。 */
const MIN_DROPDOWN_WIDTH = 320;

/** `restore()` 的四个被拒成因 → 用户能看懂的提示。 */
const RESTORE_REJECTION_TEXT: Record<WorktreeRestoreFailureReason, string> = {
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

/** 移除有未提交改动的 worktree 被拒（git 同款）：删行不丢数据，但那些改动从此只能经分支菜单找回。 */
const DIRTY_REMOVE_TEXT =
  'This worktree has uncommitted changes. Switch to it and commit or discard them before removing it.';

/** 当前所在的 worktree 删不掉（界面上它的移除按钮本就禁用，这条兜的是并发切换后的旧列表）。 */
const ACTIVE_REMOVE_TEXT = 'This is the current worktree. Switch to another worktree before removing it.';

/** label 给了却全是空白（`WorktreeLabelError`）：核心原样保存 label，不替用户把它换成「没起名」。 */
const LABEL_INVALID_TEXT = "A worktree label can't be only spaces. Leave it empty to show the branch name.";

/** 要切 / 要删的 worktree 已经不在了（`WorktreeNotFoundError`）：多半是别的标签页刚删了它。 */
const WORKTREE_NOT_FOUND_TEXT = 'This worktree no longer exists.';

/** 要钉的分支不存在（`WorktreeBranchNotFoundError`）：多半是别处刚删了它。 */
const branchNotFoundText = (branchId: string): string => `Branch "${branchId}" no longer exists.`;

/** 工具栏 worktree 段的宽度（固定；与分支段同起点）。 */
const WORKTREE_SECTION_WIDTH = 220;

/**
 * worktree 段的收缩权重：工具栏放不下时几乎由它独自让出空间。
 *
 * 仓库 / 分支 / 获取三段的宽度是用户拖出来的（或跟着左栏走），被等比压缩等于不认那次拖动；
 * worktree 段是固定宽、label 本就截断显示，让它先收缩代价最小。
 */
const WORKTREE_SECTION_SHRINK = 100;

/**
 * 工作树与提交历史页面 —— GitHub Desktop 形态的参考实现（Vue 端）。
 *
 * @remarks
 * 布局模仿 GitHub Desktop 的 Current Repository 视图：顶部一条工具栏（仓库选择器、
 * 分支下拉、本地刷新与上次刷新时间），左侧「更改 / 历史记录」
 * 标签页（文件列表 + 底部提交框），右栏选中项的详情（字段级 hunk diff 或提交详情），
 * 最底部一条窄状态条放 demo 的原始状态读数（分支 / 未提交数 / 干净与否——这些是
 * 仪器不是 UI）。视觉细节（选中行 3px 蓝左边条、hunk 盒子、头像散列取色、蓝底
 * 白字主按钮）见 `styles.css` 里的 `.gd-*` 共享样式。worktree 列表是实时的（挂载时读过一次
 * 之后，跟随 worktree 行与当前分支的变化自动重读），其余读数没有变更流（见 `useWorktree` 的
 * TSDoc），命令后仍要手动重读：本页发起的写之后由 `refreshStatus()` 兜这一下，切换成功之后由
 * `refreshAfterSwitch()` 补页面自己的读数。
 */
const rxdb = useRxDB();
const tree = useWorktree();

const branches = useFindAll(RxDBBranch, {
  where: { combinator: 'and', rules: [] },
  orderBy: [{ field: 'createdAt', sort: 'asc' }]
});

// ── 页面状态 ──────────────────────────────────────────────
const activeTab = ref<'changes' | 'history'>('changes');
const selectedDiffKey = ref<string | null>(null);
const selectedCommitId = ref<string | null>(null);
/** 提交草稿拆成摘要与描述两个框（GitHub Desktop 的 Summary / Description）。 */
const commitSummary = ref('');
const commitDescription = ref('');
// 分支菜单：开合、创建弹层、名字与错误都交给 branch-menu 组件用 v-model 双向持有
const branchMenuOpen = ref(false);
const createPopoverOpen = ref(false);
const newBranchName = ref('');
const branchError = ref<string | null>(null);
/** 本页发起的分支命令（创建 / 切换 / 删除）在飞；`createBranch` / `removeBranch` 不经任何状态追踪，只能靠它。 */
const branchInFlight = ref(false);
// worktree 菜单（US-310）：开合、创建弹层与它的就地错误由 WorktreeMenu 组件用 v-model 双向持有
const worktreeMenuOpen = ref(false);
const worktreeCreateOpen = ref(false);
const worktreeError = ref<string | null>(null);
/** 本页发起的 worktree 命令在飞；new 模式先走的 `versionManager.createBranch` 不经任何状态追踪，只能靠它。 */
const worktreeInFlight = ref(false);
const mergeDialog = ref<MergeDialogState | null>(null);
/** 应用内确认框请求（替代原生 confirm）。 */
const confirmRequest = ref<{ kind: 'discard'; message: string } | { kind: 'delete-branch'; branchId: string } | null>(
  null
);
const mergeError = ref<string | null>(null);
const toast = ref<{ type: 'success' | 'error'; message: string } | null>(null);
const notice = ref<string | null>(null);
const restoreSession = ref<WorktreeRestoreSessionInfo | null>(null);
const firstVisibleMs = ref<number | null>(null);
/** 仓库选择器的开合（工具栏最左的 rxdb-demo 下拉）。 */
const repoMenuOpen = ref(false);
/** 最近一次本地读取的时刻。 */
const lastFetchedAt = ref<number | null>(null);
/** 工具栏 Fetch 的进行中标志（GitHub Desktop 同款：转 spinner + Fetching…）。 */
const fetching = ref(false);
/** 供「上次获取：N 秒前」用的心跳：15s 一跳，文本不必秒级精确。 */
const now = ref(Date.now());
/** 左栏宽度；拖动分隔条调（键盘：分隔条上方向键）。工具栏的仓库段跟着它走。 */
const asideWidth = ref(320);
/** 工具栏分支段的宽度（GitHub Desktop 的固定 230px 起）。 */
const branchSectionWidth = ref(230);
/** 工具栏获取段的宽度。 */
const fetchSectionWidth = ref(200);
/** 右键菜单的开合状态；null = 关着。 */
const contextMenu = ref<WorktreeContextMenuState | null>(null);
/** 右键菜单对应的目标：分发动作时不再靠菜单文案反查。 */
const contextMenuTarget = ref<
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

// ── 计时与清理 ────────────────────────────────────────────
/** 首次可见耗时从 setup 那一刻起算。 */
const mountedAt = performance.now();
let toastTimer: ReturnType<typeof setTimeout> | null = null;
/** 上次刷新的相对时间心跳；卸载时清掉。 */
const fetchedTicker = setInterval(() => {
  now.value = Date.now();
}, 15000);

onBeforeUnmount(() => {
  if (toastTimer !== null) clearTimeout(toastTimer);
  clearInterval(fetchedTicker);
});

// ── 派生状态 ──────────────────────────────────────────────
/** 模板读状态用；语义与 Angular 模板里的 `@let status = tree.statusState()` 一致。 */
const statusState = computed(() => tree.statusState.value);
const enabledState = computed(() => tree.isEnabledState.value);

const activeBranch = computed(() => branches.value.find(b => b.activated)?.id ?? '');

/**
 * worktree 列表的渲染保底：loading 期间停在上一份非 loading 状态（Angular / React 的 keepLastGood 同款），
 * 重读时菜单与读数不会闪成「一个都没有」。
 */
const lastWorktreesState = shallowRef<WorktreeQueryState<readonly WorktreeInfo[]>>(tree.listWorktreesState.value);
watch(
  () => tree.listWorktreesState.value,
  state => {
    if (state.phase !== 'loading') lastWorktreesState.value = state;
  }
);

/** 正在显示的 worktree 列表状态：loading 期间是上一份非 loading 状态。 */
const displayedWorktreesState = computed(() => {
  const current = tree.listWorktreesState.value;
  return current.phase === 'loading' ? lastWorktreesState.value : current;
});

/** worktree 列表；还没读到或读取失败时是空数组（菜单显示「No worktrees yet」/ 报错块，触发按钮回退到分支名）。 */
const worktreeList = computed<readonly WorktreeInfo[]>(() => {
  const state = displayedWorktreesState.value;
  return state.phase === 'success' || state.phase === 'empty' ? state.value : [];
});

/** 列表读取失败的提示（菜单里替换整个列表，带 Retry）；没失败时为 null。 */
const worktreeListError = computed(() => {
  const state = displayedWorktreesState.value;
  return state.phase === 'error' ? `Couldn't load worktrees. ${state.error.message}` : null;
});

/**
 * worktree 菜单的忙碌态：本页发起的命令在飞，或命令层三个 worktree 命令之一还在 loading。
 * 页面标志不能省：new 模式里先走的 `createBranch` 不在任何状态里。
 */
const worktreeBusy = computed(
  () =>
    worktreeInFlight.value ||
    tree.createWorktreeState.value.phase === 'loading' ||
    tree.switchWorktreeState.value.phase === 'loading' ||
    tree.removeWorktreeState.value.phase === 'loading'
);

/** 分支菜单的忙碌态：同上，状态里只有 `switchBranch` 一格。 */
const branchBusy = computed(() => branchInFlight.value || tree.switchBranchState.value.phase === 'loading');

/** 「更改」标签上的条数徽章；status 里那份 entryCount 与 diff 条目数同源。 */
const changesCount = computed(() => {
  const status = tree.statusState.value;
  if (status.phase !== 'success' && status.phase !== 'empty') return null;
  return status.value.entryCount > 0 ? status.value.entryCount : null;
});

/** 工具栏刷新时间随 15s 心跳重算（GitHub Desktop 的 Last fetched 口径）。 */
const lastFetchedLabel = computed(() => {
  const at = lastFetchedAt.value;
  if (at === null) return '—';
  const seconds = Math.max(0, Math.floor((now.value - at) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'} ago`;
});

/** 恢复会话警示条的可见性：status 说 restoring / conflicted 才亮。 */
const showRestoreBanner = computed(() => {
  const status = tree.statusState.value;
  if (status.phase !== 'success' && status.phase !== 'empty') return false;
  return status.value.restoring || status.value.conflicted;
});

const selectedDiffEntry = computed(() => {
  const diff = tree.diffState.value;
  if (diff.phase !== 'success') return null;
  const key = selectedDiffKey.value;
  return diff.value.entries.find(entry => diffEntryKey(entry) === key) ?? null;
});

const selectedCommit = computed(() => {
  const commits = tree.listCommitsState.value;
  if (commits.phase !== 'success') return null;
  const id = selectedCommitId.value;
  return commits.value.entries.find(entry => entry.commitId === id) ?? null;
});

// ── 响应式联动（Angular 的 effect 等价物） ──────────────────
// 首次可见耗时：status 相位第一次离开 idle/loading 时定格。
watch(
  () => tree.statusState.value.phase,
  phase => {
    if (firstVisibleMs.value !== null) return;
    if (phase === 'idle' || phase === 'loading') return;
    firstVisibleMs.value = Math.round(performance.now() - mountedAt);
  }
);
// 列表一刷新就自动选中第一条，右栏不至于空着——GitHub Desktop 打开仓库时
// 也是默认展示第一个文件的 diff。用户手动选中的键还在列表里就不动它。
watch(
  () => tree.diffState.value,
  diff => {
    const entries = diff.phase === 'success' ? diff.value.entries : [];
    const keys = entries.map(diffEntryKey);
    const current = selectedDiffKey.value;
    if (current !== null && keys.includes(current)) return;
    selectedDiffKey.value = keys[0] ?? null;
  }
);
// 历史里选中一条提交，就把它动过的变更单元读出来给右侧详情（两栏里的左栏）。
// 只在选中变化时发 IO：commitChangesState 自己的相位变化不在依赖里。
watch(selectedCommitId, id => {
  if (id !== null) void tree.commitChanges(id).catch(() => undefined);
});

// 面板初始化后主动读一次状态：入口自己不发 IO（见它的 TSDoc），而一个开着却说不出
// 「现在脏不脏」的面板，正是 SC-005 要防的那种「核心很快、UI 没反应」。
onMounted(() => {
  // 挂载时读取本地状态，刷新时间从这一刻起算。
  lastFetchedAt.value = Date.now();
  void tree
    .isEnabled()
    .then(enabled => {
      if (enabled) void tree.diff().catch(() => undefined);
    })
    .catch(() => undefined);
  void tree.status().catch(() => undefined);
  // worktree 列表不等 isEnabled：读过一次才开始跟随。未启用时这一次落进 error 相位（工具栏此时不渲染，
  // 看不见），启用之后 `enable()` 的重读与启用通知会把它拉成真实列表——手动初始化不必再补读。
  // 吞错口径同上：失败已经落进 `listWorktreesState`，菜单里有报错块与 Retry。
  void tree.listWorktrees().catch(() => undefined);
});

// ── 工具栏 ────────────────────────────────────────────────

function toggleRepoMenu(): void {
  repoMenuOpen.value = !repoMenuOpen.value;
}

function closeRepoMenu(): void {
  repoMenuOpen.value = false;
}

/** 重读本地状态与历史，并更新刷新时间；进行中忽略重复点击（GitHub Desktop 的 Fetching 态）。 */
async function runFetch(): Promise<void> {
  if (fetching.value) return;
  fetching.value = true;
  try {
    await refreshStatus();
    await readCommits();
    lastFetchedAt.value = Date.now();
  } finally {
    fetching.value = false;
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
function openChangesContextMenu(request: WorktreeContextMenuRequest<WorktreeDiffEntry>): void {
  request.event.preventDefault();
  const entry = request.target;
  contextMenuTarget.value = {
    kind: 'diff',
    key: diffEntryKey(entry),
    namespace: entry.namespace,
    entity: entry.entity,
    entityId: entry.entityId
  };
  contextMenu.value = {
    x: request.event.clientX,
    y: request.event.clientY,
    items: [
      { id: 'discard', label: 'Discard All Changes', danger: true, testId: 'wt-discard' },
      { id: 'sep-1', label: '', separator: true },
      { id: 'copy-path', label: 'Copy Path' }
    ]
  };
}

/** 分支行上的右键：切换 / 合并 / 删除在前，分隔线后是复制分支名（GitHub Desktop 的分支右键菜单）。 */
function openBranchContextMenu(request: { target: RxDBBranch; event: MouseEvent }): void {
  request.event.preventDefault();
  const branch = request.target;
  const items: WorktreeContextMenuItem[] = [];
  if (!branch.activated) {
    items.push(
      { id: 'branch-switch', label: 'Switch', testId: 'wt-branch-menu-switch' },
      { id: 'branch-merge', label: `Merge into ${activeBranch.value}`, testId: 'wt-branch-menu-merge' },
      { id: 'branch-delete', label: 'Delete', danger: true, testId: 'wt-branch-menu-delete' },
      { id: 'sep-1', label: '', separator: true }
    );
  }
  items.push({ id: 'branch-copy', label: 'Copy branch name', testId: 'wt-branch-menu-copy' });
  contextMenuTarget.value = { kind: 'branch', branchId: branch.id };
  contextMenu.value = { x: request.event.clientX, y: request.event.clientY, items };
}

/** 历史行上的右键：动作（恢复）在前，分隔线后是复制提交 id（GitHub Desktop 的菜单顺序）。 */
function openCommitContextMenu(request: WorktreeContextMenuRequest<CommitLogEntry>): void {
  request.event.preventDefault();
  const items: WorktreeContextMenuItem[] = [];
  if (request.target.kind !== 'baseline' && request.target.kind !== 'branch_baseline') {
    items.push(
      { id: 'restore', label: 'Restore this version to working tree', testId: 'wt-restore' },
      { id: 'sep-1', label: '', separator: true }
    );
  }
  items.push({ id: 'copy-commit', label: 'Copy Commit ID' });
  contextMenuTarget.value = { kind: 'commit', commitId: request.target.commitId };
  contextMenu.value = { x: request.event.clientX, y: request.event.clientY, items };
}

/** 菜单项被点：按 id 分发动作，然后收起菜单。 */
function handleContextMenuSelect(item: WorktreeContextMenuItem): void {
  const target = contextMenuTarget.value;
  contextMenu.value = null;
  contextMenuTarget.value = null;
  if (target === null) return;
  if (item.id === 'discard') {
    void requestDiscard();
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
      requestRemoveBranch(target.branchId);
    } else if (item.id === 'branch-copy') {
      void copyText(target.branchId);
    }
    return;
  }
  if (item.id === 'restore') {
    // 右键不选中行（GitHub Desktop 同款），按右键目标 id 从已读历史里找回条目。
    if (target.kind !== 'commit') return;
    const commits = tree.listCommitsState.value;
    if (commits.phase !== 'success' && commits.phase !== 'empty') return;
    const entry = commits.value.entries.find(candidate => candidate.commitId === target.commitId) ?? null;
    if (entry !== null) void restoreEntry(entry);
  }
}

/** 写剪贴板 + toast 反馈；失败不假装成功。 */
async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    showToast('success', 'Copied to clipboard');
  } catch {
    showToast('error', 'Clipboard unavailable — copy failed.');
  }
}

// ── 左栏宽度（拖分隔条） ──────────────────────────────────

/** 键盘调宽：分隔条上的方向键（左 / 右各 16px，Home/End 到边界）。 */
function handleAsideResizeKey(event: KeyboardEvent): void {
  const step = 16;
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    asideWidth.value = clampAsideWidth(asideWidth.value - step);
  } else if (event.key === 'ArrowRight') {
    event.preventDefault();
    asideWidth.value = clampAsideWidth(asideWidth.value + step);
  } else if (event.key === 'Home') {
    event.preventDefault();
    asideWidth.value = ASIDE_WIDTH_MIN;
  } else if (event.key === 'End') {
    event.preventDefault();
    asideWidth.value = ASIDE_WIDTH_MAX;
  }
}

/** 按住分隔条拖动；move/up 挂 document，拖出组件也不断。 */
function startAsideResize(event: PointerEvent): void {
  startDragResize(event, {
    getWidth: () => asideWidth.value,
    setWidth: width => {
      asideWidth.value = width;
    },
    min: ASIDE_WIDTH_MIN,
    max: ASIDE_WIDTH_MAX
  });
}

/** 拖动工具栏分段分隔条调宽（分支 / 获取两段），宽度限在 200–480px（再窄文案读不了）。 */
function startSectionResize(event: PointerEvent, section: 'branch' | 'fetch'): void {
  startDragResize(event, {
    getWidth: () => (section === 'branch' ? branchSectionWidth.value : fetchSectionWidth.value),
    setWidth: width => {
      if (section === 'branch') {
        branchSectionWidth.value = width;
      } else {
        fetchSectionWidth.value = width;
      }
    },
    min: 200,
    max: 480
  });
}

// `enable()` 自己会重读一次 status（读过列表的话也重读列表），但**不会**重读 isEnabled ——
// 不补这一句，成功启用之后「提交能力」那行仍然写着「未启用」。
async function runEnable(): Promise<void> {
  await tree.enable().catch(() => undefined);
  await tree.isEnabled().catch(() => undefined);
  await refreshStatus();
  await readCommits();
}

/**
 * 重读 status，并顺带刷新紧随其后的两个读数。
 *
 * diff 跟着重读：面板没有变更流（见 `useWorktree` 的 TSDoc），本页发起的写
 * （写 Todo、提交、丢弃、合并、恢复）之后不补这一句，「未提交改动」区就会停在旧内容。
 * 恢复会话只在 status 说 restoring / conflicted 时才读：其余时刻多一次 IO 没有意义。
 */
async function refreshStatus(): Promise<void> {
  const status = await tree.status().catch(() => null);
  await tree.diff().catch(() => undefined);
  await readRestoreSession(status !== null && (status.restoring || status.conflicted));
}

/** 读恢复会话；`needed` 为假时直接清空，不白发一次 IO。 */
async function readRestoreSession(needed: boolean): Promise<void> {
  restoreSession.value = needed ? await tree.restoreSession().catch(() => null) : null;
}

async function readCommits(): Promise<void> {
  await tree.listCommits({ limit: 50 }).catch(() => undefined);
}

/**
 * 切换成功之后（分支菜单、worktree 菜单、创建即切换）只重读页面自己的读数：diff、恢复会话、历史。
 *
 * status 不在这里读：命令层在切换成功后已经重读过它；worktree 列表也不读——它是实时的。
 * 恢复会话因此没有现读的 status 可判，直接读：没有会话时它是一次返回 null 的 empty 查询，
 * 比为了这一判再读一轮 status 便宜。
 */
async function refreshAfterSwitch(): Promise<void> {
  await tree.diff().catch(() => undefined);
  await readRestoreSession(true);
  await readCommits();
}

/**
 * worktree 菜单报错块上的 Retry：重读列表。
 *
 * 除了挂载那一次，这是唯一的手动重读——worktree 命令之后命令层自己重读，分支切换 / 删除与启用
 * 由实时列表跟随。失败被吞掉：它已经落进 `listWorktreesState` 的 error 相位，报错块还在。
 */
function retryWorktreeList(): void {
  void tree.listWorktrees().catch(() => undefined);
}

/**
 * 为下一次命令**现读**一份 status 并取出三个捕获位。
 *
 * 不读状态快照（`statusState`）：上一次命令的收尾刷新可能还在飞行（phase 还是
 * `loading`），快照会读出 null 让命令静默跳过；也可能读到刷新前的旧值，让 CAS 带着
 * 过期的 revision 打出去——两种都表现为「点了没反应」。现读拿到的是事务提交后的
 * 最新值，CAS 要么命中要么得到一次诚实的 conflict（`WorktreeCredentials` 的 TSDoc）。
 *
 * 读不到就返回 `null` 而不是补默认值：三个位里任何一个给默认值，都等于让这次
 * 命令跳过一次并发比较。
 */
async function freshCredentials(): Promise<WorktreeCredentials | null> {
  const status = await tree.status().catch(() => null);
  if (status === null) return null;
  return {
    expectedBranch: { branchId: status.branchId, activationRevision: status.activationRevision },
    expectedHeadRevision: status.headRevision,
    expectedWorktreeRevision: status.workingTreeRevision
  };
}

async function runCommit(): Promise<void> {
  const credentials = await freshCredentials();
  if (credentials === null) {
    notice.value = 'Cannot read the working tree — refresh status before committing.';
    return;
  }
  notice.value = null;
  const summary = commitSummary.value.trim();
  const description = commitDescription.value.trim();
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
    commitSummary.value = '';
    commitDescription.value = '';
  }
  await refreshStatus();
  await readCommits();
}

/**
 * 丢弃整棵工作树的未提交改动
 *
 * @remarks
 * 先读条数再确认、确认后才读凭证：`discard()` 不可撤销且粒度是整棵树，而它唯一的入口是某一行上的
 * 右键菜单——「我只右键了这一行」与「丢的是全部」之间的落差，只有这一步能拦住。条数**现读**
 * 一份 status（与 diff 条目同源），读不到时回落 {@link changesCount} 快照、再读不到说
 * 「所有未提交改动」而不是编一个数字。
 */
/** 打开应用内确认框（替代原生 confirm：移动端样式割裂、iOS 文案截断）。 */
async function requestDiscard(): Promise<void> {
  // 确认框里的条数**现读一份**：fetch 的 status 可能还在飞行，快照会读出 null 让文案
  // 漏掉数字；现读拿到的才是丢弃这一刻的真实条数。读不到才回落快照，绝不编数字。
  const freshStatus = await tree.status().catch(() => null);
  const count = freshStatus !== null && freshStatus.entryCount > 0 ? freshStatus.entryCount : changesCount.value;
  const scope = count === null ? 'all uncommitted changes' : `all ${count} uncommitted changes`;
  confirmRequest.value = {
    kind: 'discard',
    message: `Discard ${scope} in the working tree? This covers the whole tree, not just the selected row, and cannot be undone.`
  };
}

async function runDiscard(): Promise<void> {
  const credentials = await freshCredentials();
  if (credentials === null) {
    notice.value = 'Cannot read the working tree — refresh status before discarding.';
    return;
  }
  notice.value = null;
  await tree.discard(credentials).catch(() => undefined);
  await refreshStatus();
}

/**
 * 把历史里某个提交的内容写回工作树（FR-013 的恢复，不是 checkout）。
 *
 * 恢复完的工作树是**脏的**，下一步是 commit() 或 discard()——与手写变更走同一条路，
 * 因此这里刷新 status 与 diff、不刷历史：历史在 commit 之后才会多一行。
 */
async function restoreEntry(entry: CommitLogEntry): Promise<void> {
  const credentials = await freshCredentials();
  if (credentials === null) {
    notice.value = 'Cannot read the working tree — refresh status before restoring.';
    return;
  }
  notice.value = null;
  // restore 的入参只有三个捕获位，没有第四个（FR-014 / FR-034：脏与冲突的答案分别是
  // 「拒绝」与「两份都留着」，没有入参可承载）——不带 authorId / operationId。
  const result = await tree.restore({ commitId: entry.commitId }, credentials).catch(() => null);
  if (result !== null && !result.ok) {
    showToast('error', RESTORE_REJECTION_TEXT[result.reason] ?? `Restore rejected: ${result.reason}`);
  }
  await refreshStatus();
}

// ── 标签页与选中 ──────────────────────────────────────────

function selectTab(tab: 'changes' | 'history'): void {
  activeTab.value = tab;
  if (tab !== 'history') return;
  // 第一次进历史页时补一次读取并默认选中最新的提交；读过了就不重复发 IO。
  if (tree.listCommitsState.value.phase === 'idle') {
    void readCommits().then(() => selectHeadCommitIfNone());
  } else {
    selectHeadCommitIfNone();
  }
}

function selectDiffEntry(entry: WorktreeDiffEntry): void {
  selectedDiffKey.value = diffEntryKey(entry);
}

function selectCommit(entry: CommitLogEntry): void {
  selectedCommitId.value = entry.commitId;
}

// ── 分支操作 ──────────────────────────────────────────────

async function createBranch(name: string): Promise<void> {
  if (branchBusy.value) return;
  branchInFlight.value = true;
  try {
    await rxdb.versionManager.createBranch(name);
    createPopoverOpen.value = false;
    newBranchName.value = '';
    showToast('success', `Branch "${name}" created.`);
  } catch (e: unknown) {
    branchError.value = e instanceof Error ? e.message : '创建失败';
  } finally {
    branchInFlight.value = false;
  }
}

/**
 * 切换分支，带 `requireClean`：工作树非空时被 `WorktreeDirtyError` 拒掉。
 *
 * 不传 `requireClean` 的话切换照样发生（脏工作树按分支隔离保留，切走再切回原样还在），
 * 但那把「先处理未提交改动」这个 git 流程里最关键的一步藏起来了——demo 要演的就是这一步。
 * 无论成败都收起菜单：点行即切换（GitHub Desktop 同款），收起来让 toast 成为唯一的反馈。
 * worktree 菜单的 active 勾选由实时列表跟随，这里不重读列表。
 */
async function switchBranch(branchId: string): Promise<void> {
  if (branchBusy.value) return;
  branchMenuOpen.value = false;
  branchInFlight.value = true;
  try {
    await tree.switchBranch(branchId, { requireClean: true });
    showToast('success', `Switched to branch "${branchId}".`);
    await refreshAfterSwitch();
  } catch (e: unknown) {
    showToast(
      'error',
      e instanceof WorktreeDirtyError ? DIRTY_SWITCH_TEXT
      : e instanceof Error ? e.message
      : 'Switch failed.'
    );
  } finally {
    branchInFlight.value = false;
  }
}

function requestRemoveBranch(branchId: string): void {
  if (branchBusy.value) return;
  confirmRequest.value = { kind: 'delete-branch', branchId };
}

/** 删分支；钉在它上面的 worktree 行被连带删掉，worktree 菜单由实时列表跟随，这里不重读列表。 */
async function removeBranch(branchId: string): Promise<void> {
  if (branchBusy.value) return;
  branchInFlight.value = true;
  try {
    await rxdb.versionManager.removeBranch(branchId);
    branchMenuOpen.value = false;
    showToast('success', `Branch "${branchId}" deleted.`);
  } catch (e: unknown) {
    showToast('error', e instanceof Error ? e.message : 'Delete failed.');
  } finally {
    branchInFlight.value = false;
  }
}

// ── worktree 操作（US-310） ───────────────────────────────

/**
 * 切到一个 worktree：**不带** `requireClean`。
 *
 * 与分支菜单的 `switchBranch` 相反：worktree 的未提交改动按分支隔离保存，切走再切回原样还在——
 * 这正是 worktree 相对「切分支前先提交 / 丢弃」的价值。无论成败都收起菜单，让 toast 成为唯一的反馈。
 */
async function switchWorktree(id: string): Promise<void> {
  if (worktreeBusy.value) return;
  worktreeMenuOpen.value = false;
  const name = worktreeName(id);
  worktreeInFlight.value = true;
  try {
    await tree.switchWorktree(id);
    showToast('success', `Switched to worktree "${name}".`);
    await refreshAfterSwitch();
  } catch (e: unknown) {
    showToast('error', worktreeErrorText(e, 'Switch failed.'));
  } finally {
    worktreeInFlight.value = false;
  }
}

/**
 * 建 worktree：`new` 模式先 `createBranch`（FR-017：会复制当前未提交改动），再钉住；创建即切换。
 *
 * 建分支失败（名字已占用等）就地显示在弹层里、不关弹层；钉住阶段的拒绝走 toast。
 */
async function createWorktree(request: WorktreeCreateRequest): Promise<void> {
  if (worktreeBusy.value) return;
  worktreeError.value = null;
  worktreeInFlight.value = true;
  try {
    if (request.mode === 'new' && !(await createBranchForWorktree(request.branchId))) return;
    worktreeCreateOpen.value = false;
    await pinWorktree(request);
  } finally {
    worktreeInFlight.value = false;
  }
}

/** `new` 模式的第一步；失败时错误留在弹层里，返回 `false`。 */
async function createBranchForWorktree(branchId: string): Promise<boolean> {
  try {
    await rxdb.versionManager.createBranch(branchId);
    return true;
  } catch (e: unknown) {
    worktreeError.value = e instanceof Error ? e.message : 'Create failed.';
    return false;
  }
}

/**
 * 钉住并切过去；label 原样透传（全空白由核心以 `WorktreeLabelError` 拒绝）。
 *
 * `new` 模式下走到这里分支已经建好了：钉住失败时 toast 要说清分支还在，否则用户会以为什么都没发生。
 */
async function pinWorktree(request: WorktreeCreateRequest): Promise<void> {
  try {
    const created = await tree.createWorktree(request.branchId, request.label);
    showToast('success', `Created worktree "${created.label ?? created.branchId}" and switched to it.`);
    await refreshAfterSwitch();
  } catch (e: unknown) {
    const text = worktreeErrorText(e, 'Create failed.');
    showToast(
      'error',
      request.mode === 'new' ? `Branch "${request.branchId}" was created, but the worktree wasn't: ${text}` : text
    );
  }
}

/** 移除一个 worktree：只删那一行，分支与它的未提交改动都还在。菜单保持打开，行就地消失。 */
async function removeWorktree(id: string): Promise<void> {
  if (worktreeBusy.value) return;
  const name = worktreeName(id);
  worktreeInFlight.value = true;
  try {
    await tree.removeWorktree(id);
    showToast('success', `Removed worktree "${name}". Its branch is kept.`);
  } catch (e: unknown) {
    showToast('error', worktreeErrorText(e, 'Remove failed.'));
  } finally {
    worktreeInFlight.value = false;
  }
}

/**
 * worktree 命令（创建 / 切换 / 移除）的失败 → 用户能看懂的提示。
 *
 * 核心错误的 message 是写给开发者的中文说明；认得出的类逐一映射成界面文案，认不出的才贴 message。
 * `WorktreeDirtyError` 在这三个命令里只可能来自移除（worktree 之间切换不带 `requireClean`）。
 */
function worktreeErrorText(error: unknown, fallback: string): string {
  if (error instanceof WorktreeDirtyError) return DIRTY_REMOVE_TEXT;
  if (error instanceof WorktreeActiveError) return ACTIVE_REMOVE_TEXT;
  if (error instanceof WorktreeBranchPinnedError) return `Branch "${error.branchId}" already has a worktree.`;
  if (error instanceof WorktreeBranchNotFoundError) return branchNotFoundText(error.branchId);
  if (error instanceof WorktreeNotFoundError) return WORKTREE_NOT_FOUND_TEXT;
  if (error instanceof WorktreeLabelError) return LABEL_INVALID_TEXT;
  return error instanceof Error ? error.message : fallback;
}

async function handleConfirmRequest(): Promise<void> {
  const request = confirmRequest.value;
  confirmRequest.value = null;
  if (!request) return;
  if (request.kind === 'discard') {
    await runDiscard();
  } else {
    await removeBranch(request.branchId);
  }
}

// ── 合并对话框 ────────────────────────────────────────────

function openMergeDialog(sourceBranchId: string): void {
  branchMenuOpen.value = false;
  mergeError.value = null;
  mergeDialog.value = { sourceBranchId, strategy: 'squash', deleteSource: false };
}

function closeMergeDialog(): void {
  mergeDialog.value = null;
  mergeError.value = null;
}

function setMergeStrategy(strategy: MergeDialogState['strategy']): void {
  const cur = mergeDialog.value;
  if (cur) mergeDialog.value = { ...cur, strategy };
}

function setDeleteSource(value: boolean): void {
  const cur = mergeDialog.value;
  if (cur) mergeDialog.value = { ...cur, deleteSource: value };
}

/**
 * 执行合并，并把「合并 ≠ 入史」这一步讲给用户。
 *
 * 实测语义（write-entry-matrix 行 2）：合并结果**落入目标分支的工作树**成为未提交单元，
 * 与 `git merge --no-commit` 同构——历史里出现合并节点，是在用户接下来那次 commit() 之后。
 * toast 里点破这一点，否则「合并了怎么历史没变」会像 bug。合并顺带删掉源分支时，钉在它上面的
 * worktree 行由实时列表跟随，这里不重读列表。
 */
async function executeMerge(): Promise<void> {
  const dialog = mergeDialog.value;
  if (!dialog) return;
  mergeError.value = null;
  try {
    const result = await rxdb.versionManager.mergeBranch(dialog.sourceBranchId, {
      strategy: dialog.strategy,
      deleteSource: dialog.deleteSource
    });
    closeMergeDialog();
    showToast(
      'success',
      `Merged ${result.merged} change(s) into the working tree of ${activeBranch.value}` +
        ` — commit to record them${result.sourceDeleted ? '; source branch deleted' : ''}.`
    );
    await refreshStatus();
  } catch (e: unknown) {
    mergeError.value = e instanceof Error ? e.message : 'Merge failed.';
  }
}

// ── 私有辅助 ──────────────────────────────────────────────

/** 一个 worktree 在提示里的名字：label，没有就是分支名。 */
function worktreeName(id: string): string {
  const worktree = worktreeList.value.find(candidate => candidate.id === id);
  return worktree ? (worktree.label ?? worktree.branchId) : id;
}

function selectHeadCommitIfNone(): void {
  if (selectedCommitId.value !== null) return;
  const commits = tree.listCommitsState.value;
  if (commits.phase !== 'success' || commits.value.entries.length === 0) return;
  selectedCommitId.value = commits.value.entries[0].commitId;
}

/** 单条 toast，3s 自动消失；新 toast 顶掉上一条（重置计时）。 */
function showToast(type: 'success' | 'error', message: string): void {
  toast.value = { type, message };
  if (toastTimer !== null) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.value = null;
  }, 3000);
}

/** 按绝对宽度夹回 [MIN, MAX]。 */
function clampAsideWidth(width: number): number {
  return Math.min(ASIDE_WIDTH_MAX, Math.max(ASIDE_WIDTH_MIN, width));
}
</script>

<template>
  <div
    class="page-host gd-workspace flex h-full flex-col overflow-hidden"
    data-testid="worktree-page"
  >
    <!-- GitHub Desktop 没有页面标题栏：标题只留给读屏，视觉上第一行就是工具栏 -->
    <h1 class="sr-only">工作树与提交历史</h1>

    <template v-if="enabledState.phase === 'success' && enabledState.value">
      <!-- ═══════════════════ 工具栏：仓库选择器 · 分支选择器 · 获取 origin · 上次获取 ═══════════════════ -->
      <!-- GitHub Desktop 的工具栏蓝（$gray-900）：两种主题都保持蓝色；仓库段宽度跟着下面左栏走，
           分支段与获取段右侧各有一条可拖的分隔条调宽。 -->
      <div class="gd-toolbar flex shrink-0 items-stretch">
        <div
          class="gd-toolbar-section gd-repository-section relative"
          :style="{ width: asideWidth + 'px' }"
        >
          <button
            class="gd-toolbar-select"
            :aria-expanded="repoMenuOpen"
            @click="toggleRepoMenu"
            aria-haspopup="true"
            data-testid="wt-repo-menu"
            type="button"
          >
            <FolderGit2 :size="18" />
            <span class="min-w-0 flex-1 text-left">
              <small>Current Repository</small>
              <strong>rxdb-demo</strong>
            </span>
            <ChevronDown :size="14" />
          </button>
          <template v-if="repoMenuOpen">
            <!-- GitHub Desktop 的仓库 foldout：整列、全高、贴工具栏下缘，
                 其余区域盖一层黑透明遮罩（源码 foldoutStyle: width=sidebarWidth, height 100%）。 -->
            <div
              class="fixed inset-0 z-30"
              :style="{ background: 'rgba(0, 0, 0, 0.35)' }"
              @click="closeRepoMenu"
              @keydown.escape="closeRepoMenu"
              aria-label="Close repository menu"
              role="button"
              tabindex="0"
            ></div>
            <div
              class="gd-menu gd-menu-flush absolute top-full left-0 z-40 w-64 overflow-y-auto"
              :style="{
                height: 'calc(100vh - 50px)',
                width: (asideWidth < MIN_DROPDOWN_WIDTH ? MIN_DROPDOWN_WIDTH : asideWidth) + 'px'
              }"
              aria-label="Repository list"
              data-testid="wt-repo-menu-popup"
              role="menu"
            >
              <div class="gd-menu-header">Current Repository</div>
              <button
                class="gd-menu-row"
                @click="closeRepoMenu"
                type="button"
              >
                <FolderGit2 :size="14" />
                <span class="min-w-0 flex-1 truncate text-left">rxdb-demo</span>
                <Check
                  class="ml-auto shrink-0 text-[var(--gd-accent)]"
                  :size="13"
                />
              </button>
              <div class="gd-menu-divider"></div>
              <RouterLink
                class="gd-menu-row"
                @click="closeRepoMenu"
                data-testid="wt-edit-data"
                to="/todo"
              >
                Edit Todo data
              </RouterLink>
              <RouterLink
                class="gd-menu-row"
                @click="closeRepoMenu"
                to="/home"
              >
                Back to RxDB Demo
              </RouterLink>
            </div>
          </template>
        </div>

        <!-- worktree 选择器（US-310）：钉在分支上的命名工作上下文，夹在仓库与分支之间——
             它比分支高一层（一个 worktree 钉一条分支），又比仓库低一层。 -->
        <WorktreeMenu
          class="gd-toolbar-section"
          v-model:create-error="worktreeError"
          v-model:create-open="worktreeCreateOpen"
          v-model:menu-open="worktreeMenuOpen"
          :active-branch="activeBranch"
          :branches="branches.value"
          :busy="worktreeBusy"
          :list-error="worktreeListError"
          :popup-width="MIN_DROPDOWN_WIDTH"
          :style="{ width: WORKTREE_SECTION_WIDTH + 'px', flexShrink: WORKTREE_SECTION_SHRINK }"
          :uncommitted-count="changesCount"
          :worktrees="worktreeList"
          @create-worktree="createWorktree"
          @remove-worktree="removeWorktree"
          @retry-list="retryWorktreeList"
          @switch-worktree="switchWorktree"
        />

        <BranchMenu
          class="gd-toolbar-section gd-branch-section"
          v-model:branch-error="branchError"
          v-model:branch-name="newBranchName"
          v-model:create-open="createPopoverOpen"
          v-model:menu-open="branchMenuOpen"
          :active-branch="activeBranch"
          :branches="branches.value"
          :busy="branchBusy"
          :popup-width="branchSectionWidth < MIN_DROPDOWN_WIDTH ? MIN_DROPDOWN_WIDTH : branchSectionWidth"
          :style="{ width: branchSectionWidth + 'px' }"
          @create-branch="createBranch"
          @menu-request="openBranchContextMenu"
          @switch-branch="switchBranch"
        />

        <!-- 分支段右侧的可拖分隔条（GitHub Desktop 的工具栏分段拖宽）。 -->
        <div
          class="gd-toolbar-handle"
          @pointerdown="startSectionResize($event, 'branch')"
          aria-hidden="true"
        ></div>

        <!-- 本地工作树没有远端 fetch 能力，这里只重读本地状态；文案对齐 GitHub Desktop
             的 Fetch origin / Last fetched。 -->
        <button
          class="gd-toolbar-refresh gd-toolbar-section"
          :style="{ width: fetchSectionWidth + 'px' }"
          @click="runFetch"
          aria-label="Fetch origin（重读本地状态与提交历史）"
          data-testid="wt-refresh-status"
          title="Fetch origin（重读本地状态与提交历史）"
          type="button"
        >
          <RefreshCw
            :class="{ 'animate-spin': fetching }"
            :size="18"
          />
          <span class="min-w-0 flex-1 text-left">
            <strong>{{ fetching ? 'Fetching…' : 'Fetch origin' }}</strong>
            <small>{{ fetching ? 'Fetching changes…' : 'Last fetched ' + lastFetchedLabel }}</small>
          </span>
        </button>

        <!-- 获取段右侧的可拖分隔条。 -->
        <div
          class="gd-toolbar-handle"
          @pointerdown="startSectionResize($event, 'fetch')"
          aria-hidden="true"
        ></div>
      </div>

      <!-- ═══════════════════ 主体：左侧标签页 + 右栏详情 ═══════════════════ -->
      <div class="flex min-h-0 flex-1 overflow-hidden">
        <!-- Vue 应用壳的移动端全局样式对 `aside` 元素有 width:0 的覆盖（sidebar overlay 模式），
             页面自己的左栏用 div + 显式 complementary 角色保持三端一致的常驻侧栏行为。 -->
        <div
          class="gd-sidebar flex shrink-0 flex-col"
          :style="{ width: asideWidth + 'px' }"
          role="complementary"
        >
          <!-- GitHub Desktop 的 tab bar：选中项深色字 + 蓝色下划线。Changes / History 面板头
               都没有刷新按钮（对照过 desktop/desktop 源码），重读走顶部工具栏的「刷新本地状态」。 -->
          <div
            class="gd-tabs flex shrink-0 items-center border-b"
            :style="{ borderColor: 'var(--gd-border)' }"
          >
            <div
              class="flex h-full flex-1 items-center"
              role="tablist"
            >
              <button
                class="gd-tab"
                :aria-selected="activeTab === 'changes'"
                :class="{ 'gd-tab-active': activeTab === 'changes' }"
                @click="selectTab('changes')"
                data-testid="wt-tab-changes"
                role="tab"
                type="button"
              >
                Changes
                <span
                  class="gd-pill"
                  v-if="changesCount !== null"
                  >{{ changesCount }}</span
                >
              </button>
              <button
                class="gd-tab"
                :aria-selected="activeTab === 'history'"
                :class="{ 'gd-tab-active': activeTab === 'history' }"
                @click="selectTab('history')"
                data-testid="wt-tab-history"
                role="tab"
                type="button"
              >
                History
              </button>
            </div>
          </div>

          <template v-if="activeTab === 'changes'">
            <div
              class="gd-warn-strip shrink-0"
              v-if="showRestoreBanner"
              data-testid="wt-restore-session"
              role="status"
            >
              <template v-if="restoreSession !== null">
                Restore session in progress from commit
                <code>{{ restoreSession.targetCommitId }}</code>
                — commit to complete the restore, discard to cancel it.
              </template>
              <template v-if="statusState.phase === 'success' && statusState.value.conflicted">
                The restore session has diverged from the working tree (capture mismatch) — discard to cancel, then
                restore again.
              </template>
            </div>
            <ChangesList
              :diff-state="tree.diffState.value"
              :selected-key="selectedDiffKey"
              @menu-request="openChangesContextMenu"
              @select-entry="selectDiffEntry"
            />
            <CommitBox
              v-model:description="commitDescription"
              v-model:summary="commitSummary"
              :active-branch="activeBranch"
              :commit-state="tree.commitState.value"
              :notice="notice"
              @commit="runCommit"
            />
          </template>
          <HistoryList
            v-else
            :commits-state="tree.listCommitsState.value"
            :selected-commit-id="selectedCommitId"
            @menu-request="openCommitContextMenu"
            @select-entry="selectCommit"
          />
        </div>

        <!-- 左栏 / 右栏分隔条：按住拖动调宽，方向键也能调（Home/End 到边界） -->
        <button
          class="gd-resizer"
          :aria-valuemax="560"
          :aria-valuemin="240"
          :aria-valuenow="asideWidth"
          @keydown="handleAsideResizeKey"
          @pointerdown="startAsideResize"
          aria-label="Resize sidebar"
          aria-orientation="vertical"
          data-testid="wt-aside-resize"
          role="separator"
          type="button"
        ></button>

        <main class="flex min-w-0 flex-1 flex-col overflow-hidden">
          <!-- 数据在别的页面（如 /todo）产生：本页只做「看」与「提交」，
               和 GitHub Desktop 打开一个别人编辑过的仓库是同一件事 -->
          <DiffViewer
            v-if="activeTab === 'changes'"
            :entry="selectedDiffEntry"
          />
          <CommitDetail
            v-else
            :changes-state="tree.commitChangesState.value"
            :commit="selectedCommit"
          />
        </main>
      </div>
    </template>
    <div
      class="flex flex-1 flex-col items-center justify-center gap-3 overflow-y-auto p-8"
      v-else
      :style="{ background: 'var(--gd-bg)' }"
    >
      <!-- ═══════════════════ 初始化石板（GitHub Desktop 的空白石板形态） ═══════════════════ -->
      <GitBranch
        :size="40"
        :style="{ color: 'var(--gd-muted)' }"
      />
      <h2 class="text-xl font-semibold">Initialize repository</h2>
      <p
        class="max-w-md text-center text-sm"
        :style="{ color: 'var(--gd-muted)' }"
      >
        <code>enable()</code>
        is a one-time database-level switch (v1 has no
        <code>disable()</code>
        ): once enabled, the whole database runs under worktree semantics and every write is captured as an uncommitted
        change — the equivalent of
        <code>git init</code>
        . Empty databases initialize automatically at app startup; a database that already contains data still needs
        this explicit click.
      </p>
      <button
        class="gd-btn-primary"
        @click="runEnable"
        data-testid="wt-enable"
        type="button"
      >
        Initialize repository (enable)
      </button>
    </div>

    <!-- ═══════════════════ 状态读数（sr-only） ═══════════════════ -->
    <!-- GitHub Desktop 没有底部 footer；这些原始读数（相位 / 分支 / 未提交数 / 干净与否 /
         首次可见耗时）是 demo 的仪器不是 UI——e2e 与读屏仍靠它锚定，眼睛看不到。 -->
    <div class="gd-strip sr-only">
      <div
        class="flex min-w-0 flex-wrap items-center gap-1.5"
        aria-live="polite"
        data-testid="wt-status"
        role="status"
      >
        <span data-testid="wt-status-phase">{{ statusState.phase }}</span>
        <span
          class="min-w-0 truncate"
          v-if="statusState.phase === 'success' || statusState.phase === 'empty'"
        >
          · 分支
          <span
            class="font-medium"
            data-testid="wt-status-branch"
            >{{ statusState.value.branchId }}</span
          >
          · 未提交
          <span data-testid="wt-status-entry-count">{{ statusState.value.entryCount }}</span>
          条 ·
          <span data-testid="wt-status-clean">{{ statusState.value.clean ? '干净' : '有未提交改动' }}</span>
          · 远端同步来源
          <span data-testid="wt-status-remote-sync">{{ statusState.value.byOrigin.remote_sync }}</span>
          条
        </span>
        <span
          class="rounded-full border border-amber-400 px-1.5 text-amber-700"
          v-if="(statusState.phase === 'success' || statusState.phase === 'empty') && statusState.value.restoring"
          data-testid="wt-status-restore"
        >
          恢复中
        </span>
        <span
          class="rounded-full border border-red-400 px-1.5 text-red-700"
          v-if="(statusState.phase === 'success' || statusState.phase === 'empty') && statusState.value.conflicted"
          data-testid="wt-status-restore"
        >
          会话分叉
        </span>
        <span v-if="statusState.phase === 'error'">· 尚未初始化，先点「初始化仓库」</span>
      </div>
      <div
        class="flex min-w-0 items-center gap-1.5"
        data-testid="wt-worktrees"
        role="status"
      >
        <span data-testid="wt-worktrees-phase">{{ tree.listWorktreesState.value.phase }}</span>
        · worktree
        <span data-testid="wt-worktrees-count">{{ worktreeList.length }}</span>
        个
      </div>
      <div class="flex shrink-0 items-center gap-3">
        <span
          class="rounded-full border px-1.5"
          :class="{
            'border-green-500': enabledState.phase === 'success' && enabledState.value,
            'text-green-700': enabledState.phase === 'success' && enabledState.value
          }"
          data-testid="wt-enabled"
          role="status"
        >
          <template v-if="enabledState.phase === 'success'">
            {{ enabledState.value ? '已启用' : '未启用' }}
          </template>
          <template v-else>{{ enabledState.phase }}</template>
        </span>
        <span data-testid="wt-first-visible">
          首次可见状态耗时：
          <span data-testid="wt-first-visible-ms">{{ firstVisibleMs }}</span>
          ms
        </span>
        <button
          class="gd-btn-ghost"
          v-if="!(enabledState.phase === 'success' && enabledState.value)"
          @click="refreshStatus"
          data-testid="wt-refresh-status"
          type="button"
        >
          刷新状态
        </button>
      </div>
    </div>

    <!-- ═══════════════════ 右键菜单 ═══════════════════ -->
    <ContextMenu
      :menu="contextMenu"
      @close-requested="contextMenu = null"
      @item-selected="handleContextMenuSelect"
    />

    <!-- ═══════════════════ 合并对话框 ═══════════════════ -->
    <MergeDialog
      :active-branch="activeBranch"
      :dialog="mergeDialog"
      :error="mergeError"
      @close-requested="closeMergeDialog"
      @confirm="executeMerge"
      @delete-source-change="setDeleteSource"
      @strategy-change="setMergeStrategy"
    />

    <!-- ═══════════════════ 应用内确认框（替代原生 confirm，移动端样式一致） ═══════════════════ -->
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3"
      v-if="confirmRequest !== null"
      @click="confirmRequest = null"
      @keydown.escape="confirmRequest = null"
      aria-label="Close dialog"
      role="button"
      tabindex="0"
    >
      <div
        class="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-md border border-[var(--gd-border)] p-5 shadow-2xl"
        :style="{ background: 'var(--gd-panel)' }"
        @click.stop
        @keydown.stop
        aria-modal="true"
        data-testid="wt-confirm-dialog"
        role="alertdialog"
      >
        <h2 class="mb-3 text-sm font-semibold">
          {{ confirmRequest.kind === 'discard' ? 'Discard changes' : 'Delete branch' }}
        </h2>
        <p
          class="mb-4 text-sm"
          :style="{ color: 'var(--gd-muted)' }"
        >
          {{
            confirmRequest.kind === 'discard' ?
              confirmRequest.message
            : `确定要删除分支 "${confirmRequest.branchId}" 吗？`
          }}
        </p>
        <div class="flex justify-end gap-2">
          <button
            class="gd-btn-secondary"
            @click="confirmRequest = null"
            data-testid="wt-confirm-cancel"
            type="button"
          >
            Cancel
          </button>
          <button
            class="gd-btn-primary"
            :style="{ background: 'var(--gd-del-fg)', borderColor: 'var(--gd-del-fg)' }"
            @click="handleConfirmRequest"
            data-testid="wt-confirm-ok"
            type="button"
          >
            {{ confirmRequest.kind === 'discard' ? 'Discard' : 'Delete' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ═══════════════════ Toast ═══════════════════ -->
    <div
      class="toast toast-top toast-end z-50"
      v-if="toast !== null"
    >
      <div
        class="alert text-sm"
        :class="{ 'alert-error': toast.type === 'error', 'alert-success': toast.type === 'success' }"
        data-testid="wt-toast"
        role="status"
      >
        {{ toast.message }}
      </div>
    </div>
  </div>
</template>
