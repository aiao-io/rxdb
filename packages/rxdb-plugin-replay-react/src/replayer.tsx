import {
  mountReplayer,
  type ReplayerCommitRestoreEvent,
  type ReplayerHandle,
  type ReplayerOptions
} from '@aiao/rxdb-plugin-replay';
import { forwardRef, useEffect, useEffectEvent, useImperativeHandle, useRef } from 'react';

/** {@link Replayer} 的 props：输入与 `mountReplayer` 同名，两个回调对应核心视图的 `onTimeChange` / `onCommitRestore`。 */
export interface ReplayerProps {
  /** 录制门面（`rxdb.replay`）。换实例会重新加载。 */
  readonly replay: ReplayerOptions['replay'];
  /** 要回放的会话。换会话会重新加载，不重建组件。 */
  readonly sessionId: string;
  /** 加载完成后落到的时刻（相对会话起点的 ms，默认 0）；之后再改等价于 `seek()`。 */
  readonly initialTime?: number;
  /** 播放 / 跳转导致回放时刻变化。 */
  readonly onTimeChange?: (timeMs: number) => void;
  /** 点 commit 标记后的恢复结果（成功、四种拒绝或抛错）。 */
  readonly onCommitRestore?: (event: ReplayerCommitRestoreEvent) => void;
}

/** 经 `ref` 拿到的命令句柄；加载完成前调用是空操作（`seek` 会记下目标时刻）。 */
export type ReplayerRef = Pick<ReplayerHandle, 'play' | 'pause' | 'seek'>;

type ReplayerInputs = Pick<ReplayerOptions, 'replay' | 'sessionId' | 'initialTime'>;

/** 只挑出变化了的输入；都没变返回 `undefined`。 */
const changedInputs = (previous: ReplayerInputs, next: ReplayerInputs): Partial<ReplayerInputs> | undefined => {
  const changes: { -readonly [K in keyof ReplayerInputs]?: ReplayerInputs[K] } = {};
  if (next.replay !== previous.replay) changes.replay = next.replay;
  if (next.sessionId !== previous.sessionId) changes.sessionId = next.sessionId;
  if (next.initialTime !== previous.initialTime) changes.initialTime = next.initialTime;
  return Object.keys(changes).length > 0 ? changes : undefined;
};

/**
 * 会话回放组件：在一个 `div` 里挂核心的 `mountReplayer`，输入变化走 `update()`，卸载时 `destroy()`。
 *
 * @remarks
 * 与 Angular `ao-replayer`、Vue `Replayer` 同一组输入 / 输出 / 命令（contracts/replayer-component.md §3），由 parity 用例保证。
 * `rrweb` 在核心视图里按需 `import()`，挂载这个组件之前不进包。
 *
 * @example
 * ```tsx
 * const replayer = useRef<ReplayerRef>(null);
 * <Replayer ref={replayer} replay={rxdb.replay} sessionId={sessionId} onCommitRestore={event => console.log(event.result)} />;
 * ```
 */
export const Replayer = forwardRef<ReplayerRef, ReplayerProps>(function Replayer(
  { replay, sessionId, initialTime, onTimeChange, onCommitRestore },
  ref
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<ReplayerHandle | null>(null);
  const appliedRef = useRef<ReplayerInputs | null>(null);
  // RV-070：父组件的首个 layout effect 比这里的挂载 effect（passive）先跑，那时 handle 还不
  // 存在。之前 `seek` 对着空 handle 可选调用，目标时刻直接丢了。这里记下「挂载前最新一次
  // seek 意图」，挂载时连同 handle 一起兑现；不在兑现后清空——`StrictMode` 下开发期会
  // 挂载→卸载→再挂载同一个实例，若清空就只有第一个（随即被丢弃的）handle 收得到这份意图，
  // 真正留下来的第二个 handle 反而收不到。
  const pendingSeekRef = useRef<number | null>(null);

  const readInputs = useEffectEvent((): ReplayerInputs => ({ replay, sessionId, initialTime }));
  const emitTimeChange = useEffectEvent((timeMs: number) => onTimeChange?.(timeMs));
  const emitCommitRestore = useEffectEvent((event: ReplayerCommitRestoreEvent) => onCommitRestore?.(event));

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const inputs = readInputs();
    const handle = mountReplayer(host, {
      ...inputs,
      onTimeChange: timeMs => emitTimeChange(timeMs),
      onCommitRestore: event => emitCommitRestore(event)
    });
    handleRef.current = handle;
    appliedRef.current = inputs;
    if (pendingSeekRef.current !== null) handle.seek(pendingSeekRef.current);
    return () => {
      handle.destroy();
      handleRef.current = null;
      appliedRef.current = null;
    };
  }, []);

  useEffect(() => {
    const handle = handleRef.current;
    const applied = appliedRef.current;
    if (!handle || !applied) return;
    const next = { replay, sessionId, initialTime };
    const changes = changedInputs(applied, next);
    if (!changes) return;
    appliedRef.current = next;
    handle.update(changes);
  }, [replay, sessionId, initialTime]);

  useImperativeHandle(
    ref,
    () => ({
      play: () => handleRef.current?.play(),
      pause: () => handleRef.current?.pause(),
      // 无论 handle 是否已就绪都先记下这个意图：handle 已存在时照常直接转发（行为不变）；
      // 还不存在时单靠记忆在挂载 effect 里补发——play / pause 加载前仍保持空操作，不为
      // 它们补队列（评审明确只要求 seek 记忆目标，不要求把全部命令都变成可排队的）。
      seek: timeMs => {
        pendingSeekRef.current = timeMs;
        handleRef.current?.seek(timeMs);
      }
    }),
    []
  );

  return <div ref={hostRef} />;
});
