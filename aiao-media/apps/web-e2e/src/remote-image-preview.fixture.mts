import { productRecordId, type PublicWorkPayload } from '@aiao-media/api-contracts';
import { expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash, randomUUID } from 'node:crypto';
import { localEnvironment } from '../../../scripts/supabase/supabase-local.mjs';

/** 真实账号的作品与文件回执，Storage 原字节由浏览器测试明确提供。 */
export async function seedRemoteImagePreviews(
  admin: SupabaseClient,
  user: { id: string; email: string; password: string },
  png: Buffer,
  count: number
) {
  const local = await localEnvironment();
  const client = createClient(local.url, local.env['ANON_KEY'], {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  const authenticated = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  expect(authenticated.error).toBeNull();
  const workspace = await admin.from('media_workspaces').select('id').eq('owner_id', user.id).single();
  expect(workspace.error).toBeNull();
  const workspaceId = workspace.data!.id as string;
  const sha256 = createHash('sha256').update(png).digest('hex');
  const works: PublicWorkPayload[] = Array.from({ length: count }, (_, index) => ({
    version: 1,
    jobId: randomUUID(),
    prompt: `可见预览样本 ${index + 1}`,
    modelId: 'preview-fixture',
    providerInstanceId: user.id,
    mimeType: 'image/png',
    width: 64,
    height: 64,
    bytes: png.length,
    sha256,
    createdAt: new Date(Date.UTC(2026, 10, 14, 0, 0, index)).toISOString()
  }));
  const records = await Promise.all(
    works.map(async work => ({
      id: await productRecordId(workspaceId, 'work', work.jobId),
      workspaceId,
      sourceId: work.jobId,
      kind: 'work',
      payload: JSON.stringify(work),
      revision: 1,
      baseRevision: 0,
      deleted: false,
      createdBy: user.id,
      updatedBy: user.id
    }))
  );
  const inserted = await client.from('media_sync_records').insert(records);
  expect(inserted.error).toBeNull();
  const files = works.map(work => ({
    id: randomUUID(),
    workspaceId,
    sourceId: work.jobId,
    version: sha256,
    path: `${user.id}/${workspaceId}/${work.jobId}/${sha256}.png`,
    mimeType: work.mimeType,
    width: work.width,
    height: work.height,
    bytes: work.bytes,
    sha256,
    status: 'uploaded',
    deleted: false,
    revision: 1,
    baseRevision: 0,
    createdBy: user.id,
    updatedBy: user.id
  }));
  const uploaded = await client.from('media_file_records').insert(files);
  expect(uploaded.error).toBeNull();
  await client.auth.signOut({ scope: 'local' });
  return { works, paths: new Set(files.map(file => file.path)) };
}
