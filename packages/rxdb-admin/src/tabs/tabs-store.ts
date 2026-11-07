import type { Observable } from 'rxjs';
import type { TabbarPersist } from '../preferences/types.js';
import type { StorageLike } from '../storage.js';
import { Store, type ReadableStore } from '../store.js';
import {
  EMPTY_TABS,
  closeAll,
  closeLeft,
  closeOthers,
  closeRight,
  closeTab,
  openTab,
  reorderTab,
  retitleTabs,
  tabKeyOf,
  togglePin,
  type TabItem,
  type TabsResult,
  type TabsState
} from './tabs-ops.js';

/** 页签存储的默认键。 */
export const TABS_STORAGE_KEY = 'aiao.admin.tabs';

const STORAGE_VERSION = 1;

/** 页签栏随偏好变化的配置。 */
export interface TabsConfig {
  /** 持久化位置。 */
  readonly persist: TabbarPersist;
  /** 页签上限，0 不限。 */
  readonly maxCount: number;
  /** 是否记录访问历史。 */
  readonly visitHistory: boolean;
}

/** {@link TabsStore} 的构造选项。 */
export interface TabsStoreOptions {
  /** 随偏好变化的配置。 */
  readonly config: ReadableStore<TabsConfig>;
  /** 两种持久化介质。 */
  readonly storages: { readonly session: StorageLike; readonly local: StorageLike };
  /** 存储键，缺省 {@link TABS_STORAGE_KEY}。 */
  readonly storageKey?: string;
}

/** 关闭类操作的返回值：字符串 = 应跳转的地址；`null` = 没有页签可去；`undefined` = 无需跳转。 */
export type CloseOutcome = string | null | undefined;

const isTab = (value: unknown): value is TabItem => {
  const tab = value as Partial<TabItem> | null;
  return (
    typeof tab?.key === 'string' &&
    typeof tab.url === 'string' &&
    typeof tab.title === 'string' &&
    typeof tab.pinned === 'boolean'
  );
};

const sameTabs = (a: TabsState, b: TabsState): boolean =>
  a.activeKey === b.activeKey &&
  a.tabs.length === b.tabs.length &&
  a.tabs.every(
    (tab, i) =>
      tab.key === b.tabs[i].key &&
      tab.url === b.tabs[i].url &&
      tab.title === b.tabs[i].title &&
      tab.pinned === b.tabs[i].pinned
  ) &&
  a.history.length === b.history.length &&
  a.history.every((key, i) => key === b.history[i]);

/**
 * 页签状态：打开 / 关闭 / 固定 / 排序 / 访问历史，并按偏好持久化到会话或本机。
 *
 * @remarks
 * 路由器无关：外壳在每次路由变化后调用 {@link TabsStore.open}，
 * 关闭当前页签时本类返回应跳转的地址，由外壳调用路由器完成跳转。
 */
export class TabsStore implements ReadableStore<TabsState> {
  readonly #state: Store<TabsState>;
  readonly #config: ReadableStore<TabsConfig>;
  readonly #storages: TabsStoreOptions['storages'];
  readonly #key: string;
  #persist: TabbarPersist;
  readonly #unsubscribe: () => void;

  /** 当前状态的同步快照。 */
  get value(): TabsState {
    return this.#state.value;
  }

  /** 回放当前状态并推送后续变更。 */
  get changes$(): Observable<TabsState> {
    return this.#state.changes$;
  }

  /**
   * 创建页签状态并从持久化介质恢复。
   * @param options - 配置与存储。
   */
  constructor(options: TabsStoreOptions) {
    this.#config = options.config;
    this.#storages = options.storages;
    this.#key = options.storageKey ?? TABS_STORAGE_KEY;
    this.#persist = options.config.value.persist;
    this.#state = new Store(this.#restore());
    this.#unsubscribe = options.config.subscribe(config => this.#onConfig(config));
  }

  /**
   * 订阅后续变更。
   * @param listener - 变更回调。
   * @returns 退订函数。
   */
  subscribe(listener: (value: TabsState) => void): () => void {
    return this.#state.subscribe(listener);
  }

  /**
   * 打开或激活页签（路由变化后调用）。
   * @param url - 当前地址。
   * @param title - 标题。
   */
  open(url: string, title: string): void {
    const { maxCount, visitHistory } = this.#config.value;
    const tab: TabItem = { key: tabKeyOf(url), url, title, pinned: false };
    this.#apply(openTab(this.value, tab, { maxCount, visitHistory }));
  }

  /** 当前路由不属于任何页签时，清除活动状态并保留已有页签与访问历史。 */
  deactivate(): void {
    this.#apply({ ...this.value, activeKey: null });
  }

  /**
   * 关闭页签。
   * @param key - 页签键。
   * @returns 应跳转的地址，见 {@link CloseOutcome}。
   */
  close(key: string): CloseOutcome {
    return this.#applyResult(closeTab(this.value, key));
  }

  /**
   * 关闭其余页签。
   * @param key - 保留的页签键。
   * @returns 见 {@link CloseOutcome}。
   */
  closeOthers(key: string): CloseOutcome {
    return this.#applyResult(closeOthers(this.value, key));
  }

  /**
   * 关闭左侧页签。
   * @param key - 基准页签键。
   * @returns 见 {@link CloseOutcome}。
   */
  closeLeft(key: string): CloseOutcome {
    return this.#applyResult(closeLeft(this.value, key));
  }

  /**
   * 关闭右侧页签。
   * @param key - 基准页签键。
   * @returns 见 {@link CloseOutcome}。
   */
  closeRight(key: string): CloseOutcome {
    return this.#applyResult(closeRight(this.value, key));
  }

  /**
   * 关闭全部非固定页签。
   * @returns 见 {@link CloseOutcome}。
   */
  closeAll(): CloseOutcome {
    return this.#applyResult(closeAll(this.value));
  }

  /**
   * 切换固定状态。
   * @param key - 页签键。
   */
  togglePin(key: string): void {
    this.#apply(togglePin(this.value, key));
  }

  /**
   * 移动页签。
   * @param key - 页签键。
   * @param toIndex - 目标下标。
   */
  reorder(key: string, toIndex: number): void {
    this.#apply(reorderTab(this.value, key, toIndex));
  }

  /**
   * 重新解析标题（语言切换、菜单更新后）。
   * @param resolve - 由地址返回标题，`undefined` 保持原样。
   */
  retitle(resolve: (url: string) => string | undefined): void {
    this.#apply(retitleTabs(this.value, resolve));
  }

  /** 停止跟随偏好变化。 */
  destroy(): void {
    this.#unsubscribe();
  }

  #apply(next: TabsState): void {
    if (sameTabs(next, this.value)) return;
    this.#state.set(next);
    this.#write();
  }

  #applyResult(result: TabsResult): CloseOutcome {
    this.#apply(result.state);
    return result.next;
  }

  #storage(persist: TabbarPersist): StorageLike | undefined {
    return persist === 'off' ? undefined : this.#storages[persist];
  }

  #write(): void {
    const storage = this.#storage(this.#persist);
    if (!storage) return;
    const { tabs, activeKey } = this.value;
    storage.setItem(this.#key, JSON.stringify({ version: STORAGE_VERSION, tabs, activeKey }));
  }

  #restore(): TabsState {
    const raw = this.#storage(this.#persist)?.getItem(this.#key);
    if (!raw) return EMPTY_TABS;
    try {
      const parsed = JSON.parse(raw) as { version?: number; tabs?: unknown[]; activeKey?: unknown };
      if (parsed.version !== STORAGE_VERSION || !Array.isArray(parsed.tabs)) return EMPTY_TABS;
      const tabs = parsed.tabs.filter(isTab);
      const keys = new Set(tabs.map(tab => tab.key));
      const activeKey = typeof parsed.activeKey === 'string' && keys.has(parsed.activeKey) ? parsed.activeKey : null;
      return {
        tabs: tabs.filter((tab, i) => tabs.findIndex(other => other.key === tab.key) === i),
        activeKey,
        history: []
      };
    } catch {
      return EMPTY_TABS;
    }
  }

  #onConfig(config: TabsConfig): void {
    if (config.persist === this.#persist) return;
    this.#storage(this.#persist)?.removeItem(this.#key);
    this.#persist = config.persist;
    this.#write();
  }
}
