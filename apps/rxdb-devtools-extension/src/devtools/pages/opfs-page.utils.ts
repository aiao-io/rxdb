import type { OPFSFile } from '../types/devtools.types';

type InteractionTarget = Pick<Event, 'currentTarget' | 'target'>;

/** OPFS 面包屑中的可导航路径片段。 */
export interface PathSegment {
  name: string;
  path: string;
}

/** 判断交互是否直接发生在遮罩本身，而不是其子元素。 */
export function isBackdropInteraction(event: InteractionTarget): boolean {
  return event.currentTarget === event.target;
}

/** 单位档位；索引越界即产出 `undefined` 单位，故下面显式钳位。 */
const FILE_SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const;

/**
 * 人类可读的文件大小。
 *
 * @param bytes - 字节数；`undefined` 表示大小未知
 * @returns 形如 `1.0 GB`；未知返回 `'-'`
 *
 * @remarks
 * P2-16：本函数是**唯一**实现。早先 `storage.page.ts` 另有一份私有拷贝，两者口径不一致
 * （`0` 与 `undefined` 的处理都不同），且那份的 `sizes` 只到 `GB` ——
 * 1TB 时 `Math.floor(log(bytes)/log(1024))` 得 4，`sizes[4]` 是 `undefined`，
 * 界面直接渲染成「1 undefined」。仓库未开 `noUncheckedIndexedAccess`，TS 不会报错。
 *
 * 因此这里把档位补到 PB，并对超出最大档位的输入**钳位**而不是继续索引。
 */
export function formatFileSize(bytes?: number): string {
  if (bytes === undefined) return '-';
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;

  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), FILE_SIZE_UNITS.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  return `${value.toFixed(1)} ${FILE_SIZE_UNITS[exponent]}`;
}

/** 将文件时间戳格式化为中文本地时间，缺失时返回占位符。 */
export function formatFileDate(timestamp?: number): string {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/** 把绝对 OPFS 路径拆为从根目录逐级可导航的面包屑。 */
export function createPathSegments(path: string): PathSegment[] {
  if (path === '/') return [];
  const parts = path.split('/').filter(Boolean);
  return parts.map((name, index) => ({
    name,
    path: `/${parts.slice(0, index + 1).join('/')}`
  }));
}

/** 统计 OPFS 条目中的目录数和文件数。 */
export function summarizeFiles(files: readonly OPFSFile[]): { directories: number; files: number } {
  return files.reduce(
    (summary, file) => ({
      directories: summary.directories + Number(file.type === 'directory'),
      files: summary.files + Number(file.type === 'file')
    }),
    { directories: 0, files: 0 }
  );
}
