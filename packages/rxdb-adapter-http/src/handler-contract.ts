/**
 * @packageDocumentation
 * handler `parse` 返回值的运行期出口校验（US-212 AC#26）。
 *
 * @remarks
 * handler 的返回类型（`R`、`string`）是**接入方声明**的东西，本包一侧只有编译期的
 * 一句断言，运行期什么担保都没有。`findByIds` 与 `fetchMetadata` 两条读路径各自
 * 已有出口校验（{@link findByIdsInChunks} 判数组、`metadata.ts` 判 `updatedAt`），
 * 写路径与 `version` 此前是空的——本模块补的就是这两处。
 *
 * 校验放在**适配器**而不是各个 handler 里：`rest.ts` 那套工厂能自查，手写 handler
 * 不能，而两者走的是同一个 duck。只在工厂里查等于「用了工厂的人才受保护」。
 */

import { HttpHandlerContractError } from './errors.js';

/**
 * 「普通对象」判定，**数组不算**。
 *
 * @remarks
 * 少了 `Array.isArray` 这一条，`[]` 与 `[row]` 都会被 {@link assertHandlerRow} 当成
 * 持久化行收下，随后原样进 QueryCache 的本地 upsert——本地于是留下一条形状与远端
 * 毫无关系的行，而回执「是个对象」这句话技术上还成立。返回集合而不是单行是真实
 * 后端的常见形态（`POST /recipes` 回 `[created]`），所以这不是理论边界。
 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * 写回执必须是一个对象。
 *
 * @remarks
 * core 把这个返回值当「服务端最终形态」直接写进本地缓存（id 与时间戳都由远端决定）。
 * 收下 `null`、字符串或数组，本地就会留下一条远端从不存在的行，而写操作本身报的是成功。
 *
 * @param handler - 出问题的 duck 名（`create` / `update`），进错误信息
 * @param entityName - 实体名，进错误信息
 * @param body - `parse` 的返回值
 * @returns 原值，已确认是对象
 * @throws HttpHandlerContractError 不是普通对象（含数组与 `null`）
 */
export const assertHandlerRow = (handler: string, entityName: string, body: unknown): unknown => {
  if (!isRecord(body)) {
    throw new HttpHandlerContractError(
      handler,
      entityName,
      `expected the persisted row object, received ${JSON.stringify(body) ?? typeof body}`
    );
  }
  return body;
};

/** `version` 的 parse 出错时没有实体名可报，用它占位 */
const VERSION_SCOPE = '(server version)';

/**
 * 远端版本必须是一个非空串。
 *
 * @remarks
 * 空串（与只有空白的串）过得了 `typeof === 'string'`，但作为版本号它只能是
 * 「没解析出来」。放行会让调用方的 `startsWith` / 区间比较在一个空值上得出安静的
 * 错答案——比抛错更难查，因为 `version()` 报的是成功。
 *
 * @param value - `onVersion.parse` 的返回值
 * @returns 原值，已确认是非空串
 * @throws HttpHandlerContractError 不是字符串，或去掉空白后为空
 */
export const assertHandlerVersion = (value: unknown): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new HttpHandlerContractError(
      'version',
      VERSION_SCOPE,
      `expected a non-empty version string, received ${JSON.stringify(value) ?? typeof value}`
    );
  }
  return value;
};
