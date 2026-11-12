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

import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { PopoverService } from '../../services/popover';
import { Toast } from '../../services/toast';
import { WindowManager } from '../../services/window-manager';
import { time12Plain } from '../../shared/format';
import { Icon } from '../../shared/icon';
import { TrafficLights } from '../../shared/traffic-lights';
import { REPLIES } from './messages-data';
import { MessagesDetails, MessagesSwitches } from './messages-details';
import { Chat } from './messages-model';
import { MessagesStore } from './messages-store';

/**
 * 信息：会话列表（可搜索）、气泡线程、发送后 1.1 秒的模拟回复、详情面板与新会话。
 * 会话与消息都存在本地库里（见 {@link MessagesStore}），所有信息窗口共用同一份。
 */
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
  private readonly toast = inject(Toast);
  private readonly popover = inject(PopoverService);
  private readonly body = viewChild.required<ElementRef<HTMLElement>>('body');
  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');
  private readonly replies = new Set<ReturnType<typeof setTimeout>>();
  private readonly switches: MessagesSwitches = { alerts: signal(false), receipts: signal(false) };
  /** 选中的会话编号；会话列表第一次读到时选中第一段，之后别的窗口新建会话也不会把选中项挤走。 */
  private readonly selectedId = signal<string | null>(null);

  protected readonly query = signal('');
  protected readonly draft = signal('');

  protected readonly chat = computed<Chat | undefined>(() => {
    const chats = this.store.chats();
    return chats.find(chat => chat.id === this.selectedId()) ?? chats[0];
  });
  /** 头部头像上的首字母。 */
  protected readonly initial = computed(() => this.chat()?.name[0] ?? '');
  /** 搜索同时匹配名字和聊天内容；`index` 仍是在全部会话里的下标。 */
  protected readonly rows = computed(() => {
    const query = this.query().toLowerCase();
    return this.store
      .chats()
      .map((chat, index) => ({ chat, index, last: chat.messages.at(-1)?.text ?? '' }))
      .filter(
        ({ chat }) =>
          !query ||
          chat.name.toLowerCase().includes(query) ||
          chat.messages.some(message => message.text.toLowerCase().includes(query))
      );
  });
  /** 连续同一方的消息只在最后一个气泡画小尾巴；日期标签每次重画时取当前时间。 */
  protected readonly thread = computed(() => {
    const messages = this.chat()?.messages ?? [];
    return {
      day: `Today ${time12Plain(new Date())}`,
      bubbles: messages.map((message, i) => ({
        me: message.from === 'me',
        tail: i === messages.length - 1 || messages[i + 1].from !== message.from,
        text: message.text
      }))
    };
  });

  constructor() {
    const menus = inject(DesktopMenus);
    inject(DesktopWindow).setMenus(computed(() => menus.standard('messages')));
    inject(DestroyRef).onDestroy(() => this.replies.forEach(clearTimeout));
    effect(() => {
      const first = this.store.chats()[0];
      if (first && this.selectedId() === null) this.selectedId.set(first.id);
    });
    afterRenderEffect(() => {
      this.thread();
      const body = this.body().nativeElement;
      body.scrollTop = body.scrollHeight;
    });
  }

  protected select(id: string): void {
    this.selectedId.set(id);
  }

  protected enter(event: Event): void {
    event.preventDefault();
    void this.send();
  }

  /** 发出消息；1.1 秒后对方随机回一句（窗口先关掉就不回了）。 */
  protected async send(): Promise<void> {
    const text = this.draft().trim();
    const chat = this.chat();
    if (!text || !chat) return;
    this.draft.set('');
    const sent = this.store.append(chat.id, 'me', text);
    const reply = setTimeout(() => {
      this.replies.delete(reply);
      void sent.then(() => this.store.append(chat.id, 'them', REPLIES[Math.floor(Math.random() * REPLIES.length)]));
    }, 1100);
    this.replies.add(reply);
    await sent;
  }

  /** 新信息：在列表最前面开一个空会话，像 ⌘N 那样。 */
  protected async create(): Promise<void> {
    this.query.set('');
    this.field().nativeElement.focus();
    this.selectedId.set(await this.store.create());
  }

  protected call(): void {
    const chat = this.chat();
    if (!chat) return;
    this.wm.open('facetime');
    this.toast.show(`Calling ${chat.name}…`);
  }

  protected details(): void {
    const chat = this.chat();
    if (!chat) return;
    this.popover.openComponent(
      MessagesDetails,
      { x: innerWidth / 2 - 125, y: 120, origin: 'top center' },
      { chat, switches: this.switches }
    );
  }

  protected attach(anchor: HTMLElement): void {
    this.popover.menuUnder(anchor, [
      { id: 'p', label: 'Photos', icon: 'g-gallery', run: () => this.wm.open('photos') },
      { id: 's', label: 'Stickers', icon: 'g-star', run: () => this.insert('👍') },
      { id: 'a', label: 'Audio', icon: 'g-vol-hi', run: () => this.wm.open('voice') },
      '-',
      { id: 'f', label: 'Send a File…', run: () => this.toast.show('No files selected') }
    ]);
  }

  private insert(text: string): void {
    this.draft.update(draft => draft + text);
    this.field().nativeElement.focus();
  }
}
