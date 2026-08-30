/**
 * @fileoverview RxDB 实例的 `database` provider：检视、查询、事件与分支。
 *
 * @remarks
 * 这是 US-904 阶段 D AC#46 的本体，同时补上了阶段 C2 留下的缺口——
 * `createConnectorProviders` 此前根本没有宣告 `database` 领域，面板的数据库能力
 * 仍整体停在 v1 消息面上。
 *
 * 三件必须先说清楚的事：
 *
 * 1. **它不是 Electron 专属的。** 输入只有「一个 RxDB 实例」，Electron / 浏览器 / Tauri
 *    拿到的是同一份实现，`runtime` 只进 descriptor 的显示字段。桌面档位真正不同的是
 *    **底下的 adapter**（US-207 的 SQLite host），而那一层对本模块不可见——
 *    这正是「不得为某一端建私有 kind / 私有错误码」这条约束的落法。
 *
 * 2. **事件是推的，不是拉的。** `events` 操作只负责**建立**订阅，随后每条 RxDB 事件
 *    经 {@link DevToolsRxdbDatabaseProviderPorts.emitEvent} 走 v2 的 `EVENT` 帧出去。
 *    把事件塞进 `invoke` 的返回值等于把推送退化成轮询，25 类事件里的时序信息会全部丢失。
 *
 * 3. **平台来源固定为 `dom`，不做嗅探。** 本 provider 永远跑在文档上下文里（页内 connector），
 *    因此 IndexedDB 的 `QuotaExceededError`、OPFS 的 `NotFoundError` 能被正确归类；
 *    RxDB 自己抛的普通 `Error` 落到共享映射的 `operation_failed`。
 *    错误 **message 一律不转发**，查询失败的原文里带着 SQL 与 bind 值。
 *
 * @module @aiao/rxdb-devtools/rxdb/database-provider
 */

import type { EntityType, RxDBEvent, RxDBEventMap } from '@aiao/rxdb';
import { createEntityRegistry, resolveEntityKey, type EntityRegistry } from '../connector-entity-info.js';
import { RXDB_EVENT_TYPES, toEventRecord } from '../connector-events.js';
import { maskEncryptedDocument, maskEncryptedEvent, type ConnectorMaskContext } from '../connector-mask.js';
import { serializeDocument } from '../connector-runtime.js';
import { subscribeOnce, type Subscribable } from '../connector-subscribe-once.js';
import type { DevToolsRxDB, GetEntityMetadataFn } from '../connector-types.js';
import {
  DEVTOOLS_PROVIDER_OPERATIONS,
  type DevToolsProviderDescriptor,
  type DevToolsProviderRuntime
} from '../provider/descriptor.js';
import type { DevToolsProvider, DevToolsProviderResult } from '../provider/types.js';
import { serializeDevToolsValue } from '../serializer.js';
import { createProviderError, mapPlatformError } from '../v2/error-mapping.js';
import type { DevToolsProviderErrorCode } from '../v2/errors.js';
import { isRecord, isSafeIntegerInRange } from '../v2/guards.js';

/** 单次查询的等待上限：查询挂住时必须变成一条可判别的失败，而不是永远挂着一个 in-flight 请求。 */
const QUERY_TIMEOUT_MS = 10_000;

/** `limit` 缺省值，同时也是允许的上限。 */
const MAX_QUERY_LIMIT = 1000;

/** 分支实体的注册名；身份仍由 `rxdb.config.entities` 里的元数据解析，不硬编码 namespace。 */
const BRANCH_ENTITY_NAME = 'RxDBBranch';

/** `database` provider 的构造端口。 */
export interface DevToolsRxdbDatabaseProviderPorts {
  /**
   * 取当前 RxDB 实例。
   *
   * @remarks
   * 返回 `undefined` 表示尚未 init：所有操作回 `provider_unavailable`（可重试），
   * 而不是回一份空结果——空结果会让面板把「还没连上」显示成「这个库是空的」。
   * 实例可以在运行期被换掉，实体索引与事件订阅都会跟着重建。
   */
  getRxDB(): DevToolsRxDB | undefined;

  /** 实体元数据读取函数；异常按上游语义透传（不遮罩等于明文泄漏）。 */
  getEntityMetadata: GetEntityMetadataFn;

  /** 仅用于 descriptor 显示。 */
  readonly runtime: DevToolsProviderRuntime;

  /**
   * 把一条已遮罩、已序列化的 RxDB 事件推给对端。
   *
   * @param eventType - `RxDBEventMap` 的键。
   * @param data - 事件载荷；调用方不再持有它。
   */
  emitEvent(eventType: string, data: unknown): void;
}

/** `database` provider；额外暴露订阅回收入口。 */
export interface DevToolsRxdbDatabaseProvider extends DevToolsProvider {
  /**
   * 摘掉全部 RxDB 事件监听。
   *
   * @remarks
   * 幂等。session 结束、实例被换掉与连接器 `disconnect()` 都会调用它；
   * 不回收的话，被替换掉的实例会因为监听器还在而无法回收。
   */
  dispose(): void;
}

type Handler = (rxdb: DevToolsRxDB, params: Record<string, unknown>) => Promise<DevToolsProviderResult>;

/** DevTools 只用到 repository 的这一个能力。 */
interface QueryableRepository {
  find(options: {
    where: { combinator: string; rules: unknown[] };
    orderBy: { field: string; sort: string }[];
    limit: number;
  }): Subscribable<unknown[]>;
}

function ok(result: unknown): DevToolsProviderResult {
  return { outcome: 'ok', result };
}

function failure(code: DevToolsProviderErrorCode): DevToolsProviderResult {
  return { outcome: 'failed', error: createProviderError(code) };
}

/** 读一个非空字符串参数。 */
function readIdentifier(params: Record<string, unknown>, key: string): string | undefined {
  const value = params[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * 订阅一次并把首帧结果交出来。
 *
 * @remarks
 * 必须是 `find` 而不是 `findAll`：后者的选项类型里没有 `limit`，传进去会被静默忽略，
 * 面板要 10 条、整张表被拉进内存。
 */
function queryOnce(repository: QueryableRepository, limit: number): Promise<unknown[]> {
  const observable = repository.find({
    where: { combinator: 'and', rules: [] },
    orderBy: [{ field: 'id', sort: 'desc' }],
    limit
  });
  return new Promise<unknown[]>((resolve, reject) => {
    subscribeOnce(observable, resolve, reject, { timeoutMs: QUERY_TIMEOUT_MS });
  });
}

/** 分支行 → wire 形状；缺字段按「未知」处理而不是丢弃整行。 */
function toBranch(value: unknown): { id: string; activated: boolean } {
  if (!isRecord(value)) return { id: '', activated: false };
  return { id: typeof value['id'] === 'string' ? value['id'] : '', activated: value['activated'] === true };
}

/**
 * 建一个 RxDB `database` provider。
 *
 * @param ports - RxDB 实例入口、元数据读取函数、显示用 runtime 与事件推送口。
 * @returns 可直接装进 `DevToolsProviderRegistry` 的 provider。
 */
export function createDevToolsRxdbDatabaseProvider(
  ports: DevToolsRxdbDatabaseProviderPorts
): DevToolsRxdbDatabaseProvider {
  const descriptor: DevToolsProviderDescriptor = {
    domain: 'database',
    version: 1,
    kind: 'rxdb',
    operations: DEVTOOLS_PROVIDER_OPERATIONS.database,
    runtime: ports.runtime,
    // 数据库领域不传字节：声明非零上限等于允许对端在这个领域上发起 transfer。
    limits: { maxTransferBytes: 0 }
  };

  let cachedRegistry: { instance: DevToolsRxDB; registry: EntityRegistry } | undefined;
  let subscribedTo: DevToolsRxDB | undefined;
  const listeners = new Map<keyof RxDBEventMap, (event: RxDBEvent) => void>();

  /** 实体索引跟着实例走：实例被换掉时整份重建，不复用上一份的加密字段表。 */
  function registryFor(rxdb: DevToolsRxDB): EntityRegistry {
    if (cachedRegistry?.instance !== rxdb) {
      cachedRegistry = { instance: rxdb, registry: createEntityRegistry(rxdb, ports.getEntityMetadata) };
    }
    return cachedRegistry.registry;
  }

  function repositoryOf(rxdb: DevToolsRxDB, entityType: EntityType): QueryableRepository {
    return rxdb.entityManager.getRepository(entityType) as unknown as QueryableRepository;
  }

  function unsubscribe(): void {
    const rxdb = subscribedTo;
    if (rxdb === undefined) return;
    for (const [eventType, listener] of listeners) rxdb.removeEventListener(eventType, listener);
    listeners.clear();
    subscribedTo = undefined;
  }

  function onRxDBEvent(rxdb: DevToolsRxDB, event: RxDBEvent): void {
    const record = toEventRecord(event);
    const context: ConnectorMaskContext = registryFor(rxdb).sync();
    ports.emitEvent(record.type, serializeDevToolsValue(maskEncryptedEvent(context, record)));
  }

  const inspect: Handler = rxdb => {
    const { entityInfo } = registryFor(rxdb).sync();
    return Promise.resolve(
      ok({
        version: rxdb.version,
        dbName: rxdb.config.dbName,
        entities: entityInfo.map(info => ({
          name: info.name,
          namespace: info.namespace,
          encryptedFields: [...info.encryptedFields]
        }))
      })
    );
  };

  const query: Handler = async (rxdb, params) => {
    const entityName = readIdentifier(params, 'entityName');
    if (entityName === undefined) return failure('invalid_path');
    const rawLimit = params['limit'];
    if (rawLimit !== undefined && !isSafeIntegerInRange(rawLimit, 1, MAX_QUERY_LIMIT)) return failure('invalid_path');

    const index = registryFor(rxdb).sync();
    const resolved = resolveEntityKey(index.entityInfo, entityName, readIdentifier(params, 'namespace'));
    if (resolved.ambiguous === true) return failure('resource_conflict');
    const key = resolved.key;
    const entityType = key === undefined ? undefined : index.entityTypeMap.get(key);
    if (key === undefined || entityType === undefined) return failure('resource_not_found');

    const encryptedFields = [...(index.encryptedFieldsMap.get(key) ?? [])];
    const documents = await queryOnce(repositoryOf(rxdb, entityType), rawLimit ?? MAX_QUERY_LIMIT);
    return ok({
      entityName,
      // 回**解析后**的 namespace，而不是请求里那个可选字段：面板据此定位下一次查询，
      // 回显请求会让「按名唯一解析」的那一次查询在面板侧丢掉 namespace。
      namespace: key.slice(0, key.lastIndexOf(':')),
      encryptedFields,
      documents: documents.map(document =>
        serializeDocument(document, value => maskEncryptedDocument(index, value, encryptedFields))
      )
    });
  };

  const events: Handler = rxdb => {
    if (subscribedTo !== rxdb) unsubscribe();
    if (subscribedTo === undefined) {
      subscribedTo = rxdb;
      for (const eventType of RXDB_EVENT_TYPES) {
        const listener = (event: RxDBEvent): void => onRxDBEvent(rxdb, event);
        rxdb.addEventListener(eventType, listener);
        listeners.set(eventType, listener);
      }
    }
    return Promise.resolve(ok({ eventTypes: listeners.size }));
  };

  const getBranches: Handler = async rxdb => {
    const { entityInfo, entityTypeMap } = registryFor(rxdb).sync();
    const key = resolveEntityKey(entityInfo, BRANCH_ENTITY_NAME).key;
    const entityType = key === undefined ? undefined : entityTypeMap.get(key);
    // 没装版本插件时回空数组，等于把「不支持分支」谎报成「一个分支都没有」。
    if (entityType === undefined) return failure('resource_not_found');

    const rows = await queryOnce(repositoryOf(rxdb, entityType), MAX_QUERY_LIMIT);
    return ok({ branches: rows.map(toBranch) });
  };

  /** 三个分支写操作只在「调哪个方法」上不同，参数与应答形状完全一致。 */
  const branchOperation =
    (run: (rxdb: DevToolsRxDB, id: string) => Promise<unknown>): Handler =>
    async (rxdb, params) => {
      const id = readIdentifier(params, 'id');
      if (id === undefined) return failure('invalid_path');
      await run(rxdb, id);
      return ok({ id });
    };

  const handlers: Readonly<Record<string, Handler>> = {
    inspect,
    query,
    events,
    'get-branches': getBranches,
    'switch-branch': branchOperation((rxdb, id) => rxdb.versionManager.switchBranch(id)),
    'create-branch': branchOperation((rxdb, id) => rxdb.versionManager.createBranch(id)),
    'delete-branch': branchOperation((rxdb, id) => rxdb.versionManager.removeBranch(id))
  };

  return {
    descriptor,

    async invoke(operation, params) {
      const handler = Object.hasOwn(handlers, operation) ? handlers[operation] : undefined;
      if (handler === undefined) return failure('provider_unsupported');
      const rxdb = ports.getRxDB();
      if (rxdb === undefined) return failure('provider_unavailable');
      try {
        return await handler(rxdb, isRecord(params) ? params : {});
      } catch (error) {
        return { outcome: 'failed', error: mapPlatformError('dom', error) };
      }
    },

    dispose: unsubscribe
  };
}
