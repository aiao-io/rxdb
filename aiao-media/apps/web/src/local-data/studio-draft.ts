/** Owned inert editor data, not HTML, a model request, credentials or a sync command. */
export type StudioPromptNode = {
  type: 'doc' | 'paragraph' | 'text' | 'hardBreak' | 'templateField';
  text?: string;
  attrs?: { fieldId: string; value?: string };
  content?: StudioPromptNode[];
};
export type StudioPromptField = {
  id: string;
  label: string;
  defaultValue: string;
  required: boolean;
};
export interface StudioPromptState {
  aspectRatio?: 'square' | 'landscape' | 'portrait';
  templateId?: string;
  templateVersion?: number;
  document: StudioPromptNode;
  fields: StudioPromptField[];
  values: Record<string, string>;
}
export interface StudioDraftSnapshot {
  revision: number;
  state: StudioPromptState;
}
export const STUDIO_DRAFT_MAX_BYTES = 256 * 1024;
function row(value: unknown, required: string[], optional: string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('本机编辑状态无效。');
  const keys = Reflect.ownKeys(value),
    allowed = new Set([...required, ...optional]),
    out: Record<string, unknown> = Object.create(null);
  if (
    keys.some(k => typeof k !== 'string' || !allowed.has(k)) ||
    required.some(k => !Object.prototype.hasOwnProperty.call(value, k))
  )
    throw new Error('本机编辑状态字段无效。');
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d || !('value' in d)) throw new Error('本机编辑状态不能执行访问器。');
    out[key as string] = d.value;
  }
  return out;
}
export function ownedStudioPrompt(value: unknown): StudioPromptState {
  const top = row(value, ['document', 'fields', 'values'], ['aspectRatio', 'templateId', 'templateVersion']);
  if (top['aspectRatio'] !== undefined && !['square', 'landscape', 'portrait'].includes(String(top['aspectRatio'])))
    throw new Error('图片画幅无效。');
  if (
    top['templateId'] !== undefined &&
    (typeof top['templateId'] !== 'string' || !/^[a-z][a-z0-9-]{0,59}$/.test(top['templateId']))
  )
    throw new Error('模板编号无效。');
  if (
    top['templateVersion'] !== undefined &&
    (!Number.isSafeInteger(top['templateVersion']) || (top['templateVersion'] as number) < 1)
  )
    throw new Error('模板版本无效。');
  if (!Array.isArray(top['fields']) || top['fields'].length > 20) throw new Error('本机模板字段过多。');
  const ids = new Set<string>();
  const fields = top['fields'].map(v => {
    const r = row(v, ['id', 'label', 'defaultValue', 'required']);
    if (
      typeof r['id'] !== 'string' ||
      !/^[a-z][a-z0-9-]{0,39}$/.test(r['id']) ||
      ids.has(r['id']) ||
      typeof r['label'] !== 'string' ||
      !r['label'].trim() ||
      r['label'].length > 40 ||
      typeof r['defaultValue'] !== 'string' ||
      r['defaultValue'].length > 4000 ||
      typeof r['required'] !== 'boolean'
    )
      throw new Error('本机模板字段无效。');
    ids.add(r['id']);
    return {
      id: r['id'],
      label: r['label'],
      defaultValue: r['defaultValue'],
      required: r['required']
    };
  });
  const source = row(top['values'], [], [...ids]),
    values: Record<string, string> = Object.create(null);
  for (const id of ids) {
    const v = source[id];
    if (typeof v !== 'string' || v.length > 4000) throw new Error('本机模板值无效。');
    values[id] = v;
  }
  let count = 0,
    total = 0;
  const inline = (v: unknown): StudioPromptNode => {
    if (++count > 10000) throw new Error('本机节点过多。');
    const r = row(v, ['type'], ['text', 'attrs']);
    if (r['type'] === 'text' && typeof r['text'] === 'string' && r['attrs'] === undefined) {
      total += r['text'].length;
      return { type: 'text', text: r['text'] };
    }
    if (r['type'] === 'hardBreak' && r['text'] === undefined && r['attrs'] === undefined) return { type: 'hardBreak' };
    if (r['type'] === 'templateField' && r['text'] === undefined) {
      const a = row(r['attrs'], ['fieldId'], ['value']);
      if (
        typeof a['fieldId'] !== 'string' ||
        !ids.has(a['fieldId']) ||
        (a['value'] !== undefined && (typeof a['value'] !== 'string' || a['value'].length > 4000))
      )
        throw new Error('本机参数节点无效。');
      return {
        type: 'templateField',
        attrs: {
          fieldId: a['fieldId'],
          ...(a['value'] !== undefined ? { value: a['value'] as string } : {})
        }
      };
    }
    throw new Error('本机仅保留文本与声明的参数节点。');
  };
  const doc = row(top['document'], ['type', 'content']);
  if (doc['type'] !== 'doc' || !Array.isArray(doc['content']) || doc['content'].length > 1000)
    throw new Error('本机编辑文档无效。');
  const content = doc['content'].map(v => {
    const p = row(v, ['type'], ['content']);
    if (p['type'] !== 'paragraph' || (p['content'] !== undefined && !Array.isArray(p['content'])))
      throw new Error('本机段落无效。');
    return {
      type: 'paragraph' as const,
      ...(p['content'] !== undefined ? { content: (p['content'] as unknown[]).map(inline) } : {})
    };
  });
  const owned: StudioPromptState = {
    document: { type: 'doc' as const, content },
    fields,
    values,
    ...(top['aspectRatio'] ? { aspectRatio: top['aspectRatio'] as StudioPromptState['aspectRatio'] } : {}),
    ...(top['templateId'] ? { templateId: top['templateId'] as string } : {}),
    ...(top['templateVersion'] ? { templateVersion: top['templateVersion'] as number } : {})
  };
  if (total > 100000 || new TextEncoder().encode(JSON.stringify(owned)).byteLength > STUDIO_DRAFT_MAX_BYTES)
    throw new Error('本机编辑状态过大；当前输入未截断，未声称保存。');
  return owned;
}
export function studioPayload(value: unknown): string {
  return JSON.stringify({ version: 1, state: ownedStudioPrompt(value) });
}
export function readStudioPayload(payload: unknown, revision: unknown): StudioDraftSnapshot {
  if (
    typeof payload !== 'string' ||
    new TextEncoder().encode(payload).byteLength > STUDIO_DRAFT_MAX_BYTES + 64 ||
    !Number.isSafeInteger(revision) ||
    (revision as number) < 1
  )
    throw new Error('本机编辑草稿不可读；不覆盖旧数据。');
  const data = row(JSON.parse(payload), ['version', 'state']);
  if (data['version'] !== 1) throw new Error('未知本机编辑版本；不覆盖旧数据。');
  return {
    revision: revision as number,
    state: ownedStudioPrompt(data['state'])
  };
}
