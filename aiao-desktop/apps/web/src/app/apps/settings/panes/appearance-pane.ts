import { Component, WritableSignal, computed, inject, output } from '@angular/core';

import { PopoverService } from '../../../services/popover';
import {
  AccentKey,
  Appearance,
  HighlightKey,
  ScrollbarPolicy,
  SidebarIconSize,
  SystemState
} from '../../../services/system-state';
import { ACCENTS, ACCENT_KEYS, ThemeService, accentHex } from '../../../services/theme';
import { Icon } from '../../../shared/icon';
import { ToggleSwitch } from '../toggle-switch';

const MULTICOLOUR = 'conic-gradient(from 210deg,#ff375f,#ff9f0a,#ffd60a,#30d158,#0a84ff,#bf5af2,#ff375f)';

/** 「跟随强调色」排在高亮色最前面，其余顺序与强调色一致。 */
const HIGHLIGHT_KEYS: readonly HighlightKey[] = ['accent', ...(ACCENT_KEYS.slice(1) as Exclude<AccentKey, 'multi'>[])];

const SIDEBAR_SIZES: Readonly<Record<SidebarIconSize, string>> = { small: 'Small', medium: 'Medium', large: 'Large' };
const SCROLLBAR_POLICIES: Readonly<Record<ScrollbarPolicy, string>> = {
  auto: 'Automatically',
  scrolling: 'When scrolling',
  always: 'Always'
};

/** 浅色、深色两张缩略图；自动那张是左浅右深的对半图，直接写在模板里。 */
const SWATCHES = [
  {
    mode: 'light',
    label: 'Light',
    background: 'linear-gradient(160deg,#a8d8ea,#3a91b8)',
    bar: 'rgba(255,255,255,.62)',
    window: '#fff',
    dock: 'rgba(255,255,255,.55)'
  },
  {
    mode: 'dark',
    label: 'Dark',
    background: 'linear-gradient(160deg,#243b55,#0d1b2a)',
    bar: 'rgba(30,30,32,.7)',
    window: '#2c2c2e',
    dock: 'rgba(255,255,255,.16)'
  }
] as const;

/** 外观：浅色/深色/自动、强调色、高亮色、侧栏图标大小与滚动条。 */
@Component({
  selector: 'app-appearance-pane',
  imports: [Icon, ToggleSwitch],
  host: { style: 'display: contents' },
  template: `
    <div class="st-group">
      <div class="st-appear">
        @for (swatch of swatches; track swatch.mode) {
          <div
            class="opt"
            [attr.data-appear]="swatch.mode"
            [class.on]="system.appearance() === swatch.mode"
            (click)="choose(swatch.mode)"
            (keydown.enter)="choose(swatch.mode)"
            tabindex="-1"
          >
            <div class="sw2" [style.background]="swatch.background">
              <div class="bar" [style.background]="swatch.bar"></div>
              <div
                class="wn"
                [style.background]="swatch.window"
                style="box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25)"
              ></div>
              <div class="dk" [style.background]="swatch.dock"></div>
            </div>
            <span>{{ swatch.label }}</span>
          </div>
        }
        <div
          class="opt"
          [class.on]="system.appearance() === 'auto'"
          (click)="choose('auto')"
          (keydown.enter)="choose('auto')"
          data-appear="auto"
          tabindex="-1"
        >
          <div class="sw2" style="background: linear-gradient(110deg, #a8d8ea 0 50%, #243b55 50% 100%)">
            <div
              class="bar"
              style="background: linear-gradient(110deg, rgba(255, 255, 255, 0.62) 0 50%, rgba(30, 30, 32, 0.7) 50%)"
            ></div>
            <div class="wn" style="background: linear-gradient(110deg, #fff 0 50%, #2c2c2e 50%)"></div>
          </div>
          <span>Auto</span>
        </div>
      </div>
    </div>
    <div class="st-group">
      <div class="st-item">
        <div class="lb">Accent colour</div>
        <div class="rt">
          <div class="accs">
            @for (dot of accentDots(); track dot.key) {
              <span
                class="acc"
                [attr.data-accent]="dot.key"
                [class.on]="system.accent() === dot.key"
                [style.background]="dot.background"
                [title]="dot.name"
                (click)="setAccent(dot.key)"
                (keydown.enter)="setAccent(dot.key)"
                tabindex="-1"
              ></span>
            }
          </div>
        </div>
      </div>
      <div class="st-item">
        <div class="lb">Highlight colour</div>
        <div class="rt">
          <div class="accs">
            @for (dot of highlightDots(); track dot.key) {
              <span
                class="acc"
                [attr.data-hilite]="dot.key"
                [class.on]="system.highlight() === dot.key"
                [style.background]="dot.background"
                [title]="dot.name"
                (click)="setHighlight(dot.key)"
                (keydown.enter)="setHighlight(dot.key)"
                tabindex="-1"
              ></span>
            }
          </div>
        </div>
      </div>
      <div class="st-item">
        <div class="lb">Sidebar icon size</div>
        <div class="rt">
          <button class="btn" #sizes (click)="pickSidebarIcons(sizes)" data-pick="sidebarIcons">
            {{ sidebarIconLabel() }} <svg appIcon="g-chev-d"></svg>
          </button>
        </div>
      </div>
      <div class="st-item">
        <div class="lb">Allow wallpaper tinting</div>
        <div class="rt"><div [appSwitch]="true" data-k="tint"></div></div>
      </div>
      <div class="st-item">
        <div class="lb">Show scroll bars</div>
        <div class="rt">
          <button class="btn" #bars (click)="pickScrollbars(bars)" data-pick="scrollbars">
            {{ scrollbarLabel() }} <svg appIcon="g-chev-d"></svg>
          </button>
        </div>
      </div>
    </div>
    <div class="hint" style="margin: -8px 0 0 4px">
      {{
        system.appearance() === 'auto' ?
          'Auto switches between light and dark as the day goes by.'
        : 'Accent colour applies to buttons, controls and selections.'
      }}
    </div>
  `
})
export class AppearancePane {
  private readonly theme = inject(ThemeService);
  private readonly popover = inject(PopoverService);

  protected readonly system = inject(SystemState);
  protected readonly swatches = SWATCHES;
  protected readonly accentDots = computed(() =>
    ACCENT_KEYS.map(key => ({
      key,
      name: ACCENTS[key].name,
      background: accentHex(ACCENTS[key], this.system.theme()) ?? MULTICOLOUR
    }))
  );
  protected readonly highlightDots = computed(() =>
    HIGHLIGHT_KEYS.map(key =>
      key === 'accent' ?
        { key, name: 'Accent Colour', background: 'var(--blue)' }
      : { key, name: ACCENTS[key].name, background: accentHex(ACCENTS[key], this.system.theme())! }
    )
  );
  protected readonly sidebarIconLabel = computed(() => SIDEBAR_SIZES[this.system.sidebarIcons()]);
  protected readonly scrollbarLabel = computed(() => SCROLLBAR_POLICIES[this.system.scrollbars()]);

  /** 选了外观、颜色或菜单项后面板整块重绘（原来的行为），只改外观的开关会回到初始值。 */
  readonly rerender = output<void>();

  protected choose(mode: Appearance): void {
    this.theme.setAppearance(mode);
    this.rerender.emit();
  }

  protected setAccent(key: AccentKey): void {
    this.theme.setAccent(key);
    this.rerender.emit();
  }

  protected setHighlight(key: HighlightKey): void {
    this.theme.setHighlight(key);
    this.rerender.emit();
  }

  protected pickSidebarIcons(anchor: Element): void {
    this.pick(anchor, SIDEBAR_SIZES, this.system.sidebarIcons);
  }

  protected pickScrollbars(anchor: Element): void {
    this.pick(anchor, SCROLLBAR_POLICIES, this.system.scrollbars);
  }

  /** 这两个按钮都是真的菜单，选了就写回系统状态（根元素的属性由主题服务同步）。 */
  private pick<T extends string>(
    anchor: Element,
    labels: Readonly<Record<T, string>>,
    current: WritableSignal<T>
  ): void {
    this.popover.menuUnder(
      anchor,
      (Object.keys(labels) as T[]).map(id => ({
        id,
        label: labels[id],
        checked: current() === id,
        run: () => {
          current.set(id);
          this.rerender.emit();
        }
      }))
    );
  }
}
