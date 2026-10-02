import type { ReplayEventEntry } from './store.js';

/**
 * 刷新暂存（`specs/005-us-909-session-replay/data-model.md` §4）。
 *
 * @remarks
 * 只在 `pagehide` 写、下一次安装时读并立刻删、`stop()` / 截断 / `pageshow(persisted)` 时删。
 * `gap: true` 表示完整暂存写不进去（配额），只留了会话 id 与计数器，刷新前最后一段事件已经丢了。
 */
export interface ReplayStash {
  readonly v: 1;
  readonly sessionId: string;
  readonly nextSeq: number;
  readonly events: readonly ReplayEventEntry[];
  readonly gap?: true;
}

/** {@link claimReplayStash} 的结果。 */
export type ReplayStashClaim =
  | { readonly kind: 'none' }
  | { readonly kind: 'stash'; readonly stash: ReplayStash }
  | { readonly kind: 'invalid'; readonly sessionId: string | null; readonly error: Error };

/** 暂存键：每个被录应用库一个。 */
export const replayStashKey = (dbName: string): string => `rxdb-replay:active:${dbName}`;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isSeq = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

const isEntry = (value: unknown): value is ReplayEventEntry =>
  isRecord(value) && isSeq(value['seq']) && isRecord(value['event']) && typeof value['event']['timestamp'] === 'number';

const isStash = (value: Record<string, unknown>): value is Record<string, unknown> & ReplayStash =>
  value['v'] === 1 &&
  typeof value['sessionId'] === 'string' &&
  value['sessionId'].length > 0 &&
  isSeq(value['nextSeq']) &&
  Array.isArray(value['events']) &&
  value['events'].every(isEntry) &&
  (value['gap'] === undefined || value['gap'] === true);

const parse = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

/**
 * 认领暂存：读出来、**立刻删键**、校验形状。
 *
 * @remarks
 * 先删后验：复制标签页会复制 `sessionStorage`，键一旦被读到就不能再留给第二个页面续同一个会话。
 * 形状不对时不猜、不续录，交给调用方经 `state$` 报 `error`。
 */
export const claimReplayStash = (storage: Storage, key: string): ReplayStashClaim => {
  const raw = storage.getItem(key);
  if (raw === null) return { kind: 'none' };
  storage.removeItem(key);
  const value = parse(raw);
  if (isRecord(value) && isStash(value)) return { kind: 'stash', stash: value };
  const sessionId = isRecord(value) && typeof value['sessionId'] === 'string' ? value['sessionId'] : null;
  return {
    kind: 'invalid',
    sessionId,
    error: new Error(`[rxdb-plugin-replay] discarded a malformed resume stash under "${key}"`)
  };
};

/**
 * 写暂存：先写完整的；`setItem` 抛（配额）时改写只含计数器的最小暂存。
 *
 * @remarks
 * 最小暂存也写不进去时什么都不留：会话停在 `recording`，与直接关掉标签页一样（research D5 边界场景）。
 * 这里在 `pagehide` 里同步执行，异常不能外抛——外抛只会打断页面卸载，并不能救回事件。
 */
export const writeReplayStash = (
  storage: Storage,
  key: string,
  state: { readonly sessionId: string; readonly nextSeq: number; readonly events: readonly ReplayEventEntry[] }
): void => {
  const full: ReplayStash = { v: 1, sessionId: state.sessionId, nextSeq: state.nextSeq, events: state.events };
  try {
    storage.setItem(key, JSON.stringify(full));
    return;
  } catch {
    // 配额不够：落最小暂存
  }
  const minimal: ReplayStash = { v: 1, sessionId: state.sessionId, nextSeq: state.nextSeq, events: [], gap: true };
  try {
    storage.setItem(key, JSON.stringify(minimal));
  } catch {
    // 连最小暂存都放不下：放弃续录
  }
};

/** 续录时实际要补写的事件：会话行 `nextSeq` 之前的那段已经落库，按 `seq` 过滤掉。 */
export const unwrittenStashEvents = (stash: ReplayStash, sessionNextSeq: number): ReplayEventEntry[] =>
  stash.events.filter(entry => entry.seq >= sessionNextSeq);
