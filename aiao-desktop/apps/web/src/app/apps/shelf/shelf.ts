import { Component, computed, inject } from '@angular/core';

import { liveQuery } from '../../data/live-query';
import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { Icon } from '../../shared/icon';
import { PhotoArt } from '../../shared/photo-art';
import { TrafficLights } from '../../shared/traffic-lights';
import { SHELF_APPS, SHELF_TITLES, ShelfAppId } from './shelf-data';
import { ShelfItem, ShelfSection } from './shelf.entities';

/** 取出窗口对应的书架应用 id；不是书架应用就直接报错。 */
function shelfAppOf(win: DesktopWindow): ShelfAppId {
  const id = SHELF_APPS.find(app => app === win.appId);
  if (!id) throw new Error(`${win.appId} 不是媒体书架应用`);
  return id;
}

const appIs = (app: ShelfAppId) => ({
  combinator: 'and' as const,
  rules: [{ field: 'app' as const, operator: '=' as const, value: app }]
});

/**
 * 媒体书架：播客、电视、图书与 App Store 共用一个窗口，内容由窗口的应用 id 决定。
 * 各行与条目来自本地库，同一个应用的所有窗口共用。
 */
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
      <h2 style="margin: 0 0 3px; font-size: 24px; font-weight: 700; letter-spacing: -0.025em">{{ title }}</h2>
      <div style="font-size: 12.5px; color: var(--txt-2); margin-bottom: 18px">{{ subtitle() }}</div>
      @for (row of rows(); track row.id) {
        <div style="margin-bottom: 26px">
          <div style="display: flex; align-items: baseline; gap: 8px; margin-bottom: 11px">
            <h3 style="margin: 0; font-size: 16px; font-weight: 650; letter-spacing: -0.015em">{{ row.head }}</h3>
            <span style="font-size: 11.5px; color: var(--blue)">See All</span>
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 16px 14px">
            @for (item of row.items; track item.id) {
              <div class="alb">
                <div class="cv" [style.aspect-ratio]="row.ratio" style="border-radius: 8px">
                  <app-photo-art [index]="item.cover" />
                  <span class="pl"><svg appIcon="g-play"></svg></span>
                </div>
                <b>{{ item.title }}</b>
                <span>{{ item.detail }}</span>
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
  private readonly shelf = shelfAppOf(this.win);
  private readonly sections = liveQuery(
    () => ShelfSection.findAll({ where: appIs(this.shelf), orderBy: [{ field: 'position', sort: 'asc' }] }),
    []
  );
  private readonly items = liveQuery(
    () => ShelfItem.findAll({ where: appIs(this.shelf), orderBy: [{ field: 'position', sort: 'asc' }] }),
    []
  );

  protected readonly name = this.win.app.name;
  protected readonly title = SHELF_TITLES[this.shelf];
  /** 页面顶部的副标题：第一行的副标题。 */
  protected readonly subtitle = computed(() => this.sections().at(0)?.note ?? '');
  /** 一行一行的内容，每行带它名下的全部条目。 */
  protected readonly rows = computed(() => {
    const items = this.items();
    return this.sections().map(section => ({
      id: section.id,
      head: section.heading,
      ratio: section.ratio,
      items: items
        .filter(item => item.sectionId === section.id)
        .map(item => ({ id: item.id, title: item.title, detail: item.detail, cover: item.cover }))
    }));
  });

  constructor() {
    const menus = inject(DesktopMenus);
    this.win.setMenus(computed(() => menus.standard(this.win.appId)));
  }
}
