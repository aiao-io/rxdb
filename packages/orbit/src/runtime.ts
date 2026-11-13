import { EventBus } from './bus.js';
import { aborted, checkName, checkTimeout, destroyed, OrbitError } from './errors.js';
import { createFrame } from './frame.js';
import { copyProps, copyValue, isRecord } from './payload.js';
import type { Message } from './protocol.js';
import { CHANNEL_PARAM, PROTOCOL, readMessage } from './protocol.js';
import { Rpc } from './rpc.js';
import type {
  OrbitAppOptions,
  OrbitInstance,
  OrbitOptions,
  OrbitProps,
  OrbitRequestHandler,
  OrbitRequestOptions,
  OrbitRuntime,
  OrbitSnapshot,
  OrbitState,
  OrbitValue
} from './types.js';

/** 文档 load 之后等待握手的宽限期：应用按约定在业务初始化之前握手，错误页与未接入 SDK 的页面永远不会握手。 */
const HANDSHAKE_GRACE_MS = 3000;

class Instance implements OrbitInstance {
  private resolveReady!: () => void;
  private rejectReady!: (error: unknown) => void;
  private state: OrbitState = 'created';
  private props: OrbitProps;
  private readonly rpc = new Rpc(message => this.send(message));
  private readonly observers = new Set<(snapshot: OrbitSnapshot) => void>();
  private container?: HTMLElement;
  private host?: HTMLElement;
  private frame?: HTMLIFrameElement;
  private view?: Window;
  private port?: MessagePort;
  private timer?: ReturnType<typeof setTimeout>;
  private handshake?: ReturnType<typeof setTimeout>;
  private channel = '';
  private loaded = false;
  readonly ready: Promise<void>;

  get snapshot(): OrbitSnapshot {
    const { appId, instanceId, version, url } = this.options;
    return Object.freeze({ appId, instanceId, version, url, state: this.state });
  }

  constructor(
    private readonly options: OrbitAppOptions,
    private readonly release: () => void,
    private readonly events: EventBus,
    private readonly report: (error: unknown) => void
  ) {
    this.props = copyProps(options.props ?? {});
    this.ready = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    void this.ready.catch(() => undefined);
    options.signal?.addEventListener('abort', this.onAbort, { once: true });
  }

  mount(container: HTMLElement): Promise<void> {
    this.assertLive();
    if (this.container && this.container !== container)
      throw new OrbitError('INVALID_STATE', '实例不能移动到其他容器，请先销毁');
    if (this.container) return this.ready;
    if (!container.isConnected) throw new OrbitError('INVALID_OPTIONS', '装载容器必须连接到文档');
    const view = container.ownerDocument.defaultView;
    if (!view || typeof MessageChannel === 'undefined')
      throw new OrbitError('UNSUPPORTED', '当前环境不支持 iframe 通信');
    this.container = container;
    this.view = view;
    try {
      const { host, frame } = createFrame(container.ownerDocument, this.onDisconnect);
      this.host = host;
      this.frame = frame;
      this.channel = crypto.randomUUID();
      const url = new URL(this.options.url);
      url.searchParams.set(CHANNEL_PARAM, this.channel);
      frame.title = this.options.title ?? this.options.appId;
      frame.allow = this.options.allow ?? '';
      frame.onload = this.onLoad;
      frame.onerror = () => this.fail(new OrbitError('LOAD_ERROR', '应用文档加载失败'));
      view.addEventListener('message', this.onHello);
      this.timer = setTimeout(() => this.fail(new OrbitError('TIMEOUT', '应用未在期限内就绪')), this.options.timeout);
      frame.src = url.href;
      this.setState('loading');
      if (this.state === 'loading') container.append(host);
    } catch (error) {
      this.fail(error);
    }
    return this.ready;
  }

  hide(): void {
    this.assertReady();
    this.host!.style.display = 'none';
    this.send({ type: 'visibility', visible: false });
    this.setState('hidden');
  }

  show(): void {
    this.assertReady();
    this.host!.style.display = 'block';
    this.send({ type: 'visibility', visible: true });
    this.setState('ready');
  }

  focus(): void {
    this.assertLive();
    if (this.state !== 'ready') throw new OrbitError('INVALID_STATE', '只有显示中的就绪应用可以获得焦点');
    this.frame!.focus();
  }

  setProps(props: OrbitProps): void {
    this.assertLive();
    this.props = copyProps(props);
    if (this.port) this.send({ type: 'props', props: this.props });
  }

  emit(event: string, ...args: unknown[]): void {
    checkName(event);
    this.send({ type: 'event', event, args: copyValue(args) as OrbitValue[] });
  }

  request(method: string, payload?: OrbitValue, options?: OrbitRequestOptions): Promise<OrbitValue> {
    return this.rpc.request(method, payload, options);
  }

  onRequest(method: string, handler: OrbitRequestHandler): () => void {
    return this.rpc.onRequest(method, handler);
  }

  subscribe(handler: (snapshot: OrbitSnapshot) => void): () => void {
    this.assertLive();
    this.observers.add(handler);
    return () => {
      this.observers.delete(handler);
    };
  }

  destroy(): void {
    if (this.state === 'destroyed') return;
    this.rejectReady(destroyed());
    this.cleanup();
    this.setState('destroyed');
    this.observers.clear();
  }

  broadcast(event: string, args: OrbitValue[]): void {
    if (this.port) this.send({ type: 'event', event, args });
  }

  private readonly onAbort = () => this.fail(aborted());
  private readonly onDisconnect = () => this.destroy();
  private readonly onLoad = () => {
    if (this.loaded) this.fail(new OrbitError('NAVIGATION', '应用发生文档导航，请创建新实例'));
    this.loaded = true;
    if (!this.port) this.handshake = setTimeout(this.onHandshakeTimeout, HANDSHAKE_GRACE_MS);
  };

  private readonly onHandshakeTimeout = () =>
    this.fail(new OrbitError('LOAD_ERROR', '应用文档加载后未连接：入口不可达、被浏览器拦截或未接入 SDK'));

  private readonly onHello = (event: MessageEvent<unknown>) => {
    if (
      !event.source ||
      event.source !== this.frame?.contentWindow ||
      event.origin !== new URL(this.options.url).origin ||
      !isRecord(event.data)
    )
      return;
    if (
      event.data['protocol'] !== PROTOCOL ||
      event.data['type'] !== 'hello' ||
      event.data['channel'] !== this.channel ||
      this.port
    )
      return;
    const channel = new MessageChannel();
    this.port = channel.port1;
    this.port.onmessage = event => {
      try {
        const message = readMessage(event.data);
        if (message) this.receive(message);
      } catch (error) {
        this.report(error);
      }
    };
    this.port.onmessageerror = () => this.fail(new OrbitError('INVALID_PAYLOAD', '无法解析应用消息'));
    this.view?.removeEventListener('message', this.onHello);
    clearTimeout(this.handshake);
    event.source.postMessage(
      {
        protocol: PROTOCOL,
        type: 'init',
        channel: this.channel,
        context: { ...this.snapshot, props: this.props, visible: true }
      },
      { targetOrigin: event.origin, transfer: [channel.port2] }
    );
  };

  private receive(message: Message): void {
    if (message.type === 'ready' && this.state === 'loading') {
      clearTimeout(this.timer);
      this.setState('ready');
      this.resolveReady();
      return;
    }
    if (message.type === 'error') {
      this.fail(new OrbitError('APP_ERROR', message.message));
      return;
    }
    if (message.type === 'disposed') {
      this.fail(new OrbitError('NAVIGATION', '子应用连接已关闭'));
      return;
    }
    if (message.type === 'event') {
      this.events.dispatch(message.event, message.args);
      return;
    }
    this.rpc.receive(message);
  }

  private send(message: Message): void {
    this.assertLive();
    if (!this.port) throw new OrbitError('INVALID_STATE', '应用尚未连接');
    this.port.postMessage(message);
  }

  private assertLive(): void {
    if (this.state === 'destroyed' || this.state === 'failed') throw destroyed();
  }

  private assertReady(): void {
    this.assertLive();
    if (this.state !== 'ready' && this.state !== 'hidden') throw new OrbitError('INVALID_STATE', '应用尚未就绪');
  }

  private fail(error: unknown): void {
    if (this.state === 'destroyed' || this.state === 'failed') return;
    this.rejectReady(error);
    this.cleanup();
    this.setState('failed');
    this.observers.clear();
    this.report(error);
  }

  private setState(state: OrbitState): void {
    if (this.state === state) return;
    this.state = state;
    const snapshot = this.snapshot;
    for (const observer of [...this.observers]) {
      try {
        observer(snapshot);
      } catch (error) {
        this.report(error);
      }
    }
  }

  private cleanup(): void {
    clearTimeout(this.timer);
    clearTimeout(this.handshake);
    this.options.signal?.removeEventListener('abort', this.onAbort);
    this.view?.removeEventListener('message', this.onHello);
    if (this.port) {
      this.port.postMessage({ type: 'disposed' });
      this.port.onmessage = null;
      this.port.onmessageerror = null;
      this.port.close();
    }
    this.rpc.dispose();
    this.host?.removeEventListener('orbit-disconnect', this.onDisconnect);
    if (this.frame) {
      this.frame.onload = null;
      this.frame.onerror = null;
    }
    this.host?.remove();
    this.host = undefined;
    this.frame = undefined;
    this.port = undefined;
    this.container = undefined;
    this.view = undefined;
    this.release();
  }
}

function normalizeApp(options: OrbitAppOptions, origins: ReadonlySet<string>): OrbitAppOptions {
  checkName(options.appId);
  checkName(options.instanceId);
  checkName(options.version);
  let url: URL;
  try {
    url = new URL(options.url, typeof location === 'undefined' ? undefined : location.href);
  } catch (cause) {
    throw new OrbitError('INVALID_OPTIONS', '应用入口必须是有效 URL', { cause });
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.searchParams.has(CHANNEL_PARAM)
  )
    throw new OrbitError('INVALID_OPTIONS', '应用入口只允许无凭据的 HTTP(S) 地址，且不得占用内部参数');
  if (!origins.has(url.origin)) throw new OrbitError('FORBIDDEN_ORIGIN', `未授权应用来源：${url.origin}`);
  if (options.signal?.aborted) throw aborted();
  return {
    ...options,
    url: url.href,
    timeout: checkTimeout(options.timeout ?? 15_000),
    props: copyProps(options.props ?? {})
  };
}

/** 创建独立的桌面运行内核；工厂和模块导入均不触碰 DOM。 */
export function createOrbit(options: OrbitOptions = {}): OrbitRuntime {
  const origins = new Set(options.allowedOrigins ?? (typeof location === 'undefined' ? [] : [location.origin]));
  for (const origin of origins) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new OrbitError('INVALID_OPTIONS', 'allowedOrigins 必须是精确 HTTP(S) 来源');
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin)
      throw new OrbitError('INVALID_OPTIONS', 'allowedOrigins 必须是精确 HTTP(S) 来源');
  }
  const instances = new Map<string, Instance>();
  const bus = new EventBus((event, args) => {
    if (closed) throw destroyed();
    for (const instance of instances.values()) instance.broadcast(event, args);
  });
  let closed = false;
  return {
    get instances() {
      return [...instances.values()].map(instance => instance.snapshot);
    },
    bus,
    createApp(appOptions) {
      if (closed) throw destroyed();
      const normalized = normalizeApp(appOptions, origins);
      if (instances.has(normalized.instanceId))
        throw new OrbitError('DUPLICATE_INSTANCE', `实例已存在：${normalized.instanceId}`);
      const instance = new Instance(
        normalized,
        () => {
          if (instances.get(normalized.instanceId) === instance) instances.delete(normalized.instanceId);
        },
        bus,
        options.onError ?? console.error
      );
      instances.set(normalized.instanceId, instance);
      return instance;
    },
    dispose() {
      if (closed) return;
      closed = true;
      for (const instance of [...instances.values()]) instance.destroy();
      bus.$clear();
    }
  };
}
