import type { MessageSource } from './catalog.js';

/** 一条目录消息及其存储层。 */
export interface I18nInspectedMessage {
  /** 规范化语言。 */
  readonly locale: string;
  /** 目录命名空间。 */
  readonly namespace: string;
  /** 文案 key。 */
  readonly key: string;
  /** ICU 源文案。 */
  readonly value: string;
  /** bundle、remote 或 db 存储层。 */
  readonly source: MessageSource;
  /** 此行是相同语言、命名空间及 key 的最高优先级版本。 */
  readonly active: boolean;
}

/** 一条缺失文案诊断。 */
export interface I18nInspectedMissingMessage {
  /** 诊断行身份。 */
  readonly id: string;
  /** 缺失时的当前语言。 */
  readonly locale: string;
  /** 目录命名空间。 */
  readonly namespace: string;
  /** 缺失 key。 */
  readonly key: string;
  /** 首次观察的 ISO 时间。 */
  readonly updatedAt: string;
}

/** 脱离运行时可变状态、可直接序列化的检视快照。 */
export interface I18nInspection {
  /** 当前生效语言。 */
  readonly locale: string;
  /** 已有目录的语言。 */
  readonly availableLocales: readonly string[];
  /** 包含被覆盖版本的全部目录行。 */
  readonly messages: readonly I18nInspectedMessage[];
  /** 已排队诊断写入完成后的缺失 key。 */
  readonly missingMessages: readonly I18nInspectedMissingMessage[];
}
