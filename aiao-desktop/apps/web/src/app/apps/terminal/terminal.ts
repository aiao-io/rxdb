import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
  viewChildren
} from '@angular/core';

import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { WindowManager } from '../../services/window-manager';
import { TrafficLights } from '../../shared/traffic-lights';
import { TerminalTab } from './terminal-tab';

/** 终端：xterm 接到浏览器内 Vivari 的真实 shell，看到的是同一块 Macintosh HD；支持多标签。 */
@Component({
  selector: 'app-terminal',
  imports: [TrafficLights, TerminalTab],
  host: { style: 'display: contents' },
  template: `
    <div class="tb dark" data-drag>
      <div class="title">Terminal — local shell</div>
      <div class="tbz"><app-traffic-lights /></div>
      <div class="grow"></div>
      <div class="tbz"></div>
    </div>
    <div class="term xterm-host" #host data-terminal>
      <div class="tm-tabs">
        @for (tab of tabs(); track tab; let i = $index) {
          <button class="tm-tab" [class.on]="i === activeIndex()" (click)="activeIndex.set(i)" type="button">
            <span class="tm-tab-title">Local shell</span
            ><span class="x" (click)="closeTab($event, i)" (keydown.enter)="closeTab($event, i)" tabindex="-1">×</span>
          </button>
        }
        <button class="tm-tab tm-new-tab" (click)="newTab()" title="New Tab" type="button">+</button>
      </div>
      <div class="xterm-panels">
        @for (tab of tabs(); track tab; let i = $index) {
          <app-terminal-tab [active]="i === activeIndex()" />
        }
      </div>
    </div>
  `
})
export class TerminalApp {
  private readonly win = inject(DesktopWindow);
  private readonly wm = inject(WindowManager);
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private readonly panels = viewChildren(TerminalTab);
  private readonly destroyRef = inject(DestroyRef);
  private seq = 1;

  protected readonly tabs = signal<readonly number[]>([1]);
  protected readonly activeIndex = signal(0);

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
              { id: 'cl', label: 'Clear Scrollback', key: '⌘K', run: () => this.active()?.run('clear') }
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
    this.tabs.update(tabs => [...tabs, ++this.seq]);
    this.activeIndex.set(this.tabs().length - 1);
  }

  /** 关掉最后一个标签就关窗口。 */
  protected closeTab(event: Event, index: number): void {
    event.stopPropagation();
    const tabs = this.tabs();
    if (tabs.length === 1) {
      this.wm.close(this.win.id);
      return;
    }
    this.tabs.set(tabs.filter((_, i) => i !== index));
    this.activeIndex.set(Math.min(this.activeIndex(), tabs.length - 2));
  }

  private active(): TerminalTab | undefined {
    return this.panels()[this.activeIndex()];
  }
}
