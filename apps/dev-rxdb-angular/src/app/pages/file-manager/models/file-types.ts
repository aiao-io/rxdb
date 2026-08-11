/**
 * File type enum for mapping extensions to file types
 */
export enum FileType {
  // Documents
  TEXT = 'text',
  MARKDOWN = 'markdown',
  PDF = 'pdf',
  WORD = 'word',
  EXCEL = 'excel',
  POWERPOINT = 'powerpoint',

  // Code
  JAVASCRIPT = 'javascript',
  TYPESCRIPT = 'typescript',
  HTML = 'html',
  CSS = 'css',
  JSON = 'json',
  YAML = 'yaml',
  XML = 'xml',

  // Images
  IMAGE = 'image',
  SVG = 'svg',

  // Media
  VIDEO = 'video',
  AUDIO = 'audio',

  // Archives
  ARCHIVE = 'archive',

  // Other
  FOLDER = 'folder',
  UNKNOWN = 'unknown'
}

/**
 * File extension to type mapping
 */
export const FILE_EXTENSION_MAP: Record<string, FileType> = {
  // Documents
  '.txt': FileType.TEXT,
  '.md': FileType.MARKDOWN,
  '.pdf': FileType.PDF,
  '.doc': FileType.WORD,
  '.docx': FileType.WORD,
  '.xls': FileType.EXCEL,
  '.xlsx': FileType.EXCEL,
  '.ppt': FileType.POWERPOINT,
  '.pptx': FileType.POWERPOINT,

  // Code
  '.js': FileType.JAVASCRIPT,
  '.jsx': FileType.JAVASCRIPT,
  '.mjs': FileType.JAVASCRIPT,
  '.cjs': FileType.JAVASCRIPT,
  '.ts': FileType.TYPESCRIPT,
  '.tsx': FileType.TYPESCRIPT,
  '.mts': FileType.TYPESCRIPT,
  '.cts': FileType.TYPESCRIPT,
  '.html': FileType.HTML,
  '.htm': FileType.HTML,
  '.css': FileType.CSS,
  '.scss': FileType.CSS,
  '.sass': FileType.CSS,
  '.less': FileType.CSS,
  '.json': FileType.JSON,
  '.yaml': FileType.YAML,
  '.yml': FileType.YAML,
  '.xml': FileType.XML,

  // Images
  '.jpg': FileType.IMAGE,
  '.jpeg': FileType.IMAGE,
  '.png': FileType.IMAGE,
  '.gif': FileType.IMAGE,
  '.webp': FileType.IMAGE,
  '.bmp': FileType.IMAGE,
  '.svg': FileType.SVG,

  // Media
  '.mp4': FileType.VIDEO,
  '.avi': FileType.VIDEO,
  '.mov': FileType.VIDEO,
  '.mkv': FileType.VIDEO,
  '.webm': FileType.VIDEO,
  '.mp3': FileType.AUDIO,
  '.wav': FileType.AUDIO,
  '.flac': FileType.AUDIO,
  '.m4a': FileType.AUDIO,
  '.ogg': FileType.AUDIO,

  // Archives
  '.zip': FileType.ARCHIVE,
  '.tar': FileType.ARCHIVE,
  '.gz': FileType.ARCHIVE,
  '.rar': FileType.ARCHIVE,
  '.7z': FileType.ARCHIVE
};

/**
 * Get file type from extension
 */
export function getFileType(extension: string | null): FileType {
  if (!extension) return FileType.UNKNOWN;
  return FILE_EXTENSION_MAP[extension.toLowerCase()] || FileType.UNKNOWN;
}

/**
 * Get icon name for lucide-angular based on file type
 */
export function getFileIcon(type: 'file' | 'folder', extension?: string | null): string {
  if (type === 'folder') {
    return 'folder';
  }

  const fileType = getFileType(extension || null);

  switch (fileType) {
    case FileType.TEXT:
      return 'file-text';
    case FileType.MARKDOWN:
      return 'file-text';
    case FileType.PDF:
      return 'file-text';
    case FileType.WORD:
    case FileType.EXCEL:
    case FileType.POWERPOINT:
      return 'file-text';
    case FileType.JAVASCRIPT:
    case FileType.TYPESCRIPT:
    case FileType.HTML:
    case FileType.CSS:
    case FileType.JSON:
    case FileType.YAML:
    case FileType.XML:
      return 'file-code';
    case FileType.IMAGE:
    case FileType.SVG:
      return 'file-image';
    case FileType.VIDEO:
      return 'file-video';
    case FileType.AUDIO:
      return 'file-audio';
    case FileType.ARCHIVE:
      return 'file-archive';
    default:
      return 'file';
  }
}
