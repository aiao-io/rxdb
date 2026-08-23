/**
 * @fileoverview Supabase Adapter 错误类型定义
 */

import type { PropertyType } from '@aiao/rxdb';

/**
 * Supabase 同步错误基类
 */
export class SupabaseSyncError extends Error {
  constructor(
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'SupabaseSyncError';
  }
}

/**
 * 配置错误
 */
export class SupabaseConfigError extends SupabaseSyncError {
  constructor(message: string) {
    super(message, 'CONFIG_ERROR');
    this.name = 'SupabaseConfigError';
  }
}

/**
 * Supabase remote 遇到不支持的实体属性类型时抛出的配置错误。
 */
export class SupabaseUnsupportedPropertyTypeError extends SupabaseConfigError {
  override readonly code = 'UNSUPPORTED_PROPERTY_TYPE';

  constructor(
    public readonly entity: string,
    public readonly property: string,
    public readonly propertyType: PropertyType.bigint | PropertyType.binary
  ) {
    super(`Supabase remote does not support property type "${propertyType}" at "${entity}.${property}"`);
    this.name = 'SupabaseUnsupportedPropertyTypeError';
  }
}

/**
 * 网络错误
 *
 * @deprecated 请改用 core 的 `NetworkOfflineError`。
 *
 * @remarks
 * 本类从未在适配器内被抛出过，且**不可用于表示离线**：core 的 `isNetworkError` 是
 * `offlineFallback` 的唯一判据，而它认不出这个类（既非 `NetworkOfflineError` 实例，
 * `name` 也不在 `NETWORK_ERROR_NAMES` 内），会一律判 `false`（RV-001）。
 * 传输失败的正确抛法见 `classify_postgrest_error`。
 * 保留仅为不破坏已发布的公开 API。
 */
export class SupabaseNetworkError extends SupabaseSyncError {
  constructor(message: string) {
    super(message, 'NETWORK_ERROR');
    this.name = 'SupabaseNetworkError';
  }
}

/**
 * 数据错误
 */
export class SupabaseDataError extends SupabaseSyncError {
  constructor(message: string) {
    super(message, 'DATA_ERROR');
    this.name = 'SupabaseDataError';
  }
}
