import type { MessageCatalog } from '@aiao/rxdb-i18n';

/**
 * 工作树与提交历史演示页的简体中文文案目录。
 *
 * @remarks
 * 页面主体是 GitHub Desktop 形态的英文参考实现；目录只收页面里仍以中文呈现的文案
 * （sr-only 状态读数条、页面标题、删除分支确认与触屏操作提示），zh 值逐字保留页面当前文本。
 */
export const workingTreeZhMessages = {
  'page.workingTree.title': '工作树与提交历史',
  'page.workingTree.fetchTitle': 'Fetch origin（重读本地状态与提交历史）',
  'page.workingTree.statusBranchLabel': ' · 分支',
  'page.workingTree.statusUncommittedLabel': ' · 未提交',
  'page.workingTree.statusEntryCountSuffix': '条 · ',
  'page.workingTree.statusClean': '干净',
  'page.workingTree.statusDirty': '有未提交改动',
  'page.workingTree.statusRemoteSyncLabel': ' · 远端同步来源',
  'page.workingTree.statusCountSuffix': '条',
  'page.workingTree.statusRestoring': '恢复中',
  'page.workingTree.statusConflicted': '会话分叉',
  'page.workingTree.statusNotInitialized': '· 尚未初始化，先点「初始化仓库」',
  'page.workingTree.enabled': '已启用',
  'page.workingTree.notEnabled': '未启用',
  'page.workingTree.firstVisibleLabel': '首次可见状态耗时：',
  'page.workingTree.refreshStatus': '刷新状态',
  'page.workingTree.confirmDeleteBranch': '确定要删除分支 "{branchId}" 吗？',
  'page.workingTree.moreActionsTouch': '更多操作（触屏）',
  'page.workingTree.noAuthor': '无作者'
} as const;

/** 工作树与提交历史演示页的文案键。 */
export type WorkingTreeMessageKey = keyof typeof workingTreeZhMessages;

/** 工作树与提交历史演示页的英文文案目录；键集合必须与简体中文目录一致。 */
export const workingTreeEnMessages = {
  'page.workingTree.title': 'Working tree and commit history',
  'page.workingTree.fetchTitle': 'Fetch origin (re-read local status and commit history)',
  'page.workingTree.statusBranchLabel': ' · Branch',
  'page.workingTree.statusUncommittedLabel': ' · Uncommitted',
  'page.workingTree.statusEntryCountSuffix': ' entries · ',
  'page.workingTree.statusClean': 'Clean',
  'page.workingTree.statusDirty': 'Uncommitted changes',
  'page.workingTree.statusRemoteSyncLabel': ' · Remote sync source',
  'page.workingTree.statusCountSuffix': ' entries',
  'page.workingTree.statusRestoring': 'Restoring',
  'page.workingTree.statusConflicted': 'Session diverged',
  'page.workingTree.statusNotInitialized': '· Not initialized — click “Initialize repository”',
  'page.workingTree.enabled': 'Enabled',
  'page.workingTree.notEnabled': 'Not enabled',
  'page.workingTree.firstVisibleLabel': 'First visible status took:',
  'page.workingTree.refreshStatus': 'Refresh status',
  'page.workingTree.confirmDeleteBranch': 'Delete branch "{branchId}"?',
  'page.workingTree.moreActionsTouch': 'More actions (touch)',
  'page.workingTree.noAuthor': 'No author'
} satisfies Record<WorkingTreeMessageKey, string>;

/** 工作树与提交历史演示页的随包目录；三端演示共用同一份。 */
export const workingTreeCatalogs: readonly MessageCatalog[] = [
  { locale: 'zh-Hans', namespace: 'app', messages: workingTreeZhMessages },
  { locale: 'en', namespace: 'app', messages: workingTreeEnMessages }
];
