import { IntlMessageFormat } from 'intl-messageformat';
import { canonicalizeLocale } from './locale.js';

/** 一组属于同一语言及命名空间的 ICU 源文案。 */
export interface MessageCatalog {
  /** BCP 47 语言标签。 */
  readonly locale: string;
  /** 应用或组件命名空间。 */
  readonly namespace: string;
  /** key 到 ICU 源文案；空字符串合法。 */
  readonly messages: Readonly<Record<string, string>>;
}

/** 文案来源，按所在存储层决定优先级。 */
export type MessageSource = 'bundle' | 'remote' | 'db';

/** 单条目录消息的结构。 */
export interface CatalogMessage {
  /** 规范化语言。 */
  readonly locale: string;
  /** 命名空间。 */
  readonly namespace: string;
  /** 文案键。 */
  readonly key: string;
  /** ICU 源文案。 */
  readonly value: string;
}

/** 查找结果；未命中时 value 为 undefined。 */
export interface ResolvedMessage {
  /** 命中的源文案。 */
  readonly value: string | undefined;
  /** 命中的语言。 */
  readonly locale?: string;
  /** 命中的来源。 */
  readonly source?: MessageSource;
}

/** 用 JSON 元组编码身份，分隔符出现在字段内也不碰撞。 */
export const messageId = (locale: string, namespace: string, key: string): string =>
  JSON.stringify([canonicalizeLocale(locale), namespace, key]);

/** 完整校验目录后才返回行，调用者可原子合入。 */
export const catalogMessages = (catalog: MessageCatalog): CatalogMessage[] => {
  const locale = canonicalizeLocale(catalog.locale);
  if (!catalog.namespace) throw new TypeError('namespace must not be empty');
  return Object.entries(catalog.messages).map(([key, value]) => {
    if (!key || typeof value !== 'string') throw new TypeError('message key and value must be strings');
    new IntlMessageFormat(value, locale, undefined, { ignoreTag: true });
    return { locale, namespace: catalog.namespace, key, value };
  });
};

/** 按语言链查找消息；同语言的层优先级由调用者合并后的行决定。 */
export const resolveMessage = (
  messages: readonly CatalogMessage[],
  locales: readonly string[],
  namespace: string,
  key: string
): ResolvedMessage => {
  const rows = new Map(messages.map(row => [messageId(row.locale, row.namespace, row.key), row]));
  for (const locale of locales) {
    const message = rows.get(messageId(locale, namespace, key));
    if (message !== undefined) return { value: message.value, locale };
  }
  return { value: undefined };
};
