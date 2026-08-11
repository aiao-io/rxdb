/**
 * @fileoverview Rust IPC 命令的返回契约与解析。
 *
 * @remarks
 * TAURI-02：`invoke()` 的返回值是 `unknown` —— 泛型参数只是**断言**，不做校验。
 * 前端此前直接把它当成声明的形状用，于是「TS 说有 `node`/`chrome`，Rust 只发
 * `tauri`」这种两端各说各话的偏差可以一直躺着，界面上表现为字段永远空白而**无人报错**。
 *
 * 这里的解析器把偏差变成一次显式失败：形状不对就抛，由调用方渲染成诊断信息。
 * 解析只负责形状，不替调用方判断业务状态（见 {@link parseRuntimeHealth}）。
 */

/** Rust `get_versions` 命令的返回契约。 */
export interface AppVersions {
  /** Tauri 运行时版本（`tauri::VERSION`）。这是 Rust 侧唯一上报的版本号。 */
  readonly tauri: string;
}

/** Rust `check_runtime` 命令的返回契约。 */
export interface RuntimeHealth {
  /** 后端自报状态；健康值为 `'ready'`，其余一律视为异常。 */
  readonly status: string;
}

/** 取出一个非空字符串字段，形状不符即抛。 */
const requireString = (source: unknown, key: string, command: string): string => {
  if (typeof source !== 'object' || source === null || !(key in source)) {
    throw new Error(`${command} 返回值缺少 ${key} 字段`);
  }
  const value = (source as Record<string, unknown>)[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${command} 返回的 ${key} 不是非空字符串`);
  }
  return value;
};

/**
 * 解析 `get_platform` 的返回值。
 *
 * @param value - `invoke('get_platform')` 的原始返回值
 * @returns Rust 侧的 `std::env::consts::OS`
 * @throws 返回值不是非空字符串时抛出
 */
export const parsePlatform = (value: unknown): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('get_platform 返回值不是非空字符串');
  }
  return value;
};

/**
 * 解析 `get_versions` 的返回值。
 *
 * @param value - `invoke('get_versions')` 的原始返回值
 * @returns 只含 `tauri` 一个键的版本信息
 * @throws 缺少 `tauri` 或其不是非空字符串时抛出
 *
 * @remarks
 * 返回值**只保留** Rust 真正上报的键。多出来的键被丢弃，免得它们顺着
 * 结构化类型再爬回前端类型里，重演 `node`/`chrome` 那种永远为空的字段。
 */
export const parseAppVersions = (value: unknown): AppVersions => ({
  tauri: requireString(value, 'tauri', 'get_versions')
});

/**
 * 解析 `check_runtime` 的返回值。
 *
 * @param value - `invoke('check_runtime')` 的原始返回值
 * @returns 后端自报的运行时状态
 * @throws 缺少 `status` 或其不是非空字符串时抛出
 *
 * @remarks
 * **不**在这里判定 `status === 'ready'`：那样一个「活着但不健康」的后端会以
 * 「解析失败」的面目出现，真实状态值反而丢了。健康与否由调用方判断。
 */
export const parseRuntimeHealth = (value: unknown): RuntimeHealth => ({
  status: requireString(value, 'status', 'check_runtime')
});
