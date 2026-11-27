import { useI18n } from '@aiao/rxdb-i18n-angular';
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
import { FileSystem, describeDiskError } from '../../services/file-system';
import { MenuEntry, MenuSection } from '../../services/menu';
import { PopoverService } from '../../services/popover';
import { SystemState } from '../../services/system-state';
import { Toast } from '../../services/toast';
import { WindowManager } from '../../services/window-manager';
import { clamp } from '../../shared/format';
import { Icon } from '../../shared/icon';
import { TrafficLights } from '../../shared/traffic-lights';
import { markMatches } from '../preview/preview-find';
import { SafariBrowsers } from './safari-browsers';
import { WikiHit, fetchWikiArticle, fetchWikiSearch } from './safari-network';
import { SafariOverview } from './safari-overview';
import { SafariHit, SafariPage, SafariProgress, SafariTile } from './safari-page';
import { AddressSuggestion, suggestAddresses } from './safari-suggest';
import { SafariTab, blankTab, moveTab, setTabPinned } from './safari-tabs';
import {
  LOCAL_SITES,
  decodeHtmlFile,
  externalUrl,
  favColor,
  faviconOf,
  filePathOf,
  fileUrlOf,
  hostOf,
  isSameOrigin,
  kindOf,
  localKey,
  resolveUrl,
  titleFor,
  videoId,
  wikiTitle
} from './safari-url';

/** 页面区的一次内容；`id` 每次递增，模板据此整块重建（iframe 重新加载）。 */
interface SafariView {
  readonly id: number;
  readonly page: SafariPage;
}

/** 最近关闭的标签与它当时的位置；⇧⌘T 按顺序重开。 */
interface ClosedTab {
  readonly tab: SafariTab;
  readonly at: number;
}

/** 重开栈最多留几个。 */
const CLOSED_LIMIT = 8;

/** 搜索接口不可用时显示的本地结果。 */
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

const exec = (command: string): void => {
  document.execCommand(command);
};

/**
 * Safari：多标签、前进后退、侧栏、收藏栏，内容按地址在本地页、iframe 与维基之间切换。
 * 收藏夹、阅读列表与浏览历史来自本地库，所有 Safari 窗口共用。
 */
@Component({
  selector: 'app-safari',
  imports: [Icon, NgTemplateOutlet, TrafficLights],
  host: { style: 'display: contents' },
  templateUrl: './safari.html'
})
export class SafariApp {
  private readonly win = inject(DesktopWindow);
  private readonly wm = inject(WindowManager);
  private readonly fs = inject(FileSystem);
  private readonly toast = inject(Toast);
  private readonly popover = inject(PopoverService);
  private readonly menus = inject(DesktopMenus);
  private readonly browsers = inject(SafariBrowsers);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly renderer = inject(Renderer2);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly urlField = viewChild.required<ElementRef<HTMLInputElement>>('urlField');
  private readonly pageBox = viewChild.required<ElementRef<HTMLElement>>('pageBox');
  private readonly findFieldRef = viewChild<ElementRef<HTMLInputElement>>('findField');
  /** 每次重绘加一，让地址栏文字回到当前标签的地址。 */
  private readonly revision = signal(0);
  private readonly bar = signal<SafariProgress>({ id: 0, on: false, width: '' });
  private readonly view = signal<SafariView>({ id: 0, page: { type: 'blank' } });
  private readonly closedTabs = signal<readonly ClosedTab[]>([]);
  private readonly findTotal = signal(0);
  private readonly findAt = signal(0);
  /** 每次导航发一个号；慢请求回来时号已过期，就不能盖掉更新的页面。 */
  private navigation = 0;
  private barSeq = 0;
  private viewSeq = 0;
  private closed = false;
  /** 本窗口查找条是否已经提示过「只支持起始页与本地页」。 */
  private findHint = false;
  /** 正在拖动的标签下标；没有拖动时为 null。 */
  private dragFrom: number | null = null;
  protected readonly i18n = useI18n();

  protected readonly system = inject(SystemState);
  protected readonly favourites = this.browsers.favourites;
  protected readonly reading = this.browsers.readingList;
  protected readonly favColor = favColor;
  protected readonly faviconOf = faviconOf;
  protected readonly hostOf = hostOf;

  protected readonly tabs = signal<readonly SafariTab[]>([blankTab()]);
  protected readonly current = signal(0);
  protected readonly sidebar = signal(false);
  /** 起始页图标加载失败的地址，改画首字母；缩略图失败则整块撤掉。 */
  protected readonly failed = signal<ReadonlySet<string>>(new Set());
  /** 页面缩放：对页面区整体用 CSS zoom（含 iframe）。 */
  protected readonly zoom = signal(1);
  protected readonly finding = signal(false);
  protected readonly suggestions = signal<readonly AddressSuggestion[]>([]);
  protected readonly suggestOpen = signal(false);
  /** 高亮的建议下标；-1 表示没有高亮（回车使用地址栏原文）。 */
  protected readonly suggestAt = signal(-1);
  protected readonly findCount = computed(() =>
    this.findTotal() ?
      this.i18n.t('apps.safari.find.count', { current: this.findAt() + 1, total: this.findTotal() })
    : ''
  );

  /** 起始页的收藏夹格子；只有内置站点用色块，其余取站点图标。 */
  protected readonly favouriteTiles = computed((): readonly SafariTile[] =>
    this.favourites().map(fav => ({
      url: fav.url,
      label: fav.name,
      dot: LOCAL_SITES.has(fav.url) ? fav.color : null
    }))
  );
  /** 起始页的「常去的网站」：最近访问的前 8 个地址。 */
  protected readonly recentTiles = computed((): readonly SafariTile[] =>
    this.browsers
      .history()
      .filter(url => kindOf(url) !== 'start')
      .slice(0, 8)
      .map(url => ({ url, label: this.titleOf(url).split(' — ')[0], dot: favColor(url) }))
  );
  protected readonly trackers = computed(() => 9 + (this.browsers.history().length % 7));
  protected readonly tab = computed(() => this.tabs()[this.current()]);
  protected readonly kind = computed(() => kindOf(this.tab().url));
  protected readonly address = computed(() => (this.kind() === 'start' ? '' : this.tab().url));
  protected readonly urlIcon = computed(() => (['start', 'search'].includes(this.kind()) ? 'g-search' : 'g-lock'));
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

    /* 带着磁盘文件打开的窗口（D-28）：首个标签直接指向它，不记入浏览历史。 */
    const openedFile = this.win.options.node;
    if (openedFile?.kind === 'file' && openedFile.path) {
      const url = fileUrlOf(openedFile.path);
      this.tabs.set([{ url, history: [url], index: 0, pinned: false }]);
    }

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

  /** 标签/书签的页面标题：按当前语言取标题后缀（`titleFor` 缺省英文）。 */
  protected titleOf(url: string): string {
    return titleFor(url, key => this.i18n.t(key));
  }

  protected go(url: string): void {
    const tab = this.tab();
    const history = [...tab.history.slice(0, tab.index + 1), url];
    this.patch({ url, history, index: history.length - 1 });
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

  protected share(): void {
    const url = this.tab().url;
    /* 本地文件的地址本身就是 file:// 链接，照原样复制，不补 https 前缀。 */
    const target = kindOf(url) === 'file' ? url : externalUrl(url);
    if (navigator.clipboard && url) void navigator.clipboard.writeText(target).catch(() => undefined);
    this.toast.show(url ? 'apps.safari.toast.copiedLink' : 'apps.safari.toast.nothingToShare');
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

  /** 关掉最后一个标签就关窗口；固定标签没有关闭钮，也关不掉。 */
  protected closeTab(index = this.current()): void {
    const tabs = this.tabs();
    const tab = tabs[index];
    if (!tab || tab.pinned) return;
    if (tabs.length === 1) {
      this.wm.close(this.win.id);
      return;
    }
    this.closedTabs.update(list => [...list.slice(1 - CLOSED_LIMIT), { tab, at: index }]);
    this.tabs.set(tabs.filter((_, i) => i !== index));
    this.current.update(i => clamp(i, 0, this.tabs().length - 1));
    this.render();
  }

  /** ⇧⌘T：重开最近关掉的标签，回到它原来的位置。 */
  protected reopenTab(): void {
    const last = this.closedTabs().at(-1);
    if (!last) return;
    this.closedTabs.update(list => list.slice(0, -1));
    const at = Math.min(last.at, this.tabs().length);
    this.tabs.update(tabs => [...tabs.slice(0, at), last.tab, ...tabs.slice(at)]);
    this.current.set(at);
    this.render();
  }

  protected closeTabButton(event: Event, index: number): void {
    event.stopPropagation();
    this.closeTab(index);
  }

  /** 标签右键菜单：新标签、固定与关闭。 */
  protected tabMenu(event: MouseEvent, index: number): void {
    const tab = this.tabs()[index];
    if (!tab) return;
    this.popover.contextMenu(
      event,
      [
        { id: 'nt', label: this.i18n.t('apps.safari.newTab'), run: () => this.newTab() },
        '-',
        {
          id: 'pin',
          label: this.i18n.t(tab.pinned ? 'apps.safari.menu.unpinTab' : 'apps.safari.menu.pinTab'),
          run: () => this.togglePin(index)
        },
        { id: 'cl', label: this.i18n.t('apps.safari.closeTab'), disabled: tab.pinned, run: () => this.closeTab(index) }
      ],
      this.i18n.t('apps.safari.menu.tabList')
    );
  }

  /** 固定/取消固定：固定标签排到最前，当前标签跟随移动。 */
  protected togglePin(index: number): void {
    const tabs = this.tabs();
    const tab = tabs[index];
    if (!tab) return;
    const active = tabs[this.current()];
    const next = setTabPinned(tabs, index, !tab.pinned);
    if (next === tabs) return;
    this.tabs.set(next);
    const pinnedCount = next.filter(item => item.pinned).length;
    const at = next.indexOf(active);
    this.current.set(
      at >= 0 ? at
      : tab.pinned ? pinnedCount
      : pinnedCount - 1
    );
  }

  protected tabDragStart(event: DragEvent, index: number): void {
    event.stopPropagation();
    this.dragFrom = index;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(index));
    }
  }

  protected tabDragOver(event: DragEvent): void {
    if (this.dragFrom === null) return;
    /* 允许放下即可；落地位置由 drop 时指针相对目标的中点重新计算。 */
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }

  protected tabDrop(event: DragEvent, index: number): void {
    event.preventDefault();
    const from = this.dragFrom;
    this.dragFrom = null;
    if (from === null) return;
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const to = event.clientX >= box.left + box.width / 2 ? index + 1 : index;
    const tabs = this.tabs();
    const active = tabs[this.current()];
    const next = moveTab(tabs, from, to);
    if (next === tabs) return;
    this.tabs.set(next);
    this.current.set(next.indexOf(active));
  }

  protected tabDragEnd(): void {
    this.dragFrom = null;
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
          title: this.titleOf(tab.url),
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
    const at = this.suggestOpen() ? this.suggestAt() : -1;
    const pick = at >= 0 ? this.suggestions()[at] : undefined;
    this.closeSuggest();
    if (pick) {
      this.go(pick.url);
      return;
    }
    this.go(field.value.trim());
  }

  /** ⌘L：聚焦地址栏并全选当前地址（macOS 的 Open Location）。 */
  protected focusAddress(): void {
    const field = this.urlField().nativeElement;
    field.focus();
    field.select();
  }

  /** 聚焦地址栏：全选当前地址，并按当前值给建议。 */
  protected focusField(field: HTMLInputElement): void {
    field.select();
    this.suggest(field.value);
  }

  protected cancelSuggest(event: Event, field: HTMLInputElement): void {
    if (this.suggestOpen()) {
      event.preventDefault();
      this.closeSuggest();
      return;
    }
    field.blur();
    this.render();
  }

  protected suggest(value: string): void {
    this.suggestions.set(
      suggestAddresses(value, this.browsers.history(), this.favourites(), 6, key => this.i18n.t(key))
    );
    this.suggestAt.set(-1);
    this.suggestOpen.set(true);
  }

  protected suggestDown(event: Event): void {
    const length = this.suggestions().length;
    if (!length) return;
    event.preventDefault();
    this.suggestAt.update(at => (at + 1) % length);
    this.suggestOpen.set(true);
  }

  protected suggestUp(event: Event): void {
    const length = this.suggestions().length;
    if (!length) return;
    event.preventDefault();
    this.suggestAt.update(at => (at <= 0 ? length - 1 : at - 1));
    this.suggestOpen.set(true);
  }

  protected closeSuggest(): void {
    this.suggestOpen.set(false);
  }

  protected pickSuggest(url: string): void {
    this.closeSuggest();
    const field = this.urlField().nativeElement;
    field.blur();
    this.go(url);
  }

  /** ⌘F：打开查找条并聚焦；已打开时只聚焦。 */
  protected focusFind(): void {
    if (!this.finding()) this.toggleFind();
    else setTimeout(() => this.findFieldRef()?.nativeElement.focus(), 0);
  }

  protected toggleFind(): void {
    const opening = !this.finding();
    this.finding.set(opening);
    this.findHint = false;
    if (opening) {
      setTimeout(() => this.findFieldRef()?.nativeElement.focus(), 0);
      return;
    }
    this.findTotal.set(0);
    this.findAt.set(0);
    markMatches(this.pageBox().nativeElement, '');
  }

  protected closeFind(): void {
    this.finding.set(false);
    this.findTotal.set(0);
    this.findAt.set(0);
    markMatches(this.pageBox().nativeElement, '');
  }

  /** 查找条输入：起始页与本地页可搜，其余页面给一次提示。 */
  protected findOnPage(value: string): void {
    const kind = this.kind();
    if (kind !== 'start' && kind !== 'local') {
      if (!this.findHint) this.toast.show('apps.safari.toast.findScope');
      this.findHint = true;
      this.findTotal.set(0);
      this.findAt.set(0);
      markMatches(this.pageBox().nativeElement, '');
      return;
    }
    this.findHint = false;
    const count = markMatches(this.pageBox().nativeElement, value.trim().toLowerCase());
    this.findTotal.set(count);
    this.findAt.set(0);
    if (count) this.focusMatch(0);
  }

  protected findStep(delta: 1 | -1): void {
    if (delta === 1) this.findNextMatch();
    else this.findPrevMatch();
  }

  /** 模板绑定用：`$event` 在 Angular 模板类型检查里是 `Event`，这里收窄成 `KeyboardEvent` 再读 `shiftKey`。 */
  protected findStepDirection(event: Event): void {
    this.findStep((event as KeyboardEvent).shiftKey ? -1 : 1);
  }

  protected findNextMatch(): void {
    if (!this.finding()) this.toggleFind();
    this.stepMatch(1);
  }

  protected findPrevMatch(): void {
    if (!this.finding()) this.toggleFind();
    this.stepMatch(-1);
  }

  protected zoomIn(): void {
    this.zoom.update(value => Math.min(3, Math.round(value * 10 + 1) / 10));
  }

  protected zoomOut(): void {
    this.zoom.update(value => Math.max(0.5, Math.round(value * 10 - 1) / 10));
  }

  protected actualSize(): void {
    this.zoom.set(1);
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

  private stepMatch(delta: 1 | -1): void {
    const total = this.findTotal();
    if (!total) return;
    this.findAt.update(at => (at + delta + total) % total);
    this.focusMatch(this.findAt());
  }

  private focusMatch(at: number): void {
    const marks = this.pageBox().nativeElement.querySelectorAll<HTMLElement>('mark');
    const mark = marks[at];
    if (!mark) return;
    marks.forEach(item => (item.style.outline = ''));
    mark.style.outline = '2px solid var(--blue)';
    mark.scrollIntoView({ block: 'center' });
  }

  private patch(patch: Partial<SafariTab>): void {
    const at = this.current();
    this.tabs.update(tabs => tabs.map((tab, i) => (i === at ? { ...tab, ...patch } : tab)));
  }

  private step(delta: -1 | 1): void {
    const tab = this.tab();
    const index = tab.index + delta;
    if (index < 0 || index >= tab.history.length) return;
    this.patch({ index, url: tab.history[index] });
    this.render();
  }

  private menuSections(): MenuSection[] {
    /* 菜单名就是 standard() 的合并键：基础菜单的键是翻译后的分区名，覆盖与顺序都要用同一份翻译。 */
    const file = this.i18n.t('shell.menu.sectionFile');
    const edit = this.i18n.t('shell.menu.sectionEdit');
    const view = this.i18n.t('shell.menu.sectionView');
    const history = this.i18n.t('apps.safari.menu.sectionHistory');
    const bookmarks = this.i18n.t('apps.safari.menu.sectionBookmarks');
    const windowSection = this.i18n.t('shell.menu.sectionWindow');
    const help = this.i18n.t('shell.menu.sectionHelp');
    return this.menus.standard(
      'safari',
      {
        [file]: [
          { id: 't', label: this.i18n.t('apps.safari.newTab'), key: '⌘T', run: () => this.newTab() },
          {
            id: 'w',
            label: this.i18n.t('shell.menu.newWindow'),
            key: '⌘N',
            run: () => this.wm.open('safari', { force: true })
          },
          { id: 'l', label: this.i18n.t('apps.safari.menu.openLocation'), key: '⌘L', run: () => this.focusAddress() },
          '-',
          { id: 'c', label: this.i18n.t('apps.safari.closeTab'), key: '⌘W', run: () => this.closeTab() }
        ],
        [edit]: [
          { id: 'u', label: this.i18n.t('shell.menu.undo'), key: '⌘Z', run: () => exec('undo') },
          { id: 'r', label: this.i18n.t('shell.menu.redo'), key: '⇧⌘Z', run: () => exec('redo') },
          '-',
          { id: 'x', label: this.i18n.t('shell.menu.cut'), key: '⌘X', run: () => exec('cut') },
          { id: 'c2', label: this.i18n.t('shell.menu.copy'), key: '⌘C', run: () => exec('copy') },
          { id: 'v', label: this.i18n.t('shell.menu.paste'), key: '⌘V', run: () => exec('paste') },
          '-',
          { id: 'a', label: this.i18n.t('shell.menu.selectAll'), key: '⌘A', run: () => exec('selectAll') },
          '-',
          { id: 'fd', label: this.i18n.t('apps.safari.menu.find'), key: '⌘F', run: () => this.focusFind() },
          { id: 'fn', label: this.i18n.t('apps.safari.menu.findNext'), key: '⌘G', run: () => this.findNextMatch() }
        ],
        [view]: [
          {
            id: 'sb',
            label: this.i18n.t(this.sidebar() ? 'shell.menu.hideSidebar' : 'shell.menu.showSidebar'),
            key: '⌃⌘S',
            run: () => this.toggleSidebar()
          },
          {
            id: 'fb',
            label: this.i18n.t(
              this.system.safariFavs() ? 'apps.safari.menu.hideFavouritesBar' : 'apps.safari.menu.showFavouritesBar'
            ),
            key: '⇧⌘B',
            run: () => this.browsers.toggleFavouritesBar()
          },
          '-',
          { id: 'r', label: this.i18n.t('apps.safari.menu.reloadPage'), key: '⌘R', run: () => this.reload() },
          '-',
          { id: 'zi', label: this.i18n.t('apps.safari.menu.zoomIn'), key: '⌘+', run: () => this.zoomIn() },
          { id: 'zo', label: this.i18n.t('apps.safari.menu.zoomOut'), key: '⌘-', run: () => this.zoomOut() },
          { id: 'as', label: this.i18n.t('apps.safari.menu.actualSize'), key: '⌘0', run: () => this.actualSize() }
        ],
        [history]: [
          { id: 'b', label: this.i18n.t('apps.safari.back'), key: '⌘[', run: () => this.back() },
          { id: 'f', label: this.i18n.t('apps.safari.forward'), key: '⌘]', run: () => this.forward() },
          '-',
          {
            id: 'rt',
            label: this.i18n.t('apps.safari.menu.reopenLastClosedTab'),
            key: '⇧⌘T',
            disabled: !this.closedTabs().length,
            run: () => this.reopenTab()
          },
          '-',
          ...this.historyItems()
        ],
        [bookmarks]: [
          {
            id: 'ab',
            label: this.i18n.t('apps.safari.menu.addBookmark'),
            key: '⌘D',
            disabled: this.kind() === 'start',
            run: () => this.browsers.addBookmark(this.tab().url)
          },
          '-',
          ...this.favourites().map(fav => ({ id: fav.name, label: fav.name, run: () => this.go(fav.url) }))
        ]
      },
      [file, edit, view, history, bookmarks, windowSection, help]
    );
  }

  private historyItems(): MenuEntry[] {
    const history = this.browsers.history();
    if (!history.length) return [{ id: 'h', label: this.i18n.t('apps.safari.menu.noHistory'), disabled: true }];
    return history.slice(0, 8).map((url, i) => ({ id: `h${i}`, label: this.titleOf(url), run: () => this.go(url) }));
  }

  /** 页面里 `data-goto` 在本窗口导航、`data-openext` 交给真正的浏览器、`data-tryframe` 强行内嵌；⌘-点击在新标签打开。 */
  private pageClick(event: MouseEvent): void {
    const target = event.target as Element;
    const goto = target.closest<HTMLElement>('[data-goto]');
    if (goto) {
      event.preventDefault();
      const url = goto.dataset['goto'] ?? '';
      if ((event.metaKey || event.ctrlKey) && !event.altKey) {
        this.openInTab(url, !event.shiftKey);
        return;
      }
      this.go(url);
      return;
    }
    const external = target.closest<HTMLElement>('[data-openext]');
    if (external) {
      event.preventDefault();
      window.open(external.dataset['openext'], '_blank', 'noopener,noreferrer');
      return;
    }
    const embed = target.closest<HTMLElement>('[data-tryframe]');
    if (embed) this.tryFrame(embed.dataset['tryframe'] ?? '');
  }

  /** ⌘-点击在新标签打开：默认后台（原标签不动），⇧⌘-点击前台。 */
  private openInTab(url: string, background: boolean): void {
    this.tabs.update(tabs => [...tabs, { url, history: [url], index: 0, pinned: false }]);
    this.browsers.record(url);
    if (background) return;
    this.current.set(this.tabs().length - 1);
    this.render();
  }

  private tryFrame(url: string): void {
    this.setPage(this.frame(url));
    this.bar.set({ id: ++this.barSeq, on: false, width: '' });
  }

  private render(): void {
    const url = this.tab().url;
    this.win.title.set(this.titleOf(url));
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
    if (kind === 'start') this.show(token, { type: 'start' });
    else if (kind === 'file') await this.paintFile(url, token);
    else if (site) this.show(token, { type: 'local', site });
    else if (kind === 'wiki') await this.paintWiki(wikiTitle(url) || 'MacOS', token);
    else if (kind === 'search') await this.paintSearch(url, token);
    else if (video) this.paintVideo(video, token);
    else this.show(token, this.frame(url));
  }

  /** 磁盘文件：按文件声明的字符集解码，读出内容放进沙盒框渲染（脚本可以运行，但与桌面隔离，碰不到桌面数据）。 */
  private async paintFile(url: string, token: number): Promise<void> {
    const path = filePathOf(url);
    if (!path) {
      this.show(token, { type: 'file-error', reason: this.i18n.t('error.safari.addressNotAFile') });
      return;
    }
    const name = path.at(-1) ?? this.i18n.t('apps.safari.untitled');
    try {
      const html = decodeHtmlFile(await this.fs.read(path));
      /* 相对地址钉到 about:blank：文件里的相对资源没有磁盘来源可解析，不能落到桌面自己的 origin 上。 */
      const withBase =
        /<head[^>]*>/i.test(html) ?
          html.replace(/<head[^>]*>/i, match => `${match}<base href="about:blank">`)
        : `<base href="about:blank">${html}`;
      this.show(token, {
        type: 'file',
        title: name,
        path: `/${path.join('/')}`,
        html: this.sanitizer.bypassSecurityTrustHtml(withBase)
      });
    } catch (error) {
      this.show(token, { type: 'file-error', reason: describeDiskError(error) });
    }
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

  /** 与桌面同源的地址不内嵌：框带 `allow-same-origin` 与 `allow-scripts`，同源页面能摘掉自己的 sandbox，直接访问桌面。 */
  private frame(url: string): SafariPage {
    const address = resolveUrl(url);
    if (isSameOrigin(address, location.origin)) return { type: 'same-origin', url: address };
    return { type: 'frame', url: address, src: this.sanitizer.bypassSecurityTrustResourceUrl(address) };
  }

  private async paintSearch(query: string, token: number): Promise<void> {
    this.show(token, { type: 'loading' });
    const hits = await fetchWikiSearch(query).catch((): readonly WikiHit[] => []);
    if (!hits.length) {
      this.show(token, { type: 'search', query, note: this.i18n.t('apps.safari.search.offline'), hits: OFFLINE_HITS });
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
    this.show(token, {
      type: 'search',
      query,
      note: this.i18n.t('apps.safari.search.results', { count: hits.length }),
      hits: results
    });
  }

  private async paintWiki(title: string, token: number): Promise<void> {
    this.show(token, { type: 'loading' });
    const article = await fetchWikiArticle(title).catch(() => null);
    if (!article) {
      this.show(token, { type: 'wiki-error' });
      return;
    }
    /* 信任边界：导语来自任何人都能编辑的维基页面，MediaWiki 的消毒器历史上出过绕过，所以不信它。
       cleanLead 按元素与属性白名单重建这段 HTML（没有脚本、框架、表单、事件属性与外来命名空间，
       站内链接改成只能指向维基条目的 data-goto）；Angular 的消毒器会把 data-* 删掉，
       所以这里只放行已经按白名单重建过的结果。 */
    const lead = article.lead ? this.sanitizer.bypassSecurityTrustHtml(article.lead) : null;
    this.show(token, { type: 'wiki', ...article, lead });
  }
}
