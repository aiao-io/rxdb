import type { MessageCatalog } from '@aiao/rxdb-i18n';

/**
 * 文件管理器演示页（简单 / 虚拟滚动 / 懒加载）的简体中文文案目录。
 *
 * 排序选项、空态与级联删除沿用了 Angular i18n.ts 中的 page.tree.* 规范键名与 zh 值：
 * 这些键只被文件管理器三端页面使用，其它共享目录（tree-menu 等）未定义，故随本目录提供。
 */
export const fileManagerZhMessages = {
  'page.file.simple': '文件管理器 - 简单模式',
  'page.file.virtual': '文件管理器 - 虚拟滚动',
  'page.file.lazy': '文件管理器 - 懒加载',
  'page.file.rootNamePlaceholder': '添加文件{suffix}…',
  'page.file.folderNamePlaceholder': '添加文件夹{suffix}…',
  'page.file.rootSuffix': ' (根目录)',
  'page.file.file': '文件',
  'page.file.folder': '文件夹',
  'page.file.searchPlaceholder': '搜索文件或文件夹…',
  'page.file.searchCount': '搜索：{count} 项',
  'page.file.batchAddCount': '添加 {count} 条',
  'page.file.addTo': '将添加到:',
  'page.file.cancelSelect': '取消选择',
  'page.file.selectParentFolder': '选择为父文件夹',
  'page.file.pathConflictBody': '已存在同名文件/文件夹：',
  'page.file.deleteOne': '确定要删除 {name} 吗？',
  'page.file.directChildrenCount': '{count} 个直接子项',
  'page.file.descendantsCount': '共 {count} 个所有后代节点',
  'page.file.impactScope': '影响范围：',
  'page.file.directChildren': '直接子项: {count} 个',
  'page.file.allDescendants': '所有后代: {count} 个',
  'page.file.irreversible': '此操作不可恢复！',
  'page.file.ext.txt': '.txt (文本)',
  'page.file.ext.jpg': '.jpg (图片)',
  'page.file.ext.png': '.png (图片)',
  'page.file.ext.zip': '.zip (压缩包)',
  'page.tree.sortFree': '自由排序',
  'page.tree.sortManual': '手动排序',
  'page.tree.nameAsc': '名称 A→Z',
  'page.tree.nameDesc': '名称 Z→A',
  'page.tree.folderFirst': '文件夹优先',
  'page.tree.fileFirst': '文件优先',
  'page.tree.extensionAsc': '扩展名 A→Z',
  'page.tree.extensionDesc': '扩展名 Z→A',
  'page.tree.sizeAsc': '大小 小→大',
  'page.tree.sizeDesc': '大小 大→小',
  'page.tree.typeAsc': '类型 ↑',
  'page.tree.typeDesc': '类型 ↓',
  'page.tree.emptyFile': '暂无文件',
  'page.tree.deleteCascade': '级联删除'
} as const;

/** 文件管理器演示页的文案键。 */
export type FileManagerMessageKey = keyof typeof fileManagerZhMessages;

/** 文件管理器演示页的英文文案目录；键集合必须与简体中文目录一致。 */
export const fileManagerEnMessages = {
  'page.file.simple': 'File Manager - Simple',
  'page.file.virtual': 'File Manager - Virtual Scroll',
  'page.file.lazy': 'File Manager - Lazy Load',
  'page.file.rootNamePlaceholder': 'Add file{suffix}…',
  'page.file.folderNamePlaceholder': 'Add folder{suffix}…',
  'page.file.rootSuffix': ' (root)',
  'page.file.file': 'File',
  'page.file.folder': 'Folder',
  'page.file.searchPlaceholder': 'Search files or folders…',
  'page.file.searchCount': 'Search: {count} items',
  'page.file.batchAddCount': 'Add {count, plural, one {# item} other {# items}}',
  'page.file.addTo': 'Will be added to:',
  'page.file.cancelSelect': 'Cancel selection',
  'page.file.selectParentFolder': 'Select as parent folder',
  'page.file.pathConflictBody': 'A file or folder with the same name already exists:',
  'page.file.deleteOne': 'Are you sure you want to delete {name}?',
  'page.file.directChildrenCount': '{count, plural, one {# direct child} other {# direct children}}',
  'page.file.descendantsCount': '{count} descendant nodes in total',
  'page.file.impactScope': 'Impact:',
  'page.file.directChildren': '{count, plural, one {# direct child} other {# direct children}}',
  'page.file.allDescendants': '{count, plural, one {# descendant} other {# descendants}}',
  'page.file.irreversible': 'This action cannot be undone!',
  'page.file.ext.txt': '.txt (text)',
  'page.file.ext.jpg': '.jpg (image)',
  'page.file.ext.png': '.png (image)',
  'page.file.ext.zip': '.zip (archive)',
  'page.tree.sortFree': 'Free order',
  'page.tree.sortManual': 'Manual order',
  'page.tree.nameAsc': 'Name A→Z',
  'page.tree.nameDesc': 'Name Z→A',
  'page.tree.folderFirst': 'Folders first',
  'page.tree.fileFirst': 'Files first',
  'page.tree.extensionAsc': 'Extension A→Z',
  'page.tree.extensionDesc': 'Extension Z→A',
  'page.tree.sizeAsc': 'Size small→large',
  'page.tree.sizeDesc': 'Size large→small',
  'page.tree.typeAsc': 'Type ↑',
  'page.tree.typeDesc': 'Type ↓',
  'page.tree.emptyFile': 'No files yet',
  'page.tree.deleteCascade': 'Delete recursively'
} satisfies Record<FileManagerMessageKey, string>;

/** 文件管理器演示页的随包目录；三端演示共用同一份。 */
export const fileManagerCatalogs: readonly MessageCatalog[] = [
  { locale: 'zh-Hans', namespace: 'app', messages: fileManagerZhMessages },
  { locale: 'en', namespace: 'app', messages: fileManagerEnMessages }
];
