import { getEntityMetadata } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { ADMIN_CONFIG_DB_NAME, ADMIN_CONFIG_ENTITIES, normalizeAdminUserId } from './admin-rxdb';

describe('Admin RxDB 配置工作区', () => {
  it('只注册媒体配置实体，不把 RxDB 系统实体作为业务同步契约', () => {
    expect(ADMIN_CONFIG_DB_NAME).toBe('aiao-media-admin-config-v2');
    expect(ADMIN_CONFIG_ENTITIES.map(entity => getEntityMetadata(entity).name)).toEqual([
      'MediaPromptTemplate',
      'MediaProviderPolicy',
      'MediaPlatformModel',
      'MediaConfigCommit',
      'MediaConfigCommitChange'
    ]);
  });

  it('拒绝把邮箱、token 或任意文本当成数据库用户上下文', () => {
    expect(normalizeAdminUserId('10000000-0000-4000-8000-000000000001')).toBe(
      '10000000-0000-4000-8000-000000000001'
    );
    expect(() => normalizeAdminUserId('owner@example.test')).toThrow('用户标识');
    expect(() => normalizeAdminUserId('token.secret.value')).toThrow('用户标识');
  });
});
