import { describe, expect, it } from 'vitest';
import { accountLabel, normalizeDisplayName, parseAccountIdentity, parseAdminProfile } from './admin-profile';

const profile = {
  userId: 'owner',
  displayName: null,
  revision: 0,
  updatedAt: null,
  adminEnabled: true,
  accessDisabled: false
};

describe('管理员资料契约', () => {
  it('名称按 Unicode 字符计数，保留中文和 emoji 并去掉首尾空白', () => {
    expect(normalizeDisplayName('　小明 👩‍💻　')).toBe('小明 👩‍💻');
    expect(normalizeDisplayName('😀'.repeat(40))).toBe('😀'.repeat(40));
  });

  it.each(['', '　 ', 'a'.repeat(41), 'a\nb', 'a\u0000b', 'a\u0085b', 'a\u202eb', '\ud800'])(
    '拒绝非法名称 %j',
    name => {
      expect(() => normalizeDisplayName(name)).toThrow();
    }
  );

  it('缺少名称时依次显示邮箱和短账号 ID', () => {
    expect(accountLabel('小明', 'a@example.test', '123456789012')).toBe('小明');
    expect(accountLabel(null, 'a@example.test', '123456789012')).toBe('a@example.test');
    expect(accountLabel(null, null, '123456789012')).toBe('12345678');
  });

  it('允许旧账号缺少资料，拒绝串号和不完整回执', () => {
    expect(parseAdminProfile(profile, 'owner')).toEqual(profile);
    expect(() => parseAdminProfile(profile, 'another')).toThrow();
    expect(() => parseAdminProfile({ ...profile, revision: -1 }, 'owner')).toThrow();
    expect(() => parseAdminProfile({ ...profile, displayName: '' }, 'owner')).toThrow();
  });
});

describe('账户服务回执校验', () => {
  const identity = { userId: 'owner', email: 'a@example.test', createdAt: '2026-01-01T00:00:00Z', lastSignInAt: null };
  it('接收当前账户的系统时间与可选邮箱，忽略多余认证字段', () => {
    expect(parseAccountIdentity({ ...identity, token: 'discard' }, 'owner')).toEqual(identity);
    expect(
      parseAccountIdentity({ ...identity, email: null, lastSignInAt: identity.createdAt }, 'owner').email
    ).toBeNull();
  });
  it.each([
    null,
    {},
    { ...identity, userId: 'other' },
    { ...identity, email: 1 },
    { ...identity, createdAt: 'bad' },
    { ...identity, lastSignInAt: false }
  ])('拒绝无效身份回执 %j', value => {
    expect(() => parseAccountIdentity(value, 'owner')).toThrow();
  });
  it.each([
    null,
    {},
    { ...profile, displayName: 1 },
    { ...profile, displayName: ' untrimmed ' },
    { ...profile, revision: 0.5 },
    { ...profile, updatedAt: 'bad' },
    { ...profile, adminEnabled: 'true' },
    { ...profile, accessDisabled: null }
  ])('拒绝资料回执中的非法值 %j', value => {
    expect(() => parseAdminProfile(value, 'owner')).toThrow();
  });
});
