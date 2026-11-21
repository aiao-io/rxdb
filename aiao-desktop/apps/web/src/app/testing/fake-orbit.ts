import type {
  OrbitAppOptions,
  OrbitEventBus,
  OrbitInstance,
  OrbitRequestHandler,
  OrbitRuntime,
  OrbitSnapshot,
  OrbitState,
  OrbitValue
} from '@aiao/orbit';
import { OrbitError } from '@aiao/orbit';

/**
 * Orbit 实例的替身：状态机与真实实例一致（`created → loading → ready ↔ hidden`，失败进 `failed`，销毁进 `destroyed`），
 * 但是否就绪、何时失败由测试控制。销毁时像真实实例一样清掉处理函数、拒绝 `ready`，
 * 登记过的处理函数另存在 {@link registered}，测试用它模拟「已经派发出去的旧请求」迟到。
 */
export class FakeOrbitInstance implements OrbitInstance {
  private readonly observers = new Set<(snapshot: OrbitSnapshot) => void>();
  private resolveReady!: () => void;
  private rejectReady!: (error: unknown) => void;
  private current: OrbitState = 'created';

  /** 现在还生效的处理函数（销毁后清空）。 */
  readonly handlers = new Map<string, OrbitRequestHandler>();
  /** 曾经登记过的处理函数（销毁后仍保留，供测试模拟迟到的旧请求）。 */
  readonly registered = new Map<string, OrbitRequestHandler>();
  /** 宿主推给应用的事件。 */
  readonly emitted: [string, OrbitValue][] = [];
  /** 对实例做过的操作，按先后。 */
  readonly calls: string[] = [];
  readonly ready: Promise<void>;
  container: unknown;

  get snapshot(): OrbitSnapshot {
    const { appId, instanceId, version, url } = this.options;
    return Object.freeze({ appId, instanceId, version, url, state: this.current });
  }

  constructor(readonly options: OrbitAppOptions) {
    this.ready = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    void this.ready.catch(() => undefined);
  }

  mount(container: HTMLElement): Promise<void> {
    this.container = container;
    this.calls.push('mount');
    this.move('loading');
    return this.ready;
  }

  hide(): void {
    this.calls.push('hide');
    this.move('hidden');
  }

  show(): void {
    this.calls.push('show');
    this.move('ready');
  }

  focus(): void {
    this.calls.push('focus');
  }

  setProps(): void {
    this.calls.push('setProps');
  }

  emit(event: string, ...args: unknown[]): void {
    this.emitted.push([event, args[0] as OrbitValue]);
  }

  request(): Promise<OrbitValue> {
    return Promise.reject(new OrbitError('UNKNOWN_METHOD', '替身实例不处理宿主发起的请求'));
  }

  onRequest(method: string, handler: OrbitRequestHandler): () => void {
    if (this.handlers.has(method)) throw new OrbitError('INVALID_STATE', `请求处理函数重复：${method}`);
    this.handlers.set(method, handler);
    this.registered.set(method, handler);
    return () => {
      if (this.handlers.get(method) === handler) this.handlers.delete(method);
    };
  }

  subscribe(handler: (snapshot: OrbitSnapshot) => void): () => void {
    if (this.current === 'destroyed' || this.current === 'failed')
      throw new OrbitError('DESTROYED', '实例或连接已销毁');
    this.observers.add(handler);
    return () => {
      this.observers.delete(handler);
    };
  }

  destroy(): void {
    if (this.current === 'destroyed') return;
    this.calls.push('destroy');
    this.rejectReady(new OrbitError('DESTROYED', '实例或连接已销毁'));
    this.handlers.clear();
    this.move('destroyed');
    this.observers.clear();
  }

  /** 应用报告就绪。 */
  becomeReady(): void {
    this.move('ready');
    this.resolveReady();
  }

  /** 实例失败（超时、握手失败、应用自报失败…）：拒绝 `ready`，清掉处理函数，状态进 `failed`。 */
  failWith(error: unknown): void {
    if (this.current === 'destroyed' || this.current === 'failed') return;
    this.rejectReady(error);
    this.handlers.clear();
    this.move('failed');
    this.observers.clear();
  }

  /** 旧实例的就绪晚到：不管实例是不是还活着，`ready` 都被兑现（真实实例做不到，这里专门模拟「迟到的 ready」）。 */
  resolveLate(): void {
    this.resolveReady();
  }

  private move(next: OrbitState): void {
    if (this.current === next) return;
    this.current = next;
    for (const observer of [...this.observers]) observer(this.snapshot);
  }
}

/** Orbit 运行内核的替身：每次 `createApp` 记下一个 {@link FakeOrbitInstance}，在役的实例 ID 不能重复。 */
export class FakeOrbitRuntime implements OrbitRuntime {
  /** 创建过的全部实例，按先后。 */
  readonly created: FakeOrbitInstance[] = [];
  readonly bus = undefined as unknown as OrbitEventBus;

  get instances(): readonly OrbitSnapshot[] {
    return this.created
      .filter(item => !['destroyed', 'failed'].includes(item.snapshot.state))
      .map(item => item.snapshot);
  }

  /** 最近创建的实例。 */
  get last(): FakeOrbitInstance {
    const last = this.created.at(-1);
    if (!last) throw new Error('还没有创建过 Orbit 实例');
    return last;
  }

  createApp(options: OrbitAppOptions): FakeOrbitInstance {
    if (this.instances.some(item => item.instanceId === options.instanceId))
      throw new OrbitError('DUPLICATE_INSTANCE', `实例已存在：${options.instanceId}`);
    const instance = new FakeOrbitInstance(options);
    this.created.push(instance);
    return instance;
  }

  dispose(): void {
    for (const instance of this.created) instance.destroy();
  }
}
