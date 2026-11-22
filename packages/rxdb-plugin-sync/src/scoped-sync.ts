import {
  getRxDBIdentityDatabaseName,
  getRxDBIdentityKey,
  RXDB_ANONYMOUS_SUBJECT,
  RxDBError,
  type RuleGroup,
  type RxDBIdentity
} from '@aiao/rxdb';

export type ScopedSyncIdentity = RxDBIdentity;

export interface ScopedSyncIdentitySource {
  syncIdentity(): Promise<ScopedSyncIdentity>;
}

export interface ScopedSyncAdapter {
  getCallerBuckets(): Promise<string[]>;
  getEntitySyncInfo(
    namespace: string,
    entity: string
  ): Promise<{
    namespace: string;
    entity: string;
    tableName: string | null;
    bucketed: boolean;
  }>;
  getBucketSnapshotPoint(namespace: string, entity: string, bucket: string): Promise<number>;
  pullBucketSnapshot(
    namespace: string,
    entity: string,
    bucket: string,
    filter: RuleGroup | undefined,
    offset: number,
    limit: number
  ): Promise<Record<string, unknown>[]>;
  pullBucketChanges(
    sinceId: number,
    limit: number,
    namespace: string,
    entity: string,
    bucket: string,
    filter?: RuleGroup,
    branchId?: string
  ): Promise<import('@aiao/rxdb').RemoteChange[]>;
}

export type ScopedIdentityKind = 'anon' | 'user';

export function scopedIdentityKind(identity: ScopedSyncIdentity): ScopedIdentityKind {
  return identity.subject === RXDB_ANONYMOUS_SUBJECT ? 'anon' : 'user';
}

export class IdentityMismatchError extends RxDBError {
  constructor(
    readonly boundIdentityKind: ScopedIdentityKind,
    readonly currentIdentityKind: ScopedIdentityKind,
    readonly boundFingerprint: string,
    readonly currentFingerprint: string
  ) {
    super(
      `Local database is bound to ${boundIdentityKind} identity ${boundFingerprint}, ` +
        `but the current Supabase session is ${currentIdentityKind} identity ${currentFingerprint}. ` +
        'Use a database created for the current identity before synchronizing.'
    );
    this.name = 'IdentityMismatchError';
    Object.setPrototypeOf(this, IdentityMismatchError.prototype);
  }
}

export function identityFingerprint(identity: ScopedSyncIdentity): string {
  return getRxDBIdentityKey(identity);
}

export function scopedDatabaseName(baseName: string, identity: ScopedSyncIdentity): string {
  const normalized = baseName.trim();
  if (normalized.length === 0) throw new RxDBError('A non-empty base database name is required.');
  return getRxDBIdentityDatabaseName(normalized, identity);
}

export function filterFingerprint(filter: RuleGroup | undefined): string {
  return filter ? `v1-${fnv1a64(canonicalize(filter))}` : 'all';
}

export function canonicalize(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(item => canonicalize(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right)
    );
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function fnv1a64(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const character of value) {
    hash ^= BigInt(character.codePointAt(0) ?? 0);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}
