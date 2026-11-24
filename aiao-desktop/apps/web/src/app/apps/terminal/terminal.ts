import {
  Component,
  DestroyRef,
  ElementRef,
  ViewEncapsulation,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
  viewChildren
} from '@angular/core';

import { toVmPath } from '../../disk/disk-path';
import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { MenuEntry } from '../../services/menu';
import { PopoverService } from '../../services/popover';
import { Toast } from '../../services/toast';
import { WindowManager } from '../../services/window-manager';
import { clamp } from '../../shared/format';
import { TrafficLights } from '../../shared/traffic-lights';
import { SHELL_HOME } from '../../vm/virtual-machine';
import { TerminalTab } from './terminal-tab';

interface ShellTab {
  readonly id: number;
  readonly cwd: string;
  readonly focusOnMount: boolean;
  readonly title: string;
}

/** 标签的默认标题。 */
const DEFAULT_TITLE = 'Local shell';

/** 字号范围（CSS 像素），⌘+/⌘- 每次加减 1。 */
const FONT_MIN = 8;
const FONT_MAX = 24;

/** 终端：xterm 接到浏览器内 Vivari 的真实 shell，看到的是同一块 Macintosh HD；支持多标签、字号调整与右键菜单。 */
@Component({
  selector: 'app-terminal',
  imports: [TrafficLights, TerminalTab],
  styleUrl: './terminal.scss',
  encapsulation: ViewEncapsulation.None,
  host: { style: 'display: contents' },
  template: `
    <div class="tb dark" data-drag>
      <div class="title">Terminal — local shell</div>
      <div class="tbz"><app-traffic-lights /></div>
      <div class="grow"></div>
      <div class="tbz"></div>
    </div>
    <div class="term xterm-host" #host (contextmenu)="termMenu($event)" data-terminal>
      <div class="tm-tabs">
        @for (tab of tabs(); track tab.id; let i = $index) {
          @if (renaming() !== i) {
            <button
              class="tm-tab"
              [attr.data-ti]="i"
              [class.on]="i === activeIndex()"
              (click)="activeIndex.set(i)"
              (dblclick)="startRename(i)"
              type="button"
            >
              <span class="tm-tab-title">{{ tab.title }}</span><span
                class="x"
                (click)="closeTab($event, i)"
                (keydown.enter)="closeTab($event, i)"
                tabindex="-1"
                >×</span
              >
            </button>
          } @else {
            <input
              #renameField
              [value]="tab.title"
              (blur)="commitRename($event)"
              (keydown.enter)="commitRename($event)"
              (keydown.escape)="cancelRename()"
              aria-label="Rename tab"
              spellcheck="false"
              style="
                height: 23px;
                max-width: 180px;
                padding: 0 10px;
                border: 0;
                border-radius: 6px 6px 0 0;
                background: #1b1b1d;
                color: rgba(255, 255, 255, 0.92);
                font: inherit;
                font-size: 11.5px;
                outline: 0;
              "
            />
          }
        }
        <button class="tm-tab tm-new-tab" (click)="newTab()" title="New Tab" type="button">+</button>
      </div>
      <div class="xterm-panels">
        @for (tab of tabs(); track tab.id; let i = $index) {
          <app-terminal-tab
            [active]="i === activeIndex()"
            [cwd]="tab.cwd"
            [focusOnMount]="tab.focusOnMount"
            [fontSize]="fontSize()"
          />
        }
      </div>
    </div>
  `
})
export class TerminalApp {
  private readonly win = inject(DesktopWindow);
  private readonly wm = inject(WindowManager);
  private readonly toast = inject(Toast);
  private readonly popover = inject(PopoverService);
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private readonly panels = viewChildren(TerminalTab);
  private readonly destroyRef = inject(DestroyRef);
  private seq = 1;

  protected readonly tabs = signal<readonly ShellTab[]>([
    {
      id: 1,
      cwd: this.win.options.cwd ? toVmPath(this.win.options.cwd) : SHELL_HOME,
      focusOnMount: !this.win.quiet,
      title: DEFAULT_TITLE
    }
  ]);
  protected readonly activeIndex = signal(0);
  protected readonly fontSize = signal(12.5);
  /** 正在内联改名的标签下标；null 表示没有。 */
  protected readonly renaming = signal<number | null>(null);
  protected readonly renameField = viewChild<ElementRef<HTMLInputElement>>('renameField');

  constructor() {
    const menus = inject(DesktopMenus);
    this.win.setMenus(
      computed(() =>
        menus.standard(
          'terminal',
          {
            Shell: [
              { id: 'nt', label: 'New Tab', key: '⌘T', run: () => this.newTab() },
              { id: 'nw', label: 'New Window', key: '⌘N', run: () => this.wm.open('terminal', { force: true }) },
              '-',
              { id: 'ct', label: 'Close Tab', key: '⌘W', run: () => this.closeTabAt(this.activeIndex()) },
              '-',
              { id: 'nxt', label: 'Next Tab', key: '⇧⌘]', alternateKey: '⌃⇥', run: () => this.stepTab(1) },
              { id: 'prv', label: 'Previous Tab', key: '⇧⌘[', alternateKey: '⌃⇧⇥', run: () => this.stepTab(-1) },
              '-',
              { id: 'big', label: 'Bigger Text', key: '⌘+', run: () => this.resizeFont(1) },
              { id: 'sml', label: 'Smaller Text', key: '⌘-', run: () => this.resizeFont(-1) },
              '-',
              { id: 'rn', label: 'Rename Tab', run: () => this.startRename(this.activeIndex()) },
              '-',
              { id: 'cl', label: 'Clear Scrollback', key: '⌘K', run: () => this.active()?.clearScrollback() }
            ],
            Edit: [
              { id: 'c', label: 'Copy', key: '⌘C' },
              { id: 'v', label: 'Paste', key: '⌘V' },
              '-',
              { id: 'f', label: 'Find…', key: '⌘F', disabled: true }
            ]
          },
          ['Shell', 'Edit', 'View', 'Window', 'Help']
        )
      )
    );
    afterNextRender(() => {
      const observer = new ResizeObserver(() => this.active()?.fit());
      observer.observe(this.host().nativeElement);
      this.destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  protected newTab(): void {
    this.tabs.update(tabs => [...tabs, { id: ++this.seq, cwd: SHELL_HOME, focusOnMount: true, title: DEFAULT_TITLE }]);
    this.activeIndex.set(this.tabs().length - 1);
  }

  /** 关掉最后一个标签就关窗口。 */
  protected closeTab(event: Event, index: number): void {
    event.stopPropagation();
    this.closeTabAt(index);
  }

  protected closeTabAt(index: number): void {
    const tabs = this.tabs();
    if (tabs.length === 1) {
      this.wm.close(this.win.id);
      return;
    }
    this.tabs.set(tabs.filter((_, i) => i !== index));
    this.activeIndex.set(Math.min(this.activeIndex(), tabs.length - 2));
  }

  /** ⌃⇥ / ⇧⌃⇥：循环切换标签。 */
  protected stepTab(delta: 1 | -1): void {
    const count = this.tabs().length;
    if (count < 2) return;
    this.activeIndex.update(index => (index + delta + count) % count);
  }

  /** 双击标签改名：换成内联输入框。 */
  protected startRename(index: number): void {
    this.activeIndex.set(index);
    this.renaming.set(index);
    setTimeout(() => this.renameField()?.nativeElement.focus(), 0);
  }

  protected commitRename(event: Event): void {
    const at = this.renaming();
    if (at === null) return;
    const title = (event.target as HTMLInputElement).value.trim() || DEFAULT_TITLE;
    this.renaming.set(null);
    this.tabs.update(tabs => tabs.map((tab, index) => (index === at ? { ...tab, title } : tab)));
  }

  protected cancelRename(): void {
    this.renaming.set(null);
  }

  /** 标签栏与终端区的右键菜单；xterm 的输入辅助 textarea 保留浏览器的原生菜单。 */
  protected termMenu(event: MouseEvent): void {
    const target = event.target as Element;
    if (target.closest('input, textarea, [contenteditable="true"]')) return;
    const tab = target.closest<HTMLElement>('.tm-tab');
    const at = tab ? Number(tab.dataset['ti']) : NaN;
    const index = Number.isInteger(at) && at >= 0 ? at : -1;
    const items: MenuEntry[] = [
      { id: 'nt', label: 'New Tab', run: () => this.newTab() },
      '-',
      { id: 'c', label: 'Copy', run: () => void this.copySelection() },
      { id: 'v', label: 'Paste', run: () => void this.pasteClipboard() },
      '-',
      { id: 'cs', label: 'Clear Scrollback', run: () => this.active()?.clearScrollback() }
    ];
    if (index >= 0) {
      items.push(
        '-',
        { id: 'rn', label: 'Rename Tab', run: () => this.startRename(index) },
        { id: 'ct', label: 'Close Tab', run: () => this.closeTabAt(index) }
      );
    }
    this.popover.contextMenu(event, items, 'terminal');
  }

  private resizeFont(delta: 1 | -1): void {
    this.fontSize.update(size => clamp(Math.round((size + delta) * 10) / 10, FONT_MIN, FONT_MAX));
    this.toast.show(`Font size ${this.fontSize()}`);
  }

  private async copySelection(): Promise<void> {
    const text = this.active()?.selection() ?? '';
    if (!text) {
      this.toast.show('Nothing to copy');
      return;
    }
    try {
      if (!navigator.clipboard) throw new DOMException('Clipboard unavailable', 'NotAllowedError');
      await navigator.clipboard.writeText(text);
      this.toast.show('Copied to clipboard');
    } catch {
      this.toast.show('Clipboard unavailable');
    }
  }

  private async pasteClipboard(): Promise<void> {
    try {
      const text = navigator.clipboard ? await navigator.clipboard.readText() : '';
      if (text) this.active()?.pasteText(text);
      else this.toast.show('Clipboard has no text');
    } catch {
      this.toast.show('Clipboard unavailable');
    }
  }

  private active(): TerminalTab | undefined {
    return this.panels()[this.activeIndex()];
  }
}
