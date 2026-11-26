import { useI18n } from '@aiao/rxdb-i18n-angular';
import { DOCUMENT } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';

import { Preferences } from '../../data/preferences';
import { AppInstallationFlow } from '../../services/app-installation-flow';
import { AppLauncher } from '../../services/app-launcher';
import { ApplicationRegistry } from '../../services/application-registry';
import { CatalogAppId, DesktopAppId } from '../../services/desktop-apps';
import { DockDragController } from '../../services/dock-drag';
import { DockLayoutStore } from '../../services/dock-layout';
import { isMenuKey } from '../../services/focus-order';
import { InstalledApplications } from '../../services/installed-applications';
import {
  FOLDER_PREFIX,
  LaunchpadEntry,
  LaunchpadFolders,
  LaunchpadOrder,
  LaunchpadTileRect,
  addToLaunchpadFolder,
  createLaunchpadFolder,
  isLaunchpadFolders,
  isLaunchpadOrder,
  moveLaunchpadEntry,
  reconcileLaunchpad,
  removeFromLaunchpadFolder,
  resolveLaunchpadDrop
} from '../../services/launchpad-model';
import { MenuEntry } from '../../services/menu';
import { Overlays } from '../../services/overlays';
import { PopoverService } from '../../services/popover';
import { Toast } from '../../services/toast';
import { clamp } from '../../shared/format';
import { Icon } from '../../shared/icon';

/** 7 × 4，与真实启动台在这个高度下的网格一致。 */
const LAUNCHPAD_PER_PAGE = 28;
const LAUNCHPAD_COLS = 7;

/** 启动台的网格顺序与文件夹存成偏好表里的 JSON 行，跨标签页共享（规则见 ADESK-US-105）。 */
const ORDER_KEY = 'launchpad:order';
const FOLDERS_KEY = 'launchpad:folders';

/** 拖动中的会话快照：松手（或取消）后据此决定网格内重排还是合成文件夹。 */
interface LaunchpadDrag {
  readonly appId: DesktopAppId;
  x: number;
  y: number;
  /** 最后一次移动时 Dock 的插入槽位；非 null 说明松手会固定到 Dock，网格不再处理。 */
  slot: number | null;
  cancelled: boolean;
}

/**
 * 启动台：分页网格、搜索、应用文件夹、网格内拖拽重排、方向键与横向滚轮翻页、可点击的分页圆点、卸载目录应用。
 * 顺序与文件夹持久化在 `launchpad:order` / `launchpad:folders`（启动时与登记表对账，跨标签页共享）。
 * 无障碍（ADESK-US-108）：整个启动台是模态 `dialog`（焦点陷阱在 `OverlayLayer` 里加），搜索框有名称，应用图标是按钮
 * （名称是应用名）；打开动画走完焦点进搜索框，Esc 在文件夹视图里先返回，主视图里关闭并交还焦点。
 */
@Component({
  selector: 'app-launchpad',
  imports: [Icon],
  providers: [AppInstallationFlow],
  host: {
    id: 'lpad',
    class: 'nosel',
    role: 'dialog',
    'aria-label': 'Launchpad',
    'aria-modal': 'true',
    '[class.out]': "overlays.launchpad() === 'closing'",
    '(pointerdown)': 'backdrop($event)',
    '(wheel)': 'wheel($event)'
  },
  template: `
    <div class="sq">
      <svg appIcon="g-search"></svg>
      <input
        #query
        [attr.aria-label]="i18n.t('shell.overlay.searchLaunchpad')"
        [placeholder]="i18n.t('shell.overlay.search')"
        (input)="search(query.value)"
        (keydown)="key($event)"
        data-lq
        spellcheck="false"
      />
    </div>
    @if (folderId(); as name) {
      <div class="fbar" data-lfolder>
        <button
          class="back"
          (click)="openFolder(null)"
          (keydown.enter)="openFolder(null)"
          (keydown.space)="backByKey($event)"
          aria-label="Back to All Applications"
          data-lback
          tabindex="0"
          type="button"
        >
          <svg appIcon="g-chev-l"></svg>
          <span>{{ name }}</span>
        </button>
      </div>
    }
    <div class="grid" #grid aria-label="Applications" data-lgrid role="group">
      @for (entry of visible(); track entry) {
        @if (isAppEntry(entry)) {
          <div
            class="app"
            [attr.data-app]="entry"
            (click)="launch(entry)"
            (contextmenu)="menu($event, entry)"
            (keydown.enter)="launch(entry)"
            (keydown.space)="launchByKey($event, entry)"
            (keydown)="tileKey($event, entry)"
            (pointerdown)="dockDrag.beginFromLaunchpad($event, entry)"
            role="button"
            tabindex="0"
          >
            <div class="art"><svg [appIcon]="apps()[entry].icon"></svg></div>
            <div class="nm">{{ apps()[entry].name }}</div>
          </div>
        } @else {
          <div
            class="app folder"
            [attr.data-app]="entry"
            (click)="openFolder(folderTileName(entry))"
            (keydown.enter)="openFolder(folderTileName(entry))"
            (keydown.space)="folderByKey($event, folderTileName(entry))"
            role="button"
            tabindex="0"
          >
            <div class="art"><svg appIcon="g-folder-g"></svg></div>
            <div class="nm">{{ folderTileName(entry) }}</div>
          </div>
        }
      } @empty {
        <div
          role="status"
          style="grid-column: 1/-1; text-align: center; color: rgba(255, 255, 255, 0.75); font-size: 14px; padding-top: 40px; text-shadow: 0 1px 3px rgba(0, 0, 0, 0.4)"
        >
          No results
        </div>
      }
    </div>
    <div class="dots" data-ldots>
      @if (pages() > 1) {
        @for (dot of dots(); track dot) {
          <i
            [attr.aria-current]="dot === page() ? 'true' : null"
            [attr.aria-label]="'Page ' + (dot + 1) + ' of ' + pages()"
            [class.on]="dot === page()"
            (click)="goPage($event, dot)"
            (keydown.enter)="goPage($event, dot)"
            (keydown.space)="goPage($event, dot)"
            role="button"
            tabindex="0"
          ></i>
        }
      }
    </div>
    @if (deletePending(); as id) {
      <div
        class="lpad-del"
        [attr.aria-labelledby]="'lpad-del-' + id"
        (keydown)="delKey($event)"
        (pointerdown)="delBackdrop($event)"
        aria-modal="true"
        role="alertdialog"
      >
        <div class="card">
          <h2 [attr.id]="'lpad-del-' + id">Delete “{{ apps()[id].name }}”?</h2>
          <p>The application will be uninstalled. Your files are kept.</p>
          <div class="acts">
            <button #delCancel (click)="cancelDelete()" tabindex="0" type="button">Cancel</button>
            <button class="danger" #delOk (click)="confirmDelete()" tabindex="0" type="button">Delete</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .fbar {
      flex: none;
      display: flex;
      align-items: center;
      width: min(1420px, 88vw);
      margin-top: 26px;
      padding: 0 8px;
      box-sizing: border-box;
    }
    .fbar .back {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border: 0.5px solid rgba(255, 255, 255, 0.3);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.14);
      color: #fff;
      font: inherit;
      font-size: 13px;
      cursor: var(--cur-default);
    }
    .fbar .back svg {
      width: 12px;
      height: 12px;
    }
    .fbar .back:focus-visible {
      outline: 2px solid rgba(255, 255, 255, 0.92);
      outline-offset: 3px;
    }
    .app.folder .art {
      color: #7db9f0;
    }
    .dots i {
      position: relative;
      cursor: var(--cur-default);
    }
    .dots i::after {
      content: '';
      position: absolute;
      inset: -5px;
    }
    .dots i:focus-visible {
      outline: 2px solid rgba(255, 255, 255, 0.92);
      outline-offset: 2px;
    }
    .lpad-del {
      position: absolute;
      inset: 0;
      z-index: 2;
      display: grid;
      place-items: center;
      padding: 20px;
      box-sizing: border-box;
      background: rgba(0, 0, 0, 0.28);
    }
    .lpad-del .card {
      width: min(390px, 100%);
      padding: 22px;
      box-sizing: border-box;
      border: 0.5px solid var(--line-2);
      border-radius: 12px;
      background: var(--win-2);
      color: var(--txt);
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.28);
    }
    .lpad-del h2 {
      margin: 0 0 10px;
      font-size: 16px;
    }
    .lpad-del p {
      margin: 0;
      color: var(--txt-2);
      font-size: 12.5px;
      line-height: 1.5;
    }
    .lpad-del .acts {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 20px;
    }
    .lpad-del button {
      min-width: 82px;
      padding: 7px 13px;
      border: 0.5px solid var(--line-2);
      border-radius: 6px;
      background: var(--win);
      color: var(--txt);
      font: inherit;
    }
    .lpad-del button:hover {
      background: var(--hover);
    }
    .lpad-del button.danger {
      border-color: var(--red);
      background: var(--red);
      color: #fff;
    }
    .lpad-del button.danger:hover {
      filter: brightness(1.08);
    }
  `
})
export class Launchpad {
  protected readonly i18n = useI18n();
  private readonly launcher = inject(AppLauncher);
  private readonly popover = inject(PopoverService);
  private readonly dockLayout = inject(DockLayoutStore);
  private readonly preferences = inject(Preferences);
  private readonly installed = inject(InstalledApplications);
  private readonly flow = inject(AppInstallationFlow);
  private readonly toast = inject(Toast);
  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly queryInput = viewChild.required<ElementRef<HTMLInputElement>>('query');
  private readonly gridBox = viewChild.required<ElementRef<HTMLElement>>('grid');
  private readonly deleteCancelBtn = viewChild<ElementRef<HTMLButtonElement>>('delCancel');
  private readonly deleteOkBtn = viewChild<ElementRef<HTMLButtonElement>>('delOk');
  private readonly query = signal('');
  private readonly requestedPage = signal(0);
  /** 库里恢复的顺序与文件夹；恢复完成前为 `null`（直接用登记表顺序）。 */
  private readonly savedOrder = signal<LaunchpadOrder | null>(null);
  private readonly savedFolders = signal<LaunchpadFolders | null>(null);
  private drag: LaunchpadDrag | null = null;
  /** 翻页动画进行中的 WAAPI Animation；下一次翻页前取消，避免叠加。 */
  private pageAnim: Animation | null = null;
  /** 与登记表对账过的主网格条目（应用与文件夹瓦片）。 */
  private readonly entries = computed<readonly LaunchpadEntry[]>(
    () => reconcileLaunchpad(this.savedOrder() ?? this.appOrder(), this.savedFolders() ?? {}, this.appOrder()).order
  );
  /** 当前视图的条目：文件夹视图里是组内应用，主视图是完整网格。 */
  private readonly sourceEntries = computed<readonly LaunchpadEntry[]>(() => {
    const name = this.folderId();
    const folders = this.savedFolders();
    if (name && folders) return folders[name] ?? [];
    return this.entries();
  });
  private readonly matches = computed(() => {
    const q = this.query().toLowerCase();
    const source = this.sourceEntries();
    return q ? source.filter(entry => this.entryName(entry).toLowerCase().includes(q)) : source;
  });

  protected readonly apps = inject(ApplicationRegistry).apps;
  protected readonly overlays = inject(Overlays);
  protected readonly dockDrag = inject(DockDragController);
  protected readonly appOrder = inject(ApplicationRegistry).launchOrder;
  protected readonly deletePending = signal<DesktopAppId | null>(null);
  /** 当前打开的文件夹名；`null` 是主网格。 */
  protected readonly folderId = signal<string | null>(null);

  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.matches().length / LAUNCHPAD_PER_PAGE)));
  protected readonly page = computed(() => clamp(this.requestedPage(), 0, this.pages() - 1));
  protected readonly visible = computed(() =>
    this.matches().slice(this.page() * LAUNCHPAD_PER_PAGE, (this.page() + 1) * LAUNCHPAD_PER_PAGE)
  );
  protected readonly dots = computed(() => Array.from({ length: this.pages() }, (_, i) => i));

  constructor() {
    /* 打开动画走完再聚焦搜索框；这时已经选中应用、启动台在关闭，就不再抢走新窗口拿到的焦点。 */
    afterNextRender(() =>
      setTimeout(() => {
        if (this.overlays.launchpad() === 'open') this.queryInput().nativeElement.focus();
      }, 120)
    );
    this.preferences.ready.then(
      () => this.restore(),
      () => undefined
    );
    this.preferences.external$
      .pipe(
        filter(keys => keys.includes(ORDER_KEY) || keys.includes(FOLDERS_KEY)),
        takeUntilDestroyed()
      )
      .subscribe(() => this.adoptRemote());
    /* 登记表变化（安装/卸载/清单升级）后对账：丢掉下架的应用，补上新增的应用，修复过的布局写回。 */
    effect(() => {
      this.appOrder();
      const order = untracked(() => this.savedOrder());
      if (!order) return;
      const folders = untracked(() => this.savedFolders() ?? {});
      const fixed = reconcileLaunchpad(order, folders, this.appOrder());
      untracked(() => {
        if (fixed.order !== order || fixed.folders !== folders) {
          this.savedOrder.set(fixed.order);
          this.savedFolders.set(fixed.folders);
          this.save(fixed.order, fixed.folders);
        }
      });
    });
    /* 观察 Dock 拖放控制器的状态：从启动台起拖的会话在松手后，若没落到 Dock 上就交给网格重排/合成文件夹。 */
    effect(() => {
      const state = this.dockDrag.state();
      const drag = this.drag;
      if (state && state.source === 'launchpad') {
        if (!drag) {
          this.drag = { appId: state.appId, x: state.x, y: state.y, slot: state.slot, cancelled: false };
          this.document.addEventListener('pointerup', this.onDragUp, true);
          this.document.addEventListener('pointercancel', this.onDragCancel, true);
          this.document.addEventListener('keydown', this.onDragKey, true);
        } else {
          drag.x = state.x;
          drag.y = state.y;
          drag.slot = state.slot;
        }
      } else if (drag) {
        this.drag = null;
        this.document.removeEventListener('pointerup', this.onDragUp, true);
        this.document.removeEventListener('pointercancel', this.onDragCancel, true);
        this.document.removeEventListener('keydown', this.onDragKey, true);
        if (!drag.cancelled && drag.slot === null) this.resolveDrop(drag.x, drag.y, drag.appId);
      }
    });
    inject(DestroyRef).onDestroy(() => this.endDragWatch());
  }

  protected search(value: string): void {
    this.query.set(value);
    this.requestedPage.set(0);
  }

  protected key(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      /* 文件夹视图里 Esc 先返回主网格，主网格里才关闭启动台。 */
      if (this.folderId()) {
        this.openFolder(null);
        return;
      }
      this.overlays.closeLaunchpad();
    }
    const first = this.visible()[0];
    if (event.key === 'Enter' && first) {
      if (this.isAppEntry(first)) this.launch(first);
      else this.openFolder(this.folderTileName(first));
    }
    if (!this.query() && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
      event.preventDefault();
      this.turn(event.key === 'ArrowRight' ? 1 : -1);
    }
  }

  protected launch(id: DesktopAppId): void {
    this.overlays.closeLaunchpad();
    setTimeout(() => this.launcher.activate(id), 90);
  }

  protected launchByKey(event: Event, id: DesktopAppId): void {
    event.preventDefault();
    this.launch(id);
  }

  protected menu(event: MouseEvent, id: DesktopAppId): void {
    this.popover.contextMenu(event, this.menuItems(id), this.apps()[id].name);
  }

  /** 聚焦在图标上按 Menu 键或 Shift+F10：弹出同一份菜单，焦点交给第一项，关闭后回到图标。 */
  protected tileKey(event: KeyboardEvent, id: DesktopAppId): void {
    if (!isMenuKey(event)) return;
    event.preventDefault();
    const anchor = event.currentTarget as HTMLElement;
    const rect = anchor.getBoundingClientRect();
    this.popover.openMenu(this.menuItems(id), {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      origin: 'top left',
      focus: true,
      label: this.apps()[id].name,
      onClose: () => anchor.focus()
    });
  }

  protected backdrop(event: PointerEvent): void {
    const target = event.target as HTMLElement;
    if (target === this.host || target.classList.contains('grid')) this.overlays.closeLaunchpad();
  }

  protected wheel(event: WheelEvent): void {
    if (this.query() || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    if (event.deltaX > 12) this.turn(1);
    else if (event.deltaX < -12) this.turn(-1);
  }

  protected isAppEntry(entry: LaunchpadEntry): entry is DesktopAppId {
    return !entry.startsWith(FOLDER_PREFIX);
  }

  protected folderTileName(entry: LaunchpadEntry): string {
    return entry.slice(FOLDER_PREFIX.length);
  }

  /** 打开（或返回）一个文件夹；`null` 回到主网格。 */
  protected openFolder(name: string | null): void {
    this.folderId.set(name);
    this.requestedPage.set(0);
  }

  protected folderByKey(event: Event, name: string): void {
    event.preventDefault();
    this.openFolder(name);
  }

  protected backByKey(event: Event): void {
    event.preventDefault();
    this.openFolder(null);
  }

  /** 分页圆点：点击或键盘跳转页面，新的一页沿行进方向滑入。 */
  protected goPage(event: Event, index: number): void {
    event.preventDefault();
    const from = this.page();
    const next = clamp(index, 0, this.pages() - 1);
    if (next === from) return;
    this.requestedPage.set(next);
    this.animateTurn(Math.sign(next - from));
  }

  protected askDelete(id: DesktopAppId): void {
    this.deletePending.set(id);
    afterNextRender(() => this.deleteCancelBtn()?.nativeElement.focus());
  }

  protected cancelDelete(): void {
    this.deletePending.set(null);
  }

  protected async confirmDelete(): Promise<void> {
    const id = this.deletePending();
    this.deletePending.set(null);
    if (!id) return;
    this.flow.request(id as CatalogAppId, null);
    await this.flow.confirm();
    if (this.flow.error()) this.toast.show(this.flow.error());
  }

  protected delBackdrop(event: PointerEvent): void {
    if (event.target === event.currentTarget) this.cancelDelete();
  }

  /** 卸载确认弹层自己的键盘处理：Esc 取消，Tab 在两个按钮间循环（外层焦点陷阱不参与，避免抢焦点）。 */
  protected delKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.cancelDelete();
      return;
    }
    if (event.key !== 'Tab') return;
    event.preventDefault();
    event.stopPropagation();
    const cancel = this.deleteCancelBtn()?.nativeElement;
    const ok = this.deleteOkBtn()?.nativeElement;
    if (!cancel || !ok) return;
    const active = this.document.activeElement;
    if (event.shiftKey) (active === cancel ? ok : cancel).focus();
    else (active === ok ? cancel : ok).focus();
  }

  private turn(delta: number): void {
    const from = this.page();
    const next = clamp(from + delta, 0, this.pages() - 1);
    if (next === from) return;
    this.requestedPage.set(next);
    this.animateTurn(delta);
  }

  /**
   * 翻页动画：新的一页沿行进方向滑入并淡入。用 WAAPI（不留 fill），结束自动还原 transform——
   * 与 Notification Centre 的滑入同理，动画结束不残留 transform，不干扰 #lpad 的 backdrop 采样。
   * 系统要求减弱动态时跳过。
   */
  private animateTurn(dir: number): void {
    this.pageAnim?.cancel();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const anim = this.gridBox().nativeElement.animate(
      [
        { opacity: 0, transform: `translateX(${dir > 0 ? 56 : -56}px)` },
        { opacity: 1, transform: 'translateX(0)' }
      ],
      /* ease-out-cubic：#lpad 的 --e-out 前段太陡，滑动在头 1/4 时长就走完、肉眼看不见，这里要一条平缓的收尾曲线。 */
      { duration: 260, easing: 'cubic-bezier(0.33, 1, 0.68, 1)' }
    );
    this.pageAnim = anim;
    anim.addEventListener(
      'finish',
      () => {
        if (this.pageAnim === anim) this.pageAnim = null;
      },
      { once: true }
    );
  }

  private entryName(entry: LaunchpadEntry): string {
    return this.isAppEntry(entry) ? this.apps()[entry].name : entry.slice(FOLDER_PREFIX.length);
  }

  /**
   * 右键菜单：打开、Dock 项（与拖放走同一个布局仓）、删除（目录应用可删，系统应用置灰）；
   * 文件夹视图里多一项「移出文件夹」。
   */
  private menuItems(id: DesktopAppId): MenuEntry[] {
    const folder = this.folderId();
    const folderItems: MenuEntry[] =
      folder ? [{ id: 'rf', label: 'Remove from Folder', run: () => this.removeFromFolder(id) }] : [];
    return [
      {
        id: 'o',
        label: 'Open',
        run: () => {
          this.overlays.closeLaunchpad();
          this.launcher.activate(id);
        }
      },
      ...folderItems,
      this.dockLayout.menuEntry(id),
      { id: 'x', label: 'Delete', disabled: !this.canDelete(id), run: () => this.askDelete(id) }
    ];
  }

  private canDelete(id: DesktopAppId): boolean {
    return id.startsWith('catalog:') && this.installed.state().apps.some(app => app.id === id);
  }

  private removeFromFolder(id: DesktopAppId): void {
    const name = this.folderId();
    const order = this.savedOrder();
    const folders = this.savedFolders();
    if (!name || !order || !folders) return;
    const next = removeFromLaunchpadFolder(folders, order, name, id);
    if (next.order !== order || next.folders !== folders) this.setLayout(next.order, next.folders);
  }

  private restore(): void {
    const storedOrder = this.preferences.get(ORDER_KEY, isLaunchpadOrder);
    const storedFolders = this.preferences.get(FOLDERS_KEY, isLaunchpadFolders);
    const fixed = reconcileLaunchpad(storedOrder ?? this.appOrder(), storedFolders ?? {}, this.appOrder());
    this.savedOrder.set(fixed.order);
    this.savedFolders.set(fixed.folders);
    /* 没存过布局时（默认顺序）不写库；存过的内容被修复过才写回，与 Dock 布局同一条规则。 */
    const repaired =
      (storedOrder !== undefined && fixed.order !== storedOrder) ||
      (storedFolders !== undefined && fixed.folders !== storedFolders);
    if (repaired) this.save(fixed.order, fixed.folders);
  }

  /** 别的标签页改了顺序或文件夹：采用库里的现状（共享，后保存的生效），修复过就写回。 */
  private adoptRemote(): void {
    const storedOrder = this.preferences.get(ORDER_KEY, isLaunchpadOrder) ?? [];
    const storedFolders = this.preferences.get(FOLDERS_KEY, isLaunchpadFolders) ?? {};
    const fixed = reconcileLaunchpad(storedOrder, storedFolders, this.appOrder());
    this.savedOrder.set(fixed.order);
    this.savedFolders.set(fixed.folders);
    if (fixed.order !== storedOrder || fixed.folders !== storedFolders) this.save(fixed.order, fixed.folders);
  }

  private setLayout(order: LaunchpadOrder, folders: LaunchpadFolders): void {
    this.savedOrder.set(order);
    this.savedFolders.set(folders);
    this.save(order, folders);
  }

  private save(order: LaunchpadOrder, folders: LaunchpadFolders): void {
    this.preferences.set(ORDER_KEY, order).catch(() => this.toast.show('shell.toast.launchpadLayoutFailed'));
    this.preferences.set(FOLDERS_KEY, folders).catch(() => undefined);
  }

  /** 松手落在网格里：拖到另一个应用上合成文件夹、拖进文件夹瓦片、拖到空位重排；搜索过滤时不动。 */
  private resolveDrop(x: number, y: number, dragged: DesktopAppId): void {
    if (this.query()) return;
    const order = this.savedOrder();
    const folders = this.savedFolders();
    if (!order || !folders) return;
    const grid = this.gridBox().nativeElement;
    const gridRect = grid.getBoundingClientRect();
    if (x < gridRect.left || x >= gridRect.right || y < gridRect.top || y >= gridRect.bottom) return;
    const rects = [...grid.querySelectorAll<HTMLElement>('[data-app]')].map(tile => {
      const rect = tile.getBoundingClientRect();
      return {
        key: tile.getAttribute('data-app') ?? '',
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom
      };
    });
    if (!rects.length) return;
    const drop = resolveLaunchpadDrop(rects, x, y);
    const name = this.folderId();
    const start = this.page() * LAUNCHPAD_PER_PAGE;
    if (drop.kind === 'tile') {
      if (drop.key === dragged) return;
      if (drop.key.startsWith(FOLDER_PREFIX)) {
        if (name) return;
        const next = addToLaunchpadFolder(folders, order, dragged, drop.key.slice(FOLDER_PREFIX.length));
        if (next.order !== order || next.folders !== folders) this.setLayout(next.order, next.folders);
        return;
      }
      const target = drop.key as DesktopAppId;
      if (name) {
        const list = folders[name] ?? [];
        const moved = moveLaunchpadEntry(list, dragged, list.indexOf(target));
        if (moved !== list) this.setLayout(order, { ...folders, [name]: moved });
        return;
      }
      const next = createLaunchpadFolder(folders, order, dragged, target);
      if (next.order !== order || next.folders !== folders) this.setLayout(next.order, next.folders);
      return;
    }
    /* 空位只在瓦片群上下各半个行距的范围内才算数，防止随手松手把应用挪走。 */
    if (this.outsideRows(rects, y)) return;
    if (name) {
      const list = folders[name] ?? [];
      const moved = moveLaunchpadEntry(list, dragged, start + drop.index);
      if (moved !== list) this.setLayout(order, { ...folders, [name]: moved });
    } else {
      const moved = moveLaunchpadEntry(order, dragged, start + drop.index);
      if (moved !== order) this.setLayout(moved, folders);
    }
  }

  private outsideRows(rects: readonly LaunchpadTileRect[], y: number): boolean {
    const first = rects[0];
    const last = rects[rects.length - 1];
    const rows = Math.ceil(rects.length / LAUNCHPAD_COLS);
    const gap =
      rows > 1 ? rects[Math.min(LAUNCHPAD_COLS, rects.length - 1)].top - first.bottom : first.bottom - first.top;
    return y < first.top - gap / 2 || y > last.bottom + gap / 2;
  }

  private endDragWatch(): void {
    if (!this.drag) return;
    this.drag = null;
    this.document.removeEventListener('pointerup', this.onDragUp, true);
    this.document.removeEventListener('pointercancel', this.onDragCancel, true);
    this.document.removeEventListener('keydown', this.onDragKey, true);
  }

  private readonly onDragUp = (event: Event): void => {
    const pointer = event as PointerEvent;
    if (this.drag) {
      this.drag.x = pointer.clientX;
      this.drag.y = pointer.clientY;
    }
  };

  private readonly onDragCancel = (): void => {
    if (this.drag) this.drag.cancelled = true;
  };

  private readonly onDragKey = (event: Event): void => {
    if ((event as KeyboardEvent).key === 'Escape') this.onDragCancel();
  };
}
