import type { Observable } from 'rxjs';
import type { StorageLike } from '../storage.js';
import { Store, derive, type ReadableStore } from '../store.js';
import { defaultPreferences } from './defaults.js';
import {
  applyPatch,
  diffPreferences,
  isRecord,
  pathToPatch,
  sanitizePreferences,
  type PreferenceConstraints
} from './merge.js';
import {
  assertValidExtension,
  extensionDefaults,
  sanitizeExtensions,
  type PreferenceExtension
} from './schema/index.js';
import { PREFERENCES_VERSION, type AdminPreferences, type DeepPartial } from './types.js';

/** 偏好在存储里的默认键。 */
export const PREFERENCES_STORAGE_KEY = 'aiao.admin.preferences';

const DEFAULT_DEBOUNCE_MS = 150;

/** 偏好存储监听的宿主事件源，`window` 天然满足。 */
export interface PreferencesHost {
  /** 注册监听。 */
  addEventListener(type: 'storage' | 'pagehide', listener: (event: { key?: string | null }) => void): void;
  /** 移除监听。 */
  removeEventListener(type: 'storage' | 'pagehide', listener: (event: { key?: string | null }) => void): void;
}

/** {@link PreferencesStore} 的构造选项。 */
export interface PreferencesStoreOptions {
  /** 持久化介质。 */
  readonly storage: StorageLike;
  /** 存储键，缺省 {@link PREFERENCES_STORAGE_KEY}。 */
  readonly storageKey?: string;
  /** 应用级默认树，缺省 {@link defaultPreferences}。 */
  readonly defaults?: AdminPreferences;
  /** 叶子取值约束，通常由 `deriveConstraints` 派生。 */
  readonly constraints?: PreferenceConstraints;
  /** 业务扩展偏好，默认值并入默认树。 */
  readonly extensions?: readonly PreferenceExtension[];
  /** 首次使用（存储为空）时读取旧版本键，返回要并入的偏好补丁。 */
  readonly migrateLegacy?: (storage: StorageLike) => DeepPartial<AdminPreferences> | null;
  /** 持久化防抖毫秒数，缺省 150。 */
  readonly debounceMs?: number;
  /** 宿主事件源：跨标签同步与页面隐藏时落盘；缺省不监听。 */
  readonly host?: PreferencesHost;
}

/** {@link PreferencesStore.importJson} 的结果。 */
export type ImportResult =
  { readonly ok: true } | { readonly ok: false; readonly reason: 'invalid-json' | 'not-object' };

const parseJson = (raw: string): { ok: true; value: unknown } | { ok: false } => {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
};

/**
 * 偏好状态树：深合并更新、按约束清洗、防抖持久化差异、跨标签同步。
 *
 * @remarks
 * 存储里只有相对默认值的差异，因此后续版本调整默认值时未改动过的用户自动跟随。
 * 所有写入（界面、导入、其他标签）都经过同一套清洗，状态树始终合法。
 */
export class PreferencesStore implements ReadableStore<AdminPreferences> {
  readonly #state: Store<AdminPreferences>;
  readonly #storage: StorageLike;
  readonly #key: string;
  readonly #constraints: PreferenceConstraints;
  readonly #extensions: readonly PreferenceExtension[];
  readonly #debounceMs: number;
  readonly #host: PreferencesHost | undefined;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #dirty = false;

  /** 生效的默认树（应用默认值 + 扩展默认值）。 */
  readonly defaults: AdminPreferences;
  /** 是否存在相对默认值的改动，驱动「重置」红点。 */
  readonly hasDiff: ReadableStore<boolean>;

  /** 当前偏好的同步快照。 */
  get value(): AdminPreferences {
    return this.#state.value;
  }

  /** 回放当前偏好并推送后续变更。 */
  get changes$(): Observable<AdminPreferences> {
    return this.#state.changes$;
  }

  /**
   * 创建偏好存储并同步加载已保存的偏好。
   * @param options - 存储、默认值、约束与扩展。
   * @throws 扩展声明非法或键重复时抛错。
   */
  constructor(options: PreferencesStoreOptions) {
    this.#extensions = validateExtensions(options.extensions ?? []);
    this.defaults = applyPatch(structuredClone(options.defaults ?? defaultPreferences), {
      extension: extensionDefaults(this.#extensions)
    });
    this.#storage = options.storage;
    this.#key = options.storageKey ?? PREFERENCES_STORAGE_KEY;
    this.#constraints = options.constraints ?? {};
    this.#debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.#host = options.host;
    this.#state = new Store(this.#load(options.migrateLegacy));
    this.hasDiff = derive([this.#state], prefs => diffPreferences(prefs, this.defaults) !== null);
    this.#host?.addEventListener('storage', this.#onStorage);
    this.#host?.addEventListener('pagehide', this.#onPageHide);
  }

  /**
   * 订阅后续变更。
   * @param listener - 变更回调。
   * @returns 退订函数。
   */
  subscribe(listener: (value: AdminPreferences) => void): () => void {
    return this.#state.subscribe(listener);
  }

  /**
   * 深合并补丁，清洗后提交并防抖持久化。
   * @param patch - 偏好补丁，数组整体替换。
   */
  update(patch: DeepPartial<AdminPreferences>): void {
    this.#commit(this.#normalize(applyPatch(this.value, patch)), true);
  }

  /**
   * 按点分路径写入单个值。
   * @param path - 偏好路径，如 `theme.colorPrimary`。
   * @param value - 新值。
   */
  setPath(path: string, value: unknown): void {
    this.update(pathToPatch(path, value) as DeepPartial<AdminPreferences>);
  }

  /** 回到默认树并清除已保存的差异。 */
  reset(): void {
    this.#commit(structuredClone(this.defaults), true);
  }

  /**
   * 相对默认值的差异。
   * @returns 差异；无差异返回 `null`。
   */
  diff(): DeepPartial<AdminPreferences> | null {
    return diffPreferences(this.value, this.defaults);
  }

  /**
   * 导出可复制 / 分享的偏好配置。
   * @returns 相对默认值的差异 JSON，无差异为 `{}`。
   */
  exportJson(): string {
    return JSON.stringify(this.diff() ?? {}, null, 2);
  }

  /**
   * 导入偏好配置：以导出内容整体替换当前偏好（相对默认值），非法取值经清洗回到默认。
   * @param json - {@link exportJson} 产出的文本。
   * @returns 成功，或失败原因；失败时当前偏好保持不变。
   */
  importJson(json: string): ImportResult {
    const parsed = parseJson(json);
    if (!parsed.ok) return { ok: false, reason: 'invalid-json' };
    if (!isRecord(parsed.value)) return { ok: false, reason: 'not-object' };
    this.#commit(this.#normalize(applyPatch(this.defaults, parsed.value)), true);
    return { ok: true };
  }

  /** 立即把待定的写入落盘；本实例没有未保存的改动时什么都不写（不会用旧状态覆盖其他标签刚写入的值）。 */
  flush(): void {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    if (!this.#dirty) return;
    this.#dirty = false;
    const diff = this.diff();
    if (diff === null) this.#storage.removeItem(this.#key);
    else this.#storage.setItem(this.#key, JSON.stringify({ version: PREFERENCES_VERSION, values: diff }));
  }

  /** 落盘并移除宿主监听。 */
  destroy(): void {
    if (this.#timer !== undefined) this.flush();
    this.#host?.removeEventListener('storage', this.#onStorage);
    this.#host?.removeEventListener('pagehide', this.#onPageHide);
  }

  #normalize(tree: unknown): AdminPreferences {
    const clean = sanitizePreferences(tree, this.defaults, this.#constraints);
    return { ...clean, extension: sanitizeExtensions(clean.extension, this.#extensions) };
  }

  #load(migrate: PreferencesStoreOptions['migrateLegacy']): AdminPreferences {
    const raw = this.#storage.getItem(this.#key);
    if (raw === null) return this.#normalize(applyPatch(this.defaults, migrate?.(this.#storage) ?? undefined));
    const parsed = parseJson(raw);
    const envelope = parsed.ok && isRecord(parsed.value) ? parsed.value : undefined;
    const values = envelope?.['version'] === PREFERENCES_VERSION ? envelope['values'] : undefined;
    return this.#normalize(applyPatch(this.defaults, isRecord(values) ? values : undefined));
  }

  #commit(next: AdminPreferences, persist: boolean): void {
    if (diffPreferences(next, this.value) === null) return;
    this.#state.set(next);
    if (!persist) return;
    this.#dirty = true;
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.flush(), this.#debounceMs);
  }

  #reload(): void {
    this.#commit(this.#load(undefined), false);
  }

  readonly #onStorage = (event: { key?: string | null }): void => {
    if (event.key === null || event.key === this.#key) this.#reload();
  };
  readonly #onPageHide = (): void => this.flush();
}

function validateExtensions(extensions: readonly PreferenceExtension[]): readonly PreferenceExtension[] {
  const seen = new Set<string>();
  for (const extension of extensions) {
    assertValidExtension(extension);
    if (seen.has(extension.key)) throw new Error(`Duplicate preference extension "${extension.key}"`);
    seen.add(extension.key);
  }
  return extensions;
}
