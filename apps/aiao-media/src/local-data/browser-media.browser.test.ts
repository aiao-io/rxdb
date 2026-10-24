import { filter, firstValueFrom, take } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultFreeProvider } from '../app/default-provider';
import { plainPrompt } from '../app/prompts/prompt-state';
import type {
  AudioGenerationJobSummary,
  AudioJobRequest,
  GenerationJobSummary,
  SyncedDraft,
  VideoGenerationJobSummary,
  VideoJobRequest
} from '../contracts/index';
import { LocalMediaStore } from './browser-media';

let store: LocalMediaStore, profileId: string;
const providerId = '00000000-0000-4000-8000-000000000001';
const selection = {
  kind: 'image' as const,
  operation: 'text-to-image' as const,
  providerInstanceId: providerId,
  providerRevision: 1,
  modelId: 'fixture',
  prompt: '本机真实存储'
};
const content = {
  kind: 'image' as const,
  prompt: '同步笔记',
  requiresReference: false,
  parameters: { operation: 'text-to-image' as const }
};
const now = () => new Date().toISOString();
function imageJob(): GenerationJobSummary {
  const timestamp = now();
  return {
    id: crypto.randomUUID(),
    request: selection,
    status: 'completed',
    createdAt: timestamp,
    updatedAt: timestamp,
    delivery: { status: 'available', expiresAt: null, acknowledgedAt: null },
    failure: null
  };
}
async function png(color = 'green'): Promise<Blob> {
  const canvas = new OffscreenCanvas(64, 64),
    context = canvas.getContext('2d')!;
  context.fillStyle = color;
  context.fillRect(0, 0, 64, 64);
  return canvas.convertToBlob({ type: 'image/png' });
}
function wave(): Blob {
  const bytes = new Uint8Array(64044),
    view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => bytes.set(new TextEncoder().encode(value), offset);
  text(0, 'RIFF');
  view.setUint32(4, bytes.length - 8, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 32000, true);
  view.setUint32(28, 64000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, 64000, true);
  return new Blob([bytes], { type: 'audio/wav' });
}
const audioRequest: AudioJobRequest = {
  kind: 'audio',
  operation: 'text-to-speech',
  providerInstanceId: providerId,
  providerRevision: 1,
  modelId: 'speech',
  voiceId: 'voice',
  profileId: 'fixture',
  prompt: '真实存储音频'
};
function audioJob(): AudioGenerationJobSummary {
  const timestamp = now();
  return {
    id: crypto.randomUUID(),
    request: audioRequest,
    status: 'completed',
    createdAt: timestamp,
    updatedAt: timestamp,
    delivery: { status: 'available', expiresAt: null, acknowledgedAt: null },
    failure: null,
    result: { mediaType: 'audio/wav', format: 'wav', durationMs: 1000, sampleRate: 32000, channels: 1, bytes: 64044 }
  };
}
beforeEach(async () => {
  profileId = crypto.randomUUID();
  store = await LocalMediaStore.open(profileId);
});
afterEach(async () => {
  await store.close();
});

describe('真实 RxDB、WASM、IndexedDB、OPFS 的本机数据事务', () => {
  it('原偏好集合按 revision 迁入索引，重开、删除与原快照保持一致', async () => {
    const provider = defaultFreeProvider(),
      payload = JSON.stringify({ providers: [provider], defaultId: provider.id });
    await store.savePreference('providers-v1', payload, null);
    const rows = await store.collection('providers');
    expect(JSON.parse(rows[0].payload)).toEqual(provider);
    expect(await store.preference('providers-v1')).toEqual({ payload, revision: 1 });
    const observed = firstValueFrom(
      store.collection$('providers').pipe(
        filter(rows => rows.length === 0),
        take(1)
      )
    );
    await store.savePreferences(
      [{ key: 'providers-v1', payload: JSON.stringify({ providers: [], defaultId: '' }), revision: 1 }],
      true
    );
    await observed;
    await store.close();
    store = await LocalMediaStore.open(profileId);
    expect(await store.collection('providers')).toEqual([]);
  });
  it('索引、凭据和草稿 CAS 同时回滚，损坏旧集合不生成空目录', async () => {
    const provider = defaultFreeProvider(),
      payload = JSON.stringify({ providers: [provider], defaultId: provider.id });
    await store.savePreferences([{ key: 'providers-v1', payload, revision: null }], true);
    const state = plainPrompt('已保存');
    await store.saveStudioDraft(state, null);
    await expect(
      store.applyProjection({
        collections: true,
        preferences: [{ key: 'providers-v1', payload: JSON.stringify({ providers: [], defaultId: '' }), revision: 1 }],
        draft: { state: plainPrompt('旧快照'), revision: null }
      })
    ).rejects.toMatchObject({ code: 'conflict' });
    expect((await store.collection('providers'))[0].sourceId).toBe(provider.id);
    expect((await store.preference('providers-v1'))?.revision).toBe(1);
    await store.savePreference('tasks-v1', '{broken', null);
    await expect(store.refreshCollections()).rejects.toThrow();
    expect((await store.preference('tasks-v1'))?.payload).toBe('{broken');
    await store.savePreference('tasks-v1', '[]', 1);
    expect((await store.collection('providers')).length).toBe(1);
  });
  it('并发设置只有一次 CAS 成功，失败不提交另一项凭据', async () => {
    const results = await Promise.allSettled([
      store.savePreferences([
        { key: 'setting', payload: 'a', revision: null },
        { key: 'credential-a', payload: 'a', revision: null }
      ]),
      store.savePreferences([
        { key: 'setting', payload: 'b', revision: null },
        { key: 'credential-b', payload: 'b', revision: null }
      ])
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(
      [await store.preference('credential-a'), await store.preference('credential-b')].filter(Boolean)
    ).toHaveLength(1);
  });
  it('草稿和作品元数据原子投影，无原图缓存不会创建文件', async () => {
    const work = {
      version: 1 as const,
      jobId: crypto.randomUUID(),
      prompt: '远程元数据',
      modelId: 'image',
      providerInstanceId: providerId,
      mimeType: 'image/png' as const,
      width: 64,
      height: 64,
      bytes: 200,
      sha256: 'a'.repeat(64),
      createdAt: now()
    };
    const received = firstValueFrom(
      store.syncedWorks$().pipe(
        filter(rows => rows.length === 1),
        take(1)
      )
    );
    await store.applyProjection({
      collections: true,
      preferences: [],
      works: [work],
      draft: { state: plainPrompt('远程草稿'), revision: null }
    });
    expect(await received).toEqual([work]);
    expect(await store.list()).toEqual([]);
    expect((await store.studioDraft())?.state).toEqual(plainPrompt('远程草稿'));
    await store.applyProjection({ preferences: [], works: [{ ...work, prompt: '更新' }] });
    expect((await store.syncedWorks())[0].prompt).toBe('更新');
    await store.applyProjection({ preferences: [], works: [] });
    expect(await store.syncedWorks()).toEqual([]);
  });
  it('PNG 幂等保存、精确回读、预览与显式删除都经过真实文件后端', async () => {
    const job = imageJob(),
      blob = await png();
    const added = firstValueFrom(
      store.works$().pipe(
        filter(rows => rows.length === 1),
        take(1)
      )
    );
    await store.saveMediaResult(job, blob);
    await added;
    await store.saveResult(job, blob);
    expect((await store.listMedia()).length).toBe(1);
    expect(await (await store.backupImage(job.id)).blob.arrayBuffer()).toEqual(await blob.arrayBuffer());
    expect(await store.imageInfo(job.id)).toMatchObject({ width: 64, height: 64, bytes: blob.size });
    const url = await store.preview(job.id);
    expect((await fetch(url)).ok).toBe(true);
    store.release(url);
    await expect(store.saveResult(job, await png('red'))).rejects.toMatchObject({ code: 'conflict' });
    await store.close();
    store = await LocalMediaStore.open(profileId);
    expect((await store.list()).map(row => row.jobId)).toEqual([job.id]);
    await store.delete(job.id);
    await store.delete(job.id);
    expect(await store.list()).toEqual([]);
    await expect(store.preview(job.id)).rejects.toMatchObject({ code: 'corrupt' });
  });
  it('文件写失败不确认保存，重开清理自己的未完成记录后可保存同一任务', async () => {
    const job = imageJob(),
      blob = await png();
    const original = FileSystemFileHandle.prototype.createWritable;
    FileSystemFileHandle.prototype.createWritable = async () => {
      throw new DOMException('fixture quota', 'QuotaExceededError');
    };
    try {
      await expect(store.saveResult(job, blob)).rejects.toMatchObject({ code: 'write_failed' });
    } finally {
      FileSystemFileHandle.prototype.createWritable = original;
    }
    await store.close();
    store = await LocalMediaStore.open(profileId);
    expect(await store.list()).toEqual([]);
    await store.saveResult(job, blob);
    expect((await store.list()).length).toBe(1);
  });
  it('锁定同步撤销预览，持久数据可由同一 profile 重开', async () => {
    const job = imageJob();
    await store.saveResult(job, await png());
    const url = await store.preview(job.id);
    await store.lockAccount();
    await expect(store.list()).rejects.toMatchObject({ code: 'locked' });
    await expect(fetch(url)).rejects.toThrow();
    store = await LocalMediaStore.open(profileId);
    expect((await store.list()).length).toBe(1);
  });
  it('WAV 资产的提交、持久验证、预览、ACK 与删除都不触发网络生成', async () => {
    const job = audioJob(),
      blob = wave();
    const intent = await store.createAudioSubmission(audioRequest);
    expect((await store.collection('audio-submissions'))[0].sourceId).toBe(intent.key);
    await store.markAudioSubmissionSent(intent.key);
    await store.confirmAudioSubmission(intent.key, {
      ...job,
      status: 'queued',
      delivery: { status: 'pending', expiresAt: null, acknowledgedAt: null },
      result: null
    });
    expect(await store.audioSubmission()).toBeNull();
    const added = firstValueFrom(
      store.assets$('audio').pipe(
        filter(rows => rows.length === 1),
        take(1)
      )
    );
    await store.saveMediaResult(job, blob);
    await added;
    await store.saveMediaResult(job, blob);
    await store.verifyAsset('audio', job.id);
    expect(await store.withVerifiedAsset('audio', job.id, async () => 'ack')).toBe('ack');
    const url = await store.previewAsset('audio', job.id);
    expect(await (await fetch(url)).blob()).toBeInstanceOf(Blob);
    store.release(url);
    expect((await store.listAssets('audio'))[0]).toMatchObject({ kind: 'audio', status: 'saved' });
    await expect(
      store.saveMediaResult({ ...job, request: { ...audioRequest, prompt: '不一致' } }, blob)
    ).rejects.toMatchObject({ code: 'conflict' });
    await store.close();
    store = await LocalMediaStore.open(profileId);
    await store.verifyAsset('audio', job.id);
    await store.deleteAsset('audio', job.id);
    await store.deleteAsset('audio', job.id);
    expect(await store.listAssets()).toEqual([]);
  });
});

describe('旧提交集合的真实事务迁移与恢复', () => {
  it('同步笔记、checkpoint、冲突与明确选择可从同一库重开', async () => {
    const draft = await store.createSyncDraft(content);
    await store.saveSyncDraft(draft.id, { ...content, prompt: '修订' }, draft.localRevision);
    const [mutation] = await store.prepareSyncPushes();
    const remote: SyncedDraft = {
      id: draft.id,
      content: mutation.content,
      deleted: false,
      revision: 1,
      sequence: 1,
      updatedAt: now()
    };
    await store.acceptSyncPush(mutation, { version: 1, status: 'applied', draft: remote, reused: false });
    await store.acceptSyncPull({ version: 1, checkpoint: 'one', hasMore: false, reset: false, drafts: [remote] }, null);
    await expect(
      store.acceptSyncPull({ version: 1, checkpoint: 'two', hasMore: false, reset: false, drafts: [remote] }, null)
    ).rejects.toThrow();
    const latest = (await store.syncNotebook()).drafts[0];
    await store.saveSyncDraft(draft.id, { ...content, prompt: '本机并发稿' }, latest.localRevision);
    const [local] = await store.prepareSyncPushes(),
      conflictId = crypto.randomUUID();
    const conflict = { id: conflictId, draftId: draft.id, local, remote, currentRemote: remote, createdAt: now() };
    await store.acceptSyncPush(local, { version: 1, status: 'conflict', reused: false, conflict });
    await store.acceptSyncConflicts([conflict]);
    expect(await store.prepareSyncPushes()).toEqual([]);
    await store.prepareSyncResolution(conflictId, 'local');
    await store.close();
    store = await LocalMediaStore.open(profileId);
    expect((await store.syncNotebook()).drafts[0].resolution?.choice).toBe('local');
    await store.rejectSyncResolution(conflictId);
    await store.prepareSyncResolution(conflictId, 'local');
    await store.acceptSyncResolution(conflictId, {
      version: 1,
      conflictId,
      choice: 'local',
      draft: { ...remote, content: local.content, revision: 2, sequence: 2 },
      reused: false,
      resolvedAt: now()
    });
    await store.resetSyncCheckpoint();
    expect((await store.syncNotebook()).checkpoint).toBeNull();
    expect(JSON.parse((await store.collection('drafts'))[0].payload).content.prompt).toBe('本机并发稿');
  });
  it('已在另一端解决的冲突保留恢复副本，tombstone 不被清理', async () => {
    const draft = await store.createSyncDraft(content),
      [local] = await store.prepareSyncPushes(),
      id = crypto.randomUUID();
    const remote = { id: draft.id, revision: 2, sequence: 2, deleted: true, content: null, updatedAt: now() };
    await store.acceptSyncPush(local, {
      version: 1,
      status: 'conflict',
      reused: false,
      conflict: { id, draftId: draft.id, local, remote, createdAt: now() }
    });
    await store.prepareSyncResolution(id, 'local');
    await store.blockSyncResolution(id);
    const recovered = await store.recoverSyncConflict(draft.id);
    expect(recovered.content).toEqual(content);
    expect((await store.collection('drafts')).length).toBe(2);
    await store.acceptSyncPull(
      { version: 1, checkpoint: 'deleted', hasMore: false, reset: true, drafts: [remote] },
      null
    );
    expect((await store.syncNotebook()).drafts.find(row => row.id === recovered.id)?.content).toEqual(content);
  });
  it('图片提交的发送、拒绝、确认与处理标记和逐条集合同时提交', async () => {
    const first = await store.createImageSubmission(selection, null);
    await expect(store.createImageSubmission(selection, null)).rejects.toMatchObject({ code: 'conflict' });
    await store.discardUnsentImageSubmission(first.id, first.revision);
    const second = await store.createImageSubmission(selection, null);
    const sent = await store.markImageSubmissionSent(second.id, second.revision);
    await store.rejectImageSubmission(sent.id, sent.revision, 400);
    const third = await store.createImageSubmission(selection, null);
    const dispatched = await store.markImageSubmissionSent(third.id, third.revision),
      jobId = crypto.randomUUID();
    await store.confirmImageSubmission(dispatched.id, dispatched.revision, jobId, selection);
    await store.markImageResultHandled(jobId);
    await store.close();
    store = await LocalMediaStore.open(profileId);
    const all = await store.imageSubmissions();
    expect(all.find(item => item.jobId === jobId)?.resultHandled).toBe(true);
    expect((await store.collection('image-submissions')).length).toBe(all.length);
  });
  it('参考图被提交引用后保留精确字节，替换选择不会删除在途文件', async () => {
    const blob = await png(),
      file = new File([blob], '含/路径.png', { type: 'image/png' });
    expect((await store.reference()).image).toBeNull();
    const state = await store.saveReference(file, 0),
      ref = state.image!;
    expect(ref.originalName).toBe('含_路径.png');
    await expect(store.saveReference(file, 0)).rejects.toMatchObject({ code: 'conflict' });
    const url = await store.previewReference(ref.referenceId);
    expect((await fetch(url)).ok).toBe(true);
    store.release(url);
    const draft = await store.createSyncDraft({
      ...content,
      requiresReference: true,
      parameters: { operation: 'reference-image' }
    });
    const request = { ...selection, operation: 'reference-image' as const };
    const pending = await store.createImageSubmission(request, ref.referenceId, {
      id: draft.id,
      localRevision: draft.localRevision
    });
    await store.removeReference(state.revision);
    expect(await (await store.referenceBlobForSubmission(pending.id)).arrayBuffer()).toEqual(await blob.arrayBuffer());
    const preview = await store.previewSubmissionReference(pending.id);
    expect((await fetch(preview)).ok).toBe(true);
    store.release(preview);
    const uploaded = await store.attachImageUpload(pending.id, pending.revision, {
      id: crypto.randomUUID(),
      mediaType: 'image/png',
      bytes: blob.size,
      width: 64,
      height: 64,
      expiresAt: new Date(Date.now() + 3600000).toISOString()
    });
    expect(uploaded.upload?.width).toBe(64);
    await store.discardUnsentImageSubmission(uploaded.id, uploaded.revision);
    await expect(store.referenceBlobForSubmission(pending.id)).rejects.toMatchObject({ code: 'corrupt' });
    await expect(store.referenceBlob(ref.referenceId)).rejects.toMatchObject({ code: 'corrupt' });
  });
  it('视频意图迁移后保持稳定 key，仅正确回执能够清除', async () => {
    const request: VideoJobRequest = {
      kind: 'video',
      operation: 'text-to-video',
      providerInstanceId: providerId,
      providerRevision: 1,
      modelId: 'video',
      profileId: 'fixture',
      prompt: '视频意图'
    };
    const pending = await store.createVideoSubmission(request);
    await expect(store.createVideoSubmission(request)).rejects.toThrow();
    await store.markVideoSubmissionSent(pending.key);
    await store.close();
    store = await LocalMediaStore.open(profileId);
    expect((await store.videoSubmission())?.key).toBe(pending.key);
    expect(JSON.parse((await store.collection('video-submissions'))[0].payload).request).toEqual(request);
    const job: VideoGenerationJobSummary = {
      ...imageJob(),
      request,
      status: 'queued',
      delivery: { status: 'pending', expiresAt: null, acknowledgedAt: null },
      result: null
    };
    await expect(store.confirmVideoSubmission(crypto.randomUUID(), job)).rejects.toThrow();
    await store.confirmVideoSubmission(pending.key, job);
    expect(await store.videoSubmission()).toBeNull();
  });
});

describe('工作区索引和可同步 DTO 的真实本机投影', () => {
  it('全局索引原子写入分组和别名，陈旧 revision 或别名抢占不会部分提交', async () => {
    const { WorkspaceRegistryStore } = await import('./workspace-registry-store');
    const metadata = await WorkspaceRegistryStore.open();
    try {
      const child = crypto.randomUUID(),
        account = { projectOrigin: 'http://127.0.0.1:54321', userId: crypto.randomUUID() };
      const state = {
        version: 1 as const,
        generation: 1,
        selectedId: child,
        profiles: [
          { id: profileId, account: null, binding: null },
          { id: child, account, binding: null }
        ]
      };
      expect(await metadata.read(profileId)).toBeNull();
      expect(await metadata.rootOf(child)).toBe(child);
      const seen = firstValueFrom(
        metadata.watch(profileId).pipe(
          filter(value => value !== null),
          take(1)
        )
      );
      await metadata.write(profileId, JSON.stringify(state), null);
      expect(await seen).toBe(JSON.stringify(state));
      expect(await metadata.rootOf(child)).toBe(profileId);
      await expect(metadata.write(profileId, JSON.stringify(state), null)).rejects.toThrow();
      const other = crypto.randomUUID();
      await expect(metadata.write(other, JSON.stringify(state), null)).rejects.toThrow();
      expect(await metadata.read(other)).toBeNull();
      await metadata.write(profileId, JSON.stringify({ ...state, generation: 2 }), 1);
      expect((await metadata.read(profileId))?.revision).toBe(2);
    } finally {
      await metadata.close();
    }
  });
  it('DTO 收集排除凭据，投影保留冲突和原图，明确采用删除才清空草稿', async () => {
    const { collectProductSnapshot, applyProductProjection } = await import('./product-projection');
    const provider = { ...defaultFreeProvider(), rememberKey: true };
    await store.savePreferences(
      [
        {
          key: 'providers-v1',
          payload: JSON.stringify({ providers: [provider], defaultId: provider.id }),
          revision: null
        },
        { key: 'provider-keys-v1', payload: JSON.stringify({ [provider.id]: 'private-fixture' }), revision: null }
      ],
      true
    );
    await store.saveStudioDraft(plainPrompt('本机草稿'), null);
    const job = imageJob();
    await store.saveResult(job, await png());
    const snapshot = await collectProductSnapshot(store, []);
    expect(snapshot.entries.map(entry => entry.kind).sort()).toEqual(['draft', 'provider', 'work']);
    expect(JSON.stringify(snapshot)).not.toContain('private-fixture');
    const workspaceId = crypto.randomUUID();
    const records = snapshot.entries.map(entry => ({
      ...entry,
      id: crypto.randomUUID(),
      workspaceId,
      revision: 1,
      deleted: false
    }));
    const draft = records.find(record => record.kind === 'draft')!;
    const configuration = records.find(record => record.kind === 'provider')!;
    configuration.payload = {
      version: 1,
      name: '新公开配置',
      baseUrl: 'https://new.example.test/v1',
      model: 'image',
      mode: 'direct'
    };
    draft.deleted = true;
    await applyProductProjection(store, records, new Set([draft.id]), snapshot.versions);
    expect((await store.studioDraft())?.state).toEqual(plainPrompt('本机草稿'));
    const preferences = JSON.parse((await store.preference('providers-v1'))!.payload);
    expect(preferences.providers[0].rememberKey).toBe(false);
    expect((await store.list()).length).toBe(1);
    const current = await collectProductSnapshot(store, records);
    await applyProductProjection(store, records, new Set(), current.versions, new Set([draft.id]));
    expect((await store.studioDraft())?.state).toEqual(plainPrompt(''));
    expect((await store.list()).length).toBe(1);
  });
});
