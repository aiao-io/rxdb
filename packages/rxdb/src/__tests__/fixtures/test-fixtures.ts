/**
 * @fileoverview 测试 Fixture 工厂
 *
 * 提供创建测试数据的工厂函数，确保测试数据一致性
 */

import { UUID } from '../../entity/entity.interface.js';
import { uuid } from '../../rxdb-utils.js';
import type { Category, Post, Tag, User } from './test-entities.js';

/**
 * 用户 Fixture 工厂
 */
export const UserFixture = {
  /**
   * 创建单个用户
   */
  create: (overrides?: Partial<User>): User =>
    ({
      id: uuid(),
      name: 'Test User',
      email: `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      role: 'user',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: '',
      updatedBy: '',
      ...overrides
    }) as User,

  /**
   * 批量创建用户
   */
  createBatch: (count: number, baseOverrides?: Partial<User>): User[] =>
    Array.from({ length: count }, (_, i) =>
      UserFixture.create({
        name: `User ${i + 1}`,
        email: `user${i + 1}-${Date.now()}@example.com`,
        ...baseOverrides
      })
    ),

  /**
   * 创建管理员用户
   */
  createAdmin: (overrides?: Partial<User>): User =>
    UserFixture.create({
      name: 'Admin User',
      role: 'admin',
      ...overrides
    })
};

/**
 * 帖子 Fixture 工厂
 */
export const PostFixture = {
  /**
   * 创建单个帖子
   */
  create: (authorId: string, overrides?: Partial<Post>): Post =>
    ({
      id: uuid(),
      title: 'Test Post',
      content: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
      published: false,
      authorId,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: '',
      updatedBy: '',
      ...overrides
    }) as unknown as Post,

  /**
   * 批量创建帖子
   */
  createBatch: (authorId: string, count: number, baseOverrides?: Partial<Post>): Post[] =>
    Array.from({ length: count }, (_, i) =>
      PostFixture.create(authorId, {
        title: `Post ${i + 1}`,
        content: `Content for post ${i + 1}`,
        ...baseOverrides
      })
    ),

  /**
   * 创建已发布帖子
   */
  createPublished: (authorId: string, overrides?: Partial<Post>): Post =>
    PostFixture.create(authorId, {
      published: true,
      ...overrides
    })
};

/**
 * 分类 Fixture 工厂
 */
export const CategoryFixture = {
  /**
   * 创建单个分类
   */
  create: (overrides?: Partial<Category> & { parentId?: string | null }): Category =>
    ({
      id: uuid(),
      name: 'Test Category',
      order: 0,
      slug: `category-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      parentId: overrides?.parentId ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: '',
      updatedBy: '',
      ...overrides
    }) as Category,

  /**
   * 创建树形分类结构
   * @param depth 树的深度
   * @returns 按层级顺序排列的分类数组（根在前）
   */
  createTree: (depth: number = 3): Category[] => {
    const categories: Category[] = [];
    let parentId: UUID | null = null;

    for (let i = 0; i < depth; i++) {
      const cat = CategoryFixture.create({
        name: `Category L${i}`,
        order: i,
        slug: `category-l${i}-${Date.now()}`,
        parentId
      });
      categories.push(cat);
      parentId = cat.id;
    }

    return categories;
  },

  /**
   * 创建具有多个子节点的树形结构
   * @param width 每层的子节点数
   * @param depth 树的深度
   */
  createWideTree: (width: number = 3, depth: number = 2): Category[] => {
    const categories: Category[] = [];
    const root = CategoryFixture.create({
      name: 'Root',
      order: 0,
      slug: `root-${Date.now()}`
    });
    categories.push(root);

    const createChildren = (parent: Category, currentDepth: number): void => {
      if (currentDepth >= depth) return;

      for (let i = 0; i < width; i++) {
        const child = CategoryFixture.create({
          name: `${parent.name} > Child ${i + 1}`,
          order: i,
          slug: `${parent.slug}-child${i + 1}`,
          parentId: parent.id
        });
        categories.push(child);
        createChildren(child, currentDepth + 1);
      }
    };

    createChildren(root, 0);
    return categories;
  }
};

/**
 * 标签 Fixture 工厂
 */
export const TagFixture = {
  /**
   * 创建单个标签
   */
  create: (overrides?: Partial<Tag>): Tag =>
    ({
      id: uuid(),
      name: `tag-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      color: '#000000',
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: '',
      updatedBy: '',
      ...overrides
    }) as Tag,

  /**
   * 批量创建标签
   */
  createBatch: (count: number, colors?: string[]): Tag[] =>
    Array.from({ length: count }, (_, i) =>
      TagFixture.create({
        name: `Tag ${i + 1}`,
        color:
          colors?.[i % (colors?.length ?? 1)] ??
          `#${Math.floor(Math.random() * 16777215)
            .toString(16)
            .padStart(6, '0')}`
      })
    )
};

/**
 * 同步场景 Fixture
 */
export const SyncScenarioFixture = {
  /**
   * 创建冲突场景
   */
  createConflict: () => ({
    local: {
      entityId: uuid(),
      field: 'name',
      value: 'Alice (Local)',
      changeId: 100,
      timestamp: new Date('2025-01-01T10:00:00Z')
    },
    remote: {
      entityId: uuid(),
      field: 'name',
      value: 'Alice (Remote)',
      changeId: 101,
      timestamp: new Date('2025-01-01T10:01:00Z')
    }
  }),

  /**
   * 创建分支场景
   */
  createBranchScenario: () => {
    const mainId = uuid();
    const featureId = uuid();
    return {
      mainBranch: { id: mainId, fromChangeId: 0 },
      featureBranch: { id: featureId, fromChangeId: 50 },
      changes: [
        { id: 1, branchId: mainId, entityType: 'User', entityId: uuid(), operation: 'create' },
        { id: 51, branchId: featureId, entityType: 'User', entityId: uuid(), operation: 'create' }
      ]
    };
  },

  /**
   * 创建批量同步场景
   */
  createBulkSyncScenario: (repositoryCount: number = 3) => ({
    repositories: Array.from({ length: repositoryCount }, (_, i) => ({
      namespace: 'public',
      entityName: `Entity${i + 1}`
    })),
    options: {
      concurrent: false,
      operation: 'sync' as const
    }
  })
};
