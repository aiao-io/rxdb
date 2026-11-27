import { Component, DestroyRef, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';

import { useI18n } from '@aiao/rxdb-i18n-angular';

import { DesktopData } from '../../data/desktop-data';
import { ALL_ROWS, liveQuery } from '../../data/live-query';
import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { PopoverService } from '../../services/popover';
import { Toast } from '../../services/toast';
import { WindowManager } from '../../services/window-manager';
import { Icon } from '../../shared/icon';
import { TrafficLights } from '../../shared/traffic-lights';
import {
  ContactDraftField,
  ContactEditor,
  contactValidationMessage,
  draftOf,
  filterContacts,
  newDraft,
  normalizeDraft,
  sameContact,
  stepContact
} from './contacts-model';
import { Contact } from './contacts.entities';

/** 联系人卡片里的一栏：[标签, 内容]。 */
type ContactField = readonly [label: string, value: string];

/** 通讯录：左侧可搜索姓名列表，右侧可查看、编辑和删除联系人；数据来自桌面库。 */
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
            <input
              #search
              [attr.aria-label]="i18n.t('apps.contacts.searchContacts')"
              [placeholder]="i18n.t('apps.contacts.search')"
              [value]="query()"
              (input)="searchContacts(search.value)"
            />
          </div>
        </div>
        <div style="overflow: auto; padding: 0 8px">
          @for (contact of filteredContacts(); track contact.id; let i = $index) {
            <div
              class="si"
              [attr.data-ci2]="i"
              [attr.data-contact-id]="contact.id"
              [class.on]="contact.id === current()?.id"
              (click)="select(contact.id)"
              (contextmenu)="menu($event, contact.id)"
              (keydown.enter)="select(contact.id)"
              (keydown)="rowKey($event)"
              style="height: 30px"
              tabindex="0"
            >
              <span class="nm">{{ contact.name }}</span>
            </div>
          }
          @if (filteredContacts().length === 0) {
            <div style="padding: 14px 10px; color: var(--txt-2); font-size: 12px">
              {{ i18n.t('apps.contacts.noContactsFound') }}
            </div>
          }
        </div>
      </div>
      <div class="wmain">
        <div class="tbar" data-drag style="height: 52px">
          <div class="grow"></div>
          <div class="tbz" data-nodrag>
            <button
              class="tbtn"
              [attr.aria-label]="i18n.t('apps.contacts.newContact')"
              [disabled]="busy() || win.closePending()"
              [title]="i18n.t('apps.contacts.newContact')"
              (click)="create()"
              data-new-contact
            >
              <svg appIcon="g-plus"></svg>
            </button>
          </div>
        </div>
        <div class="scroll" (contextmenu)="cardMenu($event)" data-cbody2 style="flex: 1; padding: 26px">
          @if (editor(); as editing) {
            <form (submit)="save($event)" style="max-width: 460px">
              <div style="display: flex; gap: 18px; align-items: center">
                <div
                  [style.background]="editing.draft.color"
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
                  {{ editing.draft.name[0] || '?' }}
                </div>
                <div>
                  <div style="font-size: 25px; font-weight: 600; letter-spacing: -0.02em">
                    {{ editing.draft.name || i18n.t('apps.contacts.newContact') }}
                  </div>
                  <div style="font-size: 13px; color: var(--txt-2)">
                    {{ i18n.t('apps.contacts.editContactDetails') }}
                  </div>
                </div>
              </div>
              <div style="display: grid; gap: 10px; margin-top: 24px">
                <label style="display: grid; gap: 4px; font-size: 11.5px; color: var(--txt-2)">
                  {{ i18n.t('apps.contacts.columnName') }}
                  <input
                    [attr.aria-label]="i18n.t('apps.contacts.contactName')"
                    [disabled]="busy() || win.closePending()"
                    [value]="editing.draft.name"
                    (input)="updateDraft('name', $event)"
                    data-contact-name
                  />
                </label>
                <label style="display: grid; gap: 4px; font-size: 11.5px; color: var(--txt-2)">
                  {{ i18n.t('apps.contacts.role') }}
                  <input
                    [attr.aria-label]="i18n.t('apps.contacts.contactRole')"
                    [disabled]="busy() || win.closePending()"
                    [value]="editing.draft.role"
                    (input)="updateDraft('role', $event)"
                    data-contact-role
                  />
                </label>
                <label style="display: grid; gap: 4px; font-size: 11.5px; color: var(--txt-2)">
                  {{ i18n.t('apps.contacts.email') }}
                  <input
                    [attr.aria-label]="i18n.t('apps.contacts.contactEmail')"
                    [disabled]="busy() || win.closePending()"
                    [value]="editing.draft.email"
                    (input)="updateDraft('email', $event)"
                    data-contact-email
                  />
                </label>
                <label style="display: grid; gap: 4px; font-size: 11.5px; color: var(--txt-2)">
                  {{ i18n.t('apps.contacts.home') }}
                  <input
                    [attr.aria-label]="i18n.t('apps.contacts.contactHome')"
                    [disabled]="busy() || win.closePending()"
                    [value]="editing.draft.address"
                    (input)="updateDraft('address', $event)"
                    data-contact-address
                  />
                </label>
              </div>
              @if (error(); as message) {
                <div data-contact-error role="alert" style="margin-top: 12px; color: var(--red); font-size: 12px">
                  {{ message }}
                </div>
              }
              <div style="display: flex; gap: 8px; margin-top: 18px">
                <button class="btn pri" [disabled]="busy() || win.closePending()" data-contact-save type="submit">
                  {{ busy() ? i18n.t('apps.contacts.saving') : i18n.t('apps.contacts.save') }}
                </button>
                <button
                  class="btn"
                  [disabled]="busy() || win.closePending()"
                  (click)="cancel()"
                  data-contact-cancel
                  type="button"
                >
                  {{ i18n.t('apps.contacts.cancel') }}
                </button>
              </div>
            </form>
          } @else if (current(); as person) {
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
                    i18n.t(field[0])
                  }}</span>
                  <span style="font-size: 13px; color: var(--blue)">{{ field[1] }}</span>
                </div>
              }
            </div>
            @if (error(); as message) {
              <div data-contact-error role="alert" style="margin-top: 12px; color: var(--red); font-size: 12px">
                {{ message }}
              </div>
            }
            <div style="display: flex; gap: 8px; margin-top: 18px">
              <button class="btn pri" [disabled]="busy() || win.closePending()" (click)="edit()" data-contact-edit>
                {{ i18n.t('apps.contacts.edit') }}
              </button>
              <button class="btn" [disabled]="busy() || win.closePending()" (click)="remove()" data-contact-delete>
                {{ i18n.t('apps.contacts.delete') }}
              </button>
            </div>
          } @else {
            <div style="padding: 32px; color: var(--txt-2); font-size: 13px">
              {{ i18n.t('apps.contacts.noContactSelected') }}
            </div>
          }
        </div>
      </div>
    </div>
  `
})
export class ContactsApp {
  private readonly data = inject(DesktopData);
  private readonly toast = inject(Toast);
  private readonly wm = inject(WindowManager);
  private readonly popover = inject(PopoverService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly searchField = viewChild.required<ElementRef<HTMLInputElement>>('search');
  private readonly contacts = liveQuery(
    () => Contact.findAll({ where: ALL_ROWS, orderBy: [{ field: 'position', sort: 'asc' }] }),
    [],
    Contact
  );

  protected readonly win = inject(DesktopWindow);
  protected readonly i18n = useI18n();
  protected readonly query = signal('');
  protected readonly selected = signal<string | null>(null);
  protected readonly editor = signal<ContactEditor | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly filteredContacts = computed(() => filterContacts(this.contacts(), this.query()));
  /** 选中的联系人；还没点过时是筛选结果里的第一位。 */
  protected readonly current = computed<Contact | undefined>(() => {
    const contacts = this.filteredContacts();
    return contacts.find(contact => contact.id === this.selected()) ?? contacts[0];
  });
  protected readonly fields = computed<readonly ContactField[]>(() => {
    const person = this.current();
    return person ?
        [
          ['apps.contacts.fieldEmail', person.email],
          ['apps.contacts.fieldHome', person.address]
        ]
      : [];
  });

  constructor() {
    const menus = inject(DesktopMenus);
    this.win.setMenus(
      computed(() =>
        menus.standard('contacts', {
          [this.i18n.t('shell.menu.sectionFile')]: [
            { id: 'n', label: this.i18n.t('apps.contacts.newContact'), key: '⌘N', run: () => this.create() },
            {
              id: 's',
              label: this.i18n.t('apps.contacts.saveContact'),
              key: '⌘S',
              disabled: !this.editor(),
              run: () => this.save()
            },
            {
              id: 'd',
              label: this.i18n.t('apps.contacts.deleteContact'),
              key: '⌘⌫',
              disabled: !this.current() || !!this.editor(),
              run: () => this.remove()
            },
            {
              id: 'f',
              label: this.i18n.t('apps.contacts.find'),
              key: '⌘F',
              disabled: !!this.editor(),
              run: () => this.focusSearch()
            },
            '-',
            { id: 'w', label: this.i18n.t('shell.menu.closeWindow'), key: '⌘W', run: () => this.wm.closeFront() }
          ]
        })
      )
    );
    this.win.confirmClose = async () => {
      if (this.busy()) return false;
      if (!this.editor()) return true;
      this.toast.show('apps.contacts.unsavedChanges');
      return false;
    };
    effect(() => this.win.hasUnsavedChanges.set(this.editor() !== null || this.busy()));
    const beforeUnload = (event: BeforeUnloadEvent): void => {
      if (!this.editor() && !this.busy()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('beforeunload', beforeUnload);
      this.win.confirmClose = null;
      this.win.hasUnsavedChanges.set(false);
    });
  }

  protected searchContacts(value: string): void {
    if (this.editor()) return;
    this.query.set(value);
    this.selected.set(null);
    this.error.set(null);
  }

  protected select(id: string): void {
    if (this.editor()) {
      this.toast.show('apps.contacts.saveBeforeSelect');
      return;
    }
    if (!this.win.closePending()) {
      this.selected.set(id);
      this.error.set(null);
    }
  }

  /** ⌘F：焦点交给搜索框。 */
  protected focusSearch(): void {
    if (this.editor()) return;
    this.searchField().nativeElement.focus();
  }

  /** 列表方向键：上下移动选中项并把焦点带过去。 */
  protected rowKey(event: KeyboardEvent): void {
    const step =
      event.key === 'ArrowDown' ? 1
      : event.key === 'ArrowUp' ? -1
      : 0;
    if (!step) return;
    event.preventDefault();
    const target = stepContact(this.filteredContacts(), this.current()?.id ?? null, step);
    if (!target) return;
    this.select(target);
    const rows = (event.currentTarget as HTMLElement).parentElement;
    rows?.querySelector<HTMLElement>(`[data-contact-id="${CSS.escape(target)}"]`)?.focus();
  }

  /** 列表行的右键菜单。 */
  protected menu(event: MouseEvent, id: string): void {
    this.select(id);
    this.contextFor(event, id);
  }

  /** 卡片区的右键菜单：对当前选中的联系人。 */
  protected cardMenu(event: MouseEvent): void {
    const person = this.current();
    if (!person || this.editor()) return;
    this.contextFor(event, person.id);
  }

  /** 复制一张联系人卡片：带着同样的字段进编辑表单，保存后成为新联系人。 */
  protected duplicate(person: Contact): void {
    if (this.busy() || this.win.closePending()) return;
    const position = this.contacts().reduce((highest, contact) => Math.max(highest, contact.position), -1) + 1;
    const draft = {
      ...draftOf(person),
      id: null,
      name: this.i18n.t('apps.contacts.copyName', { name: person.name }),
      position
    };
    this.error.set(null);
    this.editor.set({ draft, base: null });
  }

  protected create(): void {
    if (this.busy() || this.win.closePending()) return;
    const position = this.contacts().reduce((highest, contact) => Math.max(highest, contact.position), -1) + 1;
    const draft = newDraft(position);
    this.query.set('');
    this.selected.set(null);
    this.error.set(null);
    this.editor.set({ draft, base: null });
  }

  protected edit(): void {
    const person = this.current();
    if (!person || this.busy() || this.win.closePending()) return;
    const draft = draftOf(person);
    this.error.set(null);
    this.editor.set({ draft, base: draft });
  }

  protected updateDraft(field: ContactDraftField, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.editor.update(editor => {
      if (!editor) return editor;
      return { ...editor, draft: { ...editor.draft, [field]: value } };
    });
    this.error.set(null);
  }

  protected cancel(): void {
    if (this.busy()) return;
    this.editor.set(null);
    this.error.set(null);
  }

  protected async save(event?: Event): Promise<void> {
    event?.preventDefault();
    const editor = this.editor();
    if (!editor || this.busy() || this.win.closePending()) return;
    const draft = normalizeDraft(editor.draft);
    const validation = contactValidationMessage(draft, key => this.i18n.t(key));
    if (validation) {
      this.error.set(validation);
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.data.ensureSeeded(Contact);
      const id = await this.data.transaction(async executor => {
        const repository = executor.getRepository(Contact);
        if (draft.id === null) {
          const rows = await repository.find({
            where: ALL_ROWS,
            orderBy: [{ field: 'position', sort: 'desc' }],
            limit: 1
          });
          const position = rows[0] ? rows[0].position + 1 : 0;
          const created = await repository.create(
            this.data.instantiate(Contact, {
              name: draft.name,
              role: draft.role,
              color: draft.color,
              email: draft.email,
              address: draft.address,
              position
            })
          );
          return created.id;
        }
        const [existing] = await repository.find({
          where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: draft.id }] },
          limit: 1
        });
        if (!existing) throw new Error(this.i18n.t('error.contacts.goneKeepForm'));
        if (editor.base && !sameContact(draftOf(existing), editor.base))
          throw new Error(this.i18n.t('error.contacts.changedElsewhere'));
        await repository.update(existing, {
          name: draft.name,
          role: draft.role,
          email: draft.email,
          address: draft.address
        });
        return existing.id;
      });
      this.selected.set(id);
      this.editor.set(null);
      this.toast.show(draft.id === null ? 'apps.contacts.contactAdded' : 'apps.contacts.contactSaved');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const person = this.current();
    if (!person || this.busy() || this.win.closePending()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.data.ensureSeeded(Contact);
      await this.data.transaction(async executor => {
        const repository = executor.getRepository(Contact);
        const [existing] = await repository.find({
          where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: person.id }] },
          limit: 1
        });
        if (!existing) throw new Error(this.i18n.t('error.contacts.goneRefresh'));
        await repository.remove(existing);
      });
      this.selected.set(null);
      this.toast.show('apps.contacts.deletedContact', { name: person.name });
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.busy.set(false);
    }
  }

  private contextFor(event: MouseEvent, id: string): void {
    const person = this.contacts().find(contact => contact.id === id);
    if (!person) return;
    this.popover.contextMenu(
      event,
      [
        { id: 'e', label: this.i18n.t('apps.contacts.edit'), run: () => this.edit() },
        { id: 'd', label: this.i18n.t('apps.contacts.duplicate'), run: () => this.duplicate(person) },
        '-',
        { id: 'x', label: this.i18n.t('apps.contacts.delete'), disabled: !!this.editor(), run: () => this.remove() }
      ],
      'contact'
    );
  }
}
