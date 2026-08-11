import type { EntityMetadata, EntityPropertyMetadata, RxDBEntityId } from '@aiao/rxdb';

import type { Keyring } from './keyring.js';
import { deserializeFromEnvelope, serializeForEnvelope } from './serialize.js';

/** undo/redo change patch 加解密所需的实体身份、主键和 keyring。 */
export interface PatchWalkArgs {
  entity: EntityMetadata;
  primaryKeyString: RxDBEntityId;
  patch: Record<string, unknown>;
  keyring: Keyring;
}

const getEncProperty = (entity: EntityMetadata, propertyName: string): EntityPropertyMetadata | undefined => {
  const map = entity.encryptedPropertyMap as ReadonlyMap<string, EntityPropertyMetadata> | undefined;
  return map?.get(propertyName);
};

/**
 * 遍历明文补丁的顶层键；对于 `entity.encryptedPropertyMap` 中存在的键，
 * 将值替换为 `keyring.encrypt` 生成的信封字符串。未加密的键直接复制。
 */
export const envelopePlaintextPatches = async (args: PatchWalkArgs): Promise<Record<string, unknown>> => {
  const { entity, primaryKeyString, patch, keyring } = args;
  const map = entity.encryptedPropertyMap as ReadonlyMap<string, EntityPropertyMetadata> | undefined;
  if (!map || map.size === 0) return patch;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    const prop = getEncProperty(entity, key);
    if (prop == null || value == null) {
      out[key] = value;
      continue;
    }
    const envelope = await keyring.encrypt({
      plaintext: serializeForEnvelope(value, prop),
      entityNamespace: entity.namespace,
      tableName: entity.tableName,
      columnName: prop.columnName,
      primaryKey: primaryKeyString
    });
    out[key] = envelope;
  }
  return out;
};

/**
 * `envelopePlaintextPatches` 的逆操作：将顶层信封字符串解密回明文。
 * 应用于 undo/redo 的 `inversePatch` 时使用。
 */
export const unenvelopePlaintextPatches = async (args: PatchWalkArgs): Promise<Record<string, unknown>> => {
  const { entity, primaryKeyString, patch, keyring } = args;
  const map = entity.encryptedPropertyMap as ReadonlyMap<string, EntityPropertyMetadata> | undefined;
  if (!map || map.size === 0) return patch;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    const prop = getEncProperty(entity, key);
    if (prop == null || typeof value !== 'string') {
      out[key] = value;
      continue;
    }
    const plainBytes = await keyring.decrypt({
      envelope: value,
      entityNamespace: entity.namespace,
      tableName: entity.tableName,
      columnName: prop.columnName,
      primaryKey: primaryKeyString
    });
    out[key] = deserializeFromEnvelope(plainBytes, prop);
  }
  return out;
};
