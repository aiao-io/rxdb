import { resolveUiLocale, type UiLocale } from '@aiao/rxdb-i18n';
import { parseHostLocale, type HostLocale } from '@modules/orbit';

/** 独立运行时持久化用户语言选择的 localStorage 键。 */
export const BENCHMARKS_LOCALE_KEY = 'rxdb-benchmarks-locale';

/** 启动语言解析的输入：宿主 props、本地持久化偏好与设备语言。 */
export interface InitialLocaleInput {
  /** 嵌入时宿主经 orbit props 下发的语言；未嵌入或未下发时为 undefined。 */
  readonly hostLocale?: unknown;
  /** 本机 localStorage 里保存的用户选择。 */
  readonly storedLocale?: string | null;
  /** 设备语言（通常取 navigator.language）。 */
  readonly deviceLocale?: string;
}

/** 组装 I18n 启动语言选项的结果：宿主语言、持久化偏好与设备语言各归其位。 */
export interface InitialLocaleOptions {
  /** 宿主下发的语言；无法识别时为 undefined，交给其余偏好。 */
  readonly hostLocale: HostLocale | undefined;
  /** 持久化偏好；没有合法值时留给设备语言。 */
  readonly locale: UiLocale | undefined;
  /** 归一化后的设备语言；缺省 zh-Hans。 */
  readonly deviceLocale: UiLocale;
}

/**
 * 解析应用启动语言，优先级：宿主语言 → 持久化偏好 → 设备语言 → zh-Hans。
 *
 * 宿主语言经 {@link parseHostLocale} 只接受受支持集合，启动期由 I18n 的
 * `hostLocale` 选项覆盖其余偏好；用户显式切换后让位，且不写入偏好存储。
 */
export function resolveInitialLocaleOptions({
  hostLocale,
  storedLocale,
  deviceLocale
}: InitialLocaleInput): InitialLocaleOptions {
  return {
    hostLocale: parseHostLocale(hostLocale),
    locale: typeof storedLocale === 'string' && storedLocale.trim() ? resolveUiLocale(storedLocale) : undefined,
    deviceLocale: resolveUiLocale(deviceLocale)
  };
}
