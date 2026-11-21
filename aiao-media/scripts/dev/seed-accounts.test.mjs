import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { developmentAccounts, seedDevelopmentAccounts } from './seed-accounts.mjs';

function fixture(users = []) {
  const accounts = [...users];
  let membership = null;
  const success = data => ({ data, error: null });
  const auth = {
    listUsers: mock.fn(async ({ page, perPage }) =>
      success({ users: accounts.slice((page - 1) * perPage, page * perPage) })
    ),
    createUser: mock.fn(async attributes => {
      const user = { id: `user-${accounts.length}`, ...attributes };
      accounts.push(user);
      return success({ user });
    }),
    updateUserById: mock.fn(async (id, attributes) => {
      const user = accounts.find(account => account.id === id);
      Object.assign(user, attributes);
      return success({ user });
    })
  };
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => success(membership)
  };
  const client = {
    auth: { admin: auth },
    from: name => {
      assert.equal(name, 'media_admin_memberships');
      return query;
    },
    rpc: mock.fn(async (name, args) => {
      assert.equal(name, 'media_trusted_membership');
      membership = { enabled: true, revision: 1, user_id: args.p_target };
      return success(membership);
    })
  };
  return { client, auth, accounts };
}

const local = { url: 'http://127.0.0.1:54321', env: { SERVICE_ROLE_KEY: 'local-private-key' } };

test('development accounts are confirmed, reusable and grant only the designated administrator', async () => {
  const { client, auth, accounts } = fixture();
  await seedDevelopmentAccounts(local, client);
  assert.equal(accounts.length, 2);
  for (const account of developmentAccounts) {
    const user = accounts.find(user => user.email === account.email);
    assert.equal(user.password, account.password);
    assert.equal(user.email_confirm, true);
  }
  const ids = accounts.map(user => user.id);
  accounts[0].password = 'changed-password';
  await seedDevelopmentAccounts(local, client);
  assert.deepEqual(
    accounts.map(user => user.id),
    ids
  );
  assert.equal(auth.createUser.mock.callCount(), 2);
  assert.equal(auth.updateUserById.mock.callCount(), 2);
  assert.equal(client.rpc.mock.callCount(), 1);
  assert.equal(
    client.rpc.mock.calls[0].arguments[1].p_target,
    accounts.find(user => user.email === 'admin@aiao.test').id
  );
  assert.equal(accounts[0].password, developmentAccounts[0].password);
});

test('existing accounts beyond the first Auth page keep their identities', async () => {
  const users = Array.from({ length: 1000 }, (_, index) => ({
    id: `existing-${index}`,
    email: `user-${index}@example.test`
  }));
  users.push({ id: 'existing-dev', email: developmentAccounts[0].email });
  const { client, auth, accounts } = fixture(users);
  await seedDevelopmentAccounts(local, client);
  assert.equal(auth.listUsers.mock.callCount(), 2);
  assert.equal(auth.createUser.mock.callCount(), 1);
  assert.equal(accounts.find(user => user.email === developmentAccounts[0].email).id, 'existing-dev');
});

test('a failed account lookup stops provisioning and remote Supabase is never seeded', async () => {
  const { client, auth } = fixture();
  auth.listUsers.mock.mockImplementation(async () => ({ data: null, error: new Error('Auth unavailable') }));
  await assert.rejects(seedDevelopmentAccounts(local, client), /Auth unavailable/);
  assert.equal(auth.createUser.mock.callCount(), 0);
  await assert.rejects(seedDevelopmentAccounts({ ...local, url: 'https://example.supabase.co' }, client), /本地/);
  assert.equal(auth.listUsers.mock.callCount(), 1);
});
