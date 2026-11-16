import { getEntityMetadata, type EntityMetadata } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { domainModelEnMessages, domainModelZhMessages } from '../i18n/domain-messages';
import { ENTITIES } from './asset-entities';
import { entityDisplayName, fieldDisplayName } from './entity-labels';
import { WORKBENCH_NAMESPACES } from './entity-registry';

/**
 * 实体显示名目录的完整性门禁。
 *
 * `entity-labels` 在目录缺键时按设计回退到元数据声明名，漏键不会报错，只会让某个语言下露出声明名；
 * 这里逐键核对，给每个可见实体补齐目录前不放行。
 *
 * 口径与 rxdb-model 的 `localizeEntityMetadata` 读取的键一致：
 * - 实体：`entity.<namespace>.<name>.displayName`
 * - 属性与计算属性：`entity.<namespace>.<name>.property.<field>`
 * - 关系：`entity.<namespace>.<name>.relation.<relation>`（外键列 `xxxId` 也取对应关系的键）
 *
 * 系统字段（id / createdAt / updatedAt / createdBy / updatedBy）由 rxdb-model 内置的通用词条提供标签，
 * 不属于业务目录，不在核对范围内。
 */
const SYSTEM_PROPERTIES: ReadonlySet<string> = new Set(['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy']);

function requiredKeys(metadata: EntityMetadata): string[] {
  const prefix = `entity.${metadata.namespace}.${metadata.name}`;
  const properties = [...metadata.propertyMap.keys(), ...metadata.computedPropertyMap.keys()].filter(
    name => !SYSTEM_PROPERTIES.has(name)
  );
  return [
    `${prefix}.displayName`,
    ...properties.map(name => `${prefix}.property.${name}`),
    ...[...metadata.relationMap.keys()].map(name => `${prefix}.relation.${name}`)
  ];
}

const visibleMetadata = ENTITIES.map(entity => getEntityMetadata(entity)).filter(metadata =>
  WORKBENCH_NAMESPACES.includes(metadata.namespace)
);

describe('实体显示名目录', () => {
  it('可见实体不为空，门禁不会空转', () => {
    expect(visibleMetadata.length).toBeGreaterThan(0);
  });

  it.each([
    ['中文', domainModelZhMessages],
    ['英文', domainModelEnMessages]
  ])('%s目录覆盖每个可见实体的显示名、属性与关系', (_language, catalog) => {
    const keys = new Set(Object.keys(catalog));
    const missing = visibleMetadata.flatMap(metadata => requiredKeys(metadata).filter(key => !keys.has(key)));
    expect(missing).toEqual([]);
  });

  it('目录之外的业务实体与字段继续使用其声明名称', () => {
    const entry = { namespace: 'secret', name: 'HiddenThing', displayName: '隐藏实体' };
    expect(entityDisplayName(entry)).toBe('隐藏实体');
    expect(fieldDisplayName(entry, 'title')).toBe('title');
  });
});
