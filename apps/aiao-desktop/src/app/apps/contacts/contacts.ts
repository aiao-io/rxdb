import { Component, computed, inject, signal } from '@angular/core';

import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { Icon } from '../../shared/icon';
import { TrafficLights } from '../../shared/traffic-lights';

/** [姓名, 职业, 头像颜色] */
const CONTACTS = [
  ['Anna Haro', 'Product design', '#0a84ff'],
  ['Chris Lee', 'Photographer', '#ff2d55'],
  ['Daniel Higgins', 'Engineering manager', '#ffd60a'],
  ['David Taylor', 'Motion design', '#ff9f0a'],
  ['Freda Klein', 'Architect', '#a2845e'],
  ['Hank Zakroff', 'Type designer', '#5e5ce6'],
  ['John Appleseed', 'iOS engineer', '#30d158'],
  ['Kate Bell', 'Frontend', '#64d2ff'],
  ['Mom', 'Family', '#ff375f'],
  ['Dr. Reed', 'Dentist', '#8e8e93']
] as const;

/** 通讯录：左侧姓名列表，右侧联系人卡片。 */
@Component({
  selector: 'app-contacts',
  imports: [Icon, TrafficLights],
  host: { style: 'display: contents' },
  template: `
    <div class="wb">
      <div class="sbar" data-drag style="width: 250px; padding-top: 0">
        <div class="sb-top"><app-traffic-lights /></div>
        <div style="padding: 0 10px 8px">
          <div class="sfield" data-nodrag>
            <span><svg appIcon="g-search"></svg></span>
            <input placeholder="Search" />
          </div>
        </div>
        <div style="overflow: auto; padding: 0 8px">
          @for (contact of contacts; track contact[0]; let i = $index) {
            <div
              class="si"
              [attr.data-ci2]="i"
              [class.on]="i === selected()"
              (click)="selected.set(i)"
              (keydown.enter)="selected.set(i)"
              style="height: 30px"
              tabindex="-1"
            >
              <span class="nm">{{ contact[0] }}</span>
            </div>
          }
        </div>
      </div>
      <div class="wmain">
        <div class="tbar" data-drag style="height: 52px"></div>
        <div class="scroll" data-cbody2 style="flex: 1; padding: 26px">
          @let person = current();
          <div style="display: flex; gap: 18px; align-items: center">
            <div
              [style.background]="person[2]"
              style="
                width: 88px;
                height: 88px;
                border-radius: 50%;
                display: grid;
                place-items: center;
                color: #fff;
                font-size: 34px;
                font-weight: 600;
              "
            >
              {{ person[0][0] }}
            </div>
            <div>
              <div style="font-size: 25px; font-weight: 600; letter-spacing: -0.02em">{{ person[0] }}</div>
              <div style="font-size: 13px; color: var(--txt-2)">{{ person[1] }}</div>
            </div>
          </div>
          <div style="margin-top: 24px; max-width: 420px">
            @for (field of fields(); track field[0]) {
              <div style="display: flex; gap: 16px; padding: 8px 0; border-top: 0.5px solid var(--line)">
                <span style="width: 60px; text-align: right; font-size: 11.5px; color: var(--txt-2)">{{
                  field[0]
                }}</span>
                <span style="font-size: 13px; color: var(--blue)">{{ field[1] }}</span>
              </div>
            }
          </div>
        </div>
      </div>
    </div>
  `
})
export class ContactsApp {
  protected readonly contacts = CONTACTS;
  protected readonly selected = signal(0);
  protected readonly current = computed(() => CONTACTS[this.selected()]);
  protected readonly fields = computed(
    () =>
      [
        ['email', `${this.current()[0].split(' ')[0].toLowerCase()}@example.com`],
        ['home', 'Cupertino, CA']
      ] as const
  );

  constructor() {
    const menus = inject(DesktopMenus);
    inject(DesktopWindow).setMenus(computed(() => menus.standard('contacts')));
  }
}
