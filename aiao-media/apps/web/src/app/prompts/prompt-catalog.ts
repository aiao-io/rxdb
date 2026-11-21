import { plainPrompt, serializePrompt, type PromptField, type PromptNode, type PromptState } from './prompt-state';
export type PromptTemplate = {
  id: string;
  title: string;
  purpose: string;
  style: string;
  tags: string[];
  prompt: string;
  image: string;
  alt: string;
  updatedAt: string;
  author: string;
  source: string;
  /** Fixed first-party publication scope, not a licence inferred from an arbitrary source label. */
  rights: 'aiao-original-text-and-svg' | 'community-reference';
  referenceModel: string | null;
  needsReference: boolean;
  featuredRank: number | null;
  templateDocument?: PromptNode;
  fields?: PromptField[];
};
export function templateState(template: PromptTemplate): PromptState {
  if (!template.templateDocument) return plainPrompt(template.prompt);
  const fields = structuredClone(template.fields ?? []);
  return {
    document: structuredClone(template.templateDocument),
    fields,
    values: Object.fromEntries(fields.map(field => [field.id, field.defaultValue]))
  };
}
export function validateCatalog(value: unknown): PromptTemplate[] {
  if (!Array.isArray(value) || value.length > 200) throw new Error('灵感目录无效');
  const ids = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== 'object') throw new Error('灵感条目无效');
    const entry = item as PromptTemplate;
    if (!/^[a-z][a-z0-9-]{0,59}$/.test(entry.id) || ids.has(entry.id)) throw new Error('灵感 ID 无效或重复');
    ids.add(entry.id);
    for (const key of ['title', 'purpose', 'style', 'prompt', 'alt', 'author', 'source'] as const)
      if (typeof entry[key] !== 'string' || !entry[key].trim() || entry[key].length > 10000)
        throw new Error('灵感内容无效');
    if (
      !(
        (entry.rights === 'aiao-original-text-and-svg' && /^\/prompt-art\/[a-z0-9-]+\.svg$/.test(entry.image)) ||
        (entry.rights === 'community-reference' &&
          /^\/image-examples\/[a-z0-9-]+\.jpg$/.test(entry.image) &&
          /^https:\/\/(?:github\.com|x\.com)\//.test(entry.source))
      ) ||
      typeof entry.needsReference !== 'boolean' ||
      !Array.isArray(entry.tags) ||
      entry.tags.length > 20 ||
      entry.tags.some(tag => typeof tag !== 'string' || tag.length > 60) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(entry.updatedAt) ||
      new Date(entry.updatedAt).toISOString().slice(0, 10) !== entry.updatedAt ||
      (entry.referenceModel !== null && typeof entry.referenceModel !== 'string') ||
      (entry.featuredRank !== null && (!Number.isInteger(entry.featuredRank) || entry.featuredRank < 0))
    )
      throw new Error('灵感元信息无效');
    const serialized = serializePrompt(templateState(entry));
    // Missing required defaults and over-limit text are valid catalog entries, but never executable.
    if (serialized.issues.some(issue => !issue.startsWith('请填写') && !issue.startsWith('最终文本超过')))
      throw new Error('灵感模板结构无效');
  }
  return structuredClone(value) as PromptTemplate[];
}
export type CatalogQuery = {
  search: string;
  purpose: string;
  style: string;
  reference: 'all' | 'yes' | 'no';
  sort: 'featured' | 'recent';
};
export function filterCatalog(catalog: PromptTemplate[], query: CatalogQuery): PromptTemplate[] {
  const words = query.search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return catalog
    .filter(
      entry =>
        words.every(word => [entry.title, entry.prompt, ...entry.tags].join('\n').toLocaleLowerCase().includes(word)) &&
        (!query.purpose || entry.purpose === query.purpose) &&
        (!query.style || entry.style === query.style) &&
        (query.reference === 'all' || entry.needsReference === (query.reference === 'yes'))
    )
    .sort((a, b) => {
      const order =
        query.sort === 'recent' ?
          b.updatedAt.localeCompare(a.updatedAt)
        : (a.featuredRank ?? Number.MAX_SAFE_INTEGER) - (b.featuredRank ?? Number.MAX_SAFE_INTEGER);
      return order || a.id.localeCompare(b.id, 'en');
    });
}
export function applyIssue(template: PromptTemplate, busy: boolean): string | null {
  if (busy) return '正在生成，不能替换当前输入';
  if (template.needsReference) return '本机 Demo 不支持参考图；可复制正文，但不能套用';
  const state = templateState(template),
    result = serializePrompt(state);
  return (
    result.issues.find(issue => !issue.startsWith('请填写') && !(issue === '请输入描述' && state.fields.length)) ?? null
  );
}
