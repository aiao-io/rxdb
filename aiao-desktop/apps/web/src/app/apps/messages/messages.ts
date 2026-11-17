import {
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  signal,
  viewChild
} from '@angular/core';

import { localWriteFailureMessage } from '../../data/local-write-error';
import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { PopoverService, RETURNS_FOCUS } from '../../services/popover';
import { WindowManager } from '../../services/window-manager';
import { Icon } from '../../shared/icon';
import { TrafficLights } from '../../shared/traffic-lights';
import { MessageDrafts } from './message-drafts';
import { MessagesDetails } from './messages-details';
import { Chat } from './messages-model';
import { MessagesStore } from './messages-store';

/** 会话与消息只存在当前站点的本地库里，不模拟远程发送、收件和通话。 */
@Component({
  selector: 'app-messages',
  imports: [Icon, TrafficLights],
  providers: [MessagesStore],
  host: { style: 'display: contents' },
  templateUrl: './messages.html'
})
export class MessagesApp {
  private readonly store = inject(MessagesStore);
  private readonly wm = inject(WindowManager);
  private readonly popover = inject(PopoverService);
  private readonly body = viewChild.required<ElementRef<HTMLElement>>('body');
  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');
  private readonly selectedId = signal<string | null>(null);
  private creation: Promise<void> | null = null;

  protected readonly win = inject(DesktopWindow);
  protected readonly drafts = new MessageDrafts(message => this.store.append(message));
  protected readonly query = signal('');
  protected readonly creating = signal(false);
  protected readonly error = signal('');
  protected readonly conversations = computed<readonly Chat[]>(() => {
    const chats = this.store.chats();
    const ids = new Set(chats.map(chat => chat.id));
    const missing = this.drafts.rows().filter(draft => !ids.has(draft.threadId));
    return [...chats, ...missing.map(draft => ({
      id: draft.threadId, name: 'Unavailable conversation', color: '#626267', time: '', group: false, messages: []
    }))];
  });
  protected readonly chat = computed<Chat | undefined>(() => {
    const chats = this.conversations();
    return chats.find(chat => chat.id === this.selectedId()) ?? chats[0];
  });
  protected readonly currentDraft = computed(() => this.drafts.get(this.chat()?.id ?? ''));
  protected readonly initial = computed(() => this.chat()?.name[0] ?? '');
  protected readonly rows = computed(() => {
    const query = this.query().toLowerCase();
    return this.conversations().map((chat, index) => ({
      chat, index, last: chat.messages.at(-1)?.text ?? '', draft: this.drafts.get(chat.id)?.text ?? ''
    })).filter(({ chat, draft }) => !query || `${chat.name} ${draft}`.toLowerCase().includes(query) ||
      chat.messages.some(message => message.text.toLowerCase().includes(query)));
  });
  protected readonly thread = computed(() => {
    const messages = this.chat()?.messages ?? [];
    return messages.map((message, i) => ({
      me: message.from === 'me',
      tail: i === messages.length - 1 || messages[i + 1].from !== message.from,
      text: message.text
    }));
  });

  constructor() {
    const menus = inject(DesktopMenus);
    this.win.setMenus(computed(() => menus.standard('messages')));
    this.win.confirmClose = () => this.confirmClose();
    effect(() => {
      const first = this.store.chats()[0];
      if (first && this.selectedId() === null) this.selectedId.set(first.id);
    });
    effect(() => this.win.hasUnsavedChanges.set(this.drafts.dirty() || this.drafts.pending() || this.creating()));
    afterRenderEffect(() => {
      this.thread();
      const body = this.body().nativeElement;
      body.scrollTop = body.scrollHeight;
    });
    const beforeUnload = (event: BeforeUnloadEvent): void => {
      if (!this.drafts.dirty() && !this.drafts.pending() && !this.creating()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('beforeunload', beforeUnload);
      this.win.confirmClose = null;
      this.win.hasUnsavedChanges.set(false);
      this.drafts.dispose();
    });
  }

  protected select(id: string): void {
    if (!this.win.closePending()) this.selectedId.set(id);
  }

  protected edit(text: string): void {
    const chat = this.chat();
    if (!chat || this.win.closePending()) return;
    this.error.set('');
    this.drafts.edit(chat.id, text);
  }

  protected enter(event: Event): void {
    event.preventDefault();
    void this.saveLocal();
  }

  protected async saveLocal(): Promise<void> {
    const chat = this.chat();
    if (!chat || this.win.closePending()) return;
    this.error.set('');
    await this.drafts.save(chat.id);
  }

  protected discard(): void {
    const chat = this.chat();
    if (!chat || this.win.closePending()) return;
    this.drafts.discard(chat.id);
    this.error.set('');
  }

  protected create(): Promise<void> {
    if (this.creation) return this.creation;
    if (this.win.closePending()) return Promise.resolve();
    this.creating.set(true);
    this.error.set('');
    this.creation = this.store.create().then(id => {
      this.query.set('');
      this.selectedId.set(id);
      this.field().nativeElement.focus();
    }, error => this.error.set(localWriteFailureMessage(error))).finally(() => {
      this.creating.set(false);
      this.creation = null;
    });
    return this.creation;
  }

  protected details(anchor: HTMLElement): void {
    const chat = this.chat();
    if (!chat) return;
    const bounds = anchor.getBoundingClientRect();
    this.popover.openComponent(MessagesDetails, {
      x: bounds.left, y: bounds.bottom + 6, origin: 'top left', focus: true,
      onClose: reason => { if (RETURNS_FOCUS.has(reason)) anchor.focus(); }
    }, { chat });
  }

  protected attach(anchor: HTMLElement): void {
    this.popover.menuUnder(anchor, [
      { id: 'p', label: 'Open Photos', icon: 'g-gallery', run: () => this.wm.open('photos') },
      { id: 's', label: 'Insert 👍', icon: 'g-star', run: () => this.insert('👍') },
      { id: 'a', label: 'Open Voice Memos', icon: 'g-vol-hi', run: () => this.wm.open('voice') },
      '-',
      { id: 'f', label: 'File sending unavailable', disabled: true }
    ], { keyboard: true, label: 'Local conversation actions' });
  }

  private async confirmClose(): Promise<boolean> {
    await this.creation;
    await this.drafts.settle();
    const unsaved = this.drafts.rows().find(draft => draft.text.trim().length > 0);
    if (!unsaved) return true;
    this.query.set('');
    this.selectedId.set(unsaved.threadId);
    this.error.set('There are unsaved drafts. Save locally or discard each draft before closing.');
    return false;
  }

  private insert(text: string): void {
    this.edit((this.currentDraft()?.text ?? '') + text);
    this.field().nativeElement.focus();
  }
}
