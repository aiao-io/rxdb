import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  afterRenderEffect,
  computed,
  inject,
  signal,
  viewChild
} from '@angular/core';

import { ContentActions } from '../../services/content-actions';
import { DesktopAppServices } from '../../services/desktop-app-services';
import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { PopoverService } from '../../services/popover';
import { Toast } from '../../services/toast';
import { WindowManager } from '../../services/window-manager';
import { FocusTrap } from '../../shared/focus-trap';
import { MONS } from '../../shared/format';
import { Icon } from '../../shared/icon';
import { TrafficLights } from '../../shared/traffic-lights';
import { MailComposer } from '../mail/mail-composer';
import { searchCommons } from './commons-search';
import { ImportedPhoto, PhotoLibrary } from './photo-library';
import { PhotoSrc } from './photo-loader';
import { longDate, photoDate, thumbAt, zoomStep } from './photos-data';
import { PhotoAsset } from './photos.entities';

type PhotoGroup = 'Years' | 'Months' | 'Days' | 'All';

/** 废纸篓视图的名字。 */
const RECENTLY_DELETED = 'Recently Deleted';

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
  ['Memories', 'g-star'],
  [RECENTLY_DELETED, 'g-tag']
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
  providers: [ContentActions],
  imports: [FocusTrap, Icon, PhotoSrc, TrafficLights],
  host: { style: 'display: contents', '(keydown)': 'key($event)' },
  templateUrl: './photos.html'
})
export class PhotosApp {
  private readonly win = inject(DesktopWindow);
  private readonly library = inject(DesktopAppServices).get(PhotoLibrary);
  private readonly toast = inject(Toast);
  private readonly popover = inject(PopoverService);
  private readonly wm = inject(WindowManager);
  private readonly mail = inject(MailComposer);
  private readonly injector = inject(Injector);
  private readonly searchField = viewChild.required<ElementRef<HTMLInputElement>>('search');
  private readonly strip = viewChild<ElementRef<HTMLElement>>('strip');
  private destroyed = false;

  protected readonly actions = inject(ContentActions);
  protected readonly libraryViews = LIBRARY_VIEWS;
  protected readonly groups = GROUPS;
  protected readonly skeletons = Array.from({ length: 8 }, (_, n) => n);
  protected readonly loaded = this.library.loaded;
  protected readonly longDate = longDate;
  protected readonly thumbAt = thumbAt;
  protected readonly view = signal('Library');
  protected readonly recentlyDeleted = RECENTLY_DELETED;
  protected readonly group = signal<PhotoGroup>('All');
  /** 正在查看的照片（详情页）。 */
  protected readonly opened = signal<string | null>(null);
  /** 网格里选中的格子；点一下只换选中，不重绘，双击才打开。 */
  protected readonly picked = signal<string | null>(null);
  /** 详情页的缩放档位（1 / 2 / 4）。 */
  protected readonly zoom = signal(1);
  /** 等确认删除的照片。 */
  protected readonly confirmDelete = signal<PhotoAsset | null>(null);
  protected readonly query = signal('');
  protected readonly web = signal<WebState | null>(null);
  protected readonly info = signal(true);
  /** 侧栏相簿；第一次导入时再多出「Imported」。 */
  protected readonly albums = computed(() => this.library.albums().map(album => album.name));

  /** 当前侧栏选择与搜索词对应的照片；废纸篓里的照片只出现在 Recently Deleted。 */
  protected readonly list = computed(() => {
    const view = this.view();
    let photos = this.library.photos();
    if (view === RECENTLY_DELETED) {
      photos = photos.filter(photo => this.library.trash().has(photo.id));
    } else {
      photos = photos.filter(photo => !this.library.trash().has(photo.id));
      if (view === 'Favourites') photos = photos.filter(photo => photo.favourite);
      else if (view === 'Recents') photos = photos.slice(0, 18);
      else if (view === 'Memories') photos = photos.filter(photo => MEMORY_ALBUMS.includes(photo.album));
      else if (view !== 'Library') photos = photos.filter(photo => photo.album === view);
    }
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
            { id: 'y', label: 'Years', run: () => this.setGroup('Years'), checked: this.group() === 'Years' },
            { id: 'm', label: 'Months', run: () => this.setGroup('Months'), checked: this.group() === 'Months' },
            { id: 'd', label: 'Days', run: () => this.setGroup('Days'), checked: this.group() === 'Days' },
            { id: 'a', label: 'All Photos', checked: this.group() === 'All', run: () => this.setGroup('All') },
            '-',
            { id: 'zi', label: 'Zoom In', key: '⌘+', disabled: !this.detail(), run: () => this.zoomIn() },
            { id: 'zo', label: 'Zoom Out', key: '⌘-', disabled: !this.detail(), run: () => this.zoomOut() }
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

  /**
   * 键盘：详情页方向键翻页、Esc 回网格；网格里方向键移动选中（Enter 由格子自己处理为打开）。
   * 搜索框里的按键不落到这里。
   */
  protected key(event: KeyboardEvent): void {
    const target = event.target as Element;
    if (target.closest('input, textarea, [contenteditable="true"]')) return;
    /* 确认弹层开着时，Esc 与 Tab 由弹层自己处理，其余按键不落在照片上。 */
    if (this.confirmDelete()) return;
    if (this.detail()) {
      if (event.key === 'ArrowRight') this.keyStep(event, 1);
      if (event.key === 'ArrowLeft') this.keyStep(event, -1);
      if (event.key === 'Escape') {
        event.preventDefault();
        this.back();
      }
      return;
    }
    const moveBy =
      event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1
      : 0;
    if (!moveBy) return;
    event.preventDefault();
    const photos = this.list();
    if (!photos.length) return;
    const at = photos.findIndex(photo => photo.id === this.picked());
    this.picked.set(photos[(at + moveBy + photos.length) % photos.length].id);
  }

  protected show(view: string): void {
    this.view.set(view);
    this.opened.set(null);
    this.zoom.set(1);
    this.query.set('');
    this.web.set(null);
    this.searchField().nativeElement.value = '';
  }

  protected setGroup(group: PhotoGroup): void {
    this.group.set(group);
    this.opened.set(null);
    this.zoom.set(1);
  }

  protected select(id: string): void {
    this.picked.set(id);
  }

  protected open(id: string): void {
    this.opened.set(id);
    this.picked.set(id);
    this.zoom.set(1);
  }

  protected back(): void {
    this.opened.set(null);
    this.zoom.set(1);
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

  /** 删除入口：先弹确认，确认后软删（废纸篓视图里是永久删除）。 */
  protected remove(): void {
    const photo = this.current();
    if (!photo) {
      this.toast.show('Select a photo first');
      return;
    }
    this.confirmDelete.set(photo);
  }

  protected cancelDelete(): void {
    this.confirmDelete.set(null);
  }

  /** 确认删除：普通视图移进废纸篓，废纸篓视图里永久删除。 */
  protected async deletePhoto(): Promise<void> {
    const photo = this.confirmDelete();
    this.confirmDelete.set(null);
    if (!photo) return;
    if (this.view() === RECENTLY_DELETED) {
      const title = photo.title;
      await this.library.remove(photo);
      this.opened.set(null);
      this.picked.set(null);
      this.toast.show(`Deleted “${title}” permanently`);
    } else {
      await this.library.trashPhoto(photo);
      this.opened.set(null);
      this.picked.set(null);
      this.toast.show(`Moved “${photo.title}” to Recently Deleted`);
    }
  }

  /** 废纸篓里恢复一张照片。 */
  protected async recover(photo: PhotoAsset): Promise<void> {
    await this.library.restorePhoto(photo);
    this.opened.set(null);
    this.picked.set(null);
    this.toast.show(`Recovered “${photo.title}”`);
  }

  /** 网格与详情图的右键菜单：收藏、复制地址与删除。 */
  protected menu(event: MouseEvent, photo: PhotoAsset): void {
    this.picked.set(photo.id);
    this.popover.contextMenu(
      event,
      [
        {
          id: 'f',
          label: photo.favourite ? 'Remove from Favourites' : 'Add to Favourites',
          run: () => void this.toggleFavourite()
        },
        {
          id: 'c',
          label: 'Copy Image Address',
          disabled: this.actions.busy(),
          run: () => this.actions.copy(photo.thumb)
        },
        '-',
        { id: 'd', label: 'Delete', run: () => this.confirmDelete.set(photo) }
      ],
      'photo'
    );
  }

  /** ⌘+ / ⌘- 与工具栏共用：放大一档。 */
  protected zoomIn(): void {
    this.zoom.set(zoomStep(this.zoom(), 1));
  }

  protected zoomOut(): void {
    this.zoom.set(zoomStep(this.zoom(), -1));
  }

  /** 详情页双击：1 与 2 之间来回；点在翻页按钮上不算。 */
  protected toggleZoom(event: MouseEvent): void {
    if ((event.target as Element).closest('button')) return;
    this.zoom.set(this.zoom() > 1 ? 1 : 2);
  }

  /** 滚轮缩放：指针压住的点尽量留在原地。 */
  protected wheelZoom(event: WheelEvent): void {
    if (!this.detail()) return;
    event.preventDefault();
    const next = zoomStep(this.zoom(), event.deltaY < 0 ? 1 : -1);
    if (next === this.zoom()) return;
    const stage = event.currentTarget as HTMLElement;
    const rect = stage.getBoundingClientRect();
    const anchorX = event.clientX - rect.left;
    const anchorY = event.clientY - rect.top;
    const before = { left: stage.scrollLeft, top: stage.scrollTop, width: Math.max(1, stage.scrollWidth) };
    this.zoom.set(next);
    afterNextRender(
      () => {
        const scale = stage.scrollWidth / before.width;
        stage.scrollLeft = (before.left + anchorX) * scale - anchorX;
        stage.scrollTop = (before.top + anchorY) * scale - anchorY;
      },
      { injector: this.injector }
    );
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

  protected share(anchor: Element, event: MouseEvent): void {
    const photo = this.current();
    this.popover.menuUnder(
      anchor,
      [
        {
          id: 'm',
          label: 'Mail Draft',
          icon: 'g-compose',
          disabled: !photo,
          run: () => photo && this.mail.compose(photo.title, '', photo.thumb)
        },
        { id: 'g', label: 'Open Messages', icon: 'g-facetime', run: () => this.wm.open('messages') },
        '-',
        {
          id: 'c',
          label: 'Copy Image Address',
          disabled: !photo || this.actions.busy(),
          run: () => photo && this.actions.copy(photo.thumb)
        },
        {
          id: 'w',
          label: 'Open on Wikimedia Commons',
          run: () => {
            if (photo) this.wm.open('safari', { url: photo.thumb });
            else this.toast.show('Select a photo first');
          }
        }
      ],
      { keyboard: event.detail === 0, label: 'photos sharing' }
    );
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
