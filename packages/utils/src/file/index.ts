/**
 * @fileoverview 文件操作工具模块
 *
 * @module file
 */

/**
 * 把字节数格式化成带单位的可读字符串。
 *
 * 单位止于 `GB`：更大的值继续用 GB 表示，不会出现 TB。数值保留两位小数。
 * 非法输入**不抛错**，一律降级成 `'0 B'`，方便直接渲染。
 *
 * @param bytes - 字节数
 * @returns 形如 `'1.5 MB'` 的字符串；`bytes` 为 `NaN` / `Infinity` / 负数 / `0` 时返回 `'0 B'`
 * @example
 * formatFileSize(1536); // '1.5 KB'
 * formatFileSize(-1);   // '0 B'
 */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return Math.round((bytes / Math.pow(k, unitIndex)) * 100) / 100 + ' ' + sizes[unitIndex];
}

/**
 * 取文件名的扩展名，小写、不含点。
 *
 * 会先剥掉 `/` 与 `\` 之前的目录部分再找最后一个点。点开头且不含其他点的文件
 * （`.bashrc`）视为**没有扩展名**。
 *
 * @param filename - 文件名或路径
 * @returns 小写扩展名；没有扩展名时返回空串 `''`，不抛错
 * @example
 * getFileExtension('a/b/C.PNG'); // 'png'
 * getFileExtension('.bashrc');   // ''
 */
export function getFileExtension(filename: string): string {
  // 先剥掉目录部分：`a.b/c` 的扩展名是空，不是 `b/c`
  const base = filename.slice(Math.max(filename.lastIndexOf('/'), filename.lastIndexOf('\\')) + 1);
  const dot = base.lastIndexOf('.');
  // `dot > 0` 而非 `>= 0`：`.bashrc` 这类点开头的无扩展名文件，
  // 原实现 `split('.').pop()` 会把整个文件名当成扩展名返回 'bashrc'（UTL-020）
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

/**
 * 判断文件是否属于可预览类型（图片 / 音频 / 视频 / 代码 / 文本）。
 *
 * 只看扩展名，不读文件内容，因此改名即改判定。
 *
 * @param filename - 文件名或路径
 * @returns 扩展名在可预览白名单内则为 `true`；无扩展名或不在名单内返回 `false`
 */
export function isPreviewableType(filename: string): boolean {
  const ext = getFileExtension(filename);
  return PREVIEWABLE_EXTENSIONS.has(ext);
}

/**
 * 判断文件是否为图片。
 *
 * 只看扩展名，不读文件内容，也不做 MIME 嗅探。
 *
 * @param filename - 文件名或路径
 * @returns 扩展名属于图片则为 `true`，否则 `false`
 */
export function isImageType(filename: string): boolean {
  return IMAGE_EXTENSIONS.has(getFileExtension(filename));
}

/**
 * 按扩展名归类文件。
 *
 * 分类互斥且**按固定顺序**匹配：image → audio → video → code → text → archive。
 * 同时出现在多个集合里的扩展名（如 `ogg` 既是音频又是视频）落在靠前的那一类。
 *
 * @param filename - 文件名或路径
 * @returns 分类名；无扩展名或不在任何集合内返回 `'unknown'`
 */
export function getFileCategory(
  filename: string
): 'image' | 'audio' | 'video' | 'code' | 'text' | 'archive' | 'unknown' {
  const ext = getFileExtension(filename);
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  if (CODE_EXTENSIONS.has(ext)) return 'code';
  if (TEXT_EXTENSIONS.has(ext)) return 'text';
  if (ARCHIVE_EXTENSIONS.has(ext)) return 'archive';
  return 'unknown';
}

/**
 * 把时间戳格式化成 `zh-CN` 的「年-月-日 时:分」。
 *
 * 使用运行环境的本地时区，同一时间戳在不同时区渲染结果不同。
 * 非法输入**不抛错**，一律降级成 `'-'`，方便直接渲染。
 *
 * @param timestamp - 毫秒时间戳、可被 `Date` 解析的字符串，或 `Date` 实例
 * @returns 形如 `'2026/08/07 12:30'` 的字符串；`undefined` / `null` / 空串 /
 *          解析不出有效时间（`Invalid Date`）时返回 `'-'`
 */
export function formatDate(timestamp?: number | string | Date): string {
  if (timestamp === undefined || timestamp === null || timestamp === '') return '-';
  const date =
    timestamp instanceof Date ? timestamp
    : typeof timestamp === 'string' ? new Date(timestamp)
    : new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '-';
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv']);
const TEXT_EXTENSIONS = new Set(['txt', 'md', 'log', 'csv']);
const ARCHIVE_EXTENSIONS = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'bz2']);
const CODE_EXTENSIONS = new Set([
  'js',
  'mjs',
  'cjs',
  'ts',
  'mts',
  'cts',
  'tsx',
  'jsx',
  'json',
  'html',
  'css',
  'scss',
  'sass',
  'py',
  'java',
  'c',
  'cpp',
  'h',
  'hpp',
  'rs',
  'go',
  'rb',
  'php',
  'xml',
  'yaml',
  'yml',
  'sql',
  'sh',
  'bash',
  'vue',
  'svelte'
]);

const PREVIEWABLE_EXTENSIONS = new Set([
  ...IMAGE_EXTENSIONS,
  ...AUDIO_EXTENSIONS,
  ...VIDEO_EXTENSIONS,
  ...CODE_EXTENSIONS,
  ...TEXT_EXTENSIONS
]);
