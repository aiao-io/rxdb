import {
  mountReplayer,
  type ReplayerCommitRestoreEvent,
  type ReplayerHandle,
  type ReplayerOptions
} from '@aiao/rxdb-plugin-replay';
import { defineComponent, h, onBeforeUnmount, onMounted, toRaw, useTemplateRef, watch, type PropType } from 'vue';

/** 经模板 `ref` 拿到的命令（`expose`）；加载完成前调用是空操作（`seek` 会记下目标时刻）。 */
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
 * 会话回放组件：在根 `div` 上挂核心的 `mountReplayer`，props 变化走 `update()`，卸载前 `destroy()`。
 *
 * @remarks
 * 与 Angular `ao-replayer`、React `Replayer` 同一组输入 / 输出 / 命令（contracts/replayer-component.md §3），由 parity 用例保证。
 * 事件：`time-change`（回放时刻，ms）、`commit-restore`（{@link ReplayerCommitRestoreEvent}）。
 * `rrweb` 在核心视图里按需 `import()`，挂载这个组件之前不进包。
 *
 * @example
 * ```vue
 * <Replayer ref="replayer" :replay="rxdb.replay" :session-id="sessionId" @commit-restore="event => log(event.result)" />
 * ```
 */
export const Replayer = defineComponent({
  name: 'Replayer',
  props: {
    /** 录制门面（`rxdb.replay`）。换实例会重新加载。 */
    replay: { type: Object as PropType<ReplayerOptions['replay']>, required: true },
    /** 要回放的会话。换会话会重新加载，不重建组件。 */
    sessionId: { type: String, required: true },
    /** 加载完成后落到的时刻（相对会话起点的 ms，默认 0）；之后再改等价于 `seek()`。 */
    initialTime: { type: Number, default: undefined }
  },
  emits: {
    'time-change': (timeMs: number) => Number.isFinite(timeMs),
    'commit-restore': (event: ReplayerCommitRestoreEvent) => event.marker !== undefined
  },
  setup(props, { emit, expose }) {
    const host = useTemplateRef<HTMLDivElement>('host');
    let handle: ReplayerHandle | undefined;
    let applied: ReplayerInputs | undefined;
    // 父组件把门面放进 ref() / reactive() 时拿到的是代理；核心视图要原对象（门面有私有字段，也按引用比较是否换了实例）
    const readInputs = (): ReplayerInputs => ({
      replay: toRaw(props.replay),
      sessionId: props.sessionId,
      initialTime: props.initialTime
    });

    onMounted(() => {
      const element = host.value;
      if (!element) return;
      applied = readInputs();
      handle = mountReplayer(element, {
        ...applied,
        onTimeChange: timeMs => emit('time-change', timeMs),
        onCommitRestore: event => emit('commit-restore', event)
      });
    });

    watch(readInputs, next => {
      if (!handle || !applied) return;
      const changes = changedInputs(applied, next);
      if (!changes) return;
      applied = next;
      handle.update(changes);
    });

    onBeforeUnmount(() => {
      handle?.destroy();
      handle = undefined;
      applied = undefined;
    });

    const exposed: ReplayerRef = {
      play: () => handle?.play(),
      pause: () => handle?.pause(),
      seek: timeMs => handle?.seek(timeMs)
    };
    expose(exposed);

    return () => h('div', { ref: 'host' });
  }
});
