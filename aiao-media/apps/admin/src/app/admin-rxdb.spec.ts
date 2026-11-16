import { getEntityMetadata } from '@aiao/rxdb';
import type { SupabaseClient } from '@supabase/supabase-js';
import { webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_CONFIG_ENTITIES } from './admin-config-database';
import {
  ADMIN_CONFIG_DB_PREFIX,
  AdminConfigDatabaseHost,
  adminConfigDatabaseName,
  normalizeAdminUserId
} from './admin-rxdb';

describe('Admin RxDB 配置工作区', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('只注册媒体配置实体与领域投影，不把 RxDB 系统实体作为业务同步契约', () => {
    expect(ADMIN_CONFIG_ENTITIES.map(entity => getEntityMetadata(entity).name)).toEqual([
      'MediaPromptTemplate',
      'MediaProviderPolicy',
      'MediaPlatformModel',
      'MediaConfigCommit',
      'MediaConfigCommitChange'
    ]);
  });

  it('每个账号一个本地库，库名只含账号摘要，不含账号本身', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const first = await adminConfigDatabaseName('10000000-0000-4000-8000-000000000001');
    const second = await adminConfigDatabaseName('10000000-0000-4000-8000-000000000002');
    expect(first).toMatch(new RegExp(`^${ADMIN_CONFIG_DB_PREFIX}-[0-9a-f]{12}$`));
    expect(second).not.toBe(first);
    expect(first).not.toContain('10000000');
    expect(await adminConfigDatabaseName('10000000-0000-4000-8000-000000000001')).toBe(first);
  });

  it('拒绝把邮箱、token 或任意文本当成数据库用户上下文', () => {
    expect(normalizeAdminUserId('10000000-0000-4000-8000-000000000001')).toBe('10000000-0000-4000-8000-000000000001');
    expect(() => normalizeAdminUserId('owner@example.test')).toThrow('用户标识');
    expect(() => normalizeAdminUserId('token.secret.value')).toThrow('用户标识');
  });

  it('打开前没有兜底实例；已为一个账号打开时拒绝换成其他账号', async () => {
    const host = new AdminConfigDatabaseHost();
    expect(() => host.require()).toThrow('配置库尚未打开');
    const supabase = {} as SupabaseClient;
    const first = host.open({
      userId: '10000000-0000-4000-8000-000000000001',
      workspaceId: '20000000-0000-4000-8000-000000000001',
      supabase
    });
    await expect(
      host.open({
        userId: '10000000-0000-4000-8000-000000000002',
        workspaceId: '20000000-0000-4000-8000-000000000002',
        supabase
      })
    ).rejects.toThrow('其他账号');
    // jsdom 里没有可用的 SQLite WASM：第一次打开最终失败，宿主随之复位而不是留下半打开状态。
    await expect(first).rejects.toBeTruthy();
    expect(() => host.require()).toThrow('配置库尚未打开');
  });
});
