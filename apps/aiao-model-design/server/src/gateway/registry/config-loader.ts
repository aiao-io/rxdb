import { loadGatewayConfig, type ProviderConfig } from '../../config';

export interface LoadedConfigs {
  /** providers.yaml 中的全部 provider 配置（env 已插值） */
  configs: ProviderConfig[];
}

/**
 * 从 providers.yaml 装载配置
 *
 * 仅做 YAML 解析 + env 插值；capability 白名单 / isDefault 唯一性 / model id 冲突
 * 等校验由 provider-registry / model-registry 处理。
 *
 * @param configPath 可选自定义路径（测试用）
 */
export function loadProviderConfigs(configPath?: string): LoadedConfigs {
  const { providers } = loadGatewayConfig(configPath);
  return { configs: providers };
}
