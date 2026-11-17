import { validateFieldValue, type FieldFormat, type FieldValidationRule } from '@aiao/rxdb';
import type { Check, DataRow, Records, SchemaManifest, Value } from './model.js';
import { rowAt } from './records.js';
import {
  fitRow,
  isMissing,
  schemaModel,
  uniqueKey,
  type EntityModel,
  type RecordField,
  type SchemaModel
} from './schema.js';

/** 检查规则：平台 `validateFieldValue()` 的规则标识，加上协作的跨记录规则（唯一、关联）。 */
export type CheckRule = FieldValidationRule | 'unique' | 'relation';

/** 合并结果里一条被改动的记录：相对目标版本 T 的前后整行，新增时 `before`、删除时 `after` 为 undefined。 */
export interface ChangedRecord {
  id: string;
  before: DataRow | undefined;
  after: DataRow | undefined;
}
/**
 * 特殊业务检查的扩展点：部署入口注入（默认没有），在清单规则之后对合并结果追加检查。
 * 只拿到这次合并改动过的记录（按记录标识排序）与当前清单，必须是纯函数，结果只取决于输入；
 * 返回的检查追加在清单规则的检查之后，任何一条都会让候选不能批准与合并。`message` 会经词条表翻译后显示，
 * 应使用 `messages.ts` 里登记过的中文词条，否则界面直接显示原文。
 */
export type RecordCheck = (input: { schema: SchemaManifest; changed: readonly ChangedRecord[] }) => Check[];

/** 带值域约束的数值格式：只有它们会产生 `range` 规则。 */
type NumericFormat = Extract<FieldFormat, { kind: 'currency' | 'duration' | 'number' | 'percentage' | 'rating' }>;
const numericKinds: readonly string[] = ['currency', 'duration', 'number', 'percentage', 'rating'];
const percentageDomain = { '0..1': [0, 1], '0..100': [0, 100] } as const;
const isNumericFormat = (format: FieldFormat | undefined): format is NumericFormat =>
  format !== undefined && numericKinds.includes(format.kind);

/** 数值格式的实际边界：百分比取声明值域与刻度固有值域的交集，与平台的取值校验一致。 */
function numericBounds(format: NumericFormat): { min: number | undefined; max: number | undefined } {
  if (format.kind !== 'percentage') return { min: format.min, max: format.max };
  const [low, high] = percentageDomain[format.scale];
  return {
    min: format.min === undefined ? low : Math.max(format.min, low),
    max: format.max === undefined ? high : Math.min(format.max, high)
  };
}
/** `range` 规则按越过的边界区分文案：越下界（下界为 0 时说「必须为非负数」）、越上界、不在步长刻度上。 */
function rangeMessage(format: FieldFormat | undefined, value: Value): string {
  // 平台只对带数值格式的数字给出 range，别的组合说明规则表与清单不同步
  if (!isNumericFormat(format) || typeof value !== 'number') throw new Error('A range rule needs a numeric format');
  const { min, max } = numericBounds(format);
  if (min !== undefined && value < min) return min === 0 ? '必须为非负数' : '数值小于允许的最小值';
  if (max !== undefined && value > max) return '数值大于允许的最大值';
  return '数值不在允许的刻度上';
}
function requiredMessage(field: RecordField): string {
  if (field.descriptor.valueType === 'date') return '日期不能为空';
  return ['string', 'enum', 'uuid'].includes(field.descriptor.valueType) ? '必填文本不能为空' : '必填项不能为空';
}

/**
 * 规则标识到协作词条（`messages.ts` 中英两份都有）的映射：平台的中文固定文案只用作标识的来源，不直接显示。
 * 与旧版写死的资产检查对应的文案沿用原词条（必填、唯一、关联、日期），数值范围按越过的边界区分。
 */
export function checkMessage(rule: CheckRule, field: RecordField, entity: EntityModel, value: Value): string {
  switch (rule) {
    case 'required':
      return requiredMessage(field);
    case 'unique':
      return field.name === entity.title ? '名称必须唯一' : '取值必须唯一';
    case 'relation':
      return '关联记录不存在';
    case 'type':
      return field.descriptor.valueType === 'boolean' ? '必须为布尔值' : '必须为文本';
    case 'number':
      return '必须为数字';
    case 'integer':
      return '必须为整数';
    case 'range':
      return rangeMessage(field.target === undefined ? field.descriptor.format : undefined, value);
    case 'date':
      return '日期无效';
    case 'enum':
      return '取值不在允许范围内';
    case 'email':
      return '邮箱格式无效';
    case 'phone':
      return '电话号码格式无效';
    case 'url':
      return '链接格式无效';
    case 'urlScheme':
      return '链接协议不受支持';
    case 'uuid':
      return '标识格式无效';
    // 数组、键值与 JSON 类型的字段不能进协作记录（清单解析时已拒绝），这里只为穷尽规则
    case 'json':
    case 'stringArray':
    case 'numberArray':
      return '字段值格式错误';
  }
}

/**
 * 记录里的日期是 JSON 文本：必须以 `YYYY-MM-DD` 开头、能被解析、且日期部分是真实存在的日子，才解码成 `Date`
 * 交给平台校验；其余取值（含数字时间戳与其他格式的文本）一律判为无效日期，不做隐式转换。
 */
export function decodeDate(value: Value): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  const day = value.slice(0, 10);
  const date = new Date(`${day}T00:00:00.000Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === day ? new Date(time) : null;
}

/** 属性取值的规则：日期先解码，再交给平台的 `validateFieldValue()`；通过返回 null。 */
function valueRule(field: RecordField, value: Value): CheckRule | null {
  const descriptor = field.descriptor;
  const decoded = descriptor.valueType === 'date' ? decodeDate(value) : value;
  if (decoded === null) return 'date';
  const failure = validateFieldValue(descriptor, decoded);
  if (!failure) return null;
  if (failure.rule === undefined) throw new Error(`validateFieldValue returned no rule for ${field.name}`);
  return failure.rule;
}

/**
 * 取值是否参与唯一性比较：缺失的不参与；取值本身不合格（类型、枚举或格式不对，已经单独报错）的也不参与，
 * 单值关联的外键只有文本才参与。共享分支 T 里的取值都合格，键索引里的键因此与这里的规则一致。
 */
function comparable(field: RecordField, value: Value | undefined): value is Value {
  if (isMissing(value)) return false;
  return field.target === undefined ? valueRule(field, value!) === null : typeof value === 'string';
}

/** 检查时对合并结果的查询：按标识取记录，按唯一键取全部持有者（按记录标识排序）。 */
interface Lookup {
  row(id: string): DataRow | undefined;
  holders(key: string): readonly string[];
}

/**
 * 一条记录的检查，顺序固定：必填 → 唯一 → 关联 → 取值，同一阶段按清单的字段顺序。
 * - 唯一：同一实体同一字段取值相同的记录里（只比较参与唯一性的取值，见 `comparable`），按记录标识排在第一的不报，其后的各报一次。
 * - 关联：外键为缺失时，只有可为空（nullable）且非必填的关联通过；否则外键必须是文本，且指向合并结果里存在、属于目标实体的记录。
 *   删除仍被引用的记录，报错落在引用它的记录上。
 * - 取值：缺失的取值不查；其余按字段描述校验类型、枚举与数值格式。
 */
function recordChecks(model: SchemaModel, id: string, row: DataRow, lookup: Lookup): Check[] {
  const entity = fitRow(model, row);
  const checks: Check[] = [];
  const add = (field: RecordField, rule: CheckRule) =>
    checks.push({
      recordId: id,
      field: field.name,
      message: checkMessage(rule, field, entity, row.fields[field.name] ?? null)
    });
  for (const field of entity.fields)
    if (field.target === undefined && field.descriptor.required && isMissing(row.fields[field.name]))
      add(field, 'required');
  for (const field of entity.fields) {
    const value = row.fields[field.name];
    if (!field.descriptor.unique || !comparable(field, value)) continue;
    if (lookup.holders(uniqueKey(entity.entity, field.name, value))[0] !== id) add(field, 'unique');
  }
  for (const field of entity.fields) {
    if (field.target === undefined) continue;
    const value = row.fields[field.name];
    if (isMissing(value) && field.descriptor.nullable && !field.descriptor.required) continue;
    const target = typeof value === 'string' && !isMissing(value) ? lookup.row(value) : undefined;
    if (target?.entity !== field.target) add(field, 'relation');
  }
  for (const field of entity.fields) {
    const value = row.fields[field.name];
    if (field.target !== undefined || isMissing(value)) continue;
    const rule = valueRule(field, value!);
    if (rule) add(field, rule);
  }
  return checks;
}

/** 记录表里每个唯一键的持有者，按记录标识排序。 */
function holdersOf(model: SchemaModel, records: Records, ids: readonly string[]): Map<string, string[]> {
  const holders = new Map<string, string[]>();
  for (const id of ids) {
    const entity = fitRow(model, records[id]);
    for (const field of entity.fields) {
      const value = records[id].fields[field.name];
      if (!field.descriptor.unique || !comparable(field, value)) continue;
      const key = uniqueKey(entity.entity, field.name, value);
      holders.set(key, [...(holders.get(key) ?? []), id]);
    }
  }
  return holders;
}

/**
 * 按数据模式清单检查一份完整记录，允许未完成的草稿同步，禁止无效结果进入共享数据。
 * 记录按标识排序逐条检查（每条的顺序见 `recordChecks`），结果只取决于内容。记录的实体或字段不在清单里时抛出 `invalid`。
 * 新版本清单的登记与客户端的导入预览用它检查全部记录；候选与合并用 {@link checkMerged} 只检查受影响的记录，两者结果一致。
 */
export function checkRecords(manifest: SchemaManifest, records: Records): Check[] {
  const model = schemaModel(manifest);
  const ids = Object.keys(records).sort();
  const holders = holdersOf(model, records, ids);
  const lookup: Lookup = {
    row: id => rowAt(records, id),
    holders(key) {
      const found = holders.get(key);
      if (!found) throw new Error(`The holders of ${key} were not collected`);
      return found;
    }
  };
  return ids.flatMap(id => recordChecks(model, id, records[id], lookup));
}

/**
 * 候选与合并的定向检查输入：只含合并基以来任一侧改动过的记录与跨记录检查需要的记录，由仓储按需读取。
 * 目标版本 T 本身总是通过检查（合并只接受检查通过的候选，登记新清单也要求共享记录全部通过），
 * 所以只有改动过的记录与受它们牵连的记录可能出错。
 */
export interface MergeView {
  /** 合并基以来任一侧改动过的记录标识。 */
  touched: readonly string[];
  /** 改动过的记录在合并结果里的整行；被删除的不出现。 */
  merged: Records;
  /** 目标版本 T 里按需读取过的未改动记录。 */
  related: Records;
  /** 在 T 里查过的未改动记录标识（含 T 里不存在的），`related` 里没有就是不存在。 */
  known: readonly string[];
  /** 可能受牵连、要连同改动记录一起检查的未改动记录：与改动记录共用唯一键的记录、引用了改动记录的记录。 */
  suspects: readonly string[];
  /** 查询过的唯一键在 T 里的全部持有者。 */
  holders: Readonly<Record<string, readonly string[]>>;
}

/**
 * 定向检查：只检查改动过的记录与受牵连的未改动记录，跨记录约束按预读的键与记录判断，结果与 {@link checkRecords}
 * 检查整份合并结果完全一致（同样的记录顺序与检查顺序）。用到没有预读的键或记录说明仓储与检查不同步，按内部错误处理。
 */
export function checkMerged(manifest: SchemaManifest, view: MergeView): Check[] {
  const model = schemaModel(manifest);
  const touched = new Set(view.touched);
  const known = new Set(view.known);
  const mergedIds = Object.keys(view.merged).sort();
  const mergedHolders = holdersOf(model, view.merged, mergedIds);
  const lookup: Lookup = {
    row(id) {
      if (touched.has(id)) return rowAt(view.merged, id);
      if (!known.has(id)) throw new Error(`The shared record ${id} was not preloaded`);
      return rowAt(view.related, id);
    },
    holders(key) {
      if (!Object.hasOwn(view.holders, key)) throw new Error(`The holders of ${key} were not preloaded`);
      const shared = view.holders[key].filter(id => !touched.has(id));
      return [...new Set([...shared, ...(mergedHolders.get(key) ?? [])])].sort();
    }
  };
  const ids = [...new Set([...mergedIds, ...view.suspects.filter(id => !touched.has(id))])].sort();
  return ids.flatMap(id => {
    const row = lookup.row(id);
    if (!row) throw new Error(`The suspect record ${id} was not preloaded`);
    return recordChecks(model, id, row, lookup);
  });
}
