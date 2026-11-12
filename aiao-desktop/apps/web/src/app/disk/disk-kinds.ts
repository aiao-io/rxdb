/** Finder 的「种类」一栏与图标。 */
export interface KindInfo {
  readonly kind: string;
  readonly icon: string;
}

export const FOLDER_KIND: KindInfo = { kind: 'Folder', icon: 'f-folder' };
const DOCUMENT_KIND: KindInfo = { kind: 'Document', icon: 'f-txt' };

const code = (kind: string): KindInfo => ({ kind, icon: 'f-code' });

const BY_EXTENSION: Readonly<Record<string, KindInfo>> = {
  app: { kind: 'Application', icon: 'f-app' },
  css: code('CSS style sheet'),
  csv: { kind: 'CSV document', icon: 'f-txt' },
  dmg: { kind: 'Disk image', icon: 'f-app' },
  heic: { kind: 'HEIC image', icon: 'f-img' },
  html: code('HTML document'),
  jpeg: { kind: 'JPEG image', icon: 'f-img' },
  jpg: { kind: 'JPEG image', icon: 'f-img' },
  js: code('JavaScript'),
  json: code('JSON'),
  key: { kind: 'Keynote', icon: 'f-app' },
  md: { kind: 'Markdown', icon: 'f-txt' },
  mov: { kind: 'QuickTime movie', icon: 'f-movie' },
  mp3: { kind: 'MP3 audio', icon: 'f-music' },
  mp4: { kind: 'MPEG-4 movie', icon: 'f-movie' },
  numbers: { kind: 'Numbers', icon: 'f-app' },
  pdf: { kind: 'PDF document', icon: 'f-pdf' },
  plist: code('Property List'),
  png: { kind: 'PNG image', icon: 'f-img' },
  py: code('Python source'),
  sh: code('Shell script'),
  swift: code('Swift source'),
  ts: code('TypeScript'),
  ttf: code('TrueType font'),
  txt: { kind: 'Plain text', icon: 'f-txt' },
  wav: { kind: 'WAV audio', icon: 'f-music' },
  xip: { kind: 'Archive', icon: 'f-zip' },
  xml: code('XML document'),
  yaml: code('YAML'),
  yml: code('YAML'),
  zip: { kind: 'ZIP archive', icon: 'f-zip' }
};

/** 纯文本类扩展名；没有扩展名的文件也当作文本，和 TextEdit 的默认关联一致。 */
const TEXT_EXTENSIONS = new Set([
  '',
  'css',
  'csv',
  'html',
  'js',
  'json',
  'log',
  'md',
  'plist',
  'py',
  'sh',
  'swift',
  'ts',
  'txt',
  'xml',
  'yaml',
  'yml'
]);

/** 小写扩展名；开头的点表示隐藏文件，不算扩展名。 */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export const fileKind = (name: string): KindInfo => BY_EXTENSION[extensionOf(name)] ?? DOCUMENT_KIND;

/** `.app` 目录在 Finder 里是一个程序包：按文件显示，双击启动应用。 */
export const isPackageName = (name: string): boolean => extensionOf(name) === 'app';

export const isTextName = (name: string): boolean => TEXT_EXTENSIONS.has(extensionOf(name));

const MIME_TYPES: Readonly<Record<string, string>> = {
  '': 'text/plain',
  css: 'text/css',
  csv: 'text/csv',
  dmg: 'application/x-apple-diskimage',
  heic: 'image/heic',
  html: 'text/html',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  js: 'text/javascript',
  json: 'application/json',
  key: 'application/zip',
  md: 'text/markdown',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  numbers: 'application/zip',
  pdf: 'application/pdf',
  plist: 'application/x-plist',
  png: 'image/png',
  py: 'text/x-python',
  sh: 'text/x-shellscript',
  swift: 'text/x-swift',
  ts: 'text/typescript',
  ttf: 'font/ttf',
  txt: 'text/plain',
  wav: 'audio/wav',
  xip: 'application/x-xar',
  xml: 'application/xml',
  yaml: 'application/yaml',
  yml: 'application/yaml',
  zip: 'application/zip'
};

/** 写进 storage 插件的 MIME；认不出的扩展名按二进制处理。 */
export const mimeTypeOf = (name: string): string => MIME_TYPES[extensionOf(name)] ?? 'application/octet-stream';

const trimmed = (value: number, digits: number): string => String(Number(value.toFixed(digits)));

/** Finder 的大小写法：十进制单位，KB 取整、MB 一位小数、GB 两位小数。 */
export function formatSize(bytes: number): string {
  if (bytes === 0) return 'Zero bytes';
  if (bytes === 1) return '1 byte';
  if (bytes < 1_000) return `${bytes} bytes`;
  if (bytes < 999_500) return `${Math.round(bytes / 1_000)} KB`;
  if (bytes < 999_950_000) return `${trimmed(bytes / 1_000_000, 1)} MB`;
  return `${trimmed(bytes / 1_000_000_000, 2)} GB`;
}
