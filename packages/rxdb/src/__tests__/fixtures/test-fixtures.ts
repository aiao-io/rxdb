/**
 * @fileoverview 测试 Fixture 工厂
 *
 * 提供创建测试数据的工厂函数，确保测试数据一致性
 */

import { uuid } from '../../rxdb-utils.js';
import type { Post, Tag, User } from './test-entities.js';

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
