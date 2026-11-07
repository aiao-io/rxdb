import type { Observable } from 'rxjs';
import type { AdminPreferences } from '../preferences/types.js';
import type { StorageLike } from '../storage.js';
import { Store, type ReadableStore } from '../store.js';
import { matchText, rankItems, splitHighlight, type TextSegment } from './fuzzy.js';

/** 命令面板里的一条可执行项。 */
export interface PaletteItem {
  /** 唯一标识，用于记录最近使用。 */
  readonly id: string;
  /** 主文本。 */
  readonly label: string;
  /** 次要文本（所属分组、路径）。 */
  readonly sublabel?: string;
  /** 额外检索词。 */
  readonly keywords?: readonly string[];
  /** 图标，类型由三端绑定决定。 */
  readonly icon?: unknown;
  /** 选中后执行。 */
  readonly run: () => void | Promise<void>;
}

/** 结果来源。同步源提供全量候选由面板模糊过滤；异步源自行按查询返回（如全文搜索）。 */
export interface PaletteSource {
  /** 唯一标识。 */
  readonly id: string;
  /** 分组标题翻译键。 */
  readonly groupLabelKey?: string;
  /** 分组标题字面量。 */
  readonly groupLabel?: string;
  /** 同步源：返回全量候选。 */
  readonly items?: () => readonly PaletteItem[];
  /** 异步源：按查询搜索，查询变化时 `signal` 会被中止。 */
  readonly search?: (query: string, signal: AbortSignal) => Promise<readonly PaletteItem[]>;
  /** 异步源触发搜索的最短查询长度，缺省 1。 */
  readonly minQueryLength?: number;
  /** 选中后是否记入最近使用；缺省同步源记录、异步源不记录。 */
  readonly remember?: boolean;
}

/** 一条结果。 */
export interface PaletteEntry {
  /** 可执行项。 */
  readonly item: PaletteItem;
  /** 来源标识。 */
  readonly sourceId: string;
  /** 主文本按命中切分的片段。 */
  readonly segments: TextSegment[];
  /** 在全部结果中的下标，键盘导航使用。 */
  readonly index: number;
}

/** 结果分组。 */
export interface PaletteGroup {
  /** 来源标识。 */
  readonly id: string;
  /** 标题翻译键。 */
  readonly labelKey?: string;
  /** 标题字面量。 */
  readonly label?: string;
  /** 结果。 */
  readonly entries: PaletteEntry[];
}

/** 命令面板状态。 */
export interface PaletteState {
  /** 是否打开。 */
  readonly open: boolean;
  /** 查询文本。 */
  readonly query: string;
  /** 有异步源正在搜索。 */
  readonly loading: boolean;
  /** 搜索失败的异步源标识。 */
  readonly failed: readonly string[];
  /** 分组结果。 */
  readonly groups: PaletteGroup[];
  /** 结果总数。 */
  readonly total: number;
  /** 选中项下标。 */
  readonly selectedIndex: number;
  /** `recent`：空查询时的最近使用 / 建议；`results`：查询结果。 */
  readonly mode: 'recent' | 'results';
}

/** 最近使用的存储键。 */
export const PALETTE_RECENTS_KEY = 'aiao.admin.palette.recents';

const MAX_STORED_RECENTS = 20;
const DEFAULT_DEBOUNCE_MS = 150;

const CLOSED: PaletteState = {
  open: false,
  query: '',
  loading: false,
  failed: [],
  groups: [],
  total: 0,
  selectedIndex: 0,
  mode: 'recent'
};

/** {@link PaletteController} 的构造选项。 */
export interface PaletteControllerOptions {
  /** 偏好：读取每组结果上限与最近使用条数。 */
  readonly preferences: ReadableStore<AdminPreferences>;
  /** 最近使用的持久化介质。 */
  readonly storage: StorageLike;
  /** 异步源防抖毫秒数，缺省 150。 */
  readonly debounceMs?: number;
  /** 最近使用的存储键，缺省 {@link PALETTE_RECENTS_KEY}。 */
  readonly recentsKey?: string;
}

const readRecents = (storage: StorageLike, key: string): string[] => {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(key) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
};

const plain = (text: string): TextSegment[] => [{ text, match: false }];

/**
 * 命令面板控制器：多来源聚合、同步模糊过滤、异步源防抖与迟到结果保护、最近使用。
 *
 * @remarks
 * 外壳内置「菜单」与「命令」两个同步源；应用可追加自己的来源，例如对接 `rxdb-plugin-search` 的全文搜索。
 */
export class PaletteController implements ReadableStore<PaletteState> {
  readonly #state = new Store<PaletteState>(CLOSED);
  readonly #sources = new Map<string, PaletteSource>();
  readonly #asyncResults = new Map<string, readonly PaletteItem[]>();
  readonly #options: PaletteControllerOptions;
  #sequence = 0;
  #abort: AbortController | undefined;
  #timer: ReturnType<typeof setTimeout> | undefined;

  get #recentsKey(): string {
    return this.#options.recentsKey ?? PALETTE_RECENTS_KEY;
  }

  /** 当前状态的快照。 */
  get value(): PaletteState {
    return this.#state.value;
  }

  /** 回放当前状态并推送后续变更。 */
  get changes$(): Observable<PaletteState> {
    return this.#state.changes$;
  }

  /**
   * 创建控制器。
   * @param options - 偏好、存储与防抖。
   */
  constructor(options: PaletteControllerOptions) {
    this.#options = options;
  }

  /**
   * 订阅后续变更。
   * @param listener - 变更回调。
   * @returns 退订函数。
   */
  subscribe(listener: (value: PaletteState) => void): () => void {
    return this.#state.subscribe(listener);
  }

  /**
   * 注册结果来源。
   * @param source - 来源。
   * @returns 注销函数。
   * @throws 标识重复，或既不是同步源也不是异步源时抛错。
   */
  registerSource(source: PaletteSource): () => void {
    if (this.#sources.has(source.id)) throw new Error(`Palette source "${source.id}" is already registered`);
    if (!source.items && !source.search) throw new Error(`Palette source "${source.id}" needs items or search`);
    this.#sources.set(source.id, source);
    this.#refresh();
    return () => {
      this.#sources.delete(source.id);
      this.#asyncResults.delete(source.id);
      this.#refresh();
    };
  }

  /** 打开面板并清空查询。 */
  open(): void {
    this.#cancelSearch();
    this.#state.set(this.#compute({ ...CLOSED, open: true }));
  }

  /** 关闭面板并取消进行中的搜索。 */
  close(): void {
    this.#cancelSearch();
    this.#state.set(CLOSED);
  }

  /** 切换面板。 */
  toggle(): void {
    if (this.value.open) this.close();
    else this.open();
  }

  /**
   * 更新查询：同步源立即过滤，异步源防抖后搜索。
   * @param query - 查询文本。
   */
  setQuery(query: string): void {
    if (!this.value.open) return;
    this.#cancelSearch();
    this.#state.set(this.#compute({ ...this.value, query, selectedIndex: 0, loading: false, failed: [] }));
    this.#scheduleSearch(query.trim());
  }

  /**
   * 移动选中项，首尾循环。
   * @param delta - 位移，通常是 ±1。
   */
  moveSelection(delta: number): void {
    const { total, selectedIndex } = this.value;
    if (total === 0) return;
    this.#state.set({ ...this.value, selectedIndex: (((selectedIndex + delta) % total) + total) % total });
  }

  /**
   * 直接指定选中项（鼠标悬停）。
   * @param index - 下标。
   */
  hover(index: number): void {
    if (index >= 0 && index < this.value.total) this.#state.set({ ...this.value, selectedIndex: index });
  }

  /**
   * 执行选中项：先关闭面板再执行，使焦点能回到触发处。
   * @param index - 要执行的下标，缺省为当前选中项。
   */
  async select(index = this.value.selectedIndex): Promise<void> {
    const entry = this.value.groups.flatMap(group => group.entries).find(candidate => candidate.index === index);
    if (!entry) return;
    const source = this.#sources.get(entry.sourceId);
    this.close();
    if (source && (source.remember ?? source.items !== undefined)) this.#remember(entry.item.id);
    await entry.item.run();
  }

  #cancelSearch(): void {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#abort?.abort();
    this.#abort = undefined;
    this.#sequence += 1;
    this.#asyncResults.clear();
  }

  #scheduleSearch(query: string): void {
    const targets = [...this.#sources.values()].filter(
      source => source.search && query.length >= (source.minQueryLength ?? 1)
    );
    if (targets.length === 0) return;
    this.#state.set({ ...this.value, loading: true, failed: [] });
    this.#timer = setTimeout(
      () => void this.#runSearch(query, targets),
      this.#options.debounceMs ?? DEFAULT_DEBOUNCE_MS
    );
  }

  async #runSearch(query: string, targets: readonly PaletteSource[]): Promise<void> {
    const sequence = ++this.#sequence;
    const controller = new AbortController();
    this.#abort = controller;
    await Promise.all(
      targets.map(async source => {
        try {
          const items = await source.search?.(query, controller.signal);
          if (sequence === this.#sequence) this.#asyncResults.set(source.id, items ?? []);
        } catch {
          if (sequence === this.#sequence)
            this.#state.set({ ...this.value, failed: [...this.value.failed, source.id] });
        }
        if (sequence === this.#sequence) this.#refresh();
      })
    );
    if (sequence === this.#sequence) this.#state.set({ ...this.value, loading: false });
  }

  #remember(id: string): void {
    const { storage } = this.#options;
    const next = [id, ...readRecents(storage, this.#recentsKey).filter(item => item !== id)].slice(
      0,
      MAX_STORED_RECENTS
    );
    storage.setItem(this.#recentsKey, JSON.stringify(next));
  }

  #refresh(): void {
    if (this.value.open) this.#state.set(this.#compute(this.value));
  }

  #compute(current: PaletteState): PaletteState {
    const { palette } = this.#options.preferences.value;
    const query = current.query.trim();
    const groups = query === '' ? this.#idleGroups(palette) : this.#resultGroups(query, palette.maxResults);
    const total = groups.reduce((sum, group) => sum + group.entries.length, 0);
    return {
      ...current,
      groups,
      total,
      mode: query === '' ? 'recent' : 'results',
      selectedIndex: Math.min(current.selectedIndex, Math.max(0, total - 1))
    };
  }

  #resultGroups(query: string, limit: number): PaletteGroup[] {
    let next = 0;
    const groups: PaletteGroup[] = [];
    for (const source of this.#sources.values()) {
      const ranked =
        source.items ?
          rankItems(query, source.items(), limit)
        : (this.#asyncResults.get(source.id) ?? []).slice(0, limit).map(item => ({
            item,
            labelRanges: matchText(query, item.label)?.ranges ?? []
          }));
      if (ranked.length === 0) continue;
      const entries = ranked.map(({ item, labelRanges }) => ({
        item,
        sourceId: source.id,
        segments: splitHighlight(item.label, labelRanges),
        index: next++
      }));
      groups.push(groupOf(source, entries));
    }
    return groups;
  }

  #idleGroups(palette: AdminPreferences['palette']): PaletteGroup[] {
    const sync = [...this.#sources.values()].filter(source => source.items);
    const recents = readRecents(this.#options.storage, this.#recentsKey).slice(0, palette.recents);
    const known = new Map(
      sync.flatMap(source => (source.items?.() ?? []).map(item => [item.id, { item, source }] as const))
    );
    const remembered = recents.flatMap(id => {
      const hit = known.get(id);
      return hit ? [hit] : [];
    });
    let next = 0;
    if (remembered.length > 0) {
      const entries = remembered.map(({ item, source }) => ({
        item,
        sourceId: source.id,
        segments: plain(item.label),
        index: next++
      }));
      return [{ id: 'recent', labelKey: 'palette.group.recent', entries }];
    }
    return sync
      .map(source => {
        const entries = (source.items?.() ?? []).slice(0, palette.maxResults).map(item => ({
          item,
          sourceId: source.id,
          segments: plain(item.label),
          index: next++
        }));
        return groupOf(source, entries);
      })
      .filter(group => group.entries.length > 0);
  }
}

function groupOf(source: PaletteSource, entries: PaletteEntry[]): PaletteGroup {
  return {
    id: source.id,
    ...(source.groupLabelKey ? { labelKey: source.groupLabelKey } : {}),
    ...(source.groupLabel ? { label: source.groupLabel } : {}),
    entries
  };
}
