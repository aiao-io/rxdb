import { FileArchive, FileAudio, FileCode, FileImage, FileText, FileVideo } from 'lucide-react';

/**
 * 常用文件扩展名选项
 */
export const extensionOptions = [
  { value: '.txt', label: '.txt (文本)', icon: FileText },
  { value: '.md', label: '.md (Markdown)', icon: FileText },
  { value: '.json', label: '.json (JSON)', icon: FileCode },
  { value: '.js', label: '.js (JavaScript)', icon: FileCode },
  { value: '.ts', label: '.ts (TypeScript)', icon: FileCode },
  { value: '.html', label: '.html (HTML)', icon: FileCode },
  { value: '.css', label: '.css (CSS)', icon: FileCode },
  { value: '.jpg', label: '.jpg (图片)', icon: FileImage },
  { value: '.png', label: '.png (图片)', icon: FileImage },
  { value: '.pdf', label: '.pdf (PDF)', icon: FileText },
  { value: '.zip', label: '.zip (压缩包)', icon: FileArchive }
] as const;

/**
 * 扩展名到图标的映射
 */
export const extensionIconMap: Record<string, typeof FileText> = {
  '.txt': FileText,
  '.md': FileText,
  '.json': FileCode,
  '.js': FileCode,
  '.ts': FileCode,
  '.tsx': FileCode,
  '.jsx': FileCode,
  '.html': FileCode,
  '.css': FileCode,
  '.scss': FileCode,
  '.less': FileCode,
  '.jpg': FileImage,
  '.jpeg': FileImage,
  '.png': FileImage,
  '.gif': FileImage,
  '.svg': FileImage,
  '.webp': FileImage,
  '.mp4': FileVideo,
  '.avi': FileVideo,
  '.mov': FileVideo,
  '.mp3': FileAudio,
  '.wav': FileAudio,
  '.ogg': FileAudio,
  '.zip': FileArchive,
  '.tar': FileArchive,
  '.gz': FileArchive,
  '.rar': FileArchive,
  '.pdf': FileText
};

/**
 * 获取文件扩展名对应的图标
 */
export function getExtensionIcon(extension: string | null): typeof FileText {
  if (!extension) return FileText;
  return extensionIconMap[extension.toLowerCase()] || FileText;
}
