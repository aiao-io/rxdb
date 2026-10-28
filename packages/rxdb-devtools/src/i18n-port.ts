import type { Subscribable } from './connector-subscribe-once.js';
import { DEVTOOLS_PROVIDER_OPERATIONS } from './provider/descriptor.js';
import type { DevToolsProvider } from './provider/types.js';
import { createProviderError, mapPlatformError } from './v2/error-mapping.js';
import { hasExactKeys, isRecord } from './v2/guards.js';

/** 一条可检视的目录消息。 */
export interface DevToolsI18nMessage {
  /** 规范化语言。 */
  readonly locale: string;
  /** 目录命名空间。 */
  readonly namespace: string;
  /** 文案 key。 */
  readonly key: string;
  /** ICU 源文案。 */
  readonly value: string;
  /** 文案来源层。 */
  readonly source: 'bundle' | 'remote' | 'db';
  /** 相同消息身份的当前最高优先级行。 */
  readonly active: boolean;
}

/** 缺失文案诊断的 wire 形状。 */
export interface DevToolsI18nMissingMessage {
  /** 诊断行身份。 */
  readonly id: string;
  /** 缺失时的语言。 */
  readonly locale: string;
  /** 目录命名空间。 */
  readonly namespace: string;
  /** 缺失 key。 */
  readonly key: string;
  /** 首次观察的 ISO 时间。 */
  readonly updatedAt: string;
}

/** database.inspect 的可选国际化快照。 */
export interface DevToolsI18nSnapshot {
  /** 当前生效语言。 */
  readonly locale: string;
  /** 可用目录语言。 */
  readonly availableLocales: readonly string[];
  /** 含被覆盖版本的目录行。 */
  readonly messages: readonly DevToolsI18nMessage[];
  /** 缺失文案诊断。 */
  readonly missingMessages: readonly DevToolsI18nMissingMessage[];
  /** 当前 session 同时满足能力档、写策略、provider 与清空端口。 */
  readonly canClearMissing: boolean;
}

/** 应用显式注入的结构端口，DevTools 无需依赖任何国际化实现包。 */
export interface DevToolsI18nPort {
  /** 语言、目录或诊断变化。 */
  readonly inspection$: Subscribable<unknown>;
  /** 返回脱离运行时可变引用的快照。 */
  inspect(): Promise<Omit<DevToolsI18nSnapshot, 'canClearMissing'>>;
  /** 可选的诊断清空能力；省略即仅检视。 */
  clearMissingMessages?: () => Promise<void>;
}

const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(item => typeof item === 'string');
const message = (value: unknown): boolean =>
  isRecord(value) &&
  strings([value['locale'], value['namespace'], value['key'], value['value']]) &&
  typeof value['source'] === 'string' &&
  ['bundle', 'remote', 'db'].includes(value['source']) &&
  typeof value['active'] === 'boolean';
const missing = (value: unknown): boolean =>
  isRecord(value) && strings([value['id'], value['locale'], value['namespace'], value['key'], value['updatedAt']]);

/**
 * 校验来自调试信道的国际化快照。
 * @param value - 未受信任的响应或事件数据。
 * @returns 全部目录及诊断行形状合法时为 true。
 */
export const isDevToolsI18nSnapshot = (value: unknown): value is DevToolsI18nSnapshot =>
  isRecord(value) &&
  typeof value['locale'] === 'string' &&
  strings(value['availableLocales']) &&
  typeof value['canClearMissing'] === 'boolean' &&
  Array.isArray(value['messages']) &&
  value['messages'].every(message) &&
  Array.isArray(value['missingMessages']) &&
  value['missingMessages'].every(missing);

/** 只拦截显式的国际化 scope；未带 scope 的旧 clear 逐字委托原 provider。 */
export const withI18nSettings = (provider: DevToolsProvider, i18n?: DevToolsI18nPort): DevToolsProvider => ({
  descriptor:
    i18n?.clearMissingMessages && provider.descriptor.kind !== 'unavailable' ?
      {
        ...provider.descriptor,
        operations: DEVTOOLS_PROVIDER_OPERATIONS.settings.filter(
          operation => operation === 'clear' || provider.descriptor.operations.includes(operation)
        )
      }
    : provider.descriptor,
  async invoke(operation, params) {
    if (operation !== 'clear') return provider.invoke(operation, params);
    if (!isRecord(params) || !Object.hasOwn(params, 'scope')) {
      if (provider.descriptor.kind === 'unavailable' || !provider.descriptor.operations.includes('clear'))
        return { outcome: 'failed', error: createProviderError('provider_unsupported') };
      return provider.invoke(operation, params);
    }
    if (!hasExactKeys(params, ['scope']) || params['scope'] !== 'i18n-missing' || !i18n?.clearMissingMessages)
      return { outcome: 'failed', error: createProviderError('provider_unsupported') };
    try {
      await i18n.clearMissingMessages();
      return { outcome: 'ok', result: null };
    } catch (error) {
      return { outcome: 'failed', error: mapPlatformError('dom', error) };
    }
  }
});
