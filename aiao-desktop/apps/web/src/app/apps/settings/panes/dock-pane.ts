import { Component, computed, inject, signal } from '@angular/core';

import { PopoverService } from '../../../services/popover';
import { DockPosition, MinimizeEffect, SystemState } from '../../../services/system-state';
import { Icon } from '../../../shared/icon';
import { Slider } from '../../../shared/slider';
import { ToggleSwitch } from '../toggle-switch';

/** Dock 尺寸滑块的取值范围：34～78px。 */
const SIZE_MIN = 34;
const SIZE_SPAN = 44;
/** 放大倍数的取值范围：1～1.9 倍。 */
const MAG_SPAN = 0.9;

const POSITION_LABELS: Readonly<Record<DockPosition, string>> = { bottom: 'Bottom', left: 'Left', right: 'Right' };
const MINIMIZE_LABELS: Readonly<Record<MinimizeEffect, string>> = { genie: 'Genie Effect', scale: 'Scale Effect' };

/** 桌面与 Dock：大小、放大、位置、自动隐藏与动画。Dock 自己监听系统状态，这里只写系统状态。 */
@Component({
  selector: 'app-dock-pane',
  imports: [Icon, Slider, ToggleSwitch],
  host: { style: 'display: contents' },
  template: `
    <div class="st-label">Dock</div>
    <div class="st-group">
      <div class="st-item">
        <div class="lb">Size</div>
        <div class="rt">
          <span style="font-size: 11px; color: var(--txt-2)">Small</span>
          <app-slider
            [value]="size()"
            (valueChange)="resize($event)"
            data-slider="dsize"
            label="Dock size"
            style="max-width: 220px"
          />
          <span style="font-size: 11px; color: var(--txt-2)">Large</span>
        </div>
      </div>
      <div class="st-item">
        <div class="lb">Magnification</div>
        <div class="rt">
          <span style="font-size: 11px; color: var(--txt-2)">Off</span>
          <app-slider
            [value]="(system.dockMag() - 1) / magSpan"
            (valueChange)="magnify($event)"
            data-slider="dmag"
            label="Magnification"
            style="max-width: 220px"
          />
          <span style="font-size: 11px; color: var(--txt-2)">Large</span>
        </div>
      </div>
      <div class="st-item">
        <div class="lb">Enable magnification</div>
        <div class="rt"><div [(appSwitch)]="system.dockMagOn" data-k="mag"></div></div>
      </div>
      <div class="st-item">
        <div class="lb">Position on screen</div>
        <div class="rt">
          <button class="btn" #pos (click)="pickPosition(pos)" data-pick="dockPosition">
            {{ positionLabel() }} <svg appIcon="g-chev-d"></svg>
          </button>
        </div>
      </div>
      <div class="st-item">
        <div class="lb">Minimise using</div>
        <div class="rt">
          <button class="btn" #fx (click)="pickMinimizeEffect(fx)" data-pick="minimizeEffect">
            {{ minimizeLabel() }} <svg appIcon="g-chev-d"></svg>
          </button>
        </div>
      </div>
      <div class="st-item">
        <div class="lb">Automatically hide and show the Dock</div>
        <div class="rt"><div [(appSwitch)]="system.dockAutoHide" data-k="autohide"></div></div>
      </div>
      <div class="st-item">
        <div class="lb">Animate opening apps</div>
        <div class="rt"><div [(appSwitch)]="system.dockAnimateOpen" data-k="anim"></div></div>
      </div>
      <div class="st-item">
        <div class="lb">Show indicators for open applications</div>
        <div class="rt"><div [(appSwitch)]="system.dockShowIndicators" data-k="ind"></div></div>
      </div>
    </div>
  `
})
export class DockPane {
  private readonly popover = inject(PopoverService);

  protected readonly system = inject(SystemState);
  protected readonly magSpan = MAG_SPAN;
  /** 滑块位置只在面板创建时取一次：Dock 尺寸取整后写回，旋钮不该跟着一格一格跳。 */
  protected readonly size = signal((this.system.dockSize() - SIZE_MIN) / SIZE_SPAN);
  protected readonly positionLabel = computed(() => POSITION_LABELS[this.system.dockPosition()]);
  protected readonly minimizeLabel = computed(() => MINIMIZE_LABELS[this.system.minimizeEffect()]);

  protected resize(fraction: number): void {
    this.size.set(fraction);
    this.system.dockSize.set(Math.round(SIZE_MIN + fraction * SIZE_SPAN));
  }

  /** 拖动放大滑块会顺带把放大打开。 */
  protected magnify(fraction: number): void {
    this.system.dockMag.set(1 + fraction * MAG_SPAN);
    this.system.dockMagOn.set(true);
  }

  protected pickPosition(anchor: Element): void {
    this.pick(anchor, POSITION_LABELS, this.system.dockPosition);
  }

  protected pickMinimizeEffect(anchor: Element): void {
    this.pick(anchor, MINIMIZE_LABELS, this.system.minimizeEffect);
  }

  /** 两个下拉都是真的菜单：选了就写回系统状态（Dock 与最小化动画即时生效），面板里的标签跟着变。 */
  private pick<T extends string>(
    anchor: Element,
    labels: Readonly<Record<T, string>>,
    current: { (): T; set(value: T): void }
  ): void {
    this.popover.menuUnder(
      anchor,
      (Object.keys(labels) as T[]).map(id => ({
        id,
        label: labels[id],
        checked: current() === id,
        run: () => current.set(id)
      }))
    );
  }
}
