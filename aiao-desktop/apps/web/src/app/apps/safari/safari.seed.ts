import type { RxDB, TransactionExecutor } from '@aiao/rxdb';

import type { DataSeed } from '../../data/seeds';
import { SafariBookmark, SafariReadingItem } from './safari.entities';

/** 收藏夹的初始内容：名称、色块和地址。 */
const BOOKMARK_SEEDS = [
  { name: 'Apple', color: '#1d1d1f', url: 'apple.com' },
  { name: 'Wikipedia', color: '#636466', url: 'en.wikipedia.org/wiki/MacOS' },
  { name: 'YouTube', color: '#ff0033', url: 'youtube.com' },
  { name: 'Hacker News', color: '#ff6600', url: 'news.ycombinator.com' },
  { name: 'MDN', color: '#000', url: 'developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter' },
  { name: 'Can I use', color: '#1d78c1', url: 'caniuse.com' },
  { name: 'Internet Archive', color: '#000', url: 'archive.org' },
  { name: 'JSFiddle', color: '#0084ff', url: 'jsfiddle.net' }
] as const;

/** 阅读列表的初始内容：地址与显示名。 */
const READING_SEEDS = [
  { url: 'en.wikipedia.org/wiki/Bézier_curve', title: 'Bézier curve' },
  { url: 'en.wikipedia.org/wiki/Subpixel_rendering', title: 'Subpixel rendering' }
] as const;

/** Safari 的初始数据：收藏夹与阅读列表；浏览历史从空开始，随用户访问累积。 */
export const SAFARI_SEED: DataSeed = {
  domain: 'safari',
  version: 1,
  async run(executor: TransactionExecutor, rxdb: RxDB): Promise<void> {
    const bookmarks = executor.getRepository(SafariBookmark);
    for (const [position, bookmark] of BOOKMARK_SEEDS.entries()) {
      await bookmarks.create(rxdb.entityManager.instantiate(SafariBookmark, { ...bookmark, position }));
    }
    const reading = executor.getRepository(SafariReadingItem);
    for (const [position, item] of READING_SEEDS.entries()) {
      await reading.create(rxdb.entityManager.instantiate(SafariReadingItem, { ...item, position }));
    }
  }
};
