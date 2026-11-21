import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import {
  channelTopic,
  signalKinds,
  type Presence,
  type RevocationSignal,
  type SignalKind,
  type WorkspaceSignal
} from '../model.js';

/** 频道状态：已订阅（首次或断线重连后），或订阅失败、超时、被服务端关闭（例如撤权后令牌刷新时重新鉴权失败）。 */
export type FeedStatus = 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED';
/** 频道上发生的事：失效通知、撤权事件、在线会话的最新全集与频道状态变化。 */
export interface FeedEvents {
  changed(signal: WorkspaceSignal): void;
  revoked(signal: RevocationSignal): void;
  presence(sessions: Presence[]): void;
  status(status: FeedStatus): void;
}
/** 上报在线状态的会话：当前用户与本页面的会话标识（也是 Presence 的键）。 */
export interface FeedSession {
  userId: string;
  sessionId: string;
}

/** 与命令里的标识同一规则：在线状态是成员自己上报的，不合规的取值不进界面。 */
const identifier = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
const nullableIdentifier = (value: unknown): value is string | null => value === null || identifier(value);
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(item => typeof item === 'string');
const revisionOf = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;

/** 只认白名单里的字段：修订号、已知的类别与标识列表；不合规的载荷整条丢弃。 */
function parseSignal(payload: Record<string, unknown>): WorkspaceSignal | undefined {
  const { revision, kinds, prIds, noticeUserIds } = payload;
  if (
    !revisionOf(revision) ||
    !strings(kinds) ||
    !kinds.every(kind => (signalKinds as readonly string[]).includes(kind)) ||
    !strings(prIds) ||
    !strings(noticeUserIds)
  )
    return undefined;
  return { revision, kinds: kinds as SignalKind[], prIds, noticeUserIds };
}
function parseRevocation(payload: Record<string, unknown>): RevocationSignal | undefined {
  const { revision, userIds } = payload;
  return revisionOf(revision) && strings(userIds) ? { revision, userIds } : undefined;
}
/** Presence 的全集按会话展开；载荷由各会话自己上报，只保留形状合规的会话。 */
function sessionsOf(state: Record<string, Record<string, unknown>[]>): Presence[] {
  const sessions: Presence[] = [];
  for (const [sessionId, metas] of Object.entries(state)) {
    const meta = metas.at(-1);
    if (!meta || !identifier(sessionId) || typeof meta['userId'] !== 'string') continue;
    const { prId, recordId } = meta;
    if (!nullableIdentifier(prId) || !nullableIdentifier(recordId)) continue;
    sessions.push({ userId: meta['userId'], sessionId, prId, recordId });
  }
  return sessions;
}

/**
 * 当前工作区的实时通道：私有频道 `collab:<团队>:<应用>`，只有该团队与应用的可读成员能加入（`realtime.messages` 上的 RLS）。
 * - 广播 `changed`：命令提交后的失效通知，只含修订号、类别与标识；`revoked`：撤权事件。两者都只由服务端的命令事务写入。
 * - Presence：本页面会话以会话标识为键上报当前查看的 PR 与记录，不写数据库、不授予任何权限；每次（重新）订阅成功后重新上报。
 * 切换团队、离线任务或退出时 {@link WorkspaceFeed.stop} 撤销旧频道，旧频道迟到的回调一律丢弃。
 */
export class WorkspaceFeed {
  private channel?: RealtimeChannel;
  private generation = 0;
  private subscribed = false;
  private context: { prId: string | null; recordId: string | null } = { prId: null, recordId: null };
  private tracked?: string;
  private session?: FeedSession;
  constructor(
    private readonly auth: SupabaseClient,
    private readonly events: FeedEvents
  ) {}
  /** 加入工作区的私有频道并开始上报在线状态；先撤销上一个频道。 */
  start(workspace: { teamId: string; appId: string }, session: FeedSession): void {
    this.stop();
    const epoch = this.generation;
    const current = () => epoch === this.generation;
    this.session = session;
    const channel = this.auth.channel(channelTopic(workspace), {
      config: { private: true, presence: { key: session.sessionId } }
    });
    this.channel = channel
      .on('broadcast', { event: 'changed' }, message => {
        const signal = current() ? parseSignal((message['payload'] ?? {}) as Record<string, unknown>) : undefined;
        if (signal) this.events.changed(signal);
      })
      .on('broadcast', { event: 'revoked' }, message => {
        const signal = current() ? parseRevocation((message['payload'] ?? {}) as Record<string, unknown>) : undefined;
        if (signal) this.events.revoked(signal);
      })
      .on('presence', { event: 'sync' }, () => {
        if (current())
          this.events.presence(sessionsOf(channel.presenceState() as Record<string, Record<string, unknown>[]>));
      })
      .subscribe(status => {
        if (!current()) return;
        this.subscribed = status === 'SUBSCRIBED';
        if (this.subscribed) {
          this.tracked = undefined;
          this.report();
        }
        this.events.status(status as FeedStatus);
      });
  }
  /** 本页面当前查看的 PR 与记录：与上次上报不同才重新上报（尚未订阅成功时先记下，订阅成功后上报）。 */
  view(prId: string | null, recordId: string | null): void {
    this.context = { prId, recordId };
    if (this.subscribed) this.report();
  }
  /** 离开频道（服务端随之移除本会话的在线状态，其他成员收到离开）并移除频道，之后旧频道的回调不再生效。 */
  stop(): void {
    this.generation++;
    this.subscribed = false;
    this.tracked = undefined;
    const channel = this.channel;
    this.channel = undefined;
    if (channel) void this.auth.removeChannel(channel);
  }
  private report(): void {
    const channel = this.channel;
    if (!channel || !this.session) return;
    const payload = { userId: this.session.userId, ...this.context };
    const key = JSON.stringify(payload);
    if (key === this.tracked) return;
    this.tracked = key;
    void channel.track(payload);
  }
}
