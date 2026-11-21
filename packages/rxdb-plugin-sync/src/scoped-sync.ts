import { type RuleGroup } from '@aiao/rxdb';

export interface ScopedSyncAdapter {
  getCallerBuckets(): Promise<string[]>;
  getEntitySyncInfo(namespace: string, entity: string): Promise<{
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

export function filterFingerprint(filter: RuleGroup | undefined): string {
  return filter ? `v1-${fnv1a64(canonicalize(filter))}` : 'all';
}

export function canonicalize(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(item => canonicalize(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
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
