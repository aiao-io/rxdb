import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  viewChild
} from '@angular/core';
import { injectAdminShell, injectAdminStore, injectAdminText } from '../context';

/** 右键菜单的锚点：屏幕坐标与目标页签。 */
export interface TabMenuAnchor {
  /** 屏幕 X。 */
  readonly x: number;
  /** 屏幕 Y。 */
  readonly y: number;
  /** 目标页签键。 */
  readonly key: string;
}

interface Item {
  readonly id: string;
  readonly label: string;
  readonly disabled: boolean;
  readonly run: () => void;
}

/**
 * 页签右键菜单：关闭 / 刷新 / 固定 / 新窗口 / 关闭一侧 / 关闭其他 / 关闭全部 / 内容最大化。
 * 打开后聚焦第一个可用项；Esc、点击菜单外、滚动与窗口失焦都会关闭；上下方向键在可用项之间循环。
 */
@Component({
  selector: 'rxdb-admin-tab-context-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  templateUrl: './tab-context-menu.component.html'
})
export class AdminTabContextMenuComponent {
  readonly #shell = injectAdminShell();

  private readonly menuElement = viewChild<ElementRef<HTMLElement>>('menu');

  protected readonly t = injectAdminText();
  protected readonly tabsState = injectAdminStore(this.#shell.tabs);
  protected readonly ui = injectAdminStore(this.#shell.ui);
  protected readonly prefs = injectAdminStore(this.#shell.preferences);
  protected readonly index = computed(() => this.tabsState().tabs.findIndex(tab => tab.key === this.anchor().key));
  /** 目标页签；它已被关闭时为 `undefined`，菜单随之消失。 */
  protected readonly tab = computed(() => this.tabsState().tabs[this.index()]);
  protected readonly position = computed(() => ({
    left: Math.min(this.anchor().x, window.innerWidth - 190),
    top: Math.min(this.anchor().y, window.innerHeight - 330)
  }));
  protected readonly items = computed<Item[]>(() => {
    const tab = this.tab();
    if (!tab) return [];
    const shell = this.#shell;
    const { key } = this.anchor();
    const { tabs } = this.tabsState();
    const index = this.index();
    const t = this.t;
    return [
      { id: 'close', label: t('tabbar.close'), disabled: tab.pinned, run: () => shell.closeTab(key) },
      {
        id: 'reload',
        label: t('tabbar.reload'),
        disabled: false,
        run: () => {
          shell.activateTab(key);
          shell.ui.refresh();
        }
      },
      {
        id: 'pin',
        label: tab.pinned ? t('tabbar.unpin') : t('tabbar.pin'),
        disabled: false,
        run: () => shell.tabs.togglePin(key)
      },
      { id: 'openNew', label: t('tabbar.openNew'), disabled: false, run: () => shell.openTabInNewWindow(key) },
      {
        id: 'closeLeft',
        label: t('tabbar.closeLeft'),
        disabled: !tabs.slice(0, index).some(candidate => !candidate.pinned),
        run: () => shell.closeLeftTabs(key)
      },
      {
        id: 'closeRight',
        label: t('tabbar.closeRight'),
        disabled: !tabs.slice(index + 1).some(candidate => !candidate.pinned),
        run: () => shell.closeRightTabs(key)
      },
      {
        id: 'closeOthers',
        label: t('tabbar.closeOthers'),
        disabled: tabs.filter(candidate => candidate.key !== key && !candidate.pinned).length === 0,
        run: () => shell.closeOtherTabs(key)
      },
      {
        id: 'closeAll',
        label: t('tabbar.closeAll'),
        disabled: !tabs.some(candidate => !candidate.pinned),
        run: () => shell.closeAllTabs()
      },
      ...(this.prefs().tabbar.showMaximize ?
        [
          {
            id: 'maximize',
            label: this.ui().maximized ? t('tabbar.restore') : t('tabbar.maximize'),
            disabled: false,
            run: () => shell.ui.toggleMaximize()
          }
        ]
      : [])
    ];
  });

  /** 目标页签的锚点（屏幕坐标与页签键）。 */
  readonly anchor = input.required<TabMenuAnchor>();

  /** 菜单应当关闭（选择了某项、按了 Esc、点击了菜单外、滚动或窗口失焦）。 */
  readonly closed = output<void>();

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      this.#enabledButtons()[0]?.focus();
      destroyRef.onDestroy(this.#dismissOnOutside());
    });
  }

  protected choose(item: Item): void {
    this.closed.emit();
    item.run();
  }

  protected onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closed.emit();
      return;
    }
    const delta =
      event.key === 'ArrowDown' ? 1
      : event.key === 'ArrowUp' ? -1
      : 0;
    if (delta === 0) return;
    event.preventDefault();
    const buttons = this.#enabledButtons();
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(current + delta + buttons.length) % buttons.length]?.focus();
  }

  /**
   * 点击菜单外、滚动、窗口失焦时关闭菜单。
   * @returns 移除监听的函数。
   */
  #dismissOnOutside(): () => void {
    const close = (): void => this.closed.emit();
    const dismiss = (event: Event): void => {
      if (!(event.target instanceof Node) || !this.menuElement()?.nativeElement.contains(event.target)) close();
    };
    document.addEventListener('pointerdown', dismiss, true);
    window.addEventListener('scroll', close, true);
    window.addEventListener('blur', close);
    return () => {
      document.removeEventListener('pointerdown', dismiss, true);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('blur', close);
    };
  }

  #enabledButtons(): HTMLButtonElement[] {
    return [...(this.menuElement()?.nativeElement.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [])];
  }
}
