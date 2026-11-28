import { demand, receiptRetentionMs, type Command, type Commit } from '../model.js';

/** 一个本机任务的身份：用户 × 团队 × 应用 × 任务。进账本键、团队库名与解锁集合，不只存在于框架内存里（ADMIN-US-204）。 */
export interface Context {
  userId: string;
  teamId: string;
  appId: string;
  taskId: string;
}
/** 上下文的比较键：四项按固定顺序组成的 JSON 数组。 */
export const contextKey = (context: Context) =>
  JSON.stringify([context.userId, context.teamId, context.appId, context.taskId]);

/**
 * 一次尚未确认的上传：幂等键、发出时的远端任务头、这次上传的最后一个提交与形成时间。
 * 提交本身在团队库的提交图里（不可变），任务分支是线性的，`expectedHead` 之后到 `head` 为止的提交由提交图唯一确定，
 * 重试时原样交出同一批提交与同一个幂等键。`createdAt` 只用于判断是否还能自动重试，不随请求发出。
 */
export interface PendingUpload {
  operationId: string;
  expectedHead: string;
  head: string;
  createdAt: number;
}

/**
 * 本机任务账本里的一条：同步与解锁需要的元数据。记录、工作树与提交都在团队库里（平台 working-tree），这里没有任何记录取值。
 * - `base` 是任务的共同起点（共享分支上的提交），`branchId` 是团队库里承载这个任务的分支；
 * - `remoteHead` 是服务端最近一次确认的任务头，团队库里一定有这个提交，「已提交未同步」就是它之后的本机提交；
 * - `uploads` 至多一条，是正在确认中的上传；`forkArchive` 记下另存为新任务时带走的本机头，原任务之后可以跟随远端；
 * - `locked` 与 `verifiedAt` 决定离线冷启动能不能解锁它：退出账号即锁定，只有联网验证过、未锁定的任务可以离线打开。
 */
export interface TaskEntry {
  context: Context;
  name: string;
  base: string;
  branchId: string;
  remoteHead: string;
  uploads: PendingUpload[];
  forkArchive?: { taskId: string; head: string };
  locked: boolean;
  verifiedAt: number;
}

/** 账本用的键值存储（浏览器里是 `localStorage`，单测里是内存实现）。 */
export interface LedgerStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * 本机自动重试待确认请求的期限：比服务端回执保留期（{@link receiptRetentionMs}）早一天停止，
 * 给本机与服务端的时钟偏差留出余量；超过后服务端可能已清理回执，无法再用原幂等键确认结果，交给用户确认。
 */
export const autoRetryWindowMs = receiptRetentionMs - 86_400_000;
/** 首次发出（或形成）于 `createdAt` 的请求是否已超过自动重试期限；没有有效时间的按已超过处理。 */
export function retryWindowPassed(createdAt: number | undefined, now = Date.now()): boolean {
  return createdAt === undefined || !Number.isFinite(createdAt) || now - createdAt >= autoRetryWindowMs;
}
/** 待确认的上传还原成上传命令：只取命令字段，本机记账用的 `createdAt` 与 `head` 不随请求发出（服务端拒绝多余字段）。 */
export function uploadCommand(
  taskId: string,
  upload: PendingUpload,
  commits: Commit[]
): Extract<Command, { type: 'upload' }> {
  return { type: 'upload', taskId, operationId: upload.operationId, expectedHead: upload.expectedHead, commits };
}

/**
 * 本机任务账本：每个用户一个存储键（`admin-collaboration-tasks-v1:<用户>`），值是这个用户全部任务条目的 JSON 数组。
 * 读改写是同步的一次 `getItem` / `setItem`，同一页面内不会交错；跨标签页的并发写以后写者为准，
 * 账本里的每一项都能从团队库与服务端重新得到（远端头可重读，上传按幂等键与提交 ID 去重），不会因此丢失已保存的编辑。
 */
export class TaskLedger {
  constructor(private readonly storage: LedgerStorage) {}
  /** 某个用户的全部条目，按写入顺序。 */
  list(userId: string): TaskEntry[] {
    const value = this.storage.getItem(storageKey(userId));
    return value ? (JSON.parse(value) as TaskEntry[]) : [];
  }
  /** 读一个任务的条目（副本）；没有时为 undefined。 */
  read(context: Context): TaskEntry | undefined {
    const key = contextKey(context);
    return this.list(context.userId).find(entry => contextKey(entry.context) === key);
  }
  /**
   * 改写一个任务的条目：`change` 收到当前条目（没有时为 undefined）并交回新条目，新条目的上下文必须与 `context` 一致。
   * @returns 写入后的条目（副本）。
   */
  write(context: Context, change: (current: TaskEntry | undefined) => TaskEntry): TaskEntry {
    const key = contextKey(context);
    const entries = this.list(context.userId);
    const index = entries.findIndex(entry => contextKey(entry.context) === key);
    const next = change(index < 0 ? undefined : entries[index]);
    demand(contextKey(next.context) === key, 'invalid', '本地上下文不匹配');
    if (index < 0) entries.push(next);
    else entries[index] = next;
    this.storage.setItem(storageKey(context.userId), JSON.stringify(entries));
    return structuredClone(next);
  }
  /** 锁定一个用户的全部条目（退出账号）：条目与团队库都保留，离线冷启动不再解锁它们，直到联网重新验证。 */
  lock(userId: string): void {
    const entries = this.list(userId).map(entry => ({ ...entry, locked: true }));
    this.storage.setItem(storageKey(userId), JSON.stringify(entries));
  }
}

/** 账本的存储键：格式版本加用户。 */
const storageKey = (userId: string) => `admin-collaboration-tasks-v1:${userId}`;
