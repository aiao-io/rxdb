/**
 * 文件类型枚举
 */
export enum FileType {
  TEXT = 'text',
  MARKDOWN = 'markdown',
  PDF = 'pdf',
  WORD = 'word',
  EXCEL = 'excel',
  POWERPOINT = 'powerpoint',
  JAVASCRIPT = 'javascript',
  TYPESCRIPT = 'typescript',
  HTML = 'html',
  CSS = 'css',
  JSON = 'json',
  YAML = 'yaml',
  XML = 'xml',
  IMAGE = 'image',
  SVG = 'svg',
  VIDEO = 'video',
  AUDIO = 'audio',
  ARCHIVE = 'archive',
  EXECUTABLE = 'executable',
  OTHER = 'other'
}

/**
 * 根据扩展名判断文件类型
 */
export function getFileType(extension: string | null | undefined): FileType {
  if (!extension) return FileType.OTHER;

  const ext = extension.toLowerCase();

  // Text files
  if (['txt', 'log', 'md', 'markdown'].includes(ext)) {
    return ext === 'md' || ext === 'markdown' ? FileType.MARKDOWN : FileType.TEXT;
  }

  // Documents
  if (ext === 'pdf') return FileType.PDF;
  if (['doc', 'docx'].includes(ext)) return FileType.WORD;
  if (['xls', 'xlsx'].includes(ext)) return FileType.EXCEL;
  if (['ppt', 'pptx'].includes(ext)) return FileType.POWERPOINT;

  // Code files
  if (['js', 'jsx', 'mjs', 'cjs'].includes(ext)) return FileType.JAVASCRIPT;
  if (['ts', 'tsx'].includes(ext)) return FileType.TYPESCRIPT;
  if (['html', 'htm'].includes(ext)) return FileType.HTML;
  if (['css', 'scss', 'sass', 'less'].includes(ext)) return FileType.CSS;
  if (ext === 'json') return FileType.JSON;
  if (['yaml', 'yml'].includes(ext)) return FileType.YAML;
  if (ext === 'xml') return FileType.XML;

  // Media files
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext)) return FileType.IMAGE;
  if (ext === 'svg') return FileType.SVG;
  if (['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm'].includes(ext)) return FileType.VIDEO;
  if (['mp3', 'wav', 'flac', 'aac', 'ogg'].includes(ext)) return FileType.AUDIO;

  // Archives
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext)) return FileType.ARCHIVE;

  // Executables
  if (['exe', 'app', 'dmg', 'deb', 'rpm'].includes(ext)) return FileType.EXECUTABLE;

  return FileType.OTHER;
}

/**
 * 获取文件图标名称（用于 lucide-react）
 */
export function getFileIcon(type: 'file' | 'folder', extension?: string | null): string {
  if (type === 'folder') {
    return 'folder';
  }

  const fileType = getFileType(extension || null);

  switch (fileType) {
    case FileType.TEXT:
    case FileType.MARKDOWN:
    case FileType.PDF:
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
