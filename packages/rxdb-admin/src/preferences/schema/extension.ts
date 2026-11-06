import { isRecord } from '../merge.js';
import type { PreferenceExtension, PreferenceItem } from './types.js';

const EXTENSION_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;

/**
 * 校验扩展取值是否符合其声明。
 * @param extension - 扩展声明。
 * @param value - 待校验的值。
 * @returns 合法返回 `true`。
 */
export function validateExtensionValue(extension: PreferenceExtension, value: unknown): boolean {
  switch (extension.type) {
    case 'switch':
      return typeof value === 'boolean';
    case 'text':
      return typeof value === 'string';
    case 'select':
      return typeof value === 'string' && (extension.options ?? []).some(option => option.value === value);
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return false;
      if (extension.min !== undefined && value < extension.min) return false;
      if (extension.max !== undefined && value > extension.max) return false;
      const { step, min } = extension;
      return (
        step === undefined ||
        step <= 0 ||
        Math.abs((value - (min ?? 0)) / step - Math.round((value - (min ?? 0)) / step)) < 1e-9
      );
    }
  }
}

/**
 * 校验扩展声明本身，注册时调用，非法立即抛错。
 * @param extension - 扩展声明。
 * @throws 键不合法、`select` 缺选项、`number` 范围颠倒、默认值不符合声明时。
 */
export function assertValidExtension(extension: PreferenceExtension): void {
  if (!EXTENSION_KEY_PATTERN.test(extension.key)) {
    throw new Error(`Invalid preference extension key "${extension.key}"`);
  }
  if (extension.type === 'select' && !extension.options?.length) {
    throw new Error(`Preference extension "${extension.key}" of type select requires options`);
  }
  if (extension.min !== undefined && extension.max !== undefined && extension.min > extension.max) {
    throw new Error(`Preference extension "${extension.key}" has min greater than max`);
  }
  if (!validateExtensionValue(extension, extension.defaultValue)) {
    throw new Error(`Preference extension "${extension.key}" has an invalid default value`);
  }
}

/**
 * 把扩展声明转成偏好项，渲染在「拓展」页签。
 * @param extension - 扩展声明。
 * @returns 偏好项。
 */
export function extensionToItem(extension: PreferenceExtension): PreferenceItem {
  const path = `extension.${extension.key}`;
  const base = {
    id: path,
    path,
    tab: 'extension',
    section: extension.section ?? 'extension',
    ...(extension.section ? { sectionLabel: extension.section } : {}),
    ...(extension.sectionKey ? { sectionKey: extension.sectionKey } : {}),
    ...(extension.label ? { label: extension.label } : {}),
    ...(extension.labelKey ? { labelKey: extension.labelKey } : {}),
    ...(extension.hint ? { hint: extension.hint } : {}),
    ...(extension.hintKey ? { hintKey: extension.hintKey } : {})
  } as const;
  switch (extension.type) {
    case 'switch':
      return { ...base, control: { kind: 'switch' } };
    case 'text':
      return { ...base, control: { kind: 'text' } };
    case 'select':
      return { ...base, control: { kind: 'select', options: extension.options ?? [] } };
    case 'number':
      return {
        ...base,
        control: {
          kind: 'number',
          min: extension.min ?? Number.MIN_SAFE_INTEGER,
          max: extension.max ?? Number.MAX_SAFE_INTEGER,
          step: extension.step ?? 1
        }
      };
  }
}

/**
 * 汇总扩展默认值。
 * @param extensions - 扩展声明。
 * @returns 以扩展键为键的默认值记录。
 */
export function extensionDefaults(extensions: readonly PreferenceExtension[]): Record<string, unknown> {
  return Object.fromEntries(extensions.map(extension => [extension.key, extension.defaultValue]));
}

/**
 * 清洗开放记录：已注册扩展的非法值回到默认值，未注册的键原样保留，
 * 避免某个应用暂时没注册扩展就抹掉用户已保存的设置。
 * @param record - 待清洗的记录。
 * @param extensions - 已注册扩展。
 * @returns 清洗后的记录。
 */
export function sanitizeExtensions(
  record: Record<string, unknown>,
  extensions: readonly PreferenceExtension[]
): Record<string, unknown> {
  const out: Record<string, unknown> = isRecord(record) ? { ...record } : {};
  for (const extension of extensions) {
    if (!validateExtensionValue(extension, out[extension.key])) out[extension.key] = extension.defaultValue;
  }
  return out;
}
