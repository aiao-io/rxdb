import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { localEnvironment } from '../supabase/supabase-local.mjs';
import { verifyImageLifecycleRace } from './image-lifecycle-local.mjs';
import { verifyImageDeleteRace } from './image-delete-local.mjs';

const { env, url } = await localEnvironment();
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(url, env.SERVICE_ROLE_KEY, options);
const client = createClient(url, env.ANON_KEY, options);
const credentials = {
  email: `media-image-lifecycle-${randomUUID()}@example.test`,
  password: randomBytes(24).toString('hex')
};
const created = await admin.auth.admin.createUser({ ...credentials, email_confirm: true });
assert.equal(created.error, null);
const userId = created.data.user.id;
try {
  assert.equal((await client.auth.signInWithPassword(credentials)).error, null);
  const workspace = await client.rpc('media_ensure_workspace', { p_request_id: randomUUID() });
  assert.equal(workspace.error, null);
  await verifyImageLifecycleRace(env, userId, workspace.data.id);
  await verifyImageDeleteRace(env, userId, workspace.data.id);
} finally {
  await client.auth.signOut({ scope: 'local' });
  assert.equal((await admin.from('media_file_records').delete().eq('createdBy', userId)).error, null);
  assert.equal((await admin.auth.admin.deleteUser(userId)).error, null);
}
