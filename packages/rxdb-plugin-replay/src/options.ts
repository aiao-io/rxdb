import type { EntityType, RxDB } from '@aiao/rxdb';
import type { eventWithTime } from '@rrweb/types';
import type { recordOptions } from 'rrweb';

/**
 * 永远并入 `record.blockSelector` 的选择器：给元素加上 `data-rxdb-replay-block` 属性，
 * 它在录像里就只剩一个同尺寸的占位块。应用不需要懂 rrweb 也能标出敏感区块。
 */
export const REPLAY_BLOCK_SELECTOR = '[data-rxdb-replay-block]';

/** 透传给 rrweb `record()` 的脱敏 / 屏蔽选项子集；含义照 rrweb 文档。 */
export type RxDBReplayRecordOptions = Pick<
  recordOptions<eventWithTime>,
  | 'maskAllInputs'
  | 'maskInputOptions'
  | 'maskTextSelector'
  | 'maskTextClass'
  | 'blockSelector'
  | 'blockClass'
  | 'ignoreSelector'
>;

/**
 * 录制库工厂：收到本插件的实体清单，返回一个**独立**的 `RxDB`（不要是被录的应用库）。
 *
 * @remarks
 * 每个连接纪元只在第一次需要存储时调用一次。返回的库若尚未 `init()`，插件替它 `init()` 后再 `connect()`。
 */
export type ReplayRecordingDbFactory = (entities: readonly EntityType[]) => RxDB | Promise<RxDB>;

/** `rxdb.use(rxDBPluginReplay, options)` 的选项。 */
export interface RxDBReplayOptions {
  /** 录制库工厂，必填。见 {@link ReplayRecordingDbFactory}。 */
  readonly createRecordingDb: ReplayRecordingDbFactory;
  /** 体积上限，按 `JSON.stringify` 后的 UTF-8 字节计。超限绝不自动删除旧数据。 */
  readonly limits?: {
    /** 单会话上限；超出时该会话停止录制并标为 `truncated`。@defaultValue 16 MiB */
    readonly sessionBytes?: number;
    /** 录制库总量上限；达到后拒绝开始新会话。必须 ≥ `sessionBytes`。@defaultValue 128 MiB */
    readonly storeBytes?: number;
  };
  /** 事件落库节奏：先到哪个条件就冲刷一次。 */
  readonly flush?: {
    /** 最长缓冲时间。@defaultValue 1000 */
    readonly intervalMs?: number;
    /** 最多缓冲条数。@defaultValue 200 */
    readonly maxEvents?: number;
  };
  /** 脱敏 / 屏蔽选项，`maskAllInputs` 默认 `true`。 */
  readonly record?: RxDBReplayRecordOptions;
}

/** 补齐默认值、校验过的选项。 */
export interface ResolvedReplayOptions {
  readonly createRecordingDb: ReplayRecordingDbFactory;
  readonly limits: { readonly sessionBytes: number; readonly storeBytes: number };
  readonly flush: { readonly intervalMs: number; readonly maxEvents: number };
  readonly record: RxDBReplayRecordOptions;
}

const MIB = 1024 * 1024;

/** 子集里的键；只有这些会从 `options.record` 里拷出来。 */
const RECORD_KEYS = [
  'maskAllInputs',
  'maskInputOptions',
  'maskTextSelector',
  'maskTextClass',
  'blockSelector',
  'blockClass',
  'ignoreSelector'
] as const satisfies readonly (keyof RxDBReplayRecordOptions)[];

const positiveSafeInteger = (field: string, value: number): number => {
  if (Number.isSafeInteger(value) && value > 0) return value;
  throw new RangeError(`[rxdb-plugin-replay] ${field} must be a positive safe integer, got ${String(value)}`);
};

const resolveRecordOptions = (record: RxDBReplayRecordOptions = {}): RxDBReplayRecordOptions => {
  const picked: Record<string, unknown> = {};
  for (const key of RECORD_KEYS) {
    if (record[key] !== undefined) picked[key] = record[key];
  }
  return {
    ...picked,
    maskAllInputs: record.maskAllInputs ?? true,
    blockSelector: record.blockSelector ? `${record.blockSelector}, ${REPLAY_BLOCK_SELECTOR}` : REPLAY_BLOCK_SELECTOR
  };
};

/**
 * 补齐默认值并校验 {@link RxDBReplayOptions}。
 *
 * @throws TypeError 没给选项，或 `createRecordingDb` 不是函数
 * @throws RangeError 上限 / 冲刷参数不是正的安全整数，或 `sessionBytes > storeBytes`
 */
export const resolveReplayOptions = (options: RxDBReplayOptions | undefined): ResolvedReplayOptions => {
  if (typeof options?.createRecordingDb !== 'function') {
    throw new TypeError('[rxdb-plugin-replay] options.createRecordingDb must be a function');
  }
  const sessionBytes = positiveSafeInteger('limits.sessionBytes', options.limits?.sessionBytes ?? 16 * MIB);
  const storeBytes = positiveSafeInteger('limits.storeBytes', options.limits?.storeBytes ?? 128 * MIB);
  if (sessionBytes > storeBytes) {
    throw new RangeError(
      `[rxdb-plugin-replay] limits.sessionBytes (${sessionBytes}) must not exceed limits.storeBytes (${storeBytes})`
    );
  }
  return {
    createRecordingDb: options.createRecordingDb,
    limits: { sessionBytes, storeBytes },
    flush: {
      intervalMs: positiveSafeInteger('flush.intervalMs', options.flush?.intervalMs ?? 1000),
      maxEvents: positiveSafeInteger('flush.maxEvents', options.flush?.maxEvents ?? 200)
    },
    record: resolveRecordOptions(options.record)
  };
};
