import { bomQueryRecords } from './resolve/bom-adapter.js';
/**
 * @fileoverview BOM 仓储门面
 *
 * 十进制值合同的**入口规范化**发生在这里：全部十进制列写前规范成规范串（接受指数写法、前导零、
 * 尾随零）并按存储层同一域规则校验（规则表见 resolve/write-rules.ts，整批导入与历史通道共用），
 * 存储层不替调用方规范化。违约（CHECK / 排他 / BOM 触发器消息）归一为类型化错误类再上抛。
 */

import type { EntityType, QueryTask, RxDB, RxDBMutationsMap, TransactionExecutor } from '@aiao/rxdb';
import {
  assertEntityOperationAllowed,
  getEntityMetadata,
  getEntityStatus,
  getEntityStorageMetadata,
  Repository
} from '@aiao/rxdb';
import { firstValueFrom, type Observable } from 'rxjs';
import { BOM_ENTITIES, BomInstanceNode } from './entities.js';
import { BomMapError } from './resolve/bom-map-error.js';
import { bomSqlDialectFor, type BomSqlDialect } from './resolve/bom-sql.js';
import { BomConfigError, CONDITION_GRAMMAR_VERSION } from './resolve/config-condition.js';
import { validateConditionReferences } from './resolve/config-validate.js';
import { attachUnionOnlyMark, type AttemptedOccurrence } from './resolve/cycle-analysis.js';
import {
  BomExtAttrError,
  EXT_SCOPE_ENTITIES,
  normalizeExtValue,
  parseAttrDefEnumValues,
  validateAttrDefWrite,
  validateExtWrite,
  type ExtAttrDefShape,
  type ExtAttrScope,
  type ExtWriteMode
} from './resolve/ext-attr.js';
import { BomResolutionError } from './resolve/resolution.js';
import type { BomQueryExecutor } from './resolve/resolver.js';
import { parseLotCodes } from './resolve/unit-lot.js';
import { assertFormulaGrammar, normalizeDecimalColumns } from './resolve/write-rules.js';
import { BomCycleError, BomInstanceError, normalizeBomError } from './types.js';
import type { BomViewInput, BomViewSnapshot } from './view-types.js';
import { bomViewRunner } from './view.js';

declare module '@aiao/rxdb' {
  interface RepositoryQueryExtensions<T extends EntityType> {
    bomView: { type: 'bomView'; options: BomViewInput; entityType?: T };
  }
}

/** 实体名 → ext 作用域（US-519 写入期按 attr_def 校验的入口），由作用域表派生。 */
const EXT_SCOPE_OF_ENTITY: ReadonlyMap<string, ExtAttrScope> = new Map(
  Object.entries(EXT_SCOPE_ENTITIES).map(([scope, EntityType]) => [
    getEntityMetadata(EntityType).name,
    scope as ExtAttrScope
  ])
);

/**
 * 保存期校验的上下文：全部读取经调用方事务的执行器，校验读到的字典 / 条件与写入同一快照。
 */
export interface BomWriteValidationContext {
  /** 调用方事务执行器的查询入口。 */
  query: BomQueryExecutor['query'];
  /** 本地适配器的 SQL 方言。 */
  dialect: BomSqlDialect;
  /** attr_def 写入比对热字段类型要用实例的存储声明；缺省不比对。 */
  rxdb?: Pick<RxDB, 'config'>;
  /**
   * 本事务内按作用域缓存的 attr_def 声明：整批导入与历史装载不写字典，跨行复用同一份；单次写入省略即现读。
   */
  attrDefs?: Map<ExtAttrScope, Promise<ExtAttrDefShape[]>>;
}

const readRows = async (
  query: BomQueryExecutor['query'],
  sql: string,
  params: unknown[] = []
): Promise<Record<string, unknown>[]> => {
  const result = await query(sql, params);
  return bomQueryRecords(result);
};

const validateConditionWrite = async (
  query: BomQueryExecutor['query'],
  dialect: BomSqlDialect,
  data: Record<string, unknown>
): Promise<void> => {
  if (data['grammarVersion'] !== CONDITION_GRAMMAR_VERSION) {
    throw new BomConfigError('grammarVersion', `不支持选择条件语法版本「${String(data['grammarVersion'])}」`);
  }
  const chars = await readRows(
    query,
    `SELECT "id", "code" FROM ${dialect.table('config_char')} WHERE "orgId" = ${dialect.placeholder(0)}`,
    [data['orgId']]
  );
  const values = await readRows(
    query,
    `SELECT v."charId", v."value" FROM ${dialect.table('config_char_value')} v JOIN ${dialect.table('config_char')} c ON c."id" = v."charId" WHERE c."orgId" = ${dialect.placeholder(0)}`,
    [data['orgId']]
  );
  const known = new Map(
    chars.map(char => [
      String(char['code']),
      new Set(values.filter(value => value['charId'] === char['id']).map(value => String(value['value'])))
    ])
  );
  validateConditionReferences(String(data['expression']), new Set(known.keys()), known);
};

const conditionById = async (
  query: BomQueryExecutor['query'],
  dialect: BomSqlDialect,
  id: unknown,
  orgId: unknown
): Promise<Record<string, unknown>> => {
  const conditions = await readRows(
    query,
    `SELECT * FROM ${dialect.table('config_condition')} WHERE "id" = ${dialect.placeholder(0)}`,
    [id]
  );
  const condition = conditions[0];
  if (condition === undefined || condition['orgId'] !== orgId) {
    throw new BomConfigError('conditionId', `选择条件「${String(id)}」不存在或不属于组织「${String(orgId)}」`);
  }
  await validateConditionWrite(query, dialect, condition);
  return condition;
};

const validateDictionaryStorageType = (
  rxdb: Pick<RxDB, 'config'>,
  scope: ExtAttrScope,
  data: Record<string, unknown>
): void => {
  const metadata = getEntityStorageMetadata(rxdb, EXT_SCOPE_ENTITIES[scope]);
  for (const column of metadata.generatedColumnMap.values()) {
    if (column.expression.property !== 'ext' || column.expression.key !== data['code']) continue;
    if (column.expression.dataType !== data['dataType']) {
      throw new BomExtAttrError(
        String(data['code']),
        `属性字典类型 ${String(data['dataType'])} 与热字段类型 ${column.expression.dataType} 不匹配`
      );
    }
  }
};

/** 本作用域的 attr_def 声明：只读本作用域，别的作用域里直连写坏的声明不阻塞这里的写入。 */
const readAttrDefs = async (context: BomWriteValidationContext, scope: ExtAttrScope): Promise<ExtAttrDefShape[]> => {
  const rows = await readRows(
    context.query,
    `SELECT "code", "dataType", "required", "enumValues" FROM ${context.dialect.table('attr_def')} WHERE "appliesTo" = ${context.dialect.placeholder(0)}`,
    [scope]
  );
  return rows.map(row => {
    const code = String(row['code']);
    return {
      code,
      dataType: String(row['dataType']),
      required: Boolean(row['required']),
      enumValues: parseAttrDefEnumValues(code, scope, row['enumValues']),
      appliesTo: scope
    };
  });
};

const attrDefsOf = (context: BomWriteValidationContext, scope: ExtAttrScope): Promise<ExtAttrDefShape[]> => {
  const cache = context.attrDefs;
  if (cache === undefined) return readAttrDefs(context, scope);
  const cached = cache.get(scope) ?? readAttrDefs(context, scope);
  cache.set(scope, cached);
  return cached;
};

/** 扩展属性按本作用域字典校验，ext 原地回写为规范 JSON 文本。 */
const validateExtOf = async (
  context: BomWriteValidationContext,
  scope: ExtAttrScope,
  data: Record<string, unknown>,
  mode: ExtWriteMode
): Promise<void> => {
  const defs = await attrDefsOf(context, scope);
  const normalized = data['ext'] == null ? undefined : normalizeExtValue(data['ext']);
  const ext = normalized === undefined ? {} : (JSON.parse(normalized) as Record<string, unknown>);
  validateExtWrite(defs, scope, ext, mode);
  if (normalized !== undefined) data['ext'] = normalized;
};

/**
 * 变换范围（US-516）的根头配对：两根头存在、类型分别为 EBOM / MBOM、组织与范围相同、父件是同一物料（修订可以不同）。
 * 头 → 修订 → 物料都是结构归属列（创建后不可改），配对只会在写范围时被破坏。
 */
const validateMapScopeWrite = async (
  query: BomQueryExecutor['query'],
  dialect: BomSqlDialect,
  data: Record<string, unknown>
): Promise<void> => {
  const roots = await readRows(
    query,
    `SELECT h."id", h."bomType", h."orgId", r."itemId" FROM ${dialect.table('bom_header')} h JOIN ${dialect.table('item_revision')} r ON r."id" = h."parentRevisionId" WHERE h."id" IN (${dialect.placeholder(0)}, ${dialect.placeholder(1)})`,
    [data['ebomRootHeaderId'], data['mbomRootHeaderId']]
  );
  const rootOf = (
    field: 'ebomRootHeaderId' | 'mbomRootHeaderId',
    bomType: 'ebom' | 'mbom'
  ): Record<string, unknown> => {
    const id = String(data[field]);
    const root = roots.find(row => row['id'] === data[field]);
    if (root === undefined) throw new BomMapError(field, `根头不存在：${id}`);
    if (root['bomType'] !== bomType) {
      throw new BomMapError(field, `根头 ${id} 的类型 ${String(root['bomType'])} 不是 ${bomType.toUpperCase()}`);
    }
    if (root['orgId'] !== data['orgId']) {
      throw new BomMapError(field, `根头 ${id} 的组织 ${String(root['orgId'])} 与范围 ${String(data['orgId'])} 不符`);
    }
    return root;
  };
  const ebom = rootOf('ebomRootHeaderId', 'ebom');
  const mbom = rootOf('mbomRootHeaderId', 'mbom');
  if (mbom['itemId'] !== ebom['itemId']) {
    throw new BomMapError(
      'mbomRootHeaderId',
      `根头 ${String(mbom['id'])} 的父件物料 ${String(mbom['itemId'])} 与 EBOM 根头 ${String(ebom['id'])} 的父件物料 ${String(ebom['itemId'])} 不符`
    );
  }
};

/**
 * 仓储、整批导入与历史装载共用的保存期校验（三条写入通道同一口径）。
 *
 * @param context - 调用方事务的执行器与方言；批量通道另带字典缓存
 * @param entityName - 实体元数据名
 * @param data - 写入数据（创建为实体本身，更新为补丁覆盖实体的合并视图）；ext 原地回写为规范 JSON
 * @param mode - 扩展属性写入模式
 * @param touchesExt - 本次写入是否触碰 ext（局部更新没碰扩展属性时不读字典）
 */
export const validateBomWrite = async (
  context: BomWriteValidationContext,
  entityName: string,
  data: Record<string, unknown>,
  mode: ExtWriteMode,
  touchesExt = true
): Promise<void> => {
  const { query, dialect } = context;
  if (entityName === 'BomAttrDef') {
    const appliesTo = validateAttrDefWrite(data);
    if (context.rxdb !== undefined) validateDictionaryStorageType(context.rxdb, appliesTo, data);
  }
  const scope = EXT_SCOPE_OF_ENTITY.get(entityName);
  if (scope !== undefined && touchesExt) await validateExtOf(context, scope, data, mode);
  if (entityName === 'BomConfigCondition') await validateConditionWrite(query, dialect, data);
  if (entityName === 'BomConfigConstraint') {
    if (data['kind'] !== 'exclude' && data['kind'] !== 'require')
      throw new BomConfigError('kind', '约束种类必须是 exclude / require');
    await conditionById(query, dialect, data['leftConditionId'], data['orgId']);
    await conditionById(query, dialect, data['rightConditionId'], data['orgId']);
  }
  if (entityName === 'BomMapScope') await validateMapScopeWrite(query, dialect, data);
  // 导入通道不经仓储的规范化回写：共用校验点按存储层同一域再判一次（仓储路径已规范化，判定幂等）
  normalizeDecimalColumns(data);
  if (entityName !== 'BomLineOccurrence') return;
  assertFormulaGrammar(data);
  for (const field of ['unitFrom', 'unitTo']) {
    const value = data[field];
    if (value != null && (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1))
      throw new BomResolutionError(field, '序列区间边界必须是安全正整数');
  }
  if (data['lotCodes'] != null) parseLotCodes(String(data['lotCodes']));
  if (data['selectionConditionId'] == null) return;
  const headers = await readRows(
    query,
    `SELECT h."orgId" FROM ${dialect.table('bom_line')} l JOIN ${dialect.table('bom_header')} h ON h."id" = l."headerId" WHERE l."id" = ${dialect.placeholder(0)}`,
    [data['lineId']]
  );
  await conditionById(query, dialect, data['selectionConditionId'], headers[0]?.['orgId']);
};

/** 被拒的发生项写入（定 union_only 的判环作用域与闭合边区间）；不是发生项写入时为 undefined。 */
const attemptedOccurrence = (record: Record<string, unknown> | undefined): AttemptedOccurrence | undefined => {
  if (record === undefined || typeof record['lineId'] !== 'string') return undefined;
  const time = (value: unknown): number | null => (value instanceof Date ? value.getTime() : null);
  return {
    lineId: record['lineId'],
    ...(typeof record['id'] === 'string' ? { id: record['id'] } : {}),
    from: time(record['effectiveFrom']),
    to: time(record['effectiveTo'])
  };
};

/**
 * 把底层适配器错误归一为 BOM 错误类；不是 BOM 违约时原样上抛。
 * 环错误附加 `unionOnly` 标记（US-509 AC#9：并集环与真环的区分只服务于产品判断）。
 */
const rethrowBomError = async (rxdb: RxDB, cause: unknown, attempted?: Record<string, unknown>): Promise<never> => {
  const normalized = normalizeBomError(cause) ?? cause;
  if (normalized instanceof BomCycleError) {
    throw await attachUnionOnlyMark(rxdb, normalized, attemptedOccurrence(attempted));
  }
  throw normalized;
};

const assertOccurrenceUnreferenced = async (
  executor: TransactionExecutor,
  dialect: BomSqlDialect,
  occurrenceId: string
): Promise<void> => {
  const result = await executor.query(
    `SELECT COUNT(*) FROM ${executor.tableRef(BomInstanceNode)} WHERE "sourceOccurrenceId" = ${dialect.placeholder(0)}`,
    [occurrenceId]
  );
  const references = Number(result.rows[0][0]);
  if (references > 0) throw new BomInstanceError(`发生项 ${occurrenceId} 被 ${references} 个实例引用，禁止删除来源`);
};

/**
 * 批量写入的写前规范化（与单条写入同口径）：十进制列按实体判域、只回写本次写入的列，ext 规范成规范 JSON。
 *
 * @param entity - 实体（原地回写；更新时即补丁覆盖实体的合并视图）
 * @param written - 本次写入的列：创建为实体本身，更新为写前补丁
 */
const normalizeWriteFields = (entity: Record<string, unknown>, written: Record<string, unknown>): void => {
  for (const [field, normalized] of Object.entries(normalizeDecimalColumns(entity))) {
    if (field in written) entity[field] = normalized;
  }
  if ('ext' in written && entity['ext'] != null) entity['ext'] = normalizeExtValue(entity['ext']);
};

/** 执行 BOM 写入校验与领域查询的共享仓储。 */
export class BomRepository<T extends EntityType = EntityType> extends Repository<T> {
  constructor(rxdb: RxDB, EntityType: T) {
    super(rxdb, EntityType);
    this.queryManager.registerMergeCreateFn('bomView', task => task.refresh());
    this.queryManager.registerMergeUpdateFn('bomView', task => task.refresh());
    this.queryManager.registerMergeRemoveFn('bomView', task => task.refresh());
  }

  /** 订阅完整输入对应的派生快照，保守跟踪 BOM 实体依赖。 */
  watchView(input: BomViewInput): Observable<BomViewSnapshot> {
    return this.#viewTask(input).result$;
  }

  /** 显式重读当前作用域，已有订阅共享同一轮查询。 */
  refreshView(input: BomViewInput): void {
    this.#viewTask(input).refresh();
  }

  override async create(entity: InstanceType<T>): Promise<InstanceType<T>> {
    assertEntityOperationAllowed(this.EntityType, 'create');
    const data = entity as unknown as Record<string, unknown>;
    Object.assign(data, normalizeDecimalColumns(data));
    const created = await this.#writeValidated(data, 'create', true, executor =>
      executor.getRepository(this.EntityType).create(entity)
    );
    this._setLocal(created);
    return created;
  }

  override async remove(entity: InstanceType<T>): Promise<InstanceType<T>> {
    assertEntityOperationAllowed(this.EntityType, 'delete');
    try {
      if (getEntityMetadata(this.EntityType).name !== 'BomLineOccurrence') return await super.remove(entity);
      return await this.#removeOccurrence(entity);
    } catch (error) {
      return await rethrowBomError(this.rxdb, error);
    }
  }

  override async update(entity: InstanceType<T>, patch: Partial<InstanceType<T>>): Promise<InstanceType<T>> {
    assertEntityOperationAllowed(this.EntityType, 'update');
    const pending = getEntityStatus(entity).prepareUpdate(patch);
    return this.#updatePrepared(entity, patch).finally(pending.release);
  }

  /**
   * 批量写入（saveMany / mutations / 多实体 save()）与单条写入同一口径：写前规范化十进制列与 ext，
   * 写后、提交前按本批写入后的库状态逐行校验，违约整批回滚。
   *
   * @remarks
   * 校验放在写入之后：同批内新建的行、头、条件此刻可见，引用它们的行不会因「还没写」被误拒。
   * 写入失败只做不读库的归一（PG 事务此时已中止，并集环标记要再读库，批量路径不附）。
   */
  override async writeMutations<M extends EntityType>(
    executor: TransactionExecutor,
    mutations: RxDBMutationsMap<M>,
    next: () => Promise<InstanceType<M>[]>
  ): Promise<InstanceType<M>[]> {
    const own = this.EntityType as unknown as M;
    const created = [...(mutations.create.get(own) ?? [])].map(entity => entity as unknown as Record<string, unknown>);
    const updated = [...(mutations.update.get(own) ?? [])].map(entity => ({
      data: entity as unknown as Record<string, unknown>,
      patch: getEntityStatus(entity).patch as Record<string, unknown>
    }));
    for (const data of created) normalizeWriteFields(data, data);
    for (const { data, patch } of updated) normalizeWriteFields(data, patch);
    let saved: InstanceType<M>[];
    try {
      saved = await next();
    } catch (error) {
      throw normalizeBomError(error) ?? error;
    }
    const context = {
      query: executor.query.bind(executor),
      dialect: bomSqlDialectFor(this.rxdb.localAdapterSync?.name),
      rxdb: this.rxdb
    };
    const entityName = getEntityMetadata(this.EntityType).name;
    for (const data of created) await validateBomWrite(context, entityName, { ...data }, 'create');
    for (const { data, patch } of updated) {
      await validateBomWrite(context, entityName, { ...data }, 'update-complete', 'ext' in patch);
    }
    return saved;
  }

  async #updatePrepared(entity: InstanceType<T>, patch: Partial<InstanceType<T>>): Promise<InstanceType<T>> {
    const patchRecord = patch as unknown as Record<string, unknown>;
    const entityRecord = entity as unknown as Record<string, unknown>;
    const data = new Proxy(patchRecord, {
      get: (target, property) => (property in target ? target[property as string] : entityRecord[property as string])
    });
    // 规范化只在插件入口：按补丁覆盖实体的合并视图判域（只改损耗记法也重判良率制域），只回写补丁里的列
    for (const [field, normalized] of Object.entries(normalizeDecimalColumns(data))) {
      if (!(field in patchRecord)) continue;
      if (entityRecord[field] === patchRecord[field]) entityRecord[field] = normalized;
      patchRecord[field] = normalized;
    }
    // 同一个 patch 引用沿链传到适配器仓储：prepareUpdate 的编辑版本快照以 patch 对象为键
    const updated = await this.#writeValidated(data, 'update-complete', 'ext' in patchRecord, executor =>
      executor.getRepository(this.EntityType).update(entity, patch)
    );
    this._setLocal(updated);
    return updated;
  }

  /**
   * 保存期校验与写入同一个本地事务：校验读到的字典与选择条件就是写入时刻的版本，中间没有并发改字典的窗口。
   *
   * @remarks
   * BOM 实体的同步策略恒为 None（install 期校验）、不声明手动排序，主端就是本地适配器，与核心
   * create / update 的写路径等价；`transactionLog = false` 与核心单实体写入（writeQuery）同口径。
   * 写入失败归一为 BOM 错误类（并集环判定要再读库，放在事务结束之后）；校验错误原样上抛。
   */
  async #writeValidated(
    data: Record<string, unknown>,
    mode: ExtWriteMode,
    touchesExt: boolean,
    write: (executor: TransactionExecutor) => Promise<InstanceType<T>>
  ): Promise<InstanceType<T>> {
    const adapter = await firstValueFrom(this.rxdb.localAdapter$);
    const dialect = bomSqlDialectFor(adapter.name);
    const entityName = getEntityMetadata(this.EntityType).name;
    let validated = false;
    try {
      return await adapter.transaction(async executor => {
        const context = { query: executor.query.bind(executor), dialect, rxdb: this.rxdb };
        await validateBomWrite(context, entityName, data, mode, touchesExt);
        validated = true;
        return write(executor);
      }, false);
    } catch (error) {
      if (!validated) throw error;
      return await rethrowBomError(this.rxdb, error, data);
    }
  }

  #viewTask(input: BomViewInput): QueryTask<T, BomViewSnapshot> {
    const captured = structuredClone(input);
    const runner = bomViewRunner(this.rxdb, captured);
    let revision = 0;
    return this.queryManager.createTask({
      options: { type: 'bomView', options: captured },
      runner: () => runner,
      getFingerprint: () => [++revision],
      relationEntityTypes: BOM_ENTITIES.filter(EntityType => this.rxdb.config.entities.includes(EntityType)),
      autoCache: false
    });
  }

  /** 删除发生项：实例来源引用检查与删除同一事务；位号与分摊行由两后端的外键 CASCADE 级联。 */
  async #removeOccurrence(entity: InstanceType<T>): Promise<InstanceType<T>> {
    const adapter = await firstValueFrom(this.rxdb.localAdapter$);
    const dialect = bomSqlDialectFor(adapter.name);
    const hasInstances = this.rxdb.config.entities.includes(BomInstanceNode);
    return adapter.transaction(async executor => {
      if (hasInstances) await assertOccurrenceUnreferenced(executor, dialect, entity.id);
      return executor.getRepository(this.EntityType).remove(entity);
    });
  }
}
