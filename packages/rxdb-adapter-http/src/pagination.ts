/**
 * @packageDocumentation
 * `fetchMetadata` 的翻页循环（US-212 AC#5、#6、#7、#23）。
 *
 * @remarks
 * 这是本包最贵的一段学费所在：PostgREST 的 `max-rows` 静默截断已经在 supabase 侧付过一次。
 * metadata 少一页，那些 id 就会被上层判成「远端已删除」，叠加 US-020 阶段 B 的真
 * `deleteByIds` 会把还活着的远端行从本地抹掉。所以本模块的每条异常路径都是
 * **抛错**，没有一条返回「已经拿到的那部分」。
 */

import type { QueryCacheEntityMetadata, RuleGroup } from '@aiao/rxdb';
import { HttpHandlerContractError, HttpPaginationError } from './errors.js';
import type { FetchMetadataContext, FetchMetadataHandler, HttpNumericConfig } from './http.interface.js';
import { canonicalizeMetadata } from './metadata.js';
import type { HttpTransport } from './transport.js';

/** 翻页所需的协作方 */
export interface PaginationDeps {
  transport: HttpTransport;
  handler: FetchMetadataHandler;
  config: Pick<HttpNumericConfig, 'pageSize' | 'maxEmptyPages' | 'maxPages'>;
}

/**
 * 本次查询锁定的翻页模式。
 *
 * @remarks
 * 两个取值都描述**靠什么推进**，对应下面两条互斥的终止判据；不描述 JSON 长什么样。
 */
type PageShape = 'offset' | 'token';

/** 一页解析后的统一形态，抹掉两种 wire 形态的差异 */
interface NormalizedPage {
  shape: PageShape;
  rows: unknown[];
  nextPageToken?: string;
}

/**
 * 把判别式返回归一，顺带记下形态用于换形态检测。
 *
 * @remarks
 * 两种合法形态之外的返回值在这里就拦住。放过去的话，`rows` 会是 `undefined`，
 * 最终以「这一页没有行」的面目终止翻页——又一次静默截断。
 *
 * 改名前的 `nextCursor` 单独报一条：它的 `rows` 是合法数组，能一路走到底，只是
 * `nextPageToken` 读出 `undefined`，于是**首页即末页**。症状是整表只剩第一页、
 * 其余 id 被上层判成远端已删除，而全程没有任何错误——正是这个包整章在防的那一种。
 */
const normalizePage = (entityName: string, result: unknown): NormalizedPage => {
  if (Array.isArray(result)) {
    return { shape: 'offset', rows: result };
  }
  const page = result as { rows?: unknown; nextPageToken?: string; nextCursor?: string } | null;
  if (!page || !Array.isArray(page.rows)) {
    throw new HttpHandlerContractError(
      'fetchMetadata',
      entityName,
      `expected an array of rows or { rows, nextPageToken }, received ${JSON.stringify(result)}`
    );
  }
  // 两个键都在时不算遗留：handler 已经给出 nextPageToken，说明它认得新契约
  if (page.nextPageToken === undefined && page.nextCursor !== undefined) {
    throw new HttpHandlerContractError(
      'fetchMetadata',
      entityName,
      'returned the removed key "nextCursor"; rename it to "nextPageToken" (reading it as undefined would end pagination at the first page)'
    );
  }
  return { shape: 'token', rows: page.rows, nextPageToken: page.nextPageToken };
};

/**
 * 翻完一次 `fetchMetadata` 的所有页并合并。
 *
 * @remarks
 * 返回 `Promise` 而不是 `Observable` 是刻意的：调用方用 `from(promise)` 包一层就天然
 * 满足「恰好发射一次再 complete」（AC#23）。把 Observable 的构造留在循环里，等于给
 * 「每页发一次」留了门——而 `forkJoin` 只留最后一次发射，前面各页当场丢失。
 *
 * 翻页模式按**首页的返回形状**锁定，中途换形态即抛错：两种形态各有各的终止判据，
 * 混用会让它们互相盖掉，正是本包要防的静默截断。
 *
 * @param deps - transport、handler 与三个翻页相关配置
 * @param ctx - 实体名与查询条件，逐页原样透传给 handler
 * @returns 所有页合并、且逐页 canonicalize 过的 metadata
 * @throws HttpPaginationError 换形态 / token 不推进 / 连续空页触顶 / 总页数触顶
 */
export const fetchAllMetadataPages = async (
  deps: PaginationDeps,
  ctx: { entityName: string; where: RuleGroup<unknown> }
): Promise<QueryCacheEntityMetadata[]> => {
  const { transport, handler, config } = deps;
  const all: QueryCacheEntityMetadata[] = [];
  let shape: PageShape | undefined;
  let offset = 0;
  let pageToken: string | undefined;
  let emptyStreak = 0;

  for (let page = 1; ; page++) {
    if (page > config.maxPages) {
      throw new HttpPaginationError(
        'max_pages',
        `fetchMetadata for "${ctx.entityName}" exceeded maxPages=${config.maxPages}; refusing to return a truncated result`
      );
    }
    const pageCtx: FetchMetadataContext = { ...ctx, offset, limit: config.pageSize, pageToken };
    const body = await transport.sendJson(handler.request(pageCtx), 'fetchMetadata');
    const parsed = normalizePage(ctx.entityName, handler.parse(body, pageCtx));
    if (shape && parsed.shape !== shape) {
      throw new HttpPaginationError(
        'shape_switch',
        `fetchMetadata for "${ctx.entityName}" started in ${shape} mode but page ${page} returned ${parsed.shape} mode`
      );
    }
    shape = parsed.shape;
    all.push(...canonicalizeMetadata(ctx.entityName, parsed.rows));

    if (shape === 'offset') {
      // 短页即末页——这条判据的前提是服务端保证「不会因限流或 max-rows 提前返回短页」，
      // 保证不了的服务端 MUST 用 token 形态，适配器在客户端侧无从检测
      if (parsed.rows.length < config.pageSize) {
        return all;
      }
      offset += parsed.rows.length;
      continue;
    }
    if (parsed.nextPageToken === undefined) {
      return all;
    }
    if (parsed.nextPageToken === pageToken) {
      throw new HttpPaginationError(
        'page_token_not_advancing',
        `fetchMetadata for "${ctx.entityName}" received the same nextPageToken "${pageToken}" twice; refusing to loop forever`
      );
    }
    emptyStreak = assertEmptyStreak(ctx.entityName, parsed.rows.length, emptyStreak, config.maxEmptyPages);
    pageToken = parsed.nextPageToken;
  }
};

/**
 * 维护连续空页计数并在触顶时抛错。
 *
 * @remarks
 * 只在 token 形态调用：offset 形态下空页就是短页，本来就是正常终止条件，不计数。
 * **连续计数、非空即清零**——空一页不是故障，空**超过** `maxEmptyPages` 页才是。
 * 计数器按单次 `fetchMetadata` 调用生存，不跨查询累积。
 *
 * 判据是 `>` 不是 `>=`：字段语义是「容忍几个连续空页」，`maxEmptyPages: N` 就该真的
 * 放过 N 个。写成 `>=` 会让每个取值都少容忍一个，顺带把 `1` 压成和 `0` 一模一样——
 * 而 `config.ts` 的 `ZERO_ALLOWED` 专为 `maxEmptyPages` 开了 `0` 这个口子，
 * 只有在 `1` 有不同语义时那个口子才不是冗余的。
 *
 * `maxEmptyPages: 0` 仍落在同一条判据里：空页让计数变成 `1`，`1 > 0` 即刻抛错，
 * 语义正是「一个空页都不容忍」。
 */
const assertEmptyStreak = (entityName: string, rowCount: number, streak: number, maxEmptyPages: number): number => {
  if (rowCount > 0) {
    return 0;
  }
  const next = streak + 1;
  if (next > maxEmptyPages) {
    throw new HttpPaginationError(
      'empty_page_limit',
      `fetchMetadata for "${entityName}" received ${next} consecutive empty pages (maxEmptyPages=${maxEmptyPages}); the remote is spinning`
    );
  }
  return next;
};
