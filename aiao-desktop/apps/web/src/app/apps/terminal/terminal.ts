import { useI18n } from '@aiao/rxdb-i18n-angular';
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

/** 标签的默认标题（i18n key）。 */
const DEFAULT_TITLE_KEY = 'apps.terminal.localShell';

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
      <div class="title">{{ i18n.t('apps.terminal.windowTitle') }}</div>
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
              [attr.aria-label]="i18n.t('apps.terminal.renameTabAria')"
              [value]="tab.title"
              (blur)="commitRename($event)"
              (keydown.enter)="commitRename($event)"
              (keydown.escape)="cancelRename()"
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
        <button class="tm-tab tm-new-tab" [title]="i18n.t('apps.terminal.newTab')" (click)="newTab()" type="button">
          +
        </button>
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
  protected readonly i18n = useI18n();

  protected readonly tabs = signal<readonly ShellTab[]>([
    {
      id: 1,
      cwd: this.win.options.cwd ? toVmPath(this.win.options.cwd) : SHELL_HOME,
      focusOnMount: !this.win.quiet,
      title: this.i18n.t(DEFAULT_TITLE_KEY)
    }
  ]);
  protected readonly activeIndex = signal(0);
  protected readonly fontSize = signal(12.5);
  /** 正在内联改名的标签下标；null 表示没有。 */
  protected readonly renaming = signal<number | null>(null);
  protected readonly renameField = viewChild<ElementRef<HTMLInputElement>>('renameField');

  constructor() {
    const menus = inject(DesktopMenus);
    /* 菜单名就是 standard() 的合并键：覆盖与顺序都要用翻译后的分区名。 */
    const shell = this.i18n.t('apps.terminal.sectionShell');
    const edit = this.i18n.t('shell.menu.sectionEdit');
    const view = this.i18n.t('shell.menu.sectionView');
    const windowSection = this.i18n.t('shell.menu.sectionWindow');
    const help = this.i18n.t('shell.menu.sectionHelp');
    this.win.setMenus(
      computed(() =>
        menus.standard(
          'terminal',
          {
            [shell]: [
              { id: 'nt', label: this.i18n.t('apps.terminal.newTab'), key: '⌘T', run: () => this.newTab() },
              {
                id: 'nw',
                label: this.i18n.t('shell.menu.newWindow'),
                key: '⌘N',
                run: () => this.wm.open('terminal', { force: true })
              },
              '-',
              {
                id: 'ct',
                label: this.i18n.t('apps.terminal.closeTab'),
                key: '⌘W',
                run: () => this.closeTabAt(this.activeIndex())
              },
              '-',
              {
                id: 'nxt',
                label: this.i18n.t('apps.terminal.nextTab'),
                key: '⇧⌘]',
                alternateKey: '⌃⇥',
                run: () => this.stepTab(1)
              },
              {
                id: 'prv',
                label: this.i18n.t('apps.terminal.previousTab'),
                key: '⇧⌘[',
                alternateKey: '⌃⇧⇥',
                run: () => this.stepTab(-1)
              },
              '-',
              { id: 'big', label: this.i18n.t('apps.terminal.biggerText'), key: '⌘+', run: () => this.resizeFont(1) },
              { id: 'sml', label: this.i18n.t('apps.terminal.smallerText'), key: '⌘-', run: () => this.resizeFont(-1) },
              '-',
              {
                id: 'rn',
                label: this.i18n.t('apps.terminal.renameTab'),
                run: () => this.startRename(this.activeIndex())
              },
              '-',
              {
                id: 'cl',
                label: this.i18n.t('apps.terminal.clearScrollback'),
                key: '⌘K',
                run: () => this.active()?.clearScrollback()
              }
            ],
            [edit]: [
              { id: 'c', label: this.i18n.t('shell.menu.copy'), key: '⌘C' },
              { id: 'v', label: this.i18n.t('shell.menu.paste'), key: '⌘V' },
              '-',
              { id: 'f', label: this.i18n.t('apps.terminal.find'), key: '⌘F', disabled: true }
            ]
          },
          [shell, edit, view, windowSection, help]
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
    this.tabs.update(tabs => [
      ...tabs,
      { id: ++this.seq, cwd: SHELL_HOME, focusOnMount: true, title: this.i18n.t(DEFAULT_TITLE_KEY) }
    ]);
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
    const title = (event.target as HTMLInputElement).value.trim() || this.i18n.t(DEFAULT_TITLE_KEY);
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
      { id: 'nt', label: this.i18n.t('apps.terminal.newTab'), run: () => this.newTab() },
      '-',
      { id: 'c', label: this.i18n.t('shell.menu.copy'), run: () => void this.copySelection() },
      { id: 'v', label: this.i18n.t('shell.menu.paste'), run: () => void this.pasteClipboard() },
      '-',
      { id: 'cs', label: this.i18n.t('apps.terminal.clearScrollback'), run: () => this.active()?.clearScrollback() }
    ];
    if (index >= 0) {
      items.push(
        '-',
        { id: 'rn', label: this.i18n.t('apps.terminal.renameTab'), run: () => this.startRename(index) },
        { id: 'ct', label: this.i18n.t('apps.terminal.closeTab'), run: () => this.closeTabAt(index) }
      );
    }
    this.popover.contextMenu(event, items, this.i18n.t('apps.terminal.actions'));
  }

  private resizeFont(delta: 1 | -1): void {
    this.fontSize.update(size => clamp(Math.round((size + delta) * 10) / 10, FONT_MIN, FONT_MAX));
    this.toast.show(this.i18n.t('apps.terminal.fontSize', { size: String(this.fontSize()) }));
  }

  private async copySelection(): Promise<void> {
    const text = this.active()?.selection() ?? '';
    if (!text) {
      this.toast.show(this.i18n.t('apps.terminal.nothingToCopy'));
      return;
    }
    try {
      if (!navigator.clipboard) throw new DOMException('Clipboard unavailable', 'NotAllowedError');
      await navigator.clipboard.writeText(text);
      this.toast.show(this.i18n.t('shell.toast.copied'));
    } catch {
      this.toast.show(this.i18n.t('apps.terminal.clipboardUnavailable'));
    }
  }

  private async pasteClipboard(): Promise<void> {
    try {
      const text = navigator.clipboard ? await navigator.clipboard.readText() : '';
      if (text) this.active()?.pasteText(text);
      else this.toast.show(this.i18n.t('apps.terminal.clipboardNoText'));
    } catch {
      this.toast.show(this.i18n.t('apps.terminal.clipboardUnavailable'));
    }
  }

  private active(): TerminalTab | undefined {
    return this.panels()[this.activeIndex()];
  }
}
