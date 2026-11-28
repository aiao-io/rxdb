import type { CommitPage, CommitSummary } from '../model.js';

/** 提交历史所属的分支：共享分支，或某个 PR 的来源任务分支。 */
export type HistoryBranch = { branch: 'shared' } | { prId: string };
/** 视图读取到的一条分支历史：已加载的提交（从新到旧）与是否还有更早的提交可读。 */
export interface HistoryView {
  commits: CommitSummary[];
  hasEarlier: boolean;
}
/** 一条分支在某个头提交下已加载的历史。 */
interface Entry {
  commits: CommitSummary[];
  nextBefore: string | null;
}

const branchKey = (branch: HistoryBranch) => ('prId' in branch ? `pr:${branch.prId}` : 'shared');

/**
 * 按「分支 + 头提交」缓存的提交历史，供视图同步读取。提交链不可变，同一个头下读到的页永远有效；
 * 头变化即换键，从第一页重新读，旧头的页随之丢弃。
 * - {@link CommitHistory.peek}：命中同步返回；未命中返回 undefined 并在后台读第一页，同一键只读一次，读完通知 `loaded`。
 * - 失败：记录该键，之后的 `peek` 不再自动重试，避免失败请求在重绘里形成重试风暴；{@link CommitHistory.retry} 清除记录后再试。
 * - {@link CommitHistory.loadEarlier}：用户操作，用最后一页的 `nextBefore` 读下一页并接在后面，失败抛给调用方。
 * - {@link CommitHistory.reset}：丢弃全部历史并使进行中的读取失效，其结果不再写入，也不再通知。
 */
export class CommitHistory {
  /** `${分支}@${头}` → 已加载的历史。 */
  private readonly entries = new Map<string, Entry>();
  /** 进行中的读取：第一页以 `${分支}@${头}` 为键，更早的页再接上 `<${游标}`。 */
  private readonly pending = new Map<string, Promise<void>>();
  /** 第一页读取失败过的 `${分支}@${头}`。 */
  private readonly failures = new Set<string>();
  private epoch = 0;

  /**
   * @param fetch 读取分支历史的一页；`before` 为 undefined 时读第一页。必须返回 Promise（不能同步抛错）。
   * @param loaded 一页读取完成并接入后调用，通常用来触发界面重绘。
   * @param failed 后台读取第一页失败时调用；用户操作发起的「加载更早」失败由调用方自己处理，不经此处。
   */
  constructor(
    private readonly fetch: (branch: HistoryBranch, before: string | undefined) => Promise<CommitPage>,
    private readonly loaded: () => void,
    private readonly failed: (error: unknown) => void
  ) {}

  /** 同步读取分支在 `head` 下的历史；`head` 为 null（空分支、任务还没有提交）时是空列表，不发请求。 */
  peek(branch: HistoryBranch, head: string | null): HistoryView | undefined {
    if (head === null) return { commits: [], hasEarlier: false };
    const slot = `${branchKey(branch)}@${head}`;
    const entry = this.entries.get(slot);
    if (entry) return { commits: entry.commits, hasEarlier: entry.nextBefore !== null };
    if (this.pending.has(slot) || this.failures.has(slot)) return undefined;
    this.forget(branch);
    this.track(slot, this.first(branch, slot));
    return undefined;
  }

  /**
   * 读取分支在 `head` 下的下一页并接在已加载的提交后面。还没读到第一页、没有更早的提交、
   * 或读取期间头已换键（旧头的页被丢弃）或被重置时，这一页没有可接续的位置，什么也不做。
   */
  loadEarlier(branch: HistoryBranch, head: string): Promise<void> {
    const slot = `${branchKey(branch)}@${head}`;
    const entry = this.entries.get(slot);
    if (!entry || entry.nextBefore === null) return Promise.resolve();
    const cursor = entry.nextBefore;
    const key = `${slot}<${cursor}`;
    const joined = this.pending.get(key);
    if (joined) return joined;
    const epoch = this.epoch;
    const request = this.fetch(branch, cursor).then(page => {
      if (epoch !== this.epoch || this.entries.get(slot) !== entry) return;
      this.entries.set(slot, { commits: [...entry.commits, ...page.commits], nextBefore: page.nextBefore });
      this.loaded();
    });
    this.track(key, request);
    return request;
  }

  /** 清除失败记录，之后对失败过的键的下一次 `peek` 会再试一次。 */
  retry(): void {
    this.failures.clear();
  }

  /** 丢弃全部历史与失败记录，并使进行中的读取失效。 */
  reset(): void {
    this.epoch++;
    this.entries.clear();
    this.pending.clear();
    this.failures.clear();
  }

  /** 后台读第一页：成功写入并通知，失败记下该键并报告一次；期间被重置则两者都不做。 */
  private first(branch: HistoryBranch, slot: string): Promise<void> {
    const epoch = this.epoch;
    return this.fetch(branch, undefined).then(
      page => {
        if (epoch !== this.epoch) return;
        this.entries.set(slot, { commits: page.commits, nextBefore: page.nextBefore });
        this.loaded();
      },
      (error: unknown) => {
        if (epoch !== this.epoch) return;
        this.failures.add(slot);
        this.failed(error);
      }
    );
  }

  /** 丢弃同一分支其他头下的历史：头已变化，那些页不再显示。 */
  private forget(branch: HistoryBranch): void {
    const prefix = `${branchKey(branch)}@`;
    for (const slot of [...this.entries.keys()]) if (slot.startsWith(prefix)) this.entries.delete(slot);
  }

  /** 登记进行中的读取，结束后移除（期间被重置或被同键的新读取取代时不动别人的登记）。 */
  private track(key: string, request: Promise<void>): void {
    this.pending.set(key, request);
    const settled = () => {
      if (this.pending.get(key) === request) this.pending.delete(key);
    };
    void request.then(settled, settled);
  }
}
