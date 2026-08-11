/**
 * OPFS 工具函数
 */

import {
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileText,
  FileVideo,
  Folder,
  LucideIcon
} from 'lucide-react';

export interface OPFSFileEntry {
  name: string;
  kind: 'file' | 'directory';
  handle: FileSystemFileHandle | FileSystemDirectoryHandle;
  size?: number;
  type?: string;
  lastModified?: number;
  path: string;
}

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

export const PREVIEW_SIZE_LIMIT = 50 * 1024 * 1024;

export function normalizePath(path: string): string {
  return path.startsWith('/') ? '.' + path : path;
}

function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || '';
}

export function canPreviewFile(entry: OPFSFileEntry): boolean {
  if (entry.kind !== 'file') return false;
  const ext = getFileExtension(entry.name);
  if (
    FILE_EXTENSIONS.image.has(ext) ||
    FILE_EXTENSIONS.audio.has(ext) ||
    FILE_EXTENSIONS.video.has(ext) ||
    FILE_EXTENSIONS.code.has(ext) ||
    FILE_EXTENSIONS.text.has(ext)
  ) {
    return true;
  }
  return !ext || ext.length === 0;
}

export async function isTextFile(file: globalThis.File): Promise<boolean> {
  try {
    const slice = file.slice(0, 8192);
    const text = await slice.text();
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

export function getFileType(entry: OPFSFileEntry): 'image' | 'audio' | 'video' | 'code' | 'text' | 'unknown' {
  const ext = getFileExtension(entry.name);
  if (FILE_EXTENSIONS.image.has(ext)) return 'image';
  if (FILE_EXTENSIONS.audio.has(ext)) return 'audio';
  if (FILE_EXTENSIONS.video.has(ext)) return 'video';
  if (FILE_EXTENSIONS.code.has(ext)) return 'code';
  if (FILE_EXTENSIONS.text.has(ext)) return 'text';
  return 'unknown';
}

export function getCodeLanguage(filename: string): string {
  const ext = getFileExtension(filename);
  const languageMap: Record<string, string> = {
    ts: 'TypeScript',
    mts: 'TypeScript',
    cts: 'TypeScript',
    tsx: 'TSX',
    js: 'JavaScript',
    jsx: 'JSX',
    mjs: 'JavaScript',
    cjs: 'JavaScript',
    json: 'JSON',
    html: 'HTML',
    htm: 'HTML',
    css: 'CSS',
    scss: 'SCSS',
    sass: 'Sass',
    xml: 'XML',
    py: 'Python',
    pyw: 'Python',
    java: 'Java',
    c: 'C',
    cpp: 'C++',
    cc: 'C++',
    cxx: 'C++',
    h: 'C',
    hpp: 'C++',
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

export function isImageFile(entry: OPFSFileEntry): boolean {
  if (entry.kind !== 'file') return false;
  return FILE_EXTENSIONS.image.has(getFileExtension(entry.name));
}

export function getFileIcon(entry: OPFSFileEntry): LucideIcon {
  if (entry.kind === 'directory') return Folder;
  const ext = getFileExtension(entry.name);
  if (FILE_EXTENSIONS.image.has(ext)) return FileImage;
  if (FILE_EXTENSIONS.video.has(ext)) return FileVideo;
  if (FILE_EXTENSIONS.audio.has(ext)) return FileAudio;
  if (FILE_EXTENSIONS.archive.has(ext)) return FileArchive;
  if (FILE_EXTENSIONS.code.has(ext)) return FileCode;
  if (FILE_EXTENSIONS.text.has(ext)) return FileText;
  return File;
}

export function getFileIconColor(entry: OPFSFileEntry): string {
  if (entry.kind === 'directory') return 'text-warning';
  const ext = getFileExtension(entry.name);
  if (FILE_EXTENSIONS.image.has(ext)) return 'text-purple-500';
  if (FILE_EXTENSIONS.video.has(ext)) return 'text-pink-500';
  if (FILE_EXTENSIONS.audio.has(ext)) return 'text-cyan-500';
  if (FILE_EXTENSIONS.archive.has(ext)) return 'text-orange-500';
  if (FILE_EXTENSIONS.code.has(ext)) return 'text-blue-500';
  if (FILE_EXTENSIONS.text.has(ext)) return 'text-green-500';
  return 'text-base-content/60';
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

export function formatDate(timestamp?: number): string {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}
