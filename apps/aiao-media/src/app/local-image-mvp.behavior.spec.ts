import { TestBed } from '@angular/core/testing';
import type { EventEmitter } from 'node:events';
import { BehaviorSubject, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GenerationJobSummary } from '../contracts/index';
import { LocalMediaStore, type LocalWorkSummary } from '../local-data/index';
import type { WorkspaceRegistryState } from '../local-data/workspace-registry';
import { WorkspaceRegistryStore } from '../local-data/workspace-registry-store';
import { defaultFreeProvider } from './default-provider';
import { LocalImageMvp } from './local-image-mvp';
import type { LocalProvider } from './local-provider';
import * as providerApi from './local-provider';
import { ProductClient } from './product-client';
import { plainPrompt } from './prompts/prompt-state';
import { SupabaseAuthClient } from './supabase-auth';
import type { LibraryWork } from './work-library-session';

const cleanup: (() => void)[] = [];
const initialize = LocalImageMvp.prototype.ngOnInit;
const backupApi = vi.hoisted(() => ({
  createLocalBackup: vi.fn<(typeof import('./local-backup'))['createLocalBackup']>(),
  readLocalBackup: vi.fn<(typeof import('./local-backup'))['readLocalBackup']>()
}));
vi.mock('./local-backup', () => backupApi);

type LocalPreferenceChange = Parameters<LocalMediaStore['savePreferences']>[0][number];
type LockCallback = (lock: Lock | null) => unknown;

const profileId = '10000000-0000-4000-8000-000000000001';
const nextProfileId = '10000000-0000-4000-8000-000000000002';
const provider: LocalProvider = {
  id: '10000000-0000-4000-8000-000000000003',
  name: '测试供应商',
  baseUrl: 'https://provider.example',
  model: 'fixture-model',
  mode: 'direct',
  rememberKey: false
};
const job: GenerationJobSummary = {
  id: 'fixture-job',
  request: {
    kind: 'image',
    operation: 'text-to-image',
    providerInstanceId: provider.id,
    providerRevision: 1,
    modelId: provider.model,
    prompt: '测试图片',
    aspectRatio: 'square'
  },
  status: 'completed',
  createdAt: '2026-10-25T00:00:00Z',
  updatedAt: '2026-10-25T00:00:00Z',
  delivery: { status: 'available', expiresAt: null, acknowledgedAt: null },
  failure: null
};
const work: LibraryWork = {
  jobId: job.id,
  prompt: job.request.prompt,
  modelId: provider.model,
  bytes: 10,
  status: 'saved',
  viewKey: 'fixture-file',
  url: null,
  previewStatus: 'idle'
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function memoryStore() {
  const preferences = new Map<string, { payload: string; revision: number }>();
  preferences.set('providers-v1', {
    payload: JSON.stringify({ providers: [provider], defaultId: provider.id }),
    revision: 1
  });
  const works = new BehaviorSubject<LocalWorkSummary[]>([]);
  const count = new BehaviorSubject(0);
  const updates = new Subject<{ payload: string; revision: number } | null>();
  const draftUpdates = new Subject<null>();
  const syncedWorks = new Subject<[]>();
  const preference = vi.fn(async (key: string) => preferences.get(key) ?? null);
  const savePreferences = vi.fn(async (changes: readonly LocalPreferenceChange[]) =>
    changes.map(change => {
      const revision = (preferences.get(change.key)?.revision ?? 0) + 1;
      preferences.set(change.key, { payload: change.payload, revision });
      return revision;
    })
  );
  const store = {
    preference,
    savePreferences,
    ensurePreference: vi.fn(async (key: string, payload: string) => {
      if (!preferences.has(key)) preferences.set(key, { payload, revision: 1 });
      return preferences.get(key)!;
    }),
    savePreference: vi.fn(
      async (key: string, payload: string, revision: number | null) =>
        (await savePreferences([{ key, payload, revision }]))[0]
    ),
    collection: vi.fn(async (name: string) => {
      const value = preferences.get(name === 'providers' ? 'providers-v1' : 'tasks-v1');
      const rows: { id: string }[] =
        value ?
          name === 'providers' ?
            JSON.parse(value.payload).providers
          : JSON.parse(value.payload)
        : [];
      return rows.map(row => ({ sourceId: row.id, payload: JSON.stringify(row), status: 'ready' }));
    }),
    preference$: vi.fn(() => updates),
    studioDraft: vi.fn(async () => null),
    studioDraft$: vi.fn(() => draftUpdates),
    saveStudioDraft: vi.fn(async (state: Parameters<LocalMediaStore['saveStudioDraft']>[0]) => ({
      state,
      revision: 1
    })),
    works$: vi.fn(() => works),
    workCount$: vi.fn(() => count),
    syncedWorks$: vi.fn(() => syncedWorks),
    saveResult: vi.fn<() => Promise<void>>(async () => undefined),
    delete: vi.fn<() => Promise<void>>(async () => undefined),
    imageInfo: vi.fn<LocalMediaStore['imageInfo']>(),
    close: vi.fn(async () => undefined),
    release: vi.fn(),
    previewImage: vi.fn(async () => ({ url: 'blob:preview', mimeType: 'image/png' as const }))
  };
  return { store, preferences, works, count, updates, syncedWorks };
}

function rig() {
  const fixture = TestBed.createComponent(LocalImageMvp);
  fixture.changeDetectorRef.detach();
  const component = fixture.componentInstance;
  const memory = memoryStore();
  Object.assign(component, { store: memory.store, profileId });
  component.localStatus.set('ready');
  component.providers.set([provider]);
  component.providerId.set(provider.id);
  component.editorReady.set(true);
  component.promptState.set(plainPrompt('测试图片'));
  return { fixture, component, ...memory };
}

async function boot(
  prepare: (r: ReturnType<typeof rig>) => void = () => undefined,
  options: { rootOf?: WorkspaceRegistryStore['rootOf']; waitReady?: boolean } = {}
) {
  const r = rig();
  prepare(r);
  const state: WorkspaceRegistryState = {
    version: 1,
    generation: 0,
    selectedId: profileId,
    profiles: [
      { id: profileId, account: null, binding: null },
      { id: nextProfileId, account: null, binding: null }
    ]
  };
  let row = { payload: JSON.stringify(state), revision: 1 };
  const changes = new Subject<string | null>();
  const metadata = {
    rootOf: vi.fn(options.rootOf ?? (async () => profileId)),
    read: vi.fn(async () => row),
    write: vi.fn(async (_id: string, payload: string) => {
      row = { payload, revision: row.revision + 1 };
    }),
    watch: vi.fn(() => changes),
    close: vi.fn(async () => undefined)
  };
  vi.spyOn(LocalMediaStore, 'open').mockResolvedValue(r.store as unknown as LocalMediaStore);
  vi.spyOn(WorkspaceRegistryStore, 'open').mockResolvedValue(metadata as unknown as WorkspaceRegistryStore);
  initialize.call(r.component);
  if (options.waitReady !== false) {
    await vi.waitFor(() => expect(r.component.localStatus()).toBe('ready'));
    await vi.waitFor(() => expect(metadata.watch).toHaveBeenCalled());
  }
  return { ...r, metadata, changes };
}

beforeEach(() => {
  TestBed.overrideComponent(LocalImageMvp, { set: { template: '', imports: [] } });
  vi.spyOn(LocalImageMvp.prototype, 'ngOnInit').mockImplementation(() => undefined);
  localStorage.clear();
  backupApi.createLocalBackup.mockReset();
  backupApi.readLocalBackup.mockReset();
  history.replaceState(null, '', '/');
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('测试禁止真实网络')))
  );
  vi.stubGlobal('navigator', {
    userAgent: navigator.userAgent,
    locks: {
      request: vi.fn(async (name: string, options: LockOptions | LockCallback, callback?: LockCallback) =>
        (typeof options === 'function' ? options : callback!)({ name, mode: 'exclusive' })
      )
    },
    storage: { estimate: vi.fn(async () => ({ usage: 1048576, quota: 10485760 })), persist: vi.fn(async () => true) },
    clipboard: { writeText: vi.fn(async () => undefined) }
  });
  vi.stubGlobal('scrollTo', vi.fn());
  Object.defineProperty(URL, 'createObjectURL', {
    value: vi.fn(() => 'blob:result'),
    writable: true,
    configurable: true
  });
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), writable: true, configurable: true });
});
afterEach(() => {
  TestBed.resetTestingModule();
  for (const restore of cleanup.splice(0)) restore();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('local result lifecycle', () => {
  it('本机数据已打开但身份初始化未结束时不启动同步预览', async () => {
    vi.stubGlobal('__AIAO_SUPABASE_CONFIG__', { url: 'https://account.example', anonKey: 'sb_publishable_fixture' });
    vi.spyOn(SupabaseAuthClient.prototype, 'restore').mockResolvedValue(undefined);
    vi.spyOn(SupabaseAuthClient.prototype, 'subscribe').mockImplementation(listener => {
      listener({ status: 'signed-in', user: { id: profileId, email: 'fixture@example.test' }, message: '' });
      return () => undefined;
    });
    const authorization = vi.spyOn(ProductClient.prototype, 'authorization').mockRejectedValue(new Error('offline'));
    const pending = deferred<string>();
    let reads = 0;
    const rootOf = vi.fn(async () => (++reads === 2 ? pending.promise : profileId));
    const r = await boot(undefined, { rootOf, waitReady: false });
    await vi.waitFor(() => expect(rootOf).toHaveBeenCalledTimes(2));
    expect(r.component.localStatus()).toBe('opening');
    try {
      await r.component.enableSync();
      expect(authorization).not.toHaveBeenCalled();
      expect(r.component.authMessage()).toContain('尚未就绪');
    } finally {
      pending.resolve(profileId);
    }
    await vi.waitFor(() => expect(r.component.syncReady()).toBe(true));
    await r.component.enableSync();
    expect(authorization).toHaveBeenCalledOnce();
  });
  it('keeps a completed save in its original workspace when the user switches during the file write', async () => {
    const r = rig();
    const pending = deferred<void>();
    r.store.saveResult.mockReturnValue(pending.promise);
    r.component.job.set(job);
    Object.assign(r.component, { resultBlob: new Blob(['image']) });
    const saving = r.component.saveResult();
    const next = memoryStore();
    Object.assign(r.component, { store: next.store, epoch: 1 });
    r.component.job.set(null);
    pending.resolve();
    await saving;
    expect(next.store.savePreferences).not.toHaveBeenCalled();
    expect(r.component.job()).toBeNull();
    expect(r.component.saved()).toBe(false);
  });

  it('does not restore an old result after the user starts a new image during a save', async () => {
    const r = rig();
    const pending = deferred<void>();
    r.store.saveResult.mockReturnValue(pending.promise);
    r.component.job.set(job);
    Object.assign(r.component, { resultBlob: new Blob(['image']) });
    const saving = r.component.saveResult();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    r.component.newImage();
    pending.resolve();
    await saving;
    expect(r.component.job()).toBeNull();
    expect(r.component.saved()).toBe(false);
    expect(r.component.serialized().text).toBe('');
  });

  it('ignores a failed save from a workspace that has already closed', async () => {
    const r = rig();
    const pending = deferred<void>();
    r.store.saveResult.mockReturnValue(pending.promise);
    r.component.job.set(job);
    Object.assign(r.component, { resultBlob: new Blob(['image']) });
    const saving = r.component.saveResult();
    Object.assign(r.component, { store: memoryStore().store, epoch: 1 });
    r.component.storageMessage.set('当前工作区');
    pending.reject(new Error('old disk failed'));
    await saving;
    expect(r.component.storageMessage()).toBe('当前工作区');
  });
});

async function authorizeGeneration(r: ReturnType<typeof rig>) {
  r.component.editProvider(provider);
  r.component.apiKey.set('fixture-key');
  await r.component.saveProvider();
}

describe('workspace initialization and isolation', () => {
  it('opens registered local data, restores configuration and observes metadata without reading originals', async () => {
    const r = await boot();
    expect(r.component.currentProfileId()).toBe(profileId);
    expect(r.component.providers()).toEqual([provider]);
    expect(r.component.localWorksKnown()).toBe(true);
    expect(r.component.availableProfiles()).toHaveLength(2);
    expect(r.component.storageInfo()).toContain('1 MiB');
    expect(r.store.previewImage).not.toHaveBeenCalled();
    r.works.next([{ ...work }]);
    expect(r.component.works()).toHaveLength(1);
    r.updates.error(new Error('preferences unavailable'));
    expect(r.component.storageMessage()).toContain('读取失败');
    r.syncedWorks.error(new Error('sync unavailable'));
    expect(r.component.storageMessage()).toBe('同步作品信息暂不可读。');
    r.changes.error(new Error('registry unavailable'));
    expect(r.component.storageMessage()).toContain('当前副本保留');
  });

  it('switches between registered workspaces and clears the previous session key and result', async () => {
    const r = await boot();
    await authorizeGeneration(r);
    r.component.job.set(job);
    r.component.resultUrl.set('blob:previous');
    await r.component.selectWorkspace(nextProfileId);
    expect(r.component.currentProfileId()).toBe(nextProfileId);
    expect(r.component.job()).toBeNull();
    expect(r.component.resultUrl()).toBeNull();
    expect(r.component.serialized().text).toBe('');
    r.component.editProvider(provider);
    expect(r.component.apiKey()).toBe('');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:previous');
  });

  it('preserves data and reports incompatible schema failures when opening a workspace', async () => {
    const r = rig();
    vi.spyOn(WorkspaceRegistryStore, 'open').mockRejectedValue(
      Object.assign(new Error('new schema'), { code: 'incompatible' })
    );
    initialize.call(r.component);
    await vi.waitFor(() => expect(r.component.localStatus()).toBe('unavailable'));
    expect(r.component.storageMessage()).toContain('原数据未更改');
  });

  it('rejects invalid stored profile identifiers before opening a database', async () => {
    const r = rig();
    localStorage.setItem('aiao-local-profile-v1', 'invalid');
    const open = vi.spyOn(LocalMediaStore, 'open');
    initialize.call(r.component);
    await vi.waitFor(() => expect(r.component.localStatus()).toBe('unavailable'));
    expect(open).not.toHaveBeenCalled();
    expect(localStorage.getItem('aiao-local-profile-v1')).toBe('invalid');
  });

  it('reports a failed workspace switch while preserving the current copy', async () => {
    const r = await boot();
    await r.component.selectWorkspace('missing');
    expect(r.component.currentProfileId()).toBe(profileId);
    expect(r.component.storageMessage()).not.toBe('');
  });
});

describe('provider credentials', () => {
  it('stores public settings separately and keeps an unremembered key only in the current session', async () => {
    const r = rig();
    await authorizeGeneration(r);
    expect(r.preferences.get('providers-v1')?.payload).not.toContain('fixture-key');
    expect(r.preferences.get('provider-keys-v1')?.payload).toBe('{}');
    expect(r.component.providerMessage()).toContain('已保存到本机');
    r.component.editProvider(provider);
    expect(r.component.apiKey()).toBe('fixture-key');
    expect(r.component.providerBusy()).toBe(false);
  });

  it('persists a key only after explicit opt-in and removes it without deleting the provider', async () => {
    const r = rig();
    r.component.editProvider(provider);
    r.component.apiKey.set('remembered-fixture');
    r.component.rememberKey.set(true);
    await r.component.saveProvider();
    expect(JSON.parse(r.preferences.get('provider-keys-v1')!.payload)).toEqual({ [provider.id]: 'remembered-fixture' });
    r.component.editProvider(r.component.providers()[0]);
    await r.component.removeKey(r.component.providers()[0]);
    expect(r.component.providers()).toEqual([provider]);
    expect(r.component.apiKey()).toBe('');
    expect(r.component.rememberKey()).toBe(false);
    expect(r.preferences.get('provider-keys-v1')?.payload).toBe('{}');
  });

  it.each([
    ['providerName', ''],
    ['providerName', 'a'.repeat(81)],
    ['model', 'bad model'],
    ['apiKey', 'with space'],
    ['baseUrl', 'http://provider.example']
  ] as const)('rejects invalid %s before persisting', async (field, value) => {
    const r = rig();
    r.component.editProvider(provider);
    r.component[field].set(value);
    await r.component.saveProvider();
    expect(r.store.savePreferences).not.toHaveBeenCalled();
    expect(r.component.providerMessage()).not.toBe('');
    expect(r.component.providerBusy()).toBe(false);
  });

  it('replaces the seeded default when the first personal provider is saved', async () => {
    const r = rig();
    r.component.providers.set([defaultFreeProvider()]);
    r.component.providerId.set(defaultFreeProvider().id);
    r.component.providerName.set('个人供应商');
    r.component.baseUrl.set('https://personal.example/');
    r.component.model.set('personal-model');
    await r.component.saveProvider();
    expect(r.component.providers()).toHaveLength(1);
    expect(r.component.provider()?.name).toBe('个人供应商');
    expect(r.component.provider()?.baseUrl).toBe('https://personal.example');
  });

  it('refuses a 31st provider and allows edits to existing providers', async () => {
    const r = rig();
    r.component.providers.set(Array.from({ length: 30 }, (_, i) => ({ ...provider, id: String(i) })));
    r.component.editProvider(provider);
    r.component.editingId.set(null);
    await r.component.saveProvider();
    expect(r.component.providerMessage()).toContain('30');
    expect(r.store.savePreferences).not.toHaveBeenCalled();
  });

  it('cancels deletion without changing credentials or saved works', async () => {
    const r = rig();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await r.component.removeProvider(provider);
    expect(r.store.savePreferences).not.toHaveBeenCalled();
    expect(r.component.providers()).toEqual([provider]);
  });

  it('deletes a provider and its key, reinstating the credential-free local default', async () => {
    const r = rig();
    await authorizeGeneration(r);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await r.component.removeProvider(provider);
    expect(r.component.providers()).toEqual([defaultFreeProvider()]);
    expect(r.component.editingId()).toBeNull();
    expect(r.component.apiKey()).toBe('');
    expect(r.store.delete).not.toHaveBeenCalled();
  });

  it('keeps current settings when persistence fails and reports the failure', async () => {
    const r = rig();
    r.component.editProvider(provider);
    r.component.providerName.set('修改');
    r.store.savePreferences.mockRejectedValue(new Error('CAS conflict'));
    await r.component.saveProvider();
    expect(r.component.providers()).toEqual([provider]);
    expect(r.component.providerMessage()).toBe('CAS conflict');
    await r.component.chooseProvider('other');
    expect(r.component.providerId()).toBe(provider.id);
    expect(r.component.error()).toBe('CAS conflict');
    await r.component.removeKey(provider);
    expect(r.component.providerMessage()).toContain('移除 Key 未完成');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await r.component.removeProvider(provider);
    expect(r.component.providerMessage()).toBe('CAS conflict');
  });

  it('blocks configuration changes while generation or a workspace transition is active', async () => {
    const r = rig();
    r.component.sending.set(true);
    await r.component.saveProvider();
    await r.component.chooseProvider('other');
    await r.component.removeProvider(provider);
    await r.component.removeKey(provider);
    expect(r.store.savePreferences).not.toHaveBeenCalled();
  });
});

describe('generation and uncertain requests', () => {
  it('asks for a session key without sending a generation request', async () => {
    const r = rig();
    const generate = vi.spyOn(providerApi, 'generateLocalImage');
    await r.component.generate();
    expect(r.component.view()).toBe('providers');
    expect(r.component.providerMessage()).toContain('API Key');
    expect(generate).not.toHaveBeenCalled();
  });

  it('journals a single request before sending, then saves the returned image and completed task', async () => {
    const r = rig();
    await authorizeGeneration(r);
    const generate = vi.spyOn(providerApi, 'generateLocalImage').mockImplementation(async () => {
      const journal = JSON.parse(r.preferences.get('tasks-v1')!.payload);
      expect(journal[0].status).toBe('processing');
      return new Blob(['png'], { type: 'image/png' });
    });
    await r.component.generate();
    expect(generate).toHaveBeenCalledTimes(1);
    expect(r.store.saveResult).toHaveBeenCalledTimes(1);
    expect(r.component.job()).toMatchObject({ status: 'completed', saved: true });
    expect(r.component.resultUrl()).toBe('blob:result');
    expect(r.component.saved()).toBe(true);
    expect(r.component.sending()).toBe(false);
    expect(r.preferences.get('tasks-v1')?.payload).not.toContain('fixture-key');
  });

  it.each([new Error('network failed'), new providerApi.ProviderFailure('HTTP 502')])(
    'locks uncertain results and never redispatches automatically',
    async failure => {
      const r = rig();
      await authorizeGeneration(r);
      const generate = vi.spyOn(providerApi, 'generateLocalImage').mockRejectedValue(failure);
      await r.component.generate();
      await r.component.generate();
      expect(generate).toHaveBeenCalledTimes(1);
      expect(r.component.uncertain()).toBe(true);
      expect(r.component.job()?.status).toBe('needs_review');
      expect(r.component.canGenerate()).toBe(false);
    }
  );

  it('unlocks a definite rejection while preserving its failed journal', async () => {
    const r = rig();
    await authorizeGeneration(r);
    vi.spyOn(providerApi, 'generateLocalImage').mockRejectedValue(new providerApi.ProviderFailure('HTTP 401', true));
    await r.component.generate();
    expect(r.component.uncertain()).toBe(false);
    expect(r.component.job()?.status).toBe('failed');
    expect(r.component.error()).toBe('HTTP 401');
    expect(r.component.canGenerate()).toBe(true);
  });

  it('does not send when the submission journal cannot be saved', async () => {
    const r = rig();
    await authorizeGeneration(r);
    r.store.savePreferences.mockRejectedValue(new Error('disk full'));
    const generate = vi.spyOn(providerApi, 'generateLocalImage');
    await r.component.generate();
    expect(generate).not.toHaveBeenCalled();
    expect(r.component.error()).toBe('disk full');
  });

  it('does not send while another tab holds the generation lock', async () => {
    const r = rig();
    await authorizeGeneration(r);
    vi.mocked(navigator.locks.request).mockImplementation(async (_name, options, callback) =>
      (typeof options === 'function' ? options : callback!)(null)
    );
    const generate = vi.spyOn(providerApi, 'generateLocalImage');
    await r.component.generate();
    expect(generate).not.toHaveBeenCalled();
    expect(r.component.error()).toContain('另一标签页');
  });

  it('restores an unresolved journal and prevents a new request after reopening', async () => {
    const r = rig();
    await authorizeGeneration(r);
    r.preferences.set('tasks-v1', { payload: JSON.stringify([{ ...job, status: 'processing' }]), revision: 1 });
    const generate = vi.spyOn(providerApi, 'generateLocalImage');
    await r.component.generate();
    expect(generate).not.toHaveBeenCalled();
    expect(r.component.history()).toHaveLength(1);
    expect(r.component.uncertain()).toBe(true);
    expect(r.component.job()?.status).toBe('needs_review');
  });

  it('retains received bytes for download if local saving fails', async () => {
    const r = rig();
    await authorizeGeneration(r);
    const generate = vi.spyOn(providerApi, 'generateLocalImage').mockResolvedValue(new Blob(['png']));
    r.store.saveResult.mockRejectedValue(new Error('disk full'));
    await r.component.generate();
    expect(generate).toHaveBeenCalledTimes(1);
    expect(r.component.resultUrl()).toBe('blob:result');
    expect(r.component.saved()).toBe(false);
    expect(r.component.storageMessage()).toContain('请先下载');
  });

  it('ignores generation bytes that arrive after the component is destroyed', async () => {
    const r = rig();
    await authorizeGeneration(r);
    const pending = deferred<Blob>();
    const generate = vi.spyOn(providerApi, 'generateLocalImage').mockReturnValue(pending.promise);
    const operation = r.component.generate();
    await vi.waitFor(() => expect(generate).toHaveBeenCalled());
    r.component.ngOnDestroy();
    expect(generate.mock.calls[0][4].aborted).toBe(true);
    pending.resolve(new Blob(['late']));
    await operation;
    expect(r.store.saveResult).not.toHaveBeenCalled();
    expect(r.component.resultUrl()).toBeNull();
  });

  it('requires explicit acknowledgement before clearing an uncertain request', async () => {
    const r = rig();
    r.component.job.set({ ...job, status: 'needs_review' });
    r.component.uncertain.set(true);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await r.component.acknowledgeUnknown();
    expect(r.component.uncertain()).toBe(true);
    confirm.mockReturnValue(true);
    await r.component.acknowledgeUnknown();
    expect(r.component.uncertain()).toBe(false);
    expect(r.component.job()).toBeNull();
    expect(JSON.parse(r.preferences.get('tasks-v1')!.payload)[0].acknowledged).toBe(true);
  });
});

describe('drafts and browsing', () => {
  it('filters inspiration by category and all search words without changing the draft', () => {
    const { component } = rig();
    const template = component.templates()[0];
    component.search.set(template.title);
    expect(component.filtered()).toContain(template);
    component.search.set('nonexistent fixture');
    expect(component.filtered()).toEqual([]);
    expect(component.serialized().text).toBe('测试图片');
  });

  it('requires confirmation before a template replaces edited text and blocks it during generation', () => {
    const { component } = rig();
    component.onPromptChanged(plainPrompt('未保存的创作'));
    const template = component.templates()[0];
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    component.applyTemplate(template);
    expect(component.serialized().text).toBe('未保存的创作');
    confirm.mockReturnValue(true);
    component.applyTemplate(template);
    expect(component.selected()).toBe(template);
    expect(component.view()).toBe('studio');
    component.sending.set(true);
    component.applyTemplate(component.templates()[1]);
    expect(component.selected()).toBe(template);
    expect(component.toast()).toContain('当前图片任务');
  });

  it('keeps aspect ratio and reused prompt unchanged while a request is active', () => {
    const { component } = rig();
    component.setRatio('landscape');
    expect(component.ratio()).toBe('landscape');
    component.sending.set(true);
    component.setRatio('portrait');
    component.reuseWork(work);
    component.newImage();
    expect(component.ratio()).toBe('landscape');
    expect(component.serialized().text).toBe('测试图片');
  });

  it('reuses a saved prompt after confirmation without generating or deleting data', () => {
    const { component, store } = rig();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    component.reuseWork({ ...work, prompt: '作品提示词' });
    expect(component.serialized().text).toBe('测试图片');
    confirm.mockReturnValue(true);
    component.reuseWork({ ...work, prompt: '作品提示词' });
    expect(component.serialized().text).toBe('作品提示词');
    expect(component.selected()).toBeNull();
    expect(store.delete).not.toHaveBeenCalled();
  });

  it('validates library dates before replacing the current query and resets filters explicitly', async () => {
    const r = await boot();
    r.component.librarySearch.set('猫');
    r.component.libraryModel.set('fixture');
    r.component.filterLibrary(new Event('submit', { cancelable: true }));
    expect(r.store.works$.mock.calls.length).toBeGreaterThan(1);
    r.component.libraryFrom.set('2026-02-30');
    const before = r.store.works$.mock.calls.length;
    r.component.filterLibrary(new Event('submit'));
    expect(r.component.libraryFilterError()).not.toBe('');
    expect(r.store.works$).toHaveBeenCalledTimes(before);
    r.component.clearLibraryFilters();
    expect(r.component.librarySearch()).toBe('');
    expect(r.component.libraryFrom()).toBe('');
    expect(r.component.libraryFilterError()).toBe('');
    r.component.retryLibrary();
    expect(r.component.localWorksKnown()).toBe(true);
  });

  it('removes the current result only after deletion completes in the same workspace', async () => {
    const r = rig();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    r.component.job.set(job);
    r.component.saved.set(true);
    r.component.resultUrl.set('blob:saved');
    await r.component.deleteWork(work);
    expect(r.store.delete).toHaveBeenCalledWith(job.id);
    expect(r.component.job()).toBeNull();
    expect(r.component.saved()).toBe(false);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:saved');
  });

  it('does not clear the new workspace after a delayed delete', async () => {
    const r = rig();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const pending = deferred<void>();
    r.store.delete.mockReturnValue(pending.promise);
    const deleting = r.component.deleteWork(work);
    Object.assign(r.component, { epoch: 1 });
    r.component.job.set(job);
    pending.resolve();
    await deleting;
    expect(r.component.job()).toBe(job);
    expect(r.component.toast()).toBe('');
  });

  it('reports an unsuccessful explicit deletion while preserving the current result', async () => {
    const r = rig();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    r.store.delete.mockRejectedValue(new Error('disk busy'));
    r.component.job.set(job);
    await r.component.deleteWork(work);
    expect(r.component.job()).toBe(job);
    expect(r.component.storageMessage()).toContain('删除未完成');
  });

  it('reports persistence permission outcomes without clearing local data', async () => {
    const { component, store } = rig();
    await component.requestPersistence();
    expect(component.dataMessage()).toContain('已允许');
    vi.mocked(navigator.storage.persist).mockResolvedValue(false);
    await component.requestPersistence();
    expect(component.dataMessage()).toContain('暂未允许');
    vi.mocked(navigator.storage.persist).mockRejectedValue(new Error('unsupported'));
    await component.requestPersistence();
    expect(component.dataMessage()).toContain('不支持');
    expect(store.delete).not.toHaveBeenCalled();
  });

  it('handles feedback dialogs, clipboard failure and toast expiry', async () => {
    vi.useFakeTimers();
    const { component } = rig();
    component.authOpen.set(true);
    component.authPassword.set('secret');
    component.openFeedback();
    expect(component.authOpen()).toBe(false);
    expect(component.authPassword()).toBe('');
    await component.copyFeedback('反馈');
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('反馈');
    expect(component.toast()).toBe('反馈已复制');
    vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error('denied'));
    await component.copyFeedback('反馈');
    expect(component.toast()).toContain('手动复制');
    vi.advanceTimersByTime(3500);
    expect(component.toast()).toBe('');
    component.onEscape();
    expect(component.feedbackOpen()).toBe(false);
  });
});

function authRig() {
  const r = rig();
  const auth = {
    restore: vi.fn(async () => undefined),
    signIn: vi.fn<(email: string, password: string) => Promise<undefined>>(async () => undefined),
    signUp: vi.fn<(email: string, password: string) => Promise<undefined>>(async () => undefined),
    signOut: vi.fn(async () => undefined),
    dispose: vi.fn()
  };
  Object.assign(r.component, { auth });
  return { ...r, auth };
}

describe('account form and credential lifetime', () => {
  it('clears the password before awaiting authentication and blocks duplicate submissions', async () => {
    const r = authRig();
    const pending = deferred<undefined>();
    r.auth.signIn.mockReturnValue(pending.promise);
    r.component.authEmail.set(' fixture@example.test ');
    r.component.authPassword.set('fixture-password');
    r.component.authUser.set({ id: profileId, email: 'fixture@example.test' });
    const submitting = r.component.submitAuth();
    expect(r.component.authPassword()).toBe('');
    expect(r.component.authBusy()).toBe(true);
    await r.component.submitAuth();
    expect(r.auth.signIn).toHaveBeenCalledTimes(1);
    expect(r.auth.signIn).toHaveBeenCalledWith('fixture@example.test', 'fixture-password');
    pending.resolve(undefined);
    await submitting;
    expect(r.component.toast()).toBe('账号已登录');
    expect(r.component.authBusy()).toBe(false);
    expect(r.preferences.get('provider-keys-v1')).toBeUndefined();
  });

  it('switches between sign-in and sign-up while clearing password and old errors', async () => {
    const r = authRig();
    r.component.authPassword.set('old');
    r.component.authMessage.set('old error');
    r.component.toggleAuthMode();
    expect(r.component.authMode()).toBe('sign-up');
    expect(r.component.authPassword()).toBe('');
    expect(r.component.authMessage()).toBe('');
    await r.component.submitAuth();
    expect(r.auth.signUp).toHaveBeenCalledTimes(1);
    r.component.authBusy.set(true);
    r.component.toggleAuthMode();
    expect(r.component.authMode()).toBe('sign-up');
    r.component.authBusy.set(false);
    r.component.toggleAuthMode();
    expect(r.component.authMode()).toBe('sign-in');
  });

  it.each([new Error('账号不可用'), 'unknown'])(
    'preserves the local workspace on an authentication failure',
    async error => {
      const r = authRig();
      r.auth.signIn.mockRejectedValue(error);
      await r.component.submitAuth();
      expect(r.component.authMessage()).toContain(error instanceof Error ? '账号不可用' : '账号操作失败');
      expect(r.component.authBusy()).toBe(false);
      expect(r.store.delete).not.toHaveBeenCalled();
    }
  );

  it('signs out without deleting local data and reports an unconfirmed remote logout separately', async () => {
    const r = authRig();
    r.component.authPassword.set('secret');
    await r.component.signOut();
    expect(r.component.authPassword()).toBe('');
    expect(r.component.authMessage()).toContain('本机数据保留');
    r.auth.signOut.mockRejectedValue(new Error('offline'));
    await r.component.signOut();
    expect(r.component.authMessage()).toContain('远程退出未确认');
    expect(r.store.delete).not.toHaveBeenCalled();
  });

  it('opens only one account dialog and rechecks only an unverified session', async () => {
    const r = authRig();
    r.component.feedbackOpen.set(true);
    r.component.detail.set(r.component.templates()[0]);
    r.component.openAuth(new Event('click'));
    expect(r.component.authOpen()).toBe(true);
    expect(r.component.feedbackOpen()).toBe(false);
    expect(r.component.detail()).toBeNull();
    r.component.recheckAuth();
    expect(r.auth.restore).not.toHaveBeenCalled();
    r.component.authStatus.set('unverified');
    r.component.recheckAuth();
    expect(r.auth.restore).toHaveBeenCalledTimes(1);
    await r.component.restoreAuth();
    expect(r.auth.restore).toHaveBeenCalledTimes(2);
    r.component.onEscape();
    expect(r.component.authOpen()).toBe(false);
  });

  it('does not open or submit account forms when no account service is configured', async () => {
    const { component } = rig();
    component.openAuth();
    await component.submitAuth();
    await component.signOut();
    expect(() => component.adminApi.authorization()).toThrow('账号服务不可用');
    expect(component.authOpen()).toBe(false);
    expect(component.authBusy()).toBe(false);
  });

  it('keeps local creation available when deployment account configuration is invalid', async () => {
    vi.stubGlobal('__AIAO_SUPABASE_CONFIG__', { url: 'invalid', anonKey: 'invalid' });
    const r = await boot();
    expect(r.component.authConfigured()).toBe(false);
    expect(r.component.authConfigError()).toContain('本机创作仍可继续');
    expect(r.component.localStatus()).toBe('ready');
  });
});

const policyEntry = {
  id: provider.id,
  name: provider.name,
  baseUrl: provider.baseUrl,
  models: [provider.model],
  sizes: ['1024x1024', '1536x1024', '1024x1536'],
  enabled: true,
  direct: true,
  proxy: true
};
describe('runtime policy and catalog selection', () => {
  it.each(['square', 'landscape', 'portrait'] as const)(
    'checks the current policy before dispatching a %s image',
    async ratio => {
      const r = rig();
      await authorizeGeneration(r);
      r.component.authConfigured.set(true);
      r.component.ratio.set(ratio);
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify({ policy: { version: 1, revision: 3, providers: [policyEntry] } }))
      );
      vi.spyOn(providerApi, 'generateLocalImage').mockResolvedValue(new Blob(['png']));
      await r.component.generate();
      expect(r.component.providerPolicyVersion()).toBe(3);
      expect(r.component.saved()).toBe(true);
      expect(fetch).toHaveBeenCalledWith(
        '/api/provider-policies',
        expect.objectContaining({ cache: 'no-store', credentials: 'omit', redirect: 'error' })
      );
    }
  );

  it.each([
    { ...policyEntry, enabled: false },
    { ...policyEntry, direct: false },
    { ...policyEntry, models: ['another-model'] },
    { ...policyEntry, sizes: ['1024x1536'] },
    { ...policyEntry, baseUrl: 'https://another.example' }
  ])('blocks a disabled provider, channel, model or size before journaling a request', async entry => {
    const r = rig();
    await authorizeGeneration(r);
    r.component.authConfigured.set(true);
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ policy: { version: 1, revision: 1, providers: [entry] } }))
    );
    const generate = vi.spyOn(providerApi, 'generateLocalImage');
    await r.component.generate();
    expect(generate).not.toHaveBeenCalled();
    expect(r.preferences.get('tasks-v1')).toBeUndefined();
    expect(r.component.error()).toContain('未发送生成请求');
  });

  it.each([0, null, 1.5])('rejects invalid runtime revision %s before dispatch', async revision => {
    const r = rig();
    await authorizeGeneration(r);
    r.component.authConfigured.set(true);
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ policy: { version: 1, revision, providers: [policyEntry] } }))
    );
    const generate = vi.spyOn(providerApi, 'generateLocalImage');
    await r.component.generate();
    expect(generate).not.toHaveBeenCalled();
    expect(r.component.error()).toContain('版本无效');
  });

  it('allows local provider settings if the service explicitly has no runtime policy', async () => {
    const r = rig();
    await authorizeGeneration(r);
    r.component.authConfigured.set(true);
    vi.mocked(fetch).mockResolvedValue(new Response('{"policy":null}'));
    vi.spyOn(providerApi, 'generateLocalImage').mockResolvedValue(new Blob(['png']));
    await r.component.generate();
    expect(r.component.providerPolicy()).toBeNull();
    expect(r.component.providerPolicyVersion()).toBeNull();
    expect(r.component.saved()).toBe(true);
  });

  it('preserves the draft and does not dispatch when runtime policy cannot be read', async () => {
    const r = rig();
    await authorizeGeneration(r);
    r.component.authConfigured.set(true);
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 503 }));
    const generate = vi.spyOn(providerApi, 'generateLocalImage');
    await r.component.generate();
    expect(generate).not.toHaveBeenCalled();
    expect(r.component.serialized().text).toBe('测试图片');
    expect(r.component.error()).toContain('策略暂不可确认');
  });

  it('merges published templates with built-in inspiration and retains the selected revision', async () => {
    vi.stubGlobal('__AIAO_SUPABASE_CONFIG__', { url: 'https://account.example', anonKey: 'sb_publishable_fixture' });
    vi.spyOn(SupabaseAuthClient.prototype, 'restore').mockResolvedValue(undefined);
    const published = { ...rig().component.templates()[0], id: 'published-fixture', title: '在线模板' };
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ templates: [{ template: published, revision: 7 }] }))
    );
    const r = await boot();
    await vi.waitFor(() => expect(r.component.templates().some(template => template.id === published.id)).toBe(true));
    expect(r.component.templates().length).toBeGreaterThan(1);
    r.component.applyTemplate(published);
    expect(r.component.selectedVersion()).toBe(7);
  });

  it.each([{ templates: null }, { templates: [{ template: null, revision: 1 }] }])(
    'retains built-in inspiration when the published catalog is invalid',
    async data => {
      vi.stubGlobal('__AIAO_SUPABASE_CONFIG__', { url: 'https://account.example', anonKey: 'sb_publishable_fixture' });
      vi.spyOn(SupabaseAuthClient.prototype, 'restore').mockResolvedValue(undefined);
      vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(data)));
      const r = await boot();
      await vi.waitFor(() => expect(r.component.catalogMessage()).toContain('内置灵感'));
      expect(r.component.templates().length).toBeGreaterThan(0);
    }
  );
});

describe('late task journal updates', () => {
  it('does not publish an old journal or saved result after switching workspaces during the journal write', async () => {
    const r = rig();
    const pending = deferred<number[]>();
    r.store.savePreferences.mockReturnValue(pending.promise);
    r.component.job.set(job);
    Object.assign(r.component, { resultBlob: new Blob(['image']) });
    const saving = r.component.saveResult();
    await vi.waitFor(() => expect(r.store.savePreferences).toHaveBeenCalled());
    const next = memoryStore();
    Object.assign(r.component, { store: next.store, epoch: 1 });
    r.component.job.set(null);
    pending.resolve([1]);
    await saving;
    expect(r.component.history()).toEqual([]);
    expect(r.component.job()).toBeNull();
    expect(r.component.saved()).toBe(false);
    expect(next.store.savePreferences).not.toHaveBeenCalled();
  });

  it('keeps current errors untouched if a journal write fails after the old image was abandoned', async () => {
    const r = rig();
    const pending = deferred<number[]>();
    r.store.savePreferences.mockReturnValue(pending.promise);
    r.component.job.set(job);
    Object.assign(r.component, { resultBlob: new Blob(['image']) });
    const saving = r.component.saveResult();
    await vi.waitFor(() => expect(r.store.savePreferences).toHaveBeenCalled());
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    r.component.newImage();
    r.component.storageMessage.set('当前创作');
    pending.reject(new Error('old journal failed'));
    await saving;
    expect(r.component.storageMessage()).toBe('当前创作');
    expect(r.component.job()).toBeNull();
  });
});

describe('settings recovery and metadata details', () => {
  it('seeds a missing local configuration without persisting a credential', async () => {
    const r = await boot(r => r.preferences.delete('providers-v1'));
    expect(r.component.providers()).toEqual([defaultFreeProvider()]);
    expect(r.component.providerId()).toBe(defaultFreeProvider().id);
    expect(r.preferences.get('provider-keys-v1')).toBeUndefined();
  });

  it.each(['https://ai.junflow.cn', 'https://ai.pengdevs.com'])(
    'migrates only the built-in legacy URL %s to the approved relay',
    async baseUrl => {
      const r = await boot(r =>
        r.preferences.set('providers-v1', {
          payload: JSON.stringify({
            providers: [{ ...defaultFreeProvider(), baseUrl, mode: 'direct' }],
            defaultId: defaultFreeProvider().id
          }),
          revision: 1
        })
      );
      expect(r.component.providers()).toEqual([defaultFreeProvider()]);
      expect(r.store.savePreference).toHaveBeenCalled();
    }
  );

  it('repairs an absent default selection and restores only explicitly remembered keys', async () => {
    const r = await boot(r => {
      r.preferences.set('providers-v1', {
        payload: JSON.stringify({ providers: [{ ...provider, rememberKey: true }], defaultId: 'missing' }),
        revision: 1
      });
      r.preferences.set('provider-keys-v1', {
        payload: JSON.stringify({ [provider.id]: 'remembered-key' }),
        revision: 1
      });
    });
    expect(r.component.providerId()).toBe(provider.id);
    r.component.editProvider(r.component.providers()[0]);
    expect(r.component.apiKey()).toBe('remembered-key');
    expect(r.component.rememberKey()).toBe(true);
  });

  it('keeps unremembered credential entries out of a reopened form', async () => {
    const r = await boot(r =>
      r.preferences.set('provider-keys-v1', { payload: JSON.stringify({ [provider.id]: 'orphan-key' }), revision: 1 })
    );
    r.component.editProvider(provider);
    expect(r.component.apiKey()).toBe('');
  });

  it('resolves an empty provider selection without manufacturing a provider in an existing empty configuration', async () => {
    const r = await boot(r =>
      r.preferences.set('providers-v1', { payload: '{"providers":[],"defaultId":""}', revision: 1 })
    );
    expect(r.component.providers()).toEqual([]);
    expect(r.component.providerId()).toBe('');
    expect(r.component.canGenerate()).toBe(false);
  });

  it('clears a resolved processing task without changing a completed current result', async () => {
    const r = await boot(r => {
      r.component.job.set({ ...job, status: 'needs_review' });
      r.preferences.set('tasks-v1', { payload: JSON.stringify([{ ...job, acknowledged: true }]), revision: 1 });
    });
    expect(r.component.uncertain()).toBe(false);
    expect(r.component.history()).toHaveLength(1);
    expect(r.component.job()).toBeNull();
    r.component.job.set(job);
    r.updates.next(null);
    await vi.waitFor(() => expect(r.component.history()).toHaveLength(1));
    expect(r.component.job()).toBe(job);
  });

  it('reads file details only when an existing current card is expanded and retains verified details across preview updates', async () => {
    const r = await boot();
    r.works.next([work]);
    const current = r.component.libraryPage().works[0];
    const details = document.createElement('details');
    const event = new Event('toggle');
    Object.defineProperty(event, 'target', { value: details });
    await r.component.loadWorkInfo(current, event);
    expect(r.store.imageInfo).not.toHaveBeenCalled();
    const info = {
      mimeType: 'image/png' as const,
      width: 64,
      height: 64,
      bytes: 10,
      sha256: 'fixture',
      providerInstanceId: provider.id
    };
    r.store.imageInfo.mockResolvedValue(info);
    details.open = true;
    await r.component.loadWorkInfo(current, event);
    expect(r.component.libraryPage().works[0].info).toEqual(info);
    await r.component.loadWorkInfo(r.component.libraryPage().works[0], event);
    expect(r.store.imageInfo).toHaveBeenCalledTimes(1);
    r.component.view.set('library');
    r.component.libraryVisibility(current, true);
    await vi.waitFor(() => expect(r.component.libraryPage().works[0].url).toBe('blob:preview'));
    expect(r.component.libraryPage().works[0].info).toEqual(info);
    r.component.onPopState();
    expect(r.store.release).toHaveBeenCalledWith('blob:preview');
  });

  it('ignores file details that arrive after a workspace change', async () => {
    const r = rig();
    const pending = deferred<Awaited<ReturnType<LocalMediaStore['imageInfo']>>>();
    r.store.imageInfo.mockReturnValue(pending.promise);
    r.component.libraryPage.update(page => ({ ...page, works: [work] }));
    const event = new Event('toggle');
    Object.defineProperty(event, 'target', { value: { open: true } });
    const loading = r.component.loadWorkInfo(work, event);
    Object.assign(r.component, { epoch: 1 });
    pending.resolve({
      mimeType: 'image/png',
      width: 64,
      height: 64,
      bytes: 10,
      sha256: 'fixture',
      providerInstanceId: provider.id
    });
    await loading;
    expect(r.component.libraryPage().works[0].info).toBeUndefined();
  });

  it('reports an unreadable original only while its matching card still exists', async () => {
    const r = rig();
    r.component.libraryPage.update(page => ({ ...page, works: [work] }));
    r.store.imageInfo.mockRejectedValue(new Error('unreadable'));
    const event = new Event('toggle');
    Object.defineProperty(event, 'target', { value: { open: true } });
    await r.component.loadWorkInfo(work, event);
    expect(r.component.toast()).toContain('无法核验文件信息');
    r.component.toast.set('');
    r.component.libraryPage.update(page => ({ ...page, works: [] }));
    await r.component.loadWorkInfo(work, event);
    expect(r.component.toast()).toBe('');
  });

  it('rejects out-of-range or loading pages and ignores stale visibility callbacks', async () => {
    const r = await boot();
    r.count.next(50);
    expect(r.component.libraryPages()).toBe(3);
    const before = r.store.works$.mock.calls.length;
    r.component.libraryGo(0);
    r.component.libraryGo(4);
    expect(r.store.works$).toHaveBeenCalledTimes(before);
    r.component.libraryGo(2);
    expect(r.store.works$).toHaveBeenCalledTimes(before + 1);
    r.component.libraryPage.update(page => ({ ...page, loading: true }));
    r.component.libraryGo(1);
    expect(r.store.works$).toHaveBeenCalledTimes(before + 1);
    r.component.libraryVisibility(work, true);
    r.component.view.set('library');
    r.component.libraryVisibility(work, true);
    expect(r.store.previewImage).not.toHaveBeenCalled();
  });

  it('keeps a cancelled new-image action and rejects an acknowledgement that cannot be saved', async () => {
    const r = rig();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    r.component.newImage();
    expect(r.component.serialized().text).toBe('测试图片');
    vi.mocked(window.confirm).mockReturnValue(true);
    r.component.job.set({ ...job, status: 'needs_review' });
    r.component.uncertain.set(true);
    r.store.savePreferences.mockRejectedValue(new Error('journal unavailable'));
    await r.component.acknowledgeUnknown();
    expect(r.component.uncertain()).toBe(true);
    expect(r.component.error()).toContain('无法保存核对记录');
  });
});

function backupFile() {
  const input = document.createElement('input');
  input.type = 'file';
  Object.defineProperty(input, 'files', {
    value: [new File(['fixture'], 'backup.json', { type: 'application/json' })]
  });
  const event = new Event('change');
  Object.defineProperty(event, 'target', { value: input });
  return { event, input };
}
function verifiedBackup() {
  const backup = {
    format: 'aiao-local-backup' as const,
    version: 1 as const,
    createdAt: job.createdAt,
    providers: [provider],
    defaultId: provider.id,
    draft: plainPrompt('恢复草稿'),
    tasks: [job],
    images: [{ job, base64: 'Zml4dHVyZQ==', sha256: 'fixture' }]
  };
  const result = { backup, files: [new Blob(['image'])], digest: 'fixture-digest' };
  backupApi.readLocalBackup.mockResolvedValue(result);
  localStorage.setItem('aiao-local-profile-v1', profileId);
  const next = memoryStore();
  const open = vi.spyOn(LocalMediaStore, 'open').mockResolvedValue(next.store as unknown as LocalMediaStore);
  const reload = vi.fn();
  const { virtualConsole } = Reflect.get(globalThis, 'jsdom') as { virtualConsole: EventEmitter };
  const listeners = virtualConsole.listeners('jsdomError') as ((error: Error) => void)[];
  virtualConsole.removeAllListeners('jsdomError');
  virtualConsole.on('jsdomError', (error: Error) => {
    expect(error.message).toContain('Not implemented: navigation');
    reload();
  });
  cleanup.push(() => {
    virtualConsole.removeAllListeners('jsdomError');
    for (const listener of listeners) virtualConsole.on('jsdomError', listener);
  });
  return { next, open, reload, ...result };
}

describe('backup workspace handoff', () => {
  it('exports a verified backup under the generation lock and eventually releases the download URL', async () => {
    vi.useFakeTimers();
    const r = rig();
    backupApi.createLocalBackup.mockResolvedValue(new Blob(['backup']));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    await r.component.exportBackup();
    expect(backupApi.createLocalBackup).toHaveBeenCalledWith(r.store, [provider], provider.id, []);
    expect(click).toHaveBeenCalledTimes(1);
    expect(r.component.dataMessage()).toContain('不含 API Key');
    expect(r.component.dataBusy()).toBe(false);
    vi.advanceTimersByTime(60000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:result');
  });

  it('refuses export while another tab is generating', async () => {
    const r = rig();
    vi.mocked(navigator.locks.request).mockImplementation(async (_name, options, callback) =>
      (typeof options === 'function' ? options : callback!)(null)
    );
    await r.component.exportBackup();
    expect(backupApi.createLocalBackup).not.toHaveBeenCalled();
    expect(r.component.dataMessage()).toContain('另一标签页正在生成');
    expect(r.component.dataBusy()).toBe(false);
  });

  it('reports a failed export without modifying or deleting existing data', async () => {
    const r = rig();
    backupApi.createLocalBackup.mockRejectedValue(new Error('original unavailable'));
    await r.component.exportBackup();
    expect(r.component.dataMessage()).toBe('original unavailable');
    expect(r.store.delete).not.toHaveBeenCalled();
  });

  it('does not start backup operations while an image request is active', async () => {
    const r = rig();
    r.component.sending.set(true);
    await r.component.exportBackup();
    const file = backupFile();
    await r.component.importBackup(file.event);
    expect(file.input.value).toBe('');
    expect(backupApi.createLocalBackup).not.toHaveBeenCalled();
    expect(backupApi.readLocalBackup).not.toHaveBeenCalled();
  });

  it('restores verified files and draft into an isolated workspace before changing the selected profile', async () => {
    const r = rig();
    const verified = verifiedBackup();
    await r.component.importBackup(backupFile().event);
    expect(verified.next.store.saveResult).toHaveBeenCalledWith(job, verified.files[0]);
    expect(verified.next.store.saveStudioDraft).toHaveBeenCalledWith(verified.backup.draft, null);
    expect(JSON.parse(verified.next.preferences.get('tasks-v1')!.payload)[0].saved).toBe(true);
    expect(localStorage.getItem('aiao-local-previous-profile-v1')).toBe(profileId);
    expect(localStorage.getItem('aiao-local-profile-v1')).toBe(verified.open.mock.calls[0][0]);
    expect(localStorage.getItem('aiao-local-import-staging-v1')).toBeNull();
    expect(verified.reload).toHaveBeenCalledTimes(1);
    expect(r.store.saveResult).not.toHaveBeenCalled();
  });

  it('keeps the original selected workspace and resumes the same staging copy after a file write failure', async () => {
    const r = rig();
    const verified = verifiedBackup();
    verified.next.store.saveResult.mockRejectedValueOnce(new Error('disk full'));
    await r.component.importBackup(backupFile().event);
    const stagedId = JSON.parse(localStorage.getItem('aiao-local-import-staging-v1')!).id;
    expect(localStorage.getItem('aiao-local-profile-v1')).toBe(profileId);
    expect(verified.reload).not.toHaveBeenCalled();
    expect(verified.next.store.close).toHaveBeenCalledTimes(1);
    expect(r.component.dataMessage()).toBe('disk full');
    await r.component.importBackup(backupFile().event);
    expect(verified.open.mock.calls.map(([id]) => id)).toEqual([stagedId, stagedId]);
    expect(verified.reload).toHaveBeenCalledTimes(1);
  });

  it.each([profileId, 'invalid-id', nextProfileId])('does not reuse an unsafe staging identity %s', async stagedId => {
    const r = rig();
    const verified = verifiedBackup();
    localStorage.setItem('aiao-local-previous-profile-v1', nextProfileId);
    localStorage.setItem('aiao-local-import-staging-v1', JSON.stringify({ digest: verified.digest, id: stagedId }));
    await r.component.importBackup(backupFile().event);
    expect(verified.open.mock.calls[0][0]).not.toBe(stagedId);
  });

  it('stops importing if another window already changed the active workspace', async () => {
    const r = rig();
    const verified = verifiedBackup();
    localStorage.setItem('aiao-local-profile-v1', nextProfileId);
    await r.component.importBackup(backupFile().event);
    expect(verified.open).not.toHaveBeenCalled();
    expect(localStorage.getItem('aiao-local-profile-v1')).toBe(nextProfileId);
    expect(r.component.dataMessage()).toContain('工作区已变化');
  });

  it('rejects an unreadable backup before opening a staging database', async () => {
    const r = rig();
    const open = vi.spyOn(LocalMediaStore, 'open');
    backupApi.readLocalBackup.mockRejectedValue(new Error('invalid backup digest'));
    await r.component.importBackup(backupFile().event);
    expect(open).not.toHaveBeenCalled();
    expect(r.component.dataBusy()).toBe(false);
    expect(r.component.dataMessage()).toBe('invalid backup digest');
  });
});

describe('explicit remote mutations', () => {
  it('requires confirmation before rescanning, task reporting or deleting the remote draft', async () => {
    const r = rig();
    const product = {
      synchronize: vi.fn(async () => undefined),
      reportTasks: vi.fn(async () => undefined),
      deleteDraft: vi.fn(async () => undefined),
      close: vi.fn()
    };
    Object.assign(r.component, { product });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await r.component.rescanSync();
    await r.component.reportTasks();
    await r.component.deleteSyncedDraft();
    expect(product.synchronize).not.toHaveBeenCalled();
    expect(product.reportTasks).not.toHaveBeenCalled();
    expect(product.deleteDraft).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await r.component.rescanSync();
    await r.component.reportTasks();
    await r.component.deleteSyncedDraft();
    expect(product.synchronize).toHaveBeenCalledWith({ rescan: true });
    expect(product.reportTasks).toHaveBeenCalledTimes(1);
    expect(product.deleteDraft).toHaveBeenCalledTimes(1);
    expect(r.store.delete).not.toHaveBeenCalled();
    expect(r.component.serialized().text).toBe('测试图片');
  });

  it('renders retained deletion, empty draft and public provider conflicts without private fields', () => {
    const { component } = rig();
    const record = {
      id: profileId,
      sourceId: 'main',
      workspaceId: profileId,
      revision: 1,
      deleted: false,
      kind: 'draft' as const,
      payload: { version: 1 as const, state: plainPrompt('本机草稿') }
    };
    expect(component.conflictPreview(null)).toBe('同步端记录暂不可读');
    expect(component.conflictPreview({ ...record, deleted: true })).toBe('已删除');
    expect(component.conflictPreview(record)).toBe('本机草稿');
    expect(component.conflictPreview({ ...record, payload: { version: 1, state: plainPrompt('') } })).toBe('空草稿');
    for (const mode of ['direct', 'proxy'] as const) {
      const preview = component.conflictPreview({
        ...record,
        kind: 'provider',
        payload: {
          version: 1,
          name: provider.name,
          baseUrl: provider.baseUrl,
          model: provider.model,
          mode
        }
      });
      expect(preview).toContain(mode === 'direct' ? '直连' : '代理');
      expect(preview).toContain(provider.model);
    }
  });
});
