import type { LocalImageInfo, LocalMediaStore, LocalWorkSummary } from './browser-media';

interface SelectionItem {
  readonly work: Readonly<LocalWorkSummary>;
  readonly state: 'eligible' | 'unreadable' | 'oversized';
  readonly info: Readonly<LocalImageInfo> | null;
}
type SelectionStore = Pick<LocalMediaStore, 'list' | 'imageInfo'>;
const pageSize = 24;
const maxBytes = 16 * 1024 * 1024;

/** 确认前只读取本机，保存有限元数据与原图身份；原始字节不留在清单中。 */
export class ImageSyncSelection {
  readonly count: number;
  readonly bytes: number;
  readonly eligibleCount: number;
  readonly eligibleBytes: number;
  readonly unreadableCount: number;
  readonly oversizedCount: number;
  readonly pageCount: number;
  constructor(readonly items: readonly SelectionItem[]) {
    this.count = items.length;
    this.bytes = items.reduce((total, item) => total + item.work.bytes, 0);
    this.eligibleCount = items.filter(item => item.state === 'eligible').length;
    this.eligibleBytes = items.reduce((total, item) => total + (item.info?.bytes ?? 0), 0);
    this.unreadableCount = items.filter(item => item.state === 'unreadable').length;
    this.oversizedCount = items.filter(item => item.state === 'oversized').length;
    this.pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  }
  page(index: number): readonly SelectionItem[] {
    if (!Number.isSafeInteger(index) || index < 0 || index >= this.pageCount) throw new Error('图片范围分页无效。');
    return this.items.slice(index * pageSize, (index + 1) * pageSize);
  }
}
async function inspectImage(
  store: SelectionStore,
  work: LocalWorkSummary,
  signal: AbortSignal
): Promise<SelectionItem> {
  if (work.bytes > maxBytes) return { work, state: 'oversized', info: null };
  if (work.status === 'broken') return { work, state: 'unreadable', info: null };
  try {
    const info = await store.imageInfo(work.jobId);
    signal.throwIfAborted();
    const checked = Object.freeze({ ...work, bytes: info.bytes });
    if (info.bytes > maxBytes) return { work: checked, state: 'oversized', info: null };
    return { work: checked, state: 'eligible', info: Object.freeze({ ...info }) };
  } catch (error) {
    signal.throwIfAborted();
    if (
      !error ||
      typeof error !== 'object' ||
      !('code' in error) ||
      !['corrupt', 'unavailable'].includes(String(error.code))
    )
      throw error;
    return { work, state: 'unreadable', info: null };
  }
}
/** 冻结一次本机作品名单后串行核对，后续新增文件不会混入本次历史授权。 */
export async function scanImageSyncSelection(
  store: SelectionStore,
  signal: AbortSignal,
  progress: (value: { checked: number; total: number }) => void = () => undefined
): Promise<ImageSyncSelection> {
  signal.throwIfAborted();
  const works = (await store.list()).map(work => Object.freeze({ ...work }));
  signal.throwIfAborted();
  const items: SelectionItem[] = [];
  progress({ checked: 0, total: works.length });
  for (const work of works) {
    signal.throwIfAborted();
    items.push(Object.freeze(await inspectImage(store, work, signal)));
    progress({ checked: items.length, total: works.length });
  }
  signal.throwIfAborted();
  return new ImageSyncSelection(Object.freeze(items));
}
