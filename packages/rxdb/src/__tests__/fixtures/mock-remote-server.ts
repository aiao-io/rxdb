/**
 * @fileoverview 模拟远程服务器
 *
 * 模拟远程同步服务器，用于测试 pull/push 操作
 */

import type { RxDBEntityId } from '../../entity/entity.interface.js';
import { uuid } from '../../rxdb-utils.js';
import type { RxDBChange } from '../../system/change.js';
import type { RemoteChange } from '../../system/system.interface.js';

/**
 * 变更操作类型
 */
export type ChangeOperation = 'create' | 'update' | 'delete';

/**
 * Mock 变更记录
 */
export interface MockChange {
  id: number;
  namespace: string;
  entity: string;
  entityId: RxDBEntityId;
  type: ChangeOperation;
  patch: Record<string, unknown>;
  inversePatch: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 推送结果
 */
export interface PushResult {
  accepted: number;
  rejected: number;
  conflicts: Array<{
    changeId: number;
    reason: string;
  }>;
}

/**
 * Mock 远程服务器配置
 */
export interface MockRemoteServerOptions {
  /** 模拟网络延迟（毫秒） */
  latency?: number;
  /** 模拟错误率（0-1） */
  errorRate?: number;
  /** 批量拉取限制 */
  pullLimit?: number;
}

/**
 * Mock 远程服务器
 *
 * 模拟远程同步服务器，支持：
 * - 变更拉取（pull）
 * - 变更推送（push）
 * - 冲突模拟
 * - 网络错误模拟
 *
 * @example
 * ```ts
 * const server = new MockRemoteServer();
 *
 * // 设置初始数据
 * server.addChanges('User', [
 *   { entityId: 'u1', type: 'create', patch: { name: 'Alice' } }
 * ]);
 *
 * // 拉取变更
 * const changes = await server.pull('User', 0);
 *
 * // 推送变更
 * const result = await server.push('User', newChanges);
 * ```
 */
export class MockRemoteServer {
  private storage = new Map<string, MockChange[]>();
  private changeIdCounter = 0;
  private options: Required<MockRemoteServerOptions>;

  constructor(options: MockRemoteServerOptions = {}) {
    this.options = {
      latency: options.latency ?? 0,
      errorRate: options.errorRate ?? 0,
      pullLimit: options.pullLimit ?? 1000
    };
  }

  /**
   * 添加变更到仓库
   */
  addChanges(
    entity: string,
    changes: Array<{
      entityId?: string;
      type: ChangeOperation;
      patch: Record<string, unknown>;
      inversePatch?: Record<string, unknown>;
    }>,
    namespace = 'public'
  ): MockChange[] {
    const key = this.getKey(namespace, entity);
    const existing = this.storage.get(key) ?? [];

    const newChanges = changes.map(c => ({
      id: ++this.changeIdCounter,
      namespace,
      entity,
      entityId: c.entityId ?? uuid(),
      type: c.type,
      patch: c.patch,
      inversePatch: c.inversePatch ?? null,
      createdAt: new Date(),
      updatedAt: new Date()
    }));

    this.storage.set(key, [...existing, ...newChanges]);
    return newChanges;
  }

  /**
   * 拉取变更
   *
   * @param entity 实体名称
   * @param fromChangeId 起始变更 ID（不包含）
   * @param namespace 命名空间
   * @param limit 最大返回数量
   */
  async pull(entity: string, fromChangeId = 0, namespace = 'public', limit?: number): Promise<RemoteChange[]> {
    await this.simulateLatency();
    this.maybeThrowError();

    const key = this.getKey(namespace, entity);
    const changes = this.storage.get(key) ?? [];
    const effectiveLimit = limit ?? this.options.pullLimit;

    return changes
      .filter(c => c.id > fromChangeId)
      .slice(0, effectiveLimit)
      .map(c => ({
        id: c.id,
        namespace: c.namespace,
        entity: c.entity,
        entityId: c.entityId,
        type: (c.type === 'create' ? 'INSERT' : c.type.toUpperCase()) as 'INSERT' | 'UPDATE' | 'DELETE',
        patch: c.patch,
        inversePatch: c.inversePatch,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt
      }));
  }

  /**
   * 推送变更
   *
   * @param entity 实体名称
   * @param changes 要推送的变更
   * @param namespace 命名空间
   */
  async push(entity: string, changes: Array<Partial<RxDBChange>>, namespace = 'public'): Promise<PushResult> {
    await this.simulateLatency();
    this.maybeThrowError();

    const key = this.getKey(namespace, entity);
    const existing = this.storage.get(key) ?? [];
    const conflicts: Array<{ changeId: number; reason: string }> = [];

    const accepted = changes.filter(c => {
      // 检查冲突：如果已存在相同 entityId 的更新变更
      const hasConflict = existing.some(e => e.entityId === c.entityId && e.id > (c.id ?? 0));

      if (hasConflict) {
        conflicts.push({
          changeId: c.id ?? 0,
          reason: 'Conflict: Remote has newer changes'
        });
        return false;
      }
      return true;
    });

    // 添加接受的变更
    const newChanges = accepted.map(c => ({
      id: ++this.changeIdCounter,
      namespace,
      entity,
      entityId: c.entityId ?? uuid(),
      type: (c.type?.toLowerCase() ?? 'update') as ChangeOperation,
      patch: c.patch ?? {},
      inversePatch: c.inversePatch ?? null,
      createdAt: c.createdAt ?? new Date(),
      updatedAt: c.updatedAt ?? new Date()
    }));

    this.storage.set(key, [...existing, ...newChanges]);

    return {
      accepted: accepted.length,
      rejected: conflicts.length,
      conflicts
    };
  }

  /**
   * 创建冲突场景
   *
   * 向服务器添加一个变更，使得后续推送相同 entityId 的变更时产生冲突
   */
  createConflict(entity: string, entityId: string, namespace = 'public'): MockChange {
    const changes = this.addChanges(
      entity,
      [
        {
          entityId,
          type: 'update',
          patch: { _conflictMarker: true, updatedAt: new Date() }
        }
      ],
      namespace
    );
    return changes[0];
  }

  /**
   * 清空指定仓库
   */
  clear(entity?: string, namespace = 'public'): void {
    if (entity) {
      const key = this.getKey(namespace, entity);
      this.storage.delete(key);
    } else {
      this.storage.clear();
    }
  }

  /**
   * 获取仓库中的所有变更
   */
  getChanges(entity: string, namespace = 'public'): MockChange[] {
    const key = this.getKey(namespace, entity);
    return this.storage.get(key) ?? [];
  }

  /**
   * 获取最新的变更 ID
   */
  getLatestChangeId(): number {
    return this.changeIdCounter;
  }

  /**
   * 设置网络延迟
   */
  setLatency(ms: number): void {
    this.options.latency = ms;
  }

  /**
   * 设置错误率
   */
  setErrorRate(rate: number): void {
    this.options.errorRate = Math.max(0, Math.min(1, rate));
  }

  /**
   * 重置服务器状态
   */
  reset(): void {
    this.storage.clear();
    this.changeIdCounter = 0;
  }

  /**
   * 模拟网络延迟
   */
  private async simulateLatency(): Promise<void> {
    if (this.options.latency > 0) {
      await new Promise(resolve => setTimeout(resolve, this.options.latency));
    }
  }

  /**
   * 模拟网络错误
   */
  private maybeThrowError(): void {
    if (this.options.errorRate > 0 && Math.random() < this.options.errorRate) {
      throw new Error('Network error: Connection refused');
    }
  }

  /**
   * 获取仓库键
   */
  private getKey(namespace: string, entity: string): string {
    return `${namespace}:${entity}`;
  }
}

/**
 * 创建预配置的 Mock 服务器
 */
export function createMockServer(options?: MockRemoteServerOptions): MockRemoteServer {
  return new MockRemoteServer(options);
}
