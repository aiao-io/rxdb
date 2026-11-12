import { Component, computed, inject } from '@angular/core';

import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { Icon } from '../../shared/icon';
import { PhotoArt } from '../../shared/photo-art';
import { TrafficLights } from '../../shared/traffic-lights';
import { SHELVES, Shelf } from './shelf-data';

/** 取出窗口对应的书架内容；不是书架应用就直接报错。 */
function shelfOf(win: DesktopWindow): Shelf {
  const shelf = SHELVES[win.appId];
  if (!shelf) throw new Error(`${win.appId} 不是媒体书架应用`);
  return shelf;
}

/** 媒体书架：播客、电视、图书与 App Store 共用一个窗口，内容由窗口的应用 id 决定。 */
@Component({
  selector: 'app-shelf',
  imports: [Icon, PhotoArt, TrafficLights],
  host: { style: 'display: contents' },
  template: `
    <div class="tb" data-drag>
      <div class="title">{{ name }}</div>
      <div class="tbz"><app-traffic-lights /></div>
      <div class="grow"></div>
      <div class="tbz">
        <div class="sfield" data-nodrag style="width: 160px">
          <span><svg appIcon="g-search"></svg></span>
          <input placeholder="Search" />
        </div>
      </div>
    </div>
    <div class="scroll" style="flex: 1; min-height: 0; padding: 18px 22px 28px; background: var(--win)">
      <h2 style="margin: 0 0 3px; font-size: 24px; font-weight: 700; letter-spacing: -0.025em">{{ shelf.title }}</h2>
      <div style="font-size: 12.5px; color: var(--txt-2); margin-bottom: 18px">{{ shelf.rows[0].sub }}</div>
      @for (row of shelf.rows; track row.head) {
        <div style="margin-bottom: 26px">
          <div style="display: flex; align-items: baseline; gap: 8px; margin-bottom: 11px">
            <h3 style="margin: 0; font-size: 16px; font-weight: 650; letter-spacing: -0.015em">{{ row.head }}</h3>
            <span style="font-size: 11.5px; color: var(--blue)">See All</span>
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 16px 14px">
            @for (item of row.items; track item[0]; let i = $index) {
              <div class="alb">
                <div class="cv" [style.aspect-ratio]="row.ratio" style="border-radius: 8px">
                  <app-photo-art [index]="i + row.seed" />
                  <span class="pl"><svg appIcon="g-play"></svg></span>
                </div>
                <b>{{ item[0] }}</b>
                <span>{{ item[1] }}</span>
              </div>
            }
          </div>
        </div>
      }
    </div>
  `
})
export class ShelfApp {
  private readonly win = inject(DesktopWindow);

  protected readonly name = this.win.app.name;
  protected readonly shelf = shelfOf(this.win);

  constructor() {
    const menus = inject(DesktopMenus);
    this.win.setMenus(computed(() => menus.standard(this.win.appId)));
  }
}
