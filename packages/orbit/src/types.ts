/** 可经桌面协议传递的 JSON 值；不接受函数、循环引用和浏览器对象。 */
export type OrbitValue = null | boolean | number | string | OrbitValue[] | OrbitObject;

/** JSON 对象，字段值递归遵守消息约束。 */
export interface OrbitObject {
  /** 按字段名访问 JSON 值。 */
  [key: string]: OrbitValue;
}

/** 应用启动参数。 */
export type OrbitProps = Readonly<OrbitObject>;

/** 运行状态；隐藏不会暂停或销毁应用。 */
export type OrbitState = 'created' | 'loading' | 'ready' | 'hidden' | 'failed' | 'destroyed';

/** 事件接收函数。 */
export type OrbitEventHandler = (...args: unknown[]) => void;

/** 实例内的事件接口；子应用事件只发给宿主，宿主可显式广播。 */
export interface OrbitEventBus {
  /** 订阅命名事件；重复订阅相同函数不会重复注册。 */
  $on(event: string, handler: OrbitEventHandler): OrbitEventBus;
  /** 订阅一次性事件。 */
  $once(event: string, handler: OrbitEventHandler): OrbitEventBus;
  /** 移除指定订阅；省略函数时清除该事件。 */
  $off(event: string, handler?: OrbitEventHandler): OrbitEventBus;
  /** 发送事件。 */
  $emit(event: string, ...args: unknown[]): OrbitEventBus;
  /** 清除当前总线的订阅。 */
  $clear(): void;
  /** 当前订阅数，供回收检查使用。 */
  readonly listenerCount: number;
}

/** 请求的超时与取消选项。 */
export interface OrbitRequestOptions {
  /** 超时毫秒数，默认 5000。 */
  timeout?: number;
  /** 调用方主动取消信号。 */
  signal?: AbortSignal;
}

/** 接收请求的函数；取消或销毁时 signal 会终止。 */
export type OrbitRequestHandler = (payload: OrbitValue, signal: AbortSignal) => OrbitValue | Promise<OrbitValue>;

/** 稳定的应用定义与独立的实例配置。 */
export interface OrbitAppOptions {
  /** 应用身份；同一应用的多个实例使用相同 appId。 */
  appId: string;
  /** 当前运行实例的唯一身份，不能重复占用。 */
  instanceId: string;
  /** 资源版本，不代表已实现离线缓存或版本回退。 */
  version: string;
  /** Web 应用真实地址；资源、动态导入和路由由其原生文档处理。 */
  url: string;
  /** 初始属性，只允许 JSON 值。 */
  props?: OrbitProps;
  /** iframe 的无障碍标题，默认应用身份。 */
  title?: string;
  /** 明确授予 iframe 的浏览器 Permissions Policy。 */
  allow?: string;
  /** 启动超时毫秒数，默认 15000；加载完成不等于应用就绪。 */
  timeout?: number;
  /** 启动及存活期间的取消信号。 */
  signal?: AbortSignal;
}

/** 不暴露内部 DOM 和通信通道的状态快照。 */
export interface OrbitSnapshot {
  /** 应用身份。 */
  readonly appId: string;
  /** 实例身份。 */
  readonly instanceId: string;
  /** 固定资源版本。 */
  readonly version: string;
  /** 原始应用入口，不含内部握手参数。 */
  readonly url: string;
  /** 当前生命周期状态。 */
  readonly state: OrbitState;
}

/** 应用运行实例，所有框架共用同一契约。 */
export interface OrbitInstance {
  /** 当前不可变快照。 */
  readonly snapshot: OrbitSnapshot;
  /** 子应用显式 ready 后完成，失败、取消和销毁时拒绝。 */
  readonly ready: Promise<void>;
  /** 装载到可见容器；重复装载同容器复用启动事务。 */
  mount(container: HTMLElement): Promise<void>;
  /** 隐藏窗口，保留浏览器运行环境。 */
  hide(): void;
  /** 恢复原窗口，不跨容器移动 iframe。 */
  show(): void;
  /** 把键盘焦点交给应用文档；仅在显示中的就绪状态可用。 */
  focus(): void;
  /** 替换启动属性并通知子应用。 */
  setProps(props: OrbitProps): void;
  /** 定向发送到当前实例，不向其他应用广播。 */
  emit(event: string, ...args: unknown[]): void;
  /** 请求当前实例处理命名操作。 */
  request(method: string, payload?: OrbitValue, options?: OrbitRequestOptions): Promise<OrbitValue>;
  /** 注册宿主处理函数；返回取消注册函数。 */
  onRequest(method: string, handler: OrbitRequestHandler): () => void;
  /** 订阅状态变更；返回取消订阅函数。 */
  subscribe(handler: (snapshot: OrbitSnapshot) => void): () => void;
  /** 幂等销毁，释放 iframe、全局监听、请求与实例身份。 */
  destroy(): void;
}

/** 运行内核配置。 */
export interface OrbitOptions {
  /** 允许的应用来源；省略时只允许宿主同源地址。 */
  allowedOrigins?: readonly string[];
  /** 显式接收状态观察者和事件处理器抛出的错误。 */
  onError?: (error: unknown) => void;
}

/** 一组相互独立、可统一销毁的运行实例。 */
export interface OrbitRuntime {
  /** 已登记实例的快照，不包含已销毁实例。 */
  readonly instances: readonly OrbitSnapshot[];
  /** 宿主事件总线；宿主发送的事件会显式广播给该内核的已连接实例。 */
  readonly bus: OrbitEventBus;
  /** 登记一个独立实例；重复身份和未批准来源直接报错。 */
  createApp(options: OrbitAppOptions): OrbitInstance;
  /** 幂等销毁所有实例和总线订阅。 */
  dispose(): void;
}

/** 子应用在握手后获得的可信连接信息。 */
export interface OrbitClientContext {
  /** 宿主绑定的应用身份。 */
  readonly appId: string;
  /** 宿主绑定的运行实例身份。 */
  readonly instanceId: string;
  /** 当前资源版本。 */
  readonly version: string;
  /** 应用入口。 */
  readonly url: string;
  /** 当前属性快照。 */
  readonly props: OrbitProps;
  /** 宿主是否显示该窗口。 */
  readonly visible: boolean;
}

/** 子应用连接参数。 */
export interface OrbitClientOptions {
  /** 接收子应用事件与观察者抛出的错误。 */
  onError?: (error: unknown) => void;
  /** 握手超时毫秒数，默认 15000。 */
  timeout?: number;
  /** 主动取消握手及连接。 */
  signal?: AbortSignal;
}

/** 框架无关的子应用接口，普通独立运行时无需建立连接。 */
export interface OrbitClient {
  /** 当前身份、属性及可见性。 */
  readonly context: OrbitClientContext;
  /** 子应用向宿主发送事件的独立总线。 */
  readonly bus: OrbitEventBus;
  /** 在应用完成真实渲染后通知宿主，不用 iframe load 冒充就绪。 */
  ready(): void;
  /** 报告启动失败，仅传消息，不自动传递堆栈。 */
  fail(message: string): void;
  /** 请求宿主服务，来源身份由连接绑定。 */
  request(method: string, payload?: OrbitValue, options?: OrbitRequestOptions): Promise<OrbitValue>;
  /** 注册子应用处理函数。 */
  onRequest(method: string, handler: OrbitRequestHandler): () => void;
  /** 订阅属性变化。 */
  onPropsChange(handler: (props: OrbitProps) => void): () => void;
  /** 订阅窗口显示和隐藏，不把隐藏误当作暂停。 */
  onVisibilityChange(handler: (visible: boolean) => void): () => void;
  /** 订阅连接释放，可用于卸载框架根实例。 */
  onDispose(handler: () => void): () => void;
  /** 释放事件、请求、临时兼容全局与页面监听。 */
  dispose(): void;
}
