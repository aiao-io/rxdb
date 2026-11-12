import { Component, computed, inject, signal } from '@angular/core';

import { ALL_ROWS, liveQuery } from '../../data/live-query';
import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { Icon } from '../../shared/icon';
import { TrafficLights } from '../../shared/traffic-lights';
import { Contact } from './contacts.entities';

/** 联系人卡片里的一栏：[标签, 内容]。 */
type ContactField = readonly [label: string, value: string];

/** 通讯录：左侧姓名列表，右侧联系人卡片；联系人来自桌面库，所有窗口共用。 */
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
          @for (contact of contacts(); track contact.id; let i = $index) {
            <div
              class="si"
              [attr.data-ci2]="i"
              [class.on]="contact.id === current()?.id"
              (click)="selected.set(contact.id)"
              (keydown.enter)="selected.set(contact.id)"
              style="height: 30px"
              tabindex="-1"
            >
              <span class="nm">{{ contact.name }}</span>
            </div>
          }
        </div>
      </div>
      <div class="wmain">
        <div class="tbar" data-drag style="height: 52px"></div>
        <div class="scroll" data-cbody2 style="flex: 1; padding: 26px">
          @if (current(); as person) {
            <div style="display: flex; gap: 18px; align-items: center">
              <div
                [style.background]="person.color"
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
                {{ person.name[0] }}
              </div>
              <div>
                <div style="font-size: 25px; font-weight: 600; letter-spacing: -0.02em">{{ person.name }}</div>
                <div style="font-size: 13px; color: var(--txt-2)">{{ person.role }}</div>
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
          }
        </div>
      </div>
    </div>
  `
})
export class ContactsApp {
  protected readonly contacts = liveQuery(
    () => Contact.findAll({ where: ALL_ROWS, orderBy: [{ field: 'position', sort: 'asc' }] }),
    []
  );
  protected readonly selected = signal<string | null>(null);
  /** 选中的联系人；还没点过时是列表里的第一位。 */
  protected readonly current = computed<Contact | undefined>(() => {
    const contacts = this.contacts();
    return contacts.find(contact => contact.id === this.selected()) ?? contacts[0];
  });
  protected readonly fields = computed<readonly ContactField[]>(() => {
    const person = this.current();
    return person ?
        [
          ['email', person.email],
          ['home', person.address]
        ]
      : [];
  });

  constructor() {
    const menus = inject(DesktopMenus);
    inject(DesktopWindow).setMenus(computed(() => menus.standard('contacts')));
  }
}
