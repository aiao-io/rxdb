import { I18n } from '@aiao/rxdb-i18n';
import type { Observable, Subscription } from 'rxjs';
import { modelMessages } from './messages.js';

/** 组件消费的翻译运行时。 */
export interface ModelI18n {
  /** 解析命名空间中的消息。 */
  t(key: string, params?: Record<string, unknown>, namespace?: string): string;
  /** 目录和语言变化通知。 */
  readonly changes$?: Observable<unknown>;
  /** 使用当前语言格式化日期。 */
  formatDate?(value: Date, options?: Intl.DateTimeFormatOptions): string;
  /** 使用当前语言格式化数字。 */
  formatNumber?(value: number, options?: Intl.NumberFormatOptions): string;
}

/** 未提供运行时时使用的静态中文目录。 */
export const defaultModelI18n = new I18n({
  defaultLocale: 'zh-Hans',
  deviceLocale: 'zh-Hans',
  catalogs: modelMessages
});

/** 读取组件目录，应用配置的目录优先。 */
export function modelText(key: string, params?: Record<string, unknown>, i18n: ModelI18n = defaultModelI18n): string {
  return i18n.t(key, params, 'rxdb-model');
}

const tableRuntimes = new WeakMap<object, ModelI18n>();

/** 将组件运行时绑定到表格实例，编辑器按所属表格读取。 */
export function setTableI18n(table: object, runtime: ModelI18n): void {
  tableRuntimes.set(table, runtime);
}

/** 管理已打开 DOM 编辑器的翻译与订阅。 */
export class ModelEditorI18n {
  #runtime: ModelI18n = defaultModelI18n;
  #subscription: Subscription | undefined;
  readonly #values = new Map<string, { key: string; params?: Record<string, unknown> }>();
  readonly #bindings = new Map<HTMLElement, Map<string, () => string>>();

  /** 打开编辑器时订阅所属表格运行时。 */
  start(table: unknown): void {
    this.clear();
    this.#runtime =
      typeof table === 'object' && table !== null ? (tableRuntimes.get(table) ?? defaultModelI18n) : defaultModelI18n;
    this.#subscription = this.#runtime.changes$?.subscribe(() => {
      for (const [element, properties] of this.#bindings) {
        for (const [property, render] of properties) Reflect.set(element, property, render());
      }
    });
  }

  /** 读取当前编辑器语言的文案。 */
  t(key: string, params?: Record<string, unknown>): string {
    const value = modelText(key, params, this.#runtime);
    this.#values.set(value, { key, params });
    return value;
  }

  /** 绑定需要随语言立即更新的 DOM 属性。 */
  bind(element: HTMLElement, property: string, render: () => string): void {
    const properties = this.#bindings.get(element) ?? new Map<string, () => string>();
    properties.set(property, render);
    this.#bindings.set(element, properties);
    Reflect.set(element, property, render());
  }

  /** 将已格式化的文案绑定回消息键，保留当前错误的语义。 */
  bindValue(element: HTMLElement, property: string, value: string): void {
    const message = value === '' ? undefined : this.#values.get(value);
    this.bind(element, property, () => (message ? this.t(message.key, message.params) : value));
  }

  /** 关闭编辑器时解除订阅与 DOM 引用。 */
  clear(): void {
    this.#subscription?.unsubscribe();
    this.#subscription = undefined;
    this.#bindings.clear();
    this.#values.clear();
  }
}
