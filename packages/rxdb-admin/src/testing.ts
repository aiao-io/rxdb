import { createAdminShell } from './shell/create.js';
import type { AdminShell, AdminShellOptions } from './shell/types.js';
import { createMemoryStorage, type StorageLike } from './storage.js';

type Listener = (event: never) => void;

/** 可编程的假窗口：事件分发、媒体查询、`open`、`navigator`。 */
export interface FakeWindow {
  /** 当作 `Window` 传给外壳。 */
  readonly window: Window;
  /** 切换移动端宽度并通知监听者。 */
  setMobile(isMobile: boolean): void;
  /** 切换系统深色并通知监听者。 */
  setSystemDark(isDark: boolean): void;
  /** 向监听者分发事件。 */
  dispatch(type: string, event?: object): void;
  /** 以捕获阶段分发一次键盘事件，返回事件（含 `prevented`）。 */
  press(init: {
    key: string;
    code?: string;
    ctrlKey?: boolean;
    metaKey?: boolean;
    altKey?: boolean;
    shiftKey?: boolean;
    target?: unknown;
  }): {
    prevented: boolean;
  };
  /** 指定类型当前的监听数。 */
  listenerCount(type: string): number;
  /** `window.open` 的调用记录。 */
  readonly opened: string[];
}

/** 假窗口的选项。 */
export interface FakeWindowOptions {
  /** `navigator.platform`，缺省 `Win32`。 */
  readonly platform?: string;
  /** `location.pathname`，缺省 `/`。 */
  readonly pathname?: string;
  /** 初始是否移动端宽度。 */
  readonly mobile?: boolean;
  /** 初始系统是否深色。 */
  readonly systemDark?: boolean;
}

/**
 * 创建假窗口，供外壳与三端绑定的测试使用，不依赖 DOM 环境。
 * @param options - 平台、地址与初始媒体状态。
 * @returns 假窗口。
 */
export function createFakeWindow(options: FakeWindowOptions = {}): FakeWindow {
  const listeners = new Map<string, Set<Listener>>();
  const queries = new Map<string, { matches: boolean; listeners: Set<(event: { matches: boolean }) => void> }>();
  const state = { mobile: options.mobile ?? false, dark: options.systemDark ?? false };
  const opened: string[] = [];
  const queryFor = (query: string) => {
    let entry = queries.get(query);
    if (!entry) {
      entry = { matches: query.includes('prefers-color-scheme') ? state.dark : state.mobile, listeners: new Set() };
      queries.set(query, entry);
    }
    return entry;
  };
  const dispatch = (type: string, event: object = {}): void => {
    for (const listener of [...(listeners.get(type) ?? [])]) listener(event as never);
  };
  const setQuery = (match: (query: string) => boolean, value: boolean): void => {
    for (const [query, entry] of queries) {
      if (!match(query)) continue;
      entry.matches = value;
      for (const listener of entry.listeners) listener({ matches: value });
    }
  };
  const fake = {
    navigator: { platform: options.platform ?? 'Win32', userAgent: '' },
    location: { pathname: options.pathname ?? '/', reload: () => undefined },
    localStorage: undefined,
    sessionStorage: undefined,
    addEventListener: (type: string, listener: Listener) => {
      const set = listeners.get(type) ?? new Set();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener: (type: string, listener: Listener) => void listeners.get(type)?.delete(listener),
    matchMedia: (query: string) => {
      const entry = queryFor(query);
      return {
        get matches() {
          return entry.matches;
        },
        addEventListener: (_: 'change', listener: (event: { matches: boolean }) => void) =>
          void entry.listeners.add(listener),
        removeEventListener: (_: 'change', listener: (event: { matches: boolean }) => void) =>
          void entry.listeners.delete(listener)
      };
    },
    open: (url: string) => void opened.push(url)
  };
  return {
    window: fake as unknown as Window,
    setMobile: isMobile => {
      state.mobile = isMobile;
      setQuery(query => query.includes('max-width'), isMobile);
    },
    setSystemDark: isDark => {
      state.dark = isDark;
      setQuery(query => query.includes('prefers-color-scheme'), isDark);
    },
    dispatch,
    press: init => {
      const event = {
        code: '',
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        prevented: false,
        preventDefault() {
          event.prevented = true;
        },
        ...init
      };
      dispatch('keydown', event);
      return event;
    },
    listenerCount: type => listeners.get(type)?.size ?? 0,
    opened
  };
}

/** 可检查的假文档：根节点属性与样式、标题、全屏。 */
export interface FakeDocument {
  /** 当作 `Document` 传给外壳。 */
  readonly document: Document;
  /** 根节点上的属性。 */
  readonly attributes: Map<string, string>;
  /** 根节点上的内联样式。 */
  readonly styles: Map<string, string>;
}

/**
 * 创建假文档。
 * @param title - 初始标题。
 * @returns 假文档。
 */
export function createFakeDocument(title = 'App'): FakeDocument {
  const attributes = new Map<string, string>();
  const styles = new Map<string, string>();
  const fullscreenListeners = new Set<() => void>();
  const document = {
    title,
    fullscreenElement: null,
    fullscreenEnabled: true,
    documentElement: {
      getAttribute: (name: string) => attributes.get(name) ?? null,
      setAttribute: (name: string, value: string) => void attributes.set(name, value),
      removeAttribute: (name: string) => void attributes.delete(name),
      style: {
        setProperty: (name: string, value: string) => void styles.set(name, value),
        removeProperty: (name: string) => {
          const previous = styles.get(name) ?? '';
          styles.delete(name);
          return previous;
        }
      },
      requestFullscreen: async () => undefined
    },
    exitFullscreen: async () => undefined,
    addEventListener: (_: string, listener: () => void) => void fullscreenListeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => void fullscreenListeners.delete(listener)
  };
  return { document: document as unknown as Document, attributes, styles };
}

/** {@link createTestShell} 的返回值。 */
export interface TestShell<TIcon = unknown> {
  /** 外壳。 */
  readonly shell: AdminShell<TIcon>;
  /** `navigate` 回调的调用记录。 */
  readonly navigated: string[];
  /** 假窗口。 */
  readonly fakeWindow: FakeWindow;
  /** 假文档。 */
  readonly fakeDocument: FakeDocument;
  /** 本机存储。 */
  readonly local: StorageLike;
  /** 会话存储。 */
  readonly session: StorageLike;
}

/**
 * 用假宿主与内存存储创建外壳，供测试使用。
 * @param overrides - 覆盖外壳选项。
 * @param windowOptions - 假窗口选项。
 * @returns 外壳与可检查的宿主。
 */
export function createTestShell<TIcon = unknown>(
  overrides: Partial<AdminShellOptions<TIcon>> = {},
  windowOptions: FakeWindowOptions = {}
): TestShell<TIcon> {
  const fakeWindow = createFakeWindow(windowOptions);
  const fakeDocument = createFakeDocument();
  const local = overrides.storage?.local ?? createMemoryStorage();
  const session = overrides.storage?.session ?? createMemoryStorage();
  const navigated: string[] = [];
  const shell = createAdminShell<TIcon>({
    navigate: url => void navigated.push(url),
    host: { window: fakeWindow.window, document: fakeDocument.document },
    storage: { local, session },
    ...overrides
  });
  return { shell, navigated, fakeWindow, fakeDocument, local, session };
}
