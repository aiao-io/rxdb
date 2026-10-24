import { plainPrompt, serializePrompt } from '../app/prompts/prompt-state.ts';
import { ownedStudioPrompt } from '../local-data/studio-draft.ts';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail = () => {
  throw new Error('产品数据格式无效或包含私有字段。');
};
function object(value, required, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const allowed = new Set([...required, ...optional]);
  if (Reflect.ownKeys(value).some(key => !allowed.has(key)) || required.some(key => !Object.hasOwn(value, key)))
    return fail();
  if (Object.values(Object.getOwnPropertyDescriptors(value)).some(descriptor => !('value' in descriptor)))
    return fail();
  return value;
}
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const integer = (value, max) => Number.isSafeInteger(value) && value >= 0 && value <= max;
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
export async function productRecordId(workspaceId, kind, sourceId) {
  if (
    !uuid.test(workspaceId) ||
    !['draft', 'provider', 'work'].includes(kind) ||
    !(uuid.test(sourceId) || (kind === 'draft' && sourceId === 'main'))
  )
    return fail();
  const namespace = Uint8Array.from(workspaceId.replaceAll('-', '').match(/../g), value => Number.parseInt(value, 16));
  const name = new TextEncoder().encode(`${kind}:${sourceId}`);
  const input = new Uint8Array(namespace.length + name.length);
  input.set(namespace);
  input.set(name, namespace.length);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', input)).slice(0, 16);
  digest[6] = (digest[6] & 15) | 80;
  digest[8] = (digest[8] & 63) | 128;
  const hex = Array.from(digest, value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function https(value) {
  if (!text(value, 2048)) return false;
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash;
}

export function validateSyncPayload(kind, input) {
  if (kind === 'draft') {
    const value = object(input, ['version', 'state']);
    if (value.version !== 1) return fail();
    return { version: 1, state: ownedStudioPrompt(value.state) };
  }
  if (kind === 'provider') {
    const value = object(input, ['version', 'name', 'baseUrl', 'model', 'mode']);
    if (
      value.version !== 1 ||
      !text(value.name, 80) ||
      !https(value.baseUrl) ||
      !/^[a-zA-Z0-9._:-]{1,128}$/.test(value.model) ||
      !['direct', 'proxy'].includes(value.mode)
    )
      return fail();
    return structuredClone(value);
  }
  if (kind !== 'work') return fail();
  const value = object(input, [
    'version',
    'jobId',
    'prompt',
    'modelId',
    'providerInstanceId',
    'mimeType',
    'width',
    'height',
    'bytes',
    'sha256',
    'createdAt'
  ]);
  if (
    value.version !== 1 ||
    !uuid.test(value.jobId) ||
    !uuid.test(value.providerInstanceId) ||
    !text(value.prompt, 4000) ||
    !text(value.modelId, 128) ||
    value.mimeType !== 'image/png' ||
    !integer(value.width, 4096) ||
    !value.width ||
    !integer(value.height, 4096) ||
    !value.height ||
    !integer(value.bytes, 16 * 1024 * 1024) ||
    !value.bytes ||
    !/^[a-f0-9]{64}$/.test(value.sha256) ||
    !timestamp(value.createdAt)
  )
    return fail();
  return structuredClone(value);
}
export function productPayloadText(kind, input) {
  const sorted = value =>
    Array.isArray(value) ? value.map(sorted)
    : value && typeof value === 'object' ?
      Object.fromEntries(
        Object.keys(value)
          .sort()
          .map(key => [key, sorted(value[key])])
      )
    : value;
  return JSON.stringify(sorted(validateSyncPayload(kind, input)));
}

export function validatePublishedTemplate(input) {
  const value = object(
    input,
    [
      'id',
      'title',
      'purpose',
      'style',
      'tags',
      'prompt',
      'image',
      'alt',
      'updatedAt',
      'author',
      'source',
      'rights',
      'referenceModel',
      'needsReference',
      'featuredRank'
    ],
    ['templateDocument', 'fields']
  );
  if (!/^[a-z][a-z0-9-]{0,59}$/.test(value.id)) return fail();
  for (const key of ['title', 'purpose', 'style', 'prompt', 'alt', 'author', 'source'])
    if (!text(value[key], 10000)) return fail();
  if (
    !Array.isArray(value.tags) ||
    value.tags.length > 20 ||
    value.tags.some(tag => !text(tag, 60)) ||
    typeof value.needsReference !== 'boolean' ||
    (value.referenceModel !== null && !text(value.referenceModel, 128)) ||
    (value.featuredRank !== null && !integer(value.featuredRank, 1000000)) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value.updatedAt) ||
    new Date(value.updatedAt).toISOString().slice(0, 10) !== value.updatedAt
  )
    return fail();
  const original = value.rights === 'aiao-original-text-and-svg' && /^\/prompt-art\/[a-z0-9-]+\.svg$/.test(value.image);
  const reference =
    value.rights === 'community-reference' &&
    /^\/image-examples\/[a-z0-9-]+\.jpg$/.test(value.image) &&
    https(value.source) &&
    ['github.com', 'x.com'].includes(new URL(value.source).hostname);
  if (!original && !reference) return fail();
  const fields = value.fields ?? [];
  const state = ownedStudioPrompt({
    document: value.templateDocument ?? plainPrompt(value.prompt).document,
    fields,
    values: Object.fromEntries(fields.map(field => [field.id, field.defaultValue]))
  });
  const issues = serializePrompt(state).issues;
  if (issues.some(issue => !issue.startsWith('请填写') && !issue.startsWith('最终文本超过'))) return fail();
  return structuredClone(value);
}

export function validateTaskReport(input) {
  const value = object(input, [
    'id',
    'taskId',
    'workspaceId',
    'model',
    'providerId',
    'channel',
    'status',
    'startedAt',
    'source',
    'requestCount',
    'providerUnits',
    'verifiedCost',
    'currency'
  ]);
  if (
    ![value.id, value.taskId, value.workspaceId, value.providerId].every(id => uuid.test(id)) ||
    !text(value.model, 128) ||
    !['direct', 'proxy'].includes(value.channel) ||
    !['processing', 'completed', 'failed', 'needs_review'].includes(value.status) ||
    !timestamp(value.startedAt) ||
    !['application', 'provider', 'verified'].includes(value.source) ||
    (value.requestCount !== null && !integer(value.requestCount, 1000000)) ||
    (value.providerUnits !== null &&
      (typeof value.providerUnits !== 'number' || !Number.isFinite(value.providerUnits) || value.providerUnits < 0))
  )
    return fail();
  if (value.source !== 'verified' && (value.verifiedCost !== null || value.currency !== null)) return fail();
  if (value.source === 'application' && value.providerUnits !== null) return fail();
  if (
    value.verifiedCost !== null &&
    (typeof value.verifiedCost !== 'number' ||
      !Number.isFinite(value.verifiedCost) ||
      value.verifiedCost < 0 ||
      !/^[A-Z]{3}$/.test(value.currency))
  )
    return fail();
  if (value.verifiedCost === null && value.currency !== null) return fail();
  return structuredClone(value);
}

export function validateProviderPolicy(input) {
  const value = object(input, ['version', 'providers']);
  if (value.version !== 1 || !Array.isArray(value.providers) || value.providers.length > 30) fail();
  const ids = new Set(),
    urls = new Set();
  const providers = value.providers.map(input => {
    const provider = object(input, ['id', 'name', 'baseUrl', 'models', 'sizes', 'direct', 'proxy', 'enabled']);
    let url;
    try {
      url = new URL(provider.baseUrl);
    } catch {
      fail();
    }
    const normalized = url.href.replace(/\/+$/, '');
    if (
      !uuid.test(provider.id) ||
      ids.has(provider.id) ||
      urls.has(normalized) ||
      typeof provider.name !== 'string' ||
      !provider.name.trim() ||
      provider.name.length > 80 ||
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      provider.baseUrl !== normalized ||
      !Array.isArray(provider.models) ||
      !provider.models.length ||
      provider.models.length > 100 ||
      provider.models.some(model => typeof model !== 'string' || !/^[a-zA-Z0-9._:-]{1,128}$/.test(model)) ||
      !Array.isArray(provider.sizes) ||
      !provider.sizes.length ||
      provider.sizes.some(size => !['1024x1024', '1536x1024', '1024x1536'].includes(size)) ||
      ['direct', 'proxy', 'enabled'].some(key => typeof provider[key] !== 'boolean')
    )
      fail();
    ids.add(provider.id);
    urls.add(normalized);
    return structuredClone(provider);
  });
  return { version: 1, providers };
}
