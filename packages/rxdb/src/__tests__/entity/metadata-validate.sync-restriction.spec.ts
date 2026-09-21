/**
 * 仓储级同步策略限制的校验缝（US-025 阶段 E）。
 *
 * 阶段 E 之前这条规则叫 `unsupportedTreeQueryCache`，规则体里硬编码着
 * `metadata.repository !== 'TreeRepository'` —— 核心不仅认识树，还替树解释
 * 「为什么 QueryCache 不行」。树外移成插件之后这段代码没有归处：留在核心就是
 * 阶段 E 要清的残留，搬进插件又接不上（`MetadataValidationRule` 是闭合联合别名，
 * TS 无法用 `declare module` 扩，校验函数也是不带注册表的纯函数）。
 *
 * 所以把它翻成通用形式：**仓储自己声明它撑不住哪些同步策略、以及为什么**，
 * 核心只负责把声明翻成违规条目。核心从此不知道 'TreeRepository' 是什么。
 */
import { describe, expect, it } from 'vitest';
import { type SyncOptions, SyncType } from '../../entity/metadata-options.interface.js';
import {
  type SyncTypeRestrictionLookup,
  validateEntityMetadata,
  validateEntityMetadataSet
} from '../../entity/metadata-validate.js';
import type { EntityMetadata } from '../../entity/metadata.interface.js';

const makeMeta = (overrides: Partial<EntityMetadata> = {}): EntityMetadata =>
  ({
    name: 'Test',
    namespace: 'public',
    displayName: 'Test',
    tableName: 'test',
    repository: 'Repository',
    extends: [],
    properties: [],
    computedProperties: [],
    relations: [],
    indexes: [],
    propertyMap: new Map(),
    computedPropertyMap: new Map(),
    relationMap: new Map(),
    ...overrides
  }) as EntityMetadata;

const queryCacheMeta = (repository: string): EntityMetadata =>
  makeMeta({
    repository,
    sync: { type: SyncType.QueryCache, local: { adapter: 'wa-sqlite' }, remote: { adapter: 'http' } }
  });

/** 库级 sync：两侧适配器齐备，好让 `missingQueryCacheAdapter` 不掺进断言。 */
const DATABASE_QUERY_CACHE: SyncOptions = {
  type: SyncType.QueryCache,
  local: { adapter: 'wa-sqlite' },
  remote: { adapter: 'http' }
};

/** 替身仓储：声明自己撑不住 QueryCache，理由与树给的那套逐字同形。 */
const REASON = '树查询依赖本地完整的祖先链，而缓存只覆盖查过的 where 命中的行，递归会在缺口处静默截断。';

const lookup: SyncTypeRestrictionLookup = (repository, type) =>
  repository === 'TreeRepository' && type === SyncType.QueryCache ? REASON : undefined;

describe('US-025 E：仓储声明的同步策略限制', () => {
  it('仓储声明了限制时报违规，消息带上仓储名、策略名与仓储自己给的理由', () => {
    const errors = validateEntityMetadata(queryCacheMeta('TreeRepository'), DATABASE_QUERY_CACHE, lookup);

    expect(errors.map(error => error.rule)).toEqual(['unsupportedRepositorySyncType']);
    expect(errors[0].field).toBe('sync');
    expect(errors[0].message).toContain('TreeRepository');
    expect(errors[0].message).toContain('SyncType.QueryCache');
    expect(errors[0].message).toContain(REASON);
  });

  it('不传 lookup 时核心不认识任何仓储限制——树能力没装就没有这条规则', () => {
    expect(validateEntityMetadata(queryCacheMeta('TreeRepository'), DATABASE_QUERY_CACHE)).toEqual([]);
  });

  it('仓储没声明限制的策略一律放行', () => {
    const metadata = makeMeta({
      repository: 'TreeRepository',
      sync: { type: SyncType.Full, local: { adapter: 'wa-sqlite' }, remote: { adapter: 'http' } }
    });

    expect(validateEntityMetadata(metadata, DATABASE_QUERY_CACHE, lookup)).toEqual([]);
  });

  it('库级 sync 生效时同样走仓储限制判定', () => {
    const metadata = makeMeta({ repository: 'TreeRepository' });

    const errors = validateEntityMetadata(metadata, DATABASE_QUERY_CACHE, lookup);

    expect(errors.map(error => error.rule)).toEqual(['unsupportedRepositorySyncType']);
  });

  it('聚合入口把 lookup 透到每个实体上', () => {
    const errors = validateEntityMetadataSet(
      [queryCacheMeta('Repository'), queryCacheMeta('TreeRepository')],
      DATABASE_QUERY_CACHE,
      lookup
    );

    expect(errors.map(error => error.rule)).toEqual(['unsupportedRepositorySyncType']);
  });

  it('与「缓存适配器缺席」是两条独立规则，可同时成立并稳定排序', () => {
    // `missingQueryCacheAdapter` 判的就是「配置少了一侧适配器」这种类型上拼不出来的坏配置，
    // 所以这里必须绕过类型断言造一个缺 `remote` 的 sync。
    const halfConfigured = { type: SyncType.QueryCache, local: { adapter: 'wa-sqlite' } } as SyncOptions;
    const metadata = makeMeta({ repository: 'TreeRepository', sync: halfConfigured });

    const errors = validateEntityMetadata(metadata, halfConfigured, lookup);

    expect(errors.map(error => error.rule)).toEqual(['missingQueryCacheAdapter', 'unsupportedRepositorySyncType']);
  });
});
