/**
 * @packageDocumentation
 * HTTP 协议参考后端（US-213）：零第三方依赖的 `node:http` 实现。
 *
 * @remarks
 * 它有两个身份，缺一不可：
 *
 * 1. **测试夹具**——`tests/wire-integration.spec.ts` 的对端。适配器经**真实 `fetch`**
 *    打到 `listen(0)` 拿到的随机端口上，请求头、请求体、状态码、socket 断开全是真的。
 * 2. **协议的可执行说明**——`website/docs/adapters/http-protocol.md` 那 7 个端点的一份
 *    可运行答案。第三方实现自己的后端时照着它对齐，比照着散文对齐可靠。
 *
 * 因此本文件**只依赖 `node:*`**：不 import `@aiao/rxdb`，也不 import 被测包的 `src/`。
 * 一旦它开始引用被测方的类型，"参考实现"就变成了"被测方的镜像"——两边一起错的时候
 * 测试照样绿。
 *
 * 时间戳一律由 {@link stamp} 产出：带 `Z` 的 ISO 8601，且每次调用严格递增。
 * 不带时区的串会被适配器的 `canonicalizeMetadata` 当场拒掉（同一份响应在不同时区的
 * 机器上会归一成不同的 UTC 值，那是不确定性）。
 */

import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Socket } from 'node:net';

/** `GET meta/version` 返回的后端版本号 */
export const SERVER_VERSION = 'reference-backend/9.9.9';

/**
 * `faults.mutateAfterPage` 触发时插进存储的行 id。
 *
 * @remarks
 * 导出是为了让用例断言它**没有**出现在结果里——那正是"翻页基于同一快照"的证据。
 */
export const INTRUDER_ID = 'intruder-row';

/** 未显式给 `limit` 时的单页条数，与协议文档的默认值一致 */
const DEFAULT_LIMIT = 1000;

/**
 * 一条记录。
 *
 * @remarks
 * 协议只强制 `id` 与 `updatedAt` 两个字段，其余由实体定义决定、后端原样收发。
 */
export interface Row {
  [field: string]: unknown;
  id: string;
  /** 带明确时区标识的 ISO 8601 */
  updatedAt: string;
}

/** 只含新鲜度判据的元数据行，`fetchMetadata` 的返回元素 */
interface MetadataRow {
  id: string;
  updatedAt: string;
}

/** RuleGroup 的叶子：一条规则 */
interface Rule {
  field: string;
  operator: string;
  value?: unknown;
}

/** RuleGroup 的非叶子：一个组合 */
interface RuleGroupNode {
  combinator: 'and' | 'or';
  rules: Array<RuleGroupNode | Rule>;
}

/** `POST :entity/metadata` 的请求体 */
interface MetadataRequest {
  where?: RuleGroupNode;
  offset?: number;
  limit?: number;
  pageToken?: string;
}

/** `POST :entity/by-ids` 与 `POST :entity/delete` 的请求体 */
interface IdsRequest {
  ids?: string[];
}

/** 一次实收请求的原始形态 */
export interface ReceivedRequest {
  method: string;
  /** 请求路径，已去掉 query string */
  path: string;
  /** 实收 header，键已由 node 小写化 */
  headers: Record<string, string>;
  /** **未解析**的请求体原文；无 body 时为 `undefined` */
  rawBody: string | undefined;
}

/**
 * 故障注入开关，运行中可改、无需重启服务器。
 *
 * @remarks
 * 每一条都对应一种**真实后端会犯的错**或**协议留给后端的自由度**，不是为了凑测试
 * 而发明的形态。用例改完开关立即生效，因此"先建服务器、再按用例调开关"是标准用法。
 */
export interface ReferenceServerFaults {
  /** 收下请求后**永不响应**：用来触发客户端侧的超时与主动断开，不需要真 sleep */
  hang?: boolean;
  /** 收下请求后直接销毁 socket：真实的传输失败，不是一个可解析的错误响应 */
  destroySocket?: boolean;
  /** 一切请求强制返回该状态码（401 / 409 / 500 / 404 …） */
  forceStatus?: number;
  /** 第 N 页提前返回短页——**后端违约**，客户端在 offset 形态下无从检测 */
  truncateAt?: number;
  /** 第 N 页切换返回形态（数组 ↔ 对象） */
  shapeSwitchAt?: number;
  /** 每页都回同一个 `nextPageToken` */
  tokenStuck?: boolean;
  /** 每页都回空 `rows` 但 token 照常推进 */
  emptyPages?: boolean;
  /** 2xx 响应不带 `ETag`，条件请求随之整条失效 */
  dropEtag?: boolean;
  /** 第 N 页返回**之后**改动存储：验证翻页快照是否冻结 */
  mutateAfterPage?: number;
  /**
   * 每次 metadata 响应发出后从存储里删掉这些 id。
   *
   * @remarks
   * 模拟"远端在 `fetchMetadata` 与 `findByIds` 之间删了行"这条真实竞态。协议规定
   * 某块返回行数**少于**请求 id 数是合法结果，这个开关是唯一能稳定构造出它的办法。
   */
  vanishAfterMetadata?: string[];
}

/** {@link startReferenceServer} 的返回值 */
export interface ReferenceServer {
  /** 形如 `http://127.0.0.1:54321`，直接给适配器当 `baseUrl` */
  baseUrl: string;
  /** 按到达顺序记录的实收请求，**分发前**就已入列 */
  received: ReceivedRequest[];
  /** 当前活着的连接；`stop()` 之后必须为空 */
  sockets: Set<Socket>;
  faults: ReferenceServerFaults;
  /** 写入若干行；实体表随之存在（`HEAD :entity` 因此答 200） */
  seed(entityName: string, rows: Row[]): void;
  /** 就地改一行，用于"翻页途中数据变了"与"内容变了 ETag 必须变"两类断言 */
  mutate(entityName: string, row: Row): void;
  /** 读当前存储，断言写路径真的落了盘 */
  read(entityName: string, id: string): Row | undefined;
  /** 关服务器并**断开所有连接**；resolve 后 `sockets` 为空 */
  stop(): Promise<void>;
}

/** 路由产出的响应意图，序列化与条件请求由 {@link respond} 统一收口 */
interface RouteResult {
  status: number;
  /** `undefined` = 无响应体（204 / HEAD 探测） */
  payload?: unknown;
  /** 是否参与 ETag / 304：只有两个幂等读端点为 `true` */
  conditional?: boolean;
}

/** 带状态码的路由内部错误，由 {@link handle} 统一转成响应 */
class ProtocolFault extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ProtocolFault';
  }
}

/**
 * `contains` 按**大小写敏感**求值。
 *
 * @remarks
 * 协议对此**未作规定**。本实现选敏感一档并在这里写明，是因为"不规定"不等于"随便"：
 * 后端与客户端的期望值必须来自同一个立场，否则 AC#3 的逐 id 比对会时对时错。
 * 换成不敏感的后端同样合协议，只是要连带改掉用例里的期望值。
 */
const containsValue = (value: unknown, needle: unknown): boolean =>
  typeof value === 'string' && typeof needle === 'string' && value.includes(needle);

/** 闭区间判定，同类型才比较——`'3' >= 2` 这种跨类型比较一律判 false */
const inRange = (value: unknown, bounds: unknown): boolean => {
  const [min, max] = Array.isArray(bounds) ? bounds : [undefined, undefined];
  if (typeof value === 'number' && typeof min === 'number' && typeof max === 'number') {
    return value >= min && value <= max;
  }
  if (typeof value === 'string' && typeof min === 'string' && typeof max === 'string') {
    return value >= min && value <= max;
  }
  return false;
};

/**
 * 求值单条规则。
 *
 * @remarks
 * 只实现 `=` / `in` / `between` / `contains` / `null` 五个操作符（US-213 AC#3 的子集）。
 * **其余操作符抛 501，不静默判 true**——静默会让"这个后端漏实现了 `startsWith`"
 * 表现为"这个查询多返回了几行"，而多返回的行在 QueryCache 里会被写进本地缓存。
 *
 * @throws ProtocolFault 操作符不在已实现子集内
 */
const matchRule = (row: Row, rule: Rule): boolean => {
  const value = row[rule.field];
  switch (rule.operator) {
    case '=':
      return value === rule.value;
    case 'in':
      return Array.isArray(rule.value) && rule.value.includes(value);
    case 'between':
      return inRange(value, rule.value);
    case 'contains':
      return containsValue(value, rule.value);
    case 'null':
      return value === null || value === undefined;
    default:
      throw new ProtocolFault(501, `operator "${rule.operator}" is not implemented by the reference backend`);
  }
};

/** 递归求值 RuleGroup；`{ combinator: 'and', rules: [] }` 即全量匹配 */
const matchGroup = (row: Row, group: RuleGroupNode | undefined): boolean => {
  if (!group) {
    return true;
  }
  const test = (node: RuleGroupNode | Rule): boolean =>
    'combinator' in node ? matchGroup(row, node) : matchRule(row, node);
  return group.combinator === 'or' ? group.rules.some(test) : group.rules.every(test);
};

/** 取出协议要求的两个字段，其余一律不出现在 metadata 通道上 */
const toMetadata = (row: Row): MetadataRow => ({ id: row.id, updatedAt: row.updatedAt });

/** 读完请求体；无 body 时返回 `undefined` */
const readBody = async (req: IncomingMessage): Promise<string | undefined> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return chunks.length === 0 ? undefined : Buffer.concat(chunks).toString('utf8');
};

/** 强 ETag：取响应体本身的摘要，于是"内容变了必然换 ETag"由结构保证，不靠自觉 */
const etagOf = (body: string): string => `"${createHash('sha1').update(body).digest('hex')}"`;

/**
 * 启动一台参考后端。
 *
 * @remarks
 * 端口一律 `listen(0)` 由内核分配：写死端口在 CI 上迟早撞车，而撞车的症状
 * （`EADDRINUSE` 或更糟——连到了上一个用例残留的服务器）跟被测逻辑毫无关系。
 *
 * @param options - `paging` 选择本实例的翻页形态，缺省 `offset`
 * @returns 已在监听、可直接使用的服务器句柄
 */
export const startReferenceServer = async (
  options: { paging?: 'offset' | 'token' } = {}
): Promise<ReferenceServer> => {
  const paging = options.paging ?? 'offset';
  const store = new Map<string, Map<string, Row>>();
  const snapshots = new Map<string, Row[]>();
  const received: ReceivedRequest[] = [];
  const sockets = new Set<Socket>();
  const faults: ReferenceServerFaults = {};
  let snapshotSequence = 0;
  let idSequence = 0;
  // 固定起点 + 严格递增：同一毫秒内的多次写不会撞出相同的 updatedAt，
  // 而 updatedAt 相同会让 core 的新鲜度判断（字符串 `>`）判成"不需要更新"
  let clock = Date.parse('2026-08-26T00:00:00.000Z');

  const stamp = (): string => {
    clock += 1000;
    return new Date(clock).toISOString();
  };

  const tableOf = (entityName: string): Map<string, Row> => {
    const existing = store.get(entityName);
    if (existing) {
      return existing;
    }
    const created = new Map<string, Row>();
    store.set(entityName, created);
    return created;
  };

  const filterRows = (entityName: string, where: RuleGroupNode | undefined): Row[] =>
    [...(store.get(entityName)?.values() ?? [])].filter(row => matchGroup(row, where));

  /** 第 N 页发出**之后**改数据：新增一行 + 动一行的时间戳 */
  const applyMutateAfterPage = (entityName: string, pageNumber: number): void => {
    if (pageNumber !== faults.mutateAfterPage) {
      return;
    }
    const table = tableOf(entityName);
    const first = [...table.values()][0];
    table.set(INTRUDER_ID, { id: INTRUDER_ID, updatedAt: stamp() });
    if (first) {
      table.set(first.id, { ...first, updatedAt: stamp() });
    }
  };

  /**
   * token 形态的快照：首页冻结一份**深拷贝**，后续页只从它取。
   *
   * @remarks
   * 冻结的是行内容而不只是 id 列表——协议要的是"多页请求基于同一数据快照"，
   * 只冻 id 的话翻页途中被改过的行会带着新 `updatedAt` 出现在后面几页，
   * 那仍然是一次跨页不一致。
   */
  const resolveSnapshot = (entityName: string, body: MetadataRequest): { id: string; rows: Row[] } => {
    const token = body.pageToken;
    if (token === undefined) {
      snapshotSequence += 1;
      const id = `snap${snapshotSequence}`;
      const rows = filterRows(entityName, body.where).map(row => ({ ...row }));
      snapshots.set(id, rows);
      return { id, rows };
    }
    const id = token.slice(0, token.indexOf(':'));
    const rows = snapshots.get(id);
    if (!rows) {
      throw new ProtocolFault(400, `unknown pageToken "${token}"`);
    }
    return { id, rows };
  };

  /** 形态 A：裸数组，短页即末页 */
  const metadataOffset = (entityName: string, body: MetadataRequest, limit: number): RouteResult => {
    const offset = body.offset ?? 0;
    const pageNumber = Math.floor(offset / limit) + 1;
    const size = pageNumber === faults.truncateAt ? Math.max(limit - 1, 0) : limit;
    const rows = filterRows(entityName, body.where).slice(offset, offset + size).map(toMetadata);
    applyMutateAfterPage(entityName, pageNumber);
    // 换形态：把本该是数组的一页包成对象，客户端应当立刻抛 shape_switch
    const payload = pageNumber === faults.shapeSwitchAt ? { rows } : rows;
    return { status: 200, payload, conditional: true };
  };

  /** 形态 B：`{ rows, nextPageToken }`，token 缺省即末页 */
  const metadataToken = (entityName: string, body: MetadataRequest, limit: number): RouteResult => {
    const snapshot = resolveSnapshot(entityName, body);
    const offset = body.pageToken === undefined ? 0 : Number(body.pageToken.slice(body.pageToken.indexOf(':') + 1));
    const pageNumber = Math.floor(offset / limit) + 1;
    const advanced = `${snapshot.id}:${offset + limit}`;
    const rows = faults.emptyPages ? [] : snapshot.rows.slice(offset, offset + limit).map(toMetadata);
    const hasMore = faults.emptyPages || offset + limit < snapshot.rows.length;
    applyMutateAfterPage(entityName, pageNumber);
    const nextPageToken = faults.tokenStuck ? `${snapshot.id}:0` : hasMore ? advanced : undefined;
    const payload = pageNumber === faults.shapeSwitchAt ? rows : { rows, nextPageToken };
    return { status: 200, payload, conditional: true };
  };

  const fetchMetadata = (entityName: string, body: MetadataRequest): RouteResult => {
    const limit = body.limit ?? DEFAULT_LIMIT;
    const result = paging === 'token' ? metadataToken(entityName, body, limit) : metadataOffset(entityName, body, limit);
    // 本页已经定型才删：这一页照常报告这些 id 存在，随后的 findByIds 才会扑空
    for (const id of faults.vanishAfterMetadata ?? []) {
      store.get(entityName)?.delete(id);
    }
    return result;
  };

  /** 缺席的 id **不报错**：远端确实删了是合法结果，补空对象才是伪造 */
  const findByIds = (entityName: string, body: IdsRequest): RouteResult => {
    const table = store.get(entityName);
    const rows = (body.ids ?? []).filter(id => table?.has(id)).map(id => ({ ...table!.get(id)! }));
    return { status: 200, payload: rows, conditional: true };
  };

  /**
   * 创建：**id 与 updatedAt 一律由服务端决定**，入参里的 id 被忽略。
   *
   * @remarks
   * 这是本实现的立场，也是 AC#9 能证明"客户端用的是回执不是回显"的前提。
   * 真实后端多半也是这样（自增主键 / 服务端 UUID），照抄入参 id 的后端同样合协议。
   */
  const createRow = (entityName: string, data: Record<string, unknown>): RouteResult => {
    idSequence += 1;
    const saved: Row = { ...data, id: `srv-${idSequence}`, updatedAt: stamp() };
    tableOf(entityName).set(saved.id, saved);
    return { status: 201, payload: saved };
  };

  const updateRow = (entityName: string, id: string, data: Record<string, unknown>): RouteResult => {
    const table = store.get(entityName);
    const current = table?.get(id);
    if (!current) {
      return { status: 404, payload: { error: `no row "${id}" in "${entityName}"` } };
    }
    const saved: Row = { ...current, ...data, id, updatedAt: stamp() };
    table!.set(id, saved);
    return { status: 200, payload: saved };
  };

  const deleteRows = (entityName: string, body: IdsRequest): RouteResult => {
    const table = store.get(entityName);
    for (const id of body.ids ?? []) {
      table?.delete(id);
    }
    return { status: 204 };
  };

  const routePost = (segments: string[], body: unknown): RouteResult => {
    const [entityName, action] = segments;
    if (segments.length === 1) {
      return createRow(entityName, body as Record<string, unknown>);
    }
    if (action === 'metadata') {
      return fetchMetadata(entityName, body as MetadataRequest);
    }
    if (action === 'by-ids') {
      return findByIds(entityName, body as IdsRequest);
    }
    if (action === 'delete') {
      return deleteRows(entityName, body as IdsRequest);
    }
    throw new ProtocolFault(404, `no route for POST /${segments.join('/')}`);
  };

  const route = (method: string, segments: string[], rawBody: string | undefined): RouteResult => {
    const body = rawBody === undefined ? undefined : (JSON.parse(rawBody) as unknown);
    if (method === 'HEAD') {
      return { status: store.has(segments[0]) ? 200 : 404 };
    }
    if (method === 'GET' && segments.join('/') === 'meta/version') {
      return { status: 200, payload: { version: SERVER_VERSION } };
    }
    if (method === 'PATCH' && segments.length === 2) {
      return updateRow(segments[0], decodeURIComponent(segments[1]), body as Record<string, unknown>);
    }
    if (method === 'POST') {
      return routePost(segments, body);
    }
    throw new ProtocolFault(405, `no route for ${method} /${segments.join('/')}`);
  };

  /** 序列化 + 条件请求收口：ETag 只发给两个幂等读端点 */
  const respond = (req: IncomingMessage, res: ServerResponse, result: RouteResult): void => {
    if (result.payload === undefined) {
      res.writeHead(result.status);
      res.end();
      return;
    }
    const body = JSON.stringify(result.payload);
    if (result.conditional !== true || faults.dropEtag === true) {
      res.writeHead(result.status, { 'content-type': 'application/json' });
      res.end(body);
      return;
    }
    const etag = etagOf(body);
    if (req.headers['if-none-match'] === etag) {
      // 304 按 RFC 无 body；"你手上那份还有效"，绝不是"零行"
      res.writeHead(304, { etag });
      res.end();
      return;
    }
    res.writeHead(result.status, { 'content-type': 'application/json', etag });
    res.end(body);
  };

  const dispatch = (req: IncomingMessage, res: ServerResponse, path: string, rawBody: string | undefined): void => {
    try {
      respond(req, res, route(req.method ?? '', path.split('/').filter(Boolean), rawBody));
    } catch (error) {
      const status = error instanceof ProtocolFault ? error.status : 500;
      respond(req, res, { status, payload: { error: (error as Error).message } });
    }
  };

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const path = (req.url ?? '/').split('?')[0];
    const rawBody = await readBody(req);
    received.push({ method: req.method ?? '', path, headers: { ...req.headers } as Record<string, string>, rawBody });
    if (faults.destroySocket === true) {
      req.socket.destroy();
      return;
    }
    if (faults.hang === true) {
      return;
    }
    if (faults.forceStatus !== undefined) {
      respond(req, res, { status: faults.forceStatus, payload: { error: `forced status ${faults.forceStatus}` } });
      return;
    }
    dispatch(req, res, path, rawBody);
  };

  const server = createServer((req, res) => void handle(req, res));
  server.on('connection', socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('reference server did not bind to a TCP port');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    received,
    sockets,
    faults,
    seed: (entityName, rows) => {
      const table = tableOf(entityName);
      for (const row of rows) {
        table.set(row.id, { ...row });
      }
    },
    mutate: (entityName, row) => void tableOf(entityName).set(row.id, { ...row }),
    read: (entityName, id) => store.get(entityName)?.get(id),
    stop: async () => {
      // 幂等：AC#1 要在用例体内主动停一次，afterEach 还会再兜一次
      if (!server.listening) {
        return;
      }
      // 顺序不可颠倒：先 close() 停掉 listening socket，再 closeAllConnections()
      // 踢掉 keep-alive 连接。反过来的话新连接还能挤进来，'close' 永远等不到
      const closed = once(server, 'close');
      server.close();
      server.closeAllConnections();
      await closed;
      // socket 的 'close' 在 destroy() 之后要过若干轮 tick 才派发，而服务器自己的
      // 'close' 早于它们——直接返回的话 `sockets` 拿到的是中间态。这里让出到集合排空，
      // 上限 100 轮：真有连接关不掉时用例会看到非零的 size，那正是要报出来的结果
      for (let tick = 0; sockets.size > 0 && tick < 100; tick += 1) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }
  };
};
