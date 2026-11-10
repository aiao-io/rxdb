/**
 * token 形态翻页的游标编解码（AC#15）。
 *
 * @remarks
 * 协议的形态 B 只要求「token 相等 → 同一页」，token 对客户端**不透明**。
 * 这份实现往里塞了两组坐标：
 *
 * - **游标** `(afterCreatedAt, afterId)`：上一页最后一行的位置，下一页从它之后开始。
 *   这是 keyset 翻页——不是 `OFFSET`。`OFFSET n` 每次都要重新数过前 n 行，
 *   翻页途中前面插进来一行，整个后续窗口就整体后移一位，于是有行被跳过。
 * - **水位线** `(watermarkCreatedAt, watermarkId)`：首页那一刻表里的最大坐标。
 *   之后每一页都额外加上「不超过水位线」的上界，翻页途中新建的行（`createdAt`
 *   是服务端当前时刻，必然大于水位线）就被挡在这次翻页之外。
 *
 * 坐标取 `createdAt` 而不是 `updatedAt`：两列建出来就不再变，行被更新也留在原位。
 * 按 `updatedAt` 排时，翻页途中被更新的未读行会被挪到水位线之外，整轮正常结束却少了它——
 * 客户端（QueryCache）把远端答复里没有的行当孤儿删掉，远端好好在着的行就从本地消失了。
 * 于是首页那一刻就在、读完前也没被删的行，各页拼起来恰好出现一次；翻页途中被更新的行
 * 带的是读到它那一刻的 `updatedAt`，客户端据此判断要不要重新拉整行。
 *
 * **offset 形态做不到**：请求体里只有 `offset` / `limit`，没有任何地方能放下水位线，
 * 后端也就无从判断「这一页属于哪次翻页」。故事把它列成 AC#15 的原因就在这里。
 */

/** token 解不开或形状不对。固定 400——坏 token 是客户端的错。 */
export class PageTokenError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = 'PageTokenError';
  }
}

/** `(createdAt, id)` 复合坐标，与 token 翻页的 `ORDER BY createdAt, id` 同序。 */
export interface RowCursor {
  readonly createdAt: string;
  readonly id: string;
}

/** token 里编码的全部信息。 */
export interface PageCursor {
  /** 上一页末行的位置，下一页取严格大于它的行。 */
  readonly after: RowCursor;
  /** 首页时刻的表内最大坐标，后续每页的上界。 */
  readonly watermark: RowCursor;
}

/**
 * 坐标列的标记。
 *
 * @remarks
 * 早先的 token 按 `(updatedAt, id)` 编码，形状与现在一样。不带标记的话，翻页途中服务端升级，
 * 客户端手上的旧 token 会被当成 `createdAt` 坐标解读，窗口错位却不报错；有了它，旧 token 回 400，
 * 客户端整轮重来。
 */
const CURSOR_KEY = 'createdAt';

/** 序列化形状。字段名压到一个字母是为了 token 短一点，反正它对客户端不透明。 */
interface SerializedCursor {
  k: typeof CURSOR_KEY;
  a: [string, string];
  w: [string, string];
}

const isCursorTuple = (value: unknown): value is [string, string] =>
  Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' && typeof value[1] === 'string';

/** 游标 → 不透明 token。base64url 而非 base64：token 可能出现在 URL 里，`+` `/` 需要再转义。 */
export const encodePageToken = (cursor: PageCursor): string => {
  const payload: SerializedCursor = {
    k: CURSOR_KEY,
    a: [cursor.after.createdAt, cursor.after.id],
    w: [cursor.watermark.createdAt, cursor.watermark.id]
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
};

/**
 * token → 游标。
 *
 * @throws {PageTokenError} token 不是字符串、不是合法 base64url JSON、或缺字段时（HTTP 400）。
 *
 * @remarks
 * 解出来的字段**只当坐标用**，全部走 `?` 绑定，不进 SQL 文本——token 是客户端回传的，
 * 与 `where` 一样属于外部输入。
 */
export const decodePageToken = (raw: unknown): PageCursor => {
  if (typeof raw !== 'string' || raw === '') {
    throw new PageTokenError('pageToken must be a non-empty string');
  }

  const parsed = parseTokenPayload(raw);
  if (parsed.k !== CURSOR_KEY || !isCursorTuple(parsed.a) || !isCursorTuple(parsed.w)) {
    throw new PageTokenError('pageToken payload is malformed');
  }

  return {
    after: { createdAt: parsed.a[0], id: parsed.a[1] },
    watermark: { createdAt: parsed.w[0], id: parsed.w[1] }
  };
};

const parseTokenPayload = (raw: string): Partial<SerializedCursor> => {
  try {
    const decoded: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) {
      throw new PageTokenError('pageToken payload is not a JSON object');
    }
    return decoded as Partial<SerializedCursor>;
  } catch (error) {
    if (error instanceof PageTokenError) throw error;
    throw new PageTokenError('pageToken is not valid base64url JSON');
  }
};

/**
 * 判断某一页是否已经到达水位线。
 *
 * @remarks
 * 末页判定不能只看「短页」：正好整除时最后一整页也是满的，再发一次才拿到空页，
 * 而协议明确说 token 形态下「连续空页」会让客户端抛错。因此这里用坐标比较——
 * 末行等于水位线就是到底了，`nextPageToken` 直接缺省。
 */
export const reachedWatermark = (lastRow: RowCursor, watermark: RowCursor): boolean =>
  lastRow.createdAt === watermark.createdAt && lastRow.id === watermark.id;
