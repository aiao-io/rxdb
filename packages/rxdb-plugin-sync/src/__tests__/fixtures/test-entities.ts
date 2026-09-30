/**
 * @fileoverview 测试实体定义
 *
 * 提供用于测试的标准实体：User, Post, Category, Tag
 * 覆盖基础 CRUD 与关系场景
 *
 * 本包与其他插件包里的这份副本逐字相同，这是**有意**的重复，不要往 `@aiao/rxdb-test` 收敛——
 * 理由见该包 README 的「什么不搬进来」。
 */

import { Entity, EntityBase, PropertyType, RelationKind } from '@aiao/rxdb';

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
 * 分类实体 - 带排序字段的普通实体，用于测试分支管理下的批量写入
 *
 * @remarks
 * 曾经是树实体，但树形对本包的用例不承载任何语义（没有一个 spec 查过祖先/后代），
 * 留着只会让 history/sync 平白多一条指向 `@aiao/rxdb-plugin-tree` 的依赖边。
 */
@Entity({
  name: 'Category',
  properties: [
    { name: 'name', type: PropertyType.string },
    { name: 'order', type: PropertyType.integer, default: 0 },
    { name: 'slug', type: PropertyType.string, unique: true }
  ]
})
export class Category extends EntityBase {
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
