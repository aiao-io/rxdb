import type { I18n, MessageCatalog } from '@aiao/rxdb-i18n';

export const fileZhMessages = {
  'file.downloadedEmptyFolder': '已下载空文件夹 {name}',
  'file.downloadedFromFolder': '已从 {name} 下载 {count, number} 个文件',
  'file.downloadedEmptyFolders': '已下载 {count, number} 个空文件夹',
  'file.downloadedItems': '已下载 {count, number} 个项目（{files, number} 个文件）',
  'file.folderConflicts': '文件夹上传存在冲突',
  'file.conflictPaths': '检测到 {count, number} 个同路径文件。',
  'file.skipConflicts': '跳过冲突',
  'file.overwriteAll': '全部覆盖',
  'file.initFailed': '存储初始化失败: {detail}',
  'file.clearFailed': '清空失败: {detail}',
  'file.storageTitle': '存储浏览器',
  'file.opfsTitle': 'OPFS 文件管理',
  'file.connected': '已连接',
  'file.disconnected': '未连接',
  'file.list': '列表',
  'file.grid': '网格',
  'file.root': '根目录',
  'file.refresh': '刷新',
  'file.upload': '上传文件',
  'file.uploadFolder': '上传文件夹',
  'file.newFolder': '新建文件夹',
  'file.folderName': '文件夹名称',
  'file.fileName': '文件名',
  'file.clearSelection': '清除选择',
  'file.batchDownload': '批量下载',
  'file.batchDelete': '批量删除',
  'file.clearAll': '清空全部',
  'file.emptyStorage': '暂无上传文件',
  'file.emptyFolder': '此文件夹为空',
  'file.loading': '加载中…',
  'file.drop': '拖放文件到这里上传',
  'file.name': '名称',
  'file.size': '大小',
  'file.modified': '修改时间',
  'file.actions': '操作',
  'file.selected': '已选择 {count, number} 项',
  'file.stats': '{count, number} 项（{folders, number} 个文件夹，{files, number} 个文件）',
  'file.open': '打开',
  'file.view': '查看',
  'file.preview': '预览',
  'file.download': '下载',
  'file.downloadZip': '下载 ZIP',
  'file.rename': '重命名',
  'file.delete': '删除',
  'file.cancel': '取消',
  'file.confirm': '确定',
  'file.create': '创建',
  'file.close': '关闭',
  'file.closePreview': '关闭预览',
  'file.renameEntry': '{kind, select, file {重命名文件} other {重命名文件夹}}',
  'file.fileExists': '文件已存在',
  'file.overwriteQuestion': '文件 {name} 已存在，是否覆盖？',
  'file.existingFile': '现有文件：',
  'file.newFile': '新文件：',
  'file.overwrite': '覆盖',
  'file.confirmDelete': '确认删除',
  'file.deleteMany': '确定要删除 {count, number} 个项目吗？',
  'file.deleteOne': '{kind, select, file {确定要删除文件 {name} 吗？} other {确定要删除文件夹 {name} 吗？}}',
  'file.deleteContents': '此操作将删除文件夹及其全部内容。',
  'file.confirmAction': '确认操作',
  'file.confirmClear': '确定要清空所有文件吗？',
  'file.previewUnsupported': '无法预览此文件',
  'file.audioUnsupported': '不支持音频预览',
  'file.videoUnsupported': '不支持视频预览',
  'file.uploadSuccess': '文件上传成功',
  'file.uploaded': '成功上传 {count, number} 个文件',
  'file.uploadingFolder': '正在上传文件夹，共 {count, number} 个文件...',
  'file.uploadFinished': '上传完成：{succeeded, number} 成功，{failed, number} 失败',
  'file.folderCreated': '文件夹创建成功',
  'file.renameSuccess': '重命名成功',
  'file.clearSuccess': '已清空所有文件',
  'file.deleteFailed': '删除失败: {detail}',
  'file.deleteFailures': '{count, number} 个项目删除失败',
  'file.deleted': '成功删除 {count, number} 个项目',
  'file.noSelection': '没有选中文件',
  'file.preparingFile': '正在准备 {name}...',
  'file.preparingItems': '正在准备 {count, number} 个项目...',
  'file.downloaded': '成功下载 {count, number} 个文件',
  'file.downloading': '正在下载 {count, number} 个文件...',
  'file.opfsUnsupported': '浏览器不支持 OPFS',
  'file.directoryMissing': '目录不存在: {path}',
  'file.rootFailed': '获取根目录失败: {detail}',
  'file.readFailed': '读取目录失败: {detail}',
  'file.uploadFailed': '上传失败: {detail}',
  'file.downloadFailed': '下载失败: {detail}',
  'file.createFailed': '创建目录失败: {detail}',
  'file.renameFailed': '重命名失败: {detail}',
  'file.previewFailed': '预览失败: {detail}'
} as const;

export const fileEnMessages = {
  'file.downloadedEmptyFolder': 'Downloaded empty folder {name}',
  'file.downloadedFromFolder':
    '{count, plural, one {Downloaded # file from {name}} other {Downloaded # files from {name}}}',
  'file.downloadedEmptyFolders': '{count, plural, one {Downloaded # empty folder} other {Downloaded # empty folders}}',
  'file.downloadedItems':
    '{count, plural, one {Downloaded # item} other {Downloaded # items}} ({files, plural, one {# file} other {# files}})',
  'file.folderConflicts': 'Folder upload conflicts',
  'file.conflictPaths':
    '{count, plural, one {# file already exists at the same path.} other {# files already exist at the same paths.}}',
  'file.skipConflicts': 'Skip conflicts',
  'file.overwriteAll': 'Overwrite all',
  'file.initFailed': 'Storage initialization failed: {detail}',
  'file.clearFailed': 'Could not clear storage: {detail}',
  'file.storageTitle': 'Storage browser',
  'file.opfsTitle': 'OPFS file manager',
  'file.connected': 'Connected',
  'file.disconnected': 'Disconnected',
  'file.list': 'List',
  'file.grid': 'Grid',
  'file.root': 'Root directory',
  'file.refresh': 'Refresh',
  'file.upload': 'Upload File',
  'file.uploadFolder': 'Upload Folder',
  'file.newFolder': 'New folder',
  'file.folderName': 'Folder name',
  'file.fileName': 'File name',
  'file.clearSelection': 'Clear selection',
  'file.batchDownload': 'Download all',
  'file.batchDelete': 'Delete all',
  'file.clearAll': 'Clear All',
  'file.emptyStorage': 'No files uploaded yet',
  'file.emptyFolder': 'This folder is empty',
  'file.loading': 'Loading…',
  'file.drop': 'Drop files here to upload',
  'file.name': 'Name',
  'file.size': 'Size',
  'file.modified': 'Modified',
  'file.actions': 'Actions',
  'file.selected': '{count, plural, one {# item selected} other {# items selected}}',
  'file.stats':
    '{count, plural, one {# item} other {# items}} ({folders, plural, one {# folder} other {# folders}}, {files, plural, one {# file} other {# files}})',
  'file.open': 'Open',
  'file.view': 'View',
  'file.preview': 'Preview',
  'file.download': 'Download',
  'file.downloadZip': 'Download ZIP',
  'file.rename': 'Rename',
  'file.delete': 'Delete',
  'file.cancel': 'Cancel',
  'file.confirm': 'Confirm',
  'file.create': 'Create',
  'file.close': 'Close',
  'file.closePreview': 'Close preview',
  'file.renameEntry': '{kind, select, file {Rename file} other {Rename folder}}',
  'file.fileExists': 'File already exists',
  'file.overwriteQuestion': 'File {name} already exists. Overwrite it?',
  'file.existingFile': 'Existing file:',
  'file.newFile': 'New file:',
  'file.overwrite': 'Overwrite',
  'file.confirmDelete': 'Confirm delete',
  'file.deleteMany':
    '{count, plural, one {Are you sure you want to delete # item?} other {Are you sure you want to delete # items?}}',
  'file.deleteOne':
    '{kind, select, file {Are you sure you want to delete the file {name}?} other {Are you sure you want to delete the folder {name}?}}',
  'file.deleteContents': 'This will delete the folder and all of its contents.',
  'file.confirmAction': 'Confirm action',
  'file.confirmClear': 'Are you sure you want to clear all files?',
  'file.previewUnsupported': 'Unable to preview this file',
  'file.audioUnsupported': 'Audio preview is not supported',
  'file.videoUnsupported': 'Video preview is not supported',
  'file.uploadSuccess': 'File uploaded successfully',
  'file.uploaded': '{count, plural, one {Uploaded # file} other {Uploaded # files}}',
  'file.uploadingFolder': '{count, plural, one {Uploading folder with # file…} other {Uploading folder with # files…}}',
  'file.uploadFinished': 'Upload finished: {succeeded, number} succeeded, {failed, number} failed',
  'file.folderCreated': 'Folder created successfully',
  'file.renameSuccess': 'Rename successful',
  'file.clearSuccess': 'All files cleared',
  'file.deleteFailed': 'Delete failed: {detail}',
  'file.deleteFailures': '{count, plural, one {# item failed to delete} other {# items failed to delete}}',
  'file.deleted': '{count, plural, one {Deleted # item} other {Deleted # items}}',
  'file.noSelection': 'No files selected',
  'file.preparingFile': 'Preparing {name}…',
  'file.preparingItems': '{count, plural, one {Preparing # item…} other {Preparing # items…}}',
  'file.downloaded': '{count, plural, one {Downloaded # file} other {Downloaded # files}}',
  'file.downloading': '{count, plural, one {Downloading # file…} other {Downloading # files…}}',
  'file.opfsUnsupported': 'This browser does not support OPFS',
  'file.directoryMissing': 'Directory not found: {path}',
  'file.rootFailed': 'Could not open the root directory: {detail}',
  'file.readFailed': 'Could not read the directory: {detail}',
  'file.uploadFailed': 'Upload failed: {detail}',
  'file.downloadFailed': 'Download failed: {detail}',
  'file.createFailed': 'Could not create the folder: {detail}',
  'file.renameFailed': 'Rename failed: {detail}',
  'file.previewFailed': 'Preview failed: {detail}'
} satisfies Record<keyof typeof fileZhMessages, string>;

export const fileCatalogs: readonly MessageCatalog[] = [
  { locale: 'zh-Hans', namespace: 'app', messages: fileZhMessages },
  { locale: 'en', namespace: 'app', messages: fileEnMessages }
];

export type FileMessageKey = keyof typeof fileZhMessages;
export type FileMessage = { key: FileMessageKey; params?: Record<string, string | number> };

export function fileMessage(key: FileMessageKey, params?: FileMessage['params']): FileMessage {
  return { key, params };
}

export function renderFileMessage(t: I18n['t'], message: FileMessage | string): string {
  return typeof message === 'string' ? message : t(message.key, message.params);
}

export function formatFileDate(timestamp?: number, locale = 'zh-Hans'): string {
  if (timestamp === undefined) return '-';
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(timestamp);
}

export function orderFileEntries<T extends { kind: 'file' | 'directory'; name: string }>(
  entries: readonly T[],
  locale: string
): T[] {
  const { compare } = new Intl.Collator(locale);
  return [...entries].sort((left, right) =>
    left.kind === right.kind ? compare(left.name, right.name)
    : left.kind === 'directory' ? -1
    : 1
  );
}

export function formatFileSize(bytes: number, locale: string): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  const size = Number.isFinite(bytes) ? Math.max(0, bytes) : 0;
  const unitIndex = Math.min(Math.floor(Math.log(Math.max(1, size)) / Math.log(1024)), units.length - 1);
  const amount = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(size / 1024 ** unitIndex);
  return `${amount} ${units[unitIndex]}`;
}

export type FileDeleteTarget<T> = { type: 'single'; entry: T } | { type: 'batch'; count: number };

export function fileError(key: FileMessageKey, cause: unknown): FileMessage {
  return fileMessage(key, { detail: cause instanceof Error ? cause.message : String(cause) });
}
