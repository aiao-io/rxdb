import type { OrbitClient, OrbitInstance, OrbitObject, OrbitValue } from './types.js';
import { readBoolean, readRegions, readState, readTitle, trackDragRegions } from './window-codec.js';

/** 宿主的外观平台，决定应用自绘的窗口按钮长什么样、放在哪一侧。 */
export type OrbitWindowPlatform = 'macos';

/**
 * 窗口外观：`standard` 由宿主画标题栏与窗口按钮；`transparent` 允许应用隐藏宿主的标题栏，
 * 自己画标题栏与按钮（对应 Tauri 的 `decorations: false`）。
 */
export type OrbitWindowFrame = 'standard' | 'transparent';

/** 宿主窗口的当前状态。 */
export interface OrbitWindowState {
  /** 宿主的外观平台。 */
  readonly platform: OrbitWindowPlatform;
  /** 运营方给这个应用批准的窗口外观。 */
  readonly frame: OrbitWindowFrame;
  /** 宿主此刻是否在画标题栏。 */
  readonly decorations: boolean;
  /** 窗口是否在前台。 */
  readonly focused: boolean;
  /** 窗口是否已缩放到铺满可用区域。 */
  readonly maximized: boolean;
}

/** 应用视口坐标里的矩形（CSS 像素）。 */
export interface OrbitRect {
  /** 左边距视口左缘。 */
  readonly x: number;
  /** 上边距视口上缘。 */
  readonly y: number;
  /** 宽度。 */
  readonly width: number;
  /** 高度。 */
  readonly height: number;
}

/** 一块拖动区：矩形减去其中可交互元素占的挖空。 */
export interface OrbitDragRegion extends OrbitRect {
  /** 不可拖动的挖空，按钮、输入框等仍由应用接收指针。 */
  readonly holes: readonly OrbitRect[];
}

/** 应用拿到的当前窗口，接口对齐 Tauri 的 `getCurrentWindow()`。 */
export interface OrbitWindow {
  /** 最近一次已知的窗口状态。 */
  readonly state: OrbitWindowState;
  /** 订阅宿主推送的状态变化；返回退订函数。 */
  onStateChange(handler: (state: OrbitWindowState) => void): () => void;
  /** 最小化窗口。 */
  minimize(): Promise<void>;
  /** 在缩放铺满与原尺寸之间切换。 */
  toggleMaximize(): Promise<void>;
  /** 关闭窗口。 */
  close(): Promise<void>;
  /** 设置窗口标题（最多 256 个字符）。 */
  setTitle(title: string): Promise<void>;
  /** 显示或隐藏宿主的标题栏；只有 `transparent` 外观的窗口可以隐藏。 */
  setDecorations(decorations: boolean): Promise<void>;
  /**
   * 跟踪 root 下带 `data-orbit-drag-region` 的元素，把拖动区上报给宿主，对应 Tauri 的
   * `data-tauri-drag-region`。元素内的按钮、链接、输入框与 `data-orbit-no-drag` 元素不可拖动。
   * 返回停止函数，停止时清空拖动区。
   */
  trackDragRegions(root?: Document | Element): () => void;
}

/** 宿主实现的窗口操作，只作用于这个实例自己的窗口；不允许的操作抛错，错误消息回给应用。 */
export interface OrbitWindowHost {
  /** 当前窗口状态。 */
  state(): OrbitWindowState;
  /** 最小化。 */
  minimize(): void;
  /** 缩放或还原。 */
  toggleMaximize(): void;
  /** 关闭。 */
  close(): void;
  /** 设置窗口标题。 */
  setTitle(title: string): void;
  /** 显示或隐藏宿主的标题栏。 */
  setDecorations(decorations: boolean): void;
  /** 替换应用的拖动区。 */
  setDragRegions(regions: readonly OrbitDragRegion[]): void;
}

/** 宿主侧的窗口服务。 */
export interface OrbitWindowServer {
  /** 把当前状态推给已就绪的应用；状态没变或应用尚未就绪时不发送。 */
  publish(): void;
  /** 注销全部窗口请求处理函数。 */
  dispose(): void;
}

/** 启动属性里放窗口初始状态的键；没有它说明宿主不提供窗口。 */
export const WINDOW_PROP = 'orbit.window';

const STATE_EVENT = 'window.state';

export { collectDragRegions } from './window-codec.js';

/** 宿主创建实例时放进启动属性的窗口初始状态。 */
export function windowProps(state: OrbitWindowState): OrbitObject {
  return { [WINDOW_PROP]: { ...readState(state) } };
}

/** 宿主在实例上登记窗口请求；装载前调用，应用握手后的第一个请求就能被处理。 */
export function serveWindow(instance: OrbitInstance, host: OrbitWindowHost): OrbitWindowServer {
  const done = (action: () => void): null => {
    action();
    return null;
  };
  const offs = [
    instance.onRequest('window.minimize', () => done(() => host.minimize())),
    instance.onRequest('window.toggleMaximize', () => done(() => host.toggleMaximize())),
    instance.onRequest('window.close', () => done(() => host.close())),
    instance.onRequest('window.setTitle', payload => done(() => host.setTitle(readTitle(payload)))),
    instance.onRequest('window.setDecorations', payload => done(() => host.setDecorations(readBoolean(payload)))),
    instance.onRequest('window.setDragRegions', payload => done(() => host.setDragRegions(readRegions(payload))))
  ];
  let published = '';
  return {
    publish() {
      if (!['ready', 'hidden'].includes(instance.snapshot.state)) return;
      const state = { ...readState(host.state()) };
      const key = JSON.stringify(state);
      if (key === published) return;
      published = key;
      instance.emit(STATE_EVENT, state);
    },
    dispose() {
      for (const off of offs) off();
    }
  };
}

/**
 * 子应用拿到当前窗口，对应 Tauri 的 `getCurrentWindow()`；宿主不提供窗口时返回 undefined，
 * 应用按普通网页运行。
 */
export function getCurrentWindow(client: OrbitClient): OrbitWindow | undefined {
  const initial = client.context.props[WINDOW_PROP];
  if (initial === undefined) return undefined;
  let state = readState(initial);
  const call = async (method: string, payload: OrbitValue = null): Promise<void> => {
    await client.request(method, payload);
  };
  client.bus.$on(STATE_EVENT, next => {
    state = readState(next);
  });
  return {
    get state() {
      return state;
    },
    onStateChange(handler) {
      const listener = (next: unknown) => handler(readState(next));
      client.bus.$on(STATE_EVENT, listener);
      return () => {
        client.bus.$off(STATE_EVENT, listener);
      };
    },
    minimize: () => call('window.minimize'),
    toggleMaximize: () => call('window.toggleMaximize'),
    close: () => call('window.close'),
    setTitle: title => call('window.setTitle', title),
    setDecorations: decorations => call('window.setDecorations', decorations),
    trackDragRegions: (root = document) =>
      trackDragRegions(regions => void call('window.setDragRegions', regions as unknown as OrbitValue), root)
  };
}
