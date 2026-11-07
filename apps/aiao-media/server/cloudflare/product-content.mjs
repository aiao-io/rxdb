import { validateProviderPolicy, validatePublishedTemplate } from '../../src/contracts/product-data.mjs';
import { backend, body, fields, reject, uuid } from './product-http.mjs';

export function validateContent(kind, payload) {
  try {
    return kind === 'template' ? validatePublishedTemplate(payload) : validateProviderPolicy(payload);
  } catch {
    return reject(400, '内容校验失败；未保存或发布。');
  }
}
export async function manageContent(request, client, actorId, path) {
  const match = /^content\/(template|provider-policy)\/([a-z][a-z0-9-]{0,59})(?:\/(publish|withdraw))?$/.exec(path);
  if (!match) reject(404, '内容管理接口不存在。');
  const [, kind, key, operation] = match;
  if (kind === 'provider-policy' && key !== 'runtime') reject(400, '供应商运行策略标识无效。');
  const action = operation ?? 'save';
  if (request.method !== (action === 'save' ? 'PUT' : 'POST')) reject(405, '内容操作方法无效。');
  const value = fields(
    await body(request),
    action === 'save' ? ['revision', 'requestId', 'payload'] : ['revision', 'requestId']
  );
  if (!Number.isSafeInteger(value.revision) || value.revision < 0 || !uuid(value.requestId))
    reject(400, '内容版本无效。');
  let payload = null;
  if (action === 'save') payload = validateContent(kind, value.payload);
  if (kind === 'template' && payload && payload.id !== key) reject(400, '模板标识不匹配。');
  if (action === 'publish') {
    const [draft] = await client.call(
      `/rest/v1/media_content_drafts?kind=eq.${kind}&key=eq.${key}&select=payload,revision`
    );
    if (!draft || draft.revision !== value.revision) reject(409, '草稿版本已变化。');
    validateContent(kind, draft.payload);
  }
  const result = await client.call('/rest/v1/rpc/media_admin_content', {
    method: 'POST',
    payload: {
      p_actor: actorId,
      p_kind: kind,
      p_key: key,
      p_action: action,
      p_revision: value.revision,
      p_request_id: value.requestId,
      p_payload: payload
    }
  });
  return {
    content: result,
    state:
      action === 'publish' ? 'active'
      : action === 'withdraw' ? 'withdrawn'
      : 'draft'
  };
}
export async function runtimePolicy(env) {
  if (!env.MEDIA_SUPABASE_URL) return null;
  const rows = await backend(env).call(
    '/rest/v1/media_public_content?kind=eq.provider-policy&key=eq.runtime&select=payload,revision',
    { privileged: false }
  );
  if (!Array.isArray(rows) || rows.length > 1) reject(502, '运行策略不可读。');
  return rows.length ? { ...validateProviderPolicy(rows[0].payload), revision: rows[0].revision } : null;
}
export async function publishedTemplates(env) {
  if (!env.MEDIA_SUPABASE_URL) return { templates: [] };
  const rows = await backend(env).call(
    '/rest/v1/media_public_content?kind=eq.template&select=payload,revision&order=key&limit=200',
    { privileged: false }
  );
  return { templates: rows.map(row => ({ template: validatePublishedTemplate(row.payload), revision: row.revision })) };
}
