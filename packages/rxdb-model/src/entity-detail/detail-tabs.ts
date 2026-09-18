/**
 * Entity Detail 标签构建工具
 * 根据实体元数据生成详情页标签配置
 * @module entity-detail/detail-tabs
 */
import { RelationKind, type EntityMetadata } from '@aiao/rxdb';

import type { DetailFormTab, DetailTab, DetailTableTab } from './interfaces.js';

/**
 * 根据实体元数据构建详情页标签列表
 * @remarks 基本信息表单标签固定排在首位，其后为每个一对多 / 多对多关系生成一个表格标签
 * @param metadata - 实体元数据
 * @returns 详情页标签配置列表
 */
export function buildDetailTabs(metadata: EntityMetadata): DetailTab[] {
  const formTab: DetailFormTab = {
    key: 'basic',
    label: '基本信息',
    type: 'form'
  };

  const relationTabs: DetailTableTab[] = [];

  metadata.relationMap.forEach((relation, name) => {
    if (relation.kind !== RelationKind.ONE_TO_MANY && relation.kind !== RelationKind.MANY_TO_MANY) return;

    const tab: DetailTableTab = {
      key: name,
      label: relation.displayName ?? name,
      type: 'table',
      relationName: name,
      relatedEntityName: relation.mappedEntity,
      relatedNamespace: relation.mappedNamespace ?? 'public',
      relationKind: relation.kind
    };

    if (relation.kind === RelationKind.ONE_TO_MANY) {
      tab.foreignKeyField = `${relation.mappedProperty}Id`;
    } else if (relation.kind === RelationKind.MANY_TO_MANY) {
      tab.mappedProperty = relation.mappedProperty;
    }

    relationTabs.push(tab);
  });

  return [formTab, ...relationTabs];
}
