import { findMenuPath } from '@aiao/rxdb-admin';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild
} from '@angular/core';
import { LucideDynamicIcon, LucideHistory, LucidePin, LucideX } from '@lucide/angular';
import { injectAdminShell, injectAdminStore, injectAdminText } from '../context';
import { interceptNavigation } from '../layout/intercept-navigation';
import { AdminTabContextMenuComponent, type TabMenuAnchor } from './tab-context-menu.component';

/**
 * 页签栏：多页签、固定、拖拽 / 键盘排序、右键菜单、中键关闭、滚轮横向滚动。偏好关闭或还没有页签时不渲染。
 */
@Component({
  selector: 'rxdb-admin-tabbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AdminTabContextMenuComponent, LucideDynamicIcon],
  host: { style: 'display: contents' },
  templateUrl: './tabbar.component.html'
})
export class AdminTabbarComponent {
  readonly #shell = injectAdminShell();
  readonly #injector = inject(Injector);

  private readonly scroller = viewChild<ElementRef<HTMLUListElement>>('scroller');

  protected readonly t = injectAdminText();
  protected readonly layout = injectAdminStore(this.#shell.layout);
  protected readonly prefs = injectAdminStore(this.#shell.preferences);
  protected readonly tabsState = injectAdminStore(this.#shell.tabs);
  protected readonly menu = injectAdminStore(this.#shell.menu);
  protected readonly tabbar = computed(() => this.prefs().tabbar);
  protected readonly visible = computed(() => this.layout().showTabbar && this.tabsState().tabs.length > 0);
  /** 访问历史里仍然开着的页签，最近访问的在前。 */
  protected readonly titled = computed(() => {
    const { tabs, history } = this.tabsState();
    return history.flatMap(key => {
      const tab = tabs.find(candidate => candidate.key === key);
      return tab ? [tab] : [];
    });
  });
  /** 页签图标取自它所在地址对应的菜单节点。 */
  protected readonly icons = computed(
    () => new Map(this.tabsState().tabs.map(tab => [tab.key, findMenuPath(this.menu(), tab.url).at(-1)?.icon] as const))
  );
  protected readonly anchor = signal<TabMenuAnchor | null>(null);
  protected readonly dragKey = signal<string | null>(null);
  protected readonly dropKey = signal<string | null>(null);
  protected readonly History = LucideHistory;
  protected readonly Pin = LucidePin;
  protected readonly X = LucideX;

  protected closeMenu(): void {
    this.anchor.set(null);
  }

  protected close(key: string): void {
    this.#shell.closeTab(key);
  }

  protected activate(event: MouseEvent, key: string): void {
    interceptNavigation(event, () => this.#shell.activateTab(key));
  }

  protected onContextMenu(event: MouseEvent, key: string): void {
    event.preventDefault();
    this.#openMenu(key, event.clientX, event.clientY);
  }

  protected onKeyDown(event: KeyboardEvent, key: string, index: number): void {
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      event.preventDefault();
      const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
      this.#openMenu(key, box.left, box.bottom);
    } else if (this.tabbar().draggable && event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      this.#shell.tabs.reorder(key, index + (event.key === 'ArrowLeft' ? -1 : 1));
      this.#refocus(key);
    }
  }

  protected onMouseDown(event: MouseEvent): void {
    if (event.button === 1 && this.tabbar().middleClickToClose) event.preventDefault();
  }

  protected onAuxClick(event: MouseEvent, key: string, pinned: boolean): void {
    if (event.button === 1 && this.tabbar().middleClickToClose && !pinned) {
      event.preventDefault();
      this.#shell.closeTab(key);
    }
  }

  protected onDragStart(event: DragEvent, key: string): void {
    event.dataTransfer?.setData('text/plain', key);
    this.dragKey.set(key);
  }

  protected onDragOver(event: DragEvent, key: string): void {
    if (this.dragKey() === null) return;
    event.preventDefault();
    this.dropKey.set(key);
  }

  protected onDrop(event: DragEvent, target: string): void {
    event.preventDefault();
    const source = this.dragKey();
    this.dragKey.set(null);
    this.dropKey.set(null);
    const to = this.tabsState().tabs.findIndex(tab => tab.key === target);
    if (source && source !== target && to >= 0) this.#shell.tabs.reorder(source, to);
  }

  protected onDragEnd(): void {
    this.dragKey.set(null);
    this.dropKey.set(null);
  }

  protected onWheel(event: WheelEvent): void {
    if (this.tabbar().wheelable) this.scroller()?.nativeElement.scrollBy?.({ left: event.deltaY });
  }

  #openMenu(key: string, x: number, y: number): void {
    this.anchor.set({ key, x, y });
  }

  /**
   * `@for` 的 keyed 重排会把被聚焦页签的节点摘下再插回，浏览器因此让它失焦（实测：焦点掉回 body）。
   * 渲染完成后把焦点还给被移动的页签，键盘才能连续重排。
   * @param key - 被移动的页签键。
   */
  #refocus(key: string): void {
    afterNextRender(
      () => {
        const index = this.tabsState().tabs.findIndex(tab => tab.key === key);
        this.scroller()?.nativeElement.querySelectorAll<HTMLElement>('.admin-tab-title')[index]?.focus();
      },
      { injector: this.#injector }
    );
  }
}
