import { SafeHtml, SafeResourceUrl } from '@angular/platform-browser';

/** 起始页上的一块图标：有色块用色块，没有就取站点图标，取不到再退回首字母。 */
export interface SafariTile {
  readonly url: string;
  readonly label: string;
  readonly dot: string | null;
}

/** 搜索结果的一条；`html` 是接口给的片段，离线结果只有纯文本。 */
export interface SafariHit {
  readonly goto: string;
  readonly url: string;
  readonly title: string;
  readonly text: string;
  readonly html: string | null;
}

/** 页面区当前显示的内容，每次导航产生一个新对象，模板据此整块重建。 */
export type SafariPage =
  | { readonly type: 'blank' }
  | { readonly type: 'start'; readonly recent: readonly SafariTile[]; readonly trackers: number }
  | { readonly type: 'local'; readonly site: string }
  | { readonly type: 'frame'; readonly src: SafeResourceUrl }
  | { readonly type: 'player'; readonly src: SafeResourceUrl }
  | { readonly type: 'embed-blocked'; readonly id: string }
  | { readonly type: 'loading' }
  | {
      readonly type: 'reader';
      readonly url: string;
      readonly host: string;
      readonly title: string;
      readonly html: SafeHtml;
    }
  | { readonly type: 'blocked'; readonly url: string; readonly host: string }
  | { readonly type: 'search'; readonly query: string; readonly note: string; readonly hits: readonly SafariHit[] }
  | {
      readonly type: 'wiki';
      readonly title: string;
      readonly description: string;
      readonly extract: string;
      readonly thumbnail: string;
      readonly lead: SafeHtml | null;
    }
  | { readonly type: 'wiki-error' };

/** 顶部细进度条：每个阶段换一个新对象，模板按 `id` 重建元素，宽度才不会从上一阶段倒着动。 */
export interface SafariProgress {
  readonly id: number;
  readonly on: boolean;
  readonly width: string;
}
