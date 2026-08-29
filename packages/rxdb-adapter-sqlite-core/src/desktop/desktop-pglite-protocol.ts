/**
 * renderer 与桌面 PGlite host 之间的线协议。
 *
 * @remarks
 * 与 {@link module:desktop-host-protocol} 并列而不是合并，理由和当初把 `file.*` 拆成
 * 第二个解析器一模一样：SQLite host 的 dispatch 把「不是 open/close/version/handshake」的请求
 * 一律当 `execute` 处理，一旦 `pg.*` 能通过那个解析器，一条 PGlite 语句就会被当成 SQLite SQL
 * 执行在另一个引擎上。三族解析器互不接受对方的 `kind`，这条路径在类型和运行时上都不存在。
 *
 * 协议形状由 US-208 线 G 的两案对照实验冻结为「IPC 事务 ID 协议」：主进程持有唯一的 PGlite
 * 实例，renderer 侧的 adapter 用一个 host 签发的事务 ID 把多次 IPC 调用串成一条真事务。
 * **操作恒定四个**（`pg.begin` / 带 `transactionId` 的 `pg.query`+`pg.exec` / `pg.commit` /
 * `pg.rollback`），与业务上有多少种事务无关——这正是冻结它而不是冻结「adapter 托管主进程」
 * 的首要理由（见故事「冻结理由」第 1 条）。
 *
 * 与 SQLite 侧一样，只使用**结构化克隆**能原样搬运的类型，因此 `bigint`、`Uint8Array`、
 * `Date` 不经 JSON 编解码，跨 IPC 逐值保真（AC#1）。
 *
 * @module desktop-pglite-protocol
 */

import {
  isRxDBAdapterDesktopErrorCode,
  RxDBAdapterDesktopError,
  type RxDBAdapterDesktopErrorCode
} from './desktop-error.js';
import {
  asRecord,
  DESKTOP_HOST_MAX_BINDINGS,
  DESKTOP_HOST_MAX_BLOB_BYTES,
  readOptionalUuid,
  readSessionId,
  readSql,
  readUuid,
  violation
} from './desktop-protocol-primitives.js';
import {
  assertValidDesktopDatabaseName,
  isDesktopPgliteDirectoryStorage,
  type DesktopPgliteDirectoryStorage
} from './desktop-storage.js';

/**
 * PGlite 线协议版本。
 *
 * @remarks
 * 与 {@link DESKTOP_HOST_PROTOCOL_VERSION} 各自独立编号，因为两套协议会各自演进：
 * PGlite 加一个事务操作不该逼着已经稳定的 SQLite host 跟着跳版本，反之亦然。
 * 两者当前都是 1，纯属巧合，**不要**把它们绑成同一个常量。
 *
 * 本协议没有 Rust 对偶：Tauri 永远不会有 PGlite host（没有 Node 主进程可服务 PGlite 的
 * 同步 filesystem 契约），所以这个数字只有 TypeScript 这一份真相源。
 */
export const DESKTOP_PGLITE_PROTOCOL_VERSION = 1;

/**
 * 参数值允许的最大嵌套深度。
 *
 * @remarks
 * JSONB 参数天然是树，而 renderer 不可信：没有深度上限时，一个自引用的数组会让校验
 * 本身栈溢出——崩的是**主进程**，不是那个发请求的渲染进程。8 层远高于任何真实的
 * JSONB 列（实体里嵌到三层就已经该拆表了），越过它意味着调用方有 bug 或在攻击。
 */
export const DESKTOP_PGLITE_MAX_PARAM_DEPTH = 8;

/**
 * `pg.begin` 等待连接空闲的默认上限（毫秒）。
 *
 * @remarks
 * PGlite 只有一条连接，一条事务开着时第二个 `pg.begin` 会**永远**挂住。因此开启事务
 * 必须超时并 fail-fast，不得降级成静默排队——那等于把死锁伪装成慢（故事「冻结带来的
 * 三条实现约束」第 2 条）。5s 沿用线 G 原型实测用的档位。
 */
export const DESKTOP_PGLITE_DEFAULT_BEGIN_TIMEOUT_MS = 5_000;

/**
 * `pg.begin` 超时允许的上限（毫秒）。
 *
 * @remarks
 * 超时值由 renderer 传入，而 renderer 不可信：不封顶的话一个 `timeout: 2 ** 53` 就把
 * fail-fast 还原成了无限等待，AC#3 承诺的「不留下悬挂事务」随之失效。
 */
export const DESKTOP_PGLITE_MAX_BEGIN_TIMEOUT_MS = 60_000;

/**
 * 参数值：结构化克隆能原样搬运，且 PGlite 能绑定的类型。
 *
 * @remarks
 * 比 SQLite 的 `SQLiteCompatibleType` 宽，多出 `boolean`、`Date`、数组与纯对象——
 * 后三者分别对应 PG 的 `timestamptz`、数组列与 `jsonb`。`undefined` 不在其中：
 * 顶层的 `undefined` 在解析时归一成 `null`（可空外键的既成契约），嵌套位置的
 * `undefined` 则按违规拒绝，因为它在 JSONB 里既不是 null 也不是缺席，静默丢掉
 * 会让落库的对象比调用方给的少一个键，而调用方收到的是成功。
 */
export type DesktopPgliteParam =
  | null
  | boolean
  | number
  | bigint
  | string
  | Date
  | Uint8Array<ArrayBuffer>
  | readonly DesktopPgliteParam[]
  | { readonly [key: string]: DesktopPgliteParam };

/**
 * 协商 PGlite 线协议版本。
 *
 * @remarks
 * 与 SQLite 侧同理：**不带任何参数，也不产生任何副作用**。版本核对必须排在 `pg.open`
 * 之前——`pg.open` 会 `mkdir` 出 data directory 并在里面跑 initdb，等 renderer 从 `pg.open`
 * 应答里读出版本不匹配时，磁盘上已经多了一个初始化过的 PG 数据目录，而调用方拿不到
 * client，也就没有把手去收拾它（AC#11）。
 *
 * 这一步对 PGlite 比对 SQLite 更要紧：SQLite 留下的是一个 0 字节的空文件，PGlite 留下的
 * 是一整棵 initdb 生成的目录树。
 */
export interface DesktopPgliteHandshakeRequest {
  readonly kind: 'pg.handshake';
}

/** 打开一个 PGlite data directory 会话。 */
export interface DesktopPgliteOpenRequest {
  readonly kind: 'pg.open';
  readonly storage: DesktopPgliteDirectoryStorage;
}

/** 执行一条带参数的语句；`transactionId` 缺席时是自动提交。 */
export interface DesktopPgliteQueryRequest {
  readonly kind: 'pg.query';
  readonly sessionId: string;
  readonly sql: string;
  readonly params: readonly DesktopPgliteParam[];
  /** host 签发的事务 ID；缺席表示不在事务里执行。 */
  readonly transactionId?: string;
}

/**
 * 执行一段多语句脚本。
 *
 * @remarks
 * 刻意**不收参数**：`exec` 走的是 PG 的 simple query 协议，一次传多条语句，
 * 没有可以绑定占位符的位置。留一个会被忽略的 `params` 字段，只会让调用方以为
 * 自己传的值参与了执行——解析时直接丢弃比装作支持诚实。
 */
export interface DesktopPgliteExecRequest {
  readonly kind: 'pg.exec';
  readonly sessionId: string;
  readonly sql: string;
}

/** 开启一条事务，取得串联后续语句用的事务 ID。 */
export interface DesktopPgliteBeginRequest {
  readonly kind: 'pg.begin';
  readonly sessionId: string;
  /** 等待连接空闲的上限（毫秒）；到期即以 `transaction_unavailable` 失败，不排队。 */
  readonly timeout: number;
}

/** 结束一条事务。 */
export interface DesktopPgliteTransactionEndRequest {
  readonly kind: 'pg.commit' | 'pg.rollback';
  readonly sessionId: string;
  readonly transactionId: string;
}

/** 查询会话所连 PG 的引擎版本。 */
export interface DesktopPgliteVersionRequest {
  readonly kind: 'pg.version';
  readonly sessionId: string;
}

/** 关闭会话；host 据此回滚该会话仍开着的事务并释放引用。 */
export interface DesktopPgliteCloseRequest {
  readonly kind: 'pg.close';
  readonly sessionId: string;
}

/** renderer 可以发给 PGlite host 的全部请求。 */
export type DesktopPgliteRequest =
  | DesktopPgliteHandshakeRequest
  | DesktopPgliteOpenRequest
  | DesktopPgliteQueryRequest
  | DesktopPgliteExecRequest
  | DesktopPgliteBeginRequest
  | DesktopPgliteTransactionEndRequest
  | DesktopPgliteVersionRequest
  | DesktopPgliteCloseRequest;

/** `pg.handshake` 的响应。 */
export interface DesktopPgliteHandshakeResult {
  /** host 所讲的线协议版本；renderer 据此决定要不要继续往下发 `pg.open`。 */
  readonly protocolVersion: number;
}

/** `pg.open` 的响应。 */
export interface DesktopPgliteOpenResult {
  readonly sessionId: string;
  /**
   * 已解析的**逻辑**位置，仅供诊断与日志（AC#5）。
   *
   * @remarks
   * 与 SQLite 侧同样刻意不是物理绝对路径：renderer 拿到物理根目录等于拿到额外的
   * 文件系统情报，而它并不需要这份情报就能工作。
   */
  readonly resolvedLocation: string;
  /** host 所讲的线协议版本；握手之后的第二道核对，理由见 SQLite 侧同名字段。 */
  readonly protocolVersion: number;
}

/** 结果列的元信息；只留结构化克隆搬得动的两项。 */
export interface DesktopPgliteField {
  readonly name: string;
  readonly dataTypeID: number;
}

/**
 * 一条语句的结果。
 *
 * @remarks
 * 形状与 PGlite 自己的 `Results` 对齐，但 `fields` 收窄成 {@link DesktopPgliteField}：
 * PGlite 在 `fields` 上还挂着解析器等函数属性，它们过不了结构化克隆，直接把 `Results`
 * 塞进 IPC 会在运行时抛 DataCloneError。host 必须逐列映射成本形状再回传。
 */
export interface DesktopPgliteQueryResult {
  readonly rows: readonly Record<string, unknown>[];
  readonly fields: readonly DesktopPgliteField[];
  /** 受影响行数；`SELECT` 等不报告该值的语句上缺席，与 PGlite 的可选语义一致。 */
  readonly affectedRows?: number;
}

/**
 * host 对一次 PGlite 请求的应答。
 *
 * @remarks
 * 失败同样走**正常返回值**而不是 reject：`ipcRenderer.invoke` 在 reject 时只把错误
 * 序列化成字符串，自定义 `Error` 子类与它的 `code` 字段全部丢失。
 */
export type DesktopPgliteResponse =
  | { readonly kind: 'pg.handshake'; readonly result: DesktopPgliteHandshakeResult }
  | { readonly kind: 'pg.open'; readonly result: DesktopPgliteOpenResult }
  | { readonly kind: 'pg.query'; readonly result: DesktopPgliteQueryResult }
  | { readonly kind: 'pg.exec'; readonly result: readonly DesktopPgliteQueryResult[] }
  | { readonly kind: 'pg.begin'; readonly result: { readonly transactionId: string } }
  | { readonly kind: 'pg.commit' }
  | { readonly kind: 'pg.rollback' }
  | { readonly kind: 'pg.version'; readonly result: string }
  | { readonly kind: 'pg.close' }
  | { readonly kind: 'error'; readonly code: RxDBAdapterDesktopErrorCode; readonly message: string };

/**
 * host 主动推送给 renderer 的**裸** NOTIFY。
 *
 * @remarks
 * 刻意不在 host 侧聚合成变更事件：批量窗口与去重留在渲染进程的
 * `PGliteNotificationBatcher`，浏览器与桌面因此共用同一份批量语义。各写一份的话，
 * 「同一行在一个窗口内只派发一次」会在两条路径上悄悄分叉，而分叉的表征是
 * 「桌面下变更事件比浏览器多」——排查时根本不会怀疑到批量窗口上。
 *
 * `payload` 的长度不在这里设限：PostgreSQL 自己就把 NOTIFY payload 卡在 8000 字节，
 * 在这里抄第二遍只是多一个会写错的地方。
 */
export interface DesktopPgliteNotifyMessage {
  readonly kind: 'pg.notify';
  readonly sessionId: string;
  /** 频道名，形如 `<table>_notify`。 */
  readonly channel: string;
  /** 触发器写入的 JSON 文本，原样透传。 */
  readonly payload: string;
}

const PGLITE_REQUEST_KINDS: readonly DesktopPgliteRequest['kind'][] = [
  'pg.handshake',
  'pg.open',
  'pg.query',
  'pg.exec',
  'pg.begin',
  'pg.commit',
  'pg.rollback',
  'pg.version',
  'pg.close'
];

/** 结构化克隆产出的对象原型只可能是这两种；其余（Map/Set/类实例）不是 JSONB 参数。 */
const isPlainObject = (value: object): boolean => {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const assertBlob = (value: Uint8Array, path: string): void => {
  if (value.byteLength > DESKTOP_HOST_MAX_BLOB_BYTES) {
    throw violation(`${path} exceeds ${DESKTOP_HOST_MAX_BLOB_BYTES} bytes`);
  }
  if (!(value.buffer instanceof ArrayBuffer)) {
    // 走到这里说明调用方绕过结构化克隆直接塞了 SharedArrayBuffer 视图，属于协议违例。
    throw violation(`${path} must be backed by a plain ArrayBuffer`);
  }
};

/**
 * 逐值校验一个参数。
 *
 * @remarks
 * 深度参数不是防御性编程的装饰：没有它，`const a = []; a.push(a)` 这样一个入参
 * 就能让主进程栈溢出（见 {@link DESKTOP_PGLITE_MAX_PARAM_DEPTH}）。
 */
const assertParam = (value: unknown, path: string, depth: number): void => {
  if (depth > DESKTOP_PGLITE_MAX_PARAM_DEPTH) {
    throw violation(`${path} exceeds the maximum nesting depth of ${DESKTOP_PGLITE_MAX_PARAM_DEPTH}`);
  }
  if (value === null) return;
  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean' || type === 'bigint') return;
  if (value instanceof Date) return;
  if (value instanceof Uint8Array) return assertBlob(value, path);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertParam(item, `${path}[${index}]`, depth + 1));
    return;
  }
  if (type === 'object' && isPlainObject(value as object)) {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      assertParam(item, `${path}.${key}`, depth + 1);
    }
    return;
  }
  throw violation(`${path} is not a structured-clone safe PGlite parameter`);
};

const readParams = (record: Record<string, unknown>): readonly DesktopPgliteParam[] => {
  const params = record['params'];
  if (params === undefined) return [];
  if (!Array.isArray(params)) throw violation('params must be an array');
  if (params.length > DESKTOP_HOST_MAX_BINDINGS) {
    throw violation(`params exceed ${DESKTOP_HOST_MAX_BINDINGS} entries`);
  }
  return params.map((param, index) => {
    // 顶层 undefined 归一成 SQL NULL：可空外键（例如根节点的 parentId）会以 undefined
    // 的形态一路走到这里，与 SQLite 侧 `normalizeBinding` 是同一条既成契约。
    const value: unknown = param === undefined ? null : param;
    assertParam(value, `params[${index}]`, 0);
    return value as DesktopPgliteParam;
  });
};

const readBeginTimeout = (record: Record<string, unknown>): number => {
  const timeout = record['timeout'];
  if (timeout === undefined) return DESKTOP_PGLITE_DEFAULT_BEGIN_TIMEOUT_MS;
  // 下界是 1 而不是 0：0 会把 fail-fast 变成 never-start，等于取消了事务能力本身。
  if (
    !Number.isInteger(timeout) ||
    (timeout as number) < 1 ||
    (timeout as number) > DESKTOP_PGLITE_MAX_BEGIN_TIMEOUT_MS
  ) {
    throw violation(
      `timeout must be an integer within 1..${DESKTOP_PGLITE_MAX_BEGIN_TIMEOUT_MS}, got ${String(timeout)}`
    );
  }
  return timeout as number;
};

const parseOpenRequest = (record: Record<string, unknown>): DesktopPgliteOpenRequest => {
  const storage = record['storage'];
  if (!isDesktopPgliteDirectoryStorage(storage)) {
    throw new RxDBAdapterDesktopError(
      'unsupported_runtime_engine',
      'the desktop PGlite protocol only carries a PGlite data directory; ' +
        `got engine ${String((storage as { engine?: unknown } | null)?.engine)}`
    );
  }
  // data directory 名与 SQLite 逻辑库名共用同一套白名单：两者都是应用作用域内的逻辑名，
  // 都由 host 在自己的应用数据目录里解析，因此「不含路径分隔符」这条性质必须一样强。
  assertValidDesktopDatabaseName(storage.dataDirectoryName);
  return { kind: 'pg.open', storage: { engine: 'pglite', dataDirectoryName: storage.dataDirectoryName } };
};

/**
 * 判断一个 `kind` 是否属于 PGlite 协议。
 *
 * @remarks
 * 桥接层据此在分派到 SQLite / 文件解析器**之前**把 `pg.*` 摘出去。只看形状、不看内容，
 * 真正的校验留给 {@link parseDesktopPgliteRequest}。
 *
 * `pg.notify` 不在其中：它是 host 推给 renderer 的消息，方向相反，永远不该出现在
 * 请求路由上。
 *
 * @param value - 未经校验的 `kind` 字段
 * @returns 是 PGlite 请求类型时为 `true`
 */
export function isDesktopPgliteRequestKind(value: unknown): value is DesktopPgliteRequest['kind'] {
  return typeof value === 'string' && PGLITE_REQUEST_KINDS.includes(value as DesktopPgliteRequest['kind']);
}

/**
 * 校验并归一化一条来自 renderer 的 PGlite 请求。
 *
 * @remarks
 * 这是 PGlite host 的**信任边界**：入参来自渲染进程，即便开了 `contextIsolation` 也不可信。
 * 返回值是重新构造的对象而非原对象，因此契约之外的字段不会顺着流进 host。
 *
 * 本函数**只接受** `pg.*`，与 {@link parseDesktopHostRequest} /
 * {@link parseDesktopHostFileRequest} 三族互不相容——理由见模块级说明。
 *
 * @param value - 未经校验的 IPC 入参
 * @returns 归一化后的请求
 * @throws {@link RxDBAdapterDesktopError} 形状非法时抛 `protocol_violation`；引擎或目录名非法时抛对应的存储错误码
 */
export function parseDesktopPgliteRequest(value: unknown): DesktopPgliteRequest {
  const record = asRecord(value);
  const kind = record['kind'];
  if (!isDesktopPgliteRequestKind(kind)) {
    throw violation(`unknown pglite request kind ${String(kind)}`);
  }
  // 握手没有任何字段可读：重新构造的对象里因此只剩 kind。
  if (kind === 'pg.handshake') return { kind };
  if (kind === 'pg.open') return parseOpenRequest(record);

  const sessionId = readSessionId(record);
  if (kind === 'pg.query') {
    return {
      kind,
      sessionId,
      sql: readSql(record),
      params: readParams(record),
      transactionId: readOptionalUuid(record, 'transactionId')
    };
  }
  if (kind === 'pg.exec') return { kind, sessionId, sql: readSql(record) };
  if (kind === 'pg.begin') return { kind, sessionId, timeout: readBeginTimeout(record) };
  if (kind === 'pg.commit' || kind === 'pg.rollback') {
    return { kind, sessionId, transactionId: readUuid(record, 'transactionId') };
  }
  return { kind, sessionId };
}

/**
 * 核对 host 报上来的 PGlite 线协议版本。
 *
 * @remarks
 * 消息里同时点出两端的数字，理由与 SQLite 侧同名函数一致：只说「协议不匹配」的话，
 * 排查的人还得自己去两个仓位翻常量。
 */
const assertProtocolVersion = (protocolVersion: unknown): number => {
  if (protocolVersion !== DESKTOP_PGLITE_PROTOCOL_VERSION) {
    throw violation(
      `host speaks pglite protocol ${String(protocolVersion)} but this client speaks ` +
        `${DESKTOP_PGLITE_PROTOCOL_VERSION}`
    );
  }
  return DESKTOP_PGLITE_PROTOCOL_VERSION;
};

/**
 * 校验 `pg.handshake` 响应。
 *
 * @remarks
 * 这是**唯一**一个在任何有副作用的请求之前跑到的校验点，因此它抛出来即意味着 host 上
 * 什么都还没发生：目录没建、initdb 没跑、会话没登记（AC#11）。
 *
 * @param value - host 返回的未校验负载
 * @returns 校验通过的握手结果
 * @throws 形状非法或协议版本不匹配时抛 `protocol_violation`
 */
export function parseDesktopPgliteHandshakeResult(value: unknown): DesktopPgliteHandshakeResult {
  return { protocolVersion: assertProtocolVersion(asRecord(value)['protocolVersion']) };
}

/**
 * 校验 `pg.open` 响应。
 *
 * @param value - host 返回的未校验负载
 * @returns 校验通过的打开结果
 * @throws 形状非法或协议版本不匹配时抛 `protocol_violation`
 */
export function parseDesktopPgliteOpenResult(value: unknown): DesktopPgliteOpenResult {
  const record = asRecord(value);
  const sessionId = readSessionId(record);
  const protocolVersion = assertProtocolVersion(record['protocolVersion']);
  const resolvedLocation = record['resolvedLocation'];
  if (typeof resolvedLocation !== 'string') throw violation('resolvedLocation must be a string');
  return { sessionId, resolvedLocation, protocolVersion };
}

/**
 * 校验 host 推送过来的裸 NOTIFY。
 *
 * @remarks
 * 方向与 {@link parseDesktopPgliteRequest} 相反，但同样不能假设对端守规矩：renderer 收到
 * 形状不对的消息时宁可抛错，也不能把半条通知喂进批量窗口——那会让本地缓存与库里的
 * 真实状态悄悄分叉。
 *
 * @param value - 未经校验的推送负载
 * @returns 校验通过的会话、频道与 payload
 * @throws 形状非法时抛 `protocol_violation`
 */
export function parseDesktopPgliteNotifyMessage(value: unknown): {
  readonly sessionId: string;
  readonly channel: string;
  readonly payload: string;
} {
  const record = asRecord(value);
  if (record['kind'] !== 'pg.notify') {
    throw violation(`expected a pg.notify message but got ${String(record['kind'])}`);
  }
  const sessionId = readSessionId(record);
  const channel = record['channel'];
  const payload = record['payload'];
  if (typeof channel !== 'string' || typeof payload !== 'string') {
    throw violation('channel and payload must be strings');
  }
  return { sessionId, channel, payload };
}

/**
 * 校验一条 PGlite host 应答，并把错误应答还原成本地异常。
 *
 * @remarks
 * 与 {@link DesktopPgliteResponse} 配套的解包点：错误应答在这里重新变回
 * {@link RxDBAdapterDesktopError} 抛出，调用方写的仍是普通的 `try/catch`。
 * 错误码先经 {@link isRxDBAdapterDesktopErrorCode} 过一遍，不在契约内的字符串
 * 一律按协议违规处理。
 *
 * @param expected - 期望的应答类型
 * @param value - host 返回的未校验负载
 * @returns 与 `expected` 对应的应答
 * @throws {@link RxDBAdapterDesktopError} host 报错时按其原始错误码抛出；应答形状不符时抛 `protocol_violation`
 */
export function assertDesktopPgliteResponse<TKind extends Exclude<DesktopPgliteResponse['kind'], 'error'>>(
  expected: TKind,
  value: unknown
): Extract<DesktopPgliteResponse, { kind: TKind }> {
  const record = asRecord(value);
  const kind = record['kind'];
  if (kind === 'error') {
    const code = record['code'];
    const message = record['message'];
    if (!isRxDBAdapterDesktopErrorCode(code) || typeof message !== 'string') {
      throw violation(`host reported an error with an unknown code ${String(code)}`);
    }
    throw new RxDBAdapterDesktopError(code, message);
  }
  if (kind !== expected) {
    throw violation(`expected a ${expected} response but the host answered ${String(kind)}`);
  }
  return record as unknown as Extract<DesktopPgliteResponse, { kind: TKind }>;
}
