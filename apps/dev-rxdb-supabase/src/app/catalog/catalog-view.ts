/** 判断所在区要用到的商品字段。 */
export interface BucketedItem {
  readonly visibility: 'public' | 'tenant';
  readonly tenantId: string;
}

/** 一个区里的商品。 */
export interface BucketGroup<T> {
  readonly bucket: string;
  readonly label: string;
  readonly items: readonly T[];
}

interface NamedTenant {
  readonly id: string;
  readonly name: string;
}

const TENANT_PREFIX = 'tenant:';

/**
 * 商品所在的区，与服务端生成列 `rxdb_bucket` 同一口径（`docker/sql/03-business-tables.sql` 第 13 节）。
 *
 * @remarks
 * 本地表不存区：同步插件按区记进度与行的归属，界面按字段推出来只用于展示。
 */
export function bucketOf(item: BucketedItem): string {
  return item.visibility === 'public' ? 'public' : `${TENANT_PREFIX}${item.tenantId}`;
}

/** 区在界面上的名字。 */
export function bucketLabel(bucket: string, tenants: readonly NamedTenant[]): string {
  if (bucket === 'public') return '公开';
  if (bucket.startsWith('user:')) return '个人区';
  if (!bucket.startsWith(TENANT_PREFIX)) return bucket;
  const tenantId = bucket.slice(TENANT_PREFIX.length);
  return `租户 · ${tenants.find(tenant => tenant.id === tenantId)?.name ?? tenantId}`;
}

/** 按区分组：公开区在前，租户区按名字排，组内保持原顺序。 */
export function groupByBucket<T extends BucketedItem>(
  items: readonly T[],
  tenants: readonly NamedTenant[]
): BucketGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const bucket = bucketOf(item);
    groups.set(bucket, [...(groups.get(bucket) ?? []), item]);
  }
  return [...groups.entries()]
    .map(([bucket, grouped]) => ({ bucket, label: bucketLabel(bucket, tenants), items: grouped }))
    .sort((a, b) => sortKey(a.bucket, a.label).localeCompare(sortKey(b.bucket, b.label), 'zh'));
}

function sortKey(bucket: string, label: string): string {
  return bucket === 'public' ? '0' : `1${label}`;
}
