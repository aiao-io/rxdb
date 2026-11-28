import { checkRecords } from '../checks.js';
import { demand, type Check, type Command, type Identity, type Records, type Workspace } from '../model.js';
import { parseSchemaManifest, recordKeys, schemaModel } from '../schema.js';
import { authorize, expected } from './access.js';
import { preloaded, type Plan, type Run } from './plan.js';

/** 拒绝登记时最多返回的违规明细条数：全部共享记录都不合格时明细会很大，响应只带前面这些与总数。 */
export const reportedViolations = 100;

type SchemaCommand = Extract<Command, { type: 'schema' }>;

/** 登记新版本前的授权与状态校验：要有成员管理权限、期望的当前版本一致、新清单合法且版本更高。返回解析后的新清单。 */
function schemaGuards(state: Workspace, user: Identity, command: SchemaCommand) {
  authorize(state, user, 'manage');
  expected(state.schemaVersion, command.expectedVersion);
  const schema = parseSchemaManifest(command.schema);
  demand(schema.schemaVersion > state.schemaVersion, 'invalid', '数据模式版本必须递增', {
    current: state.schemaVersion
  });
  return schema;
}

/**
 * 共享记录在新清单下的违规明细：先看结构，实体不在清单里报在 `$record` 上、字段不在清单里逐个报出；
 * 结构都符合时再按新清单检查全部记录。结构不符的记录无法再按关联与唯一性检查，所以有结构问题时只报结构问题。
 */
function violations(schema: Workspace['schema'], records: Records): Check[] {
  const model = schemaModel(schema);
  const structural: Check[] = [];
  for (const id of Object.keys(records).sort()) {
    const row = records[id];
    const entity = model.entity(row.entity);
    if (!entity) structural.push({ recordId: id, field: '$record', message: '实体不受支持' });
    for (const field of entity ? Object.keys(row.fields) : [])
      if (!entity!.field(field)) structural.push({ recordId: id, field, message: '字段不受支持' });
  }
  return structural.length ? structural : checkRecords(schema, records);
}

/** 登记新的数据模式版本要预加载共享分支当前的全部记录；其他命令不需要。 */
export function schemaPlan(state: Workspace, user: Identity, command: Command): Plan | undefined {
  if (command.type !== 'schema') return undefined;
  schemaGuards(state, user, command);
  return { type: 'records' };
}

/**
 * 登记新的数据模式版本（只追加）：只有成员管理者可以登记，版本号必须高于当前版本；新清单必须让共享分支当前的全部记录通过检查，
 * 否则以 `checks` 拒绝，`details.checks` 给出前 {@link reportedViolations} 条违规明细，`details.total` 是总数。
 * 登记成功后工作区切到新版本：已有候选随之过期（候选绑定数据模式版本），键索引按新清单重建。
 * 特殊业务检查只作用于合并的改动，不参与这里的全量校验。
 */
export function schemaCommand(
  state: Workspace,
  user: Identity,
  command: Command,
  run: Run
): Record<string, unknown> | undefined {
  if (command.type !== 'schema') return undefined;
  const schema = schemaGuards(state, user, command);
  const records = preloaded(run.facts.records, 'shared records');
  const found = violations(schema, records);
  demand(!found.length, 'checks', '共享数据不符合新的数据模式', {
    checks: found.slice(0, reportedViolations),
    total: found.length
  });
  state.schema = schema;
  state.schemaVersion = schema.schemaVersion;
  run.effects.reindex = Object.entries(records).flatMap(([recordId, row]) =>
    recordKeys(schema, row).map(key => ({ ...key, recordId }))
  );
  return { schemaVersion: schema.schemaVersion };
}
