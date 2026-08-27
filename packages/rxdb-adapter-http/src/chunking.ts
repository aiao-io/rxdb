/**
 * @packageDocumentation
 * `findByIds` 的分块循环（US-212 AC#8、#9、#33）。
 *
 * @remarks
 * 不要发明「一次 POST 全量 id」然后在网关 413 时返回空——那是 supabase 侧
 * `#findByIdsInChunks` 已经付过学费的同一个坑，只是换了个门。
 */

import { HttpHandlerContractError } from './errors.js';
import type { FindByIdsContext, FindByIdsHandler, HttpNumericConfig } from './http.interface.js';
import type { HttpTransport } from './transport.js';

/** 分块所需的协作方 */
export interface ChunkingDeps {
  transport: HttpTransport;
  handler: FindByIdsHandler;
  config: Pick<HttpNumericConfig, 'idChunkSize'>;
}

/** 按固定尺寸切分 id 列表 */
const chunk = (ids: string[], size: number): string[][] => {
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += size) {
    chunks.push(ids.slice(index, index + size));
  }
  return chunks;
};

/**
 * 分块拉取整行并按块序合并。
 *
 * @remarks
 * **串行**，与 supabase 的 `#findByIdsInChunks` 同款：首块出错即停，不再打后续请求。
 * 并发能快一点，但会在远端已经出问题时继续加压，而结果反正是整体 reject。
 *
 * 返回 `Promise` 的理由同 {@link fetchAllMetadataPages}：调用方 `from(promise)` 一层就
 * 天然「恰好发射一次再 complete」（AC#33）。逐块发射会让 `forkJoin` 只留最后一块，
 * 前面各块拉回来的完整行当场丢失——而那些行正是要写进本地缓存的数据。
 *
 * @param deps - transport、handler 与分块尺寸
 * @param ctx - 实体名与完整 id 列表
 * @returns 各块合并后的原始行，顺序即块序
 * @throws 任一块失败即整体抛出该块的错误，**不**降级成空块继续合并
 */
export const findByIdsInChunks = async (
  deps: ChunkingDeps,
  ctx: { entityName: string; ids: string[] }
): Promise<unknown[]> => {
  const { transport, handler, config } = deps;
  const rows: unknown[] = [];
  for (const ids of chunk(ctx.ids, config.idChunkSize)) {
    const chunkCtx: FindByIdsContext = { entityName: ctx.entityName, ids };
    const body = await transport.sendJson(handler.request(chunkCtx), 'findByIds', ctx.entityName);
    const parsed = handler.parse(body, chunkCtx);
    if (!Array.isArray(parsed)) {
      throw new HttpHandlerContractError(
        'findByIds',
        ctx.entityName,
        `expected an array of rows, received ${typeof parsed}`
      );
    }
    // 少于本块 id 数是**合法**的（远端确实删了），不重试、不补空对象——
    // 把它和「这一块请求失败」区分开正是本模块的价值
    rows.push(...parsed);
  }
  return rows;
};
