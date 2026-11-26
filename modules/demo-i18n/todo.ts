import type { MessageCatalog } from '@aiao/rxdb-i18n';

/** Todo 演示页的简体中文文案目录。 */
export const todoZhMessages = {
  'page.todo.activeCount': '{count, number} 待办',
  'page.todo.tab.all': '全部',
  'page.todo.tab.active': '进行中',
  'page.todo.tab.completed': '已完成',
  'page.todo.batchAdd': '批量添加',
  'page.todo.addCount': '添加 {count, number} 条',
  'page.todo.toggleAll': '全选当前列表',
  'page.todo.clearCompleted': '清除当前已完成',
  'page.todo.sort': '排序',
  'page.todo.addPlaceholder': '添加新任务...',
  'page.todo.add': '添加',
  'page.todo.reorderFailed': '排序保存失败：{reason}',
  'page.todo.empty': '暂无任务',
  'page.todo.emptyHint': '添加一个新任务开始吧',
  'page.todo.editPlaceholder': '任务名称...',
  'page.todo.save': '保存',
  'page.todo.edit': '编辑',
  'page.todo.dragSort': '拖动排序'
} as const;

/** Todo 演示页的文案键。 */
export type TodoMessageKey = keyof typeof todoZhMessages;

/** Todo 演示页的英文文案目录；键集合必须与简体中文目录一致。 */
export const todoEnMessages = {
  'page.todo.activeCount': '{count, number} active',
  'page.todo.tab.all': 'All',
  'page.todo.tab.active': 'Active',
  'page.todo.tab.completed': 'Completed',
  'page.todo.batchAdd': 'Batch add',
  'page.todo.addCount': 'Add {count, number}',
  'page.todo.toggleAll': 'Select all in current list',
  'page.todo.clearCompleted': 'Clear completed in current list',
  'page.todo.sort': 'Sort',
  'page.todo.addPlaceholder': 'Add a new task...',
  'page.todo.add': 'Add',
  'page.todo.reorderFailed': 'Reorder failed: {reason}',
  'page.todo.empty': 'No tasks yet',
  'page.todo.emptyHint': 'Add a new task to get started',
  'page.todo.editPlaceholder': 'Task name...',
  'page.todo.save': 'Save',
  'page.todo.edit': 'Edit',
  'page.todo.dragSort': 'Drag to reorder'
} satisfies Record<TodoMessageKey, string>;

/** Todo 演示页的随包目录；两端演示共用同一份。 */
export const todoCatalogs: readonly MessageCatalog[] = [
  { locale: 'zh-Hans', namespace: 'app', messages: todoZhMessages },
  { locale: 'en', namespace: 'app', messages: todoEnMessages }
];
