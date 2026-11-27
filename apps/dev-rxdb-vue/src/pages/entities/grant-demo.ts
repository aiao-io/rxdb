/**
 * @fileoverview 授权快照演示（US-029）：`TenantNote` 列表页上方演示面板用到的逻辑
 *
 * `TenantNote`（`@aiao/rxdb-test`）按 `tenant:` + `tenantId` 声明作用域，三个写操作都要 `edit`。
 * 没有远端时，授权快照只能由应用设入（`rxdb.grants.set()`）。面板给三个动作：
 * 用系统写落 a、b 两行（相当于同步从服务端拉下来的数据），设「a 可编辑、b 只读」，再收回 a 的 edit；
 * 列表随快照即时收紧或放开，不用刷新。
 *
 * 三端 demo 各一份、内容相同（与 `grant-demo.spec.ts` 一起改）；界面只是按钮与状态文字。
 */
import {
  getEntityAccessScope,
  getEntityMetadata,
  type EntityAccessScope,
  type EntityBase,
  type EntityType,
  type RxDB,
  type RxDBGrant,
  type RxDBGrantSnapshot
} from '@aiao/rxdb';
import type { EntitiesMessageKey } from '@modules/demo-i18n/entities';
import { firstValueFrom } from 'rxjs';

/** 演示实体的位置 */
const DEMO_ENTITY = { namespace: 'public', name: 'TenantNote' } as const;

/** 演示的两个作用域值：a 可编辑、b 只读 */
const DEMO_SCOPE_VALUES = ['a', 'b'] as const;

/** 演示面板操作的实体：类与它声明的作用域 */
export interface GrantDemoTarget {
  readonly entity: EntityType;
  readonly scope: EntityAccessScope;
}

/** 面板上的两组授权：`'a-editable'` 即「a 可编辑、b 只读」，`'a-revoked'` 即「收回 a 的 edit」 */
export type GrantPreset = 'a-editable' | 'a-revoked';

/** 面板上的快照状态：未取到或为空时给文案键，有作用域时给逐个列出的权限 */
export type GrantDemoStatus =
  | { readonly kind: 'message'; readonly key: EntitiesMessageKey }
  | { readonly kind: 'grants'; readonly text: string };

/**
 * 列表页是不是演示实体 `TenantNote`；是的话取实例注册的那个类与它声明的作用域
 *
 * @param entities - 实例注册的实体（`rxdb.config.entities`）
 * @param namespace - 列表页路由里的 namespace
 * @param name - 列表页路由里的实体名
 * @returns 是演示实体、且它声明了作用域时为演示目标；否则 `undefined`，页面不出面板
 */
export const findGrantDemoTarget = (
  entities: readonly EntityType[],
  namespace: string,
  name: string
): GrantDemoTarget | undefined => {
  if (namespace !== DEMO_ENTITY.namespace || name !== DEMO_ENTITY.name) return undefined;
  const entity = entities.find(cls => {
    const metadata = getEntityMetadata(cls);
    return metadata.namespace === namespace && metadata.name === name;
  });
  if (entity === undefined) return undefined;
  const scope = getEntityAccessScope(getEntityMetadata(entity));
  return scope === undefined ? undefined : { entity, scope };
};

/**
 * 一组演示授权
 *
 * @param preset - `'a-editable'`：a 有 read 与 edit、b 只有 read；`'a-revoked'`：两者都只有 read
 * @param scope - 实体声明的作用域（取其中的前缀拼作用域键）
 * @returns 交给 `rxdb.grants.set()` 的授权
 */
export const grantPreset = (preset: GrantPreset, { prefix }: EntityAccessScope): RxDBGrant[] => [
  { scope: `${prefix}a`, permissions: preset === 'a-editable' ? ['read', 'edit'] : ['read'] },
  { scope: `${prefix}b`, permissions: ['read'] }
];

/**
 * 经本地适配器落 a、b 各一行便签（标题 `a-note` / `b-note`）
 *
 * @param rxdb - 演示用的 RxDB 实例
 * @param target - 演示目标
 *
 * @remarks
 * 适配器的 `mutations()` 是系统写，不经公开写入口的权限判定——快照还没取到时也落得下去，
 * 与同步拉取写进本地库的数据走同一条路。
 */
export const seedScopedRows = async (rxdb: RxDB, { entity, scope }: GrantDemoTarget): Promise<void> => {
  const adapter = await firstValueFrom(rxdb.localAdapter$);
  const Row = entity as unknown as new (data: Record<string, unknown>) => EntityBase;
  const rows = DEMO_SCOPE_VALUES.map(value => new Row({ title: `${value}-note`, [scope.property]: value }));
  await adapter.mutations({
    create: new Map<EntityType, Set<EntityBase>>([[entity, new Set(rows)]]),
    update: new Map(),
    remove: new Map()
  });
};

/**
 * 面板上的快照状态
 *
 * @param snapshot - 当前授权快照（`rxdb.grants.snapshot`）
 * @returns 未取到、已取到但为空时为文案键；否则形如 `tenant:a: edit, read; tenant:b: read`
 */
export const describeSnapshot = (snapshot: RxDBGrantSnapshot): GrantDemoStatus => {
  if (snapshot.status === 'unknown') return { kind: 'message', key: 'page.entity.grantDemo.unknown' };
  if (snapshot.grants.length === 0) return { kind: 'message', key: 'page.entity.grantDemo.empty' };
  const text = snapshot.grants.map(grant => `${grant.scope}: ${grant.permissions.join(', ')}`).join('; ');
  return { kind: 'grants', text };
};
