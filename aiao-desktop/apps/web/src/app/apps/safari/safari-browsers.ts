import { Service, computed, inject } from '@angular/core';

import { DesktopData } from '../../data/desktop-data';
import { ALL_ROWS, liveQuery } from '../../data/live-query';
import { SystemState } from '../../services/system-state';
import { Toast } from '../../services/toast';
import { SafariBookmark, SafariHistoryEntry, SafariReadingItem } from './safari.entities';

/** 一个 Safari 窗口对外暴露的导航入口。 */
export interface SafariNavigator {
  go(url: string): void;
}

/** 浏览历史最多留多少个地址。 */
const HISTORY_LIMIT = 24;

const urlIs = (url: string) => ({
  combinator: 'and' as const,
  rules: [{ field: 'url' as const, operator: '=' as const, value: url }]
});

/**
 * 所有 Safari 窗口共享的状态：收藏夹、阅读列表与浏览历史（都在本地库里，刷新后还在），
 * 收藏栏开关，以及「最近打开的窗口」。
 */
@Service({ autoProvided: false })
export class SafariBrowsers {
  private readonly system = inject(SystemState);
  private readonly toast = inject(Toast);
  private readonly data = inject(DesktopData);
  private readonly navigators: SafariNavigator[] = [];
  private readonly visits = liveQuery(
    () => SafariHistoryEntry.findAll({ where: ALL_ROWS, orderBy: [{ field: 'visitedAt', sort: 'desc' }] }),
    [],
    SafariHistoryEntry
  );

  /** 收藏夹：起始页、收藏栏、侧栏与「书签」菜单共用。 */
  readonly favourites = liveQuery(
    () => SafariBookmark.findAll({ where: ALL_ROWS, orderBy: [{ field: 'position', sort: 'asc' }] }),
    [],
    SafariBookmark
  );
  /** 阅读列表。 */
  readonly readingList = liveQuery(
    () => SafariReadingItem.findAll({ where: ALL_ROWS, orderBy: [{ field: 'position', sort: 'asc' }] }),
    [],
    SafariReadingItem
  );
  /** 最近访问在前、去重，最多 24 条；喂给「历史记录」菜单和起始页。 */
  readonly history = computed(() => this.visits().map(visit => visit.url));

  /** 登记一个窗口，返回注销函数。 */
  register(navigator: SafariNavigator): () => void {
    this.navigators.push(navigator);
    return () => this.navigators.splice(this.navigators.indexOf(navigator), 1);
  }

  /** 聚焦搜索的「在网上搜索」交给最近打开的 Safari 窗口。 */
  goLatest(url: string): void {
    this.navigators.at(-1)?.go(url);
  }

  /** 记一次访问：地址已在历史里就只刷新访问时刻，超出上限的最旧地址被淘汰。 */
  record(url: string): void {
    if (!url.trim()) return;
    void this.remember(url);
  }

  toggleFavouritesBar(): void {
    this.system.safariFavs.update(on => !on);
    this.toast.show(this.system.safariFavs() ? 'Favourites bar shown' : 'Favourites bar hidden');
  }

  private async remember(url: string): Promise<void> {
    await this.data.transaction(async executor => {
      const history = executor.getRepository(SafariHistoryEntry);
      const [seen] = await history.find({ where: urlIs(url), limit: 1 });
      const visitedAt = new Date();
      if (seen) await history.update(seen, { visitedAt });
      else await history.create(this.data.instantiate(SafariHistoryEntry, { url, visitedAt }));
      const stale = await history.find({
        where: ALL_ROWS,
        orderBy: [{ field: 'visitedAt', sort: 'desc' }],
        offset: HISTORY_LIMIT
      });
      for (const entry of stale) await history.remove(entry);
    });
  }
}
