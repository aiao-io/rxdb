import {
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  signal,
  viewChild
} from '@angular/core';

import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { PopoverService } from '../../services/popover';
import { Toast } from '../../services/toast';
import { WindowManager } from '../../services/window-manager';
import { MONS } from '../../shared/format';
import { Icon } from '../../shared/icon';
import { TrafficLights } from '../../shared/traffic-lights';
import { MailComposer } from '../mail/mail-composer';
import { searchCommons } from './commons-search';
import { ImportedPhoto, PhotoLibrary } from './photo-library';
import { PhotoSrc } from './photo-loader';
import { longDate, photoDate, thumbAt } from './photos-data';
import { PhotoAsset } from './photos.entities';

type PhotoGroup = 'Years' | 'Months' | 'Days' | 'All';

/** 网上搜图的状态：搜索中、出错或有结果。 */
interface WebState {
  readonly q: string;
  readonly loading?: boolean;
  readonly items: readonly ImportedPhoto[];
  readonly error?: string;
}

/** 一段分组：标题、地点小字和这一段的照片。 */
interface Bucket {
  readonly key: string;
  readonly head: string;
  readonly sub: string;
  readonly items: readonly PhotoAsset[];
}

const LIBRARY_VIEWS = [
  ['Library', 'g-gallery'],
  ['Recents', 'g-clock-a'],
  ['Favourites', 'g-star'],
  ['Memories', 'g-star']
] as const;

const GROUPS = [
  { name: 'Years', width: 38 },
  { name: 'Months', width: 44 },
  { name: 'Days', width: 36 },
  { name: 'All', width: 32 }
] as const;

/** 「回忆」只挑这几个相簿。 */
const MEMORY_ALBUMS = ['Skies', 'Travel', 'Coast'];

const COLUMNS: Readonly<Record<PhotoGroup, string>> = {
  Years: 'repeat(auto-fill,minmax(340px,1fr))',
  Months: 'repeat(auto-fill,minmax(240px,1fr))',
  Days: 'repeat(auto-fill,minmax(190px,1fr))',
  All: 'repeat(auto-fill,minmax(126px,1fr))'
};

const groupKey = (photo: PhotoAsset, group: PhotoGroup): string => {
  if (group === 'Years') return photo.date.slice(0, 4);
  return group === 'Months' ? photo.date.slice(0, 7) : photo.date;
};

const headingOf = (key: string, date: string, group: PhotoGroup): string => {
  if (group === 'Years') return key;
  const day = photoDate(date);
  return group === 'Months' ? `${MONS[day.getMonth()]} ${day.getFullYear()}` : longDate(date);
};

/** 照片按分组归段；「照片」App 给每段配上其中出现的地点，这里也一样。 */
const bucketOf = (key: string, items: readonly PhotoAsset[], group: PhotoGroup): Bucket => {
  const places = [...new Set(items.map(photo => photo.place).filter(Boolean))];
  const more = places.length > 3 ? ` & ${places.length - 3} more` : '';
  return { key, head: headingOf(key, items[0].date, group), sub: places.slice(0, 3).join(' · ') + more, items };
};

/** 照片：图库、相簿、按年月日分组、详情查看、收藏、删除，以及从维基共享资源搜图导入；图库与相簿存在本地库里。 */
@Component({
  selector: 'app-photos',
  imports: [Icon, PhotoSrc, TrafficLights],
  host: { style: 'display: contents', '(keydown)': 'key($event)' },
  templateUrl: './photos.html'
})
export class PhotosApp {
  private readonly win = inject(DesktopWindow);
  private readonly library = inject(PhotoLibrary);
  private readonly toast = inject(Toast);
  private readonly popover = inject(PopoverService);
  private readonly wm = inject(WindowManager);
  private readonly mail = inject(MailComposer);
  private readonly searchField = viewChild.required<ElementRef<HTMLInputElement>>('search');
  private readonly strip = viewChild<ElementRef<HTMLElement>>('strip');
  private destroyed = false;

  protected readonly libraryViews = LIBRARY_VIEWS;
  protected readonly groups = GROUPS;
  protected readonly skeletons = Array.from({ length: 8 }, (_, n) => n);
  protected readonly loaded = this.library.loaded;
  protected readonly longDate = longDate;
  protected readonly thumbAt = thumbAt;
  protected readonly view = signal('Library');
  protected readonly group = signal<PhotoGroup>('All');
  /** 正在查看的照片（详情页）。 */
  protected readonly opened = signal<string | null>(null);
  /** 网格里选中的格子；点一下只换选中，不重绘，双击才打开。 */
  protected readonly picked = signal<string | null>(null);
  protected readonly query = signal('');
  protected readonly web = signal<WebState | null>(null);
  protected readonly info = signal(true);
  /** 侧栏相簿；第一次导入时再多出「Imported」。 */
  protected readonly albums = computed(() => this.library.albums().map(album => album.name));

  /** 当前侧栏选择与搜索词对应的照片。 */
  protected readonly list = computed(() => {
    const view = this.view();
    let photos = this.library.photos();
    if (view === 'Favourites') photos = photos.filter(photo => photo.favourite);
    else if (view === 'Recents') photos = photos.slice(0, 18);
    else if (view === 'Memories') photos = photos.filter(photo => MEMORY_ALBUMS.includes(photo.album));
    else if (view !== 'Library') photos = photos.filter(photo => photo.album === view);
    const query = this.query().toLowerCase();
    if (!query) return photos;
    return photos.filter(photo =>
      [photo.title, photo.place, photo.album, photo.credit, photo.date].join(' ').toLowerCase().includes(query)
    );
  });
  protected readonly detail = computed(() => this.opened() !== null);
  protected readonly big = computed(() => this.group() !== 'All');
  protected readonly columns = computed(() => COLUMNS[this.group()]);
  protected readonly selected = computed(() => this.library.photos().find(photo => photo.id === this.opened()));
  protected readonly current = computed(() => {
    const id = this.opened() ?? this.picked();
    return this.library.photos().find(photo => photo.id === id);
  });
  protected readonly position = computed(() => this.list().findIndex(photo => photo.id === this.opened()) + 1);
  protected readonly buckets = computed<readonly Bucket[]>(() => {
    const list = this.list();
    const group = this.group();
    if (group === 'All') return [{ key: '', head: '', sub: '', items: list }];
    const buckets = new Map<string, PhotoAsset[]>();
    for (const photo of list) {
      const key = groupKey(photo, group);
      const bucket = buckets.get(key);
      if (bucket) bucket.push(photo);
      else buckets.set(key, [photo]);
    }
    return [...buckets].map(([key, items]) => bucketOf(key, items, group));
  });
  protected readonly title = computed(() => {
    const photo = this.current();
    if (this.detail()) return photo ? photo.title : this.view();
    return this.query() ? `Search: ${this.query()}` : this.view();
  });
  protected readonly status = computed(() => {
    const photo = this.current();
    if (this.detail() && photo)
      return [photo.place || photo.album, photo.date, photo.credit].filter(Boolean).join(' · ');
    const count = this.list().length;
    const favourites = this.library.photos().filter(item => item.favourite).length;
    const web = this.web();
    const found = web ? `${web.items.length} from Wikimedia Commons` : '';
    const tail = this.query() ? found : `${favourites} Favourite${favourites === 1 ? '' : 's'}`;
    return [`${count} ${count === 1 ? 'Photo' : 'Photos'}`, tail].filter(Boolean).join(' · ');
  });
  protected readonly webHeading = computed(() => {
    const web = this.web();
    if (!web) return '';
    if (web.loading) return `Searching “${web.q}”…`;
    if (web.error) return web.error;
    return web.items.length ? `${web.items.length} results · click to add` : `Nothing found for “${web.q}”`;
  });

  constructor() {
    const menus = inject(DesktopMenus);
    this.win.setMenus(
      computed(() =>
        menus.standard('photos', {
          View: [
            { id: 'y', label: 'Years', run: () => this.setGroup('Years') },
            { id: 'm', label: 'Months', run: () => this.setGroup('Months') },
            { id: 'd', label: 'Days', run: () => this.setGroup('Days') },
            { id: 'a', label: 'All Photos', checked: true, run: () => this.setGroup('All') }
          ]
        })
      )
    );
    inject(DestroyRef).onDestroy(() => (this.destroyed = true));

    /* 打开的照片在底部胶片条里居中。 */
    afterRenderEffect(() => {
      this.opened();
      const box = this.strip()?.nativeElement;
      const on = box?.querySelector<HTMLElement>('.on');
      if (box && on) box.scrollLeft = on.offsetLeft - box.clientWidth / 2 + on.offsetWidth / 2;
    });
  }

  /** 方向键翻页、Esc 回网格：详情页打开时才响应。 */
  protected key(event: KeyboardEvent): void {
    if (!this.detail()) return;
    if (event.key === 'ArrowRight') this.keyStep(event, 1);
    if (event.key === 'ArrowLeft') this.keyStep(event, -1);
    if (event.key === 'Escape') {
      event.preventDefault();
      this.back();
    }
  }

  protected show(view: string): void {
    this.view.set(view);
    this.opened.set(null);
    this.query.set('');
    this.web.set(null);
    this.searchField().nativeElement.value = '';
  }

  protected setGroup(group: PhotoGroup): void {
    this.group.set(group);
    this.opened.set(null);
  }

  protected select(id: string): void {
    this.picked.set(id);
  }

  protected open(id: string): void {
    this.opened.set(id);
    this.picked.set(id);
  }

  protected back(): void {
    this.opened.set(null);
  }

  protected step(delta: number): void {
    const list = this.list();
    const at = list.findIndex(photo => photo.id === this.opened());
    if (at < 0) return;
    this.open(list[(at + delta + list.length) % list.length].id);
  }

  protected async toggleFavourite(): Promise<void> {
    const photo = this.current();
    if (!photo) {
      this.toast.show('Select a photo first');
      return;
    }
    const favourite = await this.library.toggleFavourite(photo);
    this.toast.show(favourite ? 'Added to Favourites' : 'Removed from Favourites');
  }

  protected async remove(): Promise<void> {
    const photo = this.current();
    if (!photo) {
      this.toast.show('Select a photo first');
      return;
    }
    /* 仓储约定删除后实体的字段会被清空，提示里要用的标题先取出来。 */
    const title = photo.title;
    await this.library.remove(photo);
    this.opened.set(null);
    this.picked.set(null);
    this.toast.show(`Deleted “${title}”`);
  }

  protected toggleInfo(): void {
    this.info.update(on => !on);
  }

  protected find(text: string): void {
    this.query.set(text.trim());
    this.opened.set(null);
    this.web.set(null);
  }

  /** 回车直接去网上找，就像照片 App 在图库没有结果时转向在线结果。 */
  protected searchWeb(): void {
    const query = this.query();
    if (query) void this.search(query);
  }

  /** 导入一张网上的照片：加进图库，侧栏第一次会多出「Imported」。 */
  protected async add(index: number): Promise<void> {
    const item = this.web()?.items[index];
    if (!item) return;
    const photo = await this.library.add(item);
    this.picked.set(photo.id);
    this.toast.show(`Added “${photo.title}” to your library`);
  }

  protected share(anchor: Element): void {
    const photo = this.current();
    this.popover.menuUnder(anchor, [
      { id: 'm', label: 'Mail', icon: 'g-compose', run: () => this.mail.compose(photo ? photo.title : 'Photos') },
      { id: 'g', label: 'Messages', icon: 'g-facetime', run: () => this.wm.open('messages') },
      '-',
      {
        id: 'c',
        label: 'Copy Photo',
        run: () => this.toast.show(photo ? `Copied “${photo.title}”` : 'Select a photo first')
      },
      {
        id: 'w',
        label: 'Open on Wikimedia Commons',
        run: () => {
          if (photo) this.wm.open('safari', { url: photo.thumb });
          else this.toast.show('Select a photo first');
        }
      }
    ]);
  }

  private keyStep(event: KeyboardEvent, delta: number): void {
    event.preventDefault();
    this.step(delta);
  }

  /** 在共享资源上搜图；较慢的旧搜索不能盖掉较新的那次。 */
  private async search(query: string): Promise<void> {
    this.web.set({ q: query, loading: true, items: [] });
    let result: WebState;
    try {
      result = { q: query, items: await searchCommons(query) };
    } catch {
      result = { q: query, items: [], error: navigator.onLine ? 'Commons did not answer' : 'You are offline' };
    }
    if (this.destroyed || this.web()?.q !== query) return;
    this.web.set(result);
  }
}
