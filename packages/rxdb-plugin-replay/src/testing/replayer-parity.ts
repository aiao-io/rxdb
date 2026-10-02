import type { ReplayerCommitRestoreEvent, ReplayerHandle, ReplayerOptions } from '../replayer/mount-replayer.js';
import type { ReplayManager } from '../types.js';

/** 组件的三个输入（三端同名）。 */
export interface ReplayerParityInputs {
  readonly replay: ReplayManager;
  readonly sessionId: string;
  readonly initialTime?: number;
}

/** 组件的两个输出要转到这里：Angular `aoTimeChange` / React `onTimeChange` / Vue `time-change`，恢复结果同理。 */
export interface ReplayerParityOutputs {
  timeChange(timeMs: number): void;
  commitRestore(event: ReplayerCommitRestoreEvent): void;
}

/**
 * 一个框架的组件测试为 {@link replayerParityCases} 提供的驱动：把「挂载 / 改输入 / 调命令 / 卸载」翻译成本框架的写法。
 *
 * @remarks
 * 每个用例都从 `mount()` 开始、以 `unmount()` 或用例结束为止；驱动在 `mount()` 里新建组件，不复用上一个用例的实例。
 */
export interface ReplayerParityDriver {
  /** 挂载组件，并把它的两个输出接到 `outputs`。 */
  mount(inputs: ReplayerParityInputs, outputs: ReplayerParityOutputs): Promise<void>;
  /** 只改给出的输入，等框架把变化落下去。 */
  setInputs(inputs: Partial<ReplayerParityInputs>): Promise<void>;
  /** 经组件的命令入口（实例方法 / ref 句柄 / expose）调用。 */
  play(): void;
  pause(): void;
  seek(timeMs: number): void;
  /** 卸载组件，等框架清理完。 */
  unmount(): Promise<void>;
  /** 组件渲染出的根节点：`mountReplayer` 拿到的宿主必须在它里面。 */
  container(): Element;
}

/** {@link MountReplayerSpy} 记下的一次句柄调用。 */
export type ReplayerHandleCall =
  | { readonly method: 'update'; readonly args: Parameters<ReplayerHandle['update']> }
  | { readonly method: 'play' | 'pause' | 'destroy'; readonly args: [] }
  | { readonly method: 'seek'; readonly args: Parameters<ReplayerHandle['seek']> };

/**
 * `mountReplayer` 的录制替身：组件测试用 `vi.mock` 把 `@aiao/rxdb-plugin-replay` 的 `mountReplayer` 指到 {@link MountReplayerSpy.mountReplayer}。
 *
 * @remarks
 * 不依赖 vitest，只按顺序记下挂载与句柄调用；断言由 {@link replayerParityCases} 自己做。
 */
export class MountReplayerSpy {
  /** 每次 `mountReplayer(host, options)` 的参数。 */
  readonly mounts: { readonly host: HTMLElement; readonly options: ReplayerOptions }[] = [];
  /** 句柄上每次调用，按发生顺序。 */
  readonly calls: ReplayerHandleCall[] = [];

  /** 交给 `vi.mock` 的替身函数。 */
  readonly mountReplayer = (host: HTMLElement, options: ReplayerOptions): ReplayerHandle => {
    this.mounts.push({ host, options });
    return {
      update: next => this.calls.push({ method: 'update', args: [next] }),
      play: () => this.calls.push({ method: 'play', args: [] }),
      pause: () => this.calls.push({ method: 'pause', args: [] }),
      seek: timeMs => this.calls.push({ method: 'seek', args: [timeMs] }),
      destroy: () => this.calls.push({ method: 'destroy', args: [] })
    };
  };

  /** 清空记录；每个用例开始前调用。 */
  reset(): void {
    this.mounts.length = 0;
    this.calls.length = 0;
  }

  /** 某个方法的全部调用参数。 */
  argsOf(method: ReplayerHandleCall['method']): unknown[][] {
    return this.calls.filter(call => call.method === method).map(call => call.args);
  }
}

/** 一条 parity 用例：给定驱动与替身，跑完即通过，不符合契约就抛错。 */
export interface ReplayerParityCase {
  /** 用例名（`contracts/replayer-component.md` §4 的编号与描述）。 */
  readonly name: string;
  run(driver: ReplayerParityDriver, spy: MountReplayerSpy): Promise<void>;
}

const fail = (message: string, actual: unknown): never => {
  throw new Error(`[replayer parity] ${message}; actual: ${JSON.stringify(actual)}`);
};

/** 比较只含原始值的普通对象 / 数组（用例里的参数都是这种）。 */
const assertSame = (actual: unknown, expected: unknown, message: string): void => {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    fail(`${message}; expected: ${JSON.stringify(expected)}`, actual);
};

const createInputs = (): ReplayerParityInputs => ({
  replay: { parity: 'replay' } as unknown as ReplayManager,
  sessionId: 's1',
  initialTime: 100
});

const noOutputs: ReplayerParityOutputs = { timeChange: () => undefined, commitRestore: () => undefined };

const onlyMount = (spy: MountReplayerSpy) => {
  if (spy.mounts.length !== 1) fail('mountReplayer must be called exactly once', spy.mounts.length);
  const [mounted] = spy.mounts;
  if (mounted === undefined) return fail('mountReplayer was not called', spy.mounts);
  return mounted;
};

/**
 * 三端 `Replayer` 组件共用的 parity 用例（`specs/005-us-909-session-replay/contracts/replayer-component.md` §4）。
 *
 * @remarks
 * 组件测试里 `mountReplayer` 打桩成 {@link MountReplayerSpy}，对每条用例 `spy.reset()` 后 `await testCase.run(driver, spy)`。
 * 同一份用例在三端跑：任何一端漏转发、改名、多调一次 `update()` 都会抛错。
 *
 * @example
 * ```ts
 * for (const testCase of replayerParityCases) {
 *   it(testCase.name, async () => {
 *     spy.reset();
 *     await testCase.run(driver, spy);
 *   });
 * }
 * ```
 */
export const replayerParityCases: readonly ReplayerParityCase[] = [
  {
    name: '1. 挂载 → mountReplayer 一次，宿主在组件内，输入原样传入',
    async run(driver, spy) {
      const inputs = createInputs();
      await driver.mount(inputs, noOutputs);
      const { host, options } = onlyMount(spy);
      if (!driver.container().contains(host)) fail('host must be inside the component', host.outerHTML);
      if (options.replay !== inputs.replay) fail('replay must be passed through as is', options.replay);
      assertSame(
        { sessionId: options.sessionId, initialTime: options.initialTime },
        { sessionId: inputs.sessionId, initialTime: inputs.initialTime },
        'sessionId / initialTime must be passed through'
      );
      assertSame(spy.calls, [], 'mounting must not call the handle');
    }
  },
  {
    name: '2. 改 sessionId → update({ sessionId }) 一次，不重新挂载',
    async run(driver, spy) {
      await driver.mount(createInputs(), noOutputs);
      await driver.setInputs({ sessionId: 's2' });
      onlyMount(spy);
      assertSame(spy.calls, [{ method: 'update', args: [{ sessionId: 's2' }] }], 'changing sessionId');
    }
  },
  {
    name: '3. 改 initialTime → update({ initialTime })',
    async run(driver, spy) {
      await driver.mount(createInputs(), noOutputs);
      await driver.setInputs({ initialTime: 2_000 });
      onlyMount(spy);
      assertSame(spy.calls, [{ method: 'update', args: [{ initialTime: 2_000 }] }], 'changing initialTime');
    }
  },
  {
    name: '4. onTimeChange(1234) → 时刻输出收到 1234',
    async run(driver, spy) {
      const received: number[] = [];
      await driver.mount(createInputs(), { ...noOutputs, timeChange: timeMs => received.push(timeMs) });
      onlyMount(spy).options.onTimeChange?.(1_234);
      assertSame(received, [1_234], 'time change output');
    }
  },
  {
    name: '5. onCommitRestore(e) → 恢复输出收到同一个 e',
    async run(driver, spy) {
      const received: ReplayerCommitRestoreEvent[] = [];
      await driver.mount(createInputs(), { ...noOutputs, commitRestore: event => received.push(event) });
      const event: ReplayerCommitRestoreEvent = {
        marker: { seq: 1, timestamp: 1, commitId: 'c1', branchId: 'main' },
        result: { ok: false, reason: 'dirty_working_tree' }
      };
      onlyMount(spy).options.onCommitRestore?.(event);
      if (received.length !== 1 || received[0] !== event)
        fail('commit restore output must get the same event', received);
    }
  },
  {
    name: '6. play / pause / seek(500) → 句柄同名方法各一次',
    async run(driver, spy) {
      await driver.mount(createInputs(), noOutputs);
      driver.play();
      driver.pause();
      driver.seek(500);
      assertSame(
        spy.calls,
        [
          { method: 'play', args: [] },
          { method: 'pause', args: [] },
          { method: 'seek', args: [500] }
        ],
        'commands'
      );
    }
  },
  {
    name: '7. 卸载 → destroy() 一次',
    async run(driver, spy) {
      await driver.mount(createInputs(), noOutputs);
      await driver.unmount();
      assertSame(spy.argsOf('destroy'), [[]], 'unmounting');
    }
  }
];
