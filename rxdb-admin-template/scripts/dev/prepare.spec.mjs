import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deployedWorkspace, ownerEmail } from '../../deploy/scripts/lib/paths.mjs';
import { memberAccounts } from './accounts.mjs';
import { prepareDevelopment } from './prepare.mjs';

const secrets = { ANON_KEY: 'anon', SERVICE_ROLE_KEY: 'service', ADMIN_SERVICE_PASSWORD: 'pw', ADMIN_BOOTSTRAP_KEY: 'key' };
const owner = { id: 'owner-id', email: ownerEmail, verified: true };

/** 每一步都只记录调用顺序与参数的替身。 */
function steps(overrides = {}) {
  const calls = [];
  const record =
    (name, value) =>
    async (...args) => {
      calls.push([name, ...args]);
      return value;
    };
  return {
    calls,
    steps: {
      assertDocker: record('docker'),
      startStack: record('stack'),
      loadEnv: record('env', secrets),
      readOwner: record('owner', owner),
      migrate: record('migrate', ['0001.sql']),
      setServicePassword: record('servicePassword'),
      waitForProjections: record('projections'),
      initialize: record('initialize'),
      ensureAuthUsers: record('authUsers', new Map(memberAccounts.map(account => [account.email, `${account.key}-id`]))),
      activeMembers: record('members', new Set(['owner-id'])),
      ensureMemberships: record('memberships', ['editor@admin-template.local']),
      ...overrides
    }
  };
}

describe('nx dev 的本地栈准备', () => {
  it('依次起栈、迁移、设专用角色口令、等只读投影、初始化团队、准备账号与成员', async () => {
    const { calls, steps: injected } = steps();
    await prepareDevelopment(injected);
    assert.deepEqual(
      calls.map(([name]) => name),
      [
        'docker',
        'stack',
        'env',
        'owner',
        'migrate',
        'servicePassword',
        'projections',
        'initialize',
        'authUsers',
        'members',
        'memberships'
      ]
    );
    assert.deepEqual(calls.find(([name]) => name === 'servicePassword').slice(1), ['pw']);
    assert.deepEqual(calls.find(([name]) => name === 'projections').slice(1), ['anon']);
  });

  it('团队按发布预演的稳定键初始化，初始管理员取自本地栈', async () => {
    const { calls, steps: injected } = steps();
    await prepareDevelopment(injected);
    const [, input] = calls.find(([name]) => name === 'initialize');
    assert.deepEqual(input, {
      teamId: deployedWorkspace.teamId,
      appId: deployedWorkspace.appId,
      name: deployedWorkspace.name,
      bootstrapKey: secrets.ADMIN_BOOTSTRAP_KEY,
      admin: owner
    });
  });

  it('管理员以外的测试账号先在 Auth 里备好，再按账号 ID 与定义的权限交给成员准备', async () => {
    const { calls, steps: injected } = steps();
    const summary = await prepareDevelopment(injected);
    const [, emails, auth] = calls.find(([name]) => name === 'authUsers');
    assert.deepEqual(
      emails,
      memberAccounts.map(account => account.email)
    );
    assert.equal(auth.serviceKey, secrets.SERVICE_ROLE_KEY);
    const [, input] = calls.find(([name]) => name === 'memberships');
    assert.deepEqual(input.owner, owner);
    assert.deepEqual(input.workspace, { teamId: deployedWorkspace.teamId, appId: deployedWorkspace.appId });
    assert.deepEqual(input.activeMembers, new Set(['owner-id']));
    assert.deepEqual(
      input.members,
      memberAccounts.map(account => ({ id: `${account.key}-id`, email: account.email, permissions: account.permissions }))
    );
    assert.deepEqual(summary, { migrations: ['0001.sql'], added: ['editor@admin-template.local'] });
  });

  it('任一步失败即停止，后面的步骤不执行', async () => {
    const { calls, steps: injected } = steps({
      migrate: async () => {
        throw new Error('迁移失败');
      }
    });
    await assert.rejects(prepareDevelopment(injected), /迁移失败/);
    assert.deepEqual(
      calls.map(([name]) => name),
      ['docker', 'stack', 'env', 'owner']
    );
  });
});
