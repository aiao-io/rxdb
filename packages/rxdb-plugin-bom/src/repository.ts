/**
 * @fileoverview BOM 仓储门面
 *
 * 十进制值合同的**入口规范化**只发生在这里：`qty` 等十进制字段写前规范成规范串
 * （接受指数写法、前导零、尾随零），存储层不替调用方规范化。违约（CHECK / 排他 /
 * BOM 触发器消息）归一为类型化错误类再上抛。
 */

import type { EntityType, QueryTask, RxDB, TransactionExecutor } from '@aiao/rxdb';
import {
  assertEntityOperationAllowed,
  deterministicStringify,
  getEntityMetadata,
  getEntityStatus,
  getEntityStorageMetadata,
  Repository
} from '@aiao/rxdb';
import { firstValueFrom, type Observable } from 'rxjs';
import { normalizeDecimalString } from './decimal.utils.js';
import { BOM_ENTITIES, BomHeader, BomInstanceNode, BomItem, BomLineDesignator, BomLineOccurrence } from './entities.js';
import { bomSqlDialectFor, type BomSqlDialect } from './resolve/bom-sql.js';
import { BomConfigError, CONDITION_GRAMMAR_VERSION } from './resolve/config-condition.js';
import { validateConditionReferences } from './resolve/config-validate.js';
import { attachUnionOnlyMark } from './resolve/cycle-analysis.js';
import {
  BomExtAttrError,
  normalizeExtValue,
  validateExtWrite,
  type ExtAttrDefShape,
  type ExtWriteMode
} from './resolve/ext-attr.js';
import { BomResolutionError } from './resolve/resolution.js';
import type { BomQueryExecutor } from './resolve/resolver.js';
import { parseLotCodes } from './resolve/unit-lot.js';
import { BomCycleError, BomInstanceError, normalizeBomError } from './types.js';
import type { BomViewInput, BomViewSnapshot } from './view-types.js';
import { bomViewRunner } from './view.js';

declare module '@aiao/rxdb' {
  interface RepositoryQueryExtensions<T extends EntityType> {
    bomView: { type: 'bomView'; options: BomViewInput; entityType?: T };
  }
}

/** 需要入口规范化的十进制字段（US-511 按十进制值合同扩列）。 */
const DECIMAL_FIELDS = [
  'jointCostShare',
  'qty',
  'baseQty',
  'assemblyScrap',
  'componentScrap',
  'componentScrapFixed',
  'lotsizeFrom',
  'lotsizeTo',
  'uomConversion'
] as const;

/** 把实体上的十进制字段规范成规范串（原地赋值，不做数值运算）。 */
const normalizeDecimalFields = (entity: Record<string, unknown>): void => {
  for (const field of DECIMAL_FIELDS) {
    if (field in entity && entity[field] !== undefined && entity[field] !== null) {
      entity[field] = normalizeDecimalString(entity[field], field);
    }
  }
};

/**
 * 把底层适配器错误归一为 BOM 错误类；不是 BOM 违约时原样上抛。
 * 环错误附加 `unionOnly` 标记（US-509 AC#9：并集环与真环的区分只服务于产品判断）。
 */

/** 实体类型 → ext 作用域（US-519 写入期按 attr_def 校验的入口）。 */
const EXT_APPLIES_TO: Record<string, 'item' | 'bom_header' | 'bom_line_occurrence'> = {
  BomItem: 'item',
  BomHeader: 'bom_header',
  BomLineOccurrence: 'bom_line_occurrence'
};

const readRows = async (
  query: BomQueryExecutor['query'],
  sql: string,
  params: unknown[] = []
): Promise<Record<string, unknown>[]> => {
  const result = await query(sql, params);
  return result.rows.map(row => Object.fromEntries(result.columns.map((column, index) => [column, row[index]])));
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

const validateDictionaryStorageType = (rxdb: Pick<RxDB, 'config'>, data: Record<string, unknown>): void => {
  const entities = new Map<string, EntityType>([
    ['item', BomItem],
    ['bom_header', BomHeader],
    ['bom_line_occurrence', BomLineOccurrence]
  ]);
  const entity = entities.get(String(data['appliesTo']));
  if (entity === undefined) return;
  const metadata = getEntityStorageMetadata(rxdb, entity);
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

/** 仓储与批量导入共用保存期校验，所有查询由调用方提供的执行器执行。 */
export const validateBomWrite = async (
  query: BomQueryExecutor['query'],
  dialect: BomSqlDialect,
  entityName: string,
  data: Record<string, unknown>,
  mode: ExtWriteMode,
  touchesExt = true,
  rxdb?: Pick<RxDB, 'config'>
): Promise<void> => {
  if (entityName === 'BomAttrDef' && rxdb !== undefined) validateDictionaryStorageType(rxdb, data);
  const appliesTo = EXT_APPLIES_TO[entityName];
  if (appliesTo !== undefined && touchesExt) {
    const defs = await readRows(
      query,
      `SELECT "code", "dataType", "required", "enumValues", "appliesTo" FROM ${dialect.table('attr_def')}`
    );
    const shapes: ExtAttrDefShape[] = defs.map(def => ({
      code: String(def['code']),
      dataType: String(def['dataType']),
      required: Boolean(def['required']),
      enumValues: def['enumValues'] == null ? null : (JSON.parse(String(def['enumValues'])) as string[]),
      appliesTo: String(def['appliesTo'])
    }));
    const ext = data['ext'] == null ? {} : (JSON.parse(normalizeExtValue(data['ext'])) as Record<string, unknown>);
    validateExtWrite(shapes, appliesTo, ext, mode);
    if (data['ext'] != null) data['ext'] = normalizeExtValue(ext);
  }
  if (entityName === 'BomConfigCondition') await validateConditionWrite(query, dialect, data);
  if (entityName === 'BomConfigConstraint') {
    if (data['kind'] !== 'exclude' && data['kind'] !== 'require')
      throw new BomConfigError('kind', '约束种类必须是 exclude / require');
    await conditionById(query, dialect, data['leftConditionId'], data['orgId']);
    await conditionById(query, dialect, data['rightConditionId'], data['orgId']);
  }
  if (entityName !== 'BomLineOccurrence') return;
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

const rethrowBomError = async (rxdb: RxDB, cause: unknown, attempted?: Record<string, unknown>): Promise<never> => {
  const normalized = normalizeBomError(cause) ?? cause;
  if (normalized instanceof BomCycleError) {
    const interval =
      attempted ?
        {
          from: attempted['effectiveFrom'] instanceof Date ? (attempted['effectiveFrom'] as Date).getTime() : null,
          to: attempted['effectiveTo'] instanceof Date ? (attempted['effectiveTo'] as Date).getTime() : null
        }
      : undefined;
    throw await attachUnionOnlyMark(rxdb, normalized, interval);
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
    normalizeDecimalFields(entity as unknown as Record<string, unknown>);
    const data = entity as unknown as Record<string, unknown>;
    await validateBomWrite(
      this.rawQuery.bind(this),
      bomSqlDialectFor(this.rxdb.localAdapterSync?.name),
      getEntityMetadata(this.EntityType).name,
      data,
      'create',
      true,
      this.rxdb
    );
    try {
      return await super.create(entity);
    } catch (error) {
      return await rethrowBomError(this.rxdb, error, entity as unknown as Record<string, unknown>);
    }
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
    const pending = getEntityStatus(entity).prepareUpdate(patch);
    return this.#updatePrepared(entity, patch).finally(pending.release);
  }

  async #updatePrepared(entity: InstanceType<T>, patch: Partial<InstanceType<T>>): Promise<InstanceType<T>> {
    const patchRecord = patch as unknown as Record<string, unknown>;
    const data = new Proxy(patchRecord, {
      get: (target, property) =>
        property in target ?
          target[property as string]
        : (entity as unknown as Record<string, unknown>)[property as string]
    });
    await validateBomWrite(
      this.rawQuery.bind(this),
      bomSqlDialectFor(this.rxdb.localAdapterSync?.name),
      getEntityMetadata(this.EntityType).name,
      data,
      'update-complete',
      'ext' in patchRecord,
      this.rxdb
    );
    // 规范化只在插件入口：patch 里的十进制字段同样经规范串入存储
    for (const [field, value] of Object.entries(patch)) {
      if ((DECIMAL_FIELDS as readonly string[]).includes(field) && value !== undefined && value !== null) {
        const normalized = normalizeDecimalString(value, field);
        (patch as Record<string, unknown>)[field] = normalized;
        const entityRecord = entity as unknown as Record<string, unknown>;
        if (entityRecord[field] === value) entityRecord[field] = normalized;
      }
    }
    try {
      return await super.update(entity, patch);
    } catch (error) {
      return await rethrowBomError(this.rxdb, error, entity as unknown as Record<string, unknown>);
    }
  }

  #viewTask(input: BomViewInput): QueryTask<T, BomViewSnapshot> {
    const captured = structuredClone(input);
    const runner = bomViewRunner(this.rxdb, captured);
    return this.queryManager.createTask({
      options: { type: 'bomView', options: captured },
      runner: () => runner,
      getFingerprint: snapshot => [
        deterministicStringify({
          ...snapshot,
          quantityError:
            snapshot.quantityError instanceof Error ?
              {
                name: snapshot.quantityError.name,
                message: snapshot.quantityError.message
              }
            : snapshot.quantityError
        })
      ],
      relationEntityTypes: BOM_ENTITIES.filter(EntityType => this.rxdb.config.entities.includes(EntityType)),
      autoCache: false
    });
  }

  async #removeOccurrence(entity: InstanceType<T>): Promise<InstanceType<T>> {
    const adapter = await firstValueFrom(this.rxdb.localAdapter$);
    const dialect = bomSqlDialectFor(adapter.name);
    const hasInstances = this.rxdb.config.entities.includes(BomInstanceNode);
    return adapter.transaction(async executor => {
      if (hasInstances) await assertOccurrenceUnreferenced(executor, dialect, entity.id);
      await executor.query(
        `DELETE FROM ${executor.tableRef(BomLineDesignator)} WHERE "occurrenceId" = ${dialect.placeholder(0)}`,
        [entity.id]
      );
      return executor.getRepository(this.EntityType).remove(entity);
    });
  }
}
