import { ALLOWED_CAPABILITIES, type ProviderConfig } from '../../config';
import type { Modality } from '../core/types';
import type { AnyProvider } from '../providers/types';

const HEALTH_PROBE_TIMEOUT_MS = 1000;

export interface ProviderFactory {
  readonly id: string;
  readonly modality: Modality;
  /**
   * 由 ProviderConfig 构造 provider 实例
   *
   * - 构造失败抛出的 Error 会被 bootstrap 捕获并标记 skipped
   * - 不要在 build() 内做网络请求（健康探活在 bootstrap 阶段做）
   */
  build(config: ProviderConfig): AnyProvider;
}

export interface ProviderRegistry {
  /** id → enabled provider 实例 */
  providers: Map<string, AnyProvider>;
  /** 模态 → 默认 provider id（null = 该模态无任何 enabled provider） */
  defaultByModality: Record<Modality, string | null>;
  /** 跳过的 provider 清单（启动日志输出来源） */
  skipped: Array<{ id: string; reason: string }>;
}

export interface BootstrapOptions {
  configs: ProviderConfig[];
  factories: ProviderFactory[];
  /**
   * 致命错误回调钩子（默认 `process.exit(1)`）
   *
   * 测试用：注入抛错替代退出，便于断言冲突场景
   */
  onFatal?: (msg: string) => never;
}

const defaultFatal = (msg: string): never => {
  console.error(`[gateway] ${msg}`);
  process.exit(1);
};

const validateCapabilities = (configs: ProviderConfig[], fatal: (msg: string) => never): void => {
  const allowed = new Set<string>(ALLOWED_CAPABILITIES as readonly string[]);
  for (const c of configs) {
    for (const cap of c.capabilities) {
      if (!allowed.has(cap)) {
        fatal(
          `provider=${c.id} declares non-whitelist capability "${cap}" (allowed: ${ALLOWED_CAPABILITIES.join(' | ')})`
        );
      }
    }
  }
};

const validateDefaults = (
  configs: ProviderConfig[],
  fatal: (msg: string) => never
): Record<Modality, string | null> => {
  const byModality = new Map<Modality, ProviderConfig[]>();
  for (const c of configs) {
    if (!byModality.has(c.modality)) byModality.set(c.modality, []);
    byModality.get(c.modality)!.push(c);
  }
  const result: Record<Modality, string | null> = { chat: null, asr: null, tts: null };
  for (const [modality, list] of byModality) {
    const defaults = list.filter(c => c.isDefault);
    if (defaults.length > 1) {
      fatal(
        `multiple providers declare isDefault: true for modality=${modality}: ${defaults.map(c => c.id).join(', ')}`
      );
    }
    if (defaults.length === 1) result[modality] = defaults[0].id;
  }
  return result;
};

const validateFactories = (
  configs: ProviderConfig[],
  factoriesById: Map<string, ProviderFactory>,
  fatal: (msg: string) => never
): void => {
  for (const c of configs) {
    const f = factoriesById.get(c.id);
    if (!f) {
      fatal(
        `provider id "${c.id}" in providers.yaml has no registered factory; add apps/api/src/gateway/providers/<id>.factory.ts and pass it to bootstrapProviderRegistry`
      );
    }
    if (f!.modality !== c.modality) {
      fatal(`provider ${c.id}: factory modality "${f!.modality}" mismatches config modality "${c.modality}"`);
    }
  }
};

interface ProbeResult {
  config: ProviderConfig;
  instance: AnyProvider | null;
  reason?: string;
}

const probeProvider = async (config: ProviderConfig, factory: ProviderFactory): Promise<ProbeResult> => {
  let instance: AnyProvider;
  try {
    instance = factory.build(config);
  } catch (e) {
    return { config, instance: null, reason: `factory build failed: ${(e as Error).message}` };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error('health probe timeout (1s)')), HEALTH_PROBE_TIMEOUT_MS);
  timer.unref?.();
  try {
    await instance.healthCheck(ctrl.signal);
    return { config, instance };
  } catch (e) {
    const reason = (e as Error).message || String(e);
    return { config, instance: null, reason };
  } finally {
    clearTimeout(timer);
  }
};

const applyDefaultFallback = (
  declaredDefaults: Record<Modality, string | null>,
  providers: Map<string, AnyProvider>,
  configs: ProviderConfig[]
): Record<Modality, string | null> => {
  const result: Record<Modality, string | null> = { ...declaredDefaults };
  for (const modality of ['chat', 'asr', 'tts'] as const) {
    const declared = result[modality];
    if (declared && !providers.has(declared)) {
      console.warn(
        `[gateway] declared default provider=${declared} for modality=${modality} was skipped; falling back to first enabled`
      );
      result[modality] = null;
    }
    if (!result[modality]) {
      const firstEnabled = configs.find(c => c.modality === modality && providers.has(c.id));
      if (firstEnabled) {
        result[modality] = firstEnabled.id;
        console.warn(
          `[gateway] no explicit default for modality=${modality}, falling back to first enabled provider=${firstEnabled.id}`
        );
      }
    }
  }
  return result;
};

/**
 * 启动期装配 ProviderRegistry（FR-002 / FR-003 / FR-004）
 *
 * 流程：
 * 1. capability 白名单校验（不通过 → 致命）
 * 2. isDefault 唯一性校验（同模态多于 1 个 → 致命）
 * 3. factory ↔ config 配对（缺失 / modality 不匹配 → 致命）
 * 4. 并发健康探活（每 provider 1s 超时；失败 → skipped）
 * 5. default 回退：显式 default 被 skipped 或未声明 → 取首个 enabled
 *
 * 启动日志格式（FR-004）：
 *   [gateway] provider=<id> modality=<m> status=enabled
 *   [gateway] provider=<id> modality=<m> status=skipped reason="<msg>"
 */
export async function bootstrapProviderRegistry(opts: BootstrapOptions): Promise<ProviderRegistry> {
  const fatal = opts.onFatal ?? defaultFatal;

  validateCapabilities(opts.configs, fatal);
  const declaredDefaults = validateDefaults(opts.configs, fatal);

  const factoriesById = new Map<string, ProviderFactory>();
  for (const f of opts.factories) {
    if (factoriesById.has(f.id)) {
      fatal(`duplicate provider factory id: ${f.id}`);
    }
    factoriesById.set(f.id, f);
  }
  validateFactories(opts.configs, factoriesById, fatal);

  const results = await Promise.all(opts.configs.map(c => probeProvider(c, factoriesById.get(c.id)!)));

  const providers = new Map<string, AnyProvider>();
  const skipped: Array<{ id: string; reason: string }> = [];
  for (const r of results) {
    if (r.instance) {
      providers.set(r.config.id, r.instance);
      console.log(`[gateway] provider=${r.config.id} modality=${r.config.modality} status=enabled`);
    } else {
      skipped.push({ id: r.config.id, reason: r.reason ?? 'unknown' });
      console.warn(
        `[gateway] provider=${r.config.id} modality=${r.config.modality} status=skipped reason="${r.reason ?? 'unknown'}"`
      );
    }
  }

  const defaultByModality = applyDefaultFallback(declaredDefaults, providers, opts.configs);

  return { providers, defaultByModality, skipped };
}
