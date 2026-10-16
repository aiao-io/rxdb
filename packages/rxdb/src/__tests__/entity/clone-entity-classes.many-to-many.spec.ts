/**
 * @fileoverview 克隆的实体类注册到第二个实例，不能改写原实例的多对多中间表。
 *
 * @remarks
 * `SchemaManager.init()` 把生成的中间表实体类直接赋到关系对象上（`relation.junctionEntityType = …`）。
 * 克隆体的元数据以源元数据为原型，关系表与关系对象若沿原型链共享，第二个实例一初始化，
 * 原实例的多对多就指向第二个实例的中间表类——查询、依赖图从此读的都是别的实例的那一份。
 * 同一页面开第二个实例（只读检出位的快照库、失败现场的导入库）都会撞上。
 */

import { afterEach, describe, expect, it } from 'vitest';
import { cloneEntityClasses } from '../../entity/clone-entity-classes.js';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import type { EntityType } from '../../entity/entity.interface.js';
import {
  RelationKind,
  SyncType,
  type EntityRelationManyToManyMetadata
} from '../../entity/metadata-options.interface.js';
import { getEntityMetadata } from '../../rxdb-utils.js';
import { RxDB } from '../../RxDB.js';

@Entity({
  name: 'CloneM2MArticle',
  relations: [
    { name: 'tags', kind: RelationKind.MANY_TO_MANY, mappedEntity: 'CloneM2MTag', mappedProperty: 'articles' }
  ]
})
class CloneM2MArticle extends EntityBase {}

@Entity({
  name: 'CloneM2MTag',
  relations: [
    { name: 'articles', kind: RelationKind.MANY_TO_MANY, mappedEntity: 'CloneM2MArticle', mappedProperty: 'tags' }
  ]
})
class CloneM2MTag extends EntityBase {}

const databases: RxDB[] = [];

const initDatabase = (dbName: string, entities: EntityType[]): RxDB => {
  const database = new RxDB({ dbName, entities, sync: { local: { adapter: 'clone-m2m' }, type: SyncType.None } });
  databases.push(database);
  database.init();
  database.schemaManager.init();
  return database;
};

const junctionOf = (EntityClass: EntityType, relationName: string): EntityType | undefined =>
  (getEntityMetadata(EntityClass).relationMap.get(relationName) as EntityRelationManyToManyMetadata).junctionEntityType;

afterEach(async () => {
  await Promise.all(databases.splice(0).map(database => database.disconnectAll()));
});

describe('SchemaManager.generatedEntities（US-313）', () => {
  it('列出本实例生成的多对多中间表类，不含声明的实体与系统表；重复 init 不重复', () => {
    const database = initDatabase('clone-m2m-generated', [CloneM2MArticle, CloneM2MTag]);
    database.schemaManager.init();

    const generated = database.schemaManager.generatedEntities;
    expect(generated).toEqual([junctionOf(CloneM2MArticle, 'tags')]);
    expect(generated).not.toContain(CloneM2MArticle);
    expect(generated.some(EntityClass => database.systemEntities.includes(EntityClass))).toBe(false);
  });
});

describe('cloneEntityClasses 的 log 选项（US-313）', () => {
  it('{ log: false } 的克隆体不写变更日志，源类不受影响', () => {
    const [ArticleClone] = cloneEntityClasses([CloneM2MArticle], { log: false });

    expect(getEntityMetadata(ArticleClone).log).toBe(false);
    expect(getEntityMetadata(CloneM2MArticle).log).not.toBe(false);
  });

  it('两端都不写变更日志时，生成的中间表也不写；源实例的中间表照旧', () => {
    initDatabase('clone-m2m-log-main', [CloneM2MArticle, CloneM2MTag]);
    const [ArticleClone, TagClone] = cloneEntityClasses([CloneM2MArticle, CloneM2MTag], { log: false });
    initDatabase('clone-m2m-log-second', [ArticleClone, TagClone]);

    expect(getEntityMetadata(junctionOf(ArticleClone, 'tags')!).log).toBe(false);
    expect(getEntityMetadata(junctionOf(CloneM2MArticle, 'tags')!).log).not.toBe(false);
  });
});

describe('cloneEntityClasses × 多对多', () => {
  it('第二个实例用克隆体初始化后，原实例两端的中间表实体类都不变', () => {
    initDatabase('clone-m2m-main', [CloneM2MArticle, CloneM2MTag]);
    const articleJunction = junctionOf(CloneM2MArticle, 'tags');
    const tagJunction = junctionOf(CloneM2MTag, 'articles');
    expect(articleJunction).toBeDefined();

    const [ArticleClone, TagClone] = cloneEntityClasses([CloneM2MArticle, CloneM2MTag]);
    initDatabase('clone-m2m-second', [ArticleClone, TagClone]);

    expect(junctionOf(CloneM2MArticle, 'tags')).toBe(articleJunction);
    expect(junctionOf(CloneM2MTag, 'articles')).toBe(tagJunction);
    // 第二个实例拿到的是它自己的中间表类
    expect(junctionOf(ArticleClone, 'tags')).toBeDefined();
    expect(junctionOf(ArticleClone, 'tags')).not.toBe(articleJunction);
  });
});
