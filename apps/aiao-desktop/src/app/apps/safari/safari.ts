import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  Renderer2,
  afterNextRender,
  afterRenderEffect,
  computed,
  inject,
  signal,
  viewChild
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { MenuEntry, MenuSection } from '../../services/menu';
import { PopoverService } from '../../services/popover';
import { SystemState } from '../../services/system-state';
import { Toast } from '../../services/toast';
import { WindowManager } from '../../services/window-manager';
import { clamp } from '../../shared/format';
import { Icon } from '../../shared/icon';
import { TrafficLights } from '../../shared/traffic-lights';
import { SafariBrowsers } from './safari-browsers';
import { WikiHit, fetchReader, fetchWikiArticle, fetchWikiSearch } from './safari-network';
import { SafariOverview } from './safari-overview';
import { SafariHit, SafariPage, SafariProgress, SafariTile } from './safari-page';
import {
  FAVOURITES,
  LOCAL_SITES,
  READING_LIST,
  externalUrl,
  favColor,
  faviconOf,
  framable,
  hostOf,
  kindOf,
  localKey,
  resolveUrl,
  titleFor,
  videoId,
  wikiTitle
} from './safari-url';

/** 一个标签：当前地址加自己的前进后退栈。 */
interface SafariTab {
  readonly url: string;
  readonly history: readonly string[];
  readonly index: number;
  /** null 表示按站点默认：能内嵌的用 iframe，其余用阅读器。 */
  readonly reader: boolean | null;
}

/** 每个标签一个新对象：模板按对象身份区分标签，共用同一个对象会撞键。 */
const blankTab = (): SafariTab => ({ url: '', history: [''], index: 0, reader: null });

/** 页面区的一次内容；`id` 每次递增，模板据此整块重建（iframe 重新加载）。 */
interface SafariView {
  readonly id: number;
  readonly page: SafariPage;
}

const MENU_ORDER = ['File', 'Edit', 'View', 'History', 'Bookmarks', 'Window', 'Help'];

/** 起始页的收藏夹格子；只有内置站点用色块，其余取站点图标。 */
const FAVOURITE_TILES: readonly SafariTile[] = FAVOURITES.map(fav => ({
  url: fav.url,
  label: fav.name,
  dot: LOCAL_SITES.has(fav.url) ? fav.color : null
}));

/** 搜索接口连不上时本地兜底的几条结果。 */
const OFFLINE_HITS: readonly SafariHit[] = [
  {
    url: 'en.wikipedia.org/wiki/MacOS',
    title: 'macOS — Wikipedia',
    text: 'A Unix operating system developed and marketed by Apple since 2001.'
  },
  {
    url: 'caniuse.com',
    title: 'Can I use — Support tables for HTML5, CSS3, etc',
    text: 'Browser support tables for modern web technologies.'
  },
  {
    url: 'developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter',
    title: 'backdrop-filter — CSS | MDN',
    text: 'Applies graphical effects such as blur to the area behind an element.'
  },
  {
    url: 'example.com',
    title: 'Example Domain',
    text: 'This domain is for use in illustrative examples in documents.'
  }
].map(hit => ({ ...hit, goto: hit.url, html: null }));

/** Safari：多标签、前进后退、阅读器、侧栏、收藏栏，内容按地址在本地页、iframe、阅读器与维基之间切换。 */
@Component({
  selector: 'app-safari',
  imports: [Icon, NgTemplateOutlet, TrafficLights],
  host: { style: 'display: contents' },
  templateUrl: './safari.html'
})
export class SafariApp {
  private readonly win = inject(DesktopWindow);
  private readonly wm = inject(WindowManager);
  private readonly toast = inject(Toast);
  private readonly popover = inject(PopoverService);
  private readonly menus = inject(DesktopMenus);
  private readonly browsers = inject(SafariBrowsers);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly renderer = inject(Renderer2);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly urlField = viewChild.required<ElementRef<HTMLInputElement>>('urlField');
  private readonly pageBox = viewChild.required<ElementRef<HTMLElement>>('pageBox');
  /** 每次重绘加一，让地址栏文字回到当前标签的地址。 */
  private readonly revision = signal(0);
  private readonly bar = signal<SafariProgress>({ id: 0, on: false, width: '' });
  private readonly view = signal<SafariView>({ id: 0, page: { type: 'blank' } });
  /** 每次导航发一个号；慢请求回来时号已过期，就不能盖掉更新的页面。 */
  private navigation = 0;
  private barSeq = 0;
  private viewSeq = 0;
  private closed = false;

  protected readonly system = inject(SystemState);
  protected readonly favourites = FAVOURITES;
  protected readonly favouriteTiles = FAVOURITE_TILES;
  protected readonly reading = READING_LIST;
  protected readonly titleFor = titleFor;
  protected readonly favColor = favColor;
  protected readonly faviconOf = faviconOf;
  protected readonly hostOf = hostOf;
  protected readonly resolveUrl = resolveUrl;
  protected readonly externalUrl = externalUrl;

  protected readonly tabs = signal<readonly SafariTab[]>([blankTab()]);
  protected readonly current = signal(0);
  protected readonly sidebar = signal(false);
  /** 起始页图标加载失败的地址，改画首字母；缩略图失败则整块撤掉。 */
  protected readonly failed = signal<ReadonlySet<string>>(new Set());

  protected readonly tab = computed(() => this.tabs()[this.current()]);
  protected readonly kind = computed(() => kindOf(this.tab().url));
  protected readonly address = computed(() => (this.kind() === 'start' ? '' : this.tab().url));
  protected readonly urlIcon = computed(() => (['start', 'search'].includes(this.kind()) ? 'g-search' : 'g-lock'));
  protected readonly readerOn = computed(() => {
    const tab = this.tab();
    return this.kind() === 'web' && (tab.reader === true || (tab.reader === null && !framable(tab.url)));
  });
  protected readonly canBack = computed(() => this.tab().index > 0);
  protected readonly canForward = computed(() => this.tab().index < this.tab().history.length - 1);
  /** 进度条与页面内容都按对象身份重建元素：iframe 重新加载，进度条的过渡也从头开始。 */
  protected readonly bars = computed(() => [this.bar()]);
  protected readonly views = computed(() => [this.view()]);

  constructor() {
    const destroyRef = inject(DestroyRef);
    this.win.setMenus(computed(() => this.menuSections()));
    const unregister = this.browsers.register({ go: url => this.go(url) });
    destroyRef.onDestroy(() => {
      unregister();
      this.closed = true;
    });
    this.win.beforeClose.subscribe(() => {
      this.closed = true;
    });

    afterRenderEffect(() => {
      this.revision();
      this.urlField().nativeElement.value = this.address();
    });
    /* 页面里的链接和按钮是运行时注入的 HTML，用一个委托监听接住。 */
    afterNextRender(() => {
      const stop = this.renderer.listen(this.pageBox().nativeElement, 'click', (event: MouseEvent) =>
        this.pageClick(event)
      );
      destroyRef.onDestroy(stop);
    });
    this.render();
  }

  protected go(url: string): void {
    const tab = this.tab();
    const history = [...tab.history.slice(0, tab.index + 1), url];
    this.patch({ url, history, index: history.length - 1, reader: null });
    this.browsers.record(url);
    this.render();
  }

  protected back(): void {
    this.step(-1);
  }

  protected forward(): void {
    this.step(1);
  }

  protected reload(): void {
    this.render();
  }

  protected toggleSidebar(): void {
    this.sidebar.update(on => !on);
    this.revision.update(n => n + 1);
  }

  protected toggleReader(): void {
    if (this.kind() !== 'web') {
      this.toast.show('Reader isn’t available on this page');
      return;
    }
    this.patch({ reader: !this.readerOn() });
    this.render();
  }

  protected share(): void {
    const url = this.tab().url;
    if (navigator.clipboard && url) void navigator.clipboard.writeText(externalUrl(url)).catch(() => undefined);
    this.toast.show(url ? 'Copied link to clipboard' : 'Nothing to share');
  }

  protected newTab(): void {
    this.tabs.update(tabs => [...tabs, blankTab()]);
    this.current.set(this.tabs().length - 1);
    this.render();
    this.urlField().nativeElement.focus();
  }

  protected selectTab(index: number): void {
    this.current.set(index);
    this.render();
  }

  /** 关掉最后一个标签就关窗口。 */
  protected closeTab(index = this.current()): void {
    if (this.tabs().length === 1) {
      this.wm.close(this.win.id);
      return;
    }
    this.tabs.update(tabs => tabs.filter((_, i) => i !== index));
    this.current.update(i => clamp(i, 0, this.tabs().length - 1));
    this.render();
  }

  protected closeTabButton(event: Event, index: number): void {
    event.stopPropagation();
    this.closeTab(index);
  }

  protected overview(): void {
    const rect = this.host.closest('.win')!.getBoundingClientRect();
    this.popover.openComponent(
      SafariOverview,
      { x: rect.left + 20, y: rect.top + 70, origin: 'top' },
      {
        width: Math.round(rect.width - 40),
        current: this.current(),
        tabs: this.tabs().map(tab => ({
          title: titleFor(tab.url),
          color: favColor(tab.url),
          icon: faviconOf(hostOf(tab.url))
        })),
        pick: (index: number) => this.selectTab(index),
        create: () => this.newTab()
      }
    );
  }

  protected submit(event: Event, field: HTMLInputElement): void {
    event.preventDefault();
    field.blur();
    this.go(field.value.trim());
  }

  protected cancel(field: HTMLInputElement): void {
    field.blur();
    this.render();
  }

  protected markFailed(src: string): void {
    this.failed.update(set => new Set(set).add(src));
  }

  protected hideIcon(event: Event): void {
    (event.target as HTMLElement).style.visibility = 'hidden';
  }

  protected hideBox(event: Event): void {
    (event.target as HTMLElement).style.display = 'none';
  }

  private patch(patch: Partial<SafariTab>): void {
    const at = this.current();
    this.tabs.update(tabs => tabs.map((tab, i) => (i === at ? { ...tab, ...patch } : tab)));
  }

  private step(delta: -1 | 1): void {
    const tab = this.tab();
    const index = tab.index + delta;
    if (index < 0 || index >= tab.history.length) return;
    this.patch({ index, url: tab.history[index], reader: null });
    this.render();
  }

  private menuSections(): MenuSection[] {
    return this.menus.standard(
      'safari',
      {
        File: [
          { id: 't', label: 'New Tab', key: '⌘T', run: () => this.newTab() },
          { id: 'w', label: 'New Window', key: '⌘N', run: () => this.wm.open('safari', { force: true }) },
          '-',
          { id: 'c', label: 'Close Tab', key: '⌘W', run: () => this.closeTab() }
        ],
        View: [
          {
            id: 'sb',
            label: `${this.sidebar() ? 'Hide' : 'Show'} Sidebar`,
            key: '⌃⌘S',
            run: () => this.toggleSidebar()
          },
          {
            id: 'fb',
            label: `${this.system.safariFavs() ? 'Hide' : 'Show'} Favourites Bar`,
            key: '⇧⌘B',
            run: () => this.browsers.toggleFavouritesBar()
          },
          '-',
          { id: 'r', label: 'Reload Page', key: '⌘R', run: () => this.reload() }
        ],
        History: [
          { id: 'b', label: 'Back', key: '⌘[', run: () => this.back() },
          { id: 'f', label: 'Forward', key: '⌘]', run: () => this.forward() },
          '-',
          ...this.historyItems()
        ],
        Bookmarks: FAVOURITES.map(fav => ({ id: fav.name, label: fav.name, run: () => this.go(fav.url) }))
      },
      MENU_ORDER
    );
  }

  private historyItems(): MenuEntry[] {
    const history = this.browsers.history();
    if (!history.length) return [{ id: 'h', label: 'No history yet', disabled: true }];
    return history.slice(0, 8).map((url, i) => ({ id: `h${i}`, label: titleFor(url), run: () => this.go(url) }));
  }

  /** 页面里 `data-goto` 在本窗口导航、`data-openext` 交给真正的浏览器、`data-tryframe` 强行内嵌。 */
  private pageClick(event: MouseEvent): void {
    const target = event.target as Element;
    const goto = target.closest<HTMLElement>('[data-goto]');
    if (goto) {
      event.preventDefault();
      this.go(goto.dataset['goto'] ?? '');
      return;
    }
    const external = target.closest<HTMLElement>('[data-openext]');
    if (external) {
      event.preventDefault();
      window.open(external.dataset['openext'], '_blank', 'noopener');
      return;
    }
    const embed = target.closest<HTMLElement>('[data-tryframe]');
    if (embed) this.tryFrame(embed.dataset['tryframe'] ?? '');
  }

  private tryFrame(url: string): void {
    this.setPage(this.frame(url));
    this.bar.set({ id: ++this.barSeq, on: false, width: '' });
  }

  private render(): void {
    const url = this.tab().url;
    this.win.title.set(titleFor(url));
    this.revision.update(n => n + 1);
    const token = ++this.navigation;
    this.setPage({ type: 'blank' });
    const id = ++this.barSeq;
    this.bar.set({ id, on: true, width: '18%' });
    requestAnimationFrame(() =>
      requestAnimationFrame(() => this.bar.update(bar => (bar.id === id ? { ...bar, width: '72%' } : bar)))
    );
    void this.paint(url, token);
  }

  private setPage(page: SafariPage): void {
    this.view.set({ id: ++this.viewSeq, page });
  }

  private show(token: number, page: SafariPage): void {
    if (this.closed || this.navigation !== token) return;
    this.failed.set(new Set());
    this.setPage(page);
    this.bar.set({ id: ++this.barSeq, on: true, width: '100%' });
    setTimeout(() => this.bar.update(bar => ({ ...bar, on: false })), 260);
  }

  /** 把地址变成页面；需要网络的先给一个转圈，数据到了再换。 */
  private async paint(url: string, token: number): Promise<void> {
    const kind = kindOf(url);
    const site = localKey(url);
    const video = kind === 'video' ? videoId(url) : undefined;
    if (kind === 'start') this.show(token, this.startPage());
    else if (site) this.show(token, { type: 'local', site });
    else if (kind === 'wiki') await this.paintWiki(wikiTitle(url) || 'MacOS', token);
    else if (kind === 'search') await this.paintSearch(url, token);
    else if (video) this.paintVideo(video, token);
    else await this.paintWeb(url, token);
  }

  private startPage(): SafariPage {
    const history = this.browsers.history();
    const recent = history
      .filter(url => kindOf(url) !== 'start')
      .slice(0, 8)
      .map(url => ({ url, label: titleFor(url).split(' — ')[0], dot: favColor(url) }));
    return { type: 'start', recent, trackers: 9 + (history.length % 7) };
  }

  /** YouTube 拒绝没有来源的嵌入方，而从磁盘直接打开的页面就是没有来源，所以如实说明处境。 */
  private paintVideo(id: string, token: number): void {
    if (location.protocol === 'file:') {
      this.show(token, { type: 'embed-blocked', id });
      return;
    }
    const src = `https://www.youtube.com/embed/${id}?autoplay=0&rel=0`;
    this.show(token, { type: 'player', src: this.sanitizer.bypassSecurityTrustResourceUrl(src) });
  }

  private async paintWeb(url: string, token: number): Promise<void> {
    const reader = this.tab().reader;
    if (reader === false || (reader === null && framable(url))) {
      this.show(token, this.frame(url));
      return;
    }
    this.show(token, { type: 'loading' });
    const article = await fetchReader(url).catch(() => null);
    if (!article) {
      this.show(token, { type: 'blocked', url, host: hostOf(url) });
      return;
    }
    /* 信任边界：mdHTML 先把整段文字转义，只会产出自己生成的标签；链接要保留 data-goto，
       而 Angular 的消毒器会把 data-* 删掉，所以这里显式放行。 */
    const html = this.sanitizer.bypassSecurityTrustHtml(article.html);
    this.show(token, { type: 'reader', url, host: hostOf(url), title: article.title, html });
  }

  private frame(url: string): SafariPage {
    return { type: 'frame', src: this.sanitizer.bypassSecurityTrustResourceUrl(resolveUrl(url)) };
  }

  private async paintSearch(query: string, token: number): Promise<void> {
    this.show(token, { type: 'loading' });
    const hits = await fetchWikiSearch(query).catch((): readonly WikiHit[] => []);
    if (!hits.length) {
      this.show(token, { type: 'search', query, note: 'Offline — showing local results', hits: OFFLINE_HITS });
      return;
    }
    const results = hits.map((hit): SafariHit => {
      const slug = hit.title.replace(/ /g, '_');
      return {
        goto: `en.wikipedia.org/wiki/${encodeURIComponent(slug)}`,
        url: `en.wikipedia.org › wiki › ${slug}`,
        title: hit.title,
        text: '',
        html: hit.snippet
      };
    });
    this.show(token, { type: 'search', query, note: `${hits.length} results`, hits: results });
  }

  private async paintWiki(title: string, token: number): Promise<void> {
    this.show(token, { type: 'loading' });
    const article = await fetchWikiArticle(title).catch(() => null);
    if (!article) {
      this.show(token, { type: 'wiki-error' });
      return;
    }
    /* 信任边界：导语是 MediaWiki 渲染后经 cleanLead 清理的片段，站内链接已改成 data-goto，
       Angular 的消毒器会把 data-* 删掉，所以这里显式放行。 */
    const lead = article.lead ? this.sanitizer.bypassSecurityTrustHtml(article.lead) : null;
    this.show(token, { type: 'wiki', ...article, lead });
  }
}
