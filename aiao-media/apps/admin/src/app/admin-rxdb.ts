import type { RxDB, UUID } from '@aiao/rxdb';
import { Injectable } from '@angular/core';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * 管理后台本地配置库的名称前缀。
 *
 * @remarks
 * `v2`：配置实体改到 `public` 命名空间并新增投影字段；RxDB 只补建缺失的表、不给既有业务表加列。
 * 每个账号一个库：同步游标、工作树与未提交修改都按库保存，共用一个库会让切换账号后串用对方的游标与草稿。
 * 旧库（`aiao-media-admin-config`）只存在于未发布的开发环境，不迁移、不再打开。
 */
export const ADMIN_CONFIG_DB_PREFIX = 'aiao-media-admin-v2';

/** 规范化本地数据库上下文，避免把账号、邮箱或 token 写入数据库名和日志。 */
export function normalizeAdminUserId(userId: string): UUID {
  const value = userId.trim();
  if (!/^[0-9a-f-]{8,128}$/i.test(value)) throw new Error('Admin 用户标识无效。');
  return value as UUID;
}

/** 按账号派生本地库名：取用户标识摘要的前 12 位十六进制，库名里不出现账号本身。 */
export async function adminConfigDatabaseName(userId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizeAdminUserId(userId)));
  const prefix = [...new Uint8Array(digest)]
    .slice(0, 6)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
  return `${ADMIN_CONFIG_DB_PREFIX}-${prefix}`;
}

/** {@link AdminConfigDatabaseHost.open} 的输入。 */
export interface AdminConfigOpenOptions {
  readonly userId: string;
  readonly workspaceId: string;
  readonly supabase: SupabaseClient;
}

/**
 * 当前账号的配置库宿主：根注入器里的 `RxDB` 经它解析，列表与弹窗拿到同一个实例。
 *
 * @remarks
 * 打开后只服务一个账号与工作区；同一页面里换账号直接拒绝，由退出登录后重新加载页面完成隔离。
 * 本地先连上就可编辑；远端连接单独进行，失败时保留本地数据与未提交修改。
 */
@Injectable({ providedIn: 'root' })
export class AdminConfigDatabaseHost {
  #database: RxDB | null = null;
  #owner: string | null = null;
  #opening: Promise<RxDB> | null = null;
  #remote: Promise<void> | null = null;

  /** 是否已为某个账号打开过配置库（含正在打开）。 */
  isOpen(): boolean {
    return this.#owner !== null;
  }

  /** 当前账号的配置库；尚未打开时抛错，不提供兜底实例。 */
  require(): RxDB {
    if (!this.#database) throw new Error('配置库尚未打开。');
    return this.#database;
  }

  /** 打开（或复用）当前账号与工作区的配置库，完成本地连接并启用工作树。 */
  open(options: AdminConfigOpenOptions): Promise<RxDB> {
    const owner = `${normalizeAdminUserId(options.userId)}:${options.workspaceId}`;
    if (this.#owner && this.#owner !== owner) {
      return Promise.reject(new Error('已打开其他账号的配置库，请退出后重新登录再切换账号。'));
    }
    this.#owner = owner;
    this.#opening ??= (async () => {
      const { createAdminConfigDatabase } = await import('./admin-config-database');
      const database = createAdminConfigDatabase({
        dbName: await adminConfigDatabaseName(options.userId),
        userId: options.userId,
        workspaceId: options.workspaceId,
        supabase: options.supabase
      });
      try {
        await database.connect('sqlite-wasm');
        await database.workingTree.enable();
      } catch (error) {
        await database.destroy();
        throw error;
      }
      this.#database = database;
      return database;
    })().catch(error => {
      this.#opening = null;
      this.#owner = null;
      throw error;
    });
    return this.#opening;
  }

  /** 连接远端；同一时刻只连一次，失败后下次调用重试。 */
  connectRemote(): Promise<void> {
    const database = this.require();
    this.#remote ??= database.connect('supabase').then(
      () => undefined,
      error => {
        this.#remote = null;
        throw error;
      }
    );
    return this.#remote;
  }

  /** 拉取分支元数据后双向同步配置实体。 */
  async syncNow(): Promise<void> {
    const database = this.require();
    await this.connectRemote();
    await database.syncManager.syncBranches();
    await database.syncManager.sync();
  }

  /** 关闭配置库；退出登录时调用，之后页面重新加载。 */
  async close(): Promise<void> {
    const database = this.#database;
    this.#database = null;
    this.#owner = null;
    this.#opening = null;
    this.#remote = null;
    if (database) await database.destroy();
  }
}
