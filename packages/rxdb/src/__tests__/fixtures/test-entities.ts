/**
 * @fileoverview 测试实体定义
 *
 * 提供用于测试的标准实体：User, Post, Category
 * 覆盖基础 CRUD、关系、树形结构场景
 */

import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import { PropertyType, RelationKind } from '../../entity/metadata-options.interface.js';
import { TreeAdjacencyListEntityBase } from '../../entity/tree-entity-base.js';
import { TreeEntity } from '../../entity/tree-entity.decorator.js';

/**
 * 用户实体 - 简单实体，用于基础 CRUD 和版本控制测试
 */
@Entity({
  name: 'User',
  properties: [
    { name: 'name', type: PropertyType.string },
    { name: 'email', type: PropertyType.string, unique: true },
    { name: 'role', type: PropertyType.string, default: 'user' },
    { name: 'isActive', type: PropertyType.boolean, default: true }
  ]
})
export class User extends EntityBase {
  name!: string;
  email!: string;
  role!: string;
  isActive!: boolean;
}

/**
 * 帖子实体 - 与 User 一对多关系，用于测试关系同步和冲突
 */
@Entity({
  name: 'Post',
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'content', type: PropertyType.string },
    { name: 'published', type: PropertyType.boolean, default: false }
  ],
  relations: [
    {
      name: 'author',
      displayName: '作者',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'User',
      mappedProperty: 'posts'
    }
  ]
})
export class Post extends EntityBase {
  title!: string;
  content!: string;
  published!: boolean;
  author!: User;
  authorId!: string;
}

/**
 * 分类实体 - 树形结构，用于测试级联操作和分支管理
 */
@TreeEntity({
  name: 'Category',
  properties: [
    { name: 'name', type: PropertyType.string },
    { name: 'order', type: PropertyType.integer, default: 0 },
    { name: 'slug', type: PropertyType.string, unique: true }
  ]
})
export class Category extends TreeAdjacencyListEntityBase {
  name!: string;
  order!: number;
  slug!: string;
}

/**
 * 标签实体 - 简单实体，用于批量操作测试
 */
@Entity({
  name: 'Tag',
  properties: [
    { name: 'name', type: PropertyType.string, unique: true },
    { name: 'color', type: PropertyType.string, default: '#000000' }
  ]
})
export class Tag extends EntityBase {
  name!: string;
  color!: string;
}

/**
 * 所有测试实体列表
 */
export const TEST_ENTITIES = [User, Post, Category, Tag];
