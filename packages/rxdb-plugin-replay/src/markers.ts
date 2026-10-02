import type { eventWithTime } from '@rrweb/types';
import { RxDBReplayError } from './errors.js';

/**
 * rrweb `EventType.Custom` 的数值。
 *
 * @remarks
 * 本包运行时不静态引入 rrweb（它只经 `import('rrweb')` 按需加载），所以这里写死数值；
 * 与 `@rrweb/types` 的枚举同值由单测守着。
 */
export const REPLAY_CUSTOM_EVENT_TYPE = 5;

/** 本插件写进录像的三种标记 tag。 */
export const REPLAY_MARKER_TAGS = {
  /** 录制中工作树写入了一个新 commit。 */
  commit: 'rxdb-replay:commit',
  /** 会话因超限停止；之后不再有事件。 */
  truncated: 'rxdb-replay:truncated',
  /** 刷新续录时只拿到最小暂存，刷新前最后一段事件丢了。 */
  gap: 'rxdb-replay:gap'
} as const;

/** 会话被截断的原因：单会话超限或录制库总量超限。 */
export type ReplayTruncatedCode = 'session_limit' | 'store_limit';

/** 各标记 tag 对应的 payload 形状。 */
export interface ReplayMarkerPayloads {
  readonly 'rxdb-replay:commit': { readonly commitId: string; readonly branchId: string };
  readonly 'rxdb-replay:truncated': { readonly code: ReplayTruncatedCode; readonly limitBytes: number };
  readonly 'rxdb-replay:gap': { readonly reason: 'stash_unavailable' };
}

/** 本插件的标记 tag。 */
export type ReplayMarkerTag = keyof ReplayMarkerPayloads;

/** {@link parseReplayMarker} 的结果。 */
export type ReplayMarker = {
  [Tag in ReplayMarkerTag]: { readonly tag: Tag; readonly payload: ReplayMarkerPayloads[Tag] };
}[ReplayMarkerTag];

type PayloadGuard = (payload: Record<string, unknown>) => boolean;

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

const PAYLOAD_GUARDS: Record<ReplayMarkerTag, PayloadGuard> = {
  'rxdb-replay:commit': payload => isNonEmptyString(payload['commitId']) && isNonEmptyString(payload['branchId']),
  'rxdb-replay:truncated': payload =>
    (payload['code'] === 'session_limit' || payload['code'] === 'store_limit') &&
    Number.isSafeInteger(payload['limitBytes']) &&
    (payload['limitBytes'] as number) > 0,
  'rxdb-replay:gap': payload => payload['reason'] === 'stash_unavailable'
};

const isMarkerTag = (tag: unknown): tag is ReplayMarkerTag =>
  typeof tag === 'string' && Object.hasOwn(PAYLOAD_GUARDS, tag);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/**
 * 把一条 rrweb 事件解析成本插件的标记。
 *
 * @returns 不是 Custom 事件、或 tag 不是本插件的三种之一 → `null`
 * @throws {@link RxDBReplayError} `invalid_marker`：tag 是本插件的，但 payload 形状不对
 */
export const parseReplayMarker = (event: eventWithTime): ReplayMarker | null => {
  if (event.type !== REPLAY_CUSTOM_EVENT_TYPE) return null;
  const data: unknown = event.data;
  if (!isRecord(data) || !isMarkerTag(data['tag'])) return null;
  const { tag, payload } = data;
  if (!isRecord(payload) || !PAYLOAD_GUARDS[tag](payload)) {
    throw new RxDBReplayError('invalid_marker', `marker "${tag}" has a malformed payload`);
  }
  return { tag, payload } as ReplayMarker;
};

/**
 * 造一条标记事件，供插件在 rrweb 已停止时直接落库（截断、续录缺口）。
 *
 * @param tag - 标记 tag
 * @param payload - 对应形状的 payload
 * @param timestamp - 事件时间戳（epoch ms）
 */
export const createReplayMarkerEvent = <Tag extends ReplayMarkerTag>(
  tag: Tag,
  payload: ReplayMarkerPayloads[Tag],
  timestamp: number
): eventWithTime => ({ type: REPLAY_CUSTOM_EVENT_TYPE, data: { tag, payload }, timestamp }) as eventWithTime;

const encoder = new TextEncoder();

/**
 * 一条事件计入上限的字节数：`JSON.stringify` 后的 UTF-8 长度。
 *
 * @remarks
 * 落库的 `bytes` 列、会话与总量上限都只认这一个口径。
 */
export const eventBytes = (event: eventWithTime): number => encoder.encode(JSON.stringify(event)).length;
