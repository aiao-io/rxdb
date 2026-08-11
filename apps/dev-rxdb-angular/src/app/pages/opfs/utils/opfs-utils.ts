/**
 * OPFS 工具函数
 */

import {
  LucideFileArchive as FileArchive,
  LucideFileAudio as FileAudio,
  LucideFileCode as FileCode,
  LucideFile as FileIcon,
  LucideFileImage as FileImage,
  LucideFileText as FileText,
  LucideFileVideo as FileVideo,
  LucideFolder as Folder
} from '@lucide/angular';

export interface OPFSFileEntry {
  name: string;
  kind: 'file' | 'directory';
  handle: FileSystemFileHandle | FileSystemDirectoryHandle;
  size?: number;
  type?: string;
  lastModified?: number;
  path: string;
}

// 文件扩展名常量（使用 Set 提升性能和类型安全）
export const FILE_EXTENSIONS = {
  image: new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico']),
  audio: new Set(['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac']),
  video: new Set(['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv']),
  text: new Set(['txt', 'md', 'log', 'csv']),
  archive: new Set(['zip', 'rar', '7z', 'tar', 'gz', 'bz2']),
  code: new Set([
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
  ])
} as const;

// 预览文件大小限制（50MB）
export const PREVIEW_SIZE_LIMIT = 50 * 1024 * 1024;

/**
 * 规范化 OPFS 路径
 * 将绝对路径 /name 转换为相对路径 ./name
 */
export function normalizePath(path: string): string {
  return path.startsWith('/') ? '.' + path : path;
}

/**
 * 从完整路径中提取父目录路径
 */
export function getParentPath(path: string, isDirectory: boolean): string {
  const parts = path.split('/');
  const parentParts = parts.slice(0, isDirectory ? -2 : -1);
  return parentParts.join('/') + '/';
}

/**
 * 从完整路径中提取文件/目录名
 */
export function getNameFromPath(path: string, isDirectory: boolean): string {
  const parts = path.split('/');
  return parts[parts.length - (isDirectory ? 2 : 1)];
}

/**
 * 获取文件扩展名
 */
function getFileExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf('.');
  return dotIndex > 0 ? filename.slice(dotIndex + 1).toLowerCase() : '';
}

/**
 * 判断文件是否可以预览
 * 对于已知扩展名的文件直接返回，否则需要异步检测
 */
export function canPreviewFile(entry: OPFSFileEntry): boolean {
  if (entry.kind !== 'file') return false;
  const ext = getFileExtension(entry.name);

  // 已知的可预览类型
  if (
    FILE_EXTENSIONS.image.has(ext) ||
    FILE_EXTENSIONS.audio.has(ext) ||
    FILE_EXTENSIONS.video.has(ext) ||
    FILE_EXTENSIONS.code.has(ext) ||
    FILE_EXTENSIONS.text.has(ext)
  ) {
    return true;
  }
  // 对于未知扩展名或无扩展名的文件，假设可能是文本
  return !ext || ext.length === 0;
}

/**
 * 检测文件内容是否为文本（UTF-8）
 */
export async function isTextFile(file: File): Promise<boolean> {
  try {
    // 只读取前 8KB 进行检测
    const slice = file.slice(0, 8192);
    const text = await slice.text();

    // 检查是否包含控制字符（排除常见的换行、制表符等）
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      // 允许：换行(10)、回车(13)、制表符(9)
      // 不允许：其他控制字符 (0-8, 11-12, 14-31)
      if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取文件类型（用于预览）
 * 对于未知类型，返回 'unknown'，后续可通过异步检测判断是否为文本
 */
export function getFileType(entry: OPFSFileEntry): 'image' | 'audio' | 'video' | 'code' | 'text' | 'unknown' {
  const ext = getFileExtension(entry.name);
  if (FILE_EXTENSIONS.image.has(ext)) return 'image';
  if (FILE_EXTENSIONS.audio.has(ext)) return 'audio';
  if (FILE_EXTENSIONS.video.has(ext)) return 'video';
  if (FILE_EXTENSIONS.code.has(ext)) return 'code';
  if (FILE_EXTENSIONS.text.has(ext)) return 'text';
  return 'unknown';
}

/**
 * 根据文件扩展名获取代码编辑器语言
 * 返回 CodeMirror 支持的语言名称
 */
export function getCodeLanguage(filename: string): string {
  const ext = getFileExtension(filename);
  const languageMap: Record<string, string> = {
    // JavaScript/TypeScript
    ts: 'TypeScript',
    mts: 'TypeScript',
    cts: 'TypeScript',
    tsx: 'TSX',
    js: 'JavaScript',
    jsx: 'JSX',
    mjs: 'JavaScript',
    cjs: 'JavaScript',
    // Web
    json: 'JSON',
    html: 'HTML',
    htm: 'HTML',
    css: 'CSS',
    scss: 'SCSS',
    sass: 'Sass',
    xml: 'XML',
    // Python
    py: 'Python',
    pyw: 'Python',
    // Java/C/C++
    java: 'Java',
    c: 'C',
    cpp: 'C++',
    cc: 'C++',
    cxx: 'C++',
    h: 'C',
    hpp: 'C++',
    // Other
    rs: 'Rust',
    go: 'Go',
    rb: 'Ruby',
    php: 'PHP',
    md: 'Markdown',
    markdown: 'Markdown',
    yaml: 'YAML',
    yml: 'YAML',
    sql: 'SQL',
    sh: 'Shell',
    bash: 'Shell',
    vue: 'Vue',
    svelte: 'Svelte'
  };
  return languageMap[ext] || 'JavaScript';
}

/**
 * 判断是否为图片文件
 */
export function isImageFile(entry: OPFSFileEntry): boolean {
  if (entry.kind !== 'file') return false;
  return FILE_EXTENSIONS.image.has(getFileExtension(entry.name));
}

/**
 * 获取文件图标
 */
export function getFileIcon(entry: OPFSFileEntry) {
  if (entry.kind === 'directory') {
    return Folder;
  }

  const ext = getFileExtension(entry.name);
  if (FILE_EXTENSIONS.image.has(ext)) return FileImage;
  if (FILE_EXTENSIONS.video.has(ext)) return FileVideo;
  if (FILE_EXTENSIONS.audio.has(ext)) return FileAudio;
  if (FILE_EXTENSIONS.archive.has(ext)) return FileArchive;
  if (FILE_EXTENSIONS.code.has(ext)) return FileCode;
  if (FILE_EXTENSIONS.text.has(ext)) return FileText;
  return FileIcon;
}

/**
 * 获取文件/文件夹的颜色类（Tailwind CSS）
 */
export function getFileIconColor(entry: OPFSFileEntry): string {
  if (entry.kind === 'directory') {
    return 'text-warning'; // 黄色
  }

  const ext = getFileExtension(entry.name);

  // 图片 - 紫色
  if (FILE_EXTENSIONS.image.has(ext)) return 'text-purple-500';

  // 视频 - 粉红色
  if (FILE_EXTENSIONS.video.has(ext)) return 'text-pink-500';

  // 音频 - 青色
  if (FILE_EXTENSIONS.audio.has(ext)) return 'text-cyan-500';

  // 压缩包 - 橙色
  if (FILE_EXTENSIONS.archive.has(ext)) return 'text-orange-500';

  // 代码文件 - 蓝色
  if (FILE_EXTENSIONS.code.has(ext)) return 'text-blue-500';

  // 文本文件 - 绿色
  if (FILE_EXTENSIONS.text.has(ext)) return 'text-green-500';

  // 默认 - 灰色
  return 'text-base-content/60';
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}
