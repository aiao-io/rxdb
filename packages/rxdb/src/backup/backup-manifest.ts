import { RxDBBackupError } from './backup-error.js';
import {
  RXDB_BACKUP_FORMAT,
  RXDB_BACKUP_FORMAT_VERSION,
  type RxDBBackupCompatibility,
  type RxDBBackupManifest
} from './backup.interface.js';

type Json = Record<string, unknown>;

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const HEX_64 = /^[0-9a-f]{64}$/;

const invalid = (field: string, actual?: unknown): RxDBBackupError =>
  new RxDBBackupError('incompatible_archive', `Backup manifest field "${field}" is missing or invalid`, {
    details: { field, actual }
  });

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const objectAt = (node: Json, key: string, field: string): Json => {
  const value = node[key];
  if (!isObject(value)) throw invalid(field, value);
  return value;
};

const stringAt = (node: Json, key: string, field: string, pattern?: RegExp): string => {
  const value = node[key];
  if (typeof value !== 'string' || value.length === 0) throw invalid(field, value);
  if (pattern && !pattern.test(value)) throw invalid(field, value);
  return value;
};

const integerAt = (node: Json, key: string, field: string): number => {
  const value = node[key];
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw invalid(field, value);
  return value as number;
};

const literalAt = <T>(node: Json, key: string, field: string, expected: T): T => {
  if (node[key] !== expected) throw invalid(field, node[key]);
  return expected;
};

const stringListAt = (node: Json, key: string, field: string): string[] => {
  const value = node[key];
  if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) throw invalid(field, value);
  return [...value];
};

const parseEncryption = (root: Json): RxDBBackupManifest['encryption'] => {
  if (!('encryption' in root)) throw invalid('encryption');
  if (root['encryption'] === null) return null;
  const encryption = objectAt(root, 'encryption', 'encryption');
  return { authDomain: stringAt(encryption, 'authDomain', 'encryption.authDomain') };
};

/**
 * 校验并规范化归档 manifest。
 *
 * @remarks
 * 逐字段检查类型与取值；任何缺失、多出语义或格式版本不认识都报 `incompatible_archive`，
 * `details.field` 用点路径指出第一个出问题的字段。返回值是新对象，不引用输入。
 *
 * @param value - `JSON.parse` 的结果
 * @returns 结构合格的 manifest
 * @throws RxDBBackupError `incompatible_archive`
 */
export const parseRxDBBackupManifest = (value: unknown): RxDBBackupManifest => {
  if (!isObject(value)) throw invalid('manifest', value);
  const format = literalAt(value, 'format', 'format', RXDB_BACKUP_FORMAT);
  const formatVersion = literalAt(value, 'formatVersion', 'formatVersion', RXDB_BACKUP_FORMAT_VERSION);
  const createdAt = stringAt(value, 'createdAt', 'createdAt', ISO_TIMESTAMP);
  const scope = objectAt(value, 'scope', 'scope');
  const adapter = objectAt(value, 'adapter', 'adapter');
  const rxdb = objectAt(value, 'rxdb', 'rxdb');
  return {
    format,
    formatVersion,
    createdAt,
    scope: {
      database: literalAt(scope, 'database', 'scope.database', 'included'),
      externalFiles: literalAt(scope, 'externalFiles', 'scope.externalFiles', 'excluded')
    },
    adapter: {
      name: stringAt(adapter, 'name', 'adapter.name'),
      engine: stringAt(adapter, 'engine', 'adapter.engine'),
      engineVersion: stringAt(adapter, 'engineVersion', 'adapter.engineVersion'),
      engineCompatibility: stringAt(adapter, 'engineCompatibility', 'adapter.engineCompatibility'),
      extensions: stringListAt(adapter, 'extensions', 'adapter.extensions'),
      storage: stringAt(adapter, 'storage', 'adapter.storage')
    },
    rxdb: {
      version: stringAt(rxdb, 'version', 'rxdb.version'),
      systemSchemaVersion: integerAt(rxdb, 'systemSchemaVersion', 'rxdb.systemSchemaVersion'),
      changeCodecVersion: integerAt(rxdb, 'changeCodecVersion', 'rxdb.changeCodecVersion')
    },
    schemaFingerprint: stringAt(value, 'schemaFingerprint', 'schemaFingerprint', HEX_64),
    encryption: parseEncryption(value)
  };
};

const mismatch = (field: string, expected: unknown, actual: unknown): RxDBBackupError =>
  new RxDBBackupError('incompatible_archive', `Backup archive is incompatible with the target: ${field} differs`, {
    details: { field, expected, actual }
  });

const assertEncryption = (manifest: RxDBBackupManifest, expected: RxDBBackupCompatibility): void => {
  const actual = manifest.encryption?.authDomain ?? null;
  if (actual === expected.authDomain) return;
  if (actual === null || expected.authDomain === null) throw mismatch('encryption', expected.authDomain, actual);
  throw new RxDBBackupError('auth_domain_mismatch', 'Encrypted backup belongs to a different authentication domain', {
    details: { field: 'encryption.authDomain', expected: expected.authDomain, actual }
  });
};

/**
 * 判定归档能否恢复到目标配置。
 *
 * @remarks
 * 相等性检查：adapter 名、引擎、引擎数据兼容键、系统表结构版本、变更编码版本、实体结构指纹。
 * 扩展只要求归档用到的全部由目标提供。RxDB 版本、引擎完整版本、源存储后端、创建时间只记录不比较。
 * 加密归档要求目标认证域完全相同（`auth_domain_mismatch`），一边加密一边不加密报 `incompatible_archive`。
 *
 * @param manifest - {@link parseRxDBBackupManifest} 的结果
 * @param expected - 目标侧期望
 * @throws RxDBBackupError `incompatible_archive` / `auth_domain_mismatch`
 */
export const assertRxDBBackupCompatible = (manifest: RxDBBackupManifest, expected: RxDBBackupCompatibility): void => {
  const pairs: ReadonlyArray<[string, unknown, unknown]> = [
    ['adapter.name', expected.adapterName, manifest.adapter.name],
    ['adapter.engine', expected.engine, manifest.adapter.engine],
    ['adapter.engineCompatibility', expected.engineCompatibility, manifest.adapter.engineCompatibility],
    ['rxdb.systemSchemaVersion', expected.systemSchemaVersion, manifest.rxdb.systemSchemaVersion],
    ['rxdb.changeCodecVersion', expected.changeCodecVersion, manifest.rxdb.changeCodecVersion],
    ['schemaFingerprint', expected.schemaFingerprint, manifest.schemaFingerprint]
  ];
  for (const [field, want, got] of pairs) {
    if (want !== got) throw mismatch(field, want, got);
  }
  const missing = manifest.adapter.extensions.filter(name => !expected.extensions.includes(name));
  if (missing.length > 0) throw mismatch('adapter.extensions', expected.extensions, manifest.adapter.extensions);
  assertEncryption(manifest, expected);
};
