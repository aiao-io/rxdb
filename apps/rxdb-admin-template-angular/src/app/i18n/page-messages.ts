import type { RxDBBackupErrorCode } from '@aiao/rxdb';

/** 应用页面与备份操作的默认中文目录。 */
export const pageZhMessages = {
  'start.title': '开始使用工作台',
  'start.description': '打开当前浏览器的工作台，或在全新环境中从备份恢复数据。',
  'start.open': '打开工作台',
  'start.restore': '从备份恢复',
  'start.warning': '如需恢复，请先选择「从备份恢复」。恢复只接受尚未使用的工作台，已有数据不会被覆盖。',
  'search.title': '全文搜索',
  'search.placeholder': '搜索分类、资产与维护记录…',
  'search.loading': '搜索中…',
  'search.failed': '搜索失败：{message}',
  'search.empty': '无匹配结果',
  'search.loadMore': '加载更多',
  'search.loadingMore': '加载中…',
  'entity.loadFailed': '加载失败',
  'entity.notFound': '未找到实体 {namespace}/{name}，请从左侧导航选择可见实体。',
  'entity.none': '没有可见实体',
  'backup.title': '备份',
  'backup.description':
    '把工作台的全部数据导出为一致性归档文件。换设备或浏览器清数据后，可在空工作台用下方「恢复」导入。',
  'backup.running': '备份中…',
  'backup.download': '备份并下载',
  'backup.success': '备份成功：{bytes} 字节，sha256 {sha256}',
  'backup.restoreTitle': '恢复',
  'backup.restoreDescription':
    '从归档文件恢复整个工作台。请在新浏览器环境中打开首页，先选择「从备份恢复」，再导入归档。 已打开实体列表、搜索或执行过备份的工作台不能直接恢复，已有数据保持不变。',
  'backup.selectArchive': '选择备份归档',
  'backup.processing': '处理中…',
  'backup.restored': '恢复成功（sha256 {sha256}），',
  'backup.continue': '去实体列表继续编辑',
  'backup.cleanup': '清理恢复残留',
  'backup.reconnectFailed': '恢复已完成，但工作台重新连接失败：{message}。请刷新页面后继续',
  'backup.filePrefix': '工作台备份',
  'backup.error.unsupported_combination': '当前存储组合不支持备份 / 恢复（浏览器下仅 IndexedDB 存储支持）',
  'backup.error.incompatible_archive': '归档与当前工作台版本不兼容',
  'backup.error.auth_domain_mismatch': '归档的加密认证域与当前工作台不一致',
  'backup.error.corrupt_archive': '归档文件损坏或不是有效的工作台备份',
  'backup.error.truncated_archive': '归档文件不完整（传输中断）',
  'backup.error.target_not_empty':
    '当前工作台已初始化或正在使用，恢复只支持空工作台。请在新浏览器配置中打开工作台首页，先选择「从备份恢复」。当前数据保持不变。',
  'backup.error.target_busy':
    '当前工作台已初始化或正在使用，恢复只支持空工作台。请在新浏览器配置中打开工作台首页，先选择「从备份恢复」。当前数据保持不变。',
  'backup.error.restore_in_progress': '已有恢复在进行中，请等待完成',
  'backup.error.restore_incomplete': '上次恢复未完成，请先清理残留再重试',
  'backup.error.cleanup_pending': '存在待清理的恢复残留，请先清理',
  'backup.error.aborted': '操作已取消',
  'backup.error.io_error': '文件读写失败，请检查磁盘与文件权限',
  'backup.error.storage_full': '存储空间不足，无法完成备份',
  'backup.error.lock_timeout': '数据库正忙，请稍后重试',
  'backup.error.invalid_state': '当前状态不支持该操作，请刷新页面重试',
  'backup.error.operationFailed': '操作失败：{message}',
  'backup.error.unknown': '操作失败，原因未知'
} satisfies Record<`backup.error.${RxDBBackupErrorCode}`, string> & Record<string, string>;

/** 与中文目录逐键对齐的英文页面目录。 */
export const pageEnMessages: Record<keyof typeof pageZhMessages, string> = {
  'start.title': 'Get started with your workbench',
  'start.description': 'Open the workbench in this browser, or restore a backup in a fresh browser profile.',
  'start.open': 'Open workbench',
  'start.restore': 'Restore from backup',
  'start.warning':
    'To restore data, choose “Restore from backup” first. Restore only accepts an unused workbench and never overwrites existing data.',
  'search.title': 'Full-text search',
  'search.placeholder': 'Search categories, assets, and maintenance records…',
  'search.loading': 'Searching…',
  'search.failed': 'Search failed: {message}',
  'search.empty': 'No matching results',
  'search.loadMore': 'Load more',
  'search.loadingMore': 'Loading…',
  'entity.loadFailed': 'Loading failed',
  'entity.notFound': 'Entity {namespace}/{name} was not found. Choose a visible entity from the navigation.',
  'entity.none': 'No visible entities',
  'backup.title': 'Backup',
  'backup.description':
    'Export all workbench data as a consistent archive. Restore it into an unused workbench after changing devices or clearing browser data.',
  'backup.running': 'Backing up…',
  'backup.download': 'Back up and download',
  'backup.success': 'Backup complete: {bytes} bytes, sha256 {sha256}',
  'backup.restoreTitle': 'Restore',
  'backup.restoreDescription':
    'Restore the entire workbench from an archive. Open the home page in a new browser profile and choose “Restore from backup” before importing. A workbench that has opened entity lists or search, or created a backup, cannot be restored directly. Existing data stays unchanged.',
  'backup.selectArchive': 'Choose a backup archive',
  'backup.processing': 'Processing…',
  'backup.restored': 'Restore complete (sha256 {sha256}), ',
  'backup.continue': 'Continue editing in the entity list',
  'backup.cleanup': 'Clean up incomplete restore',
  'backup.reconnectFailed':
    'Restore completed, but reconnecting the workbench failed: {message}. Refresh the page to continue.',
  'backup.filePrefix': 'workbench-backup',
  'backup.error.unsupported_combination':
    'This storage configuration does not support backup or restore. Only IndexedDB storage is supported in browsers.',
  'backup.error.incompatible_archive': 'The archive is incompatible with this workbench version.',
  'backup.error.auth_domain_mismatch': 'The archive encryption authentication domain does not match this workbench.',
  'backup.error.corrupt_archive': 'The archive is damaged or is not a valid workbench backup.',
  'backup.error.truncated_archive': 'The archive is incomplete because its transfer was interrupted.',
  'backup.error.target_not_empty':
    'This workbench is initialized or in use. Restore requires an unused workbench. Open the home page in a new browser profile and choose “Restore from backup” first. Current data stays unchanged.',
  'backup.error.target_busy':
    'This workbench is initialized or in use. Restore requires an unused workbench. Open the home page in a new browser profile and choose “Restore from backup” first. Current data stays unchanged.',
  'backup.error.restore_in_progress': 'A restore is already in progress. Wait for it to finish.',
  'backup.error.restore_incomplete': 'The previous restore is incomplete. Clean up the remaining data before retrying.',
  'backup.error.cleanup_pending': 'An incomplete restore needs to be cleaned up first.',
  'backup.error.aborted': 'The operation was canceled.',
  'backup.error.io_error': 'File access failed. Check disk space and file permissions.',
  'backup.error.storage_full': 'There is not enough storage space to complete the backup.',
  'backup.error.lock_timeout': 'The database is busy. Try again later.',
  'backup.error.invalid_state': 'This operation is unavailable in the current state. Refresh the page and try again.',
  'backup.error.operationFailed': 'Operation failed: {message}',
  'backup.error.unknown': 'The operation failed for an unknown reason.'
};
