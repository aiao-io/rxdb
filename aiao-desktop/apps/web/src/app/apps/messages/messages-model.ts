/** 界面里的一条消息：谁说的，说了什么。 */
export interface ChatLine {
  readonly from: 'me' | 'them';
  readonly text: string;
}

/** 界面里的一段会话：会话行加上它的全部消息（按发送顺序）。每次重算都是新对象，信号据此感知变化。 */
export interface Chat {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly time: string;
  readonly group: boolean;
  readonly messages: readonly ChatLine[];
}

/** 拼会话时用到的会话行字段。 */
export interface ThreadFields {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly timeLabel: string;
  readonly isGroup: boolean;
}

/** 拼会话时用到的消息行字段。 */
export interface MessageFields {
  readonly threadId: string;
  readonly sender: 'me' | 'them';
  readonly text: string;
}

/**
 * 把会话行和消息行拼成界面用的会话：会话保持传入的顺序，消息按传入的顺序归到各自的会话。
 * 刚建好、消息还没到的会话也保留（消息为空）；找不到会话的消息被忽略。
 */
export function buildChats(threads: readonly ThreadFields[], messages: readonly MessageFields[]): Chat[] {
  const lines = new Map<string, ChatLine[]>();
  for (const message of messages) {
    const line: ChatLine = { from: message.sender, text: message.text };
    const thread = lines.get(message.threadId);
    if (thread) thread.push(line);
    else lines.set(message.threadId, [line]);
  }
  return threads.map(thread => ({
    id: thread.id,
    name: thread.name,
    color: thread.color,
    time: thread.timeLabel,
    group: thread.isGroup,
    messages: lines.get(thread.id) ?? []
  }));
}

/**
 * 有未读消息的会话：最后一条消息来自对方。
 * 本构建没有远程收发，未读只按现有消息推导；用户打开过（或选中过）的会话由界面另行标记已读。
 */
export function unreadThreadIds(chats: readonly Chat[]): ReadonlySet<string> {
  return new Set(chats.filter(chat => chat.messages.at(-1)?.from === 'them').map(chat => chat.id));
}
