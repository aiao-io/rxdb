/** 预览地址的来源：列出缓存文件、按 id 分配与回收 object URL（对应 `rxdb.storage` 的同名方法）。 */
export interface ObjectUrlSource<M extends { id: string }> {
  list(): Promise<M[]>;
  createObjectUrl(id: string): Promise<string>;
  revokeObjectUrl(url: string): void;
}

/** 一条缓存文件与它的预览地址。 */
export interface CachedPreview<M> {
  meta: M;
  objectUrl: string;
}

/** 页面持有的预览地址：按文件 id 复用，页面离开后全部回收（三端同名移植）。 */
export interface ObjectUrlCache<M> {
  /** 重新列出缓存文件并补齐预览地址；被更新的一次刷新取代、或页面已离开时返回 `null`。 */
  load(): Promise<CachedPreview<M>[] | null>;
  /** 页面离开：回收全部地址；之后迟到的分配当场回收，不再登记。 */
  dispose(): void;
}

/**
 * 创建页面的预览地址缓存。
 *
 * @remarks
 * 每次 `load()` 记一个纪元，只有最新一次、且页面还在时才登记新地址并交回列表：
 * 页面离开后才返回的分配、被新一次刷新取代的分配都当场回收，同一文件不会登记两个地址。
 */
export function createObjectUrlCache<M extends { id: string }>(source: ObjectUrlSource<M>): ObjectUrlCache<M> {
  const urls = new Map<string, string>();
  let epoch = 0;
  let disposed = false;
  const isCurrent = (run: number): boolean => !disposed && run === epoch;

  const revokeMissing = (metas: readonly M[]): void => {
    const live = new Set(metas.map(meta => meta.id));
    for (const [id, url] of urls) {
      if (live.has(id)) continue;
      source.revokeObjectUrl(url);
      urls.delete(id);
    }
  };

  const urlFor = async (id: string, run: number): Promise<string | null> => {
    const existing = urls.get(id);
    if (existing !== undefined) return existing;
    const url = await source.createObjectUrl(id);
    if (!isCurrent(run)) {
      source.revokeObjectUrl(url);
      return null;
    }
    urls.set(id, url);
    return url;
  };

  return {
    async load() {
      const run = ++epoch;
      const metas = await source.list();
      if (!isCurrent(run)) return null;
      revokeMissing(metas);
      const items: CachedPreview<M>[] = [];
      for (const meta of metas) {
        const objectUrl = await urlFor(meta.id, run);
        if (objectUrl === null) return null;
        items.push({ meta, objectUrl });
      }
      return items;
    },
    dispose() {
      disposed = true;
      for (const url of urls.values()) source.revokeObjectUrl(url);
      urls.clear();
    }
  };
}
