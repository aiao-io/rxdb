import { Component, DestroyRef, ElementRef, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';

import { diskPathOf } from '../../disk/disk-path';
import { ApplicationCatalog } from '../../services/application-catalog';
import { DesktopMenus, FinderCommands, FinderView } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { FileOpener } from '../../services/file-opener';
import { FileSystem, FsNode, HOME_PATH, PLACES, describeDiskError } from '../../services/file-system';
import { MenuEntry } from '../../services/menu';
import { PopoverService } from '../../services/popover';
import { Toast } from '../../services/toast';
import { finderDate } from '../../shared/format';
import { Icon } from '../../shared/icon';
import { PhotoArt } from '../../shared/photo-art';
import { TrafficLights } from '../../shared/traffic-lights';
import {
  FinderSort,
  SIDEBAR,
  TAG_PLACES,
  VIRTUAL_PLACES,
  columnChain,
  folderContents,
  nameSeed,
  shotKind
} from './finder-model';

/** 每一栏 206.5px；末端是文件时右侧再留 250px 预览。 */
const COLUMN_WIDTH = 206.5;
const PREVIEW_WIDTH = 250;

/** Finder：图标、列表、分栏、画廊四种视图，侧栏、路径栏、搜索、排序与历史。 */
@Component({
  selector: 'app-finder',
  imports: [Icon, PhotoArt, TrafficLights],
  host: { style: 'display: contents' },
  templateUrl: './finder.html'
})
export class FinderApp implements FinderCommands {
  private readonly win = inject(DesktopWindow);
  private readonly fs = inject(FileSystem);
  private readonly opener = inject(FileOpener);
  private readonly catalog = inject(ApplicationCatalog);
  private readonly popover = inject(PopoverService);
  private readonly toast = inject(Toast);
  private readonly body = viewChild.required<ElementRef<HTMLElement>>('body');
  private readonly history = signal<{ readonly entries: readonly (readonly string[])[]; readonly index: number }>({
    entries: [],
    index: 0
  });
  private readonly bodyWidth = signal(0);

  protected readonly sidebarGroups = SIDEBAR;
  protected readonly path = signal<readonly string[]>([]);
  protected readonly view = signal<FinderView>('icon');
  protected readonly sidebar = signal(true);
  protected readonly pathbar = signal(true);
  protected readonly selected = signal<string | null>(null);
  protected readonly query = signal('');
  protected readonly columnSelection = signal<readonly string[]>([]);
  protected readonly sort = signal<FinderSort>('name');
  protected readonly finderDate = finderDate;
  protected readonly seed = nameSeed;
  protected readonly shotKind = shotKind;

  protected readonly items = computed(() => folderContents(this.fs, this.path(), this.query(), this.sort()));
  /** 在 Applications 里：同名的非包条目占着位置，让某些预装应用没有包时，说清楚它们仍可从别处打开（D-17）。 */
  protected readonly applicationsNote = computed(() => {
    const path = this.path();
    return path.length === 2 && path[1] === 'Applications' && !this.query() ? this.catalog.conflictNote() : null;
  });
  protected readonly title = computed(() => (this.query() ? `Searching “${this.query()}”` : this.path().at(-1)));
  protected readonly canGoBack = computed(() => this.history().index > 0);
  protected readonly canGoForward = computed(() => this.history().index < this.history().entries.length - 1);
  protected readonly emptyText = computed(() => {
    const disk = this.fs.state();
    if (disk === 'mounting') return 'Mounting Macintosh HD…';
    if (disk === 'failed') return `Macintosh HD is unavailable: ${this.fs.error()}`;
    if (this.query()) return 'No results';
    return this.path()[0] === 'AirDrop' ? 'No one nearby' : 'Empty folder';
  });
  protected readonly gallerySelection = computed(() => {
    const items = this.items();
    return items.find(item => item.name === this.selected()) ?? items[0];
  });
  protected readonly columns = computed(() => columnChain(this.fs, this.path(), this.items(), this.columnSelection()));
  /** 只渲染放得下的最深几栏：真机会横向滚动，但总停在栏边界上，效果一样。 */
  protected readonly firstColumn = computed(() => {
    const { chain } = this.columns();
    const leafFile = chain.at(-1)?.file ?? false;
    const available = (this.bodyWidth() || 620) - (leafFile ? PREVIEW_WIDTH : 0);
    const keep = Math.max(1, Math.floor(available / COLUMN_WIDTH));
    return Math.max(0, chain.filter(column => !column.file).length - keep);
  });
  protected readonly previewFile = computed(() => {
    const leaf = this.columns().chain.at(-1);
    return leaf?.file ? leaf.node : null;
  });
  /** 分栏视图里选择链也算进路径栏，否则会跳过点进去的每一级。 */
  protected readonly pathSegments = computed(() =>
    this.view() === 'column' ? [...this.path(), ...this.columns().selection] : this.path()
  );
  protected readonly pathTail = computed(() => (this.view() === 'column' ? null : this.selected()));

  constructor() {
    const menus = inject(DesktopMenus);
    const start = this.win.options.path ?? HOME_PATH;
    this.path.set(start);
    this.history.set({ entries: [start], index: 0 });
    this.selected.set(this.win.options.select ?? null);
    if (start.length === 1 && start[0] === 'Trash') this.view.set('list');
    this.win.setMenus(computed(() => menus.finder(this)));

    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const observer = new ResizeObserver(() => this.bodyWidth.set(this.body().nativeElement.clientWidth));
      observer.observe(this.body().nativeElement);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  goto(place: string): void {
    if (VIRTUAL_PLACES.includes(place)) {
      this.nav([place]);
      return;
    }
    if (TAG_PLACES.some(tag => place.startsWith(tag))) {
      this.toast.show(`No files tagged ${place}`);
      return;
    }
    this.nav(PLACES[place] ?? HOME_PATH);
  }

  setView(view: FinderView): void {
    this.view.set(view);
  }

  toggleSidebar(): void {
    this.sidebar.update(on => !on);
  }

  togglePathBar(): void {
    this.pathbar.update(on => !on);
  }

  newFolder(): void {
    const dir = diskPathOf(this.path());
    if (!dir || this.query()) {
      this.toast.show('New folders can only be made on Macintosh HD');
      return;
    }
    this.fs.newFolder(dir).then(
      name => this.selected.set(name),
      (error: unknown) => this.toast.show(describeDiskError(error))
    );
  }

  openSelected(): void {
    const name = this.selected();
    if (name) this.enter(name);
  }

  trashSelected(): void {
    const node = this.items().find(item => item.name === this.selected());
    if (!node?.path) return;
    this.selected.set(null);
    this.fs.moveToTrash(node.path).catch((error: unknown) => this.toast.show(describeDiskError(error)));
  }

  protected placeOn(place: string): boolean {
    const path = this.path();
    return place === path.at(-1) || (PLACES[place] ?? []).join('/') === path.join('/');
  }

  protected back(): void {
    this.step(-1);
  }

  protected forward(): void {
    this.step(1);
  }

  protected search(value: string): void {
    this.query.set(value);
  }

  protected select(name: string): void {
    this.selected.set(name);
  }

  protected enter(name: string): void {
    const node = this.items().find(item => item.name === name);
    if (!node) return;
    if (node.kind === 'file') {
      this.opener.open(node);
      return;
    }
    /* 搜索结果与「最近使用」不在当前路径下，按绝对路径进入。 */
    this.nav(this.fs.findPath(node) ?? [...this.path(), name]);
  }

  protected pickColumn(index: number, name: string): void {
    this.columnSelection.update(selection => [...selection.slice(0, index), name]);
    this.selected.set(name);
  }

  protected openColumnFile(node: FsNode): void {
    if (node.kind === 'file') this.enter(node.name);
  }

  protected jump(index: number | null): void {
    this.nav(index === null ? [] : this.path().slice(0, index + 1));
  }

  protected sortMenu(anchor: HTMLElement): void {
    const sort = this.sort();
    const pick = (next: FinderSort) => () => this.sort.set(next);
    const rect = anchor.getBoundingClientRect();
    this.popover.openMenu(
      [
        { head: 'Sort By' },
        { id: 'n', label: 'Name', checked: sort !== 'date' && sort !== 'size', run: pick('name') },
        { id: 'd', label: 'Date Modified', checked: sort === 'date', run: pick('date') },
        { id: 's', label: 'Size', checked: sort === 'size', run: pick('size') },
        { id: 'k', label: 'Kind', checked: sort === 'kind', run: pick('kind') }
      ],
      { x: rect.left, y: rect.bottom + 4, origin: 'top left' }
    );
  }

  protected moreMenu(anchor: HTMLElement): void {
    const rect = anchor.getBoundingClientRect();
    this.popover.openMenu(
      [
        {
          id: 'sb',
          label: this.sidebar() ? 'Hide Sidebar' : 'Show Sidebar',
          key: '⌥⌘S',
          run: () => this.toggleSidebar()
        },
        {
          id: 'pb',
          label: this.pathbar() ? 'Hide Path Bar' : 'Show Path Bar',
          key: '⌥⌘P',
          run: () => this.togglePathBar()
        },
        '-',
        { id: 'nf', label: 'New Folder', key: '⇧⌘N', run: () => this.newFolder() }
      ],
      { x: rect.right, y: rect.bottom + 4, right: true, origin: 'top right' }
    );
  }

  protected share(): void {
    this.toast.show('Nothing to share — it is all local.');
  }

  protected itemMenu(event: MouseEvent, name: string): void {
    this.selected.set(name);
    const items: MenuEntry[] = [
      { id: 'o', label: 'Open', run: () => this.enter(name) },
      { id: 'w', label: 'Open With', key: '▸' },
      '-',
      { id: 'i', label: 'Get Info', key: '⌘I', run: () => this.info(name) },
      { id: 'r', label: 'Rename' },
      { id: 'd', label: 'Duplicate', key: '⌘D' },
      '-',
      { id: 't', label: 'Move to Trash', key: '⌘⌫', run: () => this.trashSelected() },
      '-',
      { id: 'q', label: 'Quick Look', key: '␣', run: () => this.info(name) }
    ];
    this.popover.contextMenu(event, items);
  }

  protected bodyMenu(event: MouseEvent): void {
    if ((event.target as Element).closest('.fitem,.r,.ci')) return;
    this.popover.contextMenu(event, [
      { id: 'nf', label: 'New Folder', run: () => this.newFolder() },
      { id: 'gi', label: 'Get Info' },
      '-',
      { id: 'v', label: 'View', key: '▸' },
      { id: 's', label: 'Sort By', key: '▸' }
    ]);
  }

  private info(name: string): void {
    const node = this.items().find(item => item.name === name);
    if (node) this.toast.show(`${node.name} — ${node.k}${node.size ? `, ${node.size}` : ''}`);
  }

  private nav(path: readonly string[]): void {
    this.query.set('');
    this.path.set(path);
    this.selected.set(null);
    this.columnSelection.set([]);
    this.history.update(({ entries, index }) => {
      const next = [...entries.slice(0, index + 1), path];
      return { entries: next, index: next.length - 1 };
    });
  }

  private step(delta: number): void {
    const { entries, index } = this.history();
    const target = index + delta;
    if (target < 0 || target >= entries.length) return;
    this.history.set({ entries, index: target });
    this.path.set(entries[target]);
    this.selected.set(null);
    this.columnSelection.set([]);
  }
}
