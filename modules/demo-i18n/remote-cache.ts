import type { MessageCatalog } from '@aiao/rxdb-i18n';

/** 远程缓存演示页的简体中文文案目录。 */
export const remoteCacheZhMessages = {
  'page.remoteCache.title': '远程缓存',
  'page.remoteCache.online': '在线',
  'page.remoteCache.offline': '离线',
  'page.remoteCache.description':
    'OPFS-first 缓存示例：首次联网下载 → 落盘 OPFS + StorageFileMeta → 后续命中本地不联网',
  'page.remoteCache.presets': '预设资源',
  'page.remoteCache.presetsDescription': '点击按钮触发 `rxdb.storage.fetch(opfsPath, options)`。',
  'page.remoteCache.customUrl': '自定义 URL',
  'page.remoteCache.customDescription': '输入任意 CORS 友好的 URL 和 OPFS 路径。',
  'page.remoteCache.url': 'URL',
  'page.remoteCache.opfsPath': 'OPFS 路径',
  'page.remoteCache.fetch': '获取',
  'page.remoteCache.cached': '已缓存（{count}）',
  'page.remoteCache.clearAll': '清空全部',
  'page.remoteCache.empty': '还没有缓存内容。点击上方预设或自定义按钮开始。',
  'page.remoteCache.logs': '事件日志',
  'page.remoteCache.emptyLogs': '日志为空。'
} as const;

/** 远程缓存演示页的文案键。 */
export type RemoteCacheMessageKey = keyof typeof remoteCacheZhMessages;

/** 远程缓存演示页的英文文案目录；键集合必须与简体中文目录一致。 */
export const remoteCacheEnMessages = {
  'page.remoteCache.title': 'Remote Cache',
  'page.remoteCache.online': 'Online',
  'page.remoteCache.offline': 'Offline',
  'page.remoteCache.description':
    'OPFS-first cache demo: download online once → persist to OPFS + StorageFileMeta → serve locally afterward',
  'page.remoteCache.presets': 'Preset resources',
  'page.remoteCache.presetsDescription': 'Click a button to call `rxdb.storage.fetch(opfsPath, options)`.',
  'page.remoteCache.customUrl': 'Custom URL',
  'page.remoteCache.customDescription': 'Enter any CORS-friendly URL and an OPFS path.',
  'page.remoteCache.url': 'URL',
  'page.remoteCache.opfsPath': 'OPFS path',
  'page.remoteCache.fetch': 'Fetch',
  'page.remoteCache.cached': 'Cached ({count})',
  'page.remoteCache.clearAll': 'Clear all',
  'page.remoteCache.empty': 'No cached content yet. Start with a preset or custom resource above.',
  'page.remoteCache.logs': 'Event log',
  'page.remoteCache.emptyLogs': 'The log is empty.'
} satisfies Record<RemoteCacheMessageKey, string>;

/** 远程缓存演示页的随包目录；三端演示共用同一份。 */
export const remoteCacheCatalogs: readonly MessageCatalog[] = [
  { locale: 'zh-Hans', namespace: 'app', messages: remoteCacheZhMessages },
  { locale: 'en', namespace: 'app', messages: remoteCacheEnMessages }
];
