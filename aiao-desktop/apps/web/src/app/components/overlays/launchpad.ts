import { Component, ElementRef, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';

import { AppLauncher } from '../../services/app-launcher';
import { DESKTOP_APPS, DesktopAppId, LAUNCH_ORDER } from '../../services/desktop-apps';
import { DockDragController } from '../../services/dock-drag';
import { DockLayoutStore } from '../../services/dock-layout';
import { MenuEntry } from '../../services/menu';
import { Overlays } from '../../services/overlays';
import { PopoverService } from '../../services/popover';
import { clamp } from '../../shared/format';
import { Icon } from '../../shared/icon';
import { isMenuKey } from '../../shared/menu-list';

/** 7 × 4，与真实启动台在这个高度下的网格一致。 */
export const LAUNCHPAD_PER_PAGE = 28;

/** 启动台：分页网格、搜索、方向键与横向滚轮翻页。 */
@Component({
  selector: 'app-launchpad',
  imports: [Icon],
  host: {
    id: 'lpad',
    class: 'nosel',
    '[class.out]': "overlays.launchpad() === 'closing'",
    '(pointerdown)': 'backdrop($event)',
    '(wheel)': 'wheel($event)'
  },
  template: `
    <div class="sq">
      <svg appIcon="g-search"></svg>
      <input
        #query
        (input)="search(query.value)"
        (keydown)="key($event)"
        data-lq
        placeholder="Search"
        spellcheck="false"
      />
    </div>
    <div class="grid" data-lgrid>
      @for (id of visible(); track id) {
        <div
          class="app"
          [attr.data-app]="id"
          (click)="launch(id)"
          (contextmenu)="menu($event, id)"
          (keydown)="tileKey($event, id)"
          (keydown.enter)="launch(id)"
          (keydown.space)="launchByKey($event, id)"
          (pointerdown)="dockDrag.beginFromLaunchpad($event, id)"
          role="button"
          tabindex="0"
        >
          <div class="art"><svg [appIcon]="apps[id].icon"></svg></div>
          <div class="nm">{{ apps[id].name }}</div>
        </div>
      } @empty {
        <div
          style="grid-column: 1/-1; text-align: center; color: rgba(255, 255, 255, 0.75); font-size: 14px; padding-top: 40px; text-shadow: 0 1px 3px rgba(0, 0, 0, 0.4)"
        >
          No results
        </div>
      }
    </div>
    <div class="dots" data-ldots>
      @if (pages() > 1) {
        @for (dot of dots(); track dot) {
          <i [class.on]="dot === page()"></i>
        }
      }
    </div>
  `
})
export class Launchpad {
  private readonly launcher = inject(AppLauncher);
  private readonly popover = inject(PopoverService);
  private readonly dockLayout = inject(DockLayoutStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly queryInput = viewChild.required<ElementRef<HTMLInputElement>>('query');
  private readonly query = signal('');
  private readonly matches = computed(() => {
    const q = this.query().toLowerCase();
    return q ? LAUNCH_ORDER.filter(id => this.apps[id].name.toLowerCase().includes(q)) : LAUNCH_ORDER;
  });
  private readonly requestedPage = signal(0);
  protected readonly apps = inject(DESKTOP_APPS);
  protected readonly overlays = inject(Overlays);
  protected readonly dockDrag = inject(DockDragController);

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
  }

  protected search(value: string): void {
    this.query.set(value);
    this.requestedPage.set(0);
  }

  protected key(event: KeyboardEvent): void {
    if (event.key === 'Escape') this.overlays.closeLaunchpad();
    if (event.key === 'Enter') this.host.querySelector<HTMLElement>('.app')?.click();
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
    this.popover.contextMenu(event, this.menuItems(id));
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

  private turn(delta: number): void {
    this.requestedPage.set(clamp(this.page() + delta, 0, this.pages() - 1));
  }

  /** 右键菜单：打开、Dock 项（与拖放走同一个布局仓）、删除（系统应用不能删）。 */
  private menuItems(id: DesktopAppId): MenuEntry[] {
    return [
      {
        id: 'o',
        label: 'Open',
        run: () => {
          this.overlays.closeLaunchpad();
          this.launcher.activate(id);
        }
      },
      this.dockLayout.menuEntry(id),
      { id: 'x', label: 'Delete', disabled: true }
    ];
  }
}
