import type { MessageCatalog } from '@aiao/rxdb-i18n';

/** 演示应用共用的简体中文文案目录（源：Angular 演示应用的 shell 目录）。 */
export const commonZhMessages = {
  'common.cancel': '取消',
  'common.create': '创建',
  'common.reload': '重新加载',
  'common.close': '关闭',
  'common.clear': '清空',
  'common.confirm': '确认',
  'common.retry': '重试',
  'common.open': '打开',
  'common.view': '查看',
  'common.rename': '重命名',
  'common.delete': '删除',
  'common.download': '下载',
  'common.downloadZip': '下载 ZIP',
  'common.update': '更新',
  'common.back': '返回',
  'common.loading': '加载中…',
  'common.noData': '暂无数据',
  'common.moreActions': '更多操作',
  'common.add': '添加',
  'common.undo': '撤销',
  'common.redo': '重做',
  'common.batchAdd': '批量添加',
  'common.search': '搜索',
  'common.clearSearch': '清除搜索',
  'common.switchMode': '切换模式',
  'common.dragSort': '拖拽排序',
  'common.retryLoad': '加载失败，点击重试',
  'common.addChild': '添加子项',
  'common.edit': '编辑',
  'common.selectParent': '选择父节点',
  'common.collapseAll': '折叠全部',
  'common.expandAll': '展开全部',
  'common.deleteAll': '删除所有数据',
  'common.confirmAction': '确认操作',
  'common.file': '文件',
  'common.folder': '文件夹',
  'common.fileName': '文件名',
  'common.folderName': '文件夹名称'
} as const;

/** 演示应用共用文案的键。 */
export type CommonMessageKey = keyof typeof commonZhMessages;

/** 演示应用共用的英文文案目录；键集合必须与简体中文目录一致。 */
export const commonEnMessages = {
  'common.cancel': 'Cancel',
  'common.create': 'Create',
  'common.reload': 'Reload',
  'common.close': 'Close',
  'common.clear': 'Clear',
  'common.confirm': 'Confirm',
  'common.retry': 'Retry',
  'common.open': 'Open',
  'common.view': 'View',
  'common.rename': 'Rename',
  'common.delete': 'Delete',
  'common.download': 'Download',
  'common.downloadZip': 'Download ZIP',
  'common.update': 'Update',
  'common.back': 'Back',
  'common.loading': 'Loading…',
  'common.noData': 'No data',
  'common.moreActions': 'More actions',
  'common.add': 'Add',
  'common.undo': 'Undo',
  'common.redo': 'Redo',
  'common.batchAdd': 'Batch add',
  'common.search': 'Search',
  'common.clearSearch': 'Clear search',
  'common.switchMode': 'Switch mode',
  'common.dragSort': 'Drag to reorder',
  'common.retryLoad': 'Load failed, click to retry',
  'common.addChild': 'Add child item',
  'common.edit': 'Edit',
  'common.selectParent': 'Select parent',
  'common.collapseAll': 'Collapse all',
  'common.expandAll': 'Expand all',
  'common.deleteAll': 'Delete all data',
  'common.confirmAction': 'Confirm action',
  'common.file': 'File',
  'common.folder': 'Folder',
  'common.fileName': 'File name',
  'common.folderName': 'Folder name'
} satisfies Record<CommonMessageKey, string>;

/** 演示应用共用文案的随包目录；三端演示共用同一份。 */
export const commonCatalogs: readonly MessageCatalog[] = [
  { locale: 'zh-Hans', namespace: 'app', messages: commonZhMessages },
  { locale: 'en', namespace: 'app', messages: commonEnMessages }
];
