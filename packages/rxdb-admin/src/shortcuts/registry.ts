import type { AdminPreferences } from '../preferences/types.js';
import { Store, derive, type ReadableStore } from '../store.js';
import {
  formatCombo,
  matchesCombo,
  parseCombo,
  type KeyEventLike,
  type ParsedCombo,
  type ShortcutPlatform
} from './combo.js';

/** 快捷键注册中心读写偏好的最小契约，`PreferencesStore` 天然满足。 */
export interface ShortcutPreferences extends ReadableStore<AdminPreferences> {
  /** 按点分路径写入偏好。 */
  setPath(path: string, value: unknown): void;
}

/** 键盘事件，除按键信息外还需要能阻止默认行为。 */
export interface ShortcutKeyboardEvent extends KeyEventLike {
  /** 事件目标，用于判断是否正在输入。 */
  readonly target?: unknown;
  /** 输入法组合中。 */
  readonly isComposing?: boolean;
  /** 长按重复触发。 */
  readonly repeat?: boolean;
  /** 阻止浏览器默认行为。 */
  preventDefault(): void;
}

/** 可挂载键盘监听的目标，`window` / `document` 天然满足。 */
export interface ShortcutTarget {
  /** 注册监听。 */
  addEventListener(type: 'keydown', listener: (event: KeyboardEvent) => void, capture: boolean): void;
  /** 移除监听。 */
  removeEventListener(type: 'keydown', listener: (event: KeyboardEvent) => void, capture: boolean): void;
}

/** 一条快捷键的声明。 */
export interface ShortcutDefinition {
  /** 唯一标识，用于启停和在界面中列出。 */
  readonly id: string;
  /** 组合键文本，如 `Mod+K`。 */
  readonly combo: string;
  /** 说明的翻译键。 */
  readonly labelKey?: string;
  /** 说明的字面量，无 `labelKey` 时使用。 */
  readonly label?: string;
  /** 命中时执行。 */
  readonly handler: (event: KeyEventLike) => void;
  /** 返回 `false` 时本次不响应（例如锁屏时）。 */
  readonly when?: () => boolean;
  /** 在输入框里是否响应；缺省为含 Ctrl / Meta / Alt 的组合响应，纯字符键不响应。 */
  readonly allowInInput?: boolean;
}

/** 界面列出的快捷键信息。 */
export interface ShortcutInfo {
  /** 标识。 */
  readonly id: string;
  /** 组合键文本。 */
  readonly combo: string;
  /** 说明翻译键。 */
  readonly labelKey?: string;
  /** 说明字面量。 */
  readonly label?: string;
  /** 键帽。 */
  readonly keys: string[];
  /** 连成一行的键帽文本。 */
  readonly text: string;
  /** 是否启用（总开关开启且未被单独关闭）。 */
  readonly enabled: boolean;
}

interface Entry {
  readonly definition: ShortcutDefinition;
  readonly parsed: ParsedCombo;
}

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

const isEditableTarget = (target: unknown): boolean => {
  const element = target as { tagName?: string; isContentEditable?: boolean } | null | undefined;
  return element?.isContentEditable === true || EDITABLE_TAGS.has(element?.tagName ?? '');
};

const hasCommandModifier = (parsed: ParsedCombo): boolean => parsed.mod || parsed.ctrl || parsed.meta || parsed.alt;

/**
 * 快捷键注册中心：统一监听、平台差异、输入框与输入法保护、偏好开关。
 *
 * @remarks
 * 外壳内置几条快捷键，应用通过 {@link ShortcutRegistry.register} 追加自己的，
 * 所有已注册项都会出现在偏好抽屉的「快捷键」页签并可单独启停。
 */
export class ShortcutRegistry {
  readonly #entries = new Store<readonly Entry[]>([]);
  readonly #preferences: ShortcutPreferences;
  readonly #platform: ShortcutPlatform;
  /** 已注册快捷键的界面信息，随注册与偏好变化。 */
  readonly list: ReadableStore<readonly ShortcutInfo[]>;

  /**
   * 创建注册中心。
   * @param options - 偏好与运行平台。
   */
  constructor(options: { preferences: ShortcutPreferences; platform: ShortcutPlatform }) {
    this.#preferences = options.preferences;
    this.#platform = options.platform;
    this.list = derive([this.#entries, this.#preferences], (entries, prefs) =>
      entries.map(({ definition, parsed }) => ({
        id: definition.id,
        combo: definition.combo,
        ...(definition.labelKey ? { labelKey: definition.labelKey } : {}),
        ...(definition.label ? { label: definition.label } : {}),
        ...formatCombo(parsed, options.platform),
        enabled: prefs.shortcuts.enable && !prefs.shortcuts.disabled.includes(definition.id)
      }))
    );
  }

  /**
   * 注册快捷键。
   * @param definition - 声明。
   * @returns 注销函数。
   * @throws 组合键非法、id 重复或与已注册项组合键冲突时抛错。
   */
  register(definition: ShortcutDefinition): () => void {
    const parsed = parseCombo(definition.combo);
    const existing = this.#entries.value;
    if (existing.some(entry => entry.definition.id === definition.id)) {
      throw new Error(`Shortcut "${definition.id}" is already registered`);
    }
    const clash = existing.find(entry => formatCombo(entry.parsed, 'other').text === formatCombo(parsed, 'other').text);
    if (clash) {
      throw new Error(`Shortcut "${definition.id}" (${definition.combo}) conflicts with "${clash.definition.id}"`);
    }
    const entry: Entry = { definition, parsed };
    this.#entries.set([...existing, entry]);
    return () => this.#entries.update(current => current.filter(candidate => candidate !== entry));
  }

  /**
   * 快捷键当前是否启用。
   * @param id - 快捷键标识。
   * @returns 总开关开启且未被单独关闭时为 `true`。
   */
  isEnabled(id: string): boolean {
    const { enable, disabled } = this.#preferences.value.shortcuts;
    return enable && !disabled.includes(id);
  }

  /**
   * 单独启停一条快捷键。
   * @param id - 快捷键标识。
   * @param enabled - 是否启用。
   */
  setEnabled(id: string, enabled: boolean): void {
    const rest = this.#preferences.value.shortcuts.disabled.filter(item => item !== id);
    this.#preferences.setPath('shortcuts.disabled', enabled ? rest : [...rest, id]);
  }

  /**
   * 处理一次键盘事件。
   * @param event - 键盘事件。
   * @returns 命中并已处理返回 `true`。
   */
  handle(event: ShortcutKeyboardEvent): boolean {
    if (event.isComposing || !this.#preferences.value.shortcuts.enable) return false;
    const editable = isEditableTarget(event.target);
    const entry = this.#entries.value.find(candidate => this.#accepts(candidate, event, editable));
    if (!entry) return false;
    event.preventDefault();
    if (!event.repeat) entry.definition.handler(event);
    return true;
  }

  /**
   * 在目标上以捕获阶段监听 keydown，先于业务组件处理。
   * @param target - 通常是 `window`。
   * @returns 取消监听函数。
   */
  attach(target: ShortcutTarget): () => void {
    const listener = (event: KeyboardEvent): void => void this.handle(event);
    target.addEventListener('keydown', listener, true);
    return () => target.removeEventListener('keydown', listener, true);
  }

  #accepts(entry: Entry, event: ShortcutKeyboardEvent, editable: boolean): boolean {
    const { definition, parsed } = entry;
    if (this.#preferences.value.shortcuts.disabled.includes(definition.id)) return false;
    if (definition.when && !definition.when()) return false;
    if (!matchesCombo(event, parsed, this.#platform)) return false;
    return !editable || (definition.allowInInput ?? hasCommandModifier(parsed));
  }
}
