import { publicProvider, type LocalProvider } from '../app/local-provider';
import { validateSyncPayload } from '../contracts/product-data.mjs';
import type { LocalMediaStore, StudioPromptState } from './index';
import type { ProductEntry, ProductRecord } from './product-sync-store';

export interface ProductSnapshot {
  entries: ProductEntry[];
  localWorkIds: string[];
  versions: { draft: number | null; providers: number | null };
}
function providers(payload: string | null): { providers: LocalProvider[]; defaultId: string } {
  if (payload === null) return { providers: [], defaultId: '' };
  const value = JSON.parse(payload) as { providers: unknown[]; defaultId: string };
  if (!Array.isArray(value.providers) || value.providers.length > 30 || typeof value.defaultId !== 'string')
    throw new Error('本机供应商目录不可读。');
  return { providers: value.providers.map(publicProvider), defaultId: value.defaultId };
}

export async function collectProductSnapshot(
  store: LocalMediaStore,
  existing: ProductRecord[]
): Promise<ProductSnapshot> {
  const draft = await store.studioDraft(),
    preference = await store.preference('providers-v1'),
    works = await store.list();
  const configuration = providers(preference?.payload ?? null);
  const entries: ProductEntry[] = configuration.providers.map(provider => ({
    kind: 'provider',
    sourceId: provider.id,
    payload: validateSyncPayload('provider', {
      version: 1,
      name: provider.name,
      baseUrl: provider.baseUrl,
      model: provider.model,
      mode: provider.mode
    })
  }));
  if (draft) entries.push({ kind: 'draft', sourceId: 'main', payload: { version: 1, state: draft.state } });
  for (const work of works) {
    if (work.status !== 'saved') continue;
    const prior = existing.find(record => record.kind === 'work' && record.sourceId === work.jobId);
    const info = prior ? null : await store.imageInfo(work.jobId);
    const payload =
      prior ?
        validateSyncPayload('work', prior.payload)
      : validateSyncPayload('work', {
          version: 1,
          jobId: work.jobId,
          prompt: work.prompt,
          modelId: work.modelId,
          providerInstanceId: info!.providerInstanceId,
          mimeType: 'image/png',
          width: info!.width,
          height: info!.height,
          bytes: work.bytes,
          sha256: info!.sha256,
          createdAt: work.createdAt
        });
    entries.push({ kind: 'work', sourceId: work.jobId, payload });
  }
  return {
    entries,
    localWorkIds: works.map(work => work.jobId),
    versions: { draft: draft?.revision ?? null, providers: preference?.revision ?? null }
  };
}

export async function applyProductProjection(
  store: LocalMediaStore,
  records: ProductRecord[],
  blocked: Set<string>,
  versions: ProductSnapshot['versions'],
  forceRemote = new Set<string>()
): Promise<void> {
  const current = providers((await store.preference('providers-v1'))?.payload ?? null);
  const byId = new Map(current.providers.map(provider => [provider.id, provider]));
  const publicProviders = records
    .filter(record => record.kind === 'provider' && !blocked.has(record.id) && !record.deleted)
    .map(record => {
      const value = validateSyncPayload('provider', record.payload),
        local = byId.get(record.sourceId);
      return {
        id: record.sourceId,
        name: value.name,
        baseUrl: value.baseUrl,
        model: value.model,
        mode: value.mode,
        rememberKey: local?.baseUrl === value.baseUrl && local.rememberKey
      };
    });
  const blockedIds = new Set(
    records.filter(record => record.kind === 'provider' && blocked.has(record.id)).map(record => record.sourceId)
  );
  const next = [...current.providers.filter(provider => blockedIds.has(provider.id)), ...publicProviders];
  const defaultId = next.some(provider => provider.id === current.defaultId) ? current.defaultId : (next[0]?.id ?? '');
  const draft = records.find(
    record => record.kind === 'draft' && record.sourceId === 'main' && !blocked.has(record.id)
  );
  const metadata = records
    .filter(record => record.kind === 'work' && !blocked.has(record.id) && !record.deleted)
    .map(record => validateSyncPayload('work', record.payload));
  const blockedWorkIds = new Set(
    records.filter(record => record.kind === 'work' && blocked.has(record.id)).map(record => record.sourceId)
  );
  const retained = (await store.syncedWorks()).filter(work => blockedWorkIds.has(work.jobId));
  const empty: StudioPromptState = {
    document: { type: 'doc', content: [{ type: 'paragraph', content: [] }] },
    fields: [],
    values: {}
  };
  const state =
    draft && !draft.deleted ? validateSyncPayload('draft', draft.payload).state
    : draft && forceRemote.has(draft.id) ? empty
    : null;
  await store.applyProjection({
    collections: true,
    preferences: [
      { key: 'providers-v1', payload: JSON.stringify({ providers: next, defaultId }), revision: versions.providers }
    ],
    works: [...retained, ...metadata],
    ...(state ? { draft: { state, revision: versions.draft } } : {})
  });
}
