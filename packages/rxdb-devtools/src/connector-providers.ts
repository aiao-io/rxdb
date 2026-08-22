import type { DevToolsProviderDescriptor } from './provider/descriptor.js';
import type { DevToolsMutationPolicy } from './v2/authorization.js';
import type { DevToolsProviderRegistry } from './v2/endpoint.js';

/**
 * 页内 connector 宣告的 provider descriptor。
 *
 * @remarks
 * 空集是当前的**事实**而不是占位：本包不实现任何原生存储 provider，files / settings
 * 在页内根本不存在，database 的 v2 操作也还没有对着 RxDB 实现。
 * 由 US-904 阶段 C / D 与 US-905 各自接上真实 provider 后填充。
 */
export const CONNECTOR_PROVIDER_DESCRIPTORS: readonly DevToolsProviderDescriptor[] = [];

/**
 * 页内 connector 的写入开关。
 *
 * @remarks
 * 硬编码为 `'omit'`，而不是开成一个选项：三层授权里 mutationPolicy 管的是「已声明的写操作
 * 要不要放行」，而本页宣告的 provider 集是空的，眼下没有任何写操作可管。开成选项等于让
 * 使用者去配一个当前不产生任何效果的开关，等 US-904 阶段 C / D 与 US-905 接上真实 provider
 * 时又得连同默认值一起重新想一遍。届时补上选项即可——默认停在 `'omit'`，
 * 意味着「接上 provider」这一步不会顺带把写路径也悄悄打开。
 */
export const CONNECTOR_MUTATION_POLICY: DevToolsMutationPolicy = 'omit';

/**
 * 页内 connector 的 provider 接缝。
 *
 * @remarks
 * 空 descriptor 集让三层授权的第二层拦下每一个操作（`provider_unsupported`），因此
 * {@link DevToolsProviderRegistry.provider} 与 {@link DevToolsProviderRegistry.createChunkSink}
 * 在结构上不可达。两者因此**抛错**而不是返回一个「什么都不支持」的替身：替身会把一处接线
 * 错误变成一条看起来正常的协议应答，而这里需要的是它立刻炸出来。
 */
export const CONNECTOR_PROVIDERS: DevToolsProviderRegistry = {
  descriptors: CONNECTOR_PROVIDER_DESCRIPTORS,
  provider: domain => {
    throw new Error(`no in-page devtools provider for domain "${domain}"`);
  },
  createChunkSink: name => {
    throw new Error(`no in-page devtools chunk sink for transfer "${name}"`);
  }
};
