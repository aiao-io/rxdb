import { createHash, createHmac, pbkdf2Sync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { isServiceRoleUser, scramVerifier, servicePasswordStatement } from './service-role.js';

describe('协作专用数据库角色的口令（只以 SCRAM 校验值发给数据库）', () => {
  it('SCRAM-SHA-256 校验值与按 RFC 5802 独立计算的结果一致', async () => {
    const salt = new Uint8Array([...Array(16).keys()]);
    const salted = pbkdf2Sync('correct horse battery', salt, 4096, 32, 'sha256');
    const clientKey = createHmac('sha256', salted).update('Client Key').digest();
    const storedKey = createHash('sha256').update(clientKey).digest('base64');
    const serverKey = createHmac('sha256', salted).update('Server Key').digest('base64');
    await expect(scramVerifier('correct horse battery', { salt })).resolves.toBe(
      `SCRAM-SHA-256$4096:${Buffer.from(salt).toString('base64')}$${storedKey}:${serverKey}`
    );
  });
  it('设置口令的语句只含校验值、带随机盐，明文不出现在 SQL 里；空口令拒绝', async () => {
    const statement = await servicePasswordStatement("p@ss'word; DROP ROLE x");
    expect(statement).toMatch(/^ALTER ROLE admin_collaboration WITH LOGIN PASSWORD 'SCRAM-SHA-256\$4096:[^']+'$/);
    expect(statement).not.toContain('p@ss');
    expect(await servicePasswordStatement('same')).not.toBe(await servicePasswordStatement('same'));
    await expect(servicePasswordStatement('')).rejects.toThrow();
  });
  it('直连时用户名就是角色名，经 Supavisor 时为 <角色>.<项目 ref>', () => {
    expect(isServiceRoleUser('admin_collaboration')).toBe(true);
    expect(isServiceRoleUser('admin_collaboration.abcdefghij')).toBe(true);
    for (const user of ['postgres', 'admin_collaboration.', 'admin_collaborationx', 'xadmin_collaboration', ''])
      expect(isServiceRoleUser(user), user).toBe(false);
  });
});
