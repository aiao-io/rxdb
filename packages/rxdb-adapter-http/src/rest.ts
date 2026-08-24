/**
 * @packageDocumentation
 * REST resource URL 模板（US-212 阶段 B AC#27）。
 *
 * @remarks
 * 阶段 A 的 handler 是**纯协议 mapping**，但绝大多数 REST 后端的 mapping 长得一模一样：
 * 资源路径 + 固定 body 形状。让每个接入方手抄一遍，抄错的地方不会当场报错——一个漏了
 * `:id` 的 `PATCH` 模板会打到集合资源上，一个把 `updatedAt` 解错的 parse 会静默返回错行。
 * 本模块把那份样板收成一个工厂，**只替换 handler，不改适配器**：产出的仍是
 * {@link HttpHandlers}，阶段 A 的翻页、分块、发射契约、错误分类一条都不动
 * （「缺省不得改变阶段 A 语义」）。
 *
 * **模板校验在构造期，不在请求期。** AC#27 要的是「模板解析失败 fail-fast，不发错 URL」，
 * 而错 URL 的危险形态恰恰不会报错：`PATCH :entity` 少个 `:id` 会更新整个集合，
 * `:entity` 缺席会让所有实体共用一个 URL。等到发出去再看响应码，那两条都可能是 200。
 */

import { HttpConfigError, HttpHandlerContractError } from './errors.js';
import type {
  CreateContext,
  FetchMetadataResult,
  HttpHandlers,
  HttpMethod,
  HttpRequestSpec,
  UpdateContext
} from './http.interface.js';

/** 模板支持的占位符，**只有这两个**。 */
export type RestPlaceholder = 'entity' | 'id';

/** 可用模板表达的操作，与 {@link HttpHandlers} 的七个字段一一对应。 */
export type RestOperation =
  'fetchMetadata' | 'findByIds' | 'create' | 'update' | 'delete' | 'version' | 'isTableExisted';

/** 单个操作的路径模板与方法覆盖。 */
export interface RestOperationTemplate {
  /** 相对 `baseUrl` 的路径模板（也可给绝对 URL），占位符写作 `:entity` / `:id` */
  path: string;
  /** 缺省取该操作的默认方法，见 {@link createRestHandlers} */
  method?: HttpMethod;
}

/** {@link createRestHandlers} 的配置。 */
export interface RestHandlersOptions {
  /**
   * 实体名 → 资源路径片段，例如 `{ Recipe: 'recipes' }`。
   *
   * @remarks
   * 值**可以含 `/`**（`v1/recipes` 合法）：它来自配置，是开发者写下的常量，不是数据。
   * 与之相对，`:id` 的取值来自远端行，必须 `encodeURIComponent` —— 一个含 `/` 的 id
   * 不做转义就会拼出另一个资源的地址。两者的来源不同，处理方式因此不同。
   *
   * 未列出的实体直接用实体名本身作路径片段。
   */
  resources?: Record<string, string>;
  /**
   * 逐操作覆盖路径与方法。
   *
   * @remarks
   * 三种取值语义不同：**缺省** = 用默认模板（`version` / `isTableExisted` 的默认是「不产出」）；
   * **给对象** = 用它；**给 `null`** = 不产出该 handler。
   *
   * `null` 是有意义的一档而不是冗余写法：写 duck 的「不支持」在 core 侧表现为**属性缺席**
   * （`QueryCacheRepository` 用 `if (!this.remoteAdapter.create)` 特性探测），
   * 只读后端必须能把 `create` 关掉，否则 `repo.create()` 会发出一个注定 405 的请求，
   * 而不是 AC#4 那句清晰的「Remote adapter does not support create」。
   *
   * `fetchMetadata` / `findByIds` 不可关：它们是 `RxDBAdapterRemoteBase` 两个 abstract
   * 成员的落地点，关掉整条 QueryCache 读路径都不成立。
   */
  templates?: { [K in RestOperation]?: RestOperationTemplate | null };
}

/** 每个操作的默认模板与占位符契约 */
interface RestOperationSpec {
  method: HttpMethod;
  /**
   * 默认路径；`undefined` = 默认不产出该 handler。
   *
   * @remarks
   * `version` / `isTableExisted` 默认不产出，其余五个产出——判据是「REST 有没有公认形状」。
   * 集合上的 `POST`、单项上的 `PATCH` 是公认的；`/version` 与探测端点不是，
   * 给它们猜一个默认值等于替接入方发明一个不存在的端点，
   * 而 `version()` 未配 handler 时抛 unsupported 本就是阶段 A 定好的诚实行为。
   */
  path?: string;
  /**
   * 模板中**必须恰好出现**的占位符集合（多一个少一个都抛）。
   *
   * @remarks
   * 「恰好」不是洁癖：少 `:entity` 会让所有实体共用一个 URL，少 `:id` 会让 `PATCH`
   * 打到集合上，多一个 `:id` 会在没有 id 的上下文里渲染出字面量 `:id`。三种都发得出去、
   * 都可能拿到 2xx，靠观察响应发现不了。
   */
  placeholders: readonly RestPlaceholder[];
  /** 能否用 `null` 关掉 */
  closable: boolean;
}

const ENTITY_ONLY: readonly RestPlaceholder[] = ['entity'];

/**
 * 七个操作的默认模板。
 *
 * @remarks
 * `delete` 用 `POST :entity/delete` 而不是 `DELETE :entity` + `{ ids }` body，
 * 是本模块唯一一处刻意偏离 REST 直觉的地方：批量删除必须把 id 放在 body 里，
 * 而 DELETE 的请求体被代理、网关和不少服务端框架直接丢弃——那样一条
 * 「删这 3 行」的请求会以「`DELETE /recipes`」的面目到达服务端。删错的代价不对称，
 * 所以这里选一条丑但不会被中间层改写语义的路。需要真 `DELETE` 的接入方显式覆盖即可。
 */
const REST_OPERATIONS: Readonly<Record<RestOperation, RestOperationSpec>> = {
  fetchMetadata: { method: 'POST', path: ':entity/metadata', placeholders: ENTITY_ONLY, closable: false },
  findByIds: { method: 'POST', path: ':entity/by-ids', placeholders: ENTITY_ONLY, closable: false },
  create: { method: 'POST', path: ':entity', placeholders: ENTITY_ONLY, closable: true },
  update: { method: 'PATCH', path: ':entity/:id', placeholders: ['entity', 'id'], closable: true },
  delete: { method: 'POST', path: ':entity/delete', placeholders: ENTITY_ONLY, closable: true },
  version: { method: 'GET', placeholders: [], closable: true },
  // 不给默认路径：缺省时适配器复用 `onFetchMetadata` 的 `limit: 1` 探测，那是一个
  // **确定存在**的端点。默认发 `HEAD :entity` 则是替接入方假设集合资源支持 HEAD——
  // 不支持的后端会回 405，而 405 既不是 2xx 也不是 404，正好落进「抛错」那一支，
  // 把一次能答上来的探测变成故障
  isTableExisted: { method: 'HEAD', placeholders: ENTITY_ONLY, closable: true }
};

const HTTP_METHODS = new Set<string>(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * 占位符词法：`:` 后跟字母开头的标识符。
 *
 * @remarks
 * 首字符限定为字母是为了放过端口号——`https://api.example.com:8080/:entity` 里的 `:8080`
 * 不该被读成一个名叫 `8080` 的未知占位符而拒绝掉整个模板。
 */
const PLACEHOLDER_PATTERN = /:([a-zA-Z][a-zA-Z0-9_]*)/g;

/** 路径片段里出现就会改变 URL 结构的字符 */
const UNSAFE_IN_SEGMENT = /[\s?#]/;

/** `version` 的 parse 出错时没有实体名可报，用它占位 */
const VERSION_SCOPE = '(server version)';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const readPlaceholders = (path: string): string[] => [...path.matchAll(PLACEHOLDER_PATTERN)].map(match => match[1]);

/**
 * 校验单个模板：路径形态、方法、占位符集合。
 *
 * @throws HttpConfigError 任一条不满足，错误信息含操作名与实际值
 */
const assertTemplate = (operation: RestOperation, template: RestOperationTemplate, spec: RestOperationSpec): void => {
  const field = `templates.${operation}`;
  if (typeof template.path !== 'string' || template.path.trim().length === 0) {
    throw new HttpConfigError(
      `REST template "${field}.path" must be a non-empty string, received ${JSON.stringify(template.path)}`,
      `${field}.path`,
      template.path
    );
  }
  if (UNSAFE_IN_SEGMENT.test(template.path)) {
    throw new HttpConfigError(
      `REST template "${field}.path" must not contain whitespace, "?" or "#", received "${template.path}"`,
      `${field}.path`,
      template.path
    );
  }
  if (template.method !== undefined && !HTTP_METHODS.has(template.method)) {
    throw new HttpConfigError(
      `REST template "${field}.method" must be one of ${[...HTTP_METHODS].join(' / ')}, received ${JSON.stringify(template.method)}`,
      `${field}.method`,
      template.method
    );
  }
  const found = new Set(readPlaceholders(template.path));
  const expected = new Set<string>(spec.placeholders);
  const missing = [...expected].filter(name => !found.has(name));
  const unexpected = [...found].filter(name => !expected.has(name));
  if (missing.length === 0 && unexpected.length === 0) {
    return;
  }
  const detail = [
    missing.length > 0 ? `missing ${missing.map(name => `":${name}"`).join(', ')}` : undefined,
    unexpected.length > 0 ? `unexpected ${unexpected.map(name => `":${name}"`).join(', ')}` : undefined
  ]
    .filter(Boolean)
    .join('; ');
  throw new HttpConfigError(
    `REST template "${field}.path" must use exactly ${expected.size === 0 ? 'no placeholder' : [...expected].map(name => `":${name}"`).join(' and ')} — ${detail} in "${template.path}"`,
    `${field}.path`,
    template.path
  );
};

/** 合并默认模板与用户覆盖，`null` 即关闭 */
const resolveTemplates = (
  overrides: RestHandlersOptions['templates']
): Partial<Record<RestOperation, Required<RestOperationTemplate>>> => {
  const resolved: Partial<Record<RestOperation, Required<RestOperationTemplate>>> = {};
  for (const operation of Object.keys(REST_OPERATIONS) as RestOperation[]) {
    const spec = REST_OPERATIONS[operation];
    const override = overrides?.[operation];
    if (override === null) {
      if (!spec.closable) {
        throw new HttpConfigError(
          `REST template "templates.${operation}" cannot be disabled: it backs a required RxDBAdapterRemoteBase member`,
          `templates.${operation}`,
          override
        );
      }
      continue;
    }
    const path = override?.path ?? spec.path;
    if (path === undefined) {
      // 默认不产出、用户也没给路径：保持缺席，让阶段 A 的「未配 handler」语义生效
      continue;
    }
    const template = { path, method: override?.method ?? spec.method };
    assertTemplate(operation, template, spec);
    resolved[operation] = template;
  }
  return resolved;
};

/** 校验 `resources` 的每个值都能安全地拼进路径 */
const validateResources = (resources: RestHandlersOptions['resources']): Record<string, string> | undefined => {
  for (const [entityName, segment] of Object.entries(resources ?? {})) {
    if (typeof segment !== 'string' || segment.trim().length === 0 || UNSAFE_IN_SEGMENT.test(segment)) {
      throw new HttpConfigError(
        `REST resource mapping "resources.${entityName}" must be a non-empty path fragment without whitespace, "?" or "#", received ${JSON.stringify(segment)}`,
        `resources.${entityName}`,
        segment
      );
    }
  }
  return resources;
};

/**
 * 取实体对应的路径片段。
 *
 * @remarks
 * 未映射时直接用实体名，但仍要校验——实体名理论上可以带 `/`，那会悄悄拼出另一个资源的
 * 地址。这条在请求期抛而不是构造期，是因为工厂拿不到实体清单：适配器服务的是
 * `rxdb.config.entities` 里所有挂在 remote 槽位的实体，工厂只看得见配置。
 */
const resolveEntitySegment = (resources: Record<string, string> | undefined, entityName: string): string => {
  const mapped = resources?.[entityName];
  if (mapped !== undefined) {
    return mapped;
  }
  if (UNSAFE_IN_SEGMENT.test(entityName) || entityName.includes('/')) {
    throw new HttpConfigError(
      `REST templates cannot use entity name "${entityName}" as a path fragment; add an explicit "resources.${entityName}" mapping`,
      `resources.${entityName}`,
      undefined
    );
  }
  return entityName;
};

/** 渲染 `:id`：来自数据，必须转义 */
const resolveIdSegment = (entityName: string, id: unknown): string => {
  if (typeof id !== 'string' || id.length === 0) {
    throw new HttpConfigError(
      `REST templates require a non-empty string id for "${entityName}", received ${JSON.stringify(id)}`,
      'id',
      id
    );
  }
  return encodeURIComponent(id);
};

/**
 * 把模板渲染成请求描述（body 由各 handler 自己叠加）。
 *
 * @remarks
 * 取不到片段时**抛**而不是把 `:name` 原样留在 URL 里。`assertTemplate` 已经保证占位符集合
 * 与操作一一对应，所以这条按理走不到；但一旦哪天走到了，留字面量就是发一个错 URL 出去，
 * 而那正是本模块存在的理由。
 */
const render = (
  operation: RestOperation,
  template: Required<RestOperationTemplate>,
  segments: Partial<Record<RestPlaceholder, string>>
): HttpRequestSpec => ({
  url: template.path.replace(PLACEHOLDER_PATTERN, (_match, name: string) => {
    const segment = segments[name as RestPlaceholder];
    if (segment === undefined) {
      throw new HttpConfigError(
        `REST template "templates.${operation}.path" has no value for placeholder ":${name}"`,
        `templates.${operation}.path`,
        template.path
      );
    }
    return segment;
  }),
  method: template.method
});

/** 写回执必须是对象：回显入参或收下 `null` 会在本地留一条远端从不存在的行 */
const assertRow = (handler: string, entityName: string, body: unknown): unknown => {
  if (!isRecord(body)) {
    throw new HttpHandlerContractError(
      handler,
      entityName,
      `expected the persisted row object, received ${JSON.stringify(body)}`
    );
  }
  return body;
};

/**
 * 用 REST 资源 URL 模板产出一整套 {@link HttpHandlers}（US-212 AC#27）。
 *
 * @remarks
 * 产出的 handler 与手写的**完全等价**：同样只做协议 mapping，不碰网络——发请求、注入
 * auth、提取 `status`、翻页、分块、单次发射仍全在适配器一侧。因此本模块拿不到、也不需要
 * 改动阶段 A 的任何契约。
 *
 * 默认模板（方法 / 路径）：
 *
 * | 操作             | 方法    | 路径                | 默认产出 |
 * | ---------------- | ------- | ------------------- | -------- |
 * | `fetchMetadata`  | `POST`  | `:entity/metadata`  | 是（不可关） |
 * | `findByIds`      | `POST`  | `:entity/by-ids`    | 是（不可关） |
 * | `create`         | `POST`  | `:entity`           | 是       |
 * | `update`         | `PATCH` | `:entity/:id`       | 是       |
 * | `delete`         | `POST`  | `:entity/delete`    | 是       |
 * | `version`        | `GET`   | —                   | 否       |
 * | `isTableExisted` | `HEAD`  | —                   | 否       |
 *
 * 最后两行的路径栏是 `—` 而**不是**留空：这两个操作没有默认路径，不配
 * `templates.version.path` / `templates.isTableExisted.path` 就整个不产出 handler。
 * `isTableExisted` 的方法栏仍写 `HEAD`，那是给了路径之后才生效的默认方法
 * （不给默认路径的理由见 `REST_OPERATIONS` 里那一条的注释）。
 *
 * 请求体形状：`fetchMetadata` 发 `{ where, offset, limit, pageToken }`（`where` 是 JSON
 * `RuleGroup`，**不是 SQL**），`findByIds` 与 `delete` 发 `{ ids }`，
 * `create` / `update` 直接发调用方给的数据。
 *
 * @example
 * ```typescript
 * rxdb.adapter('http', db => new RxDBAdapterHttp(db, {
 *   baseUrl: 'https://api.example.com/v1',
 *   handlers: createRestHandlers({
 *     resources: { Recipe: 'recipes' },
 *     templates: { version: { path: 'meta/version' }, delete: null }
 *   })
 * }));
 * // fetchMetadata → POST https://api.example.com/v1/recipes/metadata
 * // update        → PATCH https://api.example.com/v1/recipes/{id}
 * // delete        → 不产出，repo.delete() 走 AC#4 的 fail-fast
 * ```
 *
 * @param options - 资源映射与逐操作的模板覆盖
 * @returns 可直接交给 `RxDBAdapterHttp` 的 handler 集合
 * @throws HttpConfigError 模板路径为空 / 含 `?`、`#`、空白 / 方法非法 / 占位符集合不匹配 /
 *   关闭了必选 handler / `resources` 的值不是合法路径片段
 */
export const createRestHandlers = (options: RestHandlersOptions = {}): HttpHandlers => {
  const resources = validateResources(options.resources);
  const templates = resolveTemplates(options.templates);
  const entityRequest = (
    operation: RestOperation,
    template: Required<RestOperationTemplate>,
    entityName: string
  ): HttpRequestSpec => render(operation, template, { entity: resolveEntitySegment(resources, entityName) });

  // 非空断言在这里是安全的：两个必选操作既有默认路径，又被 resolveTemplates 拒绝关闭
  const fetchMetadata = templates.fetchMetadata!;
  const findByIds = templates.findByIds!;

  const handlers: HttpHandlers = {
    onFetchMetadata: {
      request: ctx => ({
        ...entityRequest('fetchMetadata', fetchMetadata, ctx.entityName),
        // pageToken 为 undefined 时 JSON.stringify 直接丢键，首页因此不会带上一个空 token
        body: { where: ctx.where, offset: ctx.offset, limit: ctx.limit, pageToken: ctx.pageToken }
      }),
      // 两种翻页形态原样透给适配器：形态判别、换形态检测与 updatedAt 规范化都在那一侧，
      // 在这里再判一次只会让同一条契约有两个执行点
      parse: body => body as FetchMetadataResult
    },
    onFindByIds: {
      request: ctx => ({ ...entityRequest('findByIds', findByIds, ctx.entityName), body: { ids: ctx.ids } }),
      parse: body => body as unknown[]
    }
  };

  const { create, update, delete: remove, version, isTableExisted } = templates;
  if (create) {
    handlers.onCreate = {
      request: (ctx: CreateContext) => ({ ...entityRequest('create', create, ctx.entityName), body: ctx.data }),
      parse: (body, ctx) => assertRow('create', ctx.entityName, body)
    };
  }
  if (update) {
    handlers.onUpdate = {
      request: (ctx: UpdateContext) => ({
        ...render('update', update, {
          entity: resolveEntitySegment(resources, ctx.entityName),
          id: resolveIdSegment(ctx.entityName, ctx.id)
        }),
        body: ctx.data
      }),
      parse: (body, ctx) => assertRow('update', ctx.entityName, body)
    };
  }
  if (remove) {
    handlers.onDelete = {
      request: ctx => ({ ...entityRequest('delete', remove, ctx.entityName), body: { ids: ctx.ids } })
    };
  }
  if (version) {
    handlers.onVersion = {
      request: () => render('version', version, {}),
      parse: body => {
        // 两种形态都收：裸 JSON 串与 `{ version }` 在真实后端上一样常见，
        // 逼接入方为此写一个手写 handler 就把这个工厂的价值抵消了
        if (typeof body === 'string') {
          return body;
        }
        if (isRecord(body) && typeof body['version'] === 'string') {
          return body['version'];
        }
        throw new HttpHandlerContractError(
          'version',
          VERSION_SCOPE,
          `expected a version string or { version: string }, received ${JSON.stringify(body)}`
        );
      }
    };
  }
  if (isTableExisted) {
    // 没有 parse：2xx / 404 / 其余的三分支判定要看状态码，而 handler 拿不到 Response
    handlers.onIsTableExisted = { request: ctx => entityRequest('isTableExisted', isTableExisted, ctx.entityName) };
  }
  return handlers;
};
