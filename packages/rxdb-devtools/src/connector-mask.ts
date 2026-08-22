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

export function maskEmbeddedChangeValue(context: ConnectorMaskContext, value: unknown): unknown {
  if (Array.isArray(value)) return value.map(item => maskEmbeddedChangeValue(context, item));
  if (!isRecord(value) || value instanceof Date || value instanceof Uint8Array) return value;

  let masked = value;
  const entityName = typeof value['entity'] === 'string' ? value['entity'] : undefined;
  if (entityName) {
    const namespace = typeof value['namespace'] === 'string' ? value['namespace'] : undefined;
    const encryptedFields = encryptedFieldsFor(context, entityName, namespace);
    masked = { ...value };
    for (const field of EVENT_ENTITY_FIELDS) {
      if (Object.hasOwn(value, field)) masked[field] = maskEncryptedFields(value[field], encryptedFields);
    }
  }

  const changes = value['changes'];
  if (!Array.isArray(changes)) return masked;
  if (masked === value) masked = { ...value };
  masked['changes'] = changes.map(change => maskEmbeddedChangeValue(context, change));
  return masked;
}
