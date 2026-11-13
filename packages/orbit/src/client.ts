import { EventBus } from './bus.js';
import { aborted, checkTimeout, destroyed, OrbitError, OrbitProtocolError } from './errors.js';
import { isRecord } from './payload.js';
import type { Message } from './protocol.js';
import { CHANNEL_PARAM, parseProtocol, PROTOCOL, PROTOCOL_VERSION, readContext, readMessage } from './protocol.js';
import { Rpc } from './rpc.js';
import type {
  OrbitClient,
  OrbitClientContext,
  OrbitClientOptions,
  OrbitProps,
  OrbitRequestHandler,
  OrbitRequestOptions,
  OrbitValue
} from './types.js';

function installGlobals(client: OrbitClient): () => void {
  const previous = new Map(['$orbit', '__ORBIT'].map(key => [key, Object.getOwnPropertyDescriptor(window, key)]));
  const restore = () => {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(window, key, descriptor);
      else Reflect.deleteProperty(window, key);
    }
  };
  try {
    Object.defineProperty(window, '$orbit', {
      configurable: true,
      value: {
        get props() {
          return client.context.props;
        },
        bus: client.bus
      }
    });
    Object.defineProperty(window, '__ORBIT', {
      configurable: true,
      value: Object.freeze({ id: client.context.instanceId })
    });
  } catch (error) {
    restore();
    throw error;
  }
  return restore;
}

class Client implements OrbitClient {
  private readonly rpc = new Rpc(message => this.send(message));
  private readonly propsHandlers = new Set<(props: OrbitProps) => void>();
  private readonly visibilityHandlers = new Set<(visible: boolean) => void>();
  private readonly disposeHandlers = new Set<() => void>();
  private restoreGlobals: () => void;
  private closed = false;
  private sentReady = false;
  readonly bus = new EventBus((event, args) => this.send({ type: 'event', event, args }));

  get context(): OrbitClientContext {
    return this.current;
  }

  constructor(
    private current: OrbitClientContext,
    private readonly port: MessagePort,
    private readonly options: OrbitClientOptions
  ) {
    this.restoreGlobals = installGlobals(this);
    port.onmessage = event => {
      try {
        const message = readMessage(event.data);
        if (message) this.receive(message);
      } catch (error) {
        this.report(error);
      }
    };
    port.onmessageerror = () => {
      this.fail('无法解析宿主消息');
      this.dispose();
    };
    window.addEventListener('pagehide', this.onPageHide, { once: true });
    options.signal?.addEventListener('abort', this.onPageHide, { once: true });
  }

  ready(): void {
    this.assertLive();
    if (this.sentReady) return;
    this.send({ type: 'ready' });
    this.sentReady = true;
  }

  fail(message: string): void {
    this.send({ type: 'error', message: String(message).slice(0, 4096) });
  }

  request(method: string, payload?: OrbitValue, options?: OrbitRequestOptions): Promise<OrbitValue> {
    return this.rpc.request(method, payload, options);
  }
  onRequest(method: string, handler: OrbitRequestHandler): () => void {
    return this.rpc.onRequest(method, handler);
  }

  onPropsChange(handler: (props: OrbitProps) => void): () => void {
    return this.subscribe(this.propsHandlers, handler);
  }
  onVisibilityChange(handler: (visible: boolean) => void): () => void {
    return this.subscribe(this.visibilityHandlers, handler);
  }
  onDispose(handler: () => void): () => void {
    return this.subscribe(this.disposeHandlers, handler);
  }

  dispose(): void {
    if (this.closed) return;
    this.port.postMessage({ type: 'disposed' });
    this.closed = true;
    this.port.onmessage = null;
    this.port.onmessageerror = null;
    this.port.close();
    this.rpc.dispose();
    this.bus.$clear();
    window.removeEventListener('pagehide', this.onPageHide);
    this.options.signal?.removeEventListener('abort', this.onPageHide);
    this.restoreGlobals();
    this.notify(this.disposeHandlers, undefined);
    this.disposeHandlers.clear();
    this.propsHandlers.clear();
    this.visibilityHandlers.clear();
  }

  private readonly onPageHide = () => this.dispose();
  private report(error: unknown): void {
    (this.options.onError ?? console.error)(error);
  }

  private subscribe<T>(handlers: Set<(value: T) => void>, handler: (value: T) => void): () => void {
    this.assertLive();
    handlers.add(handler);
    return () => {
      handlers.delete(handler);
    };
  }

  private notify<T>(handlers: Set<(value: T) => void>, value: T): void {
    for (const handler of [...handlers]) {
      try {
        handler(value);
      } catch (error) {
        this.report(error);
      }
    }
  }

  private receive(message: Message): void {
    if (message.type === 'disposed') {
      this.dispose();
      return;
    }
    if (message.type === 'event') {
      this.bus.dispatch(message.event, message.args);
      return;
    }
    if (message.type === 'props') {
      this.current = Object.freeze({ ...this.current, props: Object.freeze(message.props) });
      this.notify(this.propsHandlers, this.current.props);
      return;
    }
    if (message.type === 'visibility') {
      this.current = Object.freeze({ ...this.current, visible: message.visible });
      this.notify(this.visibilityHandlers, message.visible);
      return;
    }
    this.rpc.receive(message);
  }

  private assertLive(): void {
    if (this.closed) throw destroyed();
  }
  private send(message: Message): void {
    this.assertLive();
    this.port.postMessage(message);
  }
}

/**
 * 宿主对 hello 的拒绝：应用声明的协议版本高于宿主支持的版本时，宿主不建立端口，而是发来这条通知。
 * 通知要带本次握手的令牌，数字字段是正整数；应用声明的版本以本 SDK 的为准，不信通知里的回显。
 */
function readRefusal(data: Record<string, unknown>, channel: string): OrbitProtocolError | undefined {
  if (data['type'] !== 'incompatible' || data['channel'] !== channel || parseProtocol(data['protocol']) === undefined)
    return undefined;
  const { supported, requested } = data;
  const positive = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 1;
  if (!positive(supported) || requested !== PROTOCOL_VERSION) return undefined;
  return new OrbitProtocolError(PROTOCOL_VERSION, supported);
}

/** 连接仓内桌面宿主；独立页面和普通 iframe 立即返回 undefined，业务路由须在握手后初始化。 */
export async function connectOrbitClient(options: OrbitClientOptions = {}): Promise<OrbitClient | undefined> {
  if (typeof window === 'undefined' || window.parent === window) return undefined;
  const url = new URL(window.location.href);
  const channel = url.searchParams.get(CHANNEL_PARAM);
  if (!channel) return undefined;
  if (options.signal?.aborted) throw aborted();
  const timeout = checkTimeout(options.timeout ?? 15_000);
  return new Promise<OrbitClient>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener('message', init);
      window.removeEventListener('pagehide', abort);
      options.signal?.removeEventListener('abort', abort);
    };
    const abort = () => {
      cleanup();
      reject(aborted());
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new OrbitError('TIMEOUT', '连接桌面宿主超时'));
    }, timeout);
    const init = (event: MessageEvent<unknown>) => {
      if (event.source !== window.parent || !isRecord(event.data)) return;
      const refusal = readRefusal(event.data, channel);
      if (refusal) {
        cleanup();
        reject(refusal);
        return;
      }
      if (
        event.data['protocol'] !== PROTOCOL ||
        event.data['type'] !== 'init' ||
        event.data['channel'] !== channel ||
        event.ports.length !== 1
      )
        return;
      try {
        const context = readContext(event.data['context']);
        if (!context) return;
        url.searchParams.delete(CHANNEL_PARAM);
        window.history.replaceState(window.history.state, '', url.href);
        const client = new Client(context, event.ports[0]!, options);
        cleanup();
        resolve(client);
      } catch (error) {
        event.ports[0]?.close();
        cleanup();
        reject(error);
      }
    };
    window.addEventListener('message', init);
    window.addEventListener('pagehide', abort, { once: true });
    options.signal?.addEventListener('abort', abort, { once: true });
    window.parent.postMessage({ protocol: PROTOCOL, type: 'hello', channel }, '*');
  });
}

export type { OrbitClient, OrbitClientContext, OrbitClientOptions } from './types.js';
