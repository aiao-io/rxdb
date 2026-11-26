import type { MessageCatalog } from '@aiao/rxdb-i18n';

/** 树菜单演示页（简单 / 虚拟滚动 / 懒加载）的简体中文文案目录。 */
export const treeMenuZhMessages = {
  'page.tree.simple': '树菜单 - 简单模式',
  'page.tree.virtual': '树菜单 - 虚拟滚动',
  'page.tree.lazy': '树菜单 - 懒加载',
  'page.tree.emptyMenu': '暂无菜单数据',
  'page.tree.createMenuHint': '点击上方“添加根菜单”按钮创建第一个菜单',
  'page.tree.confirmDelete': '确认删除',
  'page.tree.cascadeDelete': '此操作将级联删除：',
  'page.tree.expanded': '已展开',
  'page.tree.parent': '父节点：',
  'page.tree.searchScope': '搜索范围限制',
  'page.tree.searchScopeHint': '搜索仅限于已加载的节点。展开更多节点以搜索其子节点。',
  'page.tree.pathConflict': '路径冲突警告',
  'page.tree.rootTitlePlaceholder': '输入根菜单标题…',
  'page.tree.childTitlePlaceholder': '输入子菜单标题…',
  'page.tree.addRoot': '添加根菜单',
  'page.tree.addChild': '添加子菜单',
  'page.tree.directChildrenCount': '{count} 个直接子节点',
  'page.tree.promoteDelete': '删除父节点（子节点提升）',
  'page.tree.searchPlaceholder': '搜索菜单…',
  'page.tree.searchLazyPlaceholder': '高亮已加载菜单...',
  'page.tree.searchCount': '搜索：{count} 项',
  'page.tree.itemCount': '{count} 项',
  'page.tree.loadedCount': '已加载：{count} 个节点',
  'page.tree.descendantsCount': '共 {count} 个所有后代节点',
  'page.tree.batchAddCount': '添加 {count} 条',
  'page.tree.cancelSelectParent': '取消选择父节点',
  'page.tree.duplicateMenuConflict': '已存在同名菜单：',
  'page.tree.deleteConfirmPrefix': '确定要删除菜单',
  'page.tree.deleteConfirmSuffix': '吗？',
  'page.tree.cascadeDeleteAll': '级联删除 (删除所有)',
  'page.tree.writeOp.create': '新建',
  'page.tree.writeOp.rename': '重命名',
  'page.tree.writeOp.batchAdd': '批量添加',
  'page.tree.writeOp.delete': '删除',
  'page.tree.writeOp.deleteAll': '删除全部',
  'page.tree.writeOp.cascadeDelete': '级联删除',
  'page.tree.writeOp.deletePromote': '删除并提升子节点',
  'page.tree.writeOp.drag': '拖放',
  'page.tree.writeFailed': '{operation}失败：{message}'
} as const;

/** 树菜单演示页的文案键。 */
export type TreeMenuMessageKey = keyof typeof treeMenuZhMessages;

/** 树菜单演示页的英文文案目录；键集合必须与简体中文目录一致。 */
export const treeMenuEnMessages = {
  'page.tree.simple': 'Tree Menu - Simple',
  'page.tree.virtual': 'Tree Menu - Virtual Scroll',
  'page.tree.lazy': 'Tree Menu - Lazy Load',
  'page.tree.emptyMenu': 'No menus yet',
  'page.tree.createMenuHint': 'Use “Add root menu” above to create the first menu',
  'page.tree.confirmDelete': 'Confirm deletion',
  'page.tree.cascadeDelete': 'This will recursively delete:',
  'page.tree.expanded': 'Expanded',
  'page.tree.parent': 'Parent:',
  'page.tree.searchScope': 'Limit search scope',
  'page.tree.searchScopeHint': 'Search is limited to loaded nodes. Expand more nodes to search their children.',
  'page.tree.pathConflict': 'Path conflict warning',
  'page.tree.rootTitlePlaceholder': 'Enter root menu title…',
  'page.tree.childTitlePlaceholder': 'Enter child menu title…',
  'page.tree.addRoot': 'Add root menu',
  'page.tree.addChild': 'Add child menu',
  'page.tree.directChildrenCount': '{count} direct child nodes',
  'page.tree.promoteDelete': 'Delete parent (promote children)',
  'page.tree.searchPlaceholder': 'Search menus…',
  'page.tree.searchLazyPlaceholder': 'Highlight loaded menus...',
  'page.tree.searchCount': 'Search: {count} items',
  'page.tree.itemCount': '{count} items',
  'page.tree.loadedCount': 'Loaded: {count} nodes',
  'page.tree.descendantsCount': '{count} descendant nodes in total',
  'page.tree.batchAddCount': 'Add {count} items',
  'page.tree.cancelSelectParent': 'Clear selected parent',
  'page.tree.duplicateMenuConflict': 'A menu with the same name already exists:',
  'page.tree.deleteConfirmPrefix': 'Are you sure you want to delete menu',
  'page.tree.deleteConfirmSuffix': '?',
  'page.tree.cascadeDeleteAll': 'Delete recursively (delete all)',
  'page.tree.writeOp.create': 'Create',
  'page.tree.writeOp.rename': 'Rename',
  'page.tree.writeOp.batchAdd': 'Batch add',
  'page.tree.writeOp.delete': 'Delete',
  'page.tree.writeOp.deleteAll': 'Delete all',
  'page.tree.writeOp.cascadeDelete': 'Delete recursively',
  'page.tree.writeOp.deletePromote': 'Delete and promote children',
  'page.tree.writeOp.drag': 'Drag',
  'page.tree.writeFailed': '{operation} failed: {message}'
} satisfies Record<TreeMenuMessageKey, string>;

/** 树菜单演示页的随包目录；三端演示共用同一份。 */
export const treeMenuCatalogs: readonly MessageCatalog[] = [
  { locale: 'zh-Hans', namespace: 'app', messages: treeMenuZhMessages },
  { locale: 'en', namespace: 'app', messages: treeMenuEnMessages }
];
