import { metadataKeyFromConflictKey, resolveEntityKey, type EntityInfo } from './connector-entity-info.js';
import type { EventRecord } from './connector-events.js';
import { isRecord } from './internal/guards.js';
import { maskEncryptedFields } from './serializer.js';

const EVENT_ENTITY_FIELDS = ['patch', 'inversePatch', 'data'] as const;
/** Conflict 里承载变更记录的两侧，各自形如 `IRxDBChange`（带 entity 与 patch/inversePatch）。 */
const CONFLICT_CHANGE_FIELDS = ['local', 'remote'] as const;

/** 遮罩所需的实体身份与加密字段索引。 */
export interface ConnectorMaskContext {
  readonly entityInfo: readonly EntityInfo[];
  readonly encryptedFieldsMap: ReadonlyMap<string, readonly string[]>;
}

function encryptedFieldsFor(context: ConnectorMaskContext, entityName: string, namespace?: string): readonly string[] {
  const resolved = resolveEntityKey(context.entityInfo, entityName, namespace);
  return (resolved.key && context.encryptedFieldsMap.get(resolved.key)) || [];
}

/**
 * 按「已知携带实体的字段」遮罩，而不是按事件形状：CONFLICT_* 的载荷是 conflicts[]，
 * 每个 conflict 的 local/remote 带变更，base 则是实体快照，
 * 只认 `{ entities: [...] }` 会让这些明文补丁直接广播出去。
 */
export function maskEncryptedEvent(context: ConnectorMaskContext, event: EventRecord): EventRecord {
  const entities = event['entities'];
  const conflicts = event['conflicts'];
  if (!Array.isArray(entities) && !Array.isArray(conflicts)) return event;

  const data: EventRecord = { ...event };
  if (Array.isArray(entities)) {
    data['entities'] = entities.map(entity => maskEncryptedEventEntity(context, entity));
  }
  if (Array.isArray(conflicts)) {
    data['conflicts'] = conflicts.map(conflict => maskEncryptedConflict(context, conflict));
  }
  return data;
}

export function maskEncryptedConflict(context: ConnectorMaskContext, value: unknown): unknown {
  if (!isRecord(value)) return value;

  const masked = { ...value };
  for (const side of CONFLICT_CHANGE_FIELDS) {
    if (Object.hasOwn(value, side)) masked[side] = maskEncryptedEventEntity(context, value[side]);
  }
  if (Object.hasOwn(value, 'base')) {
    const metadataKey = metadataKeyFromConflictKey(value['entityKey']);
    const encryptedFields = (metadataKey && context.encryptedFieldsMap.get(metadataKey)) || [];
    masked['base'] = maskEncryptedFields(value['base'], encryptedFields);
  }
  return masked;
}

export function maskEncryptedEventEntity(context: ConnectorMaskContext, value: unknown): unknown {
  if (!isRecord(value) || typeof value['entity'] !== 'string') return value;
  // 必须用事件自带的 namespace 定位 metadata；只按 entity 名取会套用别的 namespace 的规则，
  // 结果是本该遮罩的字段留明文、无关字段反被遮罩。
  const eventNamespace = typeof value['namespace'] === 'string' ? value['namespace'] : undefined;
  const encryptedFields = encryptedFieldsFor(context, value['entity'], eventNamespace);

  const masked = { ...value };
  for (const field of EVENT_ENTITY_FIELDS) {
    if (!Object.hasOwn(value, field)) continue;
    const redacted = maskEncryptedFields(value[field], encryptedFields);
    masked[field] = maskEmbeddedChangeValue(context, redacted);
  }
  return masked;
}

export function maskEncryptedDocument(
  context: ConnectorMaskContext,
  value: unknown,
  encryptedFields: readonly string[]
): unknown {
  return maskEmbeddedChangeValue(context, maskEncryptedFields(value, encryptedFields));
}

/**
 * RV-047：`changes` 可能携带回指自身（或某个祖先）的引用——generic 查询文档和事件 patch
 * 都观察到过。遍历前若不先给「正在处理的对象」登记身份，递归会在环上无限展开，
 * 查询路径丢失兄弟字段、事件路径向生产者同步抛 `RangeError`。
 *
 * `seen` 把「原始引用 → 本次遍历最终产出的值」登记在先、递归在后：命中环时直接拿到
 * 已经登记的那个输出对象/数组，既不重算也不丢弟兄字段，同时把环结构原样保留给
 * 下游 serializer（它自己的 WeakSet 环检测本就等着处理这种情况，只是之前从未收到完整输入）。
 */
export function maskEmbeddedChangeValue(
  context: ConnectorMaskContext,
  value: unknown,
  seen: WeakMap<object, unknown> = new WeakMap()
): unknown {
  if (Array.isArray(value)) {
    const cached = seen.get(value);
    if (cached !== undefined) return cached;
    const result: unknown[] = [];
    seen.set(value, result);
    for (const item of value) result.push(maskEmbeddedChangeValue(context, item, seen));
    return result;
  }
  if (!isRecord(value) || value instanceof Date || value instanceof Uint8Array) return value;

  const cachedRecord = seen.get(value);
  if (cachedRecord !== undefined) return cachedRecord;

  const entityName = typeof value['entity'] === 'string' ? value['entity'] : undefined;
  const changes = value['changes'];
  const hasChanges = Array.isArray(changes);
  if (!entityName && !hasChanges) {
    // 没有需要改写的字段：保持原引用直通，既是既有行为，也避免给无环的大对象做无谓拷贝。
    seen.set(value, value);
    return value;
  }

  const masked = { ...value };
  // 必须在递归 changes 之前登记：环上的自引用/祖先引用命中的正是这个最终对象。
  seen.set(value, masked);
  if (entityName) {
    const namespace = typeof value['namespace'] === 'string' ? value['namespace'] : undefined;
    const encryptedFields = encryptedFieldsFor(context, entityName, namespace);
    for (const field of EVENT_ENTITY_FIELDS) {
      if (Object.hasOwn(value, field)) masked[field] = maskEncryptedFields(value[field], encryptedFields);
    }
  }
  if (hasChanges) {
    masked['changes'] = changes.map(change => maskEmbeddedChangeValue(context, change, seen));
  }
  return masked;
}
