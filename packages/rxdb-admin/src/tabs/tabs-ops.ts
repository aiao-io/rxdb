/** 一个页签。 */
export interface TabItem {
  /** 唯一键，等于去掉查询串与哈希的路径。 */
  readonly key: string;
  /** 跳转地址。 */
  readonly url: string;
  /** 标题。 */
  readonly title: string;
  /** 固定：不可被关闭，排在最前。 */
  readonly pinned: boolean;
}

/** 页签状态。 */
export interface TabsState {
  /** 页签，固定的在前。 */
  readonly tabs: readonly TabItem[];
  /** 当前页签键。 */
  readonly activeKey: string | null;
  /** 访问历史，最近访问的在前。 */
  readonly history: readonly string[];
}

/** 页签操作的结果：新状态，以及关闭当前页签后应跳转到的地址。 */
export interface TabsResult {
  /** 新状态。 */
  readonly state: TabsState;
  /** 活动页签被关闭时的下一个地址；`null` 表示无页签可去，由调用方决定（通常回首页）。 */
  readonly next?: string | null;
}

/** 访问历史上限。 */
export const MAX_VISIT_HISTORY = 50;

/** 空状态。 */
export const EMPTY_TABS: TabsState = { tabs: [], activeKey: null, history: [] };

/**
 * 把地址规整为页签键：去掉查询串、哈希与末尾斜杠（根路径除外）。
 * @param url - 地址。
 * @returns 页签键。
 */
export function tabKeyOf(url: string): string {
  const path = url.split(/[?#]/, 1)[0] || '/';
  return path.length > 1 ? path.replace(/\/+$/, '') || '/' : path;
}

const pinnedFirst = (tabs: readonly TabItem[]): TabItem[] => [
  ...tabs.filter(tab => tab.pinned),
  ...tabs.filter(tab => !tab.pinned)
];

/**
 * 记录一次访问，最近访问的在前，去重并限长。
 * @param history - 当前历史。
 * @param key - 被访问的页签键。
 * @returns 新历史。
 */
export function recordVisit(history: readonly string[], key: string): string[] {
  return [key, ...history.filter(item => item !== key)].slice(0, MAX_VISIT_HISTORY);
}

const evictOverflow = (tabs: TabItem[], activeKey: string, maxCount: number): TabItem[] => {
  const kept = [...tabs];
  while (maxCount > 0 && kept.length > maxCount) {
    const victim = kept.findIndex(tab => !tab.pinned && tab.key !== activeKey);
    if (victim === -1) break;
    kept.splice(victim, 1);
  }
  return kept;
};

/**
 * 打开（或激活）页签：已存在则更新标题并激活，不存在则追加到非固定区末尾；超出上限时淘汰最早的非固定、非当前页签。
 * @param state - 当前状态。
 * @param tab - 页签（`pinned` 对已存在的页签不生效）。
 * @param options - 页签上限（0 不限）与是否记录访问历史。
 * @returns 新状态。
 */
export function openTab(
  state: TabsState,
  tab: TabItem,
  options: { maxCount: number; visitHistory: boolean }
): TabsState {
  const exists = state.tabs.some(item => item.key === tab.key);
  const tabs =
    exists ?
      state.tabs.map(item => (item.key === tab.key ? { ...item, url: tab.url, title: tab.title } : item))
    : pinnedFirst([...state.tabs, tab]);
  return {
    tabs: evictOverflow(tabs, tab.key, options.maxCount),
    activeKey: tab.key,
    history: options.visitHistory ? recordVisit(state.history, tab.key) : state.history
  };
}

const withoutKeys = (state: TabsState, removed: ReadonlySet<string>): TabsState => ({
  tabs: state.tabs.filter(tab => !removed.has(tab.key)),
  activeKey: state.activeKey !== null && removed.has(state.activeKey) ? null : state.activeKey,
  history: state.history.filter(key => !removed.has(key))
});

const successorOf = (before: TabsState, after: TabsState, closedKey: string): string | null => {
  const recent = before.history.find(key => key !== closedKey && after.tabs.some(tab => tab.key === key));
  if (recent !== undefined) return after.tabs.find(tab => tab.key === recent)?.url ?? null;
  const index = before.tabs.findIndex(tab => tab.key === closedKey);
  const neighbour = before.tabs.slice(index + 1).concat(before.tabs.slice(0, index).reverse());
  return neighbour.find(tab => after.tabs.some(kept => kept.key === tab.key))?.url ?? null;
};

const closeKeys = (state: TabsState, removed: ReadonlySet<string>, fallbackKey?: string): TabsResult => {
  const after = withoutKeys(state, removed);
  if (state.activeKey === null || !removed.has(state.activeKey)) return { state: after };
  const preferred = fallbackKey ? after.tabs.find(tab => tab.key === fallbackKey) : undefined;
  const next = preferred?.url ?? successorOf(state, after, state.activeKey);
  return { state: { ...after, activeKey: null }, next };
};

/**
 * 关闭页签；固定页签不可关闭。关闭当前页签时挑选最近访问的页签作为下一个，没有历史则取右邻再取左邻。
 * @param state - 当前状态。
 * @param key - 页签键。
 * @returns 新状态与可能的跳转地址。
 */
export function closeTab(state: TabsState, key: string): TabsResult {
  const target = state.tabs.find(tab => tab.key === key);
  if (!target || target.pinned) return { state };
  return closeKeys(state, new Set([key]));
}

/**
 * 关闭其余页签（保留固定页签与指定页签）。
 * @param state - 当前状态。
 * @param key - 保留的页签键。
 * @returns 新状态与可能的跳转地址。
 */
export function closeOthers(state: TabsState, key: string): TabsResult {
  const removed = new Set(state.tabs.filter(tab => tab.key !== key && !tab.pinned).map(tab => tab.key));
  return closeKeys(state, removed, key);
}

/**
 * 关闭指定页签左侧的非固定页签。
 * @param state - 当前状态。
 * @param key - 基准页签键。
 * @returns 新状态与可能的跳转地址。
 */
export function closeLeft(state: TabsState, key: string): TabsResult {
  const index = state.tabs.findIndex(tab => tab.key === key);
  if (index === -1) return { state };
  const removed = new Set(state.tabs.filter((tab, i) => i < index && !tab.pinned).map(tab => tab.key));
  return closeKeys(state, removed, key);
}

/**
 * 关闭指定页签右侧的非固定页签。
 * @param state - 当前状态。
 * @param key - 基准页签键。
 * @returns 新状态与可能的跳转地址。
 */
export function closeRight(state: TabsState, key: string): TabsResult {
  const index = state.tabs.findIndex(tab => tab.key === key);
  if (index === -1) return { state };
  const removed = new Set(state.tabs.filter((tab, i) => i > index && !tab.pinned).map(tab => tab.key));
  return closeKeys(state, removed, key);
}

/**
 * 关闭全部非固定页签；当前页签被关闭时优先回到第一个固定页签。
 * @param state - 当前状态。
 * @returns 新状态与可能的跳转地址。
 */
export function closeAll(state: TabsState): TabsResult {
  const removed = new Set(state.tabs.filter(tab => !tab.pinned).map(tab => tab.key));
  const firstPinned = state.tabs.find(tab => tab.pinned)?.key;
  return closeKeys(state, removed, firstPinned);
}

/**
 * 切换固定状态，固定页签集中排在最前并保持各自相对顺序。
 * @param state - 当前状态。
 * @param key - 页签键。
 * @returns 新状态。
 */
export function togglePin(state: TabsState, key: string): TabsState {
  if (!state.tabs.some(tab => tab.key === key)) return state;
  const tabs = state.tabs.map(tab => (tab.key === key ? { ...tab, pinned: !tab.pinned } : tab));
  return { ...state, tabs: pinnedFirst(tabs) };
}

/**
 * 把页签移到目标位置；目标位置被限制在其所属分组（固定 / 非固定）之内。
 * @param state - 当前状态。
 * @param key - 页签键。
 * @param toIndex - 目标下标（相对整条页签栏）。
 * @returns 新状态。
 */
export function reorderTab(state: TabsState, key: string, toIndex: number): TabsState {
  const from = state.tabs.findIndex(tab => tab.key === key);
  if (from === -1) return state;
  const moving = state.tabs[from];
  const pinnedCount = state.tabs.filter(tab => tab.pinned).length;
  const [low, high] = moving.pinned ? [0, pinnedCount - 1] : [pinnedCount, state.tabs.length - 1];
  const to = Math.min(high, Math.max(low, toIndex));
  if (to === from) return state;
  const tabs = [...state.tabs];
  tabs.splice(from, 1);
  tabs.splice(to, 0, moving);
  return { ...state, tabs };
}

/**
 * 按解析函数更新页签标题（语言切换后重新取菜单标题）。
 * @param state - 当前状态。
 * @param resolve - 由地址返回标题；返回 `undefined` 保持原标题。
 * @returns 新状态；没有变化时返回原对象。
 */
export function retitleTabs(state: TabsState, resolve: (url: string) => string | undefined): TabsState {
  let changed = false;
  const tabs = state.tabs.map(tab => {
    const title = resolve(tab.url);
    if (title === undefined || title === tab.title) return tab;
    changed = true;
    return { ...tab, title };
  });
  return changed ? { ...state, tabs } : state;
}
