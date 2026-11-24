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
import { FocusTrap } from '../../shared/focus-trap';
import { Icon } from '../../shared/icon';
import { TrafficLights } from '../../shared/traffic-lights';
import { MessageDrafts } from './message-drafts';
import { MessagesDetails } from './messages-details';
import { Chat, unreadThreadIds } from './messages-model';
import { MessagesStore } from './messages-store';

/** 会话与消息只存在当前站点的本地库里，不模拟远程发送、收件和通话。 */
@Component({
  selector: 'app-messages',
  imports: [FocusTrap, Icon, TrafficLights],
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
  private readonly searchField = viewChild.required<ElementRef<HTMLInputElement>>('search');
  private readonly selectedId = signal<string | null>(null);
  /** 打开过的会话（选中即已读）。未读指示没有实体字段，是每个窗口自己的界面状态。 */
  private readonly opened = signal<ReadonlySet<string>>(new Set());
  private creation: Promise<void> | null = null;

  protected readonly win = inject(DesktopWindow);
  protected readonly drafts = new MessageDrafts(message => this.store.append(message));
  protected readonly query = signal('');
  protected readonly creating = signal(false);
  protected readonly error = signal('');
  /** 等确认删除的会话。 */
  protected readonly confirmDelete = signal<Chat | null>(null);
  protected readonly unreadIds = computed(() => {
    const all = unreadThreadIds(this.store.chats());
    const opened = this.opened();
    return new Set([...all].filter(id => !opened.has(id)));
  });
  protected readonly conversations = computed<readonly Chat[]>(() => {
    const chats = this.store.chats();
    const ids = new Set(chats.map(chat => chat.id));
    const missing = this.drafts.rows().filter(draft => !ids.has(draft.threadId));
    return [
      ...chats,
      ...missing.map(draft => ({
        id: draft.threadId,
        name: 'Unavailable conversation',
        color: '#626267',
        time: '',
        group: false,
        messages: []
      }))
    ];
  });
  protected readonly chat = computed<Chat | undefined>(() => {
    const chats = this.conversations();
    return chats.find(chat => chat.id === this.selectedId()) ?? chats[0];
  });
  protected readonly currentDraft = computed(() => this.drafts.get(this.chat()?.id ?? ''));
  protected readonly initial = computed(() => this.chat()?.name[0] ?? '');
  protected readonly rows = computed(() => {
    const query = this.query().toLowerCase();
    return this.conversations()
      .map((chat, index) => ({
        chat,
        index,
        last: chat.messages.at(-1)?.text ?? '',
        draft: this.drafts.get(chat.id)?.text ?? ''
      }))
      .filter(
        ({ chat, draft }) =>
          !query ||
          `${chat.name} ${draft}`.toLowerCase().includes(query) ||
          chat.messages.some(message => message.text.toLowerCase().includes(query))
      );
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
    this.win.setMenus(
      computed(() =>
        menus.standard('messages', {
          File: [
            { id: 'n', label: 'New Message', key: '⌘N', run: () => void this.create() },
            { id: 'f', label: 'Find', key: '⌘F', run: () => this.focusSearch() },
            { id: 'w', label: 'Close Window', key: '⌘W', run: () => this.wm.closeFront() }
          ]
        })
      )
    );
    this.win.confirmClose = () => this.confirmClose();
    effect(() => {
      const first = this.store.chats()[0];
      if (first && this.selectedId() === null) {
        this.selectedId.set(first.id);
        this.markRead(first.id);
      }
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
    if (!this.win.closePending()) {
      this.selectedId.set(id);
      this.markRead(id);
    }
  }

  /** ⌘F：焦点交给会话搜索框。 */
  protected focusSearch(): void {
    this.searchField().nativeElement.focus();
  }

  /** 把会话记为已读（右键「Mark as Read」与选中会话共用）。 */
  protected markRead(id: string): void {
    this.opened.update(opened => new Set(opened).add(id));
  }

  /** 会话列表方向键：上下移动选中项并把焦点带过去。 */
  protected rowKey(event: KeyboardEvent, id: string): void {
    const step =
      event.key === 'ArrowDown' ? 1
      : event.key === 'ArrowUp' ? -1
      : 0;
    if (!step) return;
    event.preventDefault();
    const list = this.rows();
    const index = list.findIndex(row => row.chat.id === id);
    const target = list[index + step];
    if (!target) return;
    this.select(target.chat.id);
    (event.currentTarget as HTMLElement).parentElement
      ?.querySelector<HTMLElement>(`[data-cid="${CSS.escape(target.chat.id)}"]`)
      ?.focus();
  }

  /** 会话行的右键菜单。 */
  protected menu(event: MouseEvent, id: string): void {
    const conversation = this.store.chats().find(item => item.id === id);
    if (!conversation) return;
    this.popover.contextMenu(
      event,
      [
        {
          id: 'r',
          label: 'Mark as Read',
          disabled: !this.unreadIds().has(id),
          run: () => this.markRead(id)
        },
        '-',
        { id: 'd', label: 'Delete Conversation…', run: () => this.confirmDelete.set(conversation) }
      ],
      'conversation'
    );
  }

  protected cancelDelete(): void {
    this.confirmDelete.set(null);
  }

  protected async deleteChat(): Promise<void> {
    const chat = this.confirmDelete();
    this.confirmDelete.set(null);
    if (!chat) return;
    try {
      this.drafts.discard(chat.id);
      await this.store.remove(chat.id);
      if (this.selectedId() === chat.id) this.selectedId.set(null);
      this.markRead(chat.id);
    } catch (error) {
      this.error.set(localWriteFailureMessage(error));
    }
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
    this.creation = this.store
      .create()
      .then(
        id => {
          this.query.set('');
          this.selectedId.set(id);
          this.field().nativeElement.focus();
        },
        error => this.error.set(localWriteFailureMessage(error))
      )
      .finally(() => {
        this.creating.set(false);
        this.creation = null;
      });
    return this.creation;
  }

  protected details(anchor: HTMLElement): void {
    const chat = this.chat();
    if (!chat) return;
    const bounds = anchor.getBoundingClientRect();
    this.popover.openComponent(
      MessagesDetails,
      {
        x: bounds.left,
        y: bounds.bottom + 6,
        origin: 'top left',
        focus: true,
        onClose: reason => {
          if (RETURNS_FOCUS.has(reason)) anchor.focus();
        }
      },
      { chat }
    );
  }

  protected attach(anchor: HTMLElement): void {
    this.popover.menuUnder(
      anchor,
      [
        { id: 'p', label: 'Open Photos', icon: 'g-gallery', run: () => this.wm.open('photos') },
        { id: 's', label: 'Insert 👍', icon: 'g-star', run: () => this.insert('👍') },
        { id: 'a', label: 'Open Voice Memos', icon: 'g-vol-hi', run: () => this.wm.open('voice') },
        '-',
        { id: 'f', label: 'File sending unavailable', disabled: true }
      ],
      { keyboard: true, label: 'Local conversation actions' }
    );
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
