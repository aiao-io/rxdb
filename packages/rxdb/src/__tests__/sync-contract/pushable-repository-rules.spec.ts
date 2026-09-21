/**
 * @fileoverview 可推送 / 待重放仓库的 OR 组构造（`sync-contract/pushable-repository-rules.ts`）
 *
 * @remarks
 * 这两个构造器是 changelog 推送与 QueryCache 出站重放**共用**的仓库筛选口径，
 * 而它们必须**互补且不重叠**——`undo-redo-apply` 与 `query-cache-outbox` 把两侧的
 * 计数直接相加，重叠一行就等于把同一条变更算两遍。
 *
 * 因此本文件按三个不变式组织：
 * 1. 仓库集合的真源是 `config.entities × syncType`，不是「已有 RxDBSync 记录的仓库」；
 * 2. `enabled = false` 一票否决，没有记录 ⇒ 不设上界；
 * 3. `push` 与 `offlineWrite && !push` 两组的结果永不相交。
 */

import { describe, expect, it } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import type { EntityType } from '../../entity/entity.interface.js';
import { type SyncOptions, SyncType } from '../../entity/sync-options.interface.js';
import {
  buildOfflineWriteRepositoryRules,
  buildPushableRepositoryRules
} from '../../sync-contract/pushable-repository-rules.js';
import type { RepositorySyncType } from '../../sync-contract/sync-type-utils.js';
import type { RxDBSync } from '../../system/sync.js';

const LOCAL = { adapter: 'sqlite' };
const REMOTE = { adapter: 'supabase' };
/** `SyncType.Filter` 的远端适配器必须带过滤器，否则「按条件同步」无从谈起 */
const FILTER_REMOTE = { adapter: 'supabase', filter: () => ({ combinator: 'and' as const, rules: [] }) };

/** 能稳定推出目标 syncType 的最小 sync 配置（口径见 `getSyncType`），与 sync-eligibility.spec 同源 */
const SYNC_CONFIG: Readonly<Record<RepositorySyncType, SyncOptions>> = {
  full: { type: SyncType.Full, local: LOCAL, remote: REMOTE },
  filter: { type: SyncType.Filter, local: LOCAL, remote: FILTER_REMOTE },
  querycache: { type: SyncType.QueryCache, local: LOCAL, remote: REMOTE },
  remote: { type: SyncType.None, remote: REMOTE },
  local: { type: SyncType.None, local: LOCAL },
  none: { type: SyncType.None, local: LOCAL, remote: REMOTE }
};

/**
 * 造一个只有 sync 配置有意义的实体类。
 *
 * @param name - 实体名，同时进规则的 `entity` 字段
 * @param syncType - 想要的同步类型；`undefined` 表示不写实体级 sync，走全局回退
 */
const entityWith = (name: string, syncType?: RepositorySyncType): EntityType => {
  @Entity({ name, properties: [], sync: syncType ? SYNC_CONFIG[syncType] : undefined })
  class Fixture extends EntityBase {}
  return Fixture as unknown as EntityType;
};

/** 只有 `buildRepositoryRules` 读到的那四个字段是真的，其余不参与判定 */
const syncRecord = (entity: string, patch: Partial<RxDBSync> = {}): RxDBSync =>
  ({ namespace: 'public', entity, enabled: true, lastPushedChangeId: null, ...patch }) as RxDBSync;

/** 规则组里那条 `id > watermark`；没有上界时为 `undefined` */
const watermarkRuleOf = (group: unknown) =>
  (group as { rules: { field: string; operator: string; value: unknown }[] }).rules.find(rule => rule.field === 'id');

/** 规则组覆盖的仓库，形如 `public:Todo` */
const repositoryOf = (group: unknown) => {
  const { rules } = group as { rules: { field: string; value: unknown }[] };
  const pick = (field: string) => rules.find(rule => rule.field === field)?.value;
  return `${pick('namespace')}:${pick('entity')}`;
};

describe('buildPushableRepositoryRules', () => {
  it('按 syncType 的 push 能力筛仓库，与有没有同步记录无关', () => {
    const entities = [
      entityWith('Todo', 'full'),
      entityWith('Order', 'filter'),
      entityWith('Cache', 'querycache'),
      entityWith('Feed', 'remote'),
      entityWith('Draft', 'local'),
      entityWith('SystemTable', 'none')
    ];

    const rules = buildPushableRepositoryRules(entities, SYNC_CONFIG.full, []);

    // 一条同步记录都没有，可推送仓库照样是 full + filter 两个：真源是 entities，不是记录表
    expect(rules.map(repositoryOf)).toEqual(['public:Todo', 'public:Order']);
  });

  it('实体没写 sync 时回退到全局配置', () => {
    const rules = buildPushableRepositoryRules([entityWith('Inherited')], SYNC_CONFIG.full, []);

    expect(rules.map(repositoryOf)).toEqual(['public:Inherited']);
  });

  it('没有仓库可推送时返回空数组，而不是一个空 OR 组', () => {
    const entities = [entityWith('Draft', 'local'), entityWith('Feed', 'remote')];

    expect(buildPushableRepositoryRules(entities, SYNC_CONFIG.local, [])).toEqual([]);
  });

  it('enabled = false 一票否决：有能力也不进 OR 组', () => {
    const entities = [entityWith('Todo', 'full'), entityWith('Order', 'full')];
    const repoSyncs = [syncRecord('Todo', { enabled: false }), syncRecord('Order')];

    const rules = buildPushableRepositoryRules(entities, SYNC_CONFIG.full, repoSyncs);

    expect(rules.map(repositoryOf)).toEqual(['public:Order']);
  });

  it('没有同步记录 ⇒ 一次都没推过 ⇒ 不设上界', () => {
    const [group] = buildPushableRepositoryRules([entityWith('Todo', 'full')], SYNC_CONFIG.full, []);

    expect(watermarkRuleOf(group)).toBeUndefined();
  });

  it('有记录但水位线为 null ⇒ 同样不设上界', () => {
    const rules = buildPushableRepositoryRules([entityWith('Todo', 'full')], SYNC_CONFIG.full, [
      syncRecord('Todo', { lastPushedChangeId: null })
    ]);

    expect(watermarkRuleOf(rules[0])).toBeUndefined();
  });

  it('水位线为 0 时仍要设上界：0 是合法 changeId，不能被当成「没推过」', () => {
    const rules = buildPushableRepositoryRules([entityWith('Todo', 'full')], SYNC_CONFIG.full, [
      syncRecord('Todo', { lastPushedChangeId: 0 })
    ]);

    expect(watermarkRuleOf(rules[0])).toEqual({ field: 'id', operator: '>', value: 0 });
  });

  it('记录按 namespace:entity 配对，同名不同 namespace 的记录不串味', () => {
    const rules = buildPushableRepositoryRules([entityWith('Todo', 'full')], SYNC_CONFIG.full, [
      syncRecord('Todo', { namespace: 'other', lastPushedChangeId: 42 })
    ]);

    // 记录落在 other:Todo 上，public:Todo 取不到它 ⇒ 无上界
    expect(watermarkRuleOf(rules[0])).toBeUndefined();
  });
});

describe('buildOfflineWriteRepositoryRules', () => {
  it('只收 offlineWrite && !push 的仓库：现阶段只有 querycache', () => {
    const entities = [
      entityWith('Todo', 'full'),
      entityWith('Order', 'filter'),
      entityWith('Cache', 'querycache'),
      entityWith('Feed', 'remote'),
      entityWith('Draft', 'local')
    ];

    const rules = buildOfflineWriteRepositoryRules(entities, SYNC_CONFIG.querycache, []);

    expect(rules.map(repositoryOf)).toEqual(['public:Cache']);
  });

  it('与 push 组永不重叠：两侧相加不会重复计算同一行', () => {
    const entities = [
      entityWith('Todo', 'full'),
      entityWith('Order', 'filter'),
      entityWith('Cache', 'querycache'),
      entityWith('Feed', 'remote'),
      entityWith('Draft', 'local'),
      entityWith('SystemTable', 'none')
    ];

    const pushable = buildPushableRepositoryRules(entities, SYNC_CONFIG.full, []).map(repositoryOf);
    const offline = buildOfflineWriteRepositoryRules(entities, SYNC_CONFIG.full, []).map(repositoryOf);

    expect(pushable.filter(repository => offline.includes(repository))).toEqual([]);
  });

  it('形状与 push 组完全一致：enabled 否决与水位线上界都照旧', () => {
    const entities = [entityWith('Cache', 'querycache'), entityWith('Other', 'querycache')];
    const repoSyncs = [syncRecord('Cache', { lastPushedChangeId: 7 }), syncRecord('Other', { enabled: false })];

    const rules = buildOfflineWriteRepositoryRules(entities, SYNC_CONFIG.querycache, repoSyncs);

    expect(rules.map(repositoryOf)).toEqual(['public:Cache']);
    expect(watermarkRuleOf(rules[0])).toEqual({ field: 'id', operator: '>', value: 7 });
  });
});
