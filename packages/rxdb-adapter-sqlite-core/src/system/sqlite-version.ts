/**
 * @fileoverview SQLite 宿主版本门槛（US-030 AC#7）。
 *
 * 声明式 CHECK 的后续阶段与插件触发器要拼动态错误消息，依赖 SQLite 3.47.0
 * （2024-10-21）起的 `RAISE(ABORT, msg)` 接受表达式；低于门槛的宿主在 `init()`
 * 即 fail-fast，点名实际版本与门槛，不退化为常量错误消息。
 *
 * 判定是纯函数、可注入版本号：单元测试直接喂版本字符串，`connect()` 侧的集成
 * 检查用 `SELECT sqlite_version()` 的结果喂进来（见 {@link RxDBAdapterSqliteBase}）。
 */

import { RxDBAdapterSqliteError } from '../sqlite-core.utils.js';

/** 声明式 CHECK 约束（及后续触发器动态消息）要求的 SQLite 最低宿主版本。 */
export const SQLITE_MIN_HOST_VERSION = '3.47.0';

/** 解析 `x.y.z` 版本号；解析不出时返回 `null`（畸形版本按不达标处理，不静默放行）。 */
export const parseSqliteVersion = (version: string): [number, number, number] | null => {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
};

/** 比较两个 `x.y.z` 版本号：`a < b` 返回 -1，相等 0，`a > b` 返回 1；畸形视为 0.0.0。 */
export const compareSqliteVersion = (a: string, b: string): number => {
  const [aMajor, aMinor, aPatch] = parseSqliteVersion(a) ?? [0, 0, 0];
  const [bMajor, bMinor, bPatch] = parseSqliteVersion(b) ?? [0, 0, 0];
  return aMajor - bMajor || aMinor - bMinor || aPatch - bPatch;
};

/**
 * 断言 SQLite 宿主版本达标。
 *
 * @param version - `SELECT sqlite_version()` 的实际版本
 * @param minVersion - 门槛，默认 {@link SQLITE_MIN_HOST_VERSION}
 * @throws {@link RxDBAdapterSqliteError} 实际版本低于门槛时，消息点名实际版本与门槛
 */
export const assertSqliteHostVersion = (version: string, minVersion: string = SQLITE_MIN_HOST_VERSION): void => {
  if (compareSqliteVersion(version, minVersion) >= 0) return;
  throw new RxDBAdapterSqliteError(
    `SQLite host version ${version} is below the required minimum ${minVersion}: ` +
      `declarative CHECK constraints need SQLite 3.47.0+ (RAISE() with expressions). ` +
      `Upgrade the host SQLite, or remove 'checks' from entity metadata.`
  );
};
