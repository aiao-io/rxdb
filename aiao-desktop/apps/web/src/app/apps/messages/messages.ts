import {
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  computed,
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
import { CHAT_SEED, Chat, ChatMessage, REPLIES } from './messages-data';
import { MessagesDetails, MessagesSwitches } from './messages-details';

/** 信息：会话列表（可搜索）、气泡线程、发送后 1.1 秒的模拟回复、详情面板与新会话。 */
@Component({
  selector: 'app-messages',
  imports: [Icon, TrafficLights],
  host: { style: 'display: contents' },
  templateUrl: './messages.html'
})
export class MessagesApp {
  private readonly wm = inject(WindowManager);
  private readonly toast = inject(Toast);
  private readonly popover = inject(PopoverService);
  private readonly body = viewChild.required<ElementRef<HTMLElement>>('body');
  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');
  private readonly replies = new Set<ReturnType<typeof setTimeout>>();
  private readonly switches: MessagesSwitches = { alerts: signal(false), receipts: signal(false) };
  private nextId = CHAT_SEED.length;

  protected readonly chats = signal<readonly Chat[]>(CHAT_SEED);
  /** 选中的是 `chats` 里的第几段会话。 */
  protected readonly selected = signal(0);
  protected readonly query = signal('');
  protected readonly draft = signal('');

  protected readonly chat = computed(() => this.chats()[this.selected()]);
  /** 搜索同时匹配名字和聊天内容；`index` 仍是在全部会话里的下标。 */
  protected readonly rows = computed(() => {
    const query = this.query().toLowerCase();
    return this.chats()
      .map((chat, index) => ({ chat, index, last: chat.messages[chat.messages.length - 1].text }))
      .filter(
        ({ chat }) =>
          !query ||
          chat.name.toLowerCase().includes(query) ||
          chat.messages.some(message => message.text.toLowerCase().includes(query))
      );
  });
  /** 连续同一方的消息只在最后一个气泡画小尾巴；日期标签每次重画时取当前时间。 */
  protected readonly thread = computed(() => {
    const messages = this.chat().messages;
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
    afterRenderEffect(() => {
      this.thread();
      const body = this.body().nativeElement;
      body.scrollTop = body.scrollHeight;
    });
  }

  protected select(index: number): void {
    this.selected.set(index);
  }

  protected enter(event: Event): void {
    event.preventDefault();
    this.send();
  }

  protected send(): void {
    const text = this.draft().trim();
    if (!text) return;
    const id = this.chat().id;
    this.append(id, { from: 'me', text });
    this.draft.set('');
    const reply = setTimeout(() => {
      this.replies.delete(reply);
      this.append(id, { from: 'them', text: REPLIES[Math.floor(Math.random() * REPLIES.length)] });
    }, 1100);
    this.replies.add(reply);
  }

  /** 新信息：在列表最前面开一个空会话，像 ⌘N 那样。 */
  protected create(): void {
    const chat: Chat = {
      id: this.nextId++,
      name: 'New Message',
      color: '#8e8e93',
      time: 'now',
      messages: [{ from: 'them', text: 'Type a message to begin.' }]
    };
    this.chats.update(chats => [chat, ...chats]);
    this.selected.set(0);
    this.query.set('');
    this.field().nativeElement.focus();
  }

  protected call(): void {
    this.wm.open('facetime');
    this.toast.show(`Calling ${this.chat().name}…`);
  }

  protected details(): void {
    this.popover.openComponent(
      MessagesDetails,
      { x: innerWidth / 2 - 125, y: 120, origin: 'top center' },
      { chat: this.chat(), switches: this.switches }
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

  private append(id: number, message: ChatMessage): void {
    this.chats.update(chats =>
      chats.map(chat => (chat.id === id ? { ...chat, messages: [...chat.messages, message] } : chat))
    );
  }
}
