import { Service, inject, signal } from '@angular/core';

import { SystemState } from '../../services/system-state';
import { Toast } from '../../services/toast';

/** 一个 Safari 窗口对外暴露的导航入口。 */
export interface SafariNavigator {
  go(url: string): void;
}

/** 所有 Safari 窗口共享的状态：浏览历史、收藏栏开关，以及「最近打开的窗口」。 */
@Service({ autoProvided: false })
export class SafariBrowsers {
  private readonly system = inject(SystemState);
  private readonly toast = inject(Toast);
  private readonly navigators: SafariNavigator[] = [];

  /** 最近访问在前、去重，最多 24 条；喂给「历史记录」菜单和起始页。 */
  readonly history = signal<readonly string[]>([]);

  /** 登记一个窗口，返回注销函数。 */
  register(navigator: SafariNavigator): () => void {
    this.navigators.push(navigator);
    return () => this.navigators.splice(this.navigators.indexOf(navigator), 1);
  }

  /** 聚焦搜索的「在网上搜索」交给最近打开的 Safari 窗口。 */
  goLatest(url: string): void {
    this.navigators.at(-1)?.go(url);
  }

  record(url: string): void {
    if (!url.trim()) return;
    this.history.update(list => [url, ...list.filter(item => item !== url)].slice(0, 24));
  }

  toggleFavouritesBar(): void {
    this.system.safariFavs.update(on => !on);
    this.toast.show(this.system.safariFavs() ? 'Favourites bar shown' : 'Favourites bar hidden');
  }
}
