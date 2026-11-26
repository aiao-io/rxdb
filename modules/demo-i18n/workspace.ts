export const workspaceZhMessages = {
  'common.refresh': '刷新',
  'common.reset': '重置',
  'common.save': '保存',
  'common.discard': '丢弃',
  'common.previous': '上一页',
  'common.next': '下一页',
  'page.workspace.title': 'Workspace 草稿恢复',
  'page.workspace.untitled': '未命名 Todo',
  'page.workspace.noticeCreated': '已创建未保存草稿：{title}',
  'page.workspace.noticeSaved': '已保存 Todo：{title}',
  'page.workspace.noticeDiscarded': '已丢弃草稿：{title}',
  'page.workspace.errorCreate': '创建草稿失败',
  'page.workspace.errorSave': '保存草稿失败',
  'page.workspace.errorClear': '清空 Todo 主表失败',
  'page.workspace.errorReset': '重置演示数据失败',
  'page.workspace.errorLoad': '读取 workspace 草稿失败',
  'page.workspace.errorNoDraft': '未找到可恢复的 Todo 草稿',
  'page.workspace.errorMissingDraft': '草稿已经不存在',
  'page.workspace.drafts': '{count, number} 个草稿',
  'page.workspace.cacheHint': 'new Todo() 先进入 workspace 缓存，刷新后从 IndexedDB 恢复',
  'page.workspace.reloadVerify': '刷新页面验证恢复',
  'page.workspace.draftStat': 'Workspace 草稿',
  'page.workspace.draftStatDescription': '还没保存到主表的草稿',
  'page.workspace.todoStat': 'Todo 主表',
  'page.workspace.todoStatDescription': '已写入数据库的全部记录',
  'page.workspace.activeDraftStat': '当前活动草稿',
  'page.workspace.activeDraftStatDescription': '恢复面板聚焦的草稿',
  'page.workspace.createDraft': '创建未保存草稿',
  'page.workspace.workspaceOnly': '仅 Workspace',
  'page.workspace.createDescription': '只创建草稿对象，不直接写入 Todo 主表。草稿先落 workspace，刷新后还能继续处理。',
  'page.workspace.titlePlaceholder': '例如：整理需求清单',
  'page.workspace.draftTitle': '草稿标题',
  'page.workspace.completed': '已完成',
  'page.workspace.createButton': '创建草稿',
  'page.workspace.draftList': '草稿列表',
  'page.workspace.emptyDrafts': '当前没有未保存草稿。先创建一个，再刷新页面验证恢复链路。',
  'page.workspace.recovered': '已恢复',
  'page.workspace.view': '查看',
  'page.workspace.completedValue': '完成：{value}',
  'page.workspace.todoTable': 'Todo 主表',
  'page.workspace.todoDescription': '草稿保存后落到这里，最新在前。只查询当前这一页（每页 {size, number} 条）',
  'page.workspace.clearTable': '清空主表',
  'page.workspace.titleColumn': '标题',
  'page.workspace.statusColumn': '状态',
  'page.workspace.idColumn': 'ID',
  'page.workspace.updatedAtColumn': '更新时间',
  'page.workspace.emptyTodos': '主表还没有记录。保存一条草稿看它落库。',
  'page.workspace.statusCompleted': '已完成',
  'page.workspace.statusOpen': '未完成',
  'page.workspace.pagination': '共 {count, number} 条 · 第 {current, number} / {total, number} 页',
  'page.workspace.recoveryPanel': '恢复面板',
  'page.workspace.recoveredAfterRefresh': '刷新后恢复',
  'page.workspace.draftId': '草稿 ID',
  'page.workspace.completedStatus': '完成状态',
  'page.workspace.createdAt': '创建时间',
  'page.workspace.emptySelection': '还没有选中的草稿。先创建一个，或从左侧列表点“查看”。',
  'page.workspace.defaultTitle': '整理需求清单',
  'page.workspace.noticeCleared': '已清空 Todo 主表',
  'page.workspace.noticeReset': '已重置 workspace 草稿和 Todo 主表',
  'page.workspace.deleteStalled': '批量删除没有推进：仍有 Todo 未被删除'
};

export type WorkspaceMessageKey = keyof typeof workspaceZhMessages;

export const workspaceEnMessages = {
  'common.refresh': 'Refresh',
  'common.reset': 'Reset',
  'common.save': 'Save',
  'common.discard': 'Discard',
  'common.previous': 'Previous',
  'common.next': 'Next',
  'page.workspace.title': 'Workspace draft recovery',
  'page.workspace.untitled': 'Untitled Todo',
  'page.workspace.noticeCreated': 'Created unsaved draft: {title}',
  'page.workspace.noticeSaved': 'Saved Todo: {title}',
  'page.workspace.noticeDiscarded': 'Discarded draft: {title}',
  'page.workspace.errorCreate': 'Unable to create draft',
  'page.workspace.errorSave': 'Unable to save draft',
  'page.workspace.errorClear': 'Unable to clear the Todo main table',
  'page.workspace.errorReset': 'Unable to reset demo data',
  'page.workspace.errorLoad': 'Unable to load workspace drafts',
  'page.workspace.errorNoDraft': 'No recoverable Todo draft was found',
  'page.workspace.errorMissingDraft': 'The draft no longer exists',
  'page.workspace.drafts': '{count, plural, one {# draft} other {# drafts}}',
  'page.workspace.cacheHint':
    'new Todo() enters the workspace cache first and is restored from IndexedDB after refresh',
  'page.workspace.reloadVerify': 'Reload to verify recovery',
  'page.workspace.draftStat': 'Workspace drafts',
  'page.workspace.draftStatDescription': 'Drafts not saved to the main table',
  'page.workspace.todoStat': 'Todo main table',
  'page.workspace.todoStatDescription': 'All records written to the database',
  'page.workspace.activeDraftStat': 'Active draft',
  'page.workspace.activeDraftStatDescription': 'Draft focused by the recovery panel',
  'page.workspace.createDraft': 'Create unsaved draft',
  'page.workspace.workspaceOnly': 'Workspace only',
  'page.workspace.createDescription':
    'Creates only a draft object. It is stored in workspace first and remains available after refresh.',
  'page.workspace.titlePlaceholder': 'For example: Organize the requirements',
  'page.workspace.draftTitle': 'Draft title',
  'page.workspace.completed': 'Completed',
  'page.workspace.createButton': 'Create draft',
  'page.workspace.draftList': 'Draft list',
  'page.workspace.emptyDrafts': 'There are no unsaved drafts. Create one, then reload to verify recovery.',
  'page.workspace.recovered': 'Recovered',
  'page.workspace.view': 'View',
  'page.workspace.completedValue': 'Completed: {value}',
  'page.workspace.todoTable': 'Todo main table',
  'page.workspace.todoDescription':
    'Saved drafts appear here, newest first. Only this page is queried ({size, number} per page).',
  'page.workspace.clearTable': 'Clear main table',
  'page.workspace.titleColumn': 'Title',
  'page.workspace.statusColumn': 'Status',
  'page.workspace.idColumn': 'ID',
  'page.workspace.updatedAtColumn': 'Updated at',
  'page.workspace.emptyTodos': 'The main table has no records. Save a draft to write one.',
  'page.workspace.statusCompleted': 'Completed',
  'page.workspace.statusOpen': 'Open',
  'page.workspace.pagination':
    '{count, plural, one {# record} other {# records}} · Page {current, number} / {total, number}',
  'page.workspace.recoveryPanel': 'Recovery panel',
  'page.workspace.recoveredAfterRefresh': 'Recovered after refresh',
  'page.workspace.draftId': 'Draft ID',
  'page.workspace.completedStatus': 'Completion status',
  'page.workspace.createdAt': 'Created at',
  'page.workspace.emptySelection': 'No draft selected. Create one or click “View” in the list.',
  'page.workspace.defaultTitle': 'Organize the requirements',
  'page.workspace.noticeCleared': 'Cleared the Todo main table',
  'page.workspace.noticeReset': 'Reset workspace drafts and the Todo main table',
  'page.workspace.deleteStalled': 'Batch deletion stalled: some Todos were not removed'
} satisfies Record<WorkspaceMessageKey, string>;

export type WorkspaceNotice = {
  tone: 'info' | 'success' | 'warning' | 'error';
  key: WorkspaceMessageKey;
  params?: Record<string, unknown>;
  detail?: string;
};

export function workspaceError(key: WorkspaceMessageKey, error: unknown): WorkspaceNotice {
  return error instanceof Error ? { key, tone: 'error', detail: error.message } : { key, tone: 'error' };
}

export function workspaceNoticeText(
  notice: WorkspaceNotice,
  translate: (key: WorkspaceMessageKey, params?: Record<string, unknown>) => string
): string {
  const message = translate(notice.key, notice.params);
  return notice.detail ? `${message}: ${notice.detail}` : message;
}

export function formatWorkspaceDate(value: Date | string | null | undefined, locale: string): string {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString(locale);
}
